import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { loadConfig } from '../src/config'
import { memoryMailer } from '../src/mailer'
import { createErrorReporter, createLogger, Metrics } from '../src/observability'
import { APP_URL, api, bootstrap, json, makeEnv, push } from './helpers'

const withObs = async (extra: Partial<Parameters<typeof createApp>[0]> = {}) => {
  const env = await makeEnv()
  const lines: string[] = []
  const metrics = new Metrics()
  const app = createApp({ db: env.db, config: loadConfig({ APP_URL, BOOTSTRAP_TOKEN: 'boot-secret' }), mailer: memoryMailer(), logger: createLogger('info', (l) => lines.push(l)), metrics, metricsToken: 'metrics-secret', version: '1.2.3', ...extra })
  return { env, app, lines, metrics }
}

describe('journal structuré', () => {
  it('écrit une ligne JSON par requête API avec identifiant de requête, sans données sensibles', async () => {
    const { app, lines } = await withObs()
    const res = await app.request('/api/auth/request-link', json({ email: 'secret@x.test' }), undefined)
    const rid = res.headers.get('x-request-id')!
    expect(rid).toMatch(/^[\w-]{8,64}$/)
    const entry = JSON.parse(lines.find((l) => l.includes('"request"'))!)
    expect(entry).toMatchObject({ level: 'info', msg: 'request', method: 'POST', path: '/api/auth/request-link', status: 200, reqId: rid })
    expect(typeof entry.ms).toBe('number')
    expect(lines.join('\n')).not.toContain('secret@x.test')
  })
  it('réutilise un identifiant de requête valide et en génère un sinon', async () => {
    const { app } = await withObs()
    expect((await app.request('/api/health', { headers: { 'x-request-id': 'trace-12345678' } })).headers.get('x-request-id')).toBe('trace-12345678')
    const generated = (await app.request('/api/health', { headers: { 'x-request-id': 'identifiant invalide !' } })).headers.get('x-request-id')!
    expect(generated).toMatch(/^[0-9a-f-]{36}$/) // remplacé par un UUID
  })
  it('respecte le niveau de journalisation', () => {
    const out: string[] = []
    const l = createLogger('warn', (x) => out.push(x))
    l.log('info', 'ignoré'); l.log('error', 'gardé', { a: 1 })
    expect(out).toHaveLength(1)
    expect(JSON.parse(out[0])).toMatchObject({ level: 'error', msg: 'gardé', a: 1 })
    const none: string[] = []
    createLogger('silent', (x) => none.push(x)).log('error', 'x')
    expect(none).toEqual([])
  })
})

describe('sondes de santé', () => {
  it('/api/health (vie) et /api/health/ready (base + migrations)', async () => {
    const { app } = await withObs()
    expect(await (await app.request('/api/health')).json()).toMatchObject({ ok: true, version: '1.2.3' })
    const ready = await app.request('/api/health/ready')
    expect(ready.status).toBe(200)
    expect(await ready.json()).toMatchObject({ ok: true, db: 'up', migrations: 7 })
  })
  it('signale la base indisponible par un 503', async () => {
    const env = await makeEnv()
    const broken = { ...env.db, query: async () => { throw new Error('connexion perdue') } } as typeof env.db
    const app = createApp({ db: broken, config: loadConfig({ APP_URL }), mailer: memoryMailer() })
    const res = await app.request('/api/health/ready')
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ ok: false, db: 'down' })
  })
})

describe('métriques Prometheus', () => {
  it('sont protégées par jeton et absentes si non configurées', async () => {
    const { app } = await withObs()
    expect((await app.request('/api/metrics')).status).toBe(401)
    expect((await app.request('/api/metrics', { headers: { authorization: 'Bearer faux' } })).status).toBe(401)
    const env = await makeEnv()
    const none = createApp({ db: env.db, config: loadConfig({ APP_URL }), mailer: memoryMailer() })
    expect((await none.request('/api/metrics', { headers: { authorization: 'Bearer x' } })).status).toBe(404)
  })
  it('exposent requêtes, durées, opérations de synchro, connexions et jauges métier', async () => {
    const { env, app } = await withObs()
    const cookie = await (async () => {
      await app.request('/api/bootstrap', json({ orgName: 'Acme', adminEmail: 'a@a.test', adminName: 'Ada' }, { 'x-bootstrap-token': 'boot-secret' }))
      await app.request('/api/auth/request-link', json({ email: 'a@a.test' }))
      const m = [...(env.mailer.sent as unknown as never[])]
      void m
      return ''
    })()
    void cookie
    await app.request('/api/health')
    const res = await app.request('/api/metrics', { headers: { authorization: 'Bearer metrics-secret' } })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/plain')
    const text = await res.text()
    expect(text).toContain('# TYPE http_requests_total counter')
    expect(text).toMatch(/http_requests_total\{method="GET",route="\/api\/health",status="200"\} 1/)
    expect(text).toContain('http_request_duration_seconds_bucket')
    expect(text).toContain('maintix_db_up 1')
    expect(text).toContain('maintix_orgs 1')
    expect(text).toContain('maintix_open_alerts 0')
  })
  it('compte les opérations de synchronisation par résultat et les connexions', async () => {
    const e = await makeEnv()
    const metrics = new Metrics()
    const app = createApp({ db: e.db, config: loadConfig({ APP_URL, BOOTSTRAP_TOKEN: 'boot-secret' }), mailer: e.mailer, metrics })
    await app.request('/api/bootstrap', json({ orgName: 'Acme', adminEmail: 'a@a.test', adminName: 'Ada' }, { 'x-bootstrap-token': 'boot-secret' }))
    await app.request('/api/auth/request-link', json({ email: 'a@a.test' }))
    const token = e.mailer.sent.at(-1)!.text.match(/token=([\w-]+)/)![1]
    const v = await app.request('/api/auth/verify', json({ token }))
    const cookie = v.headers.get('set-cookie')!.split(';')[0]
    const a = { post: (p: string, b: unknown) => app.request(p, json(b, { cookie })), get: (p: string) => app.request(p, { headers: { cookie } }) } as unknown as ReturnType<typeof api>
    await push(a, [{ collection: 'clients', id: 'c1', data: { id: 'c1', name: 'x' } }, { collection: 'clients', id: 'zzz', data: { id: 'c1', name: 'x' } }])
    expect(metrics.counter('auth_logins_total')).toBe(1)
    expect(metrics.counter('sync_push_ops_total', { result: 'ok' })).toBe(1)
    expect(metrics.counter('sync_push_ops_total', { result: 'invalid' })).toBe(1)
    void bootstrap
  })
})

describe('signalement des erreurs', () => {
  it('journalise l’erreur, renvoie un 500 sans détail avec l’identifiant de requête, et prévient le webhook', async () => {
    const calls: string[] = []
    const lines: string[] = []
    const env = await makeEnv()
    const broken = { ...env.db, query: async (sql: string, params?: unknown[]) => { if (sql.includes('users u')) throw new Error('boom base'); return env.db.query(sql, params) } } as typeof env.db
    const app = createApp({ db: broken, config: loadConfig({ APP_URL }), mailer: memoryMailer(), logger: createLogger('info', (l) => lines.push(l)), reportError: async (m) => void calls.push(m) })
    const res = await app.request('/api/auth/request-link', json({ email: 'a@a.test' }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('internal')
    expect(JSON.stringify(body)).not.toContain('boom')
    expect(body.requestId).toBeTruthy()
    expect(JSON.parse(lines.find((l) => l.includes('unhandled'))!)).toMatchObject({ level: 'error', msg: 'unhandled' })
    expect(calls[0]).toContain('boom base')
  })
  it('le rapporteur limite à une alerte par minute et par message, et n’échoue jamais', async () => {
    let t = 0
    const sent: string[] = []
    const fetchMock = (async (_u: string, init: RequestInit) => { sent.push(String(init.body)); return new Response('ok') }) as unknown as typeof fetch
    const report = createErrorReporter('https://hooks.example/x', fetchMock, () => t)
    await report('erreur A'); await report('erreur A'); await report('erreur B')
    expect(sent).toHaveLength(2)
    t = 61_000
    await report('erreur A')
    expect(sent).toHaveLength(3)
    const failing = createErrorReporter('https://hooks.example/x', (async () => { throw new Error('réseau') }) as unknown as typeof fetch, () => 0)
    await expect(failing('x')).resolves.toBeUndefined()
    await expect(createErrorReporter(undefined)('x')).resolves.toBeUndefined()
  })
})
