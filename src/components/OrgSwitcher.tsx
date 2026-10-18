import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { switchOrg } from '../session'
import { feedback } from '../feedback'
import { runtime, useData } from '../store'

/** Choix de l'entreprise (utilisateurs rattachés à plusieurs) et création d'une entreprise supplémentaire (administrateur). */
export function OrgSwitcher() {
  const s = useData()
  const [orgs, setOrgs] = useState<{ id: string; name: string; current: boolean }[]>([])
  const [msg, setMsg] = useState('')
  const reload = () => api.orgs().then((r) => setOrgs(r.orgs)).catch(() => {})
  useEffect(() => { if (runtime.server) void reload() }, [s.session.orgName])
  if (!runtime.server) return null
  const go = async (id: string) => {
    setMsg('Changement d’entreprise…')
    const r = await switchOrg(id)
    setMsg('')
    if (!r.ok) { feedback.toast(r.error, 'error'); return false }
    return true
  }
  return (
    <section className="stack">
      <h2>Entreprise</h2>
      <p className="muted small">Connecté à <strong>{s.session.orgName}</strong>.{s.session.operator && <> Les entreprises se créent depuis la <Link to="/operator">console opérateur</Link>.</>}</p>
      {orgs.length > 1 && (
        <label className="field">Changer d’entreprise
          <select value={orgs.find((o) => o.current)?.id ?? ''} onChange={async (e) => { const target = orgs.find((o) => o.id === e.target.value); if (await go(e.target.value)) feedback.dialog({ tone: 'info', title: `Vous êtes dans « ${target?.name} »`, body: `Toutes les données affichées (clients, appareils, factures, utilisateurs) sont maintenant celles de « ${target?.name} ».` }) }}>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
        </label>
      )}
      {msg && <p role="status" className="small">{msg}</p>}
    </section>
  )
}
