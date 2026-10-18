import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { loadConfig } from '../src/config'
import { memoryMailer } from '../src/mailer'
import { api, APP_URL, bootstrap, json, makeEnv, push, tokenFrom, type Env } from './helpers'

let env: Env
beforeEach(async () => { env = await makeEnv() })

describe('en-têtes de sécurité', () => {
  it('pose CSP, anti-clickjacking, nosniff, HSTS et interdit la mise en cache des réponses API', async () => {
    const res = await env.app.request('/api/health')
    const h = res.headers
    expect(h.get('content-security-policy')).toContain("default-src 'self'")
    expect(h.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect(h.get('content-security-policy')).toContain("script-src 'self'")
    expect(h.get('x-frame-options')).toBe('DENY')
    expect(h.get('x-content-type-options')).toBe('nosniff')
    expect(h.get('strict-transport-security')).toContain('max-age=')
    expect(h.get('cache-control')).toBe('no-store')
    expect(h.get('permissions-policy')).toContain('camera=(self)')
    expect(h.get('access-control-allow-origin')).toBeNull()
  })
  it('n’envoie pas HSTS en http local', async () => {
    const e = await makeEnv({ APP_URL: 'http://localhost:5173' })
    expect((await e.app.request('/api/health')).headers.get('strict-transport-security')).toBeNull()
  })
})

describe('session', () => {
  it('utilise le préfixe __Host- en https', async () => {
    const e = await makeEnv()
    await e.app.request('/api/bootstrap', json({ orgName: 'Acme', adminEmail: 'a@a.test', adminName: 'Ada' }, { 'x-bootstrap-token': 'boot-secret' }))
    const res = await e.app.request('/api/auth/verify', json({ token: tokenFrom(e, 'a@a.test') }))
    const cookie = res.headers.get('set-cookie')!
    expect(cookie).toMatch(/^__Host-cabine_session=/)
    expect(cookie).toMatch(/Path=\//)
    expect(cookie).not.toMatch(/Domain=/i)
  })
  it('limite à 10 sessions actives par utilisateur', async () => {
    const { login } = await import('./helpers')
    await bootstrap(env)
    for (let i = 0; i < 12; i++) await login(env, 'admin@acme.test').catch(() => {})
    const n = (await env.db.query<{ n: number }>('select count(*)::int as n from sessions')).rows[0].n
    expect(n).toBeLessThanOrEqual(10)
  })
})

describe('limiteur de débit partagé', () => {
  it('est commun à plusieurs instances de l’application (même base)', async () => {
    await bootstrap(env)
    const second = createApp({ db: env.db, config: loadConfig({ APP_URL, BOOTSTRAP_TOKEN: 'boot-secret' }), mailer: memoryMailer() })
    // l'installation a déjà consommé 1 des 5 demandes autorisées pour cette adresse
    const codes: number[] = []
    for (let i = 0; i < 6; i++) codes.push((await (i % 2 ? second : env.app).request('/api/auth/request-link', json({ email: 'admin@acme.test' }))).status)
    expect(codes.slice(0, 4)).toEqual([200, 200, 200, 200])
    expect(codes[4]).toBe(429)
  })
})

describe('installation', () => {
  it('deux installations simultanées ne créent qu’une organisation', async () => {
    const body = { orgName: 'Acme', adminEmail: 'a@acme.test', adminName: 'Ada' }
    const res = await Promise.all([1, 2, 3].map((i) => env.app.request('/api/bootstrap', json({ ...body, adminEmail: `a${i}@acme.test` }, { 'x-bootstrap-token': 'boot-secret' }))))
    expect(res.filter((r) => r.status === 200)).toHaveLength(1)
    expect((await env.db.query<{ n: number }>('select count(*)::int as n from organisations')).rows[0].n).toBe(1)
  })
})

describe('taille des documents', () => {
  it('refuse un document qui embarquerait des images en base64', async () => {
    const admin = api(env, await bootstrap(env))
    const huge = { id: 'c1', name: 'x', note: 'a'.repeat(3 * 1024 * 1024 + 10) }
    const r = await push(admin, [{ collection: 'clients', id: 'c1', data: huge }])
    expect(r.results[0]).toMatchObject({ ok: false, reason: 'too_large' })
  })
})
