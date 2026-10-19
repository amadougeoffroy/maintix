import { beforeEach, describe, expect, it } from 'vitest'
import { api, bootstrap, push, makeEnv, type Env } from './helpers'

let admin: ReturnType<typeof api>
let env: Env
beforeEach(async () => {
  env = await makeEnv()
  admin = api(env, await bootstrap(env, 'ada@a.test'))
})
const contract = (extra: Record<string, unknown> = {}) => ({ collection: 'contracts', id: 'k1', data: { id: 'k1', clientId: 'c1', elevatorIds: ['e1'], periodicityMonths: 1, priceMonthly: 1000, start: '2026-01-01', indexation: 3, ...extra } })

describe('contrats', () => {
  it('un nouveau contrat doit couvrir au moins un appareil', async () => {
    const empty = await push(admin, [contract({ elevatorIds: [] })])
    expect(empty.results[0]).toMatchObject({ ok: false, reason: 'contract_needs_elevator' })
    const missing = await push(admin, [{ collection: 'contracts', id: 'k2', data: { id: 'k2', clientId: 'c1', periodicityMonths: 1, priceMonthly: 0, start: '2026-01-01', indexation: 3 } }])
    expect(missing.results[0].reason).toBe('contract_needs_elevator')
    expect((await push(admin, [contract()])).results[0].ok).toBe(true)
  })
  it('un contrat existant peut encore être modifié', async () => {
    await push(admin, [contract()])
    expect((await push(admin, [contract({ priceMonthly: 2000 })])).results[0].ok).toBe(true)
  })
})
