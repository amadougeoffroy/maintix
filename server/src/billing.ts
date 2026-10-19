/** Abonnements : paiement (Jèko), échéances, suspensions motivées et levée. Montants en FCFA entiers. */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Db } from './db'
import type { Config } from './config'
import { emailParts } from './emailTemplate'
import type { Mailer } from './mailer'
import { getPlan } from './plans'
import { buildReceiptPdf } from './pdf'

export { MONTHS_CHOICES } from '../../shared/pricing'
export const PAY_METHODS = [['wave', 'Wave'], ['orange', 'Orange Money'], ['mtn', 'MTN MoMo'], ['moov', 'Moov Money'], ['djamo', 'Djamo']] as const

export const todayStr = (now = Date.now()) => new Date(now).toISOString().slice(0, 10)
/** Ajoute des mois à une date AAAA-MM-JJ en restant dans le mois cible (31 janvier + 1 mois = 28/29 février). */
export function addMonths(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = m - 1 + n
  const ty = y + Math.floor(t / 12)
  const tm = ((t % 12) + 12) % 12
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate()
  return `${ty}-${String(tm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}

/* ---------- passerelle de paiement ---------- */
export interface JekoCreds { apiKey: string; apiKeyId: string; storeId: string }
export interface Gateway {
  createPayment(i: { reference: string; amount: number; method: string; successUrl: string; errorUrl: string }): Promise<{ providerId: string; redirectUrl: string }>
  listStores(): Promise<{ id: string; name: string }[]>
}
const JEKO = 'https://api.jeko.africa'

export function jekoGateway(c: JekoCreds, f: typeof fetch = fetch): Gateway {
  const headers = { 'X-API-KEY': c.apiKey, 'X-API-KEY-ID': c.apiKeyId, 'content-type': 'application/json' }
  return {
    async createPayment(i) {
      const res = await f(`${JEKO}/partner_api/payment_requests`, {
        method: 'POST', headers, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          storeId: c.storeId, amountCents: i.amount * 100, currency: 'XOF', reference: i.reference,
          paymentDetails: { type: 'redirect', data: { paymentMethod: i.method, successUrl: i.successUrl, errorUrl: i.errorUrl } },
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { id?: string; redirectUrl?: string; errorReason?: string }
      if (!res.ok || !data.id || !data.redirectUrl) throw new Error(`jeko ${res.status} ${data.errorReason ?? ''}`.trim())
      return { providerId: data.id, redirectUrl: data.redirectUrl }
    },
    async listStores() {
      const res = await f(`${JEKO}/partner_api/stores`, { headers, signal: AbortSignal.timeout(15000) })
      if (!res.ok) throw new Error(`jeko ${res.status}`)
      const data = (await res.json().catch(() => [])) as unknown
      const arr = (Array.isArray(data) ? data : (data as { items?: unknown[]; data?: unknown[] }).items ?? (data as { data?: unknown[] }).data ?? []) as { id: string; name?: string; storeName?: string }[]
      return arr.map((s) => ({ id: s.id, name: s.name ?? s.storeName ?? s.id }))
    },
  }
}

/** Signature HMAC-SHA256 (hexadécimal) du corps brut, comparée en temps constant. */
export function verifyJekoSignature(rawBody: string, signature: string | undefined, secret: string): boolean {
  if (!signature || !secret) return false
  const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'))
  const got = Buffer.from(signature.trim().toLowerCase())
  return got.length === expected.length && timingSafeEqual(got, expected)
}

/* ---------- suspension ---------- */
export async function suspendOrg(db: Pick<Db, 'query'>, orgId: string, code: string, detail: string | null) {
  const r = await db.query(`update organisations set status='suspended', suspended_at=now(), suspended_reason_code=$2, suspended_reason=$3 where id=$1 and kind='client' returning id`, [orgId, code, detail])
  if (!r.rows.length) return false
  // déconnexion immédiate des comptes de l'entreprise (les opérateurs qui y sont entrés gardent leur session)
  await db.query(`delete from sessions where org_id = $1 and user_id not in (select user_id from operators)`, [orgId])
  return true
}
export const reactivateOrg = (db: Pick<Db, 'query'>, orgId: string) =>
  db.query(`update organisations set status='active', suspended_at=null, suspended_reason=null, suspended_reason_code=null where id=$1 returning id`, [orgId])

/** Suspend les entreprises dont l'essai ou l'abonnement est échu. Renvoie celles qui viennent d'être suspendues. */
export async function runAutoSuspension(db: Db, today = todayStr()) {
  const rows = (await db.query<{ id: string; name: string; code: string }>(
    `select id, name, case when subscription_ends_on is not null and subscription_ends_on < $1 then 'subscription_expired' else 'trial_expired' end as code
       from organisations
      where kind = 'client' and status = 'active'
        and ((subscription_ends_on is not null and subscription_ends_on < $1)
          or (plan = 'essai' and subscription_ends_on is null and trial_ends_on is not null and trial_ends_on < $1))`, [today],
  )).rows
  for (const o of rows) {
    const label = o.code === 'trial_expired' ? 'La période d’essai est terminée.' : 'L’échéance de l’offre souscrite est atteinte.'
    await suspendOrg(db, o.id, o.code, label)
    await db.query(`insert into audit_log (org_id, user_id, action, detail) values ($1, null, 'org.auto_suspend', $2)`, [o.id, JSON.stringify({ code: o.code })])
  }
  return rows
}

/** Enregistre un paiement reçu : prolonge l'abonnement, applique l'offre, lève la suspension si le paiement peut la lever. */
export async function applyPayment(db: Db, paymentId: string, today = todayStr()): Promise<{ applied: boolean; lifted: boolean; orgId?: string }> {
  return db.tx(async (t) => {
    const p = (await t.query<{ id: string; org_id: string; plan: string; months: number; status: string }>('select id, org_id, plan, months, status from payments where id = $1 for update', [paymentId])).rows[0]
    if (!p || p.status === 'paid') return { applied: false, lifted: false, orgId: p?.org_id }
    const org = (await t.query<{ subscription_ends_on: string | null; status: string; payable: boolean | null }>(
      `select to_char(o.subscription_ends_on, 'YYYY-MM-DD') as subscription_ends_on, o.status, r.lifted_by_payment as payable
         from organisations o left join suspension_reasons r on r.code = o.suspended_reason_code where o.id = $1 for update of o`, [p.org_id],
    )).rows[0]
    const start = org.subscription_ends_on && org.subscription_ends_on > today ? org.subscription_ends_on : today
    const end = addMonths(start, p.months)
    const year = Number(today.slice(0, 4))
    const n = (await t.query<{ last: number }>(`insert into receipt_counters (year, last) values ($1, 1) on conflict (year) do update set last = receipt_counters.last + 1 returning last`, [year])).rows[0].last
    const receipt = `REC-${year}-${String(n).padStart(4, '0')}` // séquence continue, attribuée au paiement
    await t.query(`update payments set status='paid', paid_at=now(), period_start=$2, period_end=$3, receipt_number=$4 where id=$1`, [p.id, start, end, receipt])
    const plan = await getPlan(t, p.plan)
    await t.query(
      `update organisations set plan=$2, subscription_ends_on=$3, trial_ends_on=null,
              max_techs=coalesce($4, max_techs), max_elevators=coalesce($5, max_elevators), overage_mode=coalesce($6, overage_mode) where id=$1`,
      [p.org_id, p.plan, end, plan?.maxTechs ?? null, plan?.maxElevators ?? null, plan?.overageMode ?? null],
    )
    if (plan) await t.query('update organisations set price_monthly=$2, extra_tech_price=$3, extra_elevator_price=$4 where id=$1', [p.org_id, plan.priceMonthly, plan.extraTechPrice, plan.extraElevatorPrice])
    const lifted = org.status === 'suspended' && org.payable === true
    if (lifted) await reactivateOrg(t, p.org_id)
    await t.query(`insert into audit_log (org_id, user_id, action, detail) values ($1, null, 'payment.applied', $2)`, [p.org_id, JSON.stringify({ paymentId: p.id, plan: p.plan, months: p.months, periodEnd: end, lifted })])
    return { applied: true, lifted, orgId: p.org_id }
  })
}

/** Tâche périodique : suspend les entreprises échues et prévient leurs administrateurs (lien vers le paiement). */
export async function sweepSubscriptions(db: Db, mailer: Mailer, config: Config, today = todayStr()) {
  const suspended = await runAutoSuspension(db, today)
  await sendRenewalReminders(db, mailer, config, today)
  for (const o of suspended) {
    const admins = (await db.query<{ email: string; full_name: string }>(`select u.email, m.full_name from members m join users u on u.id = m.user_id where m.org_id = $1 and m.role = 'admin'`, [o.id])).rows
    const trial = o.code === 'trial_expired'
    for (const a of admins) {
      await mailer.send({
        to: a.email,
        subject: `Accès suspendu : ${trial ? 'fin de la période d’essai' : 'échéance de votre offre'}`,
        ...emailParts({
          title: `Bonjour ${a.full_name},`,
          paragraphs: [trial ? `La période d’essai de « ${o.name} » est terminée et l’accès à Maintix est suspendu.` : `L’échéance de l’offre souscrite par « ${o.name} » est atteinte et l’accès à Maintix est suspendu.`, 'Vos données sont conservées. Choisissez votre offre et réglez en ligne (1, 3, 6 ou 12 mois) : l’accès est rétabli dès la confirmation du paiement.'],
          facts: [['Entreprise', o.name]],
          button: { label: 'Payer et rétablir l’accès', url: `${config.appUrl}/#/` },
        }),
      }).catch(() => {})
    }
  }
  return suspended
}

/** Rappels d'échéance : un e-mail aux administrateurs quand il reste 7 jours ou moins, puis quand il reste 1 jour ou moins (une fois chacun). */
export async function sendRenewalReminders(db: Db, mailer: Mailer, config: Config, today = todayStr()) {
  const orgs = (await db.query<{ id: string; name: string; plan: string; ends_on: string; days: number }>(
    `select id, name, plan, ends_on, (ends_on::date - $1::date) as days from (
       select id, name, plan, to_char(coalesce(subscription_ends_on, case when plan = 'essai' then trial_ends_on end), 'YYYY-MM-DD') as ends_on
         from organisations where kind = 'client' and status = 'active') o
      where ends_on is not null and ends_on::date >= $1::date and (ends_on::date - $1::date) <= 7`, [today],
  )).rows
  const sent: { org: string; kind: string }[] = []
  for (const o of orgs) {
    const kind = o.days <= 1 ? 'd1' : 'd7'
    const fresh = (await db.query(`insert into renewal_reminders (org_id, ends_on, kind) values ($1,$2,$3) on conflict do nothing returning org_id`, [o.id, o.ends_on, kind])).rows.length
    if (!fresh) continue
    const admins = (await db.query<{ email: string; full_name: string }>(`select u.email, m.full_name from members m join users u on u.id = m.user_id where m.org_id = $1 and m.role = 'admin'`, [o.id])).rows
    const what = o.plan === 'essai' ? 'votre période d’essai' : 'votre abonnement'
    const when = o.days <= 0 ? 'se termine aujourd’hui' : o.days === 1 ? 'se termine demain' : `se termine dans ${o.days} jours`
    for (const a of admins) {
      await mailer.send({
        to: a.email,
        subject: `${o.days <= 1 ? 'Dernier rappel' : 'Rappel'} : ${what} ${when}`,
        ...emailParts({
          preheader: `Renouvelez avant le ${o.ends_on.split('-').reverse().join('/')} pour ne pas perdre l’accès.`,
          title: `Bonjour ${a.full_name},`,
          paragraphs: [`${what.charAt(0).toUpperCase() + what.slice(1)} de « ${o.name} » ${when}.`, 'Renouvelez-le avant cette date : passé ce délai, l’accès est suspendu automatiquement (vos données restent conservées). Le paiement en ligne (1, 3, 6 ou 12 mois) rétablit ou prolonge l’accès immédiatement.'],
          facts: [['Entreprise', o.name], ['Échéance', o.ends_on.split('-').reverse().join('/')]],
          button: { label: 'Renouveler maintenant', url: `${config.appUrl}/#/office/settings/abonnement` },
        }),
      }).catch(() => {})
    }
    sent.push({ org: o.name, kind })
  }
  return sent
}

/** Envoie le reçu PDF d'un paiement confirmé aux administrateurs de l'entreprise. */
export async function sendReceipt(db: Db, mailer: Mailer, config: Config, paymentId: string) {
  const r = await loadReceipt(db, paymentId)
  if (!r) return false
  const admins = (await db.query<{ email: string; full_name: string }>(`select u.email, m.full_name from members m join users u on u.id = m.user_id where m.org_id = $1 and m.role = 'admin'`, [r.orgId])).rows
  const pdf = await buildReceiptPdf({ ...r.data, legal: config.legal, appUrl: config.appUrl })
  const fr = (n: number) => `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FCFA`
  const d = r.data
  for (const a of admins) {
    await mailer.send({
      to: a.email,
      subject: `Reçu de paiement ${d.receiptNumber} : merci`,
      ...emailParts({
        preheader: `Votre paiement de ${fr(d.amount)} est bien reçu.`,
        title: `Merci, ${a.full_name}`,
        paragraphs: ['Nous avons bien reçu votre paiement : votre abonnement Maintix est à jour. Votre reçu est joint à ce message (PDF).'],
        facts: [['Reçu', d.receiptNumber], ['Offre', `${d.planName} · ${d.months} mois`], ['Montant payé', fr(d.amount)], ['Valable jusqu’au', d.periodEnd.split('-').reverse().join('/')]],
        button: { label: 'Accéder à la plateforme', url: `${config.appUrl}/#/` },
      }, [{ filename: `recu-${d.receiptNumber}.pdf`, content: pdf, contentType: 'application/pdf' }]),
    }).catch(() => {})
  }
  return true
}

/** Données d'un reçu (paiement confirmé uniquement). */
export async function loadReceipt(db: Pick<Db, 'query'>, paymentId: string, orgId?: string) {
  const p = (await db.query<{
    id: string; org_id: string; org: string; plan: string; months: number; amount: number; list_amount: number | null; discount_pct: number; source: string; method: string | null
    reference: string; receipt_number: string | null; paid_at: string; period_start: string; period_end: string
  }>(
    `select p.id, p.org_id, o.name as org, p.plan, p.months, p.amount, p.list_amount, p.discount_pct, p.source, p.method, p.reference, p.receipt_number, p.paid_at,
            to_char(p.period_start, 'YYYY-MM-DD') as period_start, to_char(p.period_end, 'YYYY-MM-DD') as period_end
       from payments p join organisations o on o.id = p.org_id where p.id = $1 and p.status = 'paid' and p.receipt_number is not null ${orgId ? 'and p.org_id = $2' : ''}`,
    orgId ? [paymentId, orgId] : [paymentId],
  )).rows[0]
  if (!p) return null
  const plan = await getPlan(db, p.plan)
  return {
    orgId: p.org_id,
    data: {
      receiptNumber: p.receipt_number!, orgName: p.org, planName: plan?.name ?? p.plan, months: p.months, amount: p.amount, listAmount: p.list_amount ?? p.amount, discountPct: p.discount_pct,
      source: p.source as 'jeko' | 'manual', method: p.method, reference: p.reference, paidAt: new Date(p.paid_at).toISOString(), periodStart: p.period_start, periodEnd: p.period_end,
    },
  }
}
