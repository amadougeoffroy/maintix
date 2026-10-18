import { beforeEach, describe, expect, it } from 'vitest'
import { api, bootstrap, createOrg, invite, login, makeEnv, type Env } from './helpers'

let env: Env
let op: ReturnType<typeof api>
beforeEach(async () => {
  env = await makeEnv()
  op = api(env, await bootstrap(env, 'ada@a.test'))
})

describe('un compte, une entreprise', () => {
  it('la bascule d’entreprise et la liste des entreprises n’existent plus pour personne', async () => {
    const orgId = await createOrg(op, 'Cliente SA', 'dg@cliente.test', 'Directeur')
    const dg = api(env, await login(env, 'dg@cliente.test'))
    expect((await dg.post('/api/auth/switch-org', { orgId })).status).toBe(404)
    expect((await dg.get('/api/orgs')).status).toBe(404)
    expect((await op.get('/api/orgs')).status).toBe(404)
  })
  it('un administrateur d’entreprise ne peut ni créer d’entreprise ni entrer dans une autre', async () => {
    const other = await createOrg(op, 'Autre SA', 'dg@autre.test', 'Autre')
    await createOrg(op, 'Cliente SA', 'dg@cliente.test', 'Directeur')
    const dg = api(env, await login(env, 'dg@cliente.test'))
    expect((await dg.post('/api/orgs', { name: 'Pirate' })).status).toBe(404)
    expect((await dg.post('/api/operator/orgs', { name: 'Pirate', adminName: 'Pirate X', adminEmail: 'p@x.test' })).status).toBe(403)
    expect((await dg.post(`/api/operator/orgs/${other}/enter`, {})).status).toBe(403)
    expect((await dg.post('/api/operator/leave', {})).status).toBe(403)
    const tech = api(env, await invite(env, dg, 'tech@cliente.test', 'tech'))
    expect((await tech.post('/api/operator/orgs', { name: 'Pirate', adminName: 'Pirate X', adminEmail: 'p@x.test' })).status).toBe(403)
  })
  it('refuse d’inviter une adresse qui appartient déjà à une autre entreprise', async () => {
    await createOrg(op, 'A SA', 'dg@a.test', 'DG A')
    await createOrg(op, 'B SA', 'dg@b.test', 'DG B')
    const dgA = api(env, await login(env, 'dg@a.test'))
    const r = await dgA.post('/api/members', { email: 'dg@b.test', fullName: 'DG B', role: 'bureau' })
    expect(r.status).toBe(409)
    expect((await r.json()).error).toBe('in_other_org')
  })
})
