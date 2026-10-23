/** Indicateurs de pilotage d'une entreprise de maintenance sur une période : pannes, délais, SLA, visites contractuelles, défauts, facturation. */
import { activeContract, jobSla, resolutionMinutes, responseMinutes } from './sla'
import { complianceRows } from './compliance'
import { reorderList, stockRows } from './stock'
import { addDays, daysBetween } from './util'
import { totals } from '../shared/money'
import type { Contract, State } from './types'

export interface ElevatorPannes { elevatorId: string; label: string; site: string; client: string; count: number; trapped: number; minutesToFix: number | null }
export interface ContractRevenue { contractId: string; client: string; elevators: number; monthly: number; invoiced: number; collected: number }
export interface Pilotage {
  from: string
  to: string
  days: number
  pannes: { count: number; trapped: number; byElevator: ElevatorPannes[]; avgResponseMin: number | null; avgResolutionMin: number | null }
  sla: { measured: number; respected: number; rate: number | null; breaches: { jobId: string; elevator: string; limit: number; response: number }[] }
  visits: { expected: number; done: number; rate: number | null; overdue: number }
  defects: { open: number; overdue: number; lifted: number }
  revenue: { monthly: number; invoiced: number; collected: number; unpaid: number; unpaidOverdue: number; perContract: ContractRevenue[] }
  stock: { references: number; toReorder: number; value: number }
  compliance: { late: number; soon: number }
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((t, x) => t + x, 0) / xs.length) : null)
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null)
const inPeriod = (d: string | undefined, from: string, to: string) => !!d && d.slice(0, 10) >= from && d.slice(0, 10) <= to

/** Nombre de visites d'entretien attendues sur la période pour un contrat (au prorata de la durée de validité dans la période). */
export function expectedVisits(c: Contract, from: string, to: string): number {
  const start = c.start > from ? c.start : from
  const end = c.terminatedAt && c.terminatedAt < to ? c.terminatedAt : to
  if (end < start) return 0
  const days = daysBetween(start, end) + 1
  return Math.floor((days / (c.periodicityMonths * 30.44)) * c.elevatorIds.length + 0.0001)
}

export function computePilotage(s: State, today: string, days: number): Pilotage {
  const to = today
  const from = addDays(today, -(days - 1))
  const elevator = (id: string) => s.elevators.find((e) => e.id === id)
  const site = (elId: string) => s.sites.find((x) => x.id === elevator(elId)?.siteId)
  const client = (elId: string) => s.clients.find((c) => c.id === site(elId)?.clientId)

  // pannes
  const pannes = s.jobs.filter((j) => j.type === 'depannage' && inPeriod(j.createdAt, from, to))
  const byEl = new Map<string, ElevatorPannes>()
  for (const j of pannes) {
    const e = elevator(j.elevatorId)
    const cur = byEl.get(j.elevatorId) ?? { elevatorId: j.elevatorId, label: e?.label ?? j.elevatorId, site: site(j.elevatorId)?.name ?? '', client: client(j.elevatorId)?.name ?? '', count: 0, trapped: 0, minutesToFix: null }
    cur.count += 1
    if (j.trapped) cur.trapped += 1
    byEl.set(j.elevatorId, cur)
  }
  for (const row of byEl.values()) row.minutesToFix = avg(pannes.filter((j) => j.elevatorId === row.elevatorId).map(resolutionMinutes).filter((x): x is number => x !== null))
  const responses = pannes.map(responseMinutes).filter((x): x is number => x !== null)
  const resolutions = pannes.map(resolutionMinutes).filter((x): x is number => x !== null)

  // SLA : dépannages dont le technicien est arrivé et dont le contrat prévoit un délai
  const now = Date.parse(`${today}T23:59:59`)
  const slaJobs = pannes.map((j) => ({ j, sla: jobSla(activeContract(s.contracts, j.elevatorId), j, now) })).filter((x) => x.sla.state === 'respecte' || x.sla.state === 'depasse')
  const breaches = slaJobs.filter((x) => x.sla.state === 'depasse').map((x) => ({ jobId: x.j.id, elevator: elevator(x.j.elevatorId)?.label ?? '', limit: x.sla.limit!, response: x.sla.response! }))

  // visites d'entretien contractuelles
  const active = s.contracts.filter((c) => !c.terminatedAt || c.terminatedAt >= from)
  const expected = active.reduce((t, c) => t + expectedVisits(c, from, to), 0)
  const covered = new Set(active.flatMap((c) => c.elevatorIds))
  const done = s.jobs.filter((j) => j.type === 'entretien' && j.status === 'terminee' && covered.has(j.elevatorId) && inPeriod(j.visit?.finishedAt, from, to)).length
  const overdueVisits = s.jobs.filter((j) => j.type === 'entretien' && j.status !== 'terminee' && j.date < today && covered.has(j.elevatorId)).length

  // défauts
  const open = s.defects.filter((d) => d.status !== 'leve')

  // facturation
  const emitted = s.invoices.filter((i) => i.status !== 'brouillon' && i.status !== 'annulee')
  const ttc = (i: (typeof emitted)[number]) => totals(i).ttc
  const invoiced = emitted.filter((i) => inPeriod(i.issuedAt, from, to))
  const collected = emitted.filter((i) => i.status === 'payee' && inPeriod(i.paidAt, from, to))
  const unpaid = emitted.filter((i) => i.status === 'emise')
  const perContract: ContractRevenue[] = active.map((c) => ({
    contractId: c.id, client: s.clients.find((x) => x.id === c.clientId)?.name ?? '', elevators: c.elevatorIds.length, monthly: c.priceMonthly,
    invoiced: invoiced.filter((i) => i.contractId === c.id).reduce((t, i) => t + ttc(i), 0),
    collected: collected.filter((i) => i.contractId === c.id).reduce((t, i) => t + ttc(i), 0),
  })).sort((a, b) => b.monthly - a.monthly)

  const cr = complianceRows(s, today, 30)
  return {
    from, to, days,
    pannes: { count: pannes.length, trapped: pannes.filter((j) => j.trapped).length, byElevator: [...byEl.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr')).slice(0, 10), avgResponseMin: avg(responses), avgResolutionMin: avg(resolutions) },
    sla: { measured: slaJobs.length, respected: slaJobs.length - breaches.length, rate: pct(slaJobs.length - breaches.length, slaJobs.length), breaches },
    visits: { expected, done, rate: expected ? Math.min(100, pct(done, expected) ?? 0) : null, overdue: overdueVisits },
    defects: { open: open.length, overdue: open.filter((d) => d.due < today).length, lifted: s.defects.filter((d) => d.status === 'leve').length },
    revenue: {
      monthly: s.contracts.filter((c) => !c.terminatedAt).reduce((t, c) => t + c.priceMonthly, 0),
      invoiced: invoiced.reduce((t, i) => t + ttc(i), 0), collected: collected.reduce((t, i) => t + ttc(i), 0),
      unpaid: unpaid.reduce((t, i) => t + ttc(i), 0), unpaidOverdue: unpaid.filter((i) => !!i.dueAt && i.dueAt < today).reduce((t, i) => t + ttc(i), 0), perContract,
    },
    stock: { references: stockRows(s.stock, s.stockMoves).length, toReorder: reorderList(s.stock, s.stockMoves).length, value: stockRows(s.stock, s.stockMoves).reduce((t, r) => t + r.value, 0) },
    compliance: { late: cr.filter((r) => r.status === 'depassee').length, soon: cr.filter((r) => r.status === 'bientot').length },
  }
}

/** Export CSV des indicateurs (séparateur « ; », décimales à virgule). */
export function pilotageCsv(p: Pilotage): string {
  const rows: (string | number)[][] = [
    ['Indicateur', 'Valeur'],
    ['Période', `${p.from} au ${p.to}`],
    ['Pannes (dépannages)', p.pannes.count], ['dont personne bloquée', p.pannes.trapped],
    ['Délai moyen d’arrivée (min)', p.pannes.avgResponseMin ?? ''], ['Délai moyen de résolution (min)', p.pannes.avgResolutionMin ?? ''],
    ['SLA mesurés', p.sla.measured], ['SLA respectés', p.sla.respected], ['Taux de respect du SLA (%)', p.sla.rate ?? ''],
    ['Visites d’entretien attendues', p.visits.expected], ['Visites réalisées', p.visits.done], ['Taux de réalisation (%)', p.visits.rate ?? ''], ['Visites en retard', p.visits.overdue],
    ['Défauts ouverts', p.defects.open], ['Défauts hors délai', p.defects.overdue],
    ['Facturé TTC (FCFA)', p.revenue.invoiced], ['Encaissé TTC (FCFA)', p.revenue.collected], ['Impayé TTC (FCFA)', p.revenue.unpaid], ['dont en retard (FCFA)', p.revenue.unpaidOverdue],
    ['Pièces à réapprovisionner', p.stock.toReorder], ['Échéances réglementaires dépassées', p.compliance.late], ['Échéances sous 30 jours', p.compliance.soon],
    [], ['Appareils les plus en panne', 'Pannes', 'Personne bloquée', 'Client', 'Site'],
    ...p.pannes.byElevator.map((e) => [e.label, e.count, e.trapped, e.client, e.site]),
    [], ['Contrat (client)', 'Appareils', 'Mensualité (FCFA)', 'Facturé TTC', 'Encaissé TTC'],
    ...p.revenue.perContract.map((c) => [c.client, c.elevators, c.monthly, c.invoiced, c.collected]),
  ]
  const cell = (v: string | number) => { const s = typeof v === 'number' ? String(v).replace('.', ',') : v; return /[;"\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s }
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n'
}
