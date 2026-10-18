import { describe, expect, it } from 'vitest'
import { applyIndexation, contractAlerts, contractStatus, indexationDue, noticeDeadline, renew, termEnd, terminate } from './contracts'
import type { Contract } from './types'

const base: Contract = { id: 'k', clientId: 'c', elevatorIds: ['e'], periodicityMonths: 1, priceMonthly: 100, start: '2024-03-15', indexation: 3 }

describe('terme et préavis', () => {
  it('reconduction tacite : le terme avance d’un an à chaque échéance', () => {
    expect(termEnd(base, '2024-06-01')).toBe('2025-03-15')
    expect(termEnd(base, '2025-03-15')).toBe('2026-03-15')
    expect(termEnd(base, '2026-10-18')).toBe('2027-03-15')
  })
  it('le préavis est de 3 mois avant la fin du terme', () => {
    expect(noticeDeadline(base, '2026-10-18')).toBe('2026-12-15')
    expect(noticeDeadline({ ...base, noticeMonths: 1 }, '2026-10-18')).toBe('2027-02-15')
  })
  it('statut : en cours, échéance proche (60 j avant la date limite), reconduit après la date limite', () => {
    expect(contractStatus(base, '2026-05-01')).toBe('actif')
    expect(contractStatus(base, '2026-10-18')).toBe('preavis_proche') // limite le 15/12 : dans 58 jours
    expect(contractStatus(base, '2026-12-20')).toBe('preavis_depasse')
  })
  it('sans reconduction tacite : échu après la fin, à renouveler avant', () => {
    const fixed = { ...base, autoRenew: false }
    expect(termEnd(fixed, '2030-01-01')).toBe('2025-03-15')
    expect(contractStatus(fixed, '2025-01-10')).toBe('preavis_proche')
    expect(contractStatus(fixed, '2025-04-01')).toBe('echu')
    const renewed = renew(fixed)
    expect(termEnd(renewed)).toBe('2026-03-15')
    expect(contractStatus(renewed, '2025-04-01')).toBe('actif')
  })
  it('un contrat résilié n’alerte plus', () => {
    const t = terminate(base, '2026-10-01')
    expect(contractStatus(t, '2026-10-18')).toBe('resilie')
    expect(contractAlerts([t], '2026-10-18')).toEqual([])
  })
})

describe('indexation', () => {
  it('est due un an après le début, puis un an après la dernière indexation', () => {
    expect(indexationDue(base, '2025-02-20')).toBe(true) // dans le mois qui précède l'anniversaire
    expect(indexationDue(base, '2024-12-01')).toBe(false)
  })
  it('applique le taux, arrondit au franc CFA entier et historise', () => {
    const c = applyIndexation({ ...base, priceMonthly: 99999, indexation: 2.5 }, '2025-03-15')
    expect(c.priceMonthly).toBe(102499) // 99 999 × 1,025 = 102 498,975 → 102 499
    expect(c.lastIndexed).toBe('2025-03-15')
    expect(c.priceHistory).toEqual([{ date: '2025-03-15', from: 99999, to: 102499, rate: 2.5 }])
    expect(indexationDue(c, '2025-04-01')).toBe(false)
    expect(indexationDue(c, '2026-02-20')).toBe(true)
  })
  it('sans taux, aucune indexation', () => {
    expect(indexationDue({ ...base, indexation: 0 }, '2030-01-01')).toBe(false)
  })
})

describe('alertes', () => {
  it('liste préavis et indexations par ordre de date', () => {
    const a = contractAlerts([base, { ...base, id: 'k2', start: '2023-12-01' }], '2026-10-18')
    expect(a.map((x) => x.kind)).toContain('preavis')
    expect(a.map((x) => x.date)).toEqual([...a.map((x) => x.date)].sort())
  })
})
