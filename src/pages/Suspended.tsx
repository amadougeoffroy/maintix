import { useEffect, useState } from 'react'
import { PauseCircle } from 'lucide-react'
import { api } from '../api'
import { Logo } from '../brand/Logo'
import { signOut, switchOrg } from '../session'
import { useData } from '../store'

/** Écran affiché quand l'entreprise active est suspendue : explication, changement d'entreprise, déconnexion. */
export default function Suspended() {
  const s = useData()
  const [orgs, setOrgs] = useState<{ id: string; name: string; current: boolean }[]>([])
  const [msg, setMsg] = useState('')
  useEffect(() => { api.orgs().then((r) => setOrgs(r.orgs)).catch(() => {}) }, [])
  const others = orgs.filter((o) => !o.current)
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
      {others.length > 0 && (
        <label className="field">Utiliser une autre entreprise
          <select defaultValue="" onChange={async (e) => { if (!e.target.value) return; setMsg('Changement…'); const r = await switchOrg(e.target.value); setMsg(r.ok ? '' : r.error) }}>
            <option value="">— Choisir —</option>{others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      )}
      {msg && <p role="status" className="small">{msg}</p>}
      <button className="btn block" onClick={() => void signOut()}>Se déconnecter</button>
    </div></div>
  )
}
