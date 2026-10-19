import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildReceiptPdf } from '../src/pdf'
import { loadReceipt, type Gateway } from '../src/billing'
import { DISCOUNT_PCT, priceFor } from '../../shared/pricing'
import { api, bootstrap, createOrg, login, makeEnv, type Env } from './helpers'

const pdfText = (b: Buffer) => [...b.toString('latin1').matchAll(/<([0-9a-f]+)>/gi)].map((m) => Buffer.from(m[1], 'hex').toString('latin1')).join('')
const created: { reference: string; amount: number }[] = []
const gateway: Gateway = {
  createPayment: async (i) => { created.push(i); return { providerId: `p${created.length}`, redirectUrl: `https://pay.test/${i.reference}` } },
  listStores: async () => [],
}
let env: Env
let op: ReturnType<typeof api>
beforeEach(async () => {
  created.length = 0
  env = await makeEnv({ LEGAL_NAME: 'Windsit Digital', LEGAL_EMAIL: 'contact@windsit-digital.com' }, { gateway: () => gateway })
  op = api(env, await bootstrap(env, 'ada@a.test'))
  await op.fetch('PUT', '/api/operator/payment-settings', { apiKey: 'k', apiKeyId: 'i', storeId: 's', webhookSecret: 'sec' })
})
const hook = (reference: string) => {
  const raw = JSON.stringify({ status: 'success', transactionType: 'payment', transactionDetails: { reference } })
  return env.app.request('/api/public/jeko/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'jeko-event': 'TRANSACTION_COMPLETED', 'jeko-signature': createHmac('sha256', 'sec').update(raw).digest('hex') }, body: raw })
}

describe('remises de durée', () => {
  it('calcule 0 % à 1 et 3 mois, 10 % à 6 mois, 20 % à 12 mois', () => {
    expect(DISCOUNT_PCT).toEqual({ 1: 0, 3: 0, 6: 10, 12: 20 })
    expect(priceFor(35000, 1)).toMatchObject({ list: 35000, total: 35000, discount: 0 })
    expect(priceFor(35000, 3)).toMatchObject({ list: 105000, total: 105000, discountPct: 0 })
    expect(priceFor(35000, 6)).toMatchObject({ list: 210000, total: 189000, discount: 21000, discountPct: 10 })
    expect(priceFor(35000, 12)).toMatchObject({ list: 420000, total: 336000, discount: 84000, discountPct: 20 })
    expect(priceFor(33333, 6).total).toBe(Math.round(33333 * 6 * 0.9)) // arrondi au franc
  })
  it('le paiement en ligne applique la remise et l’enregistre', async () => {
    await createOrg(op, 'Cliente SA', 'dg@c.test', 'DG')
    const dg = api(env, await login(env, 'dg@c.test'))
    const o = await (await dg.get('/api/billing/overview')).json()
    expect(o.discounts).toEqual({ 1: 0, 3: 0, 6: 10, 12: 20 })
    const r6 = await (await dg.post('/api/billing/checkout', { plan: 'essentiel', months: 6, method: 'wave' })).json()
    expect(r6).toMatchObject({ amount: 189000, listAmount: 210000, discountPct: 10 })
    const r12 = await (await dg.post('/api/billing/checkout', { plan: 'essentiel', months: 12, method: 'wave' })).json()
    expect(r12).toMatchObject({ amount: 336000, discountPct: 20 })
    const r3 = await (await dg.post('/api/billing/checkout', { plan: 'essentiel', months: 3, method: 'wave' })).json()
    expect(r3).toMatchObject({ amount: 105000, discountPct: 0 })
    expect(created.map((x) => x.amount)).toEqual([189000, 336000, 105000]) // le montant envoyé à Jèko est le montant remisé
  })
  it('un paiement hors ligne reprend la remise, sauf si un montant est saisi', async () => {
    const id = await createOrg(op, 'Cliente SA', 'dg@c.test', 'DG')
    await op.post(`/api/operator/orgs/${id}/payments`, { plan: 'essentiel', months: 12 })
    await op.post(`/api/operator/orgs/${id}/payments`, { plan: 'essentiel', months: 6, amount: 100000 })
    const rows = (await env.db.query<{ amount: number; list_amount: number; discount_pct: number }>('select amount, list_amount, discount_pct from payments order by created_at')).rows
    expect(rows).toEqual([{ amount: 336000, list_amount: 420000, discount_pct: 20 }, { amount: 100000, list_amount: 210000, discount_pct: 0 }])
  })
})

describe('reçus de paiement', () => {
  async function paid(email: string, name: string, months = 6) {
    await createOrg(op, name, email, 'DG')
    const dg = api(env, await login(env, email))
    const r = await (await dg.post('/api/billing/checkout', { plan: 'essentiel', months, method: 'wave' })).json()
    await hook(created.at(-1)!.reference)
    return { dg, paymentId: r.paymentId as string }
  }
  it('numérote les reçus dans une séquence continue', async () => {
    const a = await paid('dg@a.test', 'A SA')
    const b = await paid('dg@b.test', 'B SA', 12)
    const year = new Date().getFullYear()
    const nums = (await env.db.query<{ receipt_number: string }>('select receipt_number from payments order by paid_at, receipt_number')).rows.map((r) => r.receipt_number)
    expect(nums).toEqual([`REC-${year}-0001`, `REC-${year}-0002`])
    void a; void b
  })
  it('un paiement non confirmé n’a ni numéro ni reçu', async () => {
    await createOrg(op, 'Cliente SA', 'dg@c.test', 'DG')
    const dg = api(env, await login(env, 'dg@c.test'))
    const r = await (await dg.post('/api/billing/checkout', { plan: 'essentiel', months: 1, method: 'wave' })).json()
    expect(await loadReceipt(env.db, r.paymentId)).toBeNull()
    expect((await dg.get(`/api/billing/payments/${r.paymentId}/receipt`)).status).toBe(404)
  })
  it('le PDF détaille l’offre, la période, la remise et le total payé', async () => {
    const { paymentId } = await paid('dg@c.test', 'Cliente SA', 6)
    const r = (await loadReceipt(env.db, paymentId))!
    const pdf = await buildReceiptPdf({ ...r.data, legal: env.config.legal, appUrl: 'https://x', compress: false })
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    const text = pdfText(pdf)
    for (const needle of ['REÇU DE PAIEMENT', r.data.receiptNumber, 'Cliente SA', 'Essentiel', '6 mois', '210 000 FCFA', 'Remise de durée (10 %)', '21 000 FCFA', '189 000 FCFA', 'Total payé', 'ACQUITT', 'Wave', 'Windsit Digital']) expect(text).toContain(needle)
  })
  it('est téléchargeable par l’entreprise concernée uniquement, et par les opérateurs', async () => {
    const a = await paid('dg@a.test', 'A SA')
    const b = await paid('dg@b.test', 'B SA')
    const mine = await a.dg.get(`/api/billing/payments/${a.paymentId}/receipt`)
    expect(mine.status).toBe(200)
    expect(mine.headers.get('content-type')).toBe('application/pdf')
    expect(mine.headers.get('content-disposition')).toContain('recu-REC-')
    expect((await a.dg.get(`/api/billing/payments/${b.paymentId}/receipt`)).status).toBe(404) // pas celui d'une autre entreprise
    expect((await op.get(`/api/operator/payments/${b.paymentId}/receipt`)).status).toBe(200)
    expect((await a.dg.get(`/api/operator/payments/${a.paymentId}/receipt`)).status).toBe(403)
  })
  it('est envoyé par e-mail (PDF joint) aux administrateurs à la confirmation, y compris pour un paiement hors ligne', async () => {
    const { paymentId } = await paid('dg@c.test', 'Cliente SA')
    const mail = env.mailer.sent.filter((m) => m.to === 'dg@c.test' && m.subject.startsWith('Reçu de paiement'))
    expect(mail).toHaveLength(1)
    expect(mail[0].attachments![0]).toMatchObject({ contentType: 'application/pdf' })
    expect(mail[0].attachments![0].filename).toMatch(/^recu-REC-\d{4}-0001\.pdf$/)
    expect(mail[0].html).toContain('189 000 FCFA')
    const id = await createOrg(op, 'Hors ligne SA', 'dg@h.test', 'DG')
    await op.post(`/api/operator/orgs/${id}/payments`, { plan: 'essentiel', months: 1 })
    expect(env.mailer.sent.some((m) => m.to === 'dg@h.test' && m.subject.includes('REC-'))).toBe(true)
    void paymentId
  })
  it('un second webhook ne génère ni nouveau numéro ni second e-mail', async () => {
    await paid('dg@c.test', 'Cliente SA')
    await hook(created.at(-1)!.reference)
    expect((await env.db.query('select 1 from payments where receipt_number is not null')).rows).toHaveLength(1)
    expect(env.mailer.sent.filter((m) => m.to === 'dg@c.test' && m.subject.startsWith('Reçu'))).toHaveLength(1)
  })
})

describe('évolution mensuelle des encaissements par offre', () => {
  it('ventile les paiements des 12 derniers mois par mois et par offre, avec les remises accordées', async () => {
    const a = await createOrg(op, 'A SA', 'dg@a.test', 'DG')
    const b = await createOrg(op, 'B SA', 'dg@b.test', 'DG')
    await op.post(`/api/operator/orgs/${a}/payments`, { plan: 'essentiel', months: 6 }) // 189 000, remise 21 000
    await op.post(`/api/operator/orgs/${b}/payments`, { plan: 'pro', months: 1 }) // 90 000
    await op.post(`/api/operator/orgs/${b}/payments`, { plan: 'essentiel', months: 1 }) // 35 000
    // un paiement d'il y a 3 mois
    const old = (await env.db.query<{ id: string }>(`select id from payments where plan = 'essentiel' and months = 1`)).rows[0].id
    await env.db.query(`update payments set paid_at = now() - interval '3 months' where id = $1`, [old])
    const f = await (await op.get('/api/operator/finance')).json()
    expect(f.monthly.months).toHaveLength(12)
    expect(new Set(f.monthly.months).size).toBe(12)
    expect(f.monthly.months.at(-1)).toBe(new Date().toISOString().slice(0, 7))
    const cell = (month: string, plan: string) => f.monthly.cells.find((c: { month: string; plan: string }) => c.month === month && c.plan === plan)
    const now = f.monthly.months.at(-1)
    expect(cell(now, 'essentiel')).toMatchObject({ amount: 189000, n: 1, discount: 21000 })
    expect(cell(now, 'pro')).toMatchObject({ amount: 90000, n: 1 })
    expect(cell(f.monthly.months.at(-4), 'essentiel')).toMatchObject({ amount: 35000 })
    expect(f.monthly.plans.map((p: { code: string }) => p.code).sort()).toEqual(['essentiel', 'pro'])
    expect(f.monthly.plans.find((p: { code: string }) => p.code === 'pro').name).toBe('Pro')
    expect(f.monthly.discounts).toBe(21000)
    expect(f.collected.total).toBe(189000 + 90000 + 35000)
  })
})
