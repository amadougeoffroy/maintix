import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../api'
import { runtime } from '../store'

/** Première installation : crée l'organisation et son administrateur (jeton BOOTSTRAP_TOKEN requis). */
export default function Setup() {
  const [f, setF] = useState({ orgName: '', adminName: '', adminEmail: '', token: '' })
  const [state, setState] = useState<'idle' | 'sent' | 'error'>('idle')
  const [err, setErr] = useState('')
  if (!runtime.server) return <div className="hero"><p>Aucun serveur détecté : l’installation n’est disponible qu’avec l’API.</p></div>
  return (
    <div className="hero"><div className="box stack">
      <h1>Première installation</h1>
      {state === 'sent' ? (
        <div className="card stack" role="status"><p>Organisation créée. Un lien de connexion a été envoyé à <strong>{f.adminEmail}</strong>.</p><Link className="btn" to="/">Retour</Link></div>
      ) : (
        <form className="card stack" onSubmit={async (e) => {
          e.preventDefault()
          try { await api.bootstrap({ orgName: f.orgName, adminEmail: f.adminEmail, adminName: f.adminName }, f.token); setState('sent') }
          catch (x) { setErr(x instanceof ApiError ? (x.status === 409 ? 'L’instance est déjà initialisée.' : x.status === 403 ? 'Jeton d’installation incorrect.' : 'Données invalides.') : 'Erreur réseau.'); setState('error') }
        }}>
          <label className="field">Nom de l’entreprise<input required minLength={2} value={f.orgName} onChange={(e) => setF({ ...f, orgName: e.target.value })} /></label>
          <label className="field">Votre nom<input required minLength={2} value={f.adminName} onChange={(e) => setF({ ...f, adminName: e.target.value })} /></label>
          <label className="field">Votre e-mail<input type="email" required value={f.adminEmail} onChange={(e) => setF({ ...f, adminEmail: e.target.value })} /></label>
          <label className="field">Jeton d’installation (variable BOOTSTRAP_TOKEN)<input type="password" required value={f.token} onChange={(e) => setF({ ...f, token: e.target.value })} /></label>
          {state === 'error' && <p role="alert" style={{ color: 'var(--bad)' }}>{err}</p>}
          <button className="btn primary block">Créer l’organisation</button>
        </form>
      )}
    </div></div>
  )
}
