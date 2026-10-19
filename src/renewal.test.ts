import { describe, expect, it } from 'vitest'
import { daysUntil } from './components/Shells'

describe('daysUntil', () => {
  const now = new Date(2026, 9, 19, 15, 30) // 19 octobre 2026
  it('compte les jours calendaires restants', () => {
    expect(daysUntil('2026-10-19', now)).toBe(0)
    expect(daysUntil('2026-10-20', now)).toBe(1)
    expect(daysUntil('2026-10-26', now)).toBe(7)
    expect(daysUntil('2026-10-18', now)).toBe(-1)
    expect(daysUntil('2026-11-01', now)).toBe(13)
  })
})
