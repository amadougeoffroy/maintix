/** Délais d'intervention contractuels (SLA) : mesure sur les dépannages, état des interventions en cours. */
import type { Contract, Job } from './types'

export type SlaState = 'respecte' | 'depasse' | 'ok' | 'risque' | 'en_retard' | 'aucun'

/** Contrat actif couvrant l'appareil. */
export const activeContract = (contracts: Contract[], elevatorId: string) => contracts.find((c) => c.elevatorIds.includes(elevatorId) && !c.terminatedAt)

/** Délai garanti pour ce dépannage, en minutes (personne bloquée si le contrat le prévoit, sinon délai standard), ou null sans engagement. */
export function slaLimitMinutes(contract: Contract | undefined, job: Pick<Job, 'trapped'>): number | null {
  if (!contract) return null
  if (job.trapped && contract.slaTrappedMinutes) return contract.slaTrappedMinutes
  if (contract.slaResponseHours) return Math.round(contract.slaResponseHours * 60)
  return null
}

/** Minutes entre le signalement et l'arrivée du technicien (null si pas encore arrivé). */
export function responseMinutes(job: Pick<Job, 'createdAt' | 'timeline'>): number | null {
  const arrival = job.timeline.find((t) => /sur place/i.test(t.label))
  if (!arrival) return null
  return Math.max(0, Math.round((Date.parse(arrival.at) - Date.parse(job.createdAt)) / 60000))
}
/** Minutes entre le signalement et la clôture. */
export function resolutionMinutes(job: Pick<Job, 'createdAt' | 'timeline'>): number | null {
  const end = job.timeline.find((t) => /termin/i.test(t.label))
  return end ? Math.max(0, Math.round((Date.parse(end.at) - Date.parse(job.createdAt)) / 60000)) : null
}

export interface JobSla { state: SlaState; limit: number | null; response: number | null; elapsed: number; remaining: number | null }
/** État du délai d'un dépannage : respecté/dépassé une fois le technicien arrivé ; sinon ok, à risque (75 % du délai écoulé) ou en retard. */
export function jobSla(contract: Contract | undefined, job: Pick<Job, 'createdAt' | 'timeline' | 'trapped'>, now: number): JobSla {
  const limit = slaLimitMinutes(contract, job)
  const response = responseMinutes(job)
  const elapsed = Math.max(0, Math.round((now - Date.parse(job.createdAt)) / 60000))
  if (limit === null) return { state: 'aucun', limit, response, elapsed, remaining: null }
  if (response !== null) return { state: response <= limit ? 'respecte' : 'depasse', limit, response, elapsed, remaining: null }
  const remaining = limit - elapsed
  return { state: remaining < 0 ? 'en_retard' : elapsed >= limit * 0.75 ? 'risque' : 'ok', limit, response, elapsed, remaining }
}

/** « 2 h 15 », « 45 min ». */
export function fmtMinutes(m: number): string {
  const a = Math.abs(Math.round(m))
  const h = Math.floor(a / 60)
  const min = a % 60
  const txt = h ? `${h} h${min ? ` ${String(min).padStart(2, '0')}` : ''}` : `${min} min`
  return m < 0 ? `-${txt}` : txt
}
