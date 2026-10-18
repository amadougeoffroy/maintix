import { beforeEach, describe, expect, it } from 'vitest'
import { api, bootstrap, invite, makeEnv, type Env } from './helpers'

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
  it('est propre à chaque membre et à chaque entreprise', async () => {
    await admin.post('/api/me/onboarding', { welcomeSeen: true })
    const tech = api(env, await invite(env, admin, 'tech@x.test', 'tech'))
    expect(await get(tech)).toEqual({}) // un autre membre n'a rien vu
    const { orgId } = await (await admin.post('/api/orgs', { name: 'Seconde' })).json()
    await admin.post('/api/auth/switch-org', { orgId })
    expect(await get(admin)).toEqual({}) // même personne, autre entreprise : didacticiel à refaire
  })
  it('exige une session', async () => {
    expect((await env.app.request('/api/me/onboarding')).status).toBe(401)
  })
})
