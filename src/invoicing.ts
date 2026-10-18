import type { Client, Contract, Invoice, OrgSettings, Quote } from './types'
import { addDays, addMonths, today, uid } from './util'

export { lineTotal, totals } from '../shared/money'
import { totals } from '../shared/money'

export const STATUS_LABEL: Record<Invoice['status'], string> = { brouillon: 'Brouillon', emise: 'Émise', payee: 'Payée', annulee: 'Annulée' }

/** Une facture émise est figée : seuls le paiement et l'annulation peuvent changer. */
export const isLocked = (inv: Invoice) => inv.status !== 'brouillon'

/* ---------- numérotation ---------- */
export const NUMBER_RE = /^FAC-(\d{4})-(\d{4})$/
export const formatNumber = (year: number, n: number) => `FAC-${year}-${String(n).padStart(4, '0')}`
/** Prochain numéro : séquence continue par année, sans trou. */
export function nextNumber(invoices: Pick<Invoice, 'number'>[], year: number): string {
  let max = 0
  for (const i of invoices) {
    const m = i.number?.match(NUMBER_RE)
    if (m && Number(m[1]) === year) max = Math.max(max, Number(m[2]))
  }
  return formatNumber(year, max + 1)
}

export function issueLocal(inv: Invoice, all: Invoice[], settings: Pick<OrgSettings, 'paymentDays'> | undefined, on = today()): Invoice {
  if (inv.status !== 'brouillon') return inv
  if (!inv.lines.length || totals(inv).ht <= 0) throw new Error('Facture vide')
  return { ...inv, status: 'emise', number: nextNumber(all, Number(on.slice(0, 4))), issuedAt: on, dueAt: addDays(on, settings?.paymentDays ?? 30) }
}

/* ---------- création ---------- */
export function draftFromQuote(q: Quote, vatRate = 20, on = today()): Invoice {
  return { id: uid('f'), clientId: q.clientId, kind: 'devis', quoteId: q.id, lines: q.lines.map((l) => ({ ...l })), vatRate, status: 'brouillon', createdAt: on }
}
export function draftFromContract(c: Contract, periodStart: string, months: number, appareils: number, vatRate = 20, on = today()): Invoice {
  const periodEnd = addDays(addMonths(periodStart, months), -1)
  return {
    id: uid('f'), clientId: c.clientId, kind: 'contrat', contractId: c.id, periodStart, periodEnd,
    lines: [{ label: `Contrat d’entretien (${appareils} appareil${appareils > 1 ? 's' : ''}) – du ${periodStart.split('-').reverse().join('/')} au ${periodEnd.split('-').reverse().join('/')}`, qty: months, unit: c.priceMonthly }],
    vatRate, status: 'brouillon', createdAt: on,
  }
}

/** Mois de contrat non encore facturés (jusqu'au mois en cours inclus), sur 24 mois maximum. */
export function unbilledPeriods(c: Contract, invoices: Invoice[], on = today()): string[] {
  if (c.terminatedAt && c.terminatedAt <= c.start) return []
  const billed = new Set(invoices.filter((i) => i.contractId === c.id && i.status !== 'annulee' && i.periodStart).map((i) => i.periodStart!.slice(0, 7)))
  const out: string[] = []
  let p = c.start
  const stop = c.terminatedAt && c.terminatedAt < on ? c.terminatedAt : on
  while (p <= stop) {
    if (!billed.has(p.slice(0, 7))) out.push(p)
    p = addMonths(p, 1)
  }
  return out.slice(-24)
}

/* ---------- exports comptables ---------- */
const fr = (n: number) => n.toFixed(2).replace('.', ',')
const ymd = (d: string) => d.replaceAll('-', '')
const csvCell = (v: string | number) => { const s = String(v); return /[;"\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s }

/** Journal des ventes (CSV, séparateur « ; », décimales à virgule) : lisible dans Excel et importable par la plupart des logiciels. */
export function salesJournalCsv(invoices: Invoice[], clients: Client[]): string {
  const rows = [['Date', 'Numéro', 'Client', 'Total HT', 'TVA', 'Total TTC', 'Échéance', 'Statut', 'Date de paiement']]
  for (const i of invoices.filter((x) => x.number && x.status !== 'brouillon').sort((a, b) => a.number!.localeCompare(b.number!))) {
    const t = totals(i)
    rows.push([i.issuedAt ?? '', i.number!, clients.find((c) => c.id === i.clientId)?.name ?? '', fr(t.ht), fr(t.vat), fr(t.ttc), i.dueAt ?? '', STATUS_LABEL[i.status], i.paidAt ?? ''])
  }
  return '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n'
}

const FEC_COLS = ['JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib', 'PieceRef', 'PieceDate', 'EcritureLib', 'Debit', 'Credit', 'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise']
const letter = (n: number) => { let s = ''; do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1 } while (n >= 0); return s }

/** Fichier des Écritures Comptables (format FEC, séparateur tabulation) : journal de ventes VE et journal de banque BQ.
 *  Comptes par défaut : 411 clients, 706 prestations, 44571 TVA collectée, 512 banque. À valider avec l'expert-comptable. */
export function fec(invoices: Invoice[], clients: Client[], year: number): string {
  const lines: string[][] = []
  let num = 0
  let let_ = 0
  const issued = invoices.filter((i) => i.number && i.status !== 'brouillon' && i.status !== 'annulee' && i.issuedAt?.startsWith(String(year))).sort((a, b) => a.number!.localeCompare(b.number!))
  const row = (j: string, jl: string, n: number, date: string, acc: string, lib: string, aux: [string, string] | null, piece: string, pieceDate: string, label: string, debit: number, credit: number, lettrage = '', dateLet = '') =>
    lines.push([j, jl, String(n), ymd(date), acc, lib, aux?.[0] ?? '', aux?.[1] ?? '', piece, ymd(pieceDate), label, fr(debit), fr(credit), lettrage, dateLet ? ymd(dateLet) : '', ymd(date), '', ''])
  for (const i of issued) {
    const t = totals(i)
    const cl = clients.find((c) => c.id === i.clientId)
    const aux: [string, string] = [`C${i.clientId.replace(/\W/g, '').slice(0, 10).toUpperCase()}`, cl?.name ?? '']
    const paid = i.status === 'payee' && i.paidAt?.startsWith(String(year))
    const lt = paid ? letter(let_++) : ''
    num += 1
    row('VE', 'Journal des ventes', num, i.issuedAt!, '411000', 'Clients', aux, i.number!, i.issuedAt!, `Facture ${i.number} ${cl?.name ?? ''}`, t.ttc, 0, lt, paid ? i.paidAt! : '')
    row('VE', 'Journal des ventes', num, i.issuedAt!, '706000', 'Prestations de services', null, i.number!, i.issuedAt!, `Facture ${i.number} ${cl?.name ?? ''}`, 0, t.ht)
    if (t.vat) row('VE', 'Journal des ventes', num, i.issuedAt!, '445710', 'TVA collectée', null, i.number!, i.issuedAt!, `Facture ${i.number} ${cl?.name ?? ''}`, 0, t.vat)
    if (paid) {
      num += 1
      row('BQ', 'Journal de banque', num, i.paidAt!, '512000', 'Banque', null, i.number!, i.paidAt!, `Règlement ${i.number} ${cl?.name ?? ''}`, t.ttc, 0)
      row('BQ', 'Journal de banque', num, i.paidAt!, '411000', 'Clients', aux, i.number!, i.paidAt!, `Règlement ${i.number} ${cl?.name ?? ''}`, 0, t.ttc, lt, i.paidAt!)
    }
  }
  return [FEC_COLS, ...lines].map((r) => r.join('\t')).join('\r\n') + '\r\n'
}
