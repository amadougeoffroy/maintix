import { describe, expect, it } from 'vitest'
import { loginLinkFor } from '../src/cli'
import { api, bootstrap, json, makeEnv } from './helpers'

describe('commande login-link', () => {
  it('crée un lien valable pour un membre existant, utilisable une seule fois', async () => {
    const env = await makeEnv()
    await bootstrap(env, 'ada@a.test')
    const link = await loginLinkFor(env.db, 'https://maintix.test/', ' ADA@a.test ')
    expect(link).toMatch(/^https:\/\/maintix\.test\/#\/auth\?token=[\w-]{40,}$/)
    const token = link!.split('token=')[1]
    const res = await env.app.request('/api/auth/verify', json({ token }))
    expect(res.status).toBe(200)
    expect((await res.json()).user.email).toBe('ada@a.test')
    expect((await env.app.request('/api/auth/verify', json({ token }))).status).toBe(401)
    void api
  })
  it('renvoie null pour une adresse inconnue', async () => {
    const env = await makeEnv()
    await bootstrap(env)
    expect(await loginLinkFor(env.db, 'https://x.test', 'inconnu@a.test')).toBeNull()
  })
})
