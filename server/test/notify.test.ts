import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { loadConfig } from '../src/config'
import { memoryMailer } from '../src/mailer'
import { Notifier, type Channels, type PushPayload, type PushSub } from '../src/notify'
import { api, APP_URL, bootstrap, invite, json, makeEnv, push, type Env } from './helpers'

class FakeChannels implements Channels {
  pushEnabled = true
  smsEnabled = true
  pushes: { endpoint: string; payload: PushPayload }[] = []
  smss: { to: string; text: string }[] = []
  dead = new Set<string>()
  failSms = false
  async push(sub: PushSub, payload: PushPayload) {
    if (this.dead.has(sub.endpoint)) return false
    this.pushes.push({ endpoint: sub.endpoint, payload })
    return true
  }
  async sms(to: string, text: string) {
    if (this.failSms) throw new Error('sms down')
    this.smss.push({ to, text })
  }
}

let env: Env
let ch: FakeChannels
let notifier: Notifier
let app: ReturnType<typeof createApp>
let admin: ReturnType<typeof api>
let adminCookie: string

const mk = (cookie: string) => ({
  get: (p: string) => app.request(p, { headers: { cookie } }),
  post: (p: string, b: unknown) => app.request(p, json(b, { cookie })),
})
const me = async (a: { get: (p: string) => Response | Promise<Response> }) => (await (await a.get('/api/auth/session')).json()) as { techId: string; user: { id: string } }

beforeEach(async () => {
  env = await makeEnv()
  ch = new FakeChannels()
  notifier = new Notifier(env.db, ch, { escalationMinutes: 10 })
  app = createApp({ db: env.db, config: loadConfig({ APP_URL, BOOTSTRAP_TOKEN: 'boot-secret' }), mailer: memoryMailer(), notifier })
  adminCookie = await bootstrap(env, 'ada@a.test')
  admin = mk(adminCookie) as unknown as ReturnType<typeof api>
})

async function sub(cookie: string, endpoint: string) {
  return mk(cookie).post('/api/notifications/subscribe', { endpoint, keys: { p256dh: 'p256dh-key-aaaa', auth: 'auth-key' } })
}
async function setup() {
  const techA = await invite(env, api(env, adminCookie), 'a@tech.test', 'tech')
  const techB = await invite(env, api(env, adminCookie), 'b@tech.test', 'tech')
  const A = await me(mk(techA)), B = await me(mk(techB))
  await sub(techA, 'https://push.example/a'); await sub(techB, 'https://push.example/b'); await sub(adminCookie, 'https://push.example/admin')
  await push(admin, [
    { collection: 'sites', id: 's1', data: { id: 's1', clientId: 'c1', name: 'Les Lilas', address: 'x' } },
    { collection: 'elevators', id: 'e1', data: { id: 'e1', siteId: 's1', label: 'Ascenseur A1', status: 'ok' } },
  ])
  return { techA, techB, A, B }
}
const job = (id: string, extra: Record<string, unknown> = {}) => ({ id, type: 'depannage', elevatorId: 'e1', techId: null, date: '2026-01-01', status: 'planifiee', trapped: false, description: 'Porte bloquée', createdAt: 'x', timeline: [], ...extra })
const to = () => ch.pushes.map((p) => p.endpoint.split('/').pop())

describe('alerte d’un nouveau dépannage', () => {
  it('prévient le technicien affecté, pas les autres', async () => {
    const { A } = await setup()
    await push(admin, [{ collection: 'jobs', id: 'j1', data: job('j1', { techId: A.techId }) }])
    expect(to()).toEqual(['a'])
    expect(ch.pushes[0].payload.title).toBe('Dépannage')
    expect(ch.pushes[0].payload.body).toContain('Ascenseur A1 – Les Lilas')
    expect(ch.pushes[0].payload.url).toBe('/#/tech/job/j1')
  })
  it('sans technicien : l’astreinte du jour ; sans astreinte : le bureau', async () => {
    const { B } = await setup()
    await push(admin, [{ collection: 'jobs', id: 'j1', data: job('j1') }])
    expect(to()).toEqual(['admin']) // pas d'astreinte définie
    ch.pushes = []
    await push(admin, [{ collection: 'onCall', id: '2020-01-06', data: { weekStart: '2020-01-06', techId: B.techId } }])
    await push(admin, [{ collection: 'jobs', id: 'j2', data: job('j2') }])
    expect(to()).toEqual(['b'])
  })
  it('une personne bloquée déclenche aussi un SMS si le numéro est connu', async () => {
    const { techA, A } = await setup()
    expect((await mk(techA).post('/api/notifications/phone', { phone: '+33612345678' })).status).toBe(200)
    await push(admin, [{ collection: 'jobs', id: 'j1', data: job('j1', { techId: A.techId, trapped: true }) }])
    expect(ch.pushes[0].payload.title).toContain('personne bloquée')
    expect(ch.smss).toHaveLength(1)
    expect(ch.smss[0].to).toBe('+33612345678')
    expect(ch.smss[0].text).toContain('Ascenseur A1')
  })
  it('un dépannage simple n’envoie pas de SMS quand le push a abouti', async () => {
    const { techA, A } = await setup()
    await mk(techA).post('/api/notifications/phone', { phone: '+33612345678' })
    await push(admin, [{ collection: 'jobs', id: 'j1', data: job('j1', { techId: A.techId }) }])
    expect(ch.smss).toHaveLength(0)
  })
  it('SMS en secours quand aucun appareil n’est abonné', async () => {
    const techC = await invite(env, api(env, adminCookie), 'c@tech.test', 'tech')
    const C = await me(mk(techC))
    await mk(techC).post('/api/notifications/phone', { phone: '+33611111111' })
    await push(admin, [{ collection: 'jobs', id: 'j1', data: job('j1', { techId: C.techId }) }])
    expect(ch.pushes).toHaveLength(0)
    expect(ch.smss).toHaveLength(1)
  })
  it('ne notifie ni un entretien, ni une mission déjà prise en charge, ni une simple modification', async () => {
    const { A } = await setup()
    await push(admin, [{ collection: 'jobs', id: 'e', data: job('e', { type: 'entretien', techId: A.techId }) }])
    await push(admin, [{ collection: 'jobs', id: 'p', data: job('p', { techId: A.techId, status: 'en_route' }) }])
    await push(admin, [{ collection: 'jobs', id: 'j1', data: job('j1', { techId: A.techId }) }])
    ch.pushes = []
    await push(admin, [{ collection: 'jobs', id: 'j1', data: job('j1', { techId: A.techId, description: 'précision' }) }])
    expect(ch.pushes).toHaveLength(0)
  })
  it('le signalement public alerte l’astreinte', async () => {
    const { B } = await setup()
    await push(admin, [{ collection: 'onCall', id: '2020-01-06', data: { weekStart: '2020-01-06', techId: B.techId } }])
    const res = await app.request('/api/public/report', json({ elevatorId: 'e1', description: 'Bloqué', trapped: true, reporter: 'Passant' }))
    expect(res.status).toBe(201)
    expect(to()).toEqual(['b'])
    expect(ch.pushes[0].payload.title).toContain('personne bloquée')
  })
  it('la réaffectation prévient le nouveau technicien', async () => {
    const { A, B } = await setup()
    await push(admin, [{ collection: 'jobs', id: 'j1', data: job('j1', { techId: A.techId }) }])
    ch.pushes = []
    await push(admin, [{ collection: 'jobs', id: 'j1', data: job('j1', { techId: B.techId }) }])
    expect(to()).toEqual(['b'])
  })
})

describe('escalade', () => {
  const T0 = Date.now()
  it('monte d’un niveau toutes les 10 min sans prise en charge, puis s’arrête', async () => {
    const { A } = await setup()
    await push(admin, [{ collection: 'jobs', id: 'j1', data: job('j1', { techId: A.techId }) }])
    ch.pushes = []
    expect(await notifier.scan(T0 + 5 * 60_000)).toEqual({ acked: 0, escalated: 0 })
    expect(await notifier.scan(T0 + 11 * 60_000)).toEqual({ acked: 0, escalated: 1 })
    expect(ch.pushes.map((p) => p.payload.title)[0]).toContain('SANS RÉPONSE (1)')
    expect(to().sort()).toEqual(['a', 'admin']) // technicien + bureau
    ch.pushes = []
    await env.db.query(`update alerts set notified_at = now() - interval '11 minutes'`)
    expect((await notifier.scan(Date.now())).escalated).toBe(1)
    expect(ch.pushes[0].payload.title).toContain('(2)')
    await env.db.query(`update alerts set notified_at = now() - interval '11 minutes'`)
    expect((await notifier.scan(Date.now())).escalated).toBe(0) // niveau maximum atteint
  })
  it('s’arrête dès que le technicien prend en charge', async () => {
    const { A } = await setup()
    await push(admin, [{ collection: 'jobs', id: 'j1', data: job('j1', { techId: A.techId }) }])
    await push(admin, [{ collection: 'jobs', id: 'j1', data: job('j1', { techId: A.techId, status: 'en_route' }) }])
    ch.pushes = []
    await env.db.query(`update alerts set notified_at = now() - interval '30 minutes'`)
    expect(await notifier.scan(Date.now())).toEqual({ acked: 1, escalated: 0 })
    expect(ch.pushes).toHaveLength(0)
  })
  it('l’escalade envoie aussi un SMS au bureau', async () => {
    const { A } = await setup()
    await mk(adminCookie).post('/api/notifications/phone', { phone: '+33699999999' })
    await push(admin, [{ collection: 'jobs', id: 'j1', data: job('j1', { techId: A.techId }) }])
    await env.db.query(`update alerts set notified_at = now() - interval '11 minutes'`)
    await notifier.scan(Date.now())
    expect(ch.smss.map((s) => s.to)).toContain('+33699999999')
  })
})

describe('robustesse', () => {
  it('supprime un abonnement expiré et ne bloque pas la synchronisation si un canal échoue', async () => {
    const { A } = await setup()
    ch.dead.add('https://push.example/a')
    const r = await push(admin, [{ collection: 'jobs', id: 'j1', data: job('j1', { techId: A.techId }) }])
    expect(r.results[0].ok).toBe(true)
    expect((await env.db.query('select 1 from push_subscriptions where endpoint=$1', ['https://push.example/a'])).rows).toHaveLength(0)
    ch.failSms = true
    const techC = await invite(env, api(env, adminCookie), 'c@tech.test', 'tech')
    const C = await me(mk(techC))
    await mk(techC).post('/api/notifications/phone', { phone: '+33611111111' })
    expect((await push(admin, [{ collection: 'jobs', id: 'j2', data: job('j2', { techId: C.techId, trapped: true }) }])).results[0].ok).toBe(true)
  })
})

describe('API de configuration', () => {
  it('valide l’abonnement (https) et le téléphone (E.164) et expose la configuration', async () => {
    expect((await mk(adminCookie).post('/api/notifications/subscribe', { endpoint: 'http://insecure', keys: { p256dh: 'x'.repeat(12), auth: 'y'.repeat(6) } })).status).toBe(400)
    expect((await mk(adminCookie).post('/api/notifications/subscribe', { endpoint: 'https://p.example/x', keys: { p256dh: 'x', auth: 'y' } })).status).toBe(400)
    expect((await sub(adminCookie, 'https://p.example/ok')).status).toBe(201)
    expect((await mk(adminCookie).post('/api/notifications/phone', { phone: '0612345678' })).status).toBe(400)
    expect((await mk(adminCookie).post('/api/notifications/phone', { phone: '+33612345678' })).status).toBe(200)
    const cfg = await (await mk(adminCookie).get('/api/notifications/config')).json()
    expect(cfg).toMatchObject({ subscriptions: 1, phone: '+33612345678', smsConfigured: true, escalationMinutes: 10 })
    const t = await (await mk(adminCookie).post('/api/notifications/test', {})).json()
    expect(t).toMatchObject({ ok: true, push: 1, sms: true })
    expect((await mk(adminCookie).post('/api/notifications/phone', { phone: '' })).status).toBe(200) // effacer
    expect((await mk(adminCookie).post('/api/notifications/unsubscribe', { endpoint: 'https://p.example/ok' })).status).toBe(200)
    expect((await (await mk(adminCookie).get('/api/notifications/config')).json()).subscriptions).toBe(0)
  })
  it('exige une session', async () => {
    expect((await app.request('/api/notifications/config')).status).toBe(401)
  })
})

describe('canaux réels (appels HTTP simulés)', () => {
  it('envoie un SMS via Twilio avec authentification Basic et corps formulaire', async () => {
    const { realChannels } = await import('../src/notify')
    const calls: { url: string; init: RequestInit }[] = []
    const fetchMock = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response('{}', { status: 201 }) }) as unknown as typeof fetch
    const c = realChannels({ smsProvider: 'twilio', twilio: { sid: 'AC123', token: 'secret', from: '+33700000000' }, escalationMinutes: 10 }, fetchMock)
    expect(c.smsEnabled).toBe(true)
    await c.sms('+33612345678', 'Test')
    expect(calls[0].url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json')
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from('AC123:secret').toString('base64')}`)
    expect(String(calls[0].init.body)).toContain('To=%2B33612345678')
  })
  it('appelle un webhook SMS avec jeton et signale les erreurs', async () => {
    const { realChannels } = await import('../src/notify')
    let status = 200
    const calls: { url: string; init: RequestInit }[] = []
    const fetchMock = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response('{}', { status }) }) as unknown as typeof fetch
    const c = realChannels({ smsProvider: 'webhook', smsWebhook: { url: 'https://sms.example/send', token: 't0k' }, escalationMinutes: 10 }, fetchMock)
    await c.sms('+33612345678', 'Bonjour')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ to: '+33612345678', text: 'Bonjour' })
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer t0k')
    status = 500
    await expect(c.sms('+33612345678', 'x')).rejects.toThrow('webhook 500')
  })
  it('désactive les canaux non configurés', async () => {
    const { realChannels } = await import('../src/notify')
    const c = realChannels({ escalationMinutes: 10 })
    expect(c.pushEnabled).toBe(false)
    expect(c.smsEnabled).toBe(false)
  })
})

describe('clés VAPID', () => {
  it('nettoie les clés collées à la main et ne plante jamais sur une clé invalide', async () => {
    const { cleanVapidKey, vapidProblem, realChannels, loadNotifyConfig } = await import('../src/notify')
    const webpush = (await import('web-push')).default
    const keys = webpush.generateVAPIDKeys()
    expect(vapidProblem(keys.publicKey, keys.privateKey)).toBeNull()
    // guillemets, espaces, « = » final, base64 standard
    const std = Buffer.from(keys.publicKey, 'base64url').toString('base64')
    expect(cleanVapidKey(`  "${std}"  `)).toBe(keys.publicKey)
    expect(cleanVapidKey(`${keys.publicKey}==`)).toBe(keys.publicKey)
    expect(cleanVapidKey('   ')).toBeUndefined()
    const cfg = loadNotifyConfig({ VAPID_PUBLIC_KEY: ` '${std}' `, VAPID_PRIVATE_KEY: `${keys.privateKey}=` } as NodeJS.ProcessEnv)
    expect(vapidProblem(cfg.vapidPublicKey, cfg.vapidPrivateKey)).toBeNull()
    expect(realChannels(cfg, fetch, () => {}).pushEnabled).toBe(true)
    // clé invalide : push désactivé avec un avertissement, sans exception
    const warnings: string[] = []
    const bad = realChannels({ vapidPublicKey: 'pas-une-cle', vapidPrivateKey: keys.privateKey, escalationMinutes: 10 }, fetch, (m) => warnings.push(m))
    expect(bad.pushEnabled).toBe(false)
    expect(warnings[0]).toContain('VAPID_PUBLIC_KEY invalide')
    expect(warnings[0]).not.toContain(keys.privateKey)
    expect(vapidProblem('abc', undefined)).toContain('ensemble')
    expect(vapidProblem(undefined, undefined)).toBeNull()
  })
})
