import webpush from 'web-push'
import type { Db } from './db'

export interface PushPayload {
  title: string
  body: string
  url: string
  tag?: string
  urgent?: boolean
}
export interface PushSub {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}
/** Canaux d'envoi, remplaçables en test. `push` renvoie false si l'abonnement est mort (à supprimer). */
export interface Channels {
  push(sub: PushSub, payload: PushPayload): Promise<boolean>
  sms(to: string, text: string): Promise<void>
  readonly pushEnabled: boolean
  readonly smsEnabled: boolean
}

export interface NotifyConfig {
  vapidPublicKey?: string
  vapidPrivateKey?: string
  vapidSubject?: string
  smsProvider?: 'twilio' | 'webhook'
  twilio?: { sid: string; token: string; from: string }
  smsWebhook?: { url: string; token?: string }
  escalationMinutes: number
}

export function loadNotifyConfig(env: NodeJS.ProcessEnv = process.env): NotifyConfig {
  return {
    vapidPublicKey: env.VAPID_PUBLIC_KEY || undefined,
    vapidPrivateKey: env.VAPID_PRIVATE_KEY || undefined,
    vapidSubject: env.VAPID_SUBJECT || 'mailto:admin@localhost',
    smsProvider: env.SMS_PROVIDER === 'twilio' || env.SMS_PROVIDER === 'webhook' ? env.SMS_PROVIDER : undefined,
    twilio: env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM ? { sid: env.TWILIO_ACCOUNT_SID, token: env.TWILIO_AUTH_TOKEN, from: env.TWILIO_FROM } : undefined,
    smsWebhook: env.SMS_WEBHOOK_URL ? { url: env.SMS_WEBHOOK_URL, token: env.SMS_WEBHOOK_TOKEN || undefined } : undefined,
    escalationMinutes: Math.max(1, Number(env.ESCALATION_MINUTES ?? 10) || 10),
  }
}

export function realChannels(cfg: NotifyConfig, fetchImpl: typeof fetch = fetch): Channels {
  const pushEnabled = !!(cfg.vapidPublicKey && cfg.vapidPrivateKey)
  if (pushEnabled) webpush.setVapidDetails(cfg.vapidSubject!, cfg.vapidPublicKey!, cfg.vapidPrivateKey!)
  const smsEnabled = (cfg.smsProvider === 'twilio' && !!cfg.twilio) || (cfg.smsProvider === 'webhook' && !!cfg.smsWebhook)
  return {
    pushEnabled,
    smsEnabled,
    async push(sub, payload) {
      if (!pushEnabled) return true
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: payload.urgent ? 'high' : 'normal' })
        return true
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) return false
        throw e
      }
    },
    async sms(to, text) {
      if (cfg.smsProvider === 'twilio' && cfg.twilio) {
        const { sid, token, from } = cfg.twilio
        const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: 'POST',
          headers: { authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ To: to, From: from, Body: text }),
        })
        if (!res.ok) throw new Error(`twilio ${res.status}`)
      } else if (cfg.smsProvider === 'webhook' && cfg.smsWebhook) {
        const res = await fetchImpl(cfg.smsWebhook.url, { method: 'POST', headers: { 'content-type': 'application/json', ...(cfg.smsWebhook.token ? { authorization: `Bearer ${cfg.smsWebhook.token}` } : {}) }, body: JSON.stringify({ to, text }) })
        if (!res.ok) throw new Error(`webhook ${res.status}`)
      }
    },
  }
}

type Doc = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
interface Member { userId: string; role: string; fullName: string; techId: string | null; phone: string | null }

export class Notifier {
  constructor(private db: Db, private ch: Channels, private cfg: NotifyConfig, private log: (m: string, extra?: unknown) => void = () => {}) {}

  get channels() { return this.ch }
  get escalationMinutes() { return this.cfg.escalationMinutes }

  private async members(orgId: string): Promise<Member[]> {
    return (await this.db.query<Member>(`select user_id as "userId", role, full_name as "fullName", tech_id as "techId", phone from members where org_id=$1`, [orgId])).rows
  }
  private async onCallTechId(orgId: string, today = new Date().toISOString().slice(0, 10)): Promise<string | null> {
    const r = await this.db.query<{ data: { techId: string } }>(`select data from docs where org_id=$1 and collection='onCall' and id <= $2 and not deleted order by id desc limit 1`, [orgId, today])
    return r.rows[0]?.data.techId ?? null
  }

  /** Destinataires selon le niveau : 0 = technicien affecté (ou astreinte, ou bureau) ; 1 = + bureau ; 2 = + administrateurs. */
  async recipients(orgId: string, job: Doc, level: number): Promise<Member[]> {
    const all = await this.members(orgId)
    const byTech = (id: string | null | undefined) => (id ? all.filter((m) => m.techId === id) : [])
    const staff = all.filter((m) => m.role === 'bureau' || m.role === 'admin')
    let list: Member[] = []
    const assigned = byTech(job.techId)
    if (level === 0) list = assigned.length ? assigned : byTech(await this.onCallTechId(orgId)).concat(assigned)
    if (level === 0 && !list.length) list = staff
    if (level >= 1) list = [...assigned, ...byTech(await this.onCallTechId(orgId)), ...staff.filter((m) => level >= 2 || m.role === 'bureau' || m.role === 'admin')]
    const seen = new Set<string>()
    return list.filter((m) => (seen.has(m.userId) ? false : (seen.add(m.userId), true)))
  }

  private async message(orgId: string, job: Doc, level: number): Promise<PushPayload> {
    const el = (await this.db.query<{ data: Doc }>(`select data from docs where org_id=$1 and collection='elevators' and id=$2`, [orgId, String(job.elevatorId)])).rows[0]?.data
    const site = el ? (await this.db.query<{ data: Doc }>(`select data from docs where org_id=$1 and collection='sites' and id=$2`, [orgId, String(el.siteId)])).rows[0]?.data : undefined
    const where = `${el?.label ?? 'Appareil'}${site ? ` – ${site.name}` : ''}`
    const prefix = level >= 1 ? `SANS RÉPONSE (${level}) · ` : ''
    return {
      title: `${prefix}${job.trapped ? 'URGENCE – personne bloquée' : 'Dépannage'}`,
      body: `${where}. ${String(job.description ?? '').slice(0, 120)}`.trim(),
      url: `/#/tech/job/${job.id}`,
      tag: `job-${job.id}`,
      urgent: true,
    }
  }

  /** Envoie l'alerte d'un niveau donné ; renvoie le nombre de destinataires atteints (push ou SMS). */
  async alert(orgId: string, job: Doc, level: number): Promise<number> {
    const payload = await this.message(orgId, job, level)
    const people = await this.recipients(orgId, job, level)
    let reached = 0
    for (const m of people) {
      let delivered = false
      const subs = (await this.db.query<PushSub>(`select id, endpoint, p256dh, auth from push_subscriptions where user_id=$1 and org_id=$2`, [m.userId, orgId])).rows
      for (const sub of subs) {
        try {
          if (await this.ch.push(sub, { ...payload, url: m.role === 'tech' ? payload.url : '/#/office' })) delivered = true
          else await this.db.query('delete from push_subscriptions where id=$1', [sub.id])
        } catch (e) { this.log('push échoué', String(e)) }
      }
      // SMS : personne bloquée, escalade, ou aucun appareil abonné
      if (m.phone && this.ch.smsEnabled && (job.trapped || level >= 1 || !delivered)) {
        try { await this.ch.sms(m.phone, `Maintix ${payload.title} : ${payload.body}`.slice(0, 300)); delivered = true } catch (e) { this.log('sms échoué', String(e)) }
      }
      if (delivered) reached += 1
    }
    return reached
  }

  /** Ouvre le suivi d'une nouvelle alerte et envoie le niveau 0. */
  async raise(orgId: string, job: Doc): Promise<void> {
    if (job.type !== 'depannage' || job.status !== 'planifiee') return
    const jobId = String(job.id)
    const ins = await this.db.query(`insert into alerts (org_id, job_id) values ($1,$2) on conflict do nothing returning job_id`, [orgId, jobId])
    if (!ins.rows.length) return // déjà suivie
    await this.alert(orgId, job, 0)
  }

  /** Nouvelle affectation d'une mission non encore prise en charge : prévient le nouveau technicien. */
  async reassigned(orgId: string, job: Doc): Promise<void> {
    if (job.type !== 'depannage' || job.status !== 'planifiee' || !job.techId) return
    await this.db.query(`insert into alerts (org_id, job_id) values ($1,$2) on conflict do nothing`, [orgId, String(job.id)])
    await this.alert(orgId, job, 0)
    await this.db.query('update alerts set notified_at = now() where org_id=$1 and job_id=$2 and acked_at is null', [orgId, String(job.id)])
  }

  /** Parcourt les alertes ouvertes : accuse réception si la mission est prise en charge, sinon escalade. */
  async scan(now = Date.now()): Promise<{ acked: number; escalated: number }> {
    const open = (await this.db.query<{ org_id: string; job_id: string; level: number; notified_at: string }>(`select org_id, job_id, level, notified_at from alerts where acked_at is null`)).rows
    let acked = 0, escalated = 0
    for (const a of open) {
      const job = (await this.db.query<{ data: Doc; deleted: boolean }>(`select data, deleted from docs where org_id=$1 and collection='jobs' and id=$2`, [a.org_id, a.job_id])).rows[0]
      if (!job || job.deleted || job.data.status !== 'planifiee') {
        await this.db.query('update alerts set acked_at = now() where org_id=$1 and job_id=$2', [a.org_id, a.job_id])
        acked += 1
        continue
      }
      const waited = now - new Date(a.notified_at).getTime()
      if (a.level < 2 && waited >= this.cfg.escalationMinutes * 60_000) {
        const level = a.level + 1
        await this.db.query('update alerts set level=$3, notified_at=now() where org_id=$1 and job_id=$2', [a.org_id, a.job_id, level])
        await this.alert(a.org_id, job.data, level)
        escalated += 1
      }
    }
    return { acked, escalated }
  }

  start(everySeconds = 30): () => void {
    const t = setInterval(() => { this.scan().catch((e) => this.log('escalade échouée', String(e))) }, everySeconds * 1000)
    t.unref?.()
    return () => clearInterval(t)
  }
}
