import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createApp } from '../src/app'
import { loadConfig } from '../src/config'
import { migrate, pgDb, pgliteDb, type Db } from '../src/db'
import { memoryMailer } from '../src/mailer'
import { sealPayload } from '../../shared/canonical'

export const APP_URL = 'https://cabine.test'

export async function makeEnv(extra: Record<string, string> = {}, deps: Partial<Parameters<typeof createApp>[0]> = {}) {
  // TEST_DATABASE_URL : exécute la même suite contre un vrai Postgres (schéma recréé à chaque test).
  let db: Db
  if (process.env.TEST_DATABASE_URL) {
    db = pgDb(process.env.TEST_DATABASE_URL)
    await db.exec('drop schema public cascade; create schema public;')
  } else db = await pgliteDb()
  await migrate(db, fileURLToPath(new URL('../migrations', import.meta.url)))
  const mailer = memoryMailer()
  const config = loadConfig({ APP_URL, BOOTSTRAP_TOKEN: 'boot-secret', ...extra })
  const app = createApp({ db, config, mailer, ...deps })
  return { db, mailer, app, config }
}
export type Env = Awaited<ReturnType<typeof makeEnv>>

export const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: APP_URL, ...headers },
  body: JSON.stringify(body),
})

export function tokenFrom(env: Env, to: string): string {
  const mail = [...env.mailer.sent].reverse().find((m) => m.to === to)
  const m = mail?.text.match(/token=([\w-]+)/)
  if (!m) throw new Error(`pas de lien pour ${to}`)
  return m[1]
}

/** Connecte `email` (déjà membre) et renvoie le cookie de session. */
export async function login(env: Env, email: string): Promise<string> {
  await env.app.request('/api/auth/request-link', json({ email }))
  const res = await env.app.request('/api/auth/verify', json({ token: tokenFrom(env, email) }))
  if (res.status !== 200) throw new Error(`login ${email}: ${res.status}`)
  return res.headers.get('set-cookie')!.split(';')[0]
}

export async function bootstrap(env: Env, email = 'admin@acme.test') {
  const res = await env.app.request('/api/bootstrap', json({ orgName: 'Acme Ascenseurs', adminEmail: email, adminName: 'Ada Admin' }, { 'x-bootstrap-token': 'boot-secret' }))
  if (res.status !== 200) throw new Error(`bootstrap ${res.status}`)
  return login(env, email)
}

export const api = (env: Env, cookie: string) => ({
  get: (path: string) => env.app.request(path, { headers: { cookie } }),
  post: (path: string, body: unknown) => env.app.request(path, json(body, { cookie })),
  put: (path: string, body: unknown) => env.app.request(path, { ...json(body, { cookie }), method: 'PUT' }),
  fetch: (method: string, path: string, body: unknown) => env.app.request(path, { ...json(body, { cookie }), method }),
  del: (path: string) => env.app.request(path, { method: 'DELETE', headers: { cookie, origin: APP_URL, 'content-type': 'application/json' } }),
})

export const push = (a: ReturnType<typeof api>, ops: { collection: string; id: string; data: Record<string, unknown> | null }[]) =>
  Promise.resolve(a.post('/api/sync/push', { ops })).then((r) => r.json() as Promise<{ results: { ok: boolean; reason?: string; seq?: number }[] }>)

/** Crée un membre via l'API admin et renvoie son cookie. */
export async function invite(env: Env, admin: ReturnType<typeof api>, email: string, role: string, extra: Record<string, unknown> = {}) {
  const r = await admin.post('/api/members', { email, fullName: `Membre ${role}`, role, ...extra })
  if (r.status !== 201) throw new Error(`invite ${await r.text()}`)
  return login(env, email)
}

export const seal = (job: { id: string; elevatorId: string; visit: Record<string, unknown> }) =>
  createHash('sha256').update(sealPayload(job)).digest('hex')

export function closedJob(overrides: Record<string, unknown> = {}) {
  const base = { id: 'j1', type: 'entretien', elevatorId: 'e1', techId: 'T', date: '2026-01-01', status: 'terminee', createdAt: '2026-01-01T00:00:00Z', timeline: [] }
  const visit: Record<string, unknown> = { lockedOut: true, checklist: {}, measures: {}, emergencyCallTest: 'ok', parts: [], minutes: 10, notes: '', summary: 's', finishedAt: '2026-01-01T10:00:00Z', ...(overrides.visit as object) }
  const job = { ...base, ...overrides, visit }
  visit.hash = seal({ id: String(job.id), elevatorId: String(job.elevatorId), visit })
  return job as typeof job & { visit: Record<string, unknown> }
}
export const newId = () => randomUUID()

/** Crée une entreprise via la console opérateur ; `a` doit être un opérateur (le compte d'installation l'est). */
export async function createOrg(a: ReturnType<typeof api>, name: string, adminEmail: string, adminName = 'Admin Client', plan = 'essai') {
  const r = await a.post('/api/operator/orgs', { name, adminName, adminEmail, plan })
  if (r.status !== 201) throw new Error(`createOrg ${r.status} ${await r.text()}`)
  return (await r.json()).orgId as string
}
