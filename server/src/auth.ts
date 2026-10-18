import { createHash, randomBytes } from 'node:crypto'
import type { Db } from './db'

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
export const randomToken = () => randomBytes(32).toString('base64url')

export type Role = 'admin' | 'bureau' | 'tech' | 'client'
export interface Principal {
  userId: string
  email: string
  orgId: string
  orgName: string
  role: Role
  fullName: string
  techId: string | null
  clientId: string | null
  orgStatus: 'active' | 'suspended'
  suspendedReason: string | null
  /** opérateur de la plateforme (console opérateur) */
  operator: boolean
  /** entreprise cliente ou entreprise « plateforme » (accueil des opérateurs) */
  orgKind: 'client' | 'platform'
  /** opérateur entré dans une entreprise cliente dont il n'est pas membre */
  impersonating: boolean
  suspendedReasonCode: string | null
  suspendedReasonLabel: string | null
  /** un paiement de l'entreprise peut lever la suspension en cours */
  payable: boolean
}

export const LOGIN_TTL_MIN = 15
export const SESSION_TTL_DAYS = 30

export async function createLoginToken(db: Db, userId: string): Promise<string> {
  const token = randomToken()
  await db.query(
    `insert into login_tokens (token_hash, user_id, expires_at) values ($1, $2, now() + ($3 || ' minutes')::interval)`,
    [sha256(token), userId, String(LOGIN_TTL_MIN)],
  )
  return token
}

/** Consomme un jeton à usage unique ; renvoie l'utilisateur ou null (expiré, déjà utilisé, inconnu). */
export async function consumeLoginToken(db: Db, token: string): Promise<string | null> {
  const r = await db.query<{ user_id: string }>(
    `update login_tokens set used_at = now()
      where token_hash = $1 and used_at is null and expires_at > now() returning user_id`,
    [sha256(token)],
  )
  return r.rows[0]?.user_id ?? null
}

export async function createSession(db: Db, userId: string, orgId: string): Promise<string> {
  const token = randomToken()
  await db.query(
    `insert into sessions (token_hash, user_id, org_id, expires_at) values ($1, $2, $3, now() + ($4 || ' days')::interval)`,
    [sha256(token), userId, orgId, String(SESSION_TTL_DAYS)],
  )
  // au plus 10 sessions actives par utilisateur : les plus anciennes sont révoquées
  await db.query(
    `delete from sessions where user_id = $1 and token_hash in (select token_hash from sessions where user_id = $1 order by created_at desc offset 10)`,
    [userId],
  )
  return token
}

export async function principalFromSession(db: Db, token: string): Promise<Principal | null> {
  const r = await db.query<{
    user_id: string; email: string; org_id: string; org_name: string; role: Role | null; full_name: string | null; tech_id: string | null; client_id: string | null
    org_status: 'active' | 'suspended'; suspended_reason: string | null; is_operator: boolean; org_kind: 'client' | 'platform'
    reason_code: string | null; reason_label: string | null; payable: boolean | null
  }>(
    `select s.user_id, u.email, s.org_id, o.name as org_name, m.role, m.full_name, m.tech_id, m.client_id,
            o.status as org_status, o.suspended_reason, o.kind as org_kind, (op.user_id is not null) as is_operator, o.suspended_reason_code as reason_code,
            (select r.label from suspension_reasons r where r.code = o.suspended_reason_code) as reason_label,
            (select r.lifted_by_payment from suspension_reasons r where r.code = o.suspended_reason_code) as payable
       from sessions s
       join users u on u.id = s.user_id
       join organisations o on o.id = s.org_id
       left join members m on m.user_id = s.user_id and m.org_id = s.org_id
       left join operators op on op.user_id = s.user_id
      where s.token_hash = $1 and s.expires_at > now() and (m.user_id is not null or op.user_id is not null)`,
    [sha256(token)],
  )
  const x = r.rows[0]
  if (!x) return null
  const impersonating = !x.role // opérateur sans appartenance à cette entreprise : il agit en administrateur
  return {
    userId: x.user_id, email: x.email, orgId: x.org_id, orgName: x.org_name, role: x.role ?? 'admin', fullName: x.full_name ?? 'Opérateur Maintix',
    techId: x.tech_id, clientId: x.client_id, orgStatus: x.org_status, suspendedReason: x.suspended_reason, operator: x.is_operator, orgKind: x.org_kind, impersonating, suspendedReasonCode: x.reason_code, suspendedReasonLabel: x.reason_label, payable: !!x.payable,
  }
}

export const deleteSession = (db: Db, token: string) => db.query('delete from sessions where token_hash = $1', [sha256(token)])

/** Limiteur de débit en base (fenêtres fixes) : partagé entre instances et survit aux redémarrages. */
export function createRateLimiter(db: Db, now: () => number = Date.now) {
  let calls = 0
  return async (key: string, max: number, windowMs: number): Promise<boolean> => {
    const bucket = Math.floor(now() / windowMs)
    const r = await db.query<{ n: number }>(
      `insert into rate_limits (key, bucket, n) values ($1, $2, 1)
       on conflict (key, bucket) do update set n = rate_limits.n + 1 returning n`,
      [key, bucket],
    )
    // ménage périodique des fenêtres expirées
    if (++calls % 200 === 0) await db.query('delete from rate_limits where bucket < $1', [bucket - 1]).catch(() => {})
    return r.rows[0].n <= max
  }
}
