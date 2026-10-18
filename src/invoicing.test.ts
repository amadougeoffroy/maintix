import { describe, expect, it } from 'vitest'
import { draftFromContract, draftFromQuote, fec, formatNumber, issueLocal, nextNumber, salesJournalCsv, totals, unbilledPeriods } from './invoicing'
import type { Client, Contract, Invoice } from './types'

const clients: Client[] = [{ id: 'c1', name: 'Syndic "Les Lilas"; Bât. A', kind: 'syndic', contact: '', email: '', phone: '' }]
const inv = (p: Partial<Invoice> = {}): Invoice => ({ id: 'f1', clientId: 'c1', kind: 'libre', lines: [{ label: 'x', qty: 2, unit: 99999.5 }], vatRate: 20, status: 'brouillon', createdAt: '2026-01-01', ...p })

describe('montants', () => {
  it('arrondit HT, TVA et TTC au franc CFA entier (pas de centimes)', () => {
    expect(totals(inv())).toEqual({ ht: 199999, vat: 40000, ttc: 239999 }) // 2 × 99 999,5 = 199 999 ; TVA 39 999,8 → 40 000
    expect(totals(inv({ lines: [{ label: 'a', qty: 3, unit: 33333 }], vatRate: 18 }))).toEqual({ ht: 99999, vat: 18000, ttc: 117999 })
  })
})

describe('numérotation', () => {
  it('séquence continue par année, sans trou ni doublon', () => {
    expect(nextNumber([], 2026)).toBe('FAC-2026-0001')
    const all: Invoice[] = []
    for (let i = 0; i < 3; i++) { const issued = issueLocal(inv({ id: `f${i}` }), all, { paymentDays: 30 }, '2026-03-01'); all.push(issued) }
    expect(all.map((i) => i.number)).toEqual(['FAC-2026-0001', 'FAC-2026-0002', 'FAC-2026-0003'])
    expect(nextNumber(all, 2027)).toBe('FAC-2027-0001')
    expect(formatNumber(2026, 12)).toBe('FAC-2026-0012')
  })
  it('l’émission fixe date, échéance et statut, et ne s’applique qu’à un brouillon', () => {
    const i = issueLocal(inv(), [], { paymentDays: 45 }, '2026-03-01')
    expect(i).toMatchObject({ status: 'emise', issuedAt: '2026-03-01', dueAt: '2026-04-15' })
    expect(issueLocal(i, [i], { paymentDays: 45 }, '2026-06-01')).toBe(i)
  })
  it('refuse une facture vide', () => {
    expect(() => issueLocal(inv({ lines: [] }), [], undefined)).toThrow('vide')
  })
})

describe('création', () => {
  const k: Contract = { id: 'k1', clientId: 'c1', elevatorIds: ['e1', 'e2'], periodicityMonths: 1, priceMonthly: 120000, start: '2026-01-15', indexation: 3 }
  it('facture une période de contrat', () => {
    const d = draftFromContract(k, '2026-01-15', 3, 2)
    expect(d.lines[0]).toMatchObject({ qty: 3, unit: 120000 })
    expect(d.lines[0].label).toContain('2 appareils')
    expect(d.periodEnd).toBe('2026-04-14')
    expect(totals(d).ht).toBe(360000)
  })
  it('liste les mois non facturés et ignore ceux déjà facturés', () => {
    const billed = inv({ contractId: 'k1', periodStart: '2026-02-15', status: 'emise' })
    const p = unbilledPeriods(k, [billed], '2026-04-20')
    expect(p).toEqual(['2026-01-15', '2026-03-15', '2026-04-15'])
    expect(unbilledPeriods(k, [{ ...billed, status: 'annulee' }], '2026-02-20')).toEqual(['2026-01-15', '2026-02-15'])
  })
  it('reprend les lignes d’un devis', () => {
    const d = draftFromQuote({ id: 'q1', clientId: 'c1', elevatorId: 'e1', lines: [{ label: 'Galet', qty: 2, unit: 40 }], status: 'accepte', createdAt: 'x' })
    expect(d).toMatchObject({ kind: 'devis', quoteId: 'q1', status: 'brouillon' })
  })
})

describe('exports comptables', () => {
  const emise = issueLocal(inv(), [], { paymentDays: 30 }, '2026-03-01')
  const payee = { ...issueLocal(inv({ id: 'f2' }), [emise], { paymentDays: 30 }, '2026-03-10'), status: 'payee' as const, paidAt: '2026-03-25' }
  it('journal CSV : ignore les brouillons, échappe séparateurs et guillemets, BOM Excel', () => {
    const csv = salesJournalCsv([inv({ id: 'b' }), emise, payee], clients)
    expect(csv.startsWith('﻿')).toBe(true)
    const lines = csv.trim().split('\r\n')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain('"Syndic ""Les Lilas""; Bât. A"')
    expect(lines[1]).toContain('199999;40000;239999')
    expect(lines[2]).toContain('Payée')
  })
  it('FEC : 18 colonnes, écritures équilibrées, règlement lettré', () => {
    const txt = fec([emise, payee], clients, 2026)
    const rows = txt.split('\r\n').filter(Boolean).map((l) => l.split('\t'))
    expect(rows[0]).toHaveLength(18)
    expect(rows.every((r) => r.length === 18)).toBe(true)
    const body = rows.slice(1)
    const num = (s: string) => Number(s.replace(',', '.'))
    expect(body.reduce((t, r) => t + num(r[11]), 0)).toBeCloseTo(body.reduce((t, r) => t + num(r[12]), 0), 2)
    const byEntry = new Map<string, number>()
    for (const r of body) byEntry.set(r[2], (byEntry.get(r[2]) ?? 0) + num(r[11]) - num(r[12]))
    for (const v of byEntry.values()) expect(Math.abs(v)).toBeLessThan(0.005)
    const bq = body.filter((r) => r[0] === 'BQ')
    expect(bq).toHaveLength(2)
    const lettered = body.filter((r) => r[13]).length
    expect(lettered).toBe(2) // la ligne 411 de la vente et la ligne 411 du règlement portent le même lettrage
    expect(body.filter((r) => r[4] === '445710')[0][12]).toBe('40000')
    expect(rows[1][3]).toBe('20260301')
  })
  it('FEC : ne contient que l’exercice demandé', () => {
    expect(fec([emise], clients, 2027).split('\r\n').filter(Boolean)).toHaveLength(1)
  })
})
