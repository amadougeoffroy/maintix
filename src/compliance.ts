/** Échéances réglementaires par appareil (contrôle technique, assurance, extincteur…). */
import { addMonths, daysBetween } from './util'
import type { ComplianceItem, ComplianceKind, State } from './types'

export const KIND_LABEL: Record<ComplianceKind, string> = { controle_technique: 'Contrôle technique', assurance: 'Assurance', extincteur: 'Extincteur', autre: 'Autre échéance' }
/** Périodicité proposée par défaut (en mois) ; modifiable. */
export const KIND_INTERVAL: Record<ComplianceKind, number | undefined> = { controle_technique: 60, assurance: 12, extincteur: 12, autre: undefined }
export const SOON_DAYS = 30

export type ComplianceStatus = 'depassee' | 'bientot' | 'ok'
export const daysLeft = (item: ComplianceItem, today: string) => daysBetween(today, item.due)
export function complianceStatus(item: ComplianceItem, today: string): ComplianceStatus {
  const d = daysLeft(item, today)
  return d < 0 ? 'depassee' : d <= SOON_DAYS ? 'bientot' : 'ok'
}

/** Valide une échéance accomplie : la suivante est calculée depuis l'échéance (ou depuis aujourd'hui si elle est dépassée). Sans périodicité, l'échéance est soldée (supprimée). */
export function completeItem(item: ComplianceItem, on: string): ComplianceItem | null {
  if (!item.intervalMonths) return null
  const base = on > item.due ? on : item.due
  return { ...item, lastDone: on, due: addMonths(base, item.intervalMonths) }
}

export interface ComplianceRow { elevatorId: string; elevator: string; site: string; client: string; item: ComplianceItem; days: number; status: ComplianceStatus }
/** Toutes les échéances du parc, les plus urgentes d'abord. `horizonDays` limite aux échéances proches ou dépassées (omis = toutes). */
export function complianceRows(s: Pick<State, 'elevators' | 'sites' | 'clients'>, today: string, horizonDays?: number): ComplianceRow[] {
  const rows: ComplianceRow[] = []
  for (const e of s.elevators) {
    const site = s.sites.find((x) => x.id === e.siteId)
    const client = s.clients.find((c) => c.id === site?.clientId)
    for (const item of e.compliance ?? []) {
      const days = daysLeft(item, today)
      if (horizonDays !== undefined && days > horizonDays) continue
      rows.push({ elevatorId: e.id, elevator: e.label, site: site?.name ?? '', client: client?.name ?? '', item, days, status: complianceStatus(item, today) })
    }
  }
  return rows.sort((a, b) => a.days - b.days || a.elevator.localeCompare(b.elevator, 'fr'))
}
