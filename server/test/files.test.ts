import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { api, APP_URL, bootstrap, invite, makeEnv, push, type Env } from './helpers'

let env: Env
let admin: ReturnType<typeof api>
let adminCookie: string
beforeEach(async () => {
  env = await makeEnv()
  adminCookie = await bootstrap(env)
  admin = api(env, adminCookie)
})

const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')
const put = (cookie: string, hash: string, body: Buffer, type = 'image/png', origin = APP_URL) =>
  env.app.request(`/api/files/${hash}`, { method: 'PUT', headers: { cookie, 'content-type': type, origin }, body })
const get = (cookie: string, hash: string) => env.app.request(`/api/files/${hash}`, { headers: { cookie } })

describe('fichiers (photos, signatures)', () => {
  it('enregistre et relit un fichier adressé par son empreinte', async () => {
    expect((await put(adminCookie, sha(png), png)).status).toBe(201)
    const res = await get(adminCookie, sha(png))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toContain('immutable')
    expect(Buffer.from(await res.arrayBuffer()).equals(png)).toBe(true)
  })
  it('est idempotent', async () => {
    expect((await put(adminCookie, sha(png), png)).status).toBe(201)
    expect((await put(adminCookie, sha(png), png)).status).toBe(201)
    expect((await env.db.query('select count(*)::int as n from files')).rows[0]).toMatchObject({ n: 1 })
  })
  it('refuse une empreinte qui ne correspond pas au contenu', async () => {
    expect((await put(adminCookie, 'a'.repeat(64), png)).status).toBe(400)
  })
  it('refuse un type non image, une origine étrangère et une taille excessive', async () => {
    expect((await put(adminCookie, sha(png), png, 'text/html')).status).toBe(415)
    expect((await put(adminCookie, sha(png), png, 'image/png', 'https://evil.test')).status).toBe(403)
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 1)
    expect((await put(adminCookie, sha(big), big)).status).toBe(413)
  })
  it('exige une session et isole les organisations', async () => {
    expect((await env.app.request(`/api/files/${sha(png)}`)).status).toBe(401)
    await put(adminCookie, sha(png), png)
    const orgB = crypto.randomUUID(), userB = crypto.randomUUID()
    await env.db.query(`insert into organisations (id, name) values ($1,'B')`, [orgB])
    await env.db.query(`insert into users (id, email) values ($1,'b@b.test')`, [userB])
    await env.db.query(`insert into members (user_id, org_id, role, full_name) values ($1,$2,'admin','B')`, [userB, orgB])
    const { login } = await import('./helpers')
    const b = await login(env, 'b@b.test')
    expect((await get(b, sha(png))).status).toBe(404)
  })
  it('un client ne lit que les fichiers de ses rapports clôturés', async () => {
    const { closedJob } = await import('./helpers')
    const ref = `file:${sha(png)}`
    await put(adminCookie, sha(png), png)
    const other = Buffer.from('autre', 'utf8')
    await put(adminCookie, sha(other), other, 'image/jpeg')
    const job = closedJob({ id: 'j1', elevatorId: 'e1', visit: { checklist: { a: { status: 'ko', photos: [ref] } } } })
    await push(admin, [
      { collection: 'clients', id: 'c1', data: { id: 'c1', name: 'S' } },
      { collection: 'sites', id: 's1', data: { id: 's1', clientId: 'c1', name: 'B' } },
      { collection: 'elevators', id: 'e1', data: { id: 'e1', siteId: 's1', label: 'A' } },
      { collection: 'jobs', id: 'j1', data: job },
    ])
    const cl = api(env, await invite(env, admin, 'syndic@c.test', 'client', { clientId: 'c1' }))
    expect((await cl.get(`/api/files/${sha(png)}`)).status).toBe(200)
    expect((await cl.get(`/api/files/${sha(other)}`)).status).toBe(404)
    expect((await put(await (await import('./helpers')).login(env, 'syndic@c.test'), sha(png), png)).status).toBe(403)
  })
})
