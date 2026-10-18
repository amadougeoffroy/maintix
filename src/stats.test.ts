import { beforeEach, describe, expect, it } from 'vitest'
import { clientStats } from './stats'
import { seed } from './seed'
import { setStateForTests, getState } from './store'
import { addDays, today } from './util'

beforeEach(() => setStateForTests(seed()))

describe('statistiques par client', () => {
  it('agrège parc, santé, défauts et contrats', () => {
    const st = clientStats(getState(), 'c2')
    expect(st.elevatorIds).toEqual(['e3', 'e4'])
    expect(st.avgHealth).toBeGreaterThan(0)
    expect(st.annualRevenue).toBe(280000 * 12)
    expect(st.open.majeur).toBe(1) // contrôle technique sur e4
    expect(st.breakdowns12m).toBe(1) // dépannage ouvert sur e4
    expect(st.mttrHours).toBeNull() // aucun dépannage clôturé
  })
  it('compte 12 mois de pannes et calcule le délai moyen de résolution', () => {
    const s = getState()
    const created = new Date(Date.now() - 5 * 3_600_000).toISOString()
    const done = new Date().toISOString()
    s.jobs.push({ id: 'jx', type: 'depannage', elevatorId: 'e3', techId: 't1', date: today(), status: 'terminee', createdAt: created, timeline: [], visit: { lockedOut: true, checklist: {}, measures: {}, emergencyCallTest: null, parts: [], minutes: 20, notes: '', finishedAt: done } })
    const st = clientStats(s, 'c2')
    expect(st.perMonth).toHaveLength(12)
    expect(st.perMonth.reduce((t, m) => t + m.n, 0)).toBe(2)
    expect(st.mttrHours).toBe(5)
  })
  it('signale les visites en retard de plus de 7 jours et les factures échues', () => {
    const s = getState()
    s.jobs.push({ id: 'jl', type: 'entretien', elevatorId: 'e1', techId: 't1', date: addDays(today(), -20), status: 'planifiee', createdAt: 'x', timeline: [] })
    s.invoices.push({ id: 'f1', clientId: 'c1', kind: 'libre', lines: [{ label: 'x', qty: 1, unit: 100000 }], vatRate: 20, status: 'emise', createdAt: 'x', number: 'FAC-1', issuedAt: addDays(today(), -60), dueAt: addDays(today(), -30) })
    const st = clientStats(s, 'c1')
    expect(st.lateVisits).toBe(1)
    expect(st.overdueInvoices).toBe(1)
    expect(st.outstanding).toBe(120000)
  })
})
