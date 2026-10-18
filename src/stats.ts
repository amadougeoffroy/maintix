import { healthScore } from './store'
import { totals } from './invoicing'
import { contractStatus } from './contracts'
import { addDays, addMonths, daysBetween, today } from './util'
import type { State } from './types'

export interface ClientStats {
  elevatorIds: string[]
  avgHealth: number | null
  open: { critique: number; majeur: number; mineur: number }
  overdueDefects: number
  breakdowns12m: number
  /** délai moyen entre le signalement et la clôture d'un dépannage, en heures */
  mttrHours: number | null
  visits12m: number
  lateVisits: number
  /** pannes par mois sur les 12 derniers mois (du plus ancien au plus récent) */
  perMonth: { month: string; n: number }[]
  annualRevenue: number
  outstanding: number
  overdueInvoices: number
}

export function clientStats(s: State, clientId: string, on = today()): ClientStats {
  const siteIds = new Set(s.sites.filter((x) => x.clientId === clientId).map((x) => x.id))
  const els = s.elevators.filter((e) => siteIds.has(e.siteId)).map((e) => e.id)
  const mine = new Set(els)
  const since = addMonths(on, -12)
  const jobs = s.jobs.filter((j) => mine.has(j.elevatorId))
  const defects = s.defects.filter((d) => mine.has(d.elevatorId) && d.status !== 'leve')
  const dep = jobs.filter((j) => j.type === 'depannage' && j.createdAt.slice(0, 10) >= since)
  const resolved = dep.filter((j) => j.status === 'terminee' && j.visit?.finishedAt)
  const month = (iso: string) => iso.slice(0, 7)
  const months = Array.from({ length: 12 }, (_, i) => month(addMonths(on.slice(0, 7) + '-01', i - 11)))
  const live = s.contracts.filter((c) => c.clientId === clientId && contractStatus(c, on) !== 'resilie')
  const invoices = s.invoices.filter((i) => i.clientId === clientId && i.status === 'emise')
  const scores = els.map((id) => healthScore(s, id, on))
  return {
    elevatorIds: els,
    avgHealth: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    open: { critique: defects.filter((d) => d.severity === 'critique').length, majeur: defects.filter((d) => d.severity === 'majeur').length, mineur: defects.filter((d) => d.severity === 'mineur').length },
    overdueDefects: defects.filter((d) => d.due < on).length,
    breakdowns12m: dep.length,
    mttrHours: resolved.length ? Math.round((resolved.reduce((t, j) => t + (new Date(j.visit!.finishedAt!).getTime() - new Date(j.createdAt).getTime()), 0) / resolved.length / 3_600_000) * 10) / 10 : null,
    visits12m: jobs.filter((j) => j.type === 'entretien' && j.status === 'terminee' && (j.visit?.finishedAt ?? '').slice(0, 10) >= since).length,
    lateVisits: jobs.filter((j) => j.type === 'entretien' && j.status !== 'terminee' && j.date < on && daysBetween(j.date, on) > 7).length,
    perMonth: months.map((m) => ({ month: m, n: dep.filter((j) => month(j.createdAt) === m).length })),
    annualRevenue: live.reduce((t, c) => t + c.priceMonthly * 12, 0),
    outstanding: invoices.reduce((t, i) => t + totals(i).ttc, 0),
    overdueInvoices: invoices.filter((i) => i.dueAt && i.dueAt < addDays(on, 0)).length,
  }
}
