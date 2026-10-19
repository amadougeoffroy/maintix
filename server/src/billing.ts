/** Abonnements : paiement (Jèko), échéances, suspensions motivées et levée. Montants en FCFA entiers. */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Db } from './db'
import type { Config } from './config'
import { emailParts } from './emailTemplate'
import type { Mailer } from './mailer'
import { getPlan } from './plans'

export const MONTHS_CHOICES = [1, 3, 6, 12] as const
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
    await t.query(`update payments set status='paid', paid_at=now(), period_start=$2, period_end=$3 where id=$1`, [p.id, start, end])
    const plan = await getPlan(t, p.plan)
    await t.query(
      `update organisations set plan=$2, subscription_ends_on=$3, trial_ends_on=null,
              max_techs=coalesce($4, max_techs), max_elevators=coalesce($5, max_elevators) where id=$1`,
      [p.org_id, p.plan, end, plan?.maxTechs ?? null, plan?.maxElevators ?? null],
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
