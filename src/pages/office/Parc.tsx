import { useState } from 'react'
import { Link } from 'react-router-dom'
import { actions, byId, contractFor, healthScore, useData } from '../../store'
import { Badge, Health } from '../../components/ui'
import { feedback } from '../../feedback'
import { fmtDate } from '../../util'
import { Icon } from '../../components/Icon'

export default function Parc() {
  const s = useData()
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ siteId: s.sites[0]?.id ?? '', label: '', brand: '', model: '', serial: '', year: 2010, loadKg: 630, stops: 5, machineRoom: 'haut' as const })
  const list = s.elevators.filter((e) => `${e.label} ${e.brand} ${e.serial} ${byId(s.sites, e.siteId)?.name} ${byId(s.clients, byId(s.sites, e.siteId)?.clientId)?.name}`.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="stack-lg">
      <div className="row between wrap"><h1>Parc ({s.elevators.length})</h1><span className="row wrap"><Link className="btn" to="/office/import"><Icon n="import" /> Importer</Link><button className="btn primary" onClick={() => setAdding(!adding)}>+ Appareil</button></span></div>
      {adding && (
        <form className="card stack" onSubmit={(e) => { e.preventDefault(); actions.addElevator(f); setAdding(false); feedback.toast(`Appareil « ${f.label} » ajouté.`) }}>
          <h2>Nouvel appareil</h2>
          <div className="grid2">
            <label className="field">Site<select value={f.siteId} onChange={(e) => setF({ ...f, siteId: e.target.value })}>{s.sites.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            <label className="field">Libellé<input required value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Ascenseur C1" /></label>
            <label className="field">Marque<input required value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} /></label>
            <label className="field">Modèle<input value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} /></label>
            <label className="field">N° de série<input required value={f.serial} onChange={(e) => setF({ ...f, serial: e.target.value })} /></label>
            <label className="field">Année<input type="number" value={f.year} onChange={(e) => setF({ ...f, year: +e.target.value })} /></label>
            <label className="field">Charge (kg)<input type="number" value={f.loadKg} onChange={(e) => setF({ ...f, loadKg: +e.target.value })} /></label>
            <label className="field">Niveaux<input type="number" value={f.stops} onChange={(e) => setF({ ...f, stops: +e.target.value })} /></label>
          </div>
          <button className="btn primary">Enregistrer</button>
        </form>
      )}
      <input type="search" placeholder="Rechercher (site, marque, n° de série…)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" />
      <div className="grid2">
        {list.map((e) => {
          const site = byId(s.sites, e.siteId)!
          const c = contractFor(s, e.id)
          return (
            <Link key={e.id} to={`/office/elevator/${e.id}`} className="card link stack">
              <div className="row between"><strong>{e.label}</strong><Health score={healthScore(s, e.id)} /></div>
              <p className="muted small">{site.name} · {byId(s.clients, site.clientId)?.name}</p>
              <div className="row wrap small"><Badge>{e.brand} {e.model}</Badge>{e.status === 'panne' && <Badge tone="bad">En panne</Badge>}{!c && <Badge tone="warn">Hors contrat</Badge>}<span className="muted">Dernière visite : {e.lastVisit ? fmtDate(e.lastVisit) : '—'}</span></div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
