import { beforeEach, describe, expect, it } from 'vitest'
import { api, bootstrap, createOrg, json, login, makeEnv, push, tokenFrom, type Env } from './helpers'

let env: Env
let op: ReturnType<typeof api>
beforeEach(async () => {
  env = await makeEnv({ OPERATOR_EMAILS: 'boss@maintix.test' })
  op = api(env, await bootstrap(env, 'ada@a.test'))
})

describe('opérateur : entrer dans une entreprise et revenir à la console', () => {
  it('la session d’un opérateur démarre sur l’entreprise plateforme, hors liste des entreprises', async () => {
    const s = await (await op.get('/api/auth/session')).json()
    expect(s).toMatchObject({ operator: true, orgKind: 'platform', impersonating: false })
  })
  it('entre dans une entreprise cliente (en administrateur), y voit ses données, puis revient', async () => {
    const orgId = await createOrg(op, 'Cliente SA', 'dg@cliente.test', 'Directeur')
    const dg = api(env, await login(env, 'dg@cliente.test'))
    await push(dg, [{ collection: 'clients', id: 'c1', data: { id: 'c1', name: 'Client X' } }])
    const entered = await (await op.post(`/api/operator/orgs/${orgId}/enter`, {})).json()
    expect(entered).toMatchObject({ role: 'admin', orgKind: 'client', impersonating: true, operator: true, org: { name: 'Cliente SA' } })
    const docs = (await (await op.get('/api/sync/pull?since=0')).json()).docs as { collection: string }[]
    expect(docs.some((d) => d.collection === 'clients')).toBe(true)
    const left = await (await op.post('/api/operator/leave', {})).json()
    expect(left).toMatchObject({ orgKind: 'platform', impersonating: false })
    const docsAfter = (await (await op.get('/api/sync/pull?since=0')).json()).docs as { collection: string }[]
    expect(docsAfter.some((d) => d.collection === 'clients')).toBe(false)
  })
  it('peut entrer dans une entreprise suspendue ; son administrateur, lui, reste bloqué', async () => {
    const orgId = await createOrg(op, 'Suspendue SA', 'dg@susp.test', 'DG')
    await op.post(`/api/operator/orgs/${orgId}/suspend`, { reason: 'test' })
    expect((await op.post(`/api/operator/orgs/${orgId}/enter`, {})).status).toBe(200)
    expect((await op.get('/api/members')).status).toBe(200)
    const dg = api(env, await login(env, 'dg@susp.test'))
    expect((await dg.get('/api/members')).status).toBe(403)
  })
  it('refuse une entreprise inconnue et l’entreprise plateforme', async () => {
    expect((await op.post(`/api/operator/orgs/${crypto.randomUUID()}/enter`, {})).status).toBe(404)
    const platform = (await env.db.query<{ id: string }>(`select id from organisations where kind='platform'`)).rows[0].id
    expect((await op.post(`/api/operator/orgs/${platform}/enter`, {})).status).toBe(404)
  })
})

describe('opérateurs définis par OPERATOR_EMAILS', () => {
  it('sont créés à la première demande de lien, rattachés à l’entreprise plateforme', async () => {
    await env.app.request('/api/auth/request-link', json({ email: 'boss@maintix.test' }))
    const res = await env.app.request('/api/auth/verify', json({ token: tokenFrom(env, 'boss@maintix.test') }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ operator: true, orgKind: 'platform' })
  })
  it('ne peuvent pas être retirés de la console, contrairement aux autres', async () => {
    const boss = api(env, await login(env, 'boss@maintix.test'))
    const list = (await (await op.get('/api/operator/operators')).json()).operators as { userId: string; email: string; fromEnv: boolean }[]
    const b = list.find((o) => o.email === 'boss@maintix.test')!
    expect(b.fromEnv).toBe(true)
    expect(list.find((o) => o.email === 'ada@a.test')!.fromEnv).toBe(false)
    const r = await op.del(`/api/operator/operators/${b.userId}`)
    expect(r.status).toBe(409)
    expect((await r.json()).error).toBe('env_operator')
    // un opérateur ordinaire peut être retiré
    await createOrg(op, 'X SA', 'x@x.test', 'Xx')
    await op.post('/api/operator/operators', { email: 'x@x.test' })
    const x = ((await (await op.get('/api/operator/operators')).json()).operators as { userId: string; email: string }[]).find((o) => o.email === 'x@x.test')!
    expect((await op.del(`/api/operator/operators/${x.userId}`)).status).toBe(200)
    void boss
  })
})

describe('catalogue des offres', () => {
  const body = { name: 'Premium', maxTechs: 30, maxElevators: 1000, priceMonthly: 150000, extraTechPrice: 3000, extraElevatorPrice: 80, trialDays: null }
  it('liste les offres de départ', async () => {
    const plans = (await (await op.get('/api/operator/plans')).json()).plans as { code: string }[]
    expect(plans.map((p) => p.code)).toEqual(['essai', 'essentiel', 'pro', 'sur-mesure', 'interne'])
  })
  it('crée, modifie et utilise une offre pour une entreprise', async () => {
    expect((await op.post('/api/operator/plans', { code: 'premium', ...body })).status).toBe(201)
    expect((await op.post('/api/operator/plans', { code: 'premium', ...body })).status).toBe(409)
    expect((await op.post('/api/operator/plans', { code: 'Pas valide!', ...body })).status).toBe(400)
    expect((await op.put('/api/operator/plans/premium', { ...body, priceMonthly: 160000 })).status).toBe(200)
    const orgId = await createOrg(op, 'Grande SA', 'dg@grande.test', 'DG', 'premium')
    const o = (await (await op.get('/api/operator/overview')).json()).orgs.find((x: { id: string }) => x.id === orgId)
    expect(o.offer).toMatchObject({ plan: 'premium', maxTechs: 30, priceMonthly: 160000 })
  })
  it('ne supprime pas une offre utilisée (à archiver) ; supprime une offre libre', async () => {
    await op.post('/api/operator/plans', { code: 'premium', ...body })
    await createOrg(op, 'Grande SA', 'dg@grande.test', 'DG', 'premium')
    const r = await op.del('/api/operator/plans/premium')
    expect(r.status).toBe(409)
    expect((await op.put('/api/operator/plans/premium', { ...body, archived: true })).status).toBe(200)
    await op.post('/api/operator/plans', { code: 'libre', ...body })
    expect((await op.del('/api/operator/plans/libre')).status).toBe(200)
    expect((await op.del('/api/operator/plans/libre')).status).toBe(404)
  })
  it('est réservé aux opérateurs', async () => {
    await createOrg(op, 'Cliente SA', 'dg@cliente.test', 'DG')
    const dg = api(env, await login(env, 'dg@cliente.test'))
    expect((await dg.get('/api/operator/plans')).status).toBe(403)
    expect((await dg.post('/api/operator/plans', { code: 'x-x', ...body })).status).toBe(403)
  })
})

describe('demandes d’accès : notification des opérateurs', () => {
  it('prévient chaque adresse de OPERATOR_EMAILS, même sans compte, avec le gabarit professionnel', async () => {
    const e = await makeEnv({ OPERATOR_EMAILS: 'boss@maintix.test, second@maintix.test' })
    await bootstrap(e, 'ada@a.test')
    const res = await e.app.request('/api/public/signup', json({ company: 'Ascenseurs Diallo', name: 'Awa Diallo', email: 'awa@diallo.test', phone: '+2250700000000', message: 'Bonjour' }))
    expect(res.status).toBe(200)
    const notifs = e.mailer.sent.filter((m) => m.subject === 'Nouvelle demande d\'accès : Ascenseurs Diallo')
    expect(notifs.map((m) => m.to).sort()).toEqual(['ada@a.test', 'boss@maintix.test', 'second@maintix.test'])
    expect(notifs[0].html).toContain('cid:maintix-logo')
    expect(notifs[0].html).toContain('Awa Diallo')
    expect(notifs[0].html).toContain('+2250700000000')
  })
})
