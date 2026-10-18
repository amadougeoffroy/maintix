import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { actions, byId, contractFor, healthScore, useData } from '../store'
import { Icon } from '../components/Icon'
import { History as HistoryPanel } from '../components/History'
import { Health, JOB_LABEL, QR, SeverityBadge, StatusBadge, publicUrl } from '../components/ui'
import { MEASURES, DEFECT_DELAY } from '../checklist'
import { addDays, fmtDate, fmtDateLong, today } from '../util'
import type { Severity } from '../types'

export default function ElevatorSheet({ mode }: { mode: 'tech' | 'office' }) {
  const { id } = useParams()
  const s = useData()
  const nav = useNavigate()
  const el = byId(s.elevators, id)
  const [title, setTitle] = useState('')
  const [sev, setSev] = useState<Severity>('majeur')
  const [edit, setEdit] = useState(false)
  if (!el) return <p>Appareil introuvable.</p>
  const site = byId(s.sites, el.siteId)!
  const client = byId(s.clients, site.clientId)!
  const contract = contractFor(s, el.id)
  const defects = s.defects.filter((d) => d.elevatorId === el.id && d.status !== 'leve')
  const history = s.jobs
    .filter((j) => j.elevatorId === el.id && j.status === 'terminee')
    .sort((a, b) => (b.visit?.finishedAt ?? '').localeCompare(a.visit?.finishedAt ?? ''))
  const planned = s.jobs.filter((j) => j.elevatorId === el.id && j.status !== 'terminee').sort((a, b) => a.date.localeCompare(b.date))
  const score = healthScore(s, el.id)

  const startVisit = () => {
    const mine = planned.find((j) => j.type === 'entretien' && j.techId === s.session.techId)
    const job = mine ?? actions.createJob({ type: 'entretien', elevatorId: el.id, techId: s.session.techId, date: today() })
    nav(`/tech/job/${job.id}`)
  }

  return (
    <div className="stack-lg">
      <div>
        <div className="row between wrap">
          <h1>{el.label}</h1>
          <Health score={score} />
        </div>
        <p className="muted">{site.name} · {site.address}</p>
        <p className="muted small">{client.name}</p>
      </div>

      {mode === 'office' && (
        <section className="card stack">
          <div className="row wrap">
            <Link className="btn sm" to={`/office/dossier/${el.id}`}><Icon n="folder" /> Dossier de contrôle technique</Link>
            <button className="btn sm" onClick={() => setEdit(!edit)}>{edit ? 'Fermer' : <><Icon n="pencil" /> Modifier</>}</button>
            <button className="btn sm" onClick={() => {
              if (!confirm(`Supprimer ${el.label} ?`)) return
              if (actions.deleteElevator(el.id)) nav('/office/parc'); else alert('Suppression impossible : cet appareil a un historique d’interventions clôturées (traçabilité).')
            }}><Icon n="trash" /> Supprimer</button>
          </div>
          {edit && (
            <div className="grid2">
              <label className="field">Libellé<input value={el.label} onChange={(e) => actions.updateElevator(el.id, { label: e.target.value })} /></label>
              <label className="field">Marque<input value={el.brand} onChange={(e) => actions.updateElevator(el.id, { brand: e.target.value })} /></label>
              <label className="field">Modèle<input value={el.model} onChange={(e) => actions.updateElevator(el.id, { model: e.target.value })} /></label>
              <label className="field">N° de série<input value={el.serial} onChange={(e) => actions.updateElevator(el.id, { serial: e.target.value })} /></label>
              <label className="field">Année<input type="number" value={el.year} onChange={(e) => actions.updateElevator(el.id, { year: +e.target.value })} /></label>
              <label className="field">Statut<select value={el.status} onChange={(e) => actions.updateElevator(el.id, { status: e.target.value as 'ok' | 'panne' | 'arret' })}><option value="ok">En service</option><option value="panne">En panne</option><option value="arret">À l’arrêt</option></select></label>
            </div>
          )}
        </section>
      )}

      {mode === 'tech' && (
        <div className="grid2">
          <button className="btn primary" onClick={startVisit}>▶ Démarrer une visite</button>
          <Link to="/tech/urgences" className="btn"><Icon n="siren" /> Déclarer une panne</Link>
        </div>
      )}

      <section className="card stack">
        <h2>Accès & sécurité</h2>
        <p><strong>Accès :</strong> {site.access}</p>
        <p><strong>Risques :</strong> {site.risks}</p>
      </section>

      <section className="card">
        <h2 style={{ marginBottom: 8 }}>Fiche appareil</h2>
        <table>
          <tbody>
            <tr><th>Marque / modèle</th><td>{el.brand} {el.model}</td></tr>
            <tr><th>N° de série</th><td>{el.serial}</td></tr>
            <tr><th>Mise en service</th><td>{el.year}</td></tr>
            <tr><th>Charge · arrêts</th><td>{el.loadKg} kg · {el.stops} niveaux</td></tr>
            <tr><th>Machinerie</th><td>{el.machineRoom}</td></tr>
            <tr><th>Contrat</th><td>{contract ? `tous les ${contract.periodicityMonths} mois` : 'Hors contrat'}</td></tr>
            <tr><th>Dernière visite</th><td>{el.lastVisit ? fmtDateLong(el.lastVisit) : '—'}</td></tr>
          </tbody>
        </table>
      </section>

      <section className="stack">
        <h2>Défauts ouverts ({defects.length})</h2>
        {defects.length === 0 && <p className="muted">Aucun défaut ouvert.</p>}
        {defects.map((d) => (
          <div key={d.id} className="card">
            <div className="row between wrap"><SeverityBadge s={d.severity} /><span className={`small ${d.due < today() ? '' : 'muted'}`} style={d.due < today() ? { color: 'var(--bad)', fontWeight: 700 } : undefined}>{d.due < today() ? 'En retard · ' : 'Avant le '}{fmtDate(d.due)}</span></div>
            <p style={{ marginTop: 6 }}>{d.title}</p>
          </div>
        ))}
        {mode === 'office' && (
          <form
            className="card stack"
            onSubmit={(e) => {
              e.preventDefault()
              actions.addDefect({ elevatorId: el.id, origin: 'controle', title, severity: sev, due: addDays(today(), DEFECT_DELAY[sev]) })
              setTitle('')
            }}
          >
            <h3>Ajouter un défaut (contrôle technique)</h3>
            <input aria-label="Intitulé du défaut" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. garde-corps de toiture de cabine manquant" required />
            <select aria-label="Gravité" value={sev} onChange={(e) => setSev(e.target.value as Severity)}>
              <option value="mineur">Mineur</option><option value="majeur">Majeur</option><option value="critique">Critique</option>
            </select>
            <button className="btn">Ajouter</button>
          </form>
        )}
      </section>

      {planned.length > 0 && (
        <section className="stack">
          <h2>Prochaines interventions</h2>
          {planned.map((j) => (
            <div key={j.id} className="card row between">
              <span>{JOB_LABEL[j.type]} · {fmtDate(j.date)}</span>
              <span className="row"><span className="small muted">{byId(s.techs, j.techId)?.name ?? 'Non affecté'}</span><StatusBadge s={j.status} /></span>
            </div>
          ))}
        </section>
      )}

      <section className="stack">
        <h2>Historique</h2>
        {history.length === 0 && <p className="muted">Aucune intervention clôturée pour le moment.</p>}
        {history.map((j) => (
          <Link key={j.id} to={`/report/${j.id}`} className="card link">
            <div className="row between"><strong>{JOB_LABEL[j.type]}</strong><span className="small muted">{fmtDate(j.visit!.finishedAt!)}</span></div>
            <p className="small muted">{j.visit?.summary}</p>
          </Link>
        ))}
        {history.some((j) => j.visit && Object.keys(j.visit.measures).length) && (
          <div className="card">
            <h3>Évolution des mesures</h3>
            <div className="tablewrap"><table>
              <thead><tr><th>Date</th>{MEASURES.map((m) => <th key={m.key}>{m.label} ({m.unit})</th>)}</tr></thead>
              <tbody>{history.filter((j) => Object.keys(j.visit!.measures).length).map((j) => (
                <tr key={j.id}><td>{fmtDate(j.visit!.finishedAt!)}</td>{MEASURES.map((m) => <td key={m.key}>{j.visit!.measures[m.key] ?? '—'}</td>)}</tr>
              ))}</tbody>
            </table></div>
          </div>
        )}
      </section>

      {mode === 'office' && <HistoryPanel collection="elevators" id={el.id} />}

      <section className="card row wrap">
        <QR value={publicUrl(`/signal/${el.id}`)} size={120} />
        <div className="grow">
          <h3>QR de l’appareil</h3>
          <p className="small muted">Signalement public de panne. Page d’état : <Link to={`/status/${el.id}`}>voir</Link></p>
        </div>
      </section>
    </div>
  )
}
