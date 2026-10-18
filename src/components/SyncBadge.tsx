import { runtime } from '../store'
import { useSyncStatus } from '../sync'

export function SyncBadge() {
  const s = useSyncStatus()
  if (!runtime.server) return null
  const label =
    s.state === 'offline' ? `Hors ligne${s.pending ? ` · ${s.pending} en attente` : ''}`
    : s.state === 'error' ? 'Erreur de synchro'
    : s.state === 'syncing' || s.pending > 0 ? `Synchro… ${s.pending || ''}`
    : 'Synchronisé'
  const dot = s.state === 'error' ? 'bad' : s.state === 'offline' ? 'warn' : s.state === 'syncing' || s.pending > 0 ? 'warn' : 'ok'
  return <span className="badge" style={{ background: 'rgb(255 255 255 / .2)', color: 'inherit' }} role="status" aria-live="polite" title={s.lastError ?? undefined}><span className={`dot ${dot}`} /> {label}</span>
}
