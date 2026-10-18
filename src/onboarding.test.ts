import { describe, expect, it } from 'vitest'
import { gettingStartedSteps } from './onboarding'
import { emptyState, seed } from './seed'

describe('premiers pas', () => {
  it('une entreprise vide : aucune étape faite, dans l’ordre voulu', () => {
    const steps = gettingStartedSteps(emptyState(), {})
    expect(steps.map((s) => s.key)).toEqual(['company', 'team', 'clients', 'parc', 'contract', 'oncall', 'qr', 'install'])
    expect(steps.every((s) => !s.done)).toBe(true)
    expect(steps.every((s) => s.to.startsWith('/office'))).toBe(true)
  })
  it('se coche d’après les données', () => {
    const s = seed()
    const done = Object.fromEntries(gettingStartedSteps(s, {}).map((x) => [x.key, x.done]))
    expect(done).toMatchObject({ company: true, team: true, clients: true, parc: true, contract: true, oncall: true, qr: false, install: false })
  })
  it('les étapes manuelles dépendent des drapeaux enregistrés', () => {
    const s = emptyState()
    const steps = gettingStartedSteps(s, { qrDone: true, installDone: true })
    expect(steps.find((x) => x.key === 'qr')!.done).toBe(true)
    expect(steps.find((x) => x.key === 'install')!.done).toBe(true)
    expect(steps.find((x) => x.key === 'install')!.manual).toBe('installDone')
  })
  it('l’étape entreprise exige raison sociale ET SIRET', () => {
    const s = emptyState()
    s.settings = [{ id: 'org', legalName: 'ACME', siret: '', vatNumber: '', iban: '', email: '', phone: '', legalFooter: '', paymentDays: 30, vatRate: 20, address: '' }]
    expect(gettingStartedSteps(s, {}).find((x) => x.key === 'company')!.done).toBe(false)
    s.settings[0].siret = '123 456 789 00012'
    expect(gettingStartedSteps(s, {}).find((x) => x.key === 'company')!.done).toBe(true)
  })
})
