import { beforeEach, describe, expect, it } from 'vitest'
import { api, bootstrap, createOrg, invite, login, makeEnv, push, type Env } from './helpers'

let env: Env
let op: ReturnType<typeof api>
beforeEach(async () => {
  env = await makeEnv()
  op = api(env, await bootstrap(env, 'ada@a.test'))
})
const count = async (sql: string, p: unknown[] = []) => (await env.db.query<{ n: number }>(sql, p)).rows[0].n

describe('suppression d’une entreprise (console opérateur)', () => {
  async function populated(name: string, email: string) {
    const id = await createOrg(op, name, email, 'Directeur')
    const dg = api(env, await login(env, email))
    await push(dg, [{ collection: 'clients', id: 'c1', data: { id: 'c1', name: 'Client' } }, { collection: 'sites', id: 's1', data: { id: 's1', clientId: 'c1', name: 'S', address: 'x' } }])
    await env.db.query(`insert into files (org_id, hash, mime, size, data) values ($1, 'h1', 'image/png', 3, 'abc')`, [id])
    await invite(env, dg, `tech@${email.split('@')[1]}`, 'tech')
    return { id, dg }
  }
  it('exige le nom exact de l’entreprise pour confirmer', async () => {
    const { id } = await populated('Cliente SA', 'dg@c.test')
    expect((await op.fetch('DELETE', `/api/operator/orgs/${id}`, { confirmName: 'cliente sa' })).status).toBe(400)
    expect((await op.fetch('DELETE', `/api/operator/orgs/${id}`, {})).status).toBe(400)
    expect(await count('select count(*)::int as n from organisations where id = $1', [id])).toBe(1)
  })
  it('supprime l’entreprise, ses données, ses fichiers, ses comptes — et rien d’autre', async () => {
    const a = await populated('Cliente SA', 'dg@c.test')
    const b = await populated('Autre SA', 'dg@autre.test')
    const r = await op.fetch('DELETE', `/api/operator/orgs/${a.id}`, { confirmName: 'Cliente SA' })
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ ok: true, members: 2, users: 2 })
    for (const t of ['docs', 'members', 'files', 'sessions', 'audit_log']) expect(await count(`select count(*)::int as n from ${t} where ${t === 'sessions' ? 'org_id' : 'org_id'} = $1`, [a.id])).toBe(0)
    expect(await count(`select count(*)::int as n from users where email in ('dg@c.test', 'tech@c.test')`)).toBe(0)
    expect((await a.dg.get('/api/auth/session')).status).toBe(401)
    // l'autre entreprise et l'opérateur sont intacts
    expect((await b.dg.get('/api/auth/session')).status).toBe(200)
    expect(await count('select count(*)::int as n from docs where org_id = $1', [b.id])).toBeGreaterThan(0)
    expect(await count(`select count(*)::int as n from users where email = 'ada@a.test'`)).toBe(1)
    const names = ((await (await op.get('/api/operator/overview')).json()).orgs as { name: string }[]).map((o) => o.name)
    expect(names).toEqual(['Autre SA'])
    // trace de plateforme conservée
    expect(await count(`select count(*)::int as n from audit_log where action = 'operator.org.delete'`)).toBe(1)
  })
  it('conserve un compte qui appartient aussi à une autre entreprise', async () => {
    const a = await createOrg(op, 'A SA', 'multi@x.test', 'Multi')
    await createOrg(op, 'B SA', 'multi@x.test', 'Multi')
    await op.fetch('DELETE', `/api/operator/orgs/${a}`, { confirmName: 'A SA' })
    expect(await count(`select count(*)::int as n from users where email = 'multi@x.test'`)).toBe(1)
  })
  it('est réservée aux opérateurs et ne touche pas l’entreprise plateforme', async () => {
    const { id, dg } = await populated('Cliente SA', 'dg@c.test')
    expect((await dg.fetch('DELETE', `/api/operator/orgs/${id}`, { confirmName: 'Cliente SA' })).status).toBe(403)
    const platform = (await env.db.query<{ id: string }>(`select id from organisations where kind = 'platform'`)).rows[0].id
    expect((await op.fetch('DELETE', `/api/operator/orgs/${platform}`, { confirmName: 'Acme Ascenseurs' })).status).toBe(404)
    expect((await op.fetch('DELETE', `/api/operator/orgs/${crypto.randomUUID()}`, { confirmName: 'x' })).status).toBe(404)
  })
})

describe('vider les données d’une entreprise (démonstration, remise à zéro)', () => {
  async function org() {
    const id = await createOrg(op, 'Cliente SA', 'dg@c.test', 'DG')
    const dg = api(env, await login(env, 'dg@c.test'))
    await push(dg, [
      { collection: 'clients', id: 'c1', data: { id: 'c1', name: 'Client' } },
      { collection: 'sites', id: 's1', data: { id: 's1', clientId: 'c1', name: 'S', address: 'x' } },
      { collection: 'elevators', id: 'e1', data: { id: 'e1', siteId: 's1', label: 'A1', status: 'ok' } },
      { collection: 'techs', id: 'demo-t', data: { id: 'demo-t', name: 'Technicien démo', role: 'tech', certs: [] } },
    ])
    await env.db.query(`insert into files (org_id, hash, mime, size, data) values ($1, 'h1', 'image/png', 3, 'abc')`, [id])
    await env.db.query(`insert into invoice_counters (org_id, year, last) values ($1, 2026, 7)`, [id])
    return { id, dg }
  }
  it('exige la confirmation et le rôle administrateur', async () => {
    const { dg } = await org()
    expect((await dg.post('/api/org/clear-data', {})).status).toBe(400)
    expect((await dg.post('/api/org/clear-data', { confirm: 'oui' })).status).toBe(400)
    const tech = api(env, await invite(env, dg, 'tech@c.test', 'tech'))
    expect((await tech.post('/api/org/clear-data', { confirm: 'SUPPRIMER' })).status).toBe(403)
  })
  it('supprime les données métier mais garde les comptes, réglages et techniciens liés à un compte', async () => {
    const { id, dg } = await org()
    const before = await (await dg.get('/api/sync/pull?since=0')).json()
    const r = await dg.post('/api/org/clear-data', { confirm: 'SUPPRIMER' })
    expect(r.status).toBe(200)
    expect((await r.json()).documents).toBe(4)
    const live = (await env.db.query<{ collection: string; id: string }>(`select collection, id from docs where org_id = $1 and not deleted order by collection`, [id])).rows
    expect(live.map((d) => d.collection).sort()).toEqual(['settings', 'techs'].filter((c) => before.docs.some((d: { collection: string }) => d.collection === c)).sort())
    expect(await count('select count(*)::int as n from files where org_id = $1', [id])).toBe(0)
    expect(await count('select count(*)::int as n from invoice_counters where org_id = $1', [id])).toBe(0) // numérotation repartie de zéro
    expect(await count('select count(*)::int as n from members where org_id = $1', [id])).toBe(1)
    expect((await dg.get('/api/auth/session')).status).toBe(200)
  })
  it('propage les suppressions aux autres appareils (documents supprimés, pas effacés)', async () => {
    const { dg } = await org()
    const cursor = (await (await dg.get('/api/sync/pull?since=0')).json()).cursor as number
    await dg.post('/api/org/clear-data', { confirm: 'SUPPRIMER' })
    const delta = (await (await dg.get(`/api/sync/pull?since=${cursor}`)).json()).docs as { collection: string; id: string; deleted: boolean }[]
    expect(delta.filter((d) => d.deleted).map((d) => `${d.collection}:${d.id}`).sort()).toEqual(['clients:c1', 'elevators:e1', 'sites:s1', 'techs:demo-t'])
  })
})
