import { beforeEach, describe, expect, it } from 'vitest'
import { actions, buildSummary, certStatus, currentOnCall, getState, healthScore, measureDrift, setStateForTests, verifyJob, visitReadiness } from './store'
import { seed } from './seed'
import { today } from './util'

beforeEach(() => setStateForTests(seed()))

describe('habilitations', () => {
  it('détecte une habilitation expirée', () => {
    const t2 = getState().techs.find((t) => t.id === 't2')!
    expect(certStatus(t2).ok).toBe(false)
    expect(certStatus(getState().techs[0]).ok).toBe(true)
  })
})

describe('astreinte et signalement', () => {
  it('affecte un signalement à l’astreinte en cours', () => {
    expect(currentOnCall(getState())?.id).toBe('t1')
    const job = actions.report({ elevatorId: 'e1', description: 'bloqué', trapped: true, reporter: 'X' })
    const j = getState().jobs.find((x) => x.id === job.id)!
    expect(j.techId).toBe('t1')
    expect(j.timeline[0].label).toContain('PERSONNE BLOQUÉE')
    expect(getState().elevators.find((e) => e.id === 'e1')!.status).toBe('panne')
  })
})

describe('mesures', () => {
  it('signale une dérive supérieure à 20 %', () => {
    expect(measureDrift('10', '13')).toBeCloseTo(0.3)
    expect(measureDrift('10', '11')).toBeNull()
    expect(measureDrift('', '5')).toBeNull()
  })
})

describe('clôture d’une visite', () => {
  it('exige consignation, test d’appel, signature et photo des défauts', () => {
    actions.setStatus('j1', 'sur_place')
    actions.answer('j1', 'pal_galets', { status: 'ko', photos: [] })
    const missing = visitReadiness(getState().jobs.find((j) => j.id === 'j1')!)
    expect(missing.join('|')).toContain('Consignation')
    expect(missing.join('|')).toContain('appel')
    expect(missing.join('|')).toContain('Signature')
    expect(missing.join('|')).toContain('Photo manquante')
  })

  it('crée les défauts, planifie la prochaine visite et scelle le rapport', async () => {
    actions.setStatus('j1', 'sur_place')
    actions.updateVisit('j1', { lockedOut: true, emergencyCallTest: 'ok', signature: { absent: true, at: new Date().toISOString(), photo: 'x' } })
    actions.answer('j1', 'sec_limiteur', { status: 'ko', photos: ['p'] })
    actions.answer('j1', 'gai_cuvette', { status: 'ok', photos: [] })
    expect(visitReadiness(getState().jobs.find((j) => j.id === 'j1')!)).toEqual([])
    await actions.finishJob('j1', 25)

    const s = getState()
    const job = s.jobs.find((j) => j.id === 'j1')!
    expect(job.status).toBe('terminee')
    expect(job.visit!.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(await verifyJob(job)).toBe(true)

    const d = s.defects.find((x) => x.itemKey === 'sec_limiteur')!
    expect(d.severity).toBe('critique')
    expect(d.status).toBe('ouvert')

    const next = s.jobs.find((x) => x.elevatorId === 'e1' && x.type === 'entretien' && x.status === 'planifiee' && x.date > today())
    expect(next).toBeTruthy()
    expect(s.elevators.find((e) => e.id === 'e1')!.lastVisit).toBe(today())
  })

  it('détecte une altération du rapport après scellage', async () => {
    actions.setStatus('j1', 'sur_place')
    actions.updateVisit('j1', { lockedOut: true, emergencyCallTest: 'ok', signature: { absent: true, at: 'x', photo: 'x' } })
    await actions.finishJob('j1', 10)
    const job = getState().jobs.find((j) => j.id === 'j1')!
    const tampered = { ...job, visit: { ...job.visit!, minutes: 999 } }
    expect(await verifyJob(tampered)).toBe(false)
  })

  it('lève un défaut quand le point repasse à OK', async () => {
    actions.setStatus('j1', 'sur_place')
    actions.updateVisit('j1', { lockedOut: true, emergencyCallTest: 'ok', signature: { absent: true, at: 'x', photo: 'x' } })
    actions.answer('j1', 'pal_galets', { status: 'ko', photos: ['p'] })
    await actions.finishJob('j1', 10)
    expect(getState().defects.find((d) => d.itemKey === 'pal_galets')!.status).toBe('ouvert')

    actions.setStatus('j2', 'sur_place')
    actions.updateVisit('j2', { lockedOut: true, emergencyCallTest: 'ok', signature: { absent: true, at: 'x', photo: 'x' } })
    const job2 = actions.createJob({ type: 'entretien', elevatorId: 'e1', techId: 't1', date: today() })
    actions.setStatus(job2.id, 'sur_place')
    actions.updateVisit(job2.id, { lockedOut: true, emergencyCallTest: 'ok', signature: { absent: true, at: 'x', photo: 'x' } })
    actions.answer(job2.id, 'pal_galets', { status: 'ok', photos: [] })
    await actions.finishJob(job2.id, 10)
    expect(getState().defects.find((d) => d.itemKey === 'pal_galets')!.status).toBe('leve')
  })
})

describe('santé du parc', () => {
  it('baisse avec les défauts critiques en retard', () => {
    const s = getState()
    expect(healthScore(s, 'e5')).toBeLessThan(healthScore(s, 'e2'))
    expect(healthScore(s, 'e2')).toBeGreaterThan(80)
  })
  it('génère un résumé lisible', () => {
    actions.setStatus('j1', 'sur_place')
    actions.answer('j1', 'pal_galets', { status: 'watch', photos: [] })
    const txt = buildSummary(getState(), getState().jobs.find((j) => j.id === 'j1')!)
    expect(txt).toContain('À surveiller')
  })
})
