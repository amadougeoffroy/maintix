import { describe, expect, it } from 'vitest'
import { complianceRows, complianceStatus, completeItem } from './compliance'
import { fmtMinutes, jobSla, responseMinutes, resolutionMinutes, slaLimitMinutes } from './sla'
import type { Contract, ComplianceItem, Job } from './types'

const item = (due: string, extra: Partial<ComplianceItem> = {}): ComplianceItem => ({ id: 'i1', kind: 'controle_technique', label: 'Contrôle technique', due, ...extra })

describe('échéances réglementaires', () => {
  it('classe dépassée, bientôt (≤ 30 jours) et ok', () => {
    expect(complianceStatus(item('2026-10-01'), '2026-10-22')).toBe('depassee')
    expect(complianceStatus(item('2026-10-22'), '2026-10-22')).toBe('bientot') // le jour même : encore à faire
    expect(complianceStatus(item('2026-11-21'), '2026-10-22')).toBe('bientot')
    expect(complianceStatus(item('2026-11-22'), '2026-10-22')).toBe('ok')
  })
  it('valider une échéance périodique avance la suivante ; sans périodicité elle est soldée', () => {
    expect(completeItem(item('2026-12-01', { intervalMonths: 12 }), '2026-11-20')).toMatchObject({ due: '2027-12-01', lastDone: '2026-11-20' }) // en avance : depuis l'échéance
    expect(completeItem(item('2026-01-15', { intervalMonths: 12 }), '2026-10-22')).toMatchObject({ due: '2027-10-22' }) // en retard : depuis aujourd'hui
    expect(completeItem(item('2026-12-01'), '2026-11-20')).toBeNull()
  })
  it('liste les échéances du parc, les plus urgentes d’abord, avec un horizon optionnel', () => {
    const s = {
      clients: [{ id: 'c1', name: 'Client' }] as never,
      sites: [{ id: 's1', clientId: 'c1', name: 'Site' }] as never,
      elevators: [
        { id: 'e1', siteId: 's1', label: 'A1', compliance: [item('2026-12-30', { id: 'x' }), item('2026-10-10', { id: 'y', kind: 'assurance' })] },
        { id: 'e2', siteId: 's1', label: 'B1', compliance: [item('2026-11-05', { id: 'z' })] },
        { id: 'e3', siteId: 's1', label: 'C1' },
      ] as never,
    }
    expect(complianceRows(s, '2026-10-22').map((r) => `${r.elevator}:${r.item.id}:${r.status}`)).toEqual(['A1:y:depassee', 'B1:z:bientot', 'A1:x:ok'])
    expect(complianceRows(s, '2026-10-22', 30).map((r) => r.item.id)).toEqual(['y', 'z'])
    expect(complianceRows(s, '2026-10-22')[0]).toMatchObject({ client: 'Client', site: 'Site', days: -12 })
  })
})

const contract = (extra: Partial<Contract> = {}): Contract => ({ id: 'k1', clientId: 'c1', elevatorIds: ['e1'], periodicityMonths: 1, priceMonthly: 0, start: '2026-01-01', indexation: 0, slaResponseHours: 4, slaTrappedMinutes: 60, ...extra })
const job = (createdAt: string, arrival?: string, extra: Partial<Job> = {}): Job => ({ id: 'j', type: 'depannage', elevatorId: 'e1', techId: null, date: '2026-10-22', status: 'planifiee', createdAt, timeline: arrival ? [{ at: arrival, label: 'Technicien sur place' }] : [], ...extra })

describe('SLA', () => {
  it('prend le délai « personne bloquée » quand il s’applique, sinon le délai standard, sinon aucun', () => {
    expect(slaLimitMinutes(contract(), { trapped: true })).toBe(60)
    expect(slaLimitMinutes(contract(), { trapped: false })).toBe(240)
    expect(slaLimitMinutes(contract({ slaTrappedMinutes: undefined }), { trapped: true })).toBe(240)
    expect(slaLimitMinutes(contract({ slaResponseHours: undefined, slaTrappedMinutes: undefined }), {})).toBeNull()
    expect(slaLimitMinutes(undefined, {})).toBeNull()
  })
  it('mesure le délai d’arrivée et de résolution', () => {
    const j = job('2026-10-22T08:00:00.000Z', '2026-10-22T09:30:00.000Z')
    expect(responseMinutes(j)).toBe(90)
    expect(responseMinutes(job('2026-10-22T08:00:00.000Z'))).toBeNull()
    expect(resolutionMinutes({ ...j, timeline: [...j.timeline, { at: '2026-10-22T11:00:00.000Z', label: 'Intervention terminée' }] })).toBe(180)
  })
  it('qualifie un dépannage : respecté, dépassé, ou en cours (ok, à risque, en retard)', () => {
    const t0 = '2026-10-22T08:00:00.000Z'
    const now = (min: number) => Date.parse(t0) + min * 60000
    expect(jobSla(contract(), job(t0, '2026-10-22T11:00:00.000Z'), now(300)).state).toBe('respecte') // 3 h sur 4 h
    expect(jobSla(contract(), job(t0, '2026-10-22T12:30:00.000Z'), now(300)).state).toBe('depasse') // 4 h 30
    expect(jobSla(contract(), job(t0), now(60)).state).toBe('ok')
    expect(jobSla(contract(), job(t0), now(190))).toMatchObject({ state: 'risque', remaining: 50 }) // ≥ 75 % de 240 min
    expect(jobSla(contract(), job(t0), now(250))).toMatchObject({ state: 'en_retard', remaining: -10 })
    expect(jobSla(contract(), job(t0, undefined, { trapped: true }), now(70)).state).toBe('en_retard') // personne bloquée : 60 min
    expect(jobSla(undefined, job(t0), now(500)).state).toBe('aucun')
  })
  it('formate les durées', () => {
    expect([fmtMinutes(45), fmtMinutes(135), fmtMinutes(120), fmtMinutes(-10)]).toEqual(['45 min', '2 h 15', '2 h', '-10 min'])
  })
})
