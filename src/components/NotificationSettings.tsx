import { useEffect, useState } from 'react'
import { api } from '../api'
import { runtime } from '../store'

const b64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0))
const arr = (buf: ArrayBuffer | null) => (buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '')

/** Abonnement aux alertes d'astreinte : notifications push (PWA installée) et SMS. */
export function NotificationSettings() {
  const [cfg, setCfg] = useState<Awaited<ReturnType<typeof api.notifConfig>> | null>(null)
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('default')
  const [subscribed, setSubscribed] = useState(false)
  const [phone, setPhone] = useState('')
  const [msg, setMsg] = useState('')
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

  const refresh = async () => {
    const c = await api.notifConfig().catch(() => null)
    setCfg(c)
    if (c) setPhone(c.phone)
    if (supported) {
      setPerm(Notification.permission)
      const reg = await navigator.serviceWorker.getRegistration()
      setSubscribed(!!(await reg?.pushManager.getSubscription()))
    } else setPerm('unsupported')
  }
  useEffect(() => { if (runtime.server) void refresh() }, [])
  if (!runtime.server) return null

  const enable = async () => {
    try {
      if (!cfg?.publicKey) return setMsg('Les notifications push ne sont pas configurées sur le serveur (clés VAPID).')
      const p = await Notification.requestPermission()
      setPerm(p)
      if (p !== 'granted') return setMsg('Autorisation refusée : activez les notifications dans les réglages du navigateur.')
      const reg = await navigator.serviceWorker.ready
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(cfg.publicKey) }))
      await api.subscribePush({ endpoint: sub.endpoint, keys: { p256dh: arr(sub.getKey('p256dh')), auth: arr(sub.getKey('auth')) } })
      setMsg('Notifications activées sur cet appareil.')
      await refresh()
    } catch { setMsg('Activation impossible sur cet appareil.') }
  }
  const disable = async () => {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (sub) { await api.unsubscribePush(sub.endpoint).catch(() => {}); await sub.unsubscribe() }
    setMsg('Notifications désactivées sur cet appareil.')
    await refresh()
  }
  const savePhone = async () => {
    try { await api.setPhone(phone.replace(/[\s.-]/g, '')); setMsg(phone ? 'Numéro enregistré.' : 'Numéro supprimé.'); await refresh() }
    catch { setMsg('Numéro invalide : utilisez le format international, par exemple +33612345678.') }
  }
  const test = async () => {
    try { const r = await api.testNotification(); setMsg(r.push || r.sms ? `Test envoyé${r.push ? ' (notification)' : ''}${r.sms ? ' (SMS)' : ''}.` : 'Aucun canal actif : activez les notifications ou ajoutez un numéro.') }
    catch { setMsg('Test impossible.') }
  }

  return (
    <section className="stack">
      <h2>Alertes d’astreinte</h2>
      <p className="muted small">Recevez les pannes en temps réel, même application fermée.{cfg?.escalationMinutes ? ` Sans prise en charge, l’alerte monte au bureau après ${cfg.escalationMinutes} min.` : ''}</p>
      <div className="card stack">
        <div className="row between wrap">
          <span><strong>Notifications sur cet appareil</strong><br /><span className="small muted">{perm === 'unsupported' ? 'Non prises en charge par ce navigateur. Sur iPhone : ajoutez Maintix à l’écran d’accueil (iOS 16.4 ou plus).' : subscribed ? 'Activées.' : perm === 'denied' ? 'Bloquées dans le navigateur.' : 'Désactivées.'}</span></span>
          {perm !== 'unsupported' && (subscribed ? <button className="btn sm" onClick={disable}>Désactiver</button> : <button className="btn sm primary" onClick={enable} disabled={perm === 'denied' || !cfg?.publicKey}>Activer</button>)}
        </div>
        {cfg && !cfg.publicKey && <p className="small" style={{ color: 'var(--warn)' }}>Le serveur n’a pas de clés VAPID : notifications push indisponibles.</p>}
        <label className="field">Téléphone pour les alertes par SMS {cfg && !cfg.smsConfigured && <span className="muted small">(SMS non configurés sur le serveur)</span>}
          <div className="row"><input inputMode="tel" placeholder="+33612345678" value={phone} onChange={(e) => setPhone(e.target.value)} /><button className="btn sm" onClick={savePhone}>Enregistrer</button></div>
        </label>
        <div className="row wrap"><button className="btn sm" onClick={test}>Envoyer un test</button>{msg && <span role="status" className="small">{msg}</span>}</div>
      </div>
    </section>
  )
}
