import { beforeEach, describe, expect, it } from 'vitest'
import { api, bootstrap, createOrg, invite, login, makeEnv, type Env } from './helpers'

let env: Env
let admin: ReturnType<typeof api>
beforeEach(async () => {
  env = await makeEnv()
  admin = api(env, await bootstrap(env))
})
const get = async (a: ReturnType<typeof api>) => (await (await a.get('/api/me/onboarding')).json()).onboarding as Record<string, boolean>

describe('didacticiel', () => {
  it('démarre vide, puis fusionne les mises à jour sans écraser le reste', async () => {
    expect(await get(admin)).toEqual({})
    expect((await admin.post('/api/me/onboarding', { welcomeSeen: true })).status).toBe(200)
    await admin.post('/api/me/onboarding', { qrDone: true })
    await admin.post('/api/me/onboarding', { welcomeSeen: false })
    expect(await get(admin)).toEqual({ welcomeSeen: false, qrDone: true })
  })
  it('refuse les clés inconnues et les valeurs non booléennes', async () => {
    expect((await admin.post('/api/me/onboarding', { admin: true })).status).toBe(400)
    expect((await admin.post('/api/me/onboarding', { welcomeSeen: 'oui' })).status).toBe(400)
    expect((await admin.post('/api/me/onboarding', 'x')).status).toBe(400)
    expect(await get(admin)).toEqual({})
  })
  it('est propre à chaque membre', async () => {
    await admin.post('/api/me/onboarding', { welcomeSeen: true })
    const tech = api(env, await invite(env, admin, 'tech@x.test', 'tech'))
    expect(await get(tech)).toEqual({}) // un autre membre n'a rien vu
  })
  it('exige une session', async () => {
    expect((await env.app.request('/api/me/onboarding')).status).toBe(401)
  })
  it('un opérateur entré dans une entreprise conserve son propre avancement (masquer « Premiers pas »)', async () => {
    const orgId = await createOrg(admin, 'Cliente SA', 'dg@c.test', 'Directeur')
    await admin.post(`/api/operator/orgs/${orgId}/enter`, {})
    expect(await get(admin)).toEqual({})
    await admin.post('/api/me/onboarding', { gettingStartedHidden: true })
    expect(await get(admin)).toEqual({ gettingStartedHidden: true })
    // l'administrateur de l'entreprise n'est pas affecté
    const dg = api(env, await login(env, 'dg@c.test'))
    expect(await get(dg)).toEqual({})
    // et la persistance survit à une reconnexion
    await admin.post('/api/operator/leave', {})
    await admin.post(`/api/operator/orgs/${orgId}/enter`, {})
    expect(await get(admin)).toEqual({ gettingStartedHidden: true })
  })
})
