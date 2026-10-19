import type { Db } from './db'
/** Offres de départ (modifiables par entreprise dans la console). Montants en FCFA par mois. */
export interface PlanPreset {
  code: string
  name: string
  maxTechs: number | null
  maxElevators: number | null
  priceMonthly: number
  extraTechPrice: number
  extraElevatorPrice: number
  trialDays?: number
  /** dépassement des plafonds : 'bill' = facturé, 'block' = ajout refusé */
  overageMode?: OverageMode
}

export type OverageMode = 'bill' | 'block'
export const PLANS: PlanPreset[] = [
  { code: 'essai', name: 'Essai gratuit', maxTechs: 3, maxElevators: 25, priceMonthly: 0, extraTechPrice: 0, extraElevatorPrice: 0, trialDays: 30 },
  { code: 'essentiel', name: 'Essentiel', maxTechs: 5, maxElevators: 100, priceMonthly: 35000, extraTechPrice: 5000, extraElevatorPrice: 150 },
  { code: 'pro', name: 'Pro', maxTechs: 15, maxElevators: 500, priceMonthly: 90000, extraTechPrice: 4000, extraElevatorPrice: 100 },
  { code: 'sur-mesure', name: 'Sur mesure', maxTechs: null, maxElevators: null, priceMonthly: 0, extraTechPrice: 0, extraElevatorPrice: 0 },
  { code: 'interne', name: 'Interne (non facturé)', maxTechs: null, maxElevators: null, priceMonthly: 0, extraTechPrice: 0, extraElevatorPrice: 0 },
]

interface PlanRow { code: string; name: string; max_techs: number | null; max_elevators: number | null; price_monthly: number; extra_tech_price: number; extra_elevator_price: number; trial_days: number | null; archived: boolean; overage_mode: OverageMode }
export type PlanEntry = PlanPreset & { archived: boolean }
const shapePlan = (r: PlanRow): PlanEntry => ({ code: r.code, name: r.name, maxTechs: r.max_techs, maxElevators: r.max_elevators, priceMonthly: r.price_monthly, extraTechPrice: r.extra_tech_price, extraElevatorPrice: r.extra_elevator_price, trialDays: r.trial_days ?? undefined, archived: r.archived, overageMode: r.overage_mode })

/** Catalogue d'offres (table `plans`, géré par les opérateurs). */
export async function loadPlans(db: Pick<Db, 'query'>): Promise<PlanEntry[]> {
  return (await db.query<PlanRow>('select * from plans order by sort, created_at')).rows.map(shapePlan)
}
export async function getPlan(db: Pick<Db, 'query'>, code: string): Promise<PlanEntry | undefined> {
  const r = (await db.query<PlanRow>('select * from plans where code = $1', [code])).rows[0]
  return r ? shapePlan(r) : undefined
}

export interface OrgOffer {
  plan: string
  maxTechs: number | null
  maxElevators: number | null
  priceMonthly: number
  extraTechPrice: number
  extraElevatorPrice: number
  overageMode?: OverageMode
}
export interface Usage { techs: number; elevators: number; clients: number; jobs30: number }

/** Montant mensuel estimé en FCFA : forfait + dépassements (techniciens et appareils au-delà des plafonds). */
export function estimateAmount(o: OrgOffer, u: Pick<Usage, 'techs' | 'elevators'>): { base: number; overTechs: number; overElevators: number; amount: number } {
  const overTechs = o.maxTechs === null ? 0 : Math.max(0, u.techs - o.maxTechs)
  const overElevators = o.maxElevators === null ? 0 : Math.max(0, u.elevators - o.maxElevators)
  const amount = Math.round(o.priceMonthly + overTechs * o.extraTechPrice + overElevators * o.extraElevatorPrice)
  return { base: o.priceMonthly, overTechs, overElevators, amount }
}

/** Vérifie un ajout au regard du plafond de l'entreprise. Renvoie le détail si l'ajout doit être refusé (mode « bloquant » et plafond atteint). */
export async function planLimitBlock(db: Pick<Db, 'query'>, orgId: string, kind: 'techs' | 'elevators', adding = 1) {
  const o = (await db.query<{ max_techs: number | null; max_elevators: number | null; overage_mode: OverageMode; status: string }>('select max_techs, max_elevators, overage_mode from organisations where id = $1 and kind = \'client\'', [orgId])).rows[0]
  if (!o || o.overage_mode !== 'block') return null
  const max = kind === 'techs' ? o.max_techs : o.max_elevators
  if (max === null) return null
  const current = kind === 'techs'
    ? (await db.query<{ n: number }>(`select count(*)::int as n from members where org_id = $1 and role = 'tech'`, [orgId])).rows[0].n
    : (await db.query<{ n: number }>(`select count(*)::int as n from docs where org_id = $1 and collection = 'elevators' and not deleted`, [orgId])).rows[0].n
  return current + adding > max ? { kind, max, current } : null
}
