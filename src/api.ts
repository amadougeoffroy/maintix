/** Accès à l'API serveur. Sans serveur joignable, l'application reste en mode local (démo). */
export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(`${status} ${code}`)
  }
}

async function call<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? 'error')
  return data as T
}

export interface SessionInfo {
  user: { id: string; email: string }
  org: { id: string; name: string }
  role: 'admin' | 'bureau' | 'tech' | 'client'
  fullName: string
  techId: string | null
  clientId: string | null
}
export interface Member {
  userId: string
  email: string
  role: SessionInfo['role']
  fullName: string
  techId: string | null
  clientId: string | null
}
export interface AuditEntry {
  id: number
  at: string
  action: string
  collection: string | null
  docId: string | null
  user: string | null
  detail: { created?: boolean; changed?: Record<string, { from?: unknown; to?: unknown } | true>; [k: string]: unknown } | null
}
export interface RemoteDoc {
  collection: string
  id: string
  data: Record<string, unknown> | null
  deleted: boolean
  seq: number
}
export interface PushResult {
  collection: string
  id: string
  ok: boolean
  seq?: number
  reason?: string
  doc?: { data: Record<string, unknown> | null; deleted: boolean; seq: number }
}

export const api = {
  /** Vrai si l'API répond (mode serveur). Délai court pour ne pas retarder le démarrage hors ligne. */
  async probe(): Promise<boolean> {
    try {
      const ctl = new AbortController()
      const t = setTimeout(() => ctl.abort(), 2000)
      const res = await fetch('/api/health', { signal: ctl.signal })
      clearTimeout(t)
      return res.ok && (await res.json()).mode === 'server'
    } catch {
      return false
    }
  },
  session: () => call<SessionInfo>('GET', '/auth/session'),
  requestLink: (email: string) => call<{ ok: true }>('POST', '/auth/request-link', { email }),
  verify: (token: string) => call<SessionInfo>('POST', '/auth/verify', { token }),
  logout: () => call<{ ok: true }>('POST', '/auth/logout', {}),
  bootstrap: (b: { orgName: string; adminEmail: string; adminName: string }, token: string) => call<{ ok: true }>('POST', '/bootstrap', b, { 'x-bootstrap-token': token }),
  members: () => call<{ members: Member[] }>('GET', '/members'),
  invite: (b: { email: string; fullName: string; role: string; clientId?: string }) => call<{ ok: true }>('POST', '/members', b),
  removeMember: (id: string) => call<{ ok: true }>('DELETE', `/members/${id}`, {}),
  push: (ops: { collection: string; id: string; data: Record<string, unknown> | null }[]) => call<{ results: PushResult[] }>('POST', '/sync/push', { ops }),
  pull: (since: number, limit = 300) => call<{ docs: RemoteDoc[]; more: boolean; cursor: number }>('GET', `/sync/pull?since=${since}&limit=${limit}`),
  sendReport: (jobId: string, b: { to?: string[]; message?: string } = {}) => call<{ ok: true; sentAt: string; to: string[] }>('POST', `/reports/${encodeURIComponent(jobId)}/send`, b),
  issueInvoice: (id: string) => call<{ ok: true; invoice: Record<string, unknown> }>('POST', `/invoices/${encodeURIComponent(id)}/issue`, {}),
  sendInvoice: (id: string, b: { to?: string[]; message?: string } = {}) => call<{ ok: true; to: string[] }>('POST', `/invoices/${encodeURIComponent(id)}/send`, b),
  audit: (q: { collection?: string; id?: string; before?: number; limit?: number } = {}) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') p.set(k, String(v))
    return call<{ entries: AuditEntry[]; more: boolean }>('GET', `/audit?${p}`)
  },
  orgs: () => call<{ orgs: { id: string; name: string; role: string; fullName: string; current: boolean }[] }>('GET', '/orgs'),
  switchOrg: (orgId: string) => call<SessionInfo>('POST', '/auth/switch-org', { orgId }),
  createOrg: (name: string) => call<{ ok: true; orgId: string }>('POST', '/orgs', { name }),
  notifConfig: () => call<{ publicKey: string | null; smsConfigured: boolean; subscriptions: number; phone: string; escalationMinutes: number | null }>('GET', '/notifications/config'),
  subscribePush: (sub: { endpoint: string; keys: { p256dh: string; auth: string } }) => call<{ ok: true }>('POST', '/notifications/subscribe', sub),
  unsubscribePush: (endpoint: string) => call<{ ok: true }>('POST', '/notifications/unsubscribe', { endpoint }),
  setPhone: (phone: string) => call<{ ok: true }>('POST', '/notifications/phone', { phone }),
  testNotification: () => call<{ ok: true; push: number; sms: boolean }>('POST', '/notifications/test', {}),
  report: (b: { elevatorId: string; description: string; trapped: boolean; reporter: string }) => call<{ ok: true; jobId: string }>('POST', '/public/report', b),
  status: (id: string) => call<{ label: string; siteName: string; status: string; lastVisit: string | null; job: { status: string; createdAt: string; timeline: { at: string; label: string }[] } | null }>('GET', `/public/status/${encodeURIComponent(id)}`),
}
