import { useEffect, useState } from 'react'
import { api, type AuditEntry } from '../../api'
import { describeEntry } from '../../components/History'
import { runtime } from '../../store'
import { fmtDate, fmtTime } from '../../util'

const COLLECTIONS = [['', 'Tout'], ['jobs', 'Missions'], ['invoices', 'Factures'], ['contracts', 'Contrats'], ['elevators', 'Appareils'], ['clients', 'Clients'], ['defects', 'Défauts'], ['quotes', 'Devis']]

export default function Audit() {
  const [col, setCol] = useState('')
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const load = (before?: number) => {
    setLoading(true)
    api.audit({ collection: col || undefined, before, limit: 50 }).then((r) => { setEntries((p) => (before ? [...p, ...r.entries] : r.entries)); setMore(r.more) }).catch(() => setEntries([])).finally(() => setLoading(false))
  }
  useEffect(() => { if (runtime.server) load() }, [col])
  if (!runtime.server) return <div className="stack"><h1>Journal d’activité</h1><p className="muted">Disponible avec le serveur : le mode démonstration ne conserve pas d’historique.</p></div>
  return (
    <div className="stack-lg">
      <div><h1>Journal d’activité</h1><p className="muted">Qui a fait quoi et quand : créations, modifications, suppressions, émissions, refus de synchronisation.</p></div>
      <div className="row wrap">{COLLECTIONS.map(([k, l]) => <button key={k} className={`btn sm ${col === k ? 'primary' : ''}`} onClick={() => setCol(k)}>{l}</button>)}</div>
      <div className="card pad0 tablewrap"><table>
        <thead><tr><th>Date</th><th>Utilisateur</th><th>Élément</th><th>Action</th></tr></thead>
        <tbody>
          {!loading && entries.length === 0 && <tr><td colSpan={4} className="muted">Aucune entrée.</td></tr>}
          {entries.map((e) => <tr key={e.id}><td style={{ whiteSpace: 'nowrap' }}>{fmtDate(e.at)} {fmtTime(e.at)}</td><td>{e.user ?? 'Système'}</td><td className="small">{e.collection ?? ''}{e.docId ? ` · ${e.docId.slice(0, 14)}` : ''}</td><td>{describeEntry(e)}</td></tr>)}
        </tbody>
      </table></div>
      {more && <button className="btn" disabled={loading} onClick={() => load(entries[entries.length - 1].id)}>Voir plus ancien</button>}
    </div>
  )
}
