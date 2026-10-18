import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { serveStatic } from '@hono/node-server/serve-static'
import { z } from 'zod'
import { canonicalJson } from '../../shared/canonical'
import {
  consumeLoginToken, createLoginToken, createRateLimiter, createSession, deleteSession, principalFromSession, randomToken, sha256,
  type Principal, type Role,
} from './auth'
import type { Config } from './config'
import type { Db } from './db'
import type { Mailer } from './mailer'
import { checkWrite, COLLECTIONS, docKey, type Collection, type Doc } from './rules'
import { buildInvoicePdf, buildReportPdf } from './pdf'
import type { Notifier } from './notify'
import { Metrics, newRequestId, silentLogger, type Logger } from './observability'
import { totals } from '../../shared/money'
import { sealPayload } from '../../shared/canonical'

export interface Deps {
  db: Db
  config: Config
  mailer: Mailer
  notifier?: Notifier
  logger?: Logger
  metrics?: Metrics
  metricsToken?: string
  reportError?: (msg: string) => Promise<void>
  version?: string
  now?: () => number
}
type Env = { Variables: { who: Principal } }

const COOKIE_PLAIN = 'cabine_session'

/** Résumé compact d'une modification : clés changées, avec ancienne et nouvelle valeur pour les valeurs courtes. */
export function summarize(before: Doc | null, after: Doc, created: boolean) {
  if (created || !before) return { created: true }
  const changed: Record<string, { from?: unknown; to?: unknown } | true> = {}
  const short = (v: unknown) => (v === null || ['string', 'number', 'boolean'].includes(typeof v)) && String(v ?? '').length <= 80
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (canonicalJson(before[k] ?? null) === canonicalJson(after[k] ?? null)) continue
    if (Object.keys(changed).length >= 20) break
    changed[k] = short(before[k] ?? null) && short(after[k] ?? null) ? { from: before[k] ?? null, to: after[k] ?? null } : true
  }
  return { changed }
}
const FILE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_FILE = 10 * 1024 * 1024
const MAX_DOC = 3 * 1024 * 1024 // un document ne doit plus embarquer d'images (références file:)
const HOUR = 3_600_000
const emailSchema = z.string().trim().toLowerCase().email().max(200)
const today = () => new Date().toISOString().slice(0, 10)
const uid = (p: string) => `${p}_${randomToken().slice(0, 10)}`

export function createApp({ db, config, mailer, notifier, logger = silentLogger, metrics = new Metrics(), metricsToken, reportError, version = process.env.APP_VERSION ?? 'dev', now = Date.now }: Deps) {
  const app = new Hono<Env>()
  // En https : préfixe __Host- (cookie lié à l'hôte exact, Secure, sans Domain).
  const COOKIE = config.secureCookies ? `__Host-${COOKIE_PLAIN}` : COOKIE_PLAIN
  const limit = createRateLimiter(db, now)
  const ip = (c: Context) => (config.trustProxy ? c.req.header('x-forwarded-for')?.split(',')[0].trim() : undefined) ?? 'local'
  const audit = (orgId: string, userId: string | null, action: string, collection?: string, docId?: string, detail?: unknown, exec: Pick<Db, 'query'> = db) =>
    exec.query('insert into audit_log (org_id, user_id, action, collection, doc_id, detail) values ($1,$2,$3,$4,$5,$6)', [
      orgId, userId, action, collection ?? null, docId ?? null, detail === undefined ? null : JSON.stringify(detail),
    ])

  app.use('*', async (c, next) => {
    const started = performance.now()
    const rid = newRequestId(c.req.header('x-request-id'))
    c.header('x-request-id', rid)
    await next()
    const ms = performance.now() - started
    const route = c.req.routePath === '/*' || c.req.routePath === '*' ? 'static' : c.req.routePath
    const status = c.res.status
    metrics.inc('http_requests_total', { method: c.req.method, route, status })
    metrics.observe('http_request_duration_seconds', ms / 1000, { route })
    if (status === 429) metrics.inc('rate_limited_total', { route })
    if (c.req.path.startsWith('/api/') && c.req.path !== '/api/health') {
      logger.log(status >= 500 ? 'error' : 'info', 'request', { reqId: rid, method: c.req.method, path: c.req.path, status, ms: Math.round(ms), ip: ip(c) })
    }
    const h = c.res.headers
    h.set('x-content-type-options', 'nosniff')
    h.set('x-frame-options', 'DENY')
    h.set('referrer-policy', 'strict-origin-when-cross-origin')
    h.set('permissions-policy', 'camera=(self), microphone=(self), geolocation=(), payment=()')
    h.set('cross-origin-opener-policy', 'same-origin')
    h.set('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'")
    if (config.secureCookies) h.set('strict-transport-security', 'max-age=31536000; includeSubDomains')
    if (c.req.path.startsWith('/api/') && !h.has('cache-control')) h.set('cache-control', 'no-store')
  })
  app.use('/api/*', bodyLimit({ maxSize: 25 * 1024 * 1024 }))
  // Défense CSRF : les écritures exigent du JSON et, si un Origin est présent, celui de l'application.
  app.use('/api/*', async (c, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
      const origin = c.req.header('origin')
      if (origin && origin !== new URL(config.appUrl).origin) return c.json({ error: 'origin' }, 403)
      const isFileUpload = c.req.method === 'PUT' && c.req.path.startsWith('/api/files/')
      const ct = c.req.header('content-type') ?? ''
      if (!(isFileUpload ? FILE_MIMES.has(ct.split(';')[0]) : ct.includes('application/json'))) return c.json({ error: 'content_type' }, 415)
    }
    await next()
  })

  const setSessionCookie = (c: Context, token: string) =>
    setCookie(c, COOKIE, token, { httpOnly: true, secure: config.secureCookies, sameSite: 'Lax', path: '/', maxAge: 30 * 86400 })

  const requireAuth = async (c: Context<Env>, next: () => Promise<void>) => {
    const token = getCookie(c, COOKIE)
    const who = token ? await principalFromSession(db, token) : null
    if (!who) return c.json({ error: 'unauthenticated' }, 401)
    c.set('who', who)
    await next()
  }
  const requireRole = (...roles: Role[]) => async (c: Context<Env>, next: () => Promise<void>) =>
    roles.includes(c.get('who').role) ? next() : c.json({ error: 'forbidden' }, 403)

  const sessionView = (w: Principal) => ({
    user: { id: w.userId, email: w.email }, org: { id: w.orgId, name: w.orgName }, role: w.role, fullName: w.fullName, techId: w.techId, clientId: w.clientId,
  })

  async function sendLoginLink(userId: string, email: string) {
    const token = await createLoginToken(db, userId)
    await mailer.send({
      to: email,
      subject: 'Votre lien de connexion Maintix',
      text: `Bonjour,\n\nCliquez pour vous connecter (valable 15 minutes, usage unique) :\n${config.appUrl}/#/auth?token=${token}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
    })
  }

  /* ---------- santé ---------- */
  app.get('/api/health', (c) => c.json({ ok: true, mode: 'server', version }))
  /** Disponibilité réelle : la base répond et les migrations sont appliquées. À utiliser pour les sondes d'orchestration. */
  app.get('/api/health/ready', async (c) => {
    try {
      const m = (await db.query<{ n: number }>('select count(*)::int as n from schema_migrations')).rows[0].n
      return c.json({ ok: true, db: 'up', migrations: m, version })
    } catch {
      return c.json({ ok: false, db: 'down', version }, 503)
    }
  })
  metrics.gauge('maintix_open_alerts', async () => (await db.query<{ n: number }>('select count(*)::int as n from alerts where acked_at is null')).rows[0].n)
  metrics.gauge('maintix_db_up', async () => { await db.query('select 1'); return 1 })
  metrics.gauge('maintix_orgs', async () => (await db.query<{ n: number }>('select count(*)::int as n from organisations')).rows[0].n)
  app.get('/api/metrics', async (c) => {
    const given = c.req.header('authorization')?.replace(/^Bearer /, '') ?? ''
    if (!metricsToken) return c.json({ error: 'not_found' }, 404)
    if (given.length !== metricsToken.length || !timingSafeEqual(Buffer.from(given), Buffer.from(metricsToken))) return c.json({ error: 'unauthenticated' }, 401)
    return new Response(await metrics.render(), { headers: { 'content-type': 'text/plain; version=0.0.4' } })
  })

  /* ---------- installation initiale ---------- */
  app.post('/api/bootstrap', async (c) => {
    const parsed = z.object({ orgName: z.string().trim().min(2).max(120), adminEmail: emailSchema, adminName: z.string().trim().min(2).max(120) }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid' }, 400)
    const given = c.req.header('x-bootstrap-token')
    const tokenOk = !!config.bootstrapToken && !!given && given.length === config.bootstrapToken.length && timingSafeEqual(Buffer.from(given), Buffer.from(config.bootstrapToken))
    if (!tokenOk) return c.json({ error: 'forbidden' }, 403)
    const { orgName, adminEmail, adminName } = parsed.data
    const orgId = randomUUID()
    const userId = randomUUID()
    const techId = uid('t')
    const created = await db.tx(async (t) => {
      await t.query('lock table organisations in exclusive mode') // évite deux installations simultanées
      if ((await t.query('select 1 from organisations limit 1')).rows.length) return false
      await t.query('insert into organisations (id, name) values ($1,$2)', [orgId, orgName])
      await t.query('insert into users (id, email) values ($1,$2)', [userId, adminEmail])
      await t.query(`insert into members (user_id, org_id, role, full_name, tech_id) values ($1,$2,'admin',$3,$4)`, [userId, orgId, adminName, techId])
      await t.query(`insert into docs (org_id, collection, id, data, updated_by) values ($1,'techs',$2,$3,$4)`, [orgId, techId, JSON.stringify({ id: techId, name: adminName, role: 'bureau', certs: [] }), userId])
      return true
    })
    if (!created) return c.json({ error: 'already_initialised' }, 409)
    await audit(orgId, userId, 'bootstrap')
    await sendLoginLink(userId, adminEmail)
    return c.json({ ok: true })
  })

  /* ---------- authentification par lien magique ---------- */
  app.post('/api/auth/request-link', async (c) => {
    const parsed = z.object({ email: emailSchema }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid' }, 400)
    if (!(await limit(`ip:${ip(c)}`, 20, HOUR)) || !(await limit(`email:${parsed.data.email}`, 5, HOUR))) return c.json({ error: 'rate_limited' }, 429)
    const u = await db.query<{ id: string }>('select u.id from users u join members m on m.user_id = u.id where u.email = $1 limit 1', [parsed.data.email])
    if (u.rows[0]) await sendLoginLink(u.rows[0].id, parsed.data.email)
    return c.json({ ok: true }) // même réponse que l'e-mail existe ou non
  })

  app.post('/api/auth/verify', async (c) => {
    const parsed = z.object({ token: z.string().min(20).max(200) }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid' }, 400)
    if (!(await limit(`verify:${ip(c)}`, 30, HOUR))) return c.json({ error: 'rate_limited' }, 429)
    const userId = await consumeLoginToken(db, parsed.data.token)
    if (!userId) return c.json({ error: 'invalid_or_expired' }, 401)
    const m = await db.query<{ org_id: string }>(
      `select m.org_id from members m join users u on u.id = m.user_id where m.user_id = $1 order by (m.org_id = u.last_org_id) desc, m.created_at desc limit 1`, [userId],
    )
    if (!m.rows[0]) return c.json({ error: 'no_membership' }, 403)
    const session = await createSession(db, userId, m.rows[0].org_id)
    setSessionCookie(c, session)
    const who = (await principalFromSession(db, session))!
    metrics.inc('auth_logins_total')
    await audit(who.orgId, who.userId, 'login')
    return c.json(sessionView(who))
  })

  app.get('/api/auth/session', requireAuth, (c) => c.json(sessionView(c.get('who'))))

  app.post('/api/auth/logout', async (c) => {
    const token = getCookie(c, COOKIE)
    if (token) await deleteSession(db, token)
    deleteCookie(c, COOKIE, { path: '/', secure: config.secureCookies })
    return c.json({ ok: true })
  })

  /* ---------- notifications (Web Push, SMS) ---------- */
  app.get('/api/notifications/config', requireAuth, async (c) => {
    const who = c.get('who')
    const subs = (await db.query<{ n: number }>('select count(*)::int as n from push_subscriptions where user_id=$1 and org_id=$2', [who.userId, who.orgId])).rows[0].n
    const m = (await db.query<{ phone: string | null }>('select phone from members where user_id=$1 and org_id=$2', [who.userId, who.orgId])).rows[0]
    return c.json({ publicKey: notifier?.channels.pushEnabled ? config.vapidPublicKey ?? null : null, smsConfigured: !!notifier?.channels.smsEnabled, subscriptions: subs, phone: m?.phone ?? '', escalationMinutes: notifier?.escalationMinutes ?? null })
  })

  app.post('/api/notifications/subscribe', requireAuth, async (c) => {
    const who = c.get('who')
    const parsed = z.object({ endpoint: z.string().url().max(1000).refine((u) => u.startsWith('https://'), 'https requis'), keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(5).max(100) }) }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid' }, 400)
    if (!(await limit(`sub:${who.userId}`, 20, HOUR))) return c.json({ error: 'rate_limited' }, 429)
    const { endpoint, keys } = parsed.data
    await db.query(
      `insert into push_subscriptions (id, user_id, org_id, endpoint, p256dh, auth) values ($1,$2,$3,$4,$5,$6)
       on conflict (endpoint) do update set user_id=$2, org_id=$3, p256dh=$5, auth=$6`,
      [randomUUID(), who.userId, who.orgId, endpoint, keys.p256dh, keys.auth],
    )
    return c.json({ ok: true }, 201)
  })

  app.post('/api/notifications/unsubscribe', requireAuth, async (c) => {
    const who = c.get('who')
    const parsed = z.object({ endpoint: z.string().max(1000) }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid' }, 400)
    await db.query('delete from push_subscriptions where endpoint=$1 and user_id=$2', [parsed.data.endpoint, who.userId])
    return c.json({ ok: true })
  })

  app.post('/api/notifications/phone', requireAuth, async (c) => {
    const who = c.get('who')
    const parsed = z.object({ phone: z.string().trim().regex(/^(\+[1-9]\d{7,14})?$/, 'format E.164 : +33612345678') }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_phone' }, 400)
    await db.query('update members set phone=$3 where user_id=$1 and org_id=$2', [who.userId, who.orgId, parsed.data.phone || null])
    return c.json({ ok: true })
  })

  app.post('/api/notifications/test', requireAuth, async (c) => {
    const who = c.get('who')
    if (!notifier) return c.json({ error: 'not_configured' }, 501)
    if (!(await limit(`ntest:${who.userId}`, 5, HOUR))) return c.json({ error: 'rate_limited' }, 429)
    const subs = (await db.query<{ id: string; endpoint: string; p256dh: string; auth: string }>('select id, endpoint, p256dh, auth from push_subscriptions where user_id=$1 and org_id=$2', [who.userId, who.orgId])).rows
    let sent = 0
    for (const sub of subs) {
      if (await notifier.channels.push(sub, { title: 'Maintix – test', body: 'Les notifications d’astreinte fonctionnent.', url: '/#/tech', tag: 'test' })) sent += 1
      else await db.query('delete from push_subscriptions where id=$1', [sub.id])
    }
    const phone = (await db.query<{ phone: string | null }>('select phone from members where user_id=$1 and org_id=$2', [who.userId, who.orgId])).rows[0]?.phone
    let sms = false
    if (phone && notifier.channels.smsEnabled) { await notifier.channels.sms(phone, 'Maintix : test des notifications d’astreinte.'); sms = true }
    return c.json({ ok: true, push: sent, sms })
  })

  /* ---------- didacticiel (premiers pas) ---------- */
  const ONBOARDING_KEYS = ['welcomeSeen', 'gettingStartedHidden', 'qrDone', 'installDone', 'teamDone'] as const
  app.get('/api/me/onboarding', requireAuth, async (c) => {
    const who = c.get('who')
    const r = await db.query<{ onboarding: Record<string, boolean> }>('select onboarding from members where user_id=$1 and org_id=$2', [who.userId, who.orgId])
    return c.json({ onboarding: r.rows[0]?.onboarding ?? {} })
  })
  app.post('/api/me/onboarding', requireAuth, async (c) => {
    const who = c.get('who')
    const shape = Object.fromEntries(ONBOARDING_KEYS.map((k) => [k, z.boolean().optional()]))
    const parsed = z.object(shape).strict().safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid' }, 400)
    const r = await db.query<{ onboarding: Record<string, boolean> }>(
      `update members set onboarding = onboarding || $3::jsonb where user_id=$1 and org_id=$2 returning onboarding`,
      [who.userId, who.orgId, JSON.stringify(parsed.data)],
    )
    return c.json({ onboarding: r.rows[0]?.onboarding ?? {} })
  })

  /* ---------- plusieurs entreprises ---------- */
  app.get('/api/orgs', requireAuth, async (c) => {
    const who = c.get('who')
    const r = await db.query(
      `select o.id, o.name, m.role, m.full_name as "fullName", (o.id = $2) as current
         from members m join organisations o on o.id = m.org_id where m.user_id = $1 order by o.name`, [who.userId, who.orgId],
    )
    return c.json({ orgs: r.rows })
  })

  app.post('/api/auth/switch-org', requireAuth, async (c) => {
    const who = c.get('who')
    const parsed = z.object({ orgId: z.string().uuid() }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid' }, 400)
    const m = await db.query('select 1 from members where user_id=$1 and org_id=$2', [who.userId, parsed.data.orgId])
    if (!m.rows.length) return c.json({ error: 'forbidden' }, 403)
    const token = getCookie(c, COOKIE)!
    await db.query('update sessions set org_id=$2 where token_hash=$1', [sha256(token), parsed.data.orgId])
    await db.query('update users set last_org_id=$2 where id=$1', [who.userId, parsed.data.orgId])
    const next = (await principalFromSession(db, token))!
    await audit(next.orgId, next.userId, 'org.switch')
    return c.json(sessionView(next))
  })

  /** Un administrateur peut créer une entreprise supplémentaire (dont il devient administrateur). */
  app.post('/api/orgs', requireAuth, requireRole('admin'), async (c) => {
    const who = c.get('who')
    const parsed = z.object({ name: z.string().trim().min(2).max(120) }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid' }, 400)
    if (!(await limit(`org-create:${who.userId}`, 5, 24 * HOUR))) return c.json({ error: 'rate_limited' }, 429)
    const orgId = randomUUID()
    const techId = uid('t')
    await db.tx(async (t) => {
      await t.query('insert into organisations (id, name) values ($1,$2)', [orgId, parsed.data.name])
      await t.query(`insert into members (user_id, org_id, role, full_name, tech_id) values ($1,$2,'admin',$3,$4)`, [who.userId, orgId, who.fullName, techId])
      await t.query(`insert into docs (org_id, collection, id, data, updated_by) values ($1,'techs',$2,$3,$4)`, [orgId, techId, JSON.stringify({ id: techId, name: who.fullName, role: 'bureau', certs: [] }), who.userId])
    })
    await audit(orgId, who.userId, 'org.create')
    return c.json({ ok: true, orgId }, 201)
  })

  /* ---------- membres ---------- */
  app.get('/api/members', requireAuth, requireRole('admin', 'bureau'), async (c) => {
    const r = await db.query(
      `select m.user_id as "userId", u.email, m.role, m.full_name as "fullName", m.tech_id as "techId", m.client_id as "clientId"
         from members m join users u on u.id = m.user_id where m.org_id = $1 order by m.created_at`,
      [c.get('who').orgId],
    )
    return c.json({ members: r.rows })
  })

  app.post('/api/members', requireAuth, requireRole('admin'), async (c) => {
    const who = c.get('who')
    const parsed = z.object({
      email: emailSchema, fullName: z.string().trim().min(2).max(120), role: z.enum(['admin', 'bureau', 'tech', 'client']), clientId: z.string().max(64).optional(),
    }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid' }, 400)
    const { email, fullName, role, clientId } = parsed.data
    if (role === 'client') {
      const cl = await db.query('select 1 from docs where org_id=$1 and collection=$2 and id=$3 and not deleted', [who.orgId, 'clients', clientId ?? ''])
      if (!cl.rows.length) return c.json({ error: 'client_unknown' }, 400)
    }
    const dup = await db.query(`select 1 from members m join users u on u.id=m.user_id where m.org_id=$1 and u.email=$2`, [who.orgId, email])
    if (dup.rows.length) return c.json({ error: 'already_member' }, 409)
    const userId = await db.tx(async (t) => {
      const found = await t.query<{ id: string }>('select id from users where email=$1', [email])
      const id = found.rows[0]?.id ?? randomUUID()
      if (!found.rows[0]) await t.query('insert into users (id, email) values ($1,$2)', [id, email])
      const techId = role === 'client' ? null : uid('t')
      await t.query('insert into members (user_id, org_id, role, full_name, tech_id, client_id) values ($1,$2,$3,$4,$5,$6)', [id, who.orgId, role, fullName, techId, role === 'client' ? clientId : null])
      if (techId) {
        await t.query(`insert into docs (org_id, collection, id, data, updated_by) values ($1,'techs',$2,$3,$4)`, [who.orgId, techId, JSON.stringify({ id: techId, name: fullName, role: role === 'tech' ? 'tech' : 'bureau', certs: [] }), who.userId])
      }
      return id
    })
    await audit(who.orgId, who.userId, 'member.add', undefined, userId, { email, role })
    await sendLoginLink(userId, email)
    return c.json({ ok: true, userId }, 201)
  })

  app.delete('/api/members/:userId', requireAuth, requireRole('admin'), async (c) => {
    const who = c.get('who')
    const target = c.req.param('userId')
    if (target === who.userId) return c.json({ error: 'cannot_remove_self' }, 400)
    await db.query('delete from members where user_id=$1 and org_id=$2', [target, who.orgId])
    await db.query('delete from sessions where user_id=$1 and org_id=$2', [target, who.orgId])
    await audit(who.orgId, who.userId, 'member.remove', undefined, target)
    return c.json({ ok: true })
  })

  /* ---------- synchronisation ---------- */
  const opSchema = z.object({
    collection: z.enum(COLLECTIONS),
    id: z.string().min(1).max(64),
    data: z.record(z.unknown()).nullable(),
  })

  app.post('/api/sync/push', requireAuth, async (c) => {
    const who = c.get('who')
    const parsed = z.object({ ops: z.array(opSchema).max(200) }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid' }, 400)
    const toNotify: { job: Doc; created: boolean; techChanged: boolean }[] = []
    const results = await db.tx(async (t) => {
      const out: { collection: string; id: string; ok: boolean; seq?: number; reason?: string; doc?: { data: Doc | null; deleted: boolean; seq: number } }[] = []
      for (const op of parsed.data.ops) {
        const col = op.collection as Collection
        const cur = (await t.query<{ data: Doc | null; deleted: boolean; seq: number }>('select data, deleted, seq from docs where org_id=$1 and collection=$2 and id=$3', [who.orgId, col, op.id])).rows[0]
        const existing = cur?.data ?? null
        if (op.data && docKey(col, op.data) !== op.id) { out.push({ collection: col, id: op.id, ok: false, reason: 'invalid' }); continue }
        if (op.data && JSON.stringify(op.data).length > MAX_DOC) { out.push({ collection: col, id: op.id, ok: false, reason: 'too_large' }); continue }
        const verdict = checkWrite(who, col, existing, op.data)
        if (!verdict.ok) {
          out.push({ collection: col, id: op.id, ok: false, reason: verdict.reason, doc: cur })
          await audit(who.orgId, who.userId, 'sync.rejected', col, op.id, { reason: verdict.reason }, t)
          continue
        }
        const unchanged = cur && op.data && !cur.deleted && canonicalJson(cur.data) === canonicalJson(op.data)
        if (unchanged) { out.push({ collection: col, id: op.id, ok: true, seq: cur.seq }); continue }
        const deleting = op.data === null
        const r = await t.query<{ seq: number }>(
          `insert into docs (org_id, collection, id, data, deleted, updated_by) values ($1,$2,$3,$4,$5,$6)
           on conflict (org_id, collection, id) do update
             set data = coalesce($4, docs.data), deleted = $5, seq = nextval('docs_seq'), updated_at = now(), updated_by = $6
           returning seq`,
          [who.orgId, col, op.id, op.data ? JSON.stringify(op.data) : null, deleting, who.userId],
        )
        out.push({ collection: col, id: op.id, ok: true, seq: r.rows[0].seq })
        if (col === 'jobs' && op.data) toNotify.push({ job: op.data, created: !cur, techChanged: !!cur && existing?.techId !== op.data.techId })
        await audit(who.orgId, who.userId, deleting ? 'doc.delete' : 'doc.write', col, op.id, deleting ? undefined : summarize(existing, op.data!, !cur), t)
      }
      return out
    })
    for (const r of results) metrics.inc('sync_push_ops_total', { result: r.ok ? 'ok' : (r.reason ?? 'rejected') })
    // alertes d'astreinte (après validation de la transaction) ; un échec de notification ne doit pas faire échouer la synchro
    if (notifier) {
      for (const n of toNotify) {
        try { if (n.created) await notifier.raise(who.orgId, n.job); else if (n.techChanged) await notifier.reassigned(who.orgId, n.job) } catch (e) { console.error('[notification]', e) }
      }
    }
    return c.json({ results })
  })

  app.get('/api/sync/pull', requireAuth, async (c) => {
    const who = c.get('who')
    const since = Math.max(0, Number(c.req.query('since') ?? 0) || 0)
    const max = Math.min(500, Math.max(1, Number(c.req.query('limit') ?? 300) || 300))
    const params: unknown[] = [who.orgId, since]
    let scope = ''
    if (who.role === 'client') {
      const sites = (await db.query<{ id: string }>(`select id from docs where org_id=$1 and collection='sites' and data->>'clientId'=$2`, [who.orgId, who.clientId])).rows.map((r) => r.id)
      const elevators = sites.length
        ? (await db.query<{ id: string }>(`select id from docs where org_id=$1 and collection='elevators' and data->>'siteId' = any($2::text[])`, [who.orgId, sites])).rows.map((r) => r.id)
        : []
      params.push(who.clientId, elevators)
      scope = `and (
        (collection='clients' and id=$3)
        or (collection='sites' and data->>'clientId'=$3)
        or (collection='elevators' and id = any($4::text[]))
        or (collection='contracts' and data->>'clientId'=$3)
        or (collection='jobs' and data->>'elevatorId' = any($4::text[]) and (data->>'status'='terminee' or data->>'type'='depannage'))
        or (collection='defects' and data->>'elevatorId' = any($4::text[]))
        or (collection='quotes' and data->>'clientId'=$3 and data->>'status' <> 'brouillon')
        or (collection='invoices' and data->>'clientId'=$3 and data->>'status' <> 'brouillon')
        or collection='settings'
        or collection='techs')`
    }
    const rows = (await db.query<{ collection: string; id: string; data: Doc | null; deleted: boolean; seq: number }>(
      `select collection, id, data, deleted, seq from docs where org_id=$1 and seq > $2 ${scope} order by seq limit ${max + 1}`, params,
    )).rows
    const more = rows.length > max
    const page = rows.slice(0, max).map((d) =>
      who.role === 'client' && d.collection === 'techs' && d.data ? { ...d, data: { ...d.data, certs: [] } } : d,
    )
    // Pour un client, le curseur avance au dernier seq renvoyé ; sinon on l'aligne sur la page.
    return c.json({ docs: page, more, cursor: page.length ? page[page.length - 1].seq : since })
  })

  /* ---------- historique des modifications ---------- */
  app.get('/api/audit', requireAuth, requireRole('admin', 'bureau'), async (c) => {
    const who = c.get('who')
    const collection = c.req.query('collection')
    const docId = c.req.query('id')
    const before = Number(c.req.query('before') ?? 0) || 0
    const limitN = Math.min(200, Math.max(1, Number(c.req.query('limit') ?? 50) || 50))
    const params: unknown[] = [who.orgId]
    let where = 'a.org_id = $1'
    if (collection) { params.push(collection); where += ` and a.collection = $${params.length}` }
    if (docId) { params.push(docId); where += ` and a.doc_id = $${params.length}` }
    if (before) { params.push(before); where += ` and a.id < $${params.length}` }
    const rows = (await db.query(
      `select a.id, a.at, a.action, a.collection, a.doc_id as "docId", a.detail, m.full_name as "user"
         from audit_log a left join members m on m.user_id = a.user_id and m.org_id = a.org_id
        where ${where} order by a.id desc limit ${limitN + 1}`, params,
    )).rows
    return c.json({ entries: rows.slice(0, limitN), more: rows.length > limitN })
  })

  /* ---------- fichiers (photos, signatures) ---------- */
  app.put('/api/files/:hash', requireAuth, async (c) => {
    const who = c.get('who')
    if (who.role === 'client') return c.json({ error: 'forbidden' }, 403)
    const hash = c.req.param('hash') ?? ''
    if (!/^[0-9a-f]{64}$/.test(hash)) return c.json({ error: 'invalid' }, 400)
    const mime = (c.req.header('content-type') ?? '').split(';')[0]
    const buf = Buffer.from(await c.req.arrayBuffer())
    if (!buf.length || buf.length > MAX_FILE) return c.json({ error: 'size' }, 413)
    if (createHash('sha256').update(buf).digest('hex') !== hash) return c.json({ error: 'hash_mismatch' }, 400)
    await db.query(
      `insert into files (org_id, hash, mime, size, data, created_by) values ($1,$2,$3,$4,$5,$6) on conflict do nothing`,
      [who.orgId, hash, mime, buf.length, buf, who.userId],
    )
    return c.json({ ok: true }, 201)
  })

  app.get('/api/files/:hash', requireAuth, async (c) => {
    const who = c.get('who')
    const hash = c.req.param('hash') ?? ''
    if (!/^[0-9a-f]{64}$/.test(hash)) return c.json({ error: 'invalid' }, 400)
    if (who.role === 'client') {
      // un client ne lit que les fichiers référencés par les missions de son périmètre
      const sites = (await db.query<{ id: string }>(`select id from docs where org_id=$1 and collection='sites' and data->>'clientId'=$2`, [who.orgId, who.clientId])).rows.map((r) => r.id)
      const els = sites.length ? (await db.query<{ id: string }>(`select id from docs where org_id=$1 and collection='elevators' and data->>'siteId' = any($2::text[])`, [who.orgId, sites])).rows.map((r) => r.id) : []
      const ref = await db.query(`select 1 from docs where org_id=$1 and collection='jobs' and data->>'elevatorId' = any($2::text[]) and data->>'status'='terminee' and position($3 in data::text) > 0 limit 1`, [who.orgId, els, `file:${hash}`])
      if (!ref.rows.length) return c.json({ error: 'not_found' }, 404)
    }
    const r = await db.query<{ mime: string; data: Uint8Array }>('select mime, data from files where org_id=$1 and hash=$2', [who.orgId, hash])
    if (!r.rows[0]) return c.json({ error: 'not_found' }, 404)
    return new Response(Buffer.from(r.rows[0].data), { headers: { 'content-type': r.rows[0].mime, 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } })
  })

  /* ---------- rapports : PDF et envoi par e-mail ---------- */
  async function loadReport(who: Principal, jobId: string) {
    const jr = (await db.query<{ data: Doc }>(`select data from docs where org_id=$1 and collection='jobs' and id=$2 and not deleted`, [who.orgId, jobId])).rows[0]
    const job = jr?.data
    if (!job || job.status !== 'terminee') return null
    const one = async (col: string, id: unknown) => (await db.query<{ data: Doc }>(`select data from docs where org_id=$1 and collection=$2 and id=$3`, [who.orgId, col, String(id)])).rows[0]?.data
    const elevator = await one('elevators', job.elevatorId)
    const site = elevator ? await one('sites', elevator.siteId) : undefined
    const client = site ? await one('clients', site.clientId) : undefined
    if (!elevator || !site || !client) return null
    if (who.role === 'client' && client.id !== who.clientId) return null
    if (who.role === 'tech' && job.techId !== who.techId) return null
    const tech = job.techId ? await one('techs', job.techId) : undefined
    const defects = (await db.query<{ data: Doc }>(`select data from docs where org_id=$1 and collection='defects' and data->>'jobId'=$2 and not deleted`, [who.orgId, jobId])).rows.map((r) => r.data)
    return { job, elevator, site, client, tech, defects }
  }

  async function renderReport(who: Principal, jobId: string) {
    const r = await loadReport(who, jobId)
    if (!r) return null
    const v = (r.job.visit ?? {}) as Doc
    const refs = new Set<string>()
    for (const a of Object.values((v.checklist ?? {}) as Record<string, { photos?: string[] }>)) for (const p of a.photos ?? []) if (p.startsWith('file:')) refs.add(p)
    const sig = (v.signature ?? {}) as Doc
    for (const p of [sig.photo, sig.dataUrl]) if (typeof p === 'string' && p.startsWith('file:')) refs.add(p)
    const files = new Map<string, Buffer>()
    for (const ref of refs) {
      const f = (await db.query<{ data: Uint8Array }>('select data from files where org_id=$1 and hash=$2', [who.orgId, ref.slice(5)])).rows[0]
      if (f) files.set(ref, Buffer.from(f.data))
    }
    const sealValid = createHash('sha256').update(sealPayload({ id: String(r.job.id), elevatorId: String(r.job.elevatorId), visit: v })).digest('hex') === v.hash
    const pdf = await buildReportPdf({ ...r, files, sealValid, appUrl: config.appUrl })
    const day = String(v.finishedAt ?? '').slice(0, 10)
    return { pdf, filename: `rapport-${String(r.elevator.label).replace(/[^\w-]+/g, '-')}-${day}.pdf`, ...r }
  }

  app.get('/api/reports/:id/pdf', requireAuth, async (c) => {
    const who = c.get('who')
    if (!(await limit(`pdf:${who.userId}`, 60, HOUR))) return c.json({ error: 'rate_limited' }, 429)
    const out = await renderReport(who, c.req.param('id') ?? '')
    if (!out) return c.json({ error: 'not_found' }, 404)
    return new Response(out.pdf, { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${out.filename}"`, 'cache-control': 'private, no-store' } })
  })

  app.post('/api/reports/:id/send', requireAuth, async (c) => {
    const who = c.get('who')
    if (who.role === 'client') return c.json({ error: 'forbidden' }, 403)
    const parsed = z.object({ to: z.array(emailSchema).max(5).optional(), message: z.string().trim().max(1000).optional() }).safeParse(await c.req.json().catch(() => ({})))
    if (!parsed.success) return c.json({ error: 'invalid' }, 400)
    if (!(await limit(`send:${who.userId}`, 30, HOUR))) return c.json({ error: 'rate_limited' }, 429)
    const out = await renderReport(who, c.req.param('id') ?? '')
    if (!out) return c.json({ error: 'not_found' }, 404)
    const to = parsed.data.to?.length ? parsed.data.to : out.client.email ? [String(out.client.email)] : []
    if (!to.length) return c.json({ error: 'no_recipient' }, 400)
    const v = out.job.visit as Doc
    await mailer.send({
      to,
      subject: `Rapport ${out.job.type === 'depannage' ? 'de dépannage' : 'd’entretien'} – ${out.elevator.label} – ${new Date(String(v.finishedAt)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })}`,
      text: `Bonjour,\n\n${parsed.data.message ? parsed.data.message + '\n\n' : ''}${String(v.summary ?? '')}\n\nLe rapport complet est joint à ce message (PDF scellé).\nConsultation en ligne : ${config.appUrl}/#/report/${out.job.id}\n\nCordialement,\n${who.fullName}`,
      attachments: [{ filename: out.filename, content: out.pdf, contentType: 'application/pdf' }],
    })
    const sentAt = new Date().toISOString()
    // seule la date d'envoi change : elle est exclue du sceau, la règle d'immuabilité l'autorise
    await db.query(`update docs set data = jsonb_set(data, '{visit,sentAt}', to_jsonb($3::text)), seq = nextval('docs_seq'), updated_at = now(), updated_by = $4 where org_id=$1 and collection='jobs' and id=$2`, [who.orgId, out.job.id, sentAt, who.userId])
    await audit(who.orgId, who.userId, 'report.send', 'jobs', String(out.job.id), { to })
    return c.json({ ok: true, sentAt, to })
  })

  /* ---------- factures : émission numérotée, PDF, envoi ---------- */
  const staff = (w: Principal) => w.role === 'admin' || w.role === 'bureau'
  async function invoiceBundle(who: Principal, id: string) {
    const invoice = (await db.query<{ data: Doc }>(`select data from docs where org_id=$1 and collection='invoices' and id=$2 and not deleted`, [who.orgId, id])).rows[0]?.data
    if (!invoice) return null
    if (who.role === 'client' && (invoice.clientId !== who.clientId || invoice.status === 'brouillon')) return null
    if (who.role === 'tech') return null
    const client = (await db.query<{ data: Doc }>(`select data from docs where org_id=$1 and collection='clients' and id=$2`, [who.orgId, String(invoice.clientId)])).rows[0]?.data
    const settings = (await db.query<{ data: Doc }>(`select data from docs where org_id=$1 and collection='settings' and id='org'`, [who.orgId])).rows[0]?.data
    return client ? { invoice, client, settings } : null
  }

  /** Émission : attribue le numéro suivant (sans trou) et fige la facture. Atomique, même en cas d'appels simultanés. */
  app.post('/api/invoices/:id/issue', requireAuth, async (c) => {
    const who = c.get('who')
    if (!staff(who)) return c.json({ error: 'forbidden' }, 403)
    const id = c.req.param('id') ?? ''
    const out = await db.tx(async (t) => {
      const cur = (await t.query<{ data: Doc }>(`select data from docs where org_id=$1 and collection='invoices' and id=$2 and not deleted for update`, [who.orgId, id])).rows[0]?.data
      if (!cur) return { status: 404 as const }
      if (cur.status !== 'brouillon') return { status: 409 as const }
      const lines = (cur.lines as { qty: number; unit: number }[] | undefined) ?? []
      if (!lines.length || totals({ lines, vatRate: Number(cur.vatRate ?? 20) }).ht <= 0) return { status: 422 as const }
      const settings = (await t.query<{ data: Doc }>(`select data from docs where org_id=$1 and collection='settings' and id='org'`, [who.orgId])).rows[0]?.data
      const today = new Date().toISOString().slice(0, 10)
      const year = Number(today.slice(0, 4))
      const n = (await t.query<{ last: number }>(
        `insert into invoice_counters (org_id, year, last) values ($1,$2,1) on conflict (org_id, year) do update set last = invoice_counters.last + 1 returning last`, [who.orgId, year],
      )).rows[0].last
      const due = new Date(today + 'T12:00:00Z')
      due.setUTCDate(due.getUTCDate() + Number(settings?.paymentDays ?? 30))
      const next = { ...cur, status: 'emise', number: `FAC-${year}-${String(n).padStart(4, '0')}`, issuedAt: today, dueAt: due.toISOString().slice(0, 10) }
      await t.query(`update docs set data=$3, seq=nextval('docs_seq'), updated_at=now(), updated_by=$4 where org_id=$1 and collection='invoices' and id=$2`, [who.orgId, id, JSON.stringify(next), who.userId])
      await audit(who.orgId, who.userId, 'invoice.issue', 'invoices', id, { number: next.number }, t)
      return { status: 200 as const, invoice: next }
    })
    if (out.status !== 200) return c.json({ error: out.status === 404 ? 'not_found' : out.status === 409 ? 'already_issued' : 'empty' }, out.status)
    return c.json({ ok: true, invoice: out.invoice })
  })

  app.get('/api/invoices/:id/pdf', requireAuth, async (c) => {
    const who = c.get('who')
    if (!(await limit(`pdf:${who.userId}`, 60, HOUR))) return c.json({ error: 'rate_limited' }, 429)
    const b = await invoiceBundle(who, c.req.param('id') ?? '')
    if (!b) return c.json({ error: 'not_found' }, 404)
    const pdf = await buildInvoicePdf({ ...b, appUrl: config.appUrl })
    return new Response(pdf, { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${String(b.invoice.number ?? 'proforma')}.pdf"`, 'cache-control': 'private, no-store' } })
  })

  app.post('/api/invoices/:id/send', requireAuth, async (c) => {
    const who = c.get('who')
    if (!staff(who)) return c.json({ error: 'forbidden' }, 403)
    const parsed = z.object({ to: z.array(emailSchema).max(5).optional(), message: z.string().trim().max(1000).optional() }).safeParse(await c.req.json().catch(() => ({})))
    if (!parsed.success) return c.json({ error: 'invalid' }, 400)
    if (!(await limit(`send:${who.userId}`, 30, HOUR))) return c.json({ error: 'rate_limited' }, 429)
    const b = await invoiceBundle(who, c.req.param('id') ?? '')
    if (!b || b.invoice.status === 'brouillon') return c.json({ error: 'not_found' }, 404)
    const to = parsed.data.to?.length ? parsed.data.to : b.client.email ? [String(b.client.email)] : []
    if (!to.length) return c.json({ error: 'no_recipient' }, 400)
    const pdf = await buildInvoicePdf({ ...b, appUrl: config.appUrl })
    const t = totals({ lines: (b.invoice.lines as { qty: number; unit: number }[]) ?? [], vatRate: Number(b.invoice.vatRate ?? 20) })
    await mailer.send({
      to,
      subject: `Facture ${b.invoice.number} – ${String(b.settings?.legalName ?? 'Maintix')}`,
      text: `Bonjour,\n\n${parsed.data.message ? parsed.data.message + '\n\n' : ''}Veuillez trouver ci-joint la facture ${b.invoice.number} d'un montant de ${t.ttc.toFixed(2).replace('.', ',')} € TTC, à régler avant le ${String(b.invoice.dueAt).split('-').reverse().join('/')}.\n\nCordialement,\n${who.fullName}`,
      attachments: [{ filename: `${b.invoice.number}.pdf`, content: pdf, contentType: 'application/pdf' }],
    })
    await audit(who.orgId, who.userId, 'invoice.send', 'invoices', String(b.invoice.id), { to })
    return c.json({ ok: true, to })
  })

  /* ---------- API publique (QR code) ---------- */
  async function findElevator(id: string) {
    const r = await db.query<{ org_id: string; data: Doc }>(`select org_id, data from docs where collection='elevators' and id=$1 and not deleted limit 1`, [id])
    return r.rows[0]
  }

  app.post('/api/public/report', async (c) => {
    const parsed = z.object({
      elevatorId: z.string().min(1).max(64), description: z.string().trim().max(500).default(''), trapped: z.boolean().default(false), reporter: z.string().trim().max(80).default(''),
    }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid' }, 400)
    const { elevatorId, description, trapped, reporter } = parsed.data
    if (!(await limit(`report-ip:${ip(c)}`, 10, HOUR)) || !(await limit(`report-el:${elevatorId}`, 20, HOUR))) return c.json({ error: 'rate_limited' }, 429)
    const el = await findElevator(elevatorId)
    if (!el) return c.json({ error: 'not_found' }, 404)
    const onCall = (await db.query<{ data: { techId: string } }>(`select data from docs where org_id=$1 and collection='onCall' and id <= $2 and not deleted order by id desc limit 1`, [el.org_id, today()])).rows[0]
    const tech = onCall ? (await db.query<{ data: { name: string } }>(`select data from docs where org_id=$1 and collection='techs' and id=$2`, [el.org_id, onCall.data.techId])).rows[0] : undefined
    const at = new Date().toISOString()
    const job = {
      id: uid('j'), type: 'depannage', elevatorId, techId: onCall?.data.techId ?? null, date: today(), status: 'planifiee', trapped, description: description || 'Panne signalée',
      reporter: reporter || 'Usager', createdAt: at,
      timeline: [{ at, label: trapped ? 'Signalement reçu : PERSONNE BLOQUÉE' : 'Signalement reçu' }, ...(tech ? [{ at, label: `Astreinte alertée : ${tech.data.name}` }] : [])],
    }
    await db.tx(async (t) => {
      await t.query(`insert into docs (org_id, collection, id, data) values ($1,'jobs',$2,$3)`, [el.org_id, job.id, JSON.stringify(job)])
      await t.query(`update docs set data = $3, seq = nextval('docs_seq'), updated_at = now() where org_id=$1 and collection='elevators' and id=$2`, [el.org_id, elevatorId, JSON.stringify({ ...el.data, status: 'panne' })])
    })
    await audit(el.org_id, null, 'public.report', 'jobs', job.id, { trapped })
    try { await notifier?.raise(el.org_id, job) } catch (e) { console.error('[notification]', e) }
    return c.json({ ok: true, jobId: job.id }, 201)
  })

  app.get('/api/public/status/:id', async (c) => {
    if (!(await limit(`status-ip:${ip(c)}`, 120, HOUR))) return c.json({ error: 'rate_limited' }, 429)
    const el = await findElevator(c.req.param('id'))
    if (!el) return c.json({ error: 'not_found' }, 404)
    const site = (await db.query<{ data: { name: string } }>(`select data from docs where org_id=$1 and collection='sites' and id=$2`, [el.org_id, String(el.data.siteId)])).rows[0]
    const job = (await db.query<{ data: Doc }>(
      `select data from docs where org_id=$1 and collection='jobs' and data->>'elevatorId'=$2 and data->>'type'='depannage' and not deleted order by data->>'createdAt' desc limit 1`,
      [el.org_id, c.req.param('id')],
    )).rows[0]
    return c.json({
      label: el.data.label, siteName: site?.data.name ?? '', status: el.data.status, lastVisit: el.data.lastVisit ?? null,
      job: job ? { status: job.data.status, createdAt: job.data.createdAt, timeline: job.data.timeline } : null,
    })
  })

  app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404))
  app.onError((err, c) => {
    const rid = c.res.headers.get('x-request-id') ?? c.req.header('x-request-id') ?? undefined
    logger.log('error', 'unhandled', { reqId: rid, method: c.req.method, path: c.req.path, error: String(err), stack: err instanceof Error ? err.stack?.split('\n').slice(0, 5).join(' | ') : undefined })
    metrics.inc('errors_total', { route: c.req.path.startsWith('/api/') ? 'api' : 'static' })
    void reportError?.(`${c.req.method} ${c.req.path} : ${String(err)}${rid ? ` (requête ${rid})` : ''}`)
    return c.json({ error: 'internal', requestId: rid }, 500)
  })

  /* ---------- front statique (production) ---------- */
  if (config.staticDir) {
    app.use('/*', serveStatic({ root: config.staticDir }))
    app.get('/*', serveStatic({ root: config.staticDir, path: 'index.html' }))
  }
  return app
}
