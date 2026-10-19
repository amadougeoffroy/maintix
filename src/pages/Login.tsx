import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api'
import { Logo } from '../brand/Logo'
import { Icon } from '../components/Icon'
import { actions, runtime, useData } from '../store'

function EmailLogin() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [err, setErr] = useState('')
  return (
    <form className="card stack" onSubmit={async (e) => {
      e.preventDefault()
      setState('sending')
      try { await api.requestLink(email); setState('sent') } catch (x) { setErr(x instanceof ApiError && x.status === 429 ? 'Trop de demandes, réessayez plus tard.' : 'Impossible d’envoyer le lien.'); setState('error') }
    }}>
      <h2>Recevoir mon lien de connexion</h2>
      {state === 'sent' ? (
        <p role="status">Si cette adresse est enregistrée, un lien de connexion vient de vous être envoyé. Il est valable 15 minutes.</p>
      ) : (
        <>
          <label className="field">Adresse e-mail<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          {state === 'error' && <p role="alert" style={{ color: 'var(--bad)' }}>{err}</p>}
          <button className="btn primary block" disabled={state === 'sending'}>{state === 'sending' ? 'Envoi…' : 'Recevoir mon lien de connexion'}</button>
        </>
      )}
      <p className="small muted">Pas de mot de passe : le lien vous connecte en un clic.</p>
      <p className="small"><Link to="/signup">Pas encore de compte ? Demander un accès</Link> · <Link to="/setup">Première installation</Link></p>
    </form>
  )
}

export default function Login() {
  const s = useData()
  const nav = useNavigate()
  return (
    <div className="hero">
      <div className="box">
        <div className="center stack">
          <Logo height={52} className="center-logo" />
          <h1 className="sr-only">Maintix</h1>
          <p className="muted">Chaque visite, tracée.</p>
        </div>
        {runtime.server ? <><EmailLogin /><p className="center"><Link to="/">← Retour à l’accueil</Link></p></> : runtime.unreachable ? (
          <div className="card stack center" role="alert">
            <h2>Service injoignable</h2>
            <p className="muted">Impossible de joindre Maintix pour le moment. Vérifiez votre connexion puis réessayez.</p>
            <button className="btn primary" onClick={() => location.reload()}>Réessayer</button>
            <Link to="/">← Retour à l’accueil</Link>
          </div>
        ) : (
          <>
            <p className="muted center">{runtime.explicitDemo ? 'Mode démonstration : explorez Maintix avec des données d’exemple, stockées sur cet appareil uniquement. Choisissez un profil.' : 'Mode démonstration (aucun serveur détecté) : choisissez un profil.'}</p>
            {runtime.explicitDemo && <p className="center"><Link to="/">← Retour à l’accueil</Link></p>}
            <section className="stack">
              <h2>Techniciens</h2>
              {s.techs.filter((t) => t.role === 'tech').map((t) => (
                <button key={t.id} className="btn block" onClick={() => { actions.login('tech', t.id); nav('/tech') }}><Icon n="wrench" /> {t.name}</button>
              ))}
            </section>
            <section className="stack">
              <h2>Bureau</h2>
              <button className="btn block" onClick={() => { actions.login('bureau', s.techs.find((t) => t.role === 'bureau')?.id ?? null); nav('/office') }}><Icon n="monitor" /> Responsable d’exploitation</button>
            </section>
            <section className="stack">
              <h2>Clients</h2>
              {s.clients.map((c) => (
                <button key={c.id} className="btn block" onClick={() => { actions.loginClient(c.id); nav('/client') }}><Icon n="building" /> {c.name}</button>
              ))}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
