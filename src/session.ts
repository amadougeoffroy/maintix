import { api, type SessionInfo } from './api'
import { actions, runtime } from './store'
import { getSyncStatus, startSync, stopSync, syncNow } from './sync'
import { loadOnboarding, resetOnboarding } from './onboarding'
import { feedback } from './feedback'
import type { State } from './types'

export const toSession = (i: SessionInfo): State['session'] => ({
  role: i.role === 'admin' || i.role === 'bureau' ? 'bureau' : i.role === 'tech' ? 'tech' : null,
  techId: i.techId,
  clientId: i.clientId,
  isAdmin: i.role === 'admin',
  fullName: i.fullName,
  orgName: i.org.name,
  operator: !!i.operator,
  orgKind: i.orgKind ?? 'client',
  impersonating: !!i.impersonating,
  orgStatus: i.orgStatus ?? 'active',
  suspendedReason: i.suspendedReason ?? null,
  suspendedReasonCode: i.suspendedReasonCode ?? null,
  suspendedReasonLabel: i.suspendedReasonLabel ?? null,
  planEndsOn: i.planEndsOn ?? null,
  planName: i.planName,
  payable: !!i.payable,
})

const USER_KEY = 'cabine-user'
const rememberedUser = () => { try { return localStorage.getItem(USER_KEY) } catch { return null } }
const remember = (id: string | null) => { try { id ? localStorage.setItem(USER_KEY, id) : localStorage.removeItem(USER_KEY) } catch { /* stockage indisponible */ } }

/** Active la session serveur : efface les données d'un autre compte, puis démarre la synchronisation. */
export async function enterSession(info: SessionInfo) {
  if (rememberedUser() && rememberedUser() !== info.user.id) {
    await stopSync(true)
    actions.clearLocal()
  }
  remember(info.user.id)
  actions.setSession(toSession(info))
  void loadOnboarding()
  await startSync({ onUnauthenticated: () => { actions.setSession({ role: null, techId: null, clientId: null }); feedback.toast('Votre session a été fermée. Reconnectez-vous pour continuer.', 'info') } })
}

/** Au démarrage en mode serveur : reprend la session si le cookie est encore valide. */
export async function bootServerSession() {
  try {
    await enterSession(await api.session())
  } catch {
    actions.setSession({ role: null, techId: null, clientId: null })
  }
}

/** Opérateur : bascule la session vers une autre entreprise (ou la plateforme) après avoir envoyé les modifications en attente. */
async function moveSession(call: () => Promise<SessionInfo>): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await syncNow()
    if (getSyncStatus().pending > 0) return { ok: false, error: 'Des modifications ne sont pas encore synchronisées : réessayez dans un instant.' }
    const info = await call()
    await stopSync(true)
    actions.clearLocal()
    await enterSession(info)
    return { ok: true }
  } catch {
    return { ok: false, error: 'Changement impossible (hors ligne ?).' }
  }
}
/** Opérateur : entre dans une entreprise cliente (en administrateur). */
export const enterOrg = (orgId: string) => moveSession(() => api.opEnter(orgId))
/** Opérateur : retourne à la console. */
export const leaveToConsole = () => moveSession(() => api.opLeave())

export async function signOut(): Promise<boolean> {
  if (!runtime.server) {
    actions.logout()
    return true
  }
  const pending = getSyncStatus().pending
  if (pending > 0 && !(await feedback.confirm({ tone: 'danger', title: 'Modifications non synchronisées', body: `${pending} modification(s) ne sont pas encore envoyées au serveur et seront perdues si vous vous déconnectez maintenant.`, confirmLabel: 'Me déconnecter quand même', cancelLabel: 'Rester connecté' }))) return false
  await api.logout().catch(() => {})
  await stopSync(true)
  remember(null)
  resetOnboarding()
  actions.clearLocal()
  actions.logout()
  return true
}
