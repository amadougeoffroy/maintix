import { beforeEach, describe, expect, it } from 'vitest'
import { api, bootstrap, invite, json, login, makeEnv, push, tokenFrom, type Env } from './helpers'

let env: Env
let adminCookie: string
let admin: ReturnType<typeof api>
beforeEach(async () => {
  env = await makeEnv()
  adminCookie = await bootstrap(env, 'ada@a.test')
  admin = api(env, adminCookie)
})

describe('plusieurs entreprises', () => {
  it('un administrateur crée une 2e entreprise, bascule et voit des données séparées', async () => {
    await push(admin, [{ collection: 'clients', id: 'c1', data: { id: 'c1', name: 'Client A' } }])
    const created = await admin.post('/api/orgs', { name: 'Seconde SARL' })
    expect(created.status).toBe(201)
    const { orgId } = await created.json()
    const list = (await (await admin.get('/api/orgs')).json()).orgs as { id: string; name: string; current: boolean }[]
    expect(list.map((o) => o.name).sort()).toEqual(['Acme Ascenseurs', 'Seconde SARL'])
    expect(list.find((o) => o.current)!.name).toBe('Acme Ascenseurs')

    const sw = await admin.post('/api/auth/switch-org', { orgId })
    expect(sw.status).toBe(200)
    expect((await sw.json()).org.name).toBe('Seconde SARL')
    const docs = (await (await admin.get('/api/sync/pull?since=0')).json()).docs as { collection: string }[]
    expect(docs.filter((d) => d.collection === 'clients')).toEqual([]) // aucune donnée de l'autre entreprise
    expect(docs.some((d) => d.collection === 'techs')).toBe(true)
  })
  it('refuse de basculer vers une entreprise dont on n’est pas membre', async () => {
    const other = crypto.randomUUID()
    await env.db.query(`insert into organisations (id, name) values ($1,'Étrangère')`, [other])
    expect((await admin.post('/api/auth/switch-org', { orgId: other })).status).toBe(403)
    expect((await admin.post('/api/auth/switch-org', { orgId: 'pas-un-uuid' })).status).toBe(400)
  })
  it('la prochaine connexion reprend la dernière entreprise utilisée', async () => {
    const { orgId } = await (await admin.post('/api/orgs', { name: 'Seconde SARL' })).json()
    await admin.post('/api/auth/switch-org', { orgId })
    await env.app.request('/api/auth/request-link', json({ email: 'ada@a.test' }))
    const res = await env.app.request('/api/auth/verify', json({ token: tokenFrom(env, 'ada@a.test') }))
    expect((await res.json()).org.name).toBe('Seconde SARL')
  })
  it('un utilisateur invité dans deux entreprises voit les deux ; un technicien ne crée pas d’entreprise', async () => {
    const { orgId } = await (await admin.post('/api/orgs', { name: 'Seconde SARL' })).json()
    await admin.post('/api/auth/switch-org', { orgId })
    await admin.post('/api/members', { email: 'moussa@x.test', fullName: 'Moussa Deux', role: 'tech' })
    await admin.post('/api/auth/switch-org', { orgId: (await (await admin.get('/api/orgs')).json()).orgs.find((o: { name: string }) => o.name === 'Acme Ascenseurs').id })
    const tech = api(env, await invite(env, admin, 'moussa@x.test', 'tech'))
    const orgs = (await (await tech.get('/api/orgs')).json()).orgs as { name: string; role: string }[]
    expect(orgs).toHaveLength(2)
    expect((await tech.post('/api/orgs', { name: 'Pirate' })).status).toBe(403)
    void login
  })
  it('limite la création d’entreprises', async () => {
    const codes: number[] = []
    for (let i = 0; i < 7; i++) codes.push((await admin.post('/api/orgs', { name: `Org ${i}` })).status)
    expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0)
  })
})
