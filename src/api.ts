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
  operator?: boolean
  orgKind?: 'client' | 'platform'
  impersonating?: boolean
  orgStatus?: 'active' | 'suspended'
  suspendedReason?: string | null
  suspendedReasonCode?: string | null
  suspendedReasonLabel?: string | null
  planEndsOn?: string | null
  planName?: string
  payable?: boolean
  role: 'admin' | 'bureau' | 'tech' | 'client'
  fullName: string
  techId: string | null
  clientId: string | null
}
export interface Offer { plan: string; maxTechs: number | null; maxElevators: number | null; priceMonthly: number; extraTechPrice: number; extraElevatorPrice: number; trialEndsOn: string | null; subscriptionEndsOn?: string | null; notes: string }
export interface OrgUsage { techs: number; elevators: number; clients: number; jobs30: number; members: number }
export interface OperatorOrg {
  id: string; name: string; status: 'active' | 'suspended'; suspendedReason: string | null; createdAt: string
  offer: Offer; usage: OrgUsage; lastActivity: string | null; lastLogin: string | null
  estimate: { base: number; overTechs: number; overElevators: number; amount: number }
  flags: { overTechs: boolean; overElevators: boolean; trialExpired: boolean; subscriptionExpired?: boolean }
  suspension: { code: string | null; label: string | null; detail: string | null; payable: boolean } | null
}
export interface SuspensionReason { code: string; label: string; liftedByPayment: boolean; automatic: boolean }
export interface PaymentRow { id: string; orgId?: string; org?: string; plan: string; months: number; amount: number; status: 'pending' | 'paid' | 'failed'; source: 'jeko' | 'manual'; method: string | null; reference: string; note?: string | null; createdAt: string; paidAt: string | null; periodEnd: string | null }
export interface FinanceView {
  currency: 'FCFA'
  collected: { total: number; thisMonth: number; series: { month: string; amount: number }[] }
  pending: { amount: number; count: number }
  outstanding: { amount: number; orgs: number }
  upcoming30: { amount: number; orgs: number }
  orgs: { orgId: string; name: string; status: string; plan: string; endsOn: string | null; monthly: number; paid: number; lastPaidAt: string | null; pending: number; due: number; upcoming: number }[]
  recent: PaymentRow[]
}
export interface PaymentSettings { provider: 'jeko'; webhookUrl: string; apiKeyId: string; storeId: string; apiKeyMasked: string | null; webhookSecretMasked: string | null; configured: boolean; webhookConfigured: boolean; encryptedWith: string }
export interface BillingOverview {
  online: boolean; canPay: boolean
  current: { plan: string; endsOn: string | null; trialEndsOn: string | null; status: string; suspension: { code: string | null; detail: string | null; payable: boolean } | null }
  plans: PlanPreset[]; months: number[]; methods: { code: string; label: string }[]; payments: PaymentRow[]
}
export interface PlanPreset { archived?: boolean; code: string; name: string; maxTechs: number | null; maxElevators: number | null; priceMonthly: number; extraTechPrice: number; extraElevatorPrice: number; trialDays?: number }
export interface PlanInput { name: string; maxTechs: number | null; maxElevators: number | null; priceMonthly: number; extraTechPrice: number; extraElevatorPrice: number; trialDays: number | null; archived: boolean }
export interface SignupRequest { id: string; company: string; contactName: string; email: string; phone: string | null; message: string | null; status: 'pending' | 'approved' | 'rejected'; createdAt: string; decidedAt: string | null; decisionReason: string | null; orgId: string | null }
export interface BillingView {
  month: string; currency: 'FCFA'; totalEstimate: number
  live: { orgId: string; name: string; status: string; plan: string; usage: OrgUsage; estimate: OperatorOrg['estimate']; flags: OperatorOrg['flags'] }[]
  frozen: { orgId: string; plan: string; techs: number; elevators: number; clients: number; jobs: number; amount: number; frozenAt: string }[]
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
  notifConfig: () => call<{ publicKey: string | null; smsConfigured: boolean; subscriptions: number; phone: string; escalationMinutes: number | null }>('GET', '/notifications/config'),
  subscribePush: (sub: { endpoint: string; keys: { p256dh: string; auth: string } }) => call<{ ok: true }>('POST', '/notifications/subscribe', sub),
  unsubscribePush: (endpoint: string) => call<{ ok: true }>('POST', '/notifications/unsubscribe', { endpoint }),
  setPhone: (phone: string) => call<{ ok: true }>('POST', '/notifications/phone', { phone }),
  testNotification: () => call<{ ok: true; push: number; sms: boolean }>('POST', '/notifications/test', {}),
  onboarding: () => call<{ onboarding: Record<string, boolean> }>('GET', '/me/onboarding'),
  setOnboarding: (patch: Record<string, boolean | undefined>) => call<{ onboarding: Record<string, boolean> }>('POST', '/me/onboarding', patch),
  /* console opérateur */
  opOverview: () => call<{ orgs: OperatorOrg[]; pendingSignups: number; plans: PlanPreset[] }>('GET', '/operator/overview'),
  opCreateOrg: (b: { name: string; adminName: string; adminEmail: string; plan: string }) => call<{ ok: true; orgId: string }>('POST', '/operator/orgs', b),
  opOffer: (id: string, b: Omit<Offer, 'notes' | 'trialEndsOn'> & { trialEndsOn: string | null; subscriptionEndsOn: string | null; notes: string }) => call<{ ok: true; org: OperatorOrg }>('POST', `/operator/orgs/${id}/offer`, b),
  opSuspend: (id: string, code: string, reason: string) => call<{ ok: true }>('POST', `/operator/orgs/${id}/suspend`, { code, reason }),
  opReasons: () => call<{ reasons: SuspensionReason[] }>('GET', '/operator/suspension-reasons'),
  opFinance: () => call<FinanceView>('GET', '/operator/finance'),
  opPaymentSettings: () => call<PaymentSettings>('GET', '/operator/payment-settings'),
  opSavePaymentSettings: (b: { apiKey?: string; apiKeyId?: string; storeId?: string; webhookSecret?: string }) => call<PaymentSettings>('PUT', '/operator/payment-settings', b),
  opClearPaymentSettings: () => call<PaymentSettings>('DELETE', '/operator/payment-settings', {}),
  opTestPayment: () => call<{ ok: true; stores: { id: string; name: string }[]; storeFound: boolean }>('POST', '/operator/payment-settings/test', {}),
  opManualPayment: (orgId: string, b: { plan: string; months: number; amount?: number; note: string }) => call<{ ok: true; lifted: boolean }>('POST', `/operator/orgs/${orgId}/payments`, b),
  opConfirmPayment: (id: string) => call<{ ok: true }>('POST', `/operator/payments/${id}/confirm`, {}),
  billing: () => call<BillingOverview>('GET', '/billing/overview'),
  checkout: (b: { plan: string; months: number; method: string }) => call<{ ok: true; paymentId: string; redirectUrl: string; amount: number }>('POST', '/billing/checkout', b),
  paymentStatus: (id: string) => call<{ id: string; status: 'pending' | 'paid' | 'failed'; orgStatus: string; plan: string; months: number; amount: number; periodEnd: string | null }>('GET', `/billing/payments/${id}`),
  opReactivate: (id: string) => call<{ ok: true }>('POST', `/operator/orgs/${id}/reactivate`, {}),
  opSignups: (status?: string) => call<{ signups: SignupRequest[] }>('GET', `/operator/signups${status ? `?status=${status}` : ''}`),
  opApprove: (id: string, plan: string) => call<{ ok: true; orgId: string }>('POST', `/operator/signups/${id}/approve`, { plan }),
  opReject: (id: string, reason: string) => call<{ ok: true }>('POST', `/operator/signups/${id}/reject`, { reason }),
  opBilling: (month: string) => call<BillingView>('GET', `/operator/billing?month=${month}`),
  opFreeze: (month: string) => call<{ ok: true; frozen: number }>('POST', '/operator/billing/freeze', { month }),
  opEnter: (id: string) => call<SessionInfo>('POST', `/operator/orgs/${id}/enter`, {}),
  opLeave: () => call<SessionInfo>('POST', '/operator/leave', {}),
  opPlans: () => call<{ plans: PlanPreset[] }>('GET', '/operator/plans'),
  opCreatePlan: (b: PlanInput & { code: string }) => call<{ ok: true; plans: PlanPreset[] }>('POST', '/operator/plans', b),
  opUpdatePlan: (code: string, b: PlanInput) => call<{ ok: true; plans: PlanPreset[] }>('PUT', `/operator/plans/${code}`, b),
  opDeletePlan: (code: string) => call<{ ok: true; plans: PlanPreset[] }>('DELETE', `/operator/plans/${code}`, {}),
  opOperators: () => call<{ operators: { userId: string; email: string; createdAt: string; fromEnv: boolean }[]; fromEnv: string[] }>('GET', '/operator/operators'),
  opAddOperator: (email: string) => call<{ ok: true }>('POST', '/operator/operators', { email }),
  opRemoveOperator: (id: string) => call<{ ok: true }>('DELETE', `/operator/operators/${id}`, {}),
  orgPlan: () => call<{ status: string; offer: Offer; usage: OrgUsage; flags: OperatorOrg['flags']; estimate: OperatorOrg['estimate'] }>('GET', '/org/plan'),
  info: () => call<{ legal: { name?: string; email?: string; phone?: string; address?: string; registration?: string; host?: string } }>('GET', '/public/info'),
  signup: (b: { company: string; name: string; email: string; phone?: string; message?: string; website?: string }) => call<{ ok: true }>('POST', '/public/signup', b),
  report: (b: { elevatorId: string; description: string; trapped: boolean; reporter: string }) => call<{ ok: true; jobId: string }>('POST', '/public/report', b),
  status: (id: string) => call<{ label: string; siteName: string; status: string; lastVisit: string | null; job: { status: string; createdAt: string; timeline: { at: string; label: string }[] } | null }>('GET', `/public/status/${encodeURIComponent(id)}`),
}
