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
export const planByCode = (code: string) => PLANS.find((p) => p.code === code)

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
