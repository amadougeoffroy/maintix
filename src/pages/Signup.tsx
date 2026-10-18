import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { api, ApiError } from '../api'
import { Logo } from '../brand/Logo'
import { runtime } from '../store'

/** Demande d'accès en libre-service : l'entreprise est créée seulement après validation par l'équipe Maintix. */
export default function Signup() {
  const [f, setF] = useState({ company: '', name: '', email: '', phone: '', message: '', website: '' })
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [err, setErr] = useState('')
  if (!runtime.server) return <div className="hero"><p>Aucun serveur détecté : les demandes d’accès nécessitent la plateforme.</p></div>
  return (
    <div className="hero"><div className="box">
      <div className="center stack"><Logo height={44} className="center-logo" /><h1>Demander un accès</h1><p className="muted">Présentez votre entreprise : nous étudions chaque demande et vous répondons rapidement.</p></div>
      {state === 'done' ? (
        <div className="card stack center" role="status">
          <CheckCircle2 size={44} color="var(--ok)" style={{ margin: '0 auto' }} aria-hidden="true" />
          <h2>Demande envoyée</h2>
          <p>Un e-mail de confirmation vient de partir à <strong>{f.email}</strong>. En cas d’accord, vous recevrez un lien de connexion à cette adresse.</p>
          <Link className="btn" to="/">Retour à la connexion</Link>
        </div>
      ) : (
        <form className="card stack" onSubmit={async (e) => {
          e.preventDefault()
          setState('sending')
          try { await api.signup({ company: f.company, name: f.name, email: f.email, phone: f.phone || undefined, message: f.message || undefined, website: f.website || undefined }); setState('done') }
          catch (x) { setErr(x instanceof ApiError && x.status === 429 ? 'Trop de demandes depuis cette connexion, réessayez plus tard.' : 'Envoi impossible : vérifiez les champs et réessayez.'); setState('error') }
        }}>
          <label className="field">Nom de l’entreprise<input required minLength={2} autoComplete="organization" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></label>
          <label className="field">Votre nom<input required minLength={2} autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="field">Votre e-mail professionnel<input type="email" required autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <label className="field">Téléphone (facultatif)<input type="tel" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
          <label className="field">Parlez-nous de votre activité (facultatif)<textarea value={f.message} maxLength={1000} onChange={(e) => setF({ ...f, message: e.target.value })} placeholder="Nombre de techniciens, d’ascenseurs suivis, villes…" /></label>
          {/* piège à robots : invisible pour les personnes, rempli par les automates */}
          <div style={{ position: 'absolute', left: '-9999px' }} aria-hidden="true"><label>Site web<input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} /></label></div>
          {state === 'error' && <p role="alert" style={{ color: 'var(--bad)' }}>{err}</p>}
          <button className="btn primary block" disabled={state === 'sending'}>{state === 'sending' ? 'Envoi…' : 'Envoyer ma demande'}</button>
          <p className="small muted center"><Link to="/">J’ai déjà un accès</Link></p>
        </form>
      )}
    </div></div>
  )
}
