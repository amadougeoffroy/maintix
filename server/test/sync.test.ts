import { beforeEach, describe, expect, it } from 'vitest'
import { api, bootstrap, closedJob, invite, json, makeEnv, newId, push, seal, type Env } from './helpers'

let env: Env
let admin: ReturnType<typeof api>
beforeEach(async () => {
  env = await makeEnv()
  admin = api(env, await bootstrap(env))
})

const client = { id: 'c1', name: 'Syndic', kind: 'syndic', contact: '', email: '', phone: '' }
const site = { id: 's1', clientId: 'c1', name: 'Bât A', address: 'x', access: '', risks: '' }
const elevator = { id: 'e1', siteId: 's1', label: 'A1', brand: 'K', model: 'M', serial: 'S', year: 2010, loadKg: 630, stops: 5, machineRoom: 'haut', status: 'ok' }
const pull = async (a: ReturnType<typeof api>, since = 0) => (await a.get(`/api/sync/pull?since=${since}`)).json() as Promise<{ docs: { collection: string; id: string; data: Record<string, unknown> | null; deleted: boolean; seq: number }[]; cursor: number; more: boolean }>

describe('push / pull', () => {
  it('aller-retour avec curseur incrémental', async () => {
    const r = await push(admin, [{ collection: 'clients', id: 'c1', data: client }, { collection: 'sites', id: 's1', data: site }])
    expect(r.results.map((x: { ok: boolean }) => x.ok)).toEqual([true, true])
    const first = await pull(admin)
    expect(first.docs.filter((d) => d.collection !== 'techs').map((d) => d.id)).toEqual(['c1', 's1'])
    await push(admin, [{ collection: 'elevators', id: 'e1', data: elevator }])
    const next = await pull(admin, first.cursor)
    expect(next.docs.map((d) => d.id)).toEqual(['e1'])
    expect((await pull(admin, next.cursor)).docs).toEqual([])
  })
  it('un envoi identique ne fait pas avancer le curseur', async () => {
    await push(admin, [{ collection: 'clients', id: 'c1', data: client }])
    const c0 = (await pull(admin)).cursor
    await push(admin, [{ collection: 'clients', id: 'c1', data: client }])
    expect((await pull(admin, c0)).docs).toEqual([])
  })
  it('pagine avec "more"', async () => {
    await push(admin, Array.from({ length: 5 }, (_, i) => ({ collection: 'clients', id: `c${i}`, data: { ...client, id: `c${i}` } })))
    const page = await (await admin.get('/api/sync/pull?since=0&limit=2')).json()
    expect(page.docs).toHaveLength(2)
    expect(page.more).toBe(true)
  })
  it('les suppressions deviennent des tombstones', async () => {
    await push(admin, [{ collection: 'clients', id: 'c1', data: client }])
    const c0 = (await pull(admin)).cursor
    await push(admin, [{ collection: 'clients', id: 'c1', data: null }])
    const d = (await pull(admin, c0)).docs
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ id: 'c1', deleted: true })
  })
  it('refuse un id incohérent et une collection inconnue', async () => {
    const r = await push(admin, [{ collection: 'clients', id: 'zzz', data: client }])
    expect(r.results[0]).toMatchObject({ ok: false, reason: 'invalid' })
    expect((await admin.post('/api/sync/push', { ops: [{ collection: 'users', id: 'x', data: {} }] })).status).toBe(400)
  })
  it('isole les organisations', async () => {
    await push(admin, [{ collection: 'clients', id: 'c1', data: client }])
    const orgB = newId(), userB = newId()
    await env.db.query(`insert into organisations (id, name) values ($1,'Autre')`, [orgB])
    await env.db.query(`insert into users (id, email) values ($1,'b@autre.test')`, [userB])
    await env.db.query(`insert into members (user_id, org_id, role, full_name) values ($1,$2,'admin','B')`, [userB, orgB])
    const b = api(env, await (async () => {
      await env.app.request('/api/auth/request-link', json({ email: 'b@autre.test' }))
      const t = env.mailer.sent.at(-1)!.text.match(/token=([\w-]+)/)![1]
      const res = await env.app.request('/api/auth/verify', json({ token: t }))
      return res.headers.get('set-cookie')!.split(';')[0]
    })())
    expect((await pull(b)).docs).toEqual([])
    await push(b, [{ collection: 'clients', id: 'c1', data: { ...client, name: 'Autre orga' } }])
    expect((await pull(admin)).docs.find((d) => d.id === 'c1')!.data).toMatchObject({ name: 'Syndic' })
  })
})

describe('droits par rôle', () => {
  it('un technicien écrit ses missions, pas les clients ni les missions des autres', async () => {
    await push(admin, [{ collection: 'elevators', id: 'e1', data: elevator }])
    const tech = api(env, await invite(env, admin, 'moussa@acme.test', 'tech'))
    const me = await (await tech.get('/api/auth/session')).json()
    const mine = { id: 'j1', type: 'entretien', elevatorId: 'e1', techId: me.techId, date: '2026-01-01', status: 'planifiee', createdAt: 'x', timeline: [] }
    expect((await push(tech, [{ collection: 'jobs', id: 'j1', data: mine }])).results[0].ok).toBe(true)
    expect((await push(tech, [{ collection: 'clients', id: 'c9', data: { ...client, id: 'c9' } }])).results[0]).toMatchObject({ ok: false, reason: 'forbidden' })
    await push(admin, [{ collection: 'jobs', id: 'j2', data: { ...mine, id: 'j2', techId: 'autre' } }])
    expect((await push(tech, [{ collection: 'jobs', id: 'j2', data: { ...mine, id: 'j2', techId: me.techId } }])).results[0].reason).toBe('forbidden')
    expect((await push(tech, [{ collection: 'jobs', id: 'j1', data: null }])).results[0].reason).toBe('forbidden')
  })
  it('un technicien ne modifie que le statut et la dernière visite d’un appareil', async () => {
    await push(admin, [{ collection: 'elevators', id: 'e1', data: elevator }])
    const tech = api(env, await invite(env, admin, 'moussa@acme.test', 'tech'))
    expect((await push(tech, [{ collection: 'elevators', id: 'e1', data: { ...elevator, status: 'panne', lastVisit: '2026-02-01' } }])).results[0].ok).toBe(true)
    expect((await push(tech, [{ collection: 'elevators', id: 'e1', data: { ...elevator, brand: 'Piraté' } }])).results[0].reason).toBe('forbidden')
  })
  it('un client voit uniquement son périmètre et peut accepter un devis envoyé', async () => {
    await push(admin, [
      { collection: 'clients', id: 'c1', data: client },
      { collection: 'clients', id: 'c2', data: { ...client, id: 'c2', name: 'Autre client' } },
      { collection: 'sites', id: 's1', data: site },
      { collection: 'sites', id: 's2', data: { ...site, id: 's2', clientId: 'c2' } },
      { collection: 'elevators', id: 'e1', data: elevator },
      { collection: 'elevators', id: 'e2', data: { ...elevator, id: 'e2', siteId: 's2' } },
      { collection: 'quotes', id: 'q1', data: { id: 'q1', clientId: 'c1', elevatorId: 'e1', lines: [], status: 'envoye', createdAt: 'x' } },
      { collection: 'quotes', id: 'q2', data: { id: 'q2', clientId: 'c1', elevatorId: 'e1', lines: [], status: 'brouillon', createdAt: 'x' } },
      { collection: 'techs', id: 't9', data: { id: 't9', name: 'Tech', role: 'tech', certs: [{ label: 'secret', expires: '2030-01-01' }] } },
    ])
    const cl = api(env, await invite(env, admin, 'syndic@client.test', 'client', { clientId: 'c1' }))
    const docs = (await pull(cl)).docs
    const ids = docs.map((d) => `${d.collection}:${d.id}`)
    expect(ids).toEqual(expect.arrayContaining(['clients:c1', 'sites:s1', 'elevators:e1', 'quotes:q1']))
    expect(ids).not.toContain('clients:c2')
    expect(ids).not.toContain('elevators:e2')
    expect(ids).not.toContain('quotes:q2')
    expect(docs.find((d) => d.id === 't9')!.data).toMatchObject({ certs: [] })
    const accepted = { id: 'q1', clientId: 'c1', elevatorId: 'e1', lines: [], status: 'accepte', createdAt: 'x' }
    expect((await push(cl, [{ collection: 'quotes', id: 'q1', data: accepted }])).results[0].ok).toBe(true)
    expect((await push(cl, [{ collection: 'quotes', id: 'q1', data: { ...accepted, lines: [{ label: 'x', qty: 1, unit: 0 }] } }])).results[0].ok).toBe(false)
    expect((await push(cl, [{ collection: 'clients', id: 'c1', data: { ...client, name: 'Piraté' } }])).results[0].reason).toBe('forbidden')
  })
})

describe('rapports scellés', () => {
  it('accepte un rapport dont le sceau est correct', async () => {
    const job = closedJob()
    expect((await push(admin, [{ collection: 'jobs', id: 'j1', data: job }])).results[0].ok).toBe(true)
  })
  it('rejette un sceau incorrect ou absent', async () => {
    const job = closedJob()
    const bad = { ...job, visit: { ...job.visit, minutes: 999 } }
    expect((await push(admin, [{ collection: 'jobs', id: 'j1', data: bad }])).results[0].reason).toBe('bad_hash')
    const noHash = { ...job, visit: { ...job.visit, hash: undefined } }
    expect((await push(admin, [{ collection: 'jobs', id: 'j1', data: noHash }])).results[0].reason).toBe('bad_hash')
  })
  it('le sceau reste valide après un passage par jsonb (ordre des clés modifié)', async () => {
    const job = closedJob({ visit: { measures: { zz: '1', aa: '2' }, checklist: { b: { status: 'ok', photos: [] }, a: { status: 'ko', photos: ['p'] } } } })
    await push(admin, [{ collection: 'jobs', id: 'j1', data: job }])
    const stored = (await pull(admin)).docs.find((d) => d.id === 'j1')!.data as typeof job
    expect(seal(stored)).toBe(stored.visit.hash)
  })
  it('un rapport clôturé est immuable sauf la date d’envoi', async () => {
    const job = closedJob()
    await push(admin, [{ collection: 'jobs', id: 'j1', data: job }])
    const edited = closedJob({ visit: { notes: 'modifié après coup' } })
    expect((await push(admin, [{ collection: 'jobs', id: 'j1', data: edited }])).results[0].reason).toBe('immutable')
    expect((await push(admin, [{ collection: 'jobs', id: 'j1', data: { ...job, status: 'sur_place' } }])).results[0].reason).toBe('immutable')
    expect((await push(admin, [{ collection: 'jobs', id: 'j1', data: null }])).results[0].reason).toBe('immutable')
    const sent = { ...job, visit: { ...job.visit, sentAt: '2026-01-02T00:00:00Z' } }
    expect((await push(admin, [{ collection: 'jobs', id: 'j1', data: sent }])).results[0].ok).toBe(true)
  })
})

describe('API publique (QR)', () => {
  const setup = async () => {
    await push(admin, [
      { collection: 'sites', id: 's1', data: site },
      { collection: 'elevators', id: 'e1', data: elevator },
      { collection: 'techs', id: 'tA', data: { id: 'tA', name: 'Moussa', role: 'tech', certs: [] } },
      { collection: 'onCall', id: '2020-01-06', data: { weekStart: '2020-01-06', techId: 'tA' } },
    ])
  }
  it('crée un dépannage affecté à l’astreinte et marque l’appareil en panne', async () => {
    await setup()
    const res = await env.app.request('/api/public/report', json({ elevatorId: 'e1', description: 'Bloqué', trapped: true, reporter: 'Passant' }))
    expect(res.status).toBe(201)
    const docs = (await pull(admin)).docs
    const job = docs.find((d) => d.collection === 'jobs')!.data as { techId: string; trapped: boolean; timeline: { label: string }[] }
    expect(job.techId).toBe('tA')
    expect(job.trapped).toBe(true)
    expect(job.timeline.map((t) => t.label).join('|')).toContain('PERSONNE BLOQUÉE')
    expect(docs.find((d) => d.id === 'e1')!.data).toMatchObject({ status: 'panne' })
  })
  it('expose un statut minimal sans authentification', async () => {
    await setup()
    await env.app.request('/api/public/report', json({ elevatorId: 'e1', description: 'x', trapped: false, reporter: '' }))
    const res = await env.app.request('/api/public/status/e1')
    const body = await res.json()
    expect(body).toMatchObject({ label: 'A1', siteName: 'Bât A', status: 'panne', job: { status: 'planifiee' } })
    expect(JSON.stringify(body)).not.toContain('serial')
    expect((await env.app.request('/api/public/status/inconnu')).status).toBe(404)
  })
  it('refuse un appareil inconnu et limite les abus', async () => {
    await setup()
    expect((await env.app.request('/api/public/report', json({ elevatorId: 'nope' }))).status).toBe(404)
    const codes: number[] = []
    for (let i = 0; i < 12; i++) codes.push((await env.app.request('/api/public/report', json({ elevatorId: 'e1', description: 'spam' }))).status)
    expect(codes).toContain(429)
  })
})
