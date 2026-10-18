import { beforeEach, describe, expect, it } from 'vitest'
import { api, bootstrap, createOrg, invite, json, makeEnv, push, tokenFrom, type Env } from './helpers'

let env: Env
let adminCookie: string
let admin: ReturnType<typeof api>
beforeEach(async () => {
  env = await makeEnv()
  adminCookie = await bootstrap(env, 'ada@a.test')
  admin = api(env, adminCookie)
})

describe('plusieurs entreprises', () => {
  it('l’opérateur crée une 2e entreprise avec lui comme administrateur, bascule et voit des données séparées', async () => {
    await push(admin, [{ collection: 'clients', id: 'c1', data: { id: 'c1', name: 'Client A' } }])
    const orgId = await createOrg(admin, 'Seconde SARL', 'ada@a.test', 'Ada')
    const list = (await (await admin.get('/api/orgs')).json()).orgs as { id: string; name: string; current: boolean }[]
    expect(list.map((o) => o.name).sort()).toEqual(['Acme Ascenseurs', 'Seconde SARL'])
    expect(list.find((o) => o.current)!.name).toBe('Acme Ascenseurs')
    const sw = await admin.post('/api/auth/switch-org', { orgId })
    expect(sw.status).toBe(200)
    expect((await sw.json()).org.name).toBe('Seconde SARL')
    const docs = (await (await admin.get('/api/sync/pull?since=0')).json()).docs as { collection: string }[]
    expect(docs.filter((d) => d.collection === 'clients')).toEqual([])
    expect(docs.some((d) => d.collection === 'techs')).toBe(true)
  })
  it('refuse de basculer vers une entreprise dont on n’est pas membre', async () => {
    const other = crypto.randomUUID()
    await env.db.query(`insert into organisations (id, name) values ($1,'Étrangère')`, [other])
    expect((await admin.post('/api/auth/switch-org', { orgId: other })).status).toBe(403)
    expect((await admin.post('/api/auth/switch-org', { orgId: 'pas-un-uuid' })).status).toBe(400)
  })
  it('la prochaine connexion reprend la dernière entreprise utilisée', async () => {
    const orgId = await createOrg(admin, 'Seconde SARL', 'ada@a.test', 'Ada')
    await admin.post('/api/auth/switch-org', { orgId })
    await env.app.request('/api/auth/request-link', json({ email: 'ada@a.test' }))
    const res = await env.app.request('/api/auth/verify', json({ token: tokenFrom(env, 'ada@a.test') }))
    expect((await res.json()).org.name).toBe('Seconde SARL')
  })
  it('un utilisateur invité dans deux entreprises voit les deux', async () => {
    const orgId = await createOrg(admin, 'Seconde SARL', 'ada@a.test', 'Ada')
    await admin.post('/api/auth/switch-org', { orgId })
    await admin.post('/api/members', { email: 'moussa@x.test', fullName: 'Moussa Deux', role: 'tech' })
    await admin.post('/api/auth/switch-org', { orgId: (await (await admin.get('/api/orgs')).json()).orgs.find((o: { name: string }) => o.name === 'Acme Ascenseurs').id })
    const tech = api(env, await invite(env, admin, 'moussa@x.test', 'tech'))
    expect(((await (await tech.get('/api/orgs')).json()).orgs as unknown[]).length).toBe(2)
  })
})

describe('la création d’entreprise est réservée aux opérateurs', () => {
  it('ni un administrateur d’entreprise ni un technicien ne peuvent en créer', async () => {
    const orgId = await createOrg(admin, 'Cliente SA', 'dg@cliente.test', 'Directeur')
    void orgId
    const clientAdmin = api(env, await (await import('./helpers')).login(env, 'dg@cliente.test'))
    // l'ancienne route n'existe plus
    expect((await clientAdmin.post('/api/orgs', { name: 'Pirate' })).status).toBe(404)
    // la route opérateur est interdite
    expect((await clientAdmin.post('/api/operator/orgs', { name: 'Pirate', adminName: 'Pirate X', adminEmail: 'p@x.test' })).status).toBe(403)
    const tech = api(env, await invite(env, clientAdmin, 'tech@cliente.test', 'tech'))
    expect((await tech.post('/api/operator/orgs', { name: 'Pirate', adminName: 'Pirate X', adminEmail: 'p@x.test' })).status).toBe(403)
    expect((await env.db.query<{ n: number }>('select count(*)::int as n from organisations')).rows[0].n).toBe(2)
  })
})
