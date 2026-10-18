import { beforeEach, describe, expect, it } from 'vitest'
import { api, bootstrap, invite, makeEnv, push, type Env } from './helpers'

let env: Env
let admin: ReturnType<typeof api>
beforeEach(async () => {
  env = await makeEnv()
  admin = api(env, await bootstrap(env))
})
const audit = async (a: ReturnType<typeof api>, q = '') => (await (await a.get(`/api/audit${q}`)).json()) as { entries: { id: number; action: string; collection: string; docId: string; user: string; detail: Record<string, any> | null }[]; more: boolean } // eslint-disable-line @typescript-eslint/no-explicit-any

describe('historique des modifications', () => {
  it('journalise création puis modification avec ancienne et nouvelle valeur', async () => {
    const job = { id: 'j1', type: 'entretien', elevatorId: 'e1', status: 'planifiee', techId: null, date: '2026-01-01', timeline: [] }
    await push(admin, [{ collection: 'jobs', id: 'j1', data: job }])
    await push(admin, [{ collection: 'jobs', id: 'j1', data: { ...job, status: 'sur_place', techId: 'tA', timeline: [{ at: 'x', label: 'y' }] } }])
    const { entries } = await audit(admin, '?collection=jobs&id=j1')
    expect(entries).toHaveLength(2)
    expect(entries[0].detail!.changed.status).toEqual({ from: 'planifiee', to: 'sur_place' })
    expect(entries[0].detail!.changed.techId).toEqual({ from: null, to: 'tA' })
    expect(entries[0].detail!.changed.timeline).toBe(true) // valeur volumineuse : clé seule
    expect(entries[1].detail).toEqual({ created: true })
    expect(entries[0].user).toBe('Ada Admin')
  })
  it('ne journalise pas les envois identiques ni les photos en clair', async () => {
    const doc = { id: 'c1', name: 'Syndic' }
    await push(admin, [{ collection: 'clients', id: 'c1', data: doc }])
    await push(admin, [{ collection: 'clients', id: 'c1', data: doc }])
    expect((await audit(admin, '?collection=clients&id=c1')).entries).toHaveLength(1)
    const big = { ...doc, note: 'x'.repeat(500) }
    await push(admin, [{ collection: 'clients', id: 'c1', data: big }])
    const e = (await audit(admin, '?collection=clients&id=c1')).entries[0]
    expect(JSON.stringify(e.detail)).not.toContain('xxxxx')
  })
  it('enregistre suppressions, refus de synchronisation et émission de facture', async () => {
    await push(admin, [{ collection: 'clients', id: 'c1', data: { id: 'c1', name: 'S' } }])
    await push(admin, [{ collection: 'clients', id: 'c1', data: null }])
    await push(admin, [{ collection: 'invoices', id: 'f1', data: { id: 'f1', clientId: 'c1', kind: 'libre', lines: [{ label: 'x', qty: 1, unit: 10 }], vatRate: 20, status: 'emise', createdAt: 'x' } }])
    const actions = (await audit(admin)).entries.map((e) => e.action)
    expect(actions).toContain('doc.delete')
    expect(actions).toContain('sync.rejected')
  })
  it('est réservé au bureau, filtrable et paginé', async () => {
    for (let i = 0; i < 5; i++) await push(admin, [{ collection: 'clients', id: `c${i}`, data: { id: `c${i}`, name: `S${i}` } }])
    const tech = api(env, await invite(env, admin, 'tech@x.test', 'tech'))
    expect((await tech.get('/api/audit')).status).toBe(403)
    expect((await env.app.request('/api/audit')).status).toBe(401)
    const page1 = await audit(admin, '?collection=clients&limit=2')
    expect(page1.entries).toHaveLength(2)
    expect(page1.more).toBe(true)
    const page2 = await audit(admin, `?collection=clients&limit=2&before=${page1.entries[1].id}`)
    expect(page2.entries.every((e) => e.id < page1.entries[1].id)).toBe(true)
  })
  it('isole les organisations', async () => {
    await push(admin, [{ collection: 'clients', id: 'c1', data: { id: 'c1', name: 'S' } }])
    const orgB = crypto.randomUUID(), userB = crypto.randomUUID()
    await env.db.query(`insert into organisations (id, name) values ($1,'B')`, [orgB])
    await env.db.query(`insert into users (id, email) values ($1,'b@b.test')`, [userB])
    await env.db.query(`insert into members (user_id, org_id, role, full_name) values ($1,$2,'admin','B')`, [userB, orgB])
    const { login } = await import('./helpers')
    const b = api(env, await login(env, 'b@b.test'))
    expect((await audit(b, '?collection=clients&id=c1')).entries).toEqual([])
  })
})
