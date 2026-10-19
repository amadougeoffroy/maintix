import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addMonths, runAutoSuspension, sendRenewalReminders, verifyJekoSignature, type Gateway } from '../src/billing'
import { api, bootstrap, createOrg, login, makeEnv, type Env } from './helpers'

let env: Env
let op: ReturnType<typeof api>
const created: { reference: string; amount: number; method: string }[] = []
const fakeGateway: Gateway = {
  createPayment: async (i) => { created.push(i); return { providerId: `prov-${created.length}`, redirectUrl: `https://pay.jeko.test/${i.reference}` } },
  listStores: async () => [{ id: 'store-1', name: 'Boutique' }],
}
beforeEach(async () => {
  created.length = 0
  env = await makeEnv({}, { gateway: () => fakeGateway })
  op = api(env, await bootstrap(env, 'ada@a.test'))
})
const setKeys = () => op.fetch('PUT', '/api/operator/payment-settings', { apiKey: 'sk_live_ABCD1234', apiKeyId: 'kid-9', storeId: 'store-1', webhookSecret: 'whsec_WXYZ5678' })
const webhook = (body: unknown, secret = 'whsec_WXYZ5678', event = 'TRANSACTION_COMPLETED') => {
  const raw = JSON.stringify(body)
  return env.app.request('/api/public/jeko/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'jeko-event': event, 'jeko-signature': createHmac('sha256', secret).update(raw).digest('hex') }, body: raw })
}
const orgOf = async (id: string) => (await env.db.query<{ status: string; plan: string; subscription_ends_on: string | null; suspended_reason_code: string | null }>(`select status, plan, to_char(subscription_ends_on,'YYYY-MM-DD') as subscription_ends_on, suspended_reason_code from organisations where id = $1`, [id])).rows[0]

describe('utilitaires', () => {
  it('addMonths reste dans le mois cible', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-03-15', 12)).toBe('2027-03-15')
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28')
  })
  it('vérifie la signature HMAC-SHA256 du corps brut', () => {
    const sig = createHmac('sha256', 's3cret').update('{"a":1}').digest('hex')
    expect(verifyJekoSignature('{"a":1}', sig, 's3cret')).toBe(true)
    expect(verifyJekoSignature('{"a":2}', sig, 's3cret')).toBe(false)
    expect(verifyJekoSignature('{"a":1}', undefined, 's3cret')).toBe(false)
    expect(verifyJekoSignature('{"a":1}', 'court', 's3cret')).toBe(false)
  })
})

describe('motifs de suspension', () => {
  it('sont listés en base, avec ce qu’un paiement peut lever', async () => {
    const r = (await (await op.get('/api/operator/suspension-reasons')).json()).reasons as { code: string; liftedByPayment: boolean }[]
    expect(r.find((x) => x.code === 'unpaid')!.liftedByPayment).toBe(true)
    expect(r.find((x) => x.code === 'security')!.liftedByPayment).toBe(false)
  })
  it('refuse un motif inconnu ; enregistre le motif choisi', async () => {
    const id = await createOrg(op, 'Cliente SA', 'dg@c.test', 'DG')
    expect((await op.post(`/api/operator/orgs/${id}/suspend`, { code: 'nimporte' })).status).toBe(400)
    expect((await op.post(`/api/operator/orgs/${id}/suspend`, { code: 'security', reason: 'Accès suspect' })).status).toBe(200)
    expect(await orgOf(id)).toMatchObject({ status: 'suspended', suspended_reason_code: 'security' })
    const o = (await (await op.get('/api/operator/overview')).json()).orgs[0]
    expect(o.suspension).toMatchObject({ code: 'security', payable: false, detail: 'Accès suspect' })
  })
})

describe('suspension : déconnexion immédiate', () => {
  it('ferme les sessions des comptes de l’entreprise, pas celles des opérateurs ni des autres entreprises', async () => {
    const a = await createOrg(op, 'A SA', 'dg@a.test', 'DG A')
    await createOrg(op, 'B SA', 'dg@b.test', 'DG B')
    const dgA = api(env, await login(env, 'dg@a.test'))
    const dgB = api(env, await login(env, 'dg@b.test'))
    expect((await dgA.get('/api/auth/session')).status).toBe(200)
    await op.post(`/api/operator/orgs/${a}/enter`, {}) // l'opérateur est dans l'entreprise A
    await op.post(`/api/operator/orgs/${a}/suspend`, { code: 'unpaid' })
    expect((await dgA.get('/api/auth/session')).status).toBe(401) // déconnecté
    expect((await dgB.get('/api/auth/session')).status).toBe(200)
    expect((await op.get('/api/auth/session')).status).toBe(200)
    // il peut se reconnecter : il retrouve l'écran de suspension
    const again = api(env, await login(env, 'dg@a.test'))
    expect(await (await again.get('/api/auth/session')).json()).toMatchObject({ orgStatus: 'suspended', payable: true })
  })
  it('la suspension automatique ferme aussi les sessions', async () => {
    const id = await createOrg(op, 'Essai SA', 'dg@e.test', 'DG')
    const dg = api(env, await login(env, 'dg@e.test'))
    await env.db.query(`update organisations set trial_ends_on = current_date - 1 where id = $1`, [id])
    await runAutoSuspension(env.db)
    expect((await dg.get('/api/auth/session')).status).toBe(401)
  })
})

describe('échéance exposée à l’interface', () => {
  it('la session indique la fin de l’abonnement, ou de l’essai', async () => {
    const id = await createOrg(op, 'Cliente SA', 'dg@c.test', 'DG')
    const dg = api(env, await login(env, 'dg@c.test'))
    const trial = (await (await dg.get('/api/auth/session')).json())
    expect(trial.planName).toBe('essai')
    expect(trial.planEndsOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    await env.db.query(`update organisations set plan = 'essentiel', subscription_ends_on = '2030-05-17' where id = $1`, [id])
    expect(await (await dg.get('/api/auth/session')).json()).toMatchObject({ planName: 'essentiel', planEndsOn: '2030-05-17' })
    expect((await (await op.get('/api/auth/session')).json()).planEndsOn).toBeNull() // l'entreprise plateforme n'a pas d'échéance
  })
})

describe('suspension automatique', () => {
  it('suspend un essai échu et un abonnement échu, pas les autres', async () => {
    const trial = await createOrg(op, 'Essai SA', 'a@a.test', 'AA')
    const paid = await createOrg(op, 'Payante SA', 'b@b.test', 'BB', 'essentiel')
    const fine = await createOrg(op, 'Valide SA', 'c@c.test', 'CC', 'essentiel')
    const free = await createOrg(op, 'Libre SA', 'd@d.test', 'DD', 'sur-mesure')
    await env.db.query(`update organisations set trial_ends_on = current_date - 1 where id = $1`, [trial])
    await env.db.query(`update organisations set subscription_ends_on = current_date - 1 where id = $1`, [paid])
    await env.db.query(`update organisations set subscription_ends_on = current_date + 10 where id = $1`, [fine])
    const r = await runAutoSuspension(env.db)
    expect(r.map((x) => `${x.name}:${x.code}`).sort()).toEqual(['Essai SA:trial_expired', 'Payante SA:subscription_expired'])
    expect((await orgOf(fine)).status).toBe('active')
    expect((await orgOf(free)).status).toBe('active')
    expect(await runAutoSuspension(env.db)).toEqual([]) // idempotent
    const platform = (await env.db.query<{ status: string }>(`select status from organisations where kind = 'platform'`)).rows[0]
    expect(platform.status).toBe('active')
  })
})

describe('clés Jèko dans la console', () => {
  it('sont enregistrées chiffrées, jamais renvoyées en clair ; un champ vide ne les écrase pas', async () => {
    expect((await setKeys()).status).toBe(200)
    const v = await (await op.get('/api/operator/payment-settings')).json()
    expect(JSON.stringify(v)).not.toContain('ABCD1234')
    expect(JSON.stringify(v)).not.toContain('WXYZ5678')
    expect(v).toMatchObject({ configured: true, webhookConfigured: true, apiKeyMasked: '••••1234', apiKeyId: 'kid-9', storeId: 'store-1' })
    const raw = (await env.db.query<{ value: string }>(`select value from platform_settings where key = 'jeko.apiKey'`)).rows[0].value
    expect(raw).toMatch(/^v1:/)
    expect(raw).not.toContain('ABCD1234')
    await op.fetch('PUT', '/api/operator/payment-settings', { storeId: 'store-2' })
    expect(await (await op.get('/api/operator/payment-settings')).json()).toMatchObject({ apiKeyMasked: '••••1234', storeId: 'store-2' })
    const t = await (await op.post('/api/operator/payment-settings/test', {})).json()
    expect(t.stores).toEqual([{ id: 'store-1', name: 'Boutique' }])
  })
  it('sont réservées aux opérateurs', async () => {
    await createOrg(op, 'Cliente SA', 'dg@c.test', 'DG')
    const dg = api(env, await login(env, 'dg@c.test'))
    expect((await dg.get('/api/operator/payment-settings')).status).toBe(403)
    expect((await dg.fetch('PUT', '/api/operator/payment-settings', { apiKey: 'x' })).status).toBe(403)
    expect((await dg.get('/api/operator/finance')).status).toBe(403)
  })
  it('peuvent être effacées', async () => {
    await setKeys()
    expect((await op.del('/api/operator/payment-settings')).status).toBe(200)
    expect(await (await op.get('/api/operator/payment-settings')).json()).toMatchObject({ configured: false, apiKeyMasked: null })
  })
})

describe('paiement par l’entreprise', () => {
  async function suspendedOrg(code: string) {
    await setKeys()
    const id = await createOrg(op, 'Cliente SA', 'dg@c.test', 'DG')
    await op.post(`/api/operator/orgs/${id}/suspend`, { code })
    return { id, dg: api(env, await login(env, 'dg@c.test')) }
  }
  it('propose les offres payantes et les durées 1, 3, 6, 12 mois', async () => {
    await setKeys()
    await createOrg(op, 'Cliente SA', 'dg@c.test', 'DG')
    const dg = api(env, await login(env, 'dg@c.test'))
    const o = await (await dg.get('/api/billing/overview')).json()
    expect(o.online).toBe(true)
    expect(o.months).toEqual([1, 3, 6, 12])
    expect(o.plans.map((p: { code: string }) => p.code)).toEqual(['essentiel', 'pro'])
  })
  it('motif « facture impayée » : le paiement lève la suspension et prolonge l’abonnement', async () => {
    const { id, dg } = await suspendedOrg('unpaid')
    expect((await dg.get('/api/sync/pull?since=0')).status).toBe(403) // bloqué
    const r = await dg.post('/api/billing/checkout', { plan: 'essentiel', months: 3, method: 'wave' })
    expect(r.status).toBe(200)
    const out = await r.json()
    expect(out.amount).toBe(105000) // 35 000 × 3
    expect(created[0]).toMatchObject({ amount: 105000, method: 'wave' })
    expect(out.redirectUrl).toContain('pay.jeko.test')
    expect((await orgOf(id)).status).toBe('suspended') // pas levé avant la confirmation
    const hook = await webhook({ status: 'success', transactionType: 'payment', transactionDetails: { id: 'prov-1', reference: created[0].reference } })
    expect(hook.status).toBe(200)
    const o = await orgOf(id)
    expect(o).toMatchObject({ status: 'active', plan: 'essentiel', suspended_reason_code: null })
    expect(o.subscription_ends_on).toBe(addMonths(new Date().toISOString().slice(0, 10), 3))
    expect((await dg.get('/api/sync/pull?since=0')).status).toBe(200)
    // idempotent : un second webhook ne prolonge pas deux fois
    await webhook({ status: 'success', transactionType: 'payment', transactionDetails: { id: 'prov-1', reference: created[0].reference } })
    expect((await orgOf(id)).subscription_ends_on).toBe(o.subscription_ends_on)
    const p = await (await dg.get(`/api/billing/payments/${out.paymentId}`)).json()
    expect(p).toMatchObject({ status: 'paid', orgStatus: 'active' })
  })
  it('un renouvellement avant l’échéance prolonge à partir de l’échéance', async () => {
    await setKeys()
    const id = await createOrg(op, 'Cliente SA', 'dg@c.test', 'DG', 'essentiel')
    await env.db.query(`update organisations set subscription_ends_on = current_date + 20 where id = $1`, [id])
    const dg = api(env, await login(env, 'dg@c.test'))
    await dg.post('/api/billing/checkout', { plan: 'essentiel', months: 1, method: 'orange' })
    await webhook({ status: 'success', transactionType: 'payment', transactionDetails: { reference: created[0].reference } })
    const start = (await env.db.query<{ d: string }>(`select to_char(current_date + 20, 'YYYY-MM-DD') as d`)).rows[0].d
    expect((await orgOf(id)).subscription_ends_on).toBe(addMonths(start, 1))
  })
  it('motif non payable (sécurité) : paiement refusé, seul l’opérateur peut lever', async () => {
    const { id, dg } = await suspendedOrg('security')
    const r = await dg.post('/api/billing/checkout', { plan: 'essentiel', months: 1, method: 'wave' })
    expect(r.status).toBe(403)
    expect((await r.json()).error).toBe('not_payable')
    expect(created).toHaveLength(0)
    expect((await orgOf(id)).status).toBe('suspended')
    // même un paiement reçu (hors ligne) ne lève pas ce motif
    await op.post(`/api/operator/orgs/${id}/payments`, { plan: 'essentiel', months: 1 })
    expect((await orgOf(id)).status).toBe('suspended')
    expect((await op.post(`/api/operator/orgs/${id}/reactivate`, {})).status).toBe(200)
    expect((await orgOf(id)).status).toBe('active')
  })
  it('un opérateur peut lever aussi un motif « impayé »', async () => {
    const { id } = await suspendedOrg('unpaid')
    expect((await op.post(`/api/operator/orgs/${id}/reactivate`, {})).status).toBe(200)
  })
  it('refuse les webhooks mal signés et ne crédite pas', async () => {
    const { id, dg } = await suspendedOrg('unpaid')
    await dg.post('/api/billing/checkout', { plan: 'pro', months: 1, method: 'mtn' })
    const bad = await webhook({ status: 'success', transactionType: 'payment', transactionDetails: { reference: created[0].reference } }, 'mauvais-secret')
    expect(bad.status).toBe(401)
    expect((await orgOf(id)).status).toBe('suspended')
  })
  it('seul l’administrateur paie ; paiements indisponibles sans clés ; offre inconnue refusée', async () => {
    const id = await createOrg(op, 'Cliente SA', 'dg@c.test', 'DG')
    const dg = api(env, await login(env, 'dg@c.test'))
    expect((await dg.post('/api/billing/checkout', { plan: 'essentiel', months: 1, method: 'wave' })).status).toBe(503) // pas de clés
    await setKeys()
    expect((await dg.post('/api/billing/checkout', { plan: 'essai', months: 1, method: 'wave' })).status).toBe(400)
    expect((await dg.post('/api/billing/checkout', { plan: 'essentiel', months: 2, method: 'wave' })).status).toBe(400)
    const { invite } = await import('./helpers')
    const tech = api(env, await invite(env, dg, 'tech@c.test', 'tech'))
    expect((await tech.post('/api/billing/checkout', { plan: 'essentiel', months: 1, method: 'wave' })).status).toBe(403)
    void id
  })
  it('un échec du prestataire marque le paiement en échec', async () => {
    const failing = await makeEnv({}, { gateway: () => ({ createPayment: async () => { throw new Error('boom') }, listStores: async () => [] }) })
    const o = api(failing, await bootstrap(failing, 'ada@a.test'))
    await o.fetch('PUT', '/api/operator/payment-settings', { apiKey: 'k', apiKeyId: 'i', storeId: 's' })
    await createOrg(o, 'Cliente SA', 'dg@c.test', 'DG')
    const dg = api(failing, await login(failing, 'dg@c.test'))
    expect((await dg.post('/api/billing/checkout', { plan: 'essentiel', months: 1, method: 'wave' })).status).toBe(502)
    expect((await failing.db.query<{ status: string }>(`select status from payments`)).rows[0].status).toBe('failed')
  })
})

describe('finances de la console', () => {
  it('détaille encaissé, en attente et reste à payer', async () => {
    await setKeys()
    const a = await createOrg(op, 'Payée SA', 'a@a.test', 'AA', 'essentiel')
    const b = await createOrg(op, 'Échue SA', 'b@b.test', 'BB', 'essentiel')
    await createOrg(op, 'Essai SA', 'c@c.test', 'CC')
    await op.post(`/api/operator/orgs/${a}/payments`, { plan: 'essentiel', months: 6, note: 'virement' })
    await env.db.query(`update organisations set subscription_ends_on = current_date - 3 where id = $1`, [b])
    const dgB = api(env, await login(env, 'b@b.test'))
    await dgB.post('/api/billing/checkout', { plan: 'essentiel', months: 1, method: 'wave' }) // en attente
    const f = await (await op.get('/api/operator/finance')).json()
    expect(f.currency).toBe('FCFA')
    expect(f.collected.total).toBe(189000) // 35 000 × 6 − 10 %
    expect(f.collected.thisMonth).toBe(189000)
    expect(f.pending).toMatchObject({ amount: 35000, count: 1 })
    expect(f.outstanding).toMatchObject({ amount: 35000, orgs: 1 })
    const rowB = f.orgs.find((o: { name: string }) => o.name === 'Échue SA')
    expect(rowB).toMatchObject({ due: 35000, paid: 0, pending: 35000 })
    expect(f.orgs.find((o: { name: string }) => o.name === 'Payée SA')).toMatchObject({ paid: 189000, due: 0 })
    expect(f.recent.length).toBe(2)
  })
  it('un paiement en attente peut être confirmé à la main (rapprochement)', async () => {
    await setKeys()
    const id = await createOrg(op, 'Cliente SA', 'dg@c.test', 'DG', 'essentiel')
    await op.post(`/api/operator/orgs/${id}/suspend`, { code: 'unpaid' })
    const dg = api(env, await login(env, 'dg@c.test'))
    const out = await (await dg.post('/api/billing/checkout', { plan: 'essentiel', months: 1, method: 'wave' })).json()
    expect((await op.post(`/api/operator/payments/${out.paymentId}/confirm`, {})).status).toBe(200)
    expect((await orgOf(id)).status).toBe('active')
    expect((await op.post(`/api/operator/payments/${out.paymentId}/confirm`, {})).status).toBe(404) // déjà payé
  })
})

describe('rappels avant échéance', () => {
  const to = (email: string) => env.mailer.sent.filter((m) => m.to === email)
  it('envoie un rappel à 7 jours puis un dernier rappel à 1 jour, une seule fois chacun', async () => {
    const id = await createOrg(op, 'Cliente SA', 'dg@c.test', 'DG', 'essentiel')
    await createOrg(op, 'Loin SA', 'dg@loin.test', 'DG', 'essentiel')
    await env.db.query(`update organisations set subscription_ends_on = current_date + 5 where id = $1`, [id])
    await env.db.query(`update organisations set subscription_ends_on = current_date + 30 where name = 'Loin SA'`)
    const base = to('dg@c.test').length
    expect((await sendRenewalReminders(env.db, env.mailer, env.config)).map((x) => `${x.org}:${x.kind}`)).toEqual(['Cliente SA:d7'])
    const m = to('dg@c.test')[base]
    expect(m.subject).toContain('se termine dans 5 jours')
    expect(m.html).toContain('Renouveler maintenant')
    expect(m.html).toContain('/#/office/settings/abonnement')
    expect(await sendRenewalReminders(env.db, env.mailer, env.config)).toEqual([]) // pas de doublon
    expect(to('dg@loin.test').filter((x) => x.subject.includes('Rappel'))).toHaveLength(0)
    await env.db.query(`update organisations set subscription_ends_on = current_date + 1 where id = $1`, [id])
    expect((await sendRenewalReminders(env.db, env.mailer, env.config)).map((x) => x.kind)).toEqual(['d1'])
    expect(to('dg@c.test').at(-1)!.subject).toContain('Dernier rappel')
    expect(await sendRenewalReminders(env.db, env.mailer, env.config)).toEqual([])
  })
  it('couvre aussi la fin de l’essai, ignore les entreprises suspendues et celles sans échéance', async () => {
    const trial = await createOrg(op, 'Essai SA', 'dg@e.test', 'DG')
    const susp = await createOrg(op, 'Suspendue SA', 'dg@s.test', 'DG', 'essentiel')
    await createOrg(op, 'Libre SA', 'dg@l.test', 'DG', 'sur-mesure')
    await env.db.query(`update organisations set trial_ends_on = current_date + 3 where id = $1`, [trial])
    await env.db.query(`update organisations set subscription_ends_on = current_date + 3, status = 'suspended' where id = $1`, [susp])
    const r = await sendRenewalReminders(env.db, env.mailer, env.config)
    expect(r.map((x) => x.org)).toEqual(['Essai SA'])
    expect(to('dg@e.test').at(-1)!.subject).toContain('période d’essai')
  })
})

describe('informations de l’éditeur', () => {
  it('publie uniquement celles qui sont configurées', async () => {
    const e = await makeEnv({ LEGAL_NAME: 'Windsit Digital', LEGAL_EMAIL: 'contact@windsit-digital.com' })
    const info = await (await e.app.request('/api/public/info')).json()
    expect(info.legal).toEqual({ name: 'Windsit Digital', email: 'contact@windsit-digital.com' })
  })
})
