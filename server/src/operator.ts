import { emailParts } from './emailTemplate'
import { randomUUID } from 'node:crypto'
import type { Context, Hono } from 'hono'
import { z } from 'zod'
import type { Principal } from './auth'
import type { Config } from './config'
import type { Db } from './db'
import type { Mailer } from './mailer'
import { estimateAmount, PLANS, planByCode, type OrgOffer, type Usage } from './plans'

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
  members: number; techs: number; elevators: number; clients: number; jobs30: number; last_activity: string | null; last_login: string | null
}

const ORG_SQL = `
  select o.id, o.name, o.status, o.suspended_reason, o.created_at, o.plan, to_char(o.trial_ends_on, 'YYYY-MM-DD') as trial_ends_on,
         o.max_techs, o.max_elevators, o.price_monthly, o.extra_tech_price, o.extra_elevator_price, o.notes,
         (select count(*)::int from members m where m.org_id = o.id) as members,
         (select count(*)::int from members m where m.org_id = o.id and m.role = 'tech') as techs,
         (select count(*)::int from docs d where d.org_id = o.id and d.collection = 'elevators' and not d.deleted) as elevators,
         (select count(*)::int from docs d where d.org_id = o.id and d.collection = 'clients' and not d.deleted) as clients,
         (select count(*)::int from docs d where d.org_id = o.id and d.collection = 'jobs' and not d.deleted and d.data->>'createdAt' >= $1) as jobs30,
         (select max(d.updated_at) from docs d where d.org_id = o.id) as last_activity,
         (select max(a.at) from audit_log a where a.org_id = o.id and a.action = 'login') as last_login
    from organisations o`

const offerOf = (r: OrgRow): OrgOffer => ({ plan: r.plan, maxTechs: r.max_techs, maxElevators: r.max_elevators, priceMonthly: r.price_monthly, extraTechPrice: r.extra_tech_price, extraElevatorPrice: r.extra_elevator_price })

export function shapeOrg(r: OrgRow, now = today()) {
  const usage: Usage & { members: number } = { techs: r.techs, elevators: r.elevators, clients: r.clients, jobs30: r.jobs30, members: r.members }
  const est = estimateAmount(offerOf(r), usage)
  return {
    id: r.id, name: r.name, status: r.status, suspendedReason: r.suspended_reason, createdAt: r.created_at,
    offer: { ...offerOf(r), trialEndsOn: r.trial_ends_on, notes: r.notes },
    usage, lastActivity: r.last_activity, lastLogin: r.last_login, estimate: est,
    flags: { overTechs: est.overTechs > 0, overElevators: est.overElevators > 0, trialExpired: r.plan === 'essai' && !!r.trial_ends_on && r.trial_ends_on < now },
  }
}

export async function loadOrgs(db: Db, id?: string) {
  const since = new Date(Date.now() - 30 * 86400_000).toISOString()
  const rows = (await db.query<OrgRow>(`${ORG_SQL} ${id ? 'where o.id = $2' : ''} order by o.created_at desc`, id ? [since, id] : [since])).rows
  return rows.map((r) => shapeOrg(r))
}

/** Crée une entreprise avec son premier administrateur (compte créé si l'adresse est nouvelle). */
export async function createOrganisationWithAdmin(db: Db, uid: (p: string) => string, input: { name: string; adminName: string; adminEmail: string; plan?: string }) {
  const preset = planByCode(input.plan ?? 'essai') ?? PLANS[0]
  const orgId = randomUUID()
  const techId = uid('t')
  const trialEnds = preset.trialDays ? addDays(today(), preset.trialDays) : null
  return db.tx(async (t) => {
    await t.query(
      `insert into organisations (id, name, plan, trial_ends_on, max_techs, max_elevators, price_monthly, extra_tech_price, extra_elevator_price) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [orgId, input.name, preset.code, trialEnds, preset.maxTechs, preset.maxElevators, preset.priceMonthly, preset.extraTechPrice, preset.extraElevatorPrice],
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

  /* ---------- vue d'ensemble ---------- */
  app.get('/api/operator/overview', ...op, async (c) => {
    const orgs = await loadOrgs(db)
    const pending = (await db.query<{ n: number }>(`select count(*)::int as n from signup_requests where status = 'pending'`)).rows[0].n
    return c.json({ orgs, pendingSignups: pending, plans: PLANS })
  })

  /* ---------- création d'une entreprise + premier administrateur ---------- */
  app.post('/api/operator/orgs', ...op, async (c) => {
    const who = c.get('who')
    const parsed = z.object({ name: z.string().trim().min(2).max(120), adminName: z.string().trim().min(2).max(120), adminEmail: emailSchema, plan: z.string().max(30).optional() }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid' }, 400)
    if (parsed.data.plan && !planByCode(parsed.data.plan)) return c.json({ error: 'unknown_plan' }, 400)
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
      plan: z.string().max(30), trialEndsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      maxTechs: int.nullable(), maxElevators: int.nullable(), priceMonthly: int, extraTechPrice: int, extraElevatorPrice: int, notes: z.string().max(2000).default(''),
    }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success || !planByCode(parsed.data.plan)) return c.json({ error: 'invalid' }, 400)
    const o = parsed.data
    const r = await db.query(
      `update organisations set plan=$2, trial_ends_on=$3, max_techs=$4, max_elevators=$5, price_monthly=$6, extra_tech_price=$7, extra_elevator_price=$8, notes=$9 where id=$1 returning id`,
      [pid(c), o.plan, o.trialEndsOn ?? null, o.maxTechs, o.maxElevators, o.priceMonthly, o.extraTechPrice, o.extraElevatorPrice, o.notes],
    )
    if (!r.rows.length) return c.json({ error: 'not_found' }, 404)
    await audit(pid(c), who.userId, 'operator.org.offer', undefined, pid(c), { plan: o.plan, priceMonthly: o.priceMonthly })
    return c.json({ ok: true, org: (await loadOrgs(db, pid(c)))[0] })
  })

  /* ---------- suspension ---------- */
  app.post('/api/operator/orgs/:id/suspend', ...op, async (c) => {
    const who = c.get('who')
    const parsed = z.object({ reason: z.string().trim().max(300).default('') }).safeParse(await c.req.json().catch(() => ({})))
    if (!parsed.success) return c.json({ error: 'invalid' }, 400)
    const r = await db.query(`update organisations set status='suspended', suspended_at=now(), suspended_reason=$2 where id=$1 returning id`, [pid(c), parsed.data.reason || null])
    if (!r.rows.length) return c.json({ error: 'not_found' }, 404)
    await audit(pid(c), who.userId, 'operator.org.suspend', undefined, pid(c), { reason: parsed.data.reason })
    return c.json({ ok: true })
  })
  app.post('/api/operator/orgs/:id/reactivate', ...op, async (c) => {
    const who = c.get('who')
    const r = await db.query(`update organisations set status='active', suspended_at=null, suspended_reason=null where id=$1 returning id`, [pid(c)])
    if (!r.rows.length) return c.json({ error: 'not_found' }, 404)
    await audit(pid(c), who.userId, 'operator.org.reactivate', undefined, pid(c))
    return c.json({ ok: true })
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
    if (!parsed.success || (parsed.data.plan && !planByCode(parsed.data.plan))) return c.json({ error: 'invalid' }, 400)
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

  /* ---------- opérateurs ---------- */
  app.get('/api/operator/operators', ...op, async (c) => {
    const rows = (await db.query(`select o.user_id as "userId", u.email, o.created_at as "createdAt" from operators o join users u on u.id = o.user_id order by o.created_at`)).rows
    return c.json({ operators: rows, fromEnv: config.operatorEmails })
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
      const targets = [...new Set([...ops, ...config.operatorEmails])]
      if (targets.length) await mailer.send({
        to: targets,
        subject: `Nouvelle demande d'accès : ${company}`,
        ...emailParts({
          title: 'Nouvelle demande d\'accès',
          paragraphs: [`${name} demande un accès à Maintix pour « ${company} ».`, ...(message ? [`Message : ${message}`] : [])],
          facts: [['Entreprise', company], ['Contact', name], ['E-mail', email], ...(phone ? [['Téléphone', phone] as [string, string]] : [])],
          button: { label: 'Ouvrir la console opérateur', url: `${config.appUrl}/#/operator` },
        }),
      }).catch(() => {})
    }
    return c.json({ ok: true }) // même réponse que la demande soit nouvelle, en double ou ignorée
  })
}
