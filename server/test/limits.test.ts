import { beforeEach, describe, expect, it } from 'vitest'
import { api, bootstrap, createOrg, login, makeEnv, push, type Env } from './helpers'

let env: Env
let op: ReturnType<typeof api>
beforeEach(async () => {
  env = await makeEnv()
  op = api(env, await bootstrap(env, 'ada@a.test'))
})
const elevator = (id: string) => ({ collection: 'elevators', id, data: { id, siteId: 's1', label: id, status: 'ok' } })
const setLimits = (id: string, techs: number | null, elevators: number | null, mode: 'bill' | 'block') =>
  env.db.query('update organisations set max_techs = $2, max_elevators = $3, overage_mode = $4 where id = $1', [id, techs, elevators, mode])

describe('plafonds : mode bloquant', () => {
  it('refuse l’invitation d’un technicien au-delà du plafond, avec le détail', async () => {
    const id = await createOrg(op, 'Cliente SA', 'dg@c.test', 'DG')
    await setLimits(id, 2, null, 'block')
    const dg = api(env, await login(env, 'dg@c.test'))
    expect((await dg.post('/api/members', { email: 't1@c.test', fullName: 'Tech Un', role: 'tech' })).status).toBe(201)
    expect((await dg.post('/api/members', { email: 't2@c.test', fullName: 'Tech Deux', role: 'tech' })).status).toBe(201)
    const r = await dg.post('/api/members', { email: 't3@c.test', fullName: 'Tech Trois', role: 'tech' })
    expect(r.status).toBe(403)
    expect(await r.json()).toMatchObject({ error: 'plan_limit', kind: 'techs', max: 2, current: 2 })
    // les autres rôles ne sont pas concernés par le plafond de techniciens
    expect((await dg.post('/api/members', { email: 'b@c.test', fullName: 'Bureau Un', role: 'bureau' })).status).toBe(201)
  })
  it('refuse la création d’appareils au-delà du plafond, sans les enregistrer', async () => {
    const id = await createOrg(op, 'Cliente SA', 'dg@c.test', 'DG')
    await setLimits(id, null, 2, 'block')
    const dg = api(env, await login(env, 'dg@c.test'))
    const r = await push(dg, [elevator('e1'), elevator('e2'), elevator('e3'), elevator('e4')])
    expect(r.results.map((x) => x.ok)).toEqual([true, true, false, false])
    expect(r.results[2].reason).toBe('plan_limit_elevators')
    const stored = (await env.db.query<{ id: string }>(`select id from docs where org_id = $1 and collection = 'elevators' and not deleted order by id`, [id])).rows
    expect(stored.map((x) => x.id)).toEqual(['e1', 'e2'])
    // modifier un appareil existant reste possible
    expect((await push(dg, [{ collection: 'elevators', id: 'e1', data: { id: 'e1', siteId: 's1', label: 'Renommé', status: 'ok' } }])).results[0].ok).toBe(true)
    // supprimer libère une place
    await push(dg, [{ collection: 'elevators', id: 'e2', data: null }])
    expect((await push(dg, [elevator('e5')])).results[0].ok).toBe(true)
  })
  it('un plafond vide (illimité) ne bloque jamais', async () => {
    const id = await createOrg(op, 'Cliente SA', 'dg@c.test', 'DG')
    await setLimits(id, null, null, 'block')
    const dg = api(env, await login(env, 'dg@c.test'))
    expect((await push(dg, [elevator('e1'), elevator('e2')])).results.every((x) => x.ok)).toBe(true)
  })
})

describe('plafonds : mode facturé', () => {
  it('laisse ajouter au-delà du plafond (le dépassement est facturé)', async () => {
    const id = await createOrg(op, 'Cliente SA', 'dg@c.test', 'DG', 'essentiel')
    await setLimits(id, 1, 1, 'bill')
    const dg = api(env, await login(env, 'dg@c.test'))
    expect((await dg.post('/api/members', { email: 't1@c.test', fullName: 'Tech Un', role: 'tech' })).status).toBe(201)
    expect((await dg.post('/api/members', { email: 't2@c.test', fullName: 'Tech Deux', role: 'tech' })).status).toBe(201)
    expect((await push(dg, [elevator('e1'), elevator('e2')])).results.every((x) => x.ok)).toBe(true)
    const plan = await (await dg.get('/api/org/plan')).json()
    expect(plan.offer.overageMode).toBe('bill')
    expect(plan.estimate.overTechs).toBe(1)
  })
})

describe('mode de dépassement par offre', () => {
  const body = { name: 'Ferme', maxTechs: 2, maxElevators: 5, priceMonthly: 20000, extraTechPrice: 0, extraElevatorPrice: 0, trialDays: null }
  it('l’essai est bloquant, les offres payantes facturent, et le catalogue le permet', async () => {
    const plans = (await (await op.get('/api/operator/plans')).json()).plans as { code: string; overageMode: string }[]
    expect(Object.fromEntries(plans.map((p) => [p.code, p.overageMode]))).toMatchObject({ essai: 'block', essentiel: 'bill', pro: 'bill' })
    expect((await op.post('/api/operator/plans', { code: 'ferme', ...body, overageMode: 'block' })).status).toBe(201)
    const created = (await (await op.get('/api/operator/plans')).json()).plans.find((p: { code: string }) => p.code === 'ferme')
    expect(created.overageMode).toBe('block')
    expect((await op.put('/api/operator/plans/ferme', { ...body, overageMode: 'bill' })).status).toBe(200)
  })
  it('est copié sur l’entreprise à la création, à l’offre manuelle et au paiement', async () => {
    await op.post('/api/operator/plans', { code: 'ferme', ...body, overageMode: 'block' })
    const id = await createOrg(op, 'Cliente SA', 'dg@c.test', 'DG', 'ferme')
    const mode = async () => (await env.db.query<{ overage_mode: string }>('select overage_mode from organisations where id = $1', [id])).rows[0].overage_mode
    expect(await mode()).toBe('block')
    const off = { plan: 'essentiel', maxTechs: 5, maxElevators: 100, priceMonthly: 35000, extraTechPrice: 0, extraElevatorPrice: 0, notes: '' }
    expect((await op.post(`/api/operator/orgs/${id}/offer`, { ...off, overageMode: 'bill' })).status).toBe(200)
    expect(await mode()).toBe('bill')
    await op.post(`/api/operator/orgs/${id}/payments`, { plan: 'ferme', months: 1 }) // un paiement applique l'offre et son mode
    expect(await mode()).toBe('block')
  })
  it('un essai gratuit est limité à 3 techniciens et 25 appareils', async () => {
    const id = await createOrg(op, 'Essai SA', 'dg@e.test', 'DG')
    const dg = api(env, await login(env, 'dg@e.test'))
    for (let i = 1; i <= 3; i++) expect((await dg.post('/api/members', { email: `t${i}@e.test`, fullName: `Tech ${i}`, role: 'tech' })).status).toBe(201)
    expect((await dg.post('/api/members', { email: 't4@e.test', fullName: 'Tech 4', role: 'tech' })).status).toBe(403)
    void id
  })
})
