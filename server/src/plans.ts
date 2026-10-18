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
}

export const PLANS: PlanPreset[] = [
  { code: 'essai', name: 'Essai gratuit', maxTechs: 3, maxElevators: 25, priceMonthly: 0, extraTechPrice: 0, extraElevatorPrice: 0, trialDays: 30 },
  { code: 'essentiel', name: 'Essentiel', maxTechs: 5, maxElevators: 100, priceMonthly: 35000, extraTechPrice: 5000, extraElevatorPrice: 150 },
  { code: 'pro', name: 'Pro', maxTechs: 15, maxElevators: 500, priceMonthly: 90000, extraTechPrice: 4000, extraElevatorPrice: 100 },
  { code: 'sur-mesure', name: 'Sur mesure', maxTechs: null, maxElevators: null, priceMonthly: 0, extraTechPrice: 0, extraElevatorPrice: 0 },
  { code: 'interne', name: 'Interne (non facturé)', maxTechs: null, maxElevators: null, priceMonthly: 0, extraTechPrice: 0, extraElevatorPrice: 0 },
]

interface PlanRow { code: string; name: string; max_techs: number | null; max_elevators: number | null; price_monthly: number; extra_tech_price: number; extra_elevator_price: number; trial_days: number | null; archived: boolean }
export type PlanEntry = PlanPreset & { archived: boolean }
const shapePlan = (r: PlanRow): PlanEntry => ({ code: r.code, name: r.name, maxTechs: r.max_techs, maxElevators: r.max_elevators, priceMonthly: r.price_monthly, extraTechPrice: r.extra_tech_price, extraElevatorPrice: r.extra_elevator_price, trialDays: r.trial_days ?? undefined, archived: r.archived })

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
}
export interface Usage { techs: number; elevators: number; clients: number; jobs30: number }

/** Montant mensuel estimé en FCFA : forfait + dépassements (techniciens et appareils au-delà des plafonds). */
export function estimateAmount(o: OrgOffer, u: Pick<Usage, 'techs' | 'elevators'>): { base: number; overTechs: number; overElevators: number; amount: number } {
  const overTechs = o.maxTechs === null ? 0 : Math.max(0, u.techs - o.maxTechs)
  const overElevators = o.maxElevators === null ? 0 : Math.max(0, u.elevators - o.maxElevators)
  const amount = Math.round(o.priceMonthly + overTechs * o.extraTechPrice + overElevators * o.extraElevatorPrice)
  return { base: o.priceMonthly, overTechs, overElevators, amount }
}
