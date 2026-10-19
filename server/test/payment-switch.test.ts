import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { runAutoSuspension, sendRenewalReminders, sweepSubscriptions, type Gateway } from '../src/billing'
import { api, bootstrap, createOrg, login, makeEnv, type Env } from './helpers'

const created: { reference: string }[] = []
const gateway: Gateway = { createPayment: async (i) => { created.push(i); return { providerId: `p${created.length}`, redirectUrl: `https://pay.test/${i.reference}` } }, listStores: async () => [] }
let env: Env
let op: ReturnType<typeof api>
const setSwitch = (enabled: boolean, extra: Record<string, unknown> = {}) => op.fetch('PUT', '/api/operator/payment-switch', { enabled, supportPhone: '0757820485', supportEmail: 'contact@windsit-digital.com', ...extra })
const hook = (reference: string) => {
  const raw = JSON.stringify({ status: 'success', transactionType: 'payment', transactionDetails: { reference } })
  return env.app.request('/api/public/jeko/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'jeko-event': 'TRANSACTION_COMPLETED', 'jeko-signature': createHmac('sha256', 'sec').update(raw).digest('hex') }, body: raw })
}
beforeEach(async () => {
  created.length = 0
  env = await makeEnv({}, { gateway: () => gateway })
  op = api(env, await bootstrap(env, 'ada@a.test'))
  await op.fetch('PUT', '/api/operator/payment-settings', { apiKey: 'k', apiKeyId: 'i', storeId: 's', webhookSecret: 'sec' })
})

describe('interrupteur des paiements en ligne', () => {
  it('est activé par défaut, avec le support par défaut ; réservé aux opérateurs et validé', async () => {
    expect(await (await op.get('/api/operator/payment-switch')).json()).toEqual({ enabled: true, supportPhone: '0757820485', supportEmail: 'contact@windsit-digital.com' })
    expect((await setSwitch(false, { supportEmail: 'pas-un-mail' })).status).toBe(400)
    expect((await setSwitch(false, { supportPhone: '' })).status).toBe(400)
    await createOrg(op, 'Cliente SA', 'dg@c.test', 'DG')
    const dg = api(env, await login(env, 'dg@c.test'))
    expect((await dg.get('/api/operator/payment-switch')).status).toBe(403)
    expect((await dg.fetch('PUT', '/api/operator/payment-switch', { enabled: false, supportPhone: '1', supportEmail: 'a@b.test' })).status).toBe(403)
    const o = await (await dg.get('/api/billing/overview')).json()
    expect(o).toMatchObject({ paymentsEnabled: true, support: { phone: '0757820485', email: 'contact@windsit-digital.com' } })
  })
  it('désactivé : le paiement est refusé avec le contact du support, et réactivé il refonctionne', async () => {
    await createOrg(op, 'Cliente SA', 'dg@c.test', 'DG')
    const dg = api(env, await login(env, 'dg@c.test'))
    expect((await setSwitch(false)).status).toBe(200)
    const o = await (await dg.get('/api/billing/overview')).json()
    expect(o).toMatchObject({ paymentsEnabled: false, support: { phone: '0757820485', email: 'contact@windsit-digital.com' } })
    const r = await dg.post('/api/billing/checkout', { plan: 'essentiel', months: 1, method: 'wave' })
    expect(r.status).toBe(503)
    expect(await r.json()).toMatchObject({ error: 'payments_disabled', support: { phone: '0757820485' } })
    expect(created).toHaveLength(0) // Jèko n'est pas appelé
    expect((await env.db.query('select 1 from payments')).rows).toHaveLength(0)
    await setSwitch(true)
    expect((await dg.post('/api/billing/checkout', { plan: 'essentiel', months: 1, method: 'wave' })).status).toBe(200)
  })
  it('le contact du support est modifiable', async () => {
    await createOrg(op, 'Cliente SA', 'dg@c.test', 'DG')
    const dg = api(env, await login(env, 'dg@c.test'))
    await setSwitch(false, { supportPhone: '+225 01 02 03 04 05', supportEmail: 'aide@exemple.test' })
    expect((await (await dg.get('/api/billing/overview')).json()).support).toEqual({ phone: '+225 01 02 03 04 05', email: 'aide@exemple.test' })
  })
  it('un paiement déjà initié est quand même pris en compte, et un opérateur peut encore enregistrer un paiement', async () => {
    const id = await createOrg(op, 'Cliente SA', 'dg@c.test', 'DG')
    const dg = api(env, await login(env, 'dg@c.test'))
    await dg.post('/api/billing/checkout', { plan: 'essentiel', months: 1, method: 'wave' })
    await setSwitch(false)
    expect((await hook(created[0].reference)).status).toBe(200)
    expect((await env.db.query<{ status: string }>('select status from payments')).rows[0].status).toBe('paid')
    expect((await op.post(`/api/operator/orgs/${id}/payments`, { plan: 'essentiel', months: 1 })).status).toBe(201)
  })
  it('les e-mails de suspension et de rappel orientent vers le support quand les paiements sont désactivés', async () => {
    const trial = await createOrg(op, 'Essai SA', 'dg@e.test', 'DG')
    const near = await createOrg(op, 'Proche SA', 'dg@p.test', 'DG', 'essentiel')
    await env.db.query(`update organisations set trial_ends_on = current_date - 1 where id = $1`, [trial])
    await env.db.query(`update organisations set subscription_ends_on = current_date + 3 where id = $1`, [near])
    await setSwitch(false)
    await sendRenewalReminders(env.db, env.mailer, env.config)
    await sweepSubscriptions(env.db, env.mailer, env.config)
    const reminder = env.mailer.sent.find((m) => m.to === 'dg@p.test' && m.subject.includes('Rappel'))!
    expect(reminder.text).toContain('0757820485')
    expect(reminder.text).toContain('contact@windsit-digital.com')
    const suspended = env.mailer.sent.find((m) => m.to === 'dg@e.test' && m.subject.includes('Accès suspendu'))!
    expect(suspended.text).toContain('désactivés temporairement')
    expect(suspended.text).toContain('0757820485')
    void runAutoSuspension
  })
  it('activés : les e-mails parlent du paiement en ligne', async () => {
    const near = await createOrg(op, 'Proche SA', 'dg@p.test', 'DG', 'essentiel')
    await env.db.query(`update organisations set subscription_ends_on = current_date + 3 where id = $1`, [near])
    await sendRenewalReminders(env.db, env.mailer, env.config)
    const reminder = env.mailer.sent.find((m) => m.to === 'dg@p.test' && m.subject.includes('Rappel'))!
    expect(reminder.text).toContain('paiement en ligne')
    expect(reminder.text).not.toContain('désactivés temporairement')
  })
})
