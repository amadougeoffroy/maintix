import { Link, useParams } from 'react-router-dom'
import { byId, contractFor, healthScore, useData } from '../../store'
import { SeverityBadge } from '../../components/ui'
import { fmtDateLong, today } from '../../util'
import { Icon } from '../../components/Icon'

/** Dossier de contrôle technique : carnet d'entretien + défauts + preuves, imprimable. */
export default function Dossier() {
  const { id } = useParams()
  const s = useData()
  const el = byId(s.elevators, id)
  if (!el) return <p>Appareil introuvable.</p>
  const site = byId(s.sites, el.siteId)!
  const client = byId(s.clients, site.clientId)!
  const contract = contractFor(s, el.id)
  const jobs = s.jobs.filter((j) => j.elevatorId === el.id && j.status === 'terminee').sort((a, b) => (a.visit!.finishedAt ?? '').localeCompare(b.visit!.finishedAt ?? ''))
  const defects = s.defects.filter((d) => d.elevatorId === el.id)
  return (
    <div className="stack-lg">
      <div className="row no-print wrap"><button className="btn primary" onClick={() => window.print()}><Icon n="printer" /> Imprimer / PDF</button><Link className="btn" to={`/office/elevator/${el.id}`}>← Fiche appareil</Link></div>
      <article className="paper">
        <h1>Dossier de contrôle technique</h1>
        <p>Édité le {fmtDateLong(today())} · Indice de santé {healthScore(s, el.id)}/100</p>
        <h2>Appareil</h2>
        <table><tbody>
          <tr><th>Désignation</th><td>{el.label}</td></tr>
          <tr><th>Site</th><td>{site.name}, {site.address} ({client.name})</td></tr>
          <tr><th>Constructeur</th><td>{el.brand} {el.model} · n° {el.serial} · {el.year}</td></tr>
          <tr><th>Caractéristiques</th><td>{el.loadKg} kg · {el.stops} niveaux · machinerie {el.machineRoom}</td></tr>
          <tr><th>Contrat d’entretien</th><td>{contract ? `tous les ${contract.periodicityMonths} mois depuis le ${fmtDateLong(contract.start)}` : 'Aucun'}</td></tr>
        </tbody></table>
        <h2>Carnet d’entretien ({jobs.length} intervention(s))</h2>
        {jobs.length === 0 ? <p>Aucune intervention enregistrée.</p> : (
          <table>
            <thead><tr><th>Date</th><th>Type</th><th>Technicien</th><th>Synthèse</th><th>Sceau</th></tr></thead>
            <tbody>{jobs.map((j) => (
              <tr key={j.id}><td style={{ whiteSpace: 'nowrap' }}>{fmtDateLong(j.visit!.finishedAt!)}</td><td>{j.type}</td><td>{byId(s.techs, j.techId)?.name}</td><td>{j.visit!.summary}</td><td className="hash">{j.visit!.hash?.slice(0, 12)}…</td></tr>
            ))}</tbody>
          </table>
        )}
        <h2>Défauts et mises en conformité</h2>
        {defects.length === 0 ? <p>Aucun défaut enregistré.</p> : (
          <table>
            <thead><tr><th>Gravité</th><th>Défaut</th><th>Échéance</th><th>État</th></tr></thead>
            <tbody>{defects.map((d) => <tr key={d.id}><td><SeverityBadge s={d.severity} /></td><td>{d.title}</td><td>{fmtDateLong(d.due)}</td><td>{d.status === 'leve' ? 'Levé' : d.due < today() ? 'Ouvert – en retard' : 'Ouvert'}</td></tr>)}</tbody>
          </table>
        )}
      </article>
    </div>
  )
}
