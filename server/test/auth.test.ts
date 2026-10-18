import { beforeEach, describe, expect, it } from 'vitest'
import { api, APP_URL, bootstrap, json, login, makeEnv, tokenFrom, type Env } from './helpers'

let env: Env
beforeEach(async () => { env = await makeEnv() })

describe('installation', () => {
  const body = { orgName: 'Acme', adminEmail: 'a@acme.test', adminName: 'Ada' }
  it('exige le jeton d’installation', async () => {
    expect((await env.app.request('/api/bootstrap', json(body))).status).toBe(403)
    expect((await env.app.request('/api/bootstrap', json(body, { 'x-bootstrap-token': 'mauvais' }))).status).toBe(403)
  })
  it('est désactivée sans BOOTSTRAP_TOKEN configuré', async () => {
    const e = await makeEnv({ BOOTSTRAP_TOKEN: '' })
    expect((await e.app.request('/api/bootstrap', json(body, { 'x-bootstrap-token': '' }))).status).toBe(403)
  })
  it('ne fonctionne qu’une seule fois', async () => {
    await bootstrap(env)
    const again = await env.app.request('/api/bootstrap', json({ ...body, adminEmail: 'x@acme.test' }, { 'x-bootstrap-token': 'boot-secret' }))
    expect(again.status).toBe(409)
  })
})

describe('lien magique', () => {
  it('connecte, pose un cookie HttpOnly sécurisé et expose la session', async () => {
    await bootstrap(env, 'admin@acme.test')
    await env.app.request('/api/auth/request-link', json({ email: 'admin@acme.test' }))
    const res = await env.app.request('/api/auth/verify', json({ token: tokenFrom(env, 'admin@acme.test') }))
    expect(res.status).toBe(200)
    const cookie = res.headers.get('set-cookie')!
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/Secure/i)
    expect(cookie).toMatch(/SameSite=Lax/i)
    const body = await res.json()
    expect(body).toMatchObject({ role: 'admin', org: { name: 'Acme Ascenseurs' }, user: { email: 'admin@acme.test' } })
    const s = await api(env, cookie.split(';')[0]).get('/api/auth/session')
    expect(s.status).toBe(200)
  })
  it('un lien est à usage unique', async () => {
    await bootstrap(env)
    await env.app.request('/api/auth/request-link', json({ email: 'admin@acme.test' }))
    const token = tokenFrom(env, 'admin@acme.test')
    expect((await env.app.request('/api/auth/verify', json({ token }))).status).toBe(200)
    expect((await env.app.request('/api/auth/verify', json({ token }))).status).toBe(401)
  })
  it('refuse un lien expiré', async () => {
    await bootstrap(env)
    await env.app.request('/api/auth/request-link', json({ email: 'admin@acme.test' }))
    const token = tokenFrom(env, 'admin@acme.test')
    await env.db.query(`update login_tokens set expires_at = now() - interval '1 minute'`)
    expect((await env.app.request('/api/auth/verify', json({ token }))).status).toBe(401)
  })
  it('ne révèle pas si une adresse existe', async () => {
    await bootstrap(env)
    const before = env.mailer.sent.length
    const res = await env.app.request('/api/auth/request-link', json({ email: 'inconnu@acme.test' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(env.mailer.sent.length).toBe(before)
  })
  it('limite les demandes de lien par adresse', async () => {
    await bootstrap(env)
    const codes: number[] = []
    for (let i = 0; i < 7; i++) codes.push((await env.app.request('/api/auth/request-link', json({ email: 'admin@acme.test' }))).status)
    expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0)
  })
  it('stocke uniquement des empreintes des jetons', async () => {
    await bootstrap(env)
    const token = tokenFrom(env, 'admin@acme.test')
    const rows = (await env.db.query<{ token_hash: string }>('select token_hash from login_tokens')).rows
    expect(rows.every((r) => r.token_hash !== token)).toBe(true)
  })
  it('la déconnexion invalide la session', async () => {
    const cookie = await bootstrap(env)
    const a = api(env, cookie)
    expect((await a.post('/api/auth/logout', {})).status).toBe(200)
    expect((await a.get('/api/auth/session')).status).toBe(401)
  })
})

describe('défense CSRF', () => {
  it('refuse une écriture hors JSON ou depuis une autre origine', async () => {
    const cookie = await bootstrap(env)
    const form = await env.app.request('/api/auth/logout', { method: 'POST', headers: { cookie, 'content-type': 'text/plain', origin: APP_URL }, body: '{}' })
    expect(form.status).toBe(415)
    const evil = await env.app.request('/api/auth/logout', json({}, { cookie, origin: 'https://evil.test' }))
    expect(evil.status).toBe(403)
  })
  it('les routes protégées exigent une session', async () => {
    expect((await env.app.request('/api/sync/pull')).status).toBe(401)
    expect((await env.app.request('/api/sync/push', json({ ops: [] }))).status).toBe(401)
  })
})

describe('membres', () => {
  it('seul un admin invite ; le nouveau membre peut se connecter', async () => {
    const admin = api(env, await bootstrap(env))
    const res = await admin.post('/api/members', { email: 'moussa@acme.test', fullName: 'Moussa', role: 'tech' })
    expect(res.status).toBe(201)
    const cookie = await login(env, 'moussa@acme.test')
    const me = await (await api(env, cookie).get('/api/auth/session')).json()
    expect(me).toMatchObject({ role: 'tech', fullName: 'Moussa' })
    expect(me.techId).toMatch(/^t_/)
    expect((await api(env, cookie).post('/api/members', { email: 'x@acme.test', fullName: 'X Y', role: 'tech' })).status).toBe(403)
  })
  it('ne peut pas se retirer soi-même et révoque les sessions du membre retiré', async () => {
    const admin = api(env, await bootstrap(env))
    const me = await (await admin.get('/api/auth/session')).json()
    expect((await admin.del(`/api/members/${me.user.id}`)).status).toBe(400)
    await admin.post('/api/members', { email: 'b@acme.test', fullName: 'Bureau B', role: 'bureau' })
    const bureau = api(env, await login(env, 'b@acme.test'))
    const bm = await (await bureau.get('/api/auth/session')).json()
    expect((await admin.del(`/api/members/${bm.user.id}`)).status).toBe(200)
    expect((await bureau.get('/api/auth/session')).status).toBe(401)
  })
})
