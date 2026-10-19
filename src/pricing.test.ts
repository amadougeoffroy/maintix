import { describe, expect, it } from 'vitest'
import { priceFor } from '../shared/pricing'

describe('remises de durée', () => {
  it('10 % à 6 mois, 20 % à 12 mois, aucune avant', () => {
    expect(priceFor(90000, 1).total).toBe(90000)
    expect(priceFor(90000, 3).total).toBe(270000)
    expect(priceFor(90000, 6)).toMatchObject({ list: 540000, total: 486000, discount: 54000, discountPct: 10 })
    expect(priceFor(90000, 12)).toMatchObject({ list: 1080000, total: 864000, discount: 216000, discountPct: 20 })
  })
})
