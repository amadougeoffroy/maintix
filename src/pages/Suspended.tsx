import { PauseCircle } from 'lucide-react'
import { Logo } from '../brand/Logo'
import { signOut } from '../session'
import { useData } from '../store'

/** Écran affiché quand l'entreprise active est suspendue : explication et déconnexion. */
export default function Suspended() {
  const s = useData()
  return (
    <div className="hero"><div className="box stack">
      <div className="center stack"><Logo height={40} className="center-logo" /></div>
      <div className="card stack center" role="alert">
        <PauseCircle size={48} color="var(--warn)" style={{ margin: '0 auto' }} aria-hidden="true" />
        <h1>Accès suspendu</h1>
        <p>L’accès de l’entreprise <strong>{s.session.orgName}</strong> à Maintix est momentanément suspendu.</p>
        {s.session.suspendedReason && <p className="small"><strong>Motif :</strong> {s.session.suspendedReason}</p>}
        <p className="muted small">Vos données sont conservées. Contactez votre interlocuteur Maintix pour rétablir l’accès.</p>
      </div>
      <button className="btn block" onClick={() => void signOut()}>Se déconnecter</button>
    </div></div>
  )
}
