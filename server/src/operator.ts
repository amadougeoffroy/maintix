import { emailParts } from './emailTemplate'
import { randomUUID } from 'node:crypto'
import type { Context, Hono } from 'hono'
import { z } from 'zod'
import type { Principal } from './auth'
import type { Config } from './config'
import type { Db } from './db'
import type { Mailer } from './mailer'
import { estimateAmount, getPlan, loadPlans, type OrgOffer, type Usage } from './plans'
import { applyPayment, getPaymentSwitch, setPaymentSwitch, getVat, loadReceipt, setVat, reactivateOrg, sendReceipt, suspendOrg, todayStr, type Gateway, type JekoCreds } from './billing'
import { buildReceiptPdf } from './pdf'
import { priceFor } from '../../shared/pricing'
import { clearSetting, getSettings, setSetting, SETTING_KEYS, type SettingKey } from './secrets'

type Env = { Variables: { who: Principal } }
type Mw = (c: Context<Env>, next: () => Promise<void>) => Promise<Response | void>

export interface OperatorDeps {
  db: Db
  config: Config
  mailer: Mailer
  requireAuth: Mw
  limit: (key: string, max: number, windowMs: number) => Promise<boolean>
  ip: (c: Context) => string
  audit: (orgId: string, userId: string | null, action: string, collection?: string, docId?: string, detail?: unknown, exec?: Pick<Db, 'query'>) => Promise<unknown>
  /** crée un jeton de connexion et renvoie l'adresse complète du lien */
  loginUrl: (userId: string) => Promise<string>
  uid: (prefix: string) => string
  /** fabrique la passerelle de paiement à partir des clés enregistrées */
  makeGateway: (c: JekoCreds) => Gateway
}

const emailSchema = z.string().trim().toLowerCase().email().max(200)
const HOUR = 3_600_000
const today = () => new Date().toISOString().slice(0, 10)
const addDays = (d: string, n: number) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const NIL = '00000000-0000-0000-0000-000000000000' // « entreprise » des actions de plateforme dans le journal
const pid = (c: Context) => c.req.param('id') ?? ''
const monthRe = /^\d{4}-(0[1-9]|1[0-2])$/

interface OrgRow {
  id: string; name: string; status: 'active' | 'suspended'; suspended_reason: string | null; created_at: string; plan: string; trial_ends_on: string | null
  max_techs: number | null; max_elevators: number | null; price_monthly: number; extra_tech_price: number; extra_elevator_price: number; notes: string
  subscription_ends_on: string | null; suspended_reason_code: string | null; suspended_reason_label: string | null; payable: boolean | null
  overage_mode: 'bill' | 'block'
  members: number; members_logged_in: number; techs: number; elevators: number; clients: number; jobs30: number; last_activity: string | null; last_login: string | null
}

const ORG_SQL = `
  select o.id, o.name, o.status, o.suspended_reason, o.created_at, o.plan, to_char(o.trial_ends_on, 'YYYY-MM-DD') as trial_ends_on,
         to_char(o.subscription_ends_on, 'YYYY-MM-DD') as subscription_ends_on, o.suspended_reason_code,
         (select r.label from suspension_reasons r where r.code = o.suspended_reason_code) as suspended_reason_label,
         (select r.lifted_by_payment from suspension_reasons r where r.code = o.suspended_reason_code) as payable,
         o.overage_mode, o.max_techs, o.max_elevators, o.price_monthly, o.extra_tech_price, o.extra_elevator_price, o.notes,
         (select count(*)::int from members m where m.org_id = o.id) as members,
         (select count(*)::int from members m where m.org_id = o.id and m.role = 'tech') as techs,
         (select count(*)::int from docs d where d.org_id = o.id and d.collection = 'elevators' and not d.deleted) as elevators,
         (select count(*)::int from docs d where d.org_id = o.id and d.collection = 'clients' and not d.deleted) as clients,
         (select count(*)::int from docs d where d.org_id = o.id and d.collection = 'jobs' and not d.deleted and d.data->>'createdAt' >= $1) as jobs30,
         (select max(d.updated_at) from docs d where d.org_id = o.id) as last_activity,
         (select max(a.at) from audit_log a where a.org_id = o.id and a.action = 'login') as last_login,
         (select count(distinct a.user_id)::int from audit_log a where a.org_id = o.id and a.action = 'login') as members_logged_in
    from organisations o`
const ORG_FILTER = `o.kind = 'client'`

const offerOf = (r: OrgRow): OrgOffer => ({ overageMode: r.overage_mode, plan: r.plan, maxTechs: r.max_techs, maxElevators: r.max_elevators, priceMonthly: r.price_monthly, extraTechPrice: r.extra_tech_price, extraElevatorPrice: r.extra_elevator_price })

export function shapeOrg(r: OrgRow, now = today()) {
  const usage: Usage & { members: number; loggedIn: number } = { techs: r.techs, elevators: r.elevators, clients: r.clients, jobs30: r.jobs30, members: r.members, loggedIn: r.members_logged_in }
  const est = estimateAmount(offerOf(r), usage)
  return {
    id: r.id, name: r.name, status: r.status, suspendedReason: r.suspended_reason, createdAt: r.created_at,
    suspension: r.status === 'suspended' ? { code: r.suspended_reason_code, label: r.suspended_reason_label, detail: r.suspended_reason, payable: !!r.payable } : null,
    offer: { ...offerOf(r), trialEndsOn: r.trial_ends_on, subscriptionEndsOn: r.subscription_ends_on, notes: r.notes },
    usage, lastActivity: r.last_activity, lastLogin: r.last_login, everLoggedIn: r.members_logged_in > 0, estimate: est,
    flags: { overTechs: est.overTechs > 0, overElevators: est.overElevators > 0, trialExpired: r.plan === 'essai' && !!r.trial_ends_on && r.trial_ends_on < now, subscriptionExpired: !!r.subscription_ends_on && r.subscription_ends_on < now },
  }
}

export async function loadOrgs(db: Db, id?: string) {
  const since = new Date(Date.now() - 30 * 86400_000).toISOString()
  const rows = (await db.query<OrgRow>(`${ORG_SQL} where ${ORG_FILTER} ${id ? 'and o.id = $2' : ''} order by o.created_at desc`, id ? [since, id] : [since])).rows
  return rows.map((r) => shapeOrg(r))
}

/** Crée une entreprise avec son premier administrateur (compte créé si l'adresse est nouvelle). */
export async function createOrganisationWithAdmin(db: Db, uid: (p: string) => string, input: { name: string; adminName: string; adminEmail: string; plan?: string }) {
  const preset = (await getPlan(db, input.plan ?? 'essai')) ?? (await loadPlans(db))[0]
  const orgId = randomUUID()
  const techId = uid('t')
  const trialEnds = preset.trialDays ? addDays(today(), preset.trialDays) : null
  return db.tx(async (t) => {
    await t.query(
      `insert into organisations (id, name, plan, trial_ends_on, max_techs, max_elevators, price_monthly, extra_tech_price, extra_elevator_price, overage_mode) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [orgId, input.name, preset.code, trialEnds, preset.maxTechs, preset.maxElevators, preset.priceMonthly, preset.extraTechPrice, preset.extraElevatorPrice, preset.overageMode ?? 'bill'],
    )
    const found = (await t.query<{ id: string }>('select id from users where email = $1', [input.adminEmail])).rows[0]
    const userId = found?.id ?? randomUUID()
    if (!found) await t.query('insert into users (id, email) values ($1,$2)', [userId, input.adminEmail])
    await t.query(`insert into members (user_id, org_id, role, full_name, tech_id) values ($1,$2,'admin',$3,$4)`, [userId, orgId, input.adminName, techId])
    await t.query(`insert into docs (org_id, collection, id, data, updated_by) values ($1,'techs',$2,$3,$4)`, [orgId, techId, JSON.stringify({ id: techId, name: input.adminName, role: 'bureau', certs: [] }), userId])
    return { orgId, userId, existingUser: !!found }
  })
}

export function registerOperatorRoutes(app: Hono<Env>, d: OperatorDeps) {
  const { db, config, mailer, requireAuth, limit, ip, audit, loginUrl, uid } = d
  const requireOperator: Mw = async (c, next) => (c.get('who').operator ? next() : c.json({ error: 'forbidden' }, 403))
  const op = [requireAuth, requireOperator] as const

  async function welcomeAdmin(userId: string, email: string, adminName: string, orgName: string, existingUser: boolean) {
    // e-mail de présentation d'abord : l'e-mail d'invitation arrive ainsi en dernier, en haut de la boîte de réception
    await presentationMail(email, adminName, orgName).catch(() => {}) // promotionnel : son échec ne doit pas faire échouer la création
    const url = await loginUrl(userId)
    await mailer.send({
      to: email,
      subject: `Votre espace Maintix « ${orgName} » est prêt`,
      ...emailParts({
        preheader: `Votre espace « ${orgName} » est prêt.`,
        title: `Bonjour ${adminName},`,
        paragraphs: [`Votre espace Maintix vient d'être créé et vous en êtes l'administrateur${existingUser ? ' (il s\'ajoute à vos accès existants)' : ''}.`, 'Au premier accès, une visite guidée vous présente les premières étapes : renseigner votre entreprise, inviter votre équipe, importer votre parc d\'ascenseurs.'],
        facts: [['Entreprise', orgName], ['Rôle', 'Administrateur'], ['Compte', email]],
        button: { label: 'Accéder à la plateforme', url },
        notes: ['Ce lien est valable 15 minutes et ne peut être utilisé qu\'une seule fois.', 'À bientôt, l\'équipe Maintix'],
      }),
    })
  }

  /** Second e-mail, promotionnel : présente Maintix à la nouvelle entreprise (avantages, démarrage, lien vers le site). */
  async function presentationMail(email: string, adminName: string, orgName: string) {
    await mailer.send({
      to: email,
      subject: `Maintix pour « ${orgName} » : tout ce que vous pouvez faire`,
      ...emailParts({
        preheader: 'Visites sur mobile, rapports scellés, planning, facturation : découvrez Maintix.',
        title: `Bienvenue chez Maintix, ${adminName}`,
        paragraphs: ['Maintix réunit vos techniciens, votre bureau et vos clients sur une seule plateforme pensée pour la maintenance d’ascenseurs. Chaque visite, tracée.', 'Voici ce que votre équipe peut faire dès aujourd’hui :'],
        bullets: [
          { title: 'Visites sur téléphone, même sans réseau', text: 'Check-list guidée par zone, mesures, photos et signature du client. Tout se synchronise au retour du réseau.' },
          { title: 'Rapports scellés', text: 'Chaque rapport est figé à la clôture avec une empreinte SHA-256 et part en PDF chez le client en un clic.' },
          { title: 'Planning et astreinte', text: 'Affectez les missions, suivez les habilitations et alertez le bon technicien, avec relance automatique.' },
          { title: 'Parc, contrats, devis et factures', text: 'Dossier de chaque appareil, indexations, factures numérotées en FCFA et journal des ventes exportable.' },
          { title: 'QR code dans chaque cabine', text: 'Vos clients signalent une panne et suivent la réparation, sans compte à créer.' },
        ],
        button: { label: 'Découvrir Maintix', url: config.appUrl },
        notes: ['Pour démarrer : renseignez votre entreprise, invitez votre équipe, importez votre parc d’ascenseurs. Une visite guidée vous accompagne à votre première connexion.', 'Une question ? Contactez votre interlocuteur Maintix.'],
      }),
    })
  }

  /* ---------- vue d'ensemble ---------- */
  app.get('/api/operator/overview', ...op, async (c) => {
    const orgs = await loadOrgs(db)
    const pending = (await db.query<{ n: number }>(`select count(*)::int as n from signup_requests where status = 'pending'`)).rows[0].n
    return c.json({ orgs, pendingSignups: pending, plans: await loadPlans(db) })
  })

  /* ---------- création d'une entreprise + premier administrateur ---------- */
  app.post('/api/operator/orgs', ...op, async (c) => {
    const who = c.get('who')
    const parsed = z.object({ name: z.string().trim().min(2).max(120), adminName: z.string().trim().min(2).max(120), adminEmail: emailSchema, plan: z.string().max(30).optional() }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid' }, 400)
    if (parsed.data.plan && !(await getPlan(db, parsed.data.plan))) return c.json({ error: 'unknown_plan' }, 400)
    const r = await createOrganisationWithAdmin(db, uid, parsed.data)
    await audit(r.orgId, who.userId, 'operator.org.create', undefined, r.orgId, { adminEmail: parsed.data.adminEmail, plan: parsed.data.plan ?? 'essai' })
    await welcomeAdmin(r.userId, parsed.data.adminEmail, parsed.data.adminName, parsed.data.name, r.existingUser)
    return c.json({ ok: true, orgId: r.orgId }, 201)
  })

  /* ---------- offre / plan d'une entreprise ---------- */
  app.post('/api/operator/orgs/:id/offer', ...op, async (c) => {
    const who = c.get('who')
    const int = z.number().int().min(0).max(1_000_000_000)
    const parsed = z.object({
      plan: z.string().max(30), trialEndsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), subscriptionEndsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      maxTechs: int.nullable(), maxElevators: int.nullable(), priceMonthly: int, extraTechPrice: int, extraElevatorPrice: int, overageMode: z.enum(['bill', 'block']).default('bill'), notes: z.string().max(2000).default(''),
    }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success || !(await getPlan(db, parsed.data.plan))) return c.json({ error: 'invalid' }, 400)
    const o = parsed.data
    const r = await db.query(
      `update organisations set plan=$2, trial_ends_on=$3, max_techs=$4, max_elevators=$5, price_monthly=$6, extra_tech_price=$7, extra_elevator_price=$8, notes=$9, subscription_ends_on=$10, overage_mode=$11 where id=$1 and kind='client' returning id`,
      [pid(c), o.plan, o.trialEndsOn ?? null, o.maxTechs, o.maxElevators, o.priceMonthly, o.extraTechPrice, o.extraElevatorPrice, o.notes, o.subscriptionEndsOn ?? null, o.overageMode],
    )
    if (!r.rows.length) return c.json({ error: 'not_found' }, 404)
    await audit(pid(c), who.userId, 'operator.org.offer', undefined, pid(c), { plan: o.plan, priceMonthly: o.priceMonthly })
    return c.json({ ok: true, org: (await loadOrgs(db, pid(c)))[0] })
  })

  /* ---------- suppression définitive d'une entreprise et de toutes ses données ---------- */
  app.delete('/api/operator/orgs/:id', ...op, async (c) => {
    const who = c.get('who')
    const parsed = z.object({ confirmName: z.string() }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid' }, 400)
    const org = (await db.query<{ name: string }>(`select name from organisations where id = $1 and kind = 'client'`, [pid(c)])).rows[0]
    if (!org) return c.json({ error: 'not_found' }, 404)
    if (parsed.data.confirmName.trim() !== org.name) return c.json({ error: 'confirm_mismatch' }, 400) // le nom exact est retapé pour confirmer
    const removed = await db.tx(async (t) => {
      const members = (await t.query<{ user_id: string }>('select user_id from members where org_id = $1', [pid(c)])).rows.map((r) => r.user_id)
      const counts = (await t.query<{ docs: number; files: number }>(`select (select count(*)::int from docs where org_id = $1) as docs, (select count(*)::int from files where org_id = $1) as files`, [pid(c)])).rows[0]
      await t.query('delete from audit_log where org_id = $1', [pid(c)])
      await t.query('delete from organisations where id = $1', [pid(c)]) // supprime en cascade membres, documents, fichiers, paiements, sessions, etc.
      // les comptes qui n'appartiennent plus à aucune entreprise (et ne sont pas opérateurs) disparaissent aussi
      const gone = members.length ? (await t.query<{ id: string }>(`delete from users u where u.id = any($1::uuid[]) and not exists (select 1 from members m where m.user_id = u.id) and not exists (select 1 from operators o where o.user_id = u.id) returning u.id`, [members])).rows.length : 0
      return { members: members.length, users: gone, ...counts }
    })
    await audit(NIL, who.userId, 'operator.org.delete', undefined, pid(c), { name: org.name, ...removed })
    return c.json({ ok: true, ...removed })
  })

  /* ---------- suspension (motif listé en base ; un paiement ne lève que certains motifs) ---------- */
  app.get('/api/operator/suspension-reasons', ...op, async (c) =>
    c.json({ reasons: (await db.query(`select code, label, lifted_by_payment as "liftedByPayment", automatic from suspension_reasons order by sort`)).rows }))
  app.post('/api/operator/orgs/:id/suspend', ...op, async (c) => {
    const who = c.get('who')
    const parsed = z.object({ code: z.string().max(40).optional(), reason: z.string().trim().max(300).default('') }).safeParse(await c.req.json().catch(() => ({})))
    if (!parsed.success) return c.json({ error: 'invalid' }, 400)
    const code = parsed.data.code ?? 'other'
    const known = (await db.query<{ label: string }>('select label from suspension_reasons where code = $1', [code])).rows[0]
    if (!known) return c.json({ error: 'unknown_reason' }, 400)
    if (!(await suspendOrg(db, pid(c), code, parsed.data.reason || null))) return c.json({ error: 'not_found' }, 404)
    await audit(pid(c), who.userId, 'operator.org.suspend', undefined, pid(c), { code, reason: parsed.data.reason })
    return c.json({ ok: true })
  })
  // un opérateur peut lever n'importe quelle suspension
  app.post('/api/operator/orgs/:id/reactivate', ...op, async (c) => {
    const who = c.get('who')
    const r = await reactivateOrg(db, pid(c))
    if (!r.rows.length) return c.json({ error: 'not_found' }, 404)
    await audit(pid(c), who.userId, 'operator.org.reactivate', undefined, pid(c))
    return c.json({ ok: true })
  })

  /* ---------- catalogue des offres ---------- */
  const int = z.number().int().min(0).max(1_000_000_000)
  const planBody = z.object({
    name: z.string().trim().min(2).max(60), maxTechs: int.nullable(), maxElevators: int.nullable(), priceMonthly: int, extraTechPrice: int, extraElevatorPrice: int,
    trialDays: z.number().int().min(1).max(365).nullable().default(null), archived: z.boolean().default(false), overageMode: z.enum(['bill', 'block']).default('bill'),
  })
  app.get('/api/operator/plans', ...op, async (c) => c.json({ plans: await loadPlans(db) }))
  app.post('/api/operator/plans', ...op, async (c) => {
    const who = c.get('who')
    const parsed = planBody.extend({ code: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,30}$/) }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid' }, 400)
    const p = parsed.data
    if (await getPlan(db, p.code)) return c.json({ error: 'code_taken' }, 409)
    const sort = ((await db.query<{ m: number | null }>('select max(sort) as m from plans')).rows[0].m ?? 0) + 10
    await db.query('insert into plans (code, name, max_techs, max_elevators, price_monthly, extra_tech_price, extra_elevator_price, trial_days, archived, sort, overage_mode) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [p.code, p.name, p.maxTechs, p.maxElevators, p.priceMonthly, p.extraTechPrice, p.extraElevatorPrice, p.trialDays, p.archived, sort, p.overageMode])
    await audit(NIL, who.userId, 'operator.plan.create', undefined, p.code, { name: p.name, priceMonthly: p.priceMonthly })
    return c.json({ ok: true, plans: await loadPlans(db) }, 201)
  })
  app.put('/api/operator/plans/:code', ...op, async (c) => {
    const who = c.get('who')
    const parsed = planBody.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid' }, 400)
    const p = parsed.data
    const r = await db.query('update plans set name=$2, max_techs=$3, max_elevators=$4, price_monthly=$5, extra_tech_price=$6, extra_elevator_price=$7, trial_days=$8, archived=$9, overage_mode=$10 where code=$1 returning code',
      [c.req.param('code'), p.name, p.maxTechs, p.maxElevators, p.priceMonthly, p.extraTechPrice, p.extraElevatorPrice, p.trialDays, p.archived, p.overageMode])
    if (!r.rows.length) return c.json({ error: 'not_found' }, 404)
    await audit(NIL, who.userId, 'operator.plan.update', undefined, c.req.param('code'), { name: p.name, priceMonthly: p.priceMonthly, archived: p.archived })
    return c.json({ ok: true, plans: await loadPlans(db) })
  })
  app.delete('/api/operator/plans/:code', ...op, async (c) => {
    const who = c.get('who')
    const code = c.req.param('code') ?? ''
    const used = (await db.query<{ n: number }>('select count(*)::int as n from organisations where plan = $1', [code])).rows[0].n
    if (used) return c.json({ error: 'in_use', count: used }, 409) // à archiver plutôt que supprimer
    const r = await db.query('delete from plans where code = $1 returning code', [code])
    if (!r.rows.length) return c.json({ error: 'not_found' }, 404)
    await audit(NIL, who.userId, 'operator.plan.delete', undefined, code)
    return c.json({ ok: true, plans: await loadPlans(db) })
  })

  /* ---------- demandes d'inscription ---------- */
  app.get('/api/operator/signups', ...op, async (c) => {
    const status = c.req.query('status')
    const rows = (await db.query(
      `select id, company, contact_name as "contactName", email, phone, message, status, created_at as "createdAt", decided_at as "decidedAt", decision_reason as "decisionReason", org_id as "orgId"
         from signup_requests ${status && ['pending', 'approved', 'rejected'].includes(status) ? 'where status = $1' : ''} order by created_at desc limit 200`,
      status && ['pending', 'approved', 'rejected'].includes(status) ? [status] : [],
    )).rows
    return c.json({ signups: rows })
  })

  app.post('/api/operator/signups/:id/approve', ...op, async (c) => {
    const who = c.get('who')
    const parsed = z.object({ plan: z.string().max(30).optional() }).safeParse(await c.req.json().catch(() => ({})))
    if (!parsed.success || (parsed.data.plan && !(await getPlan(db, parsed.data.plan)))) return c.json({ error: 'invalid' }, 400)
    const out = await db.tx(async (t) => {
      const req = (await t.query<{ id: string; company: string; contact_name: string; email: string; status: string }>('select id, company, contact_name, email, status from signup_requests where id = $1 for update', [pid(c)])).rows[0]
      if (!req) return { status: 404 as const }
      if (req.status !== 'pending') return { status: 409 as const }
      return { status: 200 as const, req }
    })
    if (out.status !== 200) return c.json({ error: out.status === 404 ? 'not_found' : 'already_decided' }, out.status)
    const { req } = out
    const r = await createOrganisationWithAdmin(db, uid, { name: req.company, adminName: req.contact_name, adminEmail: req.email.toLowerCase(), plan: parsed.data.plan ?? 'essai' })
    await db.query(`update signup_requests set status='approved', decided_at=now(), decided_by=$2, org_id=$3 where id=$1`, [req.id, who.userId, r.orgId])
    await audit(r.orgId, who.userId, 'operator.signup.approve', undefined, req.id, { email: req.email })
    await welcomeAdmin(r.userId, req.email, req.contact_name, req.company, r.existingUser)
    return c.json({ ok: true, orgId: r.orgId })
  })

  app.post('/api/operator/signups/:id/reject', ...op, async (c) => {
    const who = c.get('who')
    const parsed = z.object({ reason: z.string().trim().max(500).default('') }).safeParse(await c.req.json().catch(() => ({})))
    if (!parsed.success) return c.json({ error: 'invalid' }, 400)
    const r = await db.query<{ company: string; contact_name: string; email: string }>(
      `update signup_requests set status='rejected', decided_at=now(), decided_by=$2, decision_reason=$3 where id=$1 and status='pending' returning company, contact_name, email`,
      [pid(c), who.userId, parsed.data.reason || null],
    )
    if (!r.rows[0]) return c.json({ error: 'not_found_or_decided' }, 404)
    await mailer.send({
      to: r.rows[0].email,
      subject: 'Votre demande d\'accès à Maintix',
      ...emailParts({
        title: `Bonjour ${r.rows[0].contact_name},`,
        paragraphs: [`Nous avons bien étudié la demande d'accès de « ${r.rows[0].company} » à Maintix, et nous ne pouvons pas y donner suite pour le moment.`, ...(parsed.data.reason ? [`Motif : ${parsed.data.reason}`] : []), 'Vous pouvez répondre à nos équipes pour en discuter.'],
        notes: ['L\'équipe Maintix'],
      }),
    })
    await audit(NIL, who.userId, 'operator.signup.reject', undefined, pid(c))
    return c.json({ ok: true })
  })

  /* ---------- usage et facturation de la plateforme ---------- */
  const billingRows = async () => (await loadOrgs(db)).filter((o) => o.status === 'active' || o.offer.priceMonthly > 0)

  app.get('/api/operator/billing', ...op, async (c) => {
    const month = c.req.query('month') ?? today().slice(0, 7)
    if (!monthRe.test(month)) return c.json({ error: 'invalid' }, 400)
    const frozen = (await db.query(`select org_id as "orgId", plan, techs, elevators, clients, jobs, amount, frozen_at as "frozenAt" from usage_snapshots where month = $1`, [month])).rows
    const live = (await billingRows()).map((o) => ({ orgId: o.id, name: o.name, status: o.status, plan: o.offer.plan, usage: o.usage, estimate: o.estimate, flags: o.flags }))
    const total = live.reduce((t, o) => t + (o.status === 'active' ? o.estimate.amount : 0), 0)
    return c.json({ month, live, frozen, totalEstimate: total, currency: 'FCFA' })
  })

  /** Fige l'usage et le montant du mois (à lancer en fin de mois) ; relancer remplace la photographie du mois. */
  app.post('/api/operator/billing/freeze', ...op, async (c) => {
    const who = c.get('who')
    const parsed = z.object({ month: z.string().regex(monthRe) }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid' }, 400)
    const rows = (await billingRows()).filter((o) => o.status === 'active')
    for (const o of rows) {
      await db.query(
        `insert into usage_snapshots (org_id, month, plan, techs, elevators, clients, jobs, amount) values ($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict (org_id, month) do update set plan=$3, techs=$4, elevators=$5, clients=$6, jobs=$7, amount=$8, frozen_at=now()`,
        [o.id, parsed.data.month, o.offer.plan, o.usage.techs, o.usage.elevators, o.usage.clients, o.usage.jobs30, o.estimate.amount],
      )
    }
    await audit(NIL, who.userId, 'operator.billing.freeze', undefined, parsed.data.month, { orgs: rows.length })
    return c.json({ ok: true, frozen: rows.length })
  })

  app.get('/api/operator/billing.csv', ...op, async (c) => {
    const month = c.req.query('month') ?? today().slice(0, 7)
    if (!monthRe.test(month)) return c.json({ error: 'invalid' }, 400)
    const cell = (v: string | number | null) => { const s = v === null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s }
    const head = ['Mois', 'Entreprise', 'Offre', 'Statut', 'Techniciens', 'Plafond techniciens', 'Appareils', 'Plafond appareils', 'Clients', 'Missions 30 j', 'Forfait (FCFA)', 'Dépassements (FCFA)', 'Montant estimé (FCFA)']
    const lines = (await billingRows()).map((o) => [month, o.name, o.offer.plan, o.status === 'active' ? 'Actif' : 'Suspendu', o.usage.techs, o.offer.maxTechs, o.usage.elevators, o.offer.maxElevators, o.usage.clients, o.usage.jobs30, o.estimate.base, o.estimate.amount - o.estimate.base, o.status === 'active' ? o.estimate.amount : 0])
    const csv = '﻿' + [head, ...lines].map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n'
    return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="usage-maintix-${month}.csv"`, 'cache-control': 'no-store' } })
  })

  /* ---------- réglages de paiement (clés Jèko) : jamais renvoyées en clair ---------- */
  const mask = (v?: string) => (v ? `••••${v.slice(-4)}` : null)
  const settingsView = async () => {
    const st = await getSettings(db, config.secretsKey)
    return {
      provider: 'jeko', webhookUrl: `${config.appUrl}/api/public/jeko/webhook`,
      apiKeyId: st['jeko.apiKeyId'] ?? '', storeId: st['jeko.storeId'] ?? '',
      apiKeyMasked: mask(st['jeko.apiKey']), webhookSecretMasked: mask(st['jeko.webhookSecret']),
      configured: !!(st['jeko.apiKey'] && st['jeko.apiKeyId'] && st['jeko.storeId']), webhookConfigured: !!st['jeko.webhookSecret'],
      encryptedWith: config.secretsKey ? 'SECRETS_KEY' : 'clé générée et conservée en base',
    }
  }
  app.get('/api/operator/payment-settings', ...op, async (c) => c.json(await settingsView()))
  app.put('/api/operator/payment-settings', ...op, async (c) => {
    const who = c.get('who')
    const parsed = z.object({ apiKey: z.string().trim().max(500).optional(), apiKeyId: z.string().trim().max(200).optional(), storeId: z.string().trim().max(200).optional(), webhookSecret: z.string().trim().max(500).optional() }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid' }, 400)
    const map: [SettingKey, string | undefined][] = [['jeko.apiKey', parsed.data.apiKey], ['jeko.apiKeyId', parsed.data.apiKeyId], ['jeko.storeId', parsed.data.storeId], ['jeko.webhookSecret', parsed.data.webhookSecret]]
    const changed: string[] = []
    for (const [k, v] of map) if (v) { await setSetting(db, config.secretsKey, k, v); changed.push(k) } // un champ vide laisse la valeur actuelle
    await audit(NIL, who.userId, 'operator.payment_settings.update', undefined, 'jeko', { changed })
    return c.json({ ok: true, ...(await settingsView()) })
  })
  app.delete('/api/operator/payment-settings', ...op, async (c) => {
    const who = c.get('who')
    for (const k of SETTING_KEYS) await clearSetting(db, k)
    await audit(NIL, who.userId, 'operator.payment_settings.clear', undefined, 'jeko')
    return c.json({ ok: true, ...(await settingsView()) })
  })
  /** Vérifie les clés auprès de Jèko et liste les boutiques (pour retrouver le storeId). */
  app.post('/api/operator/payment-settings/test', ...op, async (c) => {
    const st = await getSettings(db, config.secretsKey)
    if (!st['jeko.apiKey'] || !st['jeko.apiKeyId']) return c.json({ error: 'not_configured' }, 400)
    try {
      const stores = await d.makeGateway({ apiKey: st['jeko.apiKey'], apiKeyId: st['jeko.apiKeyId'], storeId: st['jeko.storeId'] ?? '' }).listStores()
      return c.json({ ok: true, stores, storeFound: !!st['jeko.storeId'] && stores.some((x) => x.id === st['jeko.storeId']) })
    } catch { return c.json({ error: 'jeko_unreachable_or_refused' }, 502) }
  })

  /* ---------- interrupteur des paiements en ligne + contact du support ---------- */
  app.get('/api/operator/payment-switch', ...op, async (c) => c.json(await getPaymentSwitch(db)))
  app.put('/api/operator/payment-switch', ...op, async (c) => {
    const who = c.get('who')
    const parsed = z.object({ enabled: z.boolean(), supportPhone: z.string().trim().min(3).max(40), supportEmail: emailSchema }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid' }, 400)
    await setPaymentSwitch(db, parsed.data)
    await audit(NIL, who.userId, 'operator.payment_switch.update', undefined, 'payments', { enabled: parsed.data.enabled })
    return c.json({ ok: true, ...(await getPaymentSwitch(db)) })
  })

  /* ---------- TVA sur les abonnements (activable) ---------- */
  app.get('/api/operator/vat-settings', ...op, async (c) => c.json(await getVat(db)))
  app.put('/api/operator/vat-settings', ...op, async (c) => {
    const who = c.get('who')
    const parsed = z.object({ enabled: z.boolean(), rate: z.number().min(0).max(100) }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid' }, 400)
    await setVat(db, parsed.data)
    await audit(NIL, who.userId, 'operator.vat_settings.update', undefined, 'vat', parsed.data)
    return c.json({ ok: true, ...(await getVat(db)) })
  })

  /* ---------- finances : encaissé, en attente, reste à payer ---------- */
  app.get('/api/operator/finance', ...op, async (c) => {
    const today = todayStr()
    const orgs = await loadOrgs(db)
    const month = today.slice(0, 7)
    const paidByOrg = new Map((await db.query<{ org_id: string; total: number; last: string | null }>(`select org_id, sum(amount)::int as total, max(paid_at) as last from payments where status = 'paid' group by org_id`)).rows.map((r) => [r.org_id, r]))
    const pendingByOrg = new Map((await db.query<{ org_id: string; total: number; n: number }>(`select org_id, sum(amount)::int as total, count(*)::int as n from payments where status = 'pending' and source = 'jeko' and created_at > now() - interval '2 days' group by org_id`)).rows.map((r) => [r.org_id, r]))
    const total = (await db.query<{ n: number }>(`select coalesce(sum(amount), 0)::int as n from payments where status = 'paid'`)).rows[0].n
    const thisMonth = (await db.query<{ n: number }>(`select coalesce(sum(amount), 0)::int as n from payments where status = 'paid' and to_char(paid_at, 'YYYY-MM') = $1`, [month])).rows[0].n
    const series = (await db.query<{ month: string; amount: number }>(`select to_char(paid_at, 'YYYY-MM') as month, sum(amount)::int as amount from payments where status = 'paid' and paid_at > now() - interval '12 months' group by 1 order by 1`)).rows
    // encaissements des 12 derniers mois, par offre (mois sans paiement inclus : 12 colonnes consécutives)
    const months: string[] = []
    for (let i = 11; i >= 0; i--) { const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - i, 1)); months.push(d.toISOString().slice(0, 7)) }
    const cells = (await db.query<{ month: string; plan: string; amount: number; n: number; discount: number }>(
      `select to_char(paid_at, 'YYYY-MM') as month, plan, sum(amount)::int as amount, count(*)::int as n, coalesce(sum(list_amount - amount), 0)::int as discount
         from payments where status = 'paid' and to_char(paid_at, 'YYYY-MM') = any($1::text[]) group by 1, 2 order by 1, 2`, [months])).rows
    const planNames = new Map((await loadPlans(db)).map((p) => [p.code, p.name]))
    const monthly = {
      months,
      plans: [...new Set(cells.map((x) => x.plan))].map((code) => ({ code, name: planNames.get(code) ?? code })),
      cells,
      discounts: cells.reduce((t, x) => t + x.discount, 0),
    }
    const in30 = new Date(Date.parse(today) + 30 * 86400_000).toISOString().slice(0, 10)
    const rows = orgs.map((o) => {
      const sub = o.offer.subscriptionEndsOn
      const expired = o.flags.trialExpired || o.flags.subscriptionExpired || (o.status === 'suspended' && o.suspension?.payable === true)
      const due = expired ? o.estimate.amount : 0
      const upcoming = !expired && !!sub && sub >= today && sub <= in30 ? o.estimate.amount : 0
      return { orgId: o.id, name: o.name, status: o.status, plan: o.offer.plan, endsOn: sub ?? (o.offer.plan === 'essai' ? o.offer.trialEndsOn : null), monthly: o.estimate.amount, paid: paidByOrg.get(o.id)?.total ?? 0, lastPaidAt: paidByOrg.get(o.id)?.last ?? null, pending: pendingByOrg.get(o.id)?.total ?? 0, due, upcoming }
    })
    const recent = (await db.query(`select p.id, p.org_id as "orgId", o.name as org, p.plan, p.months, p.amount, p.status, p.source, p.method, p.reference, p.note, p.list_amount as "listAmount", p.discount_pct as "discountPct", p.receipt_number as "receiptNumber", p.created_at as "createdAt", p.paid_at as "paidAt", p.period_end as "periodEnd"
      from payments p join organisations o on o.id = p.org_id order by p.created_at desc limit 60`)).rows
    return c.json({
      currency: 'FCFA',
      collected: { total, thisMonth, series },
      monthly,
      pending: { amount: rows.reduce((t, r) => t + r.pending, 0), count: [...pendingByOrg.values()].reduce((t, r) => t + r.n, 0) },
      outstanding: { amount: rows.reduce((t, r) => t + r.due, 0), orgs: rows.filter((r) => r.due > 0).length },
      upcoming30: { amount: rows.reduce((t, r) => t + r.upcoming, 0), orgs: rows.filter((r) => r.upcoming > 0).length },
      orgs: rows, recent,
    })
  })
  /** Paiement reçu hors ligne (virement, espèces) : appliqué comme un paiement en ligne. */
  app.post('/api/operator/orgs/:id/payments', ...op, async (c) => {
    const who = c.get('who')
    const parsed = z.object({ plan: z.string().max(30), months: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]), amount: z.number().int().min(0).max(1_000_000_000).optional(), note: z.string().trim().max(300).default('') }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid' }, 400)
    const plan = await getPlan(db, parsed.data.plan)
    const org = (await db.query('select 1 from organisations where id = $1 and kind = \'client\'', [pid(c)])).rows[0]
    if (!plan || !org) return c.json({ error: 'not_found' }, 404)
    const id = randomUUID()
    const vat = await getVat(db)
    const q = priceFor(plan.priceMonthly, parsed.data.months, vat.enabled ? vat.rate : 0)
    const custom = parsed.data.amount !== undefined // montant saisi à la main : ni remise ni TVA ajoutées
    await db.query(`insert into payments (id, org_id, plan, months, amount, list_amount, discount_pct, vat_rate, vat_amount, status, source, reference, note, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending','manual',$10,$11,$12)`,
      [id, pid(c), plan.code, parsed.data.months, parsed.data.amount ?? q.ttc, q.list, custom ? 0 : q.discountPct, custom ? 0 : q.vatRate, custom ? 0 : q.vat, `MAN-${id.slice(0, 8).toUpperCase()}`, parsed.data.note || null, who.userId])
    const r = await applyPayment(db, id)
    if (r.applied) await sendReceipt(db, mailer, config, id).catch(() => {})
    await audit(pid(c), who.userId, 'operator.payment.manual', undefined, id, { plan: plan.code, months: parsed.data.months })
    return c.json({ ok: true, ...r, paymentId: id }, 201)
  })
  app.get('/api/operator/payments/:id/receipt', ...op, async (c) => {
    const r = await loadReceipt(db, c.req.param('id') ?? '')
    if (!r) return c.json({ error: 'not_found' }, 404)
    const pdf = await buildReceiptPdf({ ...r.data, legal: config.legal, appUrl: config.appUrl })
    return new Response(pdf, { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="recu-${r.data.receiptNumber}.pdf"`, 'cache-control': 'no-store' } })
  })
  /** Rapprochement : un paiement Jèko resté « en attente » (webhook non reçu) est confirmé à la main après vérification dans Jèko. */
  app.post('/api/operator/payments/:id/confirm', ...op, async (c) => {
    const who = c.get('who')
    const p = (await db.query<{ org_id: string }>(`select org_id from payments where id = $1 and status = 'pending'`, [c.req.param('id') ?? ''])).rows[0]
    if (!p) return c.json({ error: 'not_found' }, 404)
    const r = await applyPayment(db, c.req.param('id') ?? '')
    if (r.applied) await sendReceipt(db, mailer, config, c.req.param('id') ?? '').catch(() => {})
    await audit(p.org_id, who.userId, 'operator.payment.confirm', undefined, c.req.param('id'))
    return c.json({ ok: true, ...r })
  })

  /* ---------- opérateurs ---------- */
  app.get('/api/operator/operators', ...op, async (c) => {
    const rows = (await db.query<{ userId: string; email: string; createdAt: string }>(`select o.user_id as "userId", u.email, o.created_at as "createdAt" from operators o join users u on u.id = o.user_id order by o.created_at`)).rows
    return c.json({ operators: rows.map((r) => ({ ...r, fromEnv: config.operatorEmails.includes(r.email.toLowerCase()) })), fromEnv: config.operatorEmails })
  })
  app.post('/api/operator/operators', ...op, async (c) => {
    const who = c.get('who')
    const parsed = z.object({ email: emailSchema }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid' }, 400)
    const u = (await db.query<{ id: string }>('select id from users where email = $1', [parsed.data.email])).rows[0]
    if (!u) return c.json({ error: 'user_unknown' }, 404) // l'utilisateur doit déjà exister (membre d'une entreprise)
    await db.query('insert into operators (user_id) values ($1) on conflict do nothing', [u.id])
    await audit(NIL, who.userId, 'operator.operators.add', undefined, u.id, { email: parsed.data.email })
    return c.json({ ok: true }, 201)
  })
  app.delete('/api/operator/operators/:userId', ...op, async (c) => {
    const who = c.get('who')
    const target = c.req.param('userId') ?? ''
    if (target === who.userId) return c.json({ error: 'cannot_remove_self' }, 400)
    const t = (await db.query<{ email: string }>('select email from users where id = $1', [target])).rows[0]
    if (t && config.operatorEmails.includes(t.email.toLowerCase())) return c.json({ error: 'env_operator' }, 409) // défini par OPERATOR_EMAILS : à retirer dans la configuration
    await db.query('delete from operators where user_id = $1', [target])
    await audit(NIL, who.userId, 'operator.operators.remove', undefined, target)
    return c.json({ ok: true })
  })

  /* ---------- inscription en libre-service (publique) ---------- */
  app.post('/api/public/signup', async (c) => {
    const parsed = z.object({
      company: z.string().trim().min(2).max(120), name: z.string().trim().min(2).max(120), email: emailSchema,
      phone: z.string().trim().max(30).optional(), message: z.string().trim().max(1000).optional(), website: z.string().max(200).optional(), // « website » = piège à robots (champ caché)
    }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid' }, 400)
    if (parsed.data.website) return c.json({ ok: true }) // robot : on fait semblant sans rien enregistrer
    if (!(await limit(`signup-ip:${ip(c)}`, 5, HOUR)) || !(await limit(`signup-email:${parsed.data.email}`, 3, 24 * HOUR))) return c.json({ error: 'rate_limited' }, 429)
    const { company, name, email, phone, message } = parsed.data
    const dup = (await db.query(`select 1 from signup_requests where email = $1 and status = 'pending'`, [email])).rows.length
    if (!dup) {
      await db.query('insert into signup_requests (id, company, contact_name, email, phone, message) values ($1,$2,$3,$4,$5,$6)', [randomUUID(), company, name, email, phone || null, message || null])
      await mailer.send({
        to: email,
        subject: 'Votre demande d\'accès à Maintix est bien reçue',
        ...emailParts({
          preheader: 'Nous étudions votre demande et revenons vers vous rapidement.',
          title: `Bonjour ${name},`,
          paragraphs: [`Nous avons bien reçu la demande d'accès de « ${company} » à Maintix.`, 'Nous l\'étudions et revenons vers vous rapidement : en cas d\'accord, vous recevrez un lien de connexion à cette adresse.'],
          facts: [['Entreprise', company], ['Contact', name]],
          notes: ['L\'équipe Maintix'],
        }),
      }).catch(() => {})
      const ops = (await db.query<{ email: string }>('select u.email from operators o join users u on u.id = o.user_id')).rows.map((r) => r.email)
      const targets = [...new Set([...ops, ...config.operatorEmails].map((e) => e.toLowerCase()))]
      const content = emailParts({
        preheader: `${name} demande un accès pour « ${company} ».`,
        title: 'Nouvelle demande d\'accès',
        paragraphs: [`${name} demande un accès à Maintix pour « ${company} ».`, ...(message ? [`Message : ${message}`] : [])],
        facts: [['Entreprise', company], ['Contact', name], ['E-mail', email], ...(phone ? [['Téléphone', phone] as [string, string]] : [])],
        button: { label: 'Étudier la demande', url: `${config.appUrl}/#/operator` },
        notes: ['Approuvez ou refusez la demande depuis la console opérateur, onglet Demandes.'],
      })
      // un e-mail par opérateur : les adresses ne sont pas exposées entre elles, et l'échec d'un envoi n'empêche pas les autres
      for (const to of targets) await mailer.send({ to, subject: `Nouvelle demande d'accès : ${company}`, ...content }).catch(() => {})
    }
    return c.json({ ok: true }) // même réponse que la demande soit nouvelle, en double ou ignorée
  })
}
