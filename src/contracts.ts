import type { Contract } from './types'
import { addMonths, daysBetween, today } from './util'

export const DEFAULTS = { termMonths: 12, noticeMonths: 3, autoRenew: true } as const
export const termMonths = (c: Contract) => c.termMonths ?? DEFAULTS.termMonths
export const noticeMonths = (c: Contract) => c.noticeMonths ?? DEFAULTS.noticeMonths
export const autoRenew = (c: Contract) => c.autoRenew ?? DEFAULTS.autoRenew

/** Fin du terme en cours : reconduction tacite = terme suivant ; sinon fin du dernier terme (renouvelé manuellement ou non). */
export function termEnd(c: Contract, on = today()): string {
  const len = termMonths(c)
  if (autoRenew(c)) {
    let end = addMonths(c.start, len)
    while (end <= on) end = addMonths(end, len)
    return end
  }
  return addMonths(c.start, len * (1 + (c.renewedTerms ?? 0)))
}

/** Dernier jour pour donner congé avant la reconduction (ou pour renégocier un contrat non reconduit). */
export const noticeDeadline = (c: Contract, on = today()) => addMonths(termEnd(c, on), -noticeMonths(c))

export type ContractStatus = 'resilie' | 'echu' | 'preavis_proche' | 'preavis_depasse' | 'actif'
export function contractStatus(c: Contract, on = today()): ContractStatus {
  if (c.terminatedAt && c.terminatedAt <= on) return 'resilie'
  const end = termEnd(c, on)
  if (!autoRenew(c)) {
    if (end <= on) return 'echu'
    return daysBetween(on, end) <= 90 ? 'preavis_proche' : 'actif' // à renouveler bientôt
  }
  const deadline = noticeDeadline(c, on)
  if (deadline < on) return 'preavis_depasse' // congé impossible pour ce terme : reconduction acquise
  return daysBetween(on, deadline) <= 60 ? 'preavis_proche' : 'actif'
}

export const STATUS_LABEL: Record<ContractStatus, string> = {
  resilie: 'Résilié', echu: 'Échu', preavis_proche: 'Échéance proche', preavis_depasse: 'Reconduit', actif: 'En cours',
}

/** Prochaine date d'indexation (anniversaire de la dernière indexation, ou du début). */
export const nextIndexation = (c: Contract) => addMonths(c.lastIndexed ?? c.start, 12)
export const indexationDue = (c: Contract, on = today()) => !c.terminatedAt && nextIndexation(c) <= addMonths(on, 1) && c.indexation > 0
export const indexedPrice = (c: Contract) => Math.round(c.priceMonthly * (1 + c.indexation / 100) * 100) / 100

/** Applique l'indexation annuelle et historise l'ancien prix. */
export function applyIndexation(c: Contract, on = today()): Contract {
  const newPrice = indexedPrice(c)
  return {
    ...c,
    priceMonthly: newPrice,
    lastIndexed: nextIndexation(c) <= on ? nextIndexation(c) : on,
    priceHistory: [...(c.priceHistory ?? []), { date: on, from: c.priceMonthly, to: newPrice, rate: c.indexation }],
  }
}

/** Renouvelle un contrat non reconduit tacitement d'un terme supplémentaire. */
export const renew = (c: Contract): Contract => ({ ...c, renewedTerms: (c.renewedTerms ?? 0) + 1 })
export const terminate = (c: Contract, date = today()): Contract => ({ ...c, terminatedAt: date })

export interface ContractAlert {
  contract: Contract
  kind: 'preavis' | 'echeance' | 'indexation' | 'echu'
  date: string
  label: string
}
/** Alertes à afficher au bureau, triées par urgence. */
export function contractAlerts(contracts: Contract[], on = today()): ContractAlert[] {
  const out: ContractAlert[] = []
  for (const c of contracts) {
    if (c.terminatedAt && c.terminatedAt <= on) continue
    const st = contractStatus(c, on)
    if (st === 'echu') out.push({ contract: c, kind: 'echu', date: termEnd(c, on), label: 'Contrat échu, à renouveler ou clore' })
    else if (st === 'preavis_proche') {
      const d = autoRenew(c) ? noticeDeadline(c, on) : termEnd(c, on)
      out.push({ contract: c, kind: autoRenew(c) ? 'preavis' : 'echeance', date: d, label: autoRenew(c) ? 'Dernier jour pour donner congé' : 'Fin du terme : renouveler ou clore' })
    }
    if (indexationDue(c, on)) out.push({ contract: c, kind: 'indexation', date: nextIndexation(c), label: `Indexation de ${c.indexation} % à appliquer` })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}
