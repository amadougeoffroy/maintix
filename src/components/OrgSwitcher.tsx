import { useEffect, useState } from 'react'
import { api } from '../api'
import { switchOrg } from '../session'
import { runtime, useData } from '../store'

/** Choix de l'entreprise (utilisateurs rattachés à plusieurs) et création d'une entreprise supplémentaire (administrateur). */
export function OrgSwitcher() {
  const s = useData()
  const [orgs, setOrgs] = useState<{ id: string; name: string; current: boolean }[]>([])
  const [msg, setMsg] = useState('')
  const [name, setName] = useState('')
  const reload = () => api.orgs().then((r) => setOrgs(r.orgs)).catch(() => {})
  useEffect(() => { if (runtime.server) void reload() }, [s.session.orgName])
  if (!runtime.server) return null
  const go = async (id: string) => { setMsg('Changement…'); const r = await switchOrg(id); setMsg(r.ok ? '' : r.error) }
  return (
    <section className="stack">
      <h2>Entreprise</h2>
      <p className="muted small">Connecté à <strong>{s.session.orgName}</strong>.</p>
      {orgs.length > 1 && (
        <label className="field">Changer d’entreprise
          <select value={orgs.find((o) => o.current)?.id ?? ''} onChange={(e) => go(e.target.value)}>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
        </label>
      )}
      {s.session.isAdmin && (
        <form className="row wrap" onSubmit={async (e) => {
          e.preventDefault()
          try { const r = await api.createOrg(name); setName(''); await reload(); await go(r.orgId) } catch { setMsg('Création impossible (limite atteinte ?).') }
        }}>
          <input aria-label="Nom de la nouvelle entreprise" placeholder="Nouvelle entreprise" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 280 }} />
          <button className="btn sm">Créer</button>
        </form>
      )}
      {msg && <p role="status" className="small">{msg}</p>}
    </section>
  )
}
