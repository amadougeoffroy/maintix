/** Tarification des abonnements : remises de durée. Montants en FCFA entiers. */
export const MONTHS_CHOICES = [1, 3, 6, 12] as const
/** Remise (en %) selon la durée payée d'avance. */
export const DISCOUNT_PCT: Record<number, number> = { 1: 0, 3: 0, 6: 10, 12: 20 }

export interface Quote { months: number; monthly: number; list: number; discountPct: number; discount: number; total: number }

export function priceFor(monthly: number, months: number): Quote {
  const list = Math.round(monthly * months)
  const discountPct = DISCOUNT_PCT[months] ?? 0
  const total = Math.round((list * (100 - discountPct)) / 100)
  return { months, monthly, list, discountPct, discount: list - total, total }
}
