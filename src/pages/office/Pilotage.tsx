import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../../store'
import { Badge } from '../../components/ui'
import { computePilotage, pilotageCsv } from '../../pilotage'
import { fmtMinutes } from '../../sla'
import { downloadText, fcfa, fmtDate, today } from '../../util'

const PERIODS = [[30, '30 jours'], [90, '90 jours'], [365, '12 mois']] as const
const rateTone = (r: number | null, good = 90, ok = 70): 'ok' | 'warn' | 'bad' | undefined => (r === null ? undefined : r >= good ? 'ok' : r >= ok ? 'warn' : 'bad')

function Meter({ label, value, tone }: { label: string; value: number | null; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : tone === 'bad' ? 'var(--bad)' : 'var(--brand)'
  return (
    <div>
      <div className="row between small"><span>{label}</span><strong>{value === null ? '—' : `${value} %`}</strong></div>
      <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? 0}><div style={{ width: `${value ?? 0}%`, background: color }} /></div>
    </div>
  )
}

/** Tableau de bord de pilotage : pannes, délais, SLA, visites contractuelles, défauts, facturation. */
export default function Pilotage() {
  const s = useData()
  const [days, setDays] = useState<number>(30)
  const t = today()
  const p = useMemo(() => computePilotage(s, t, days), [s, t, days])
  const maxPannes = Math.max(1, ...p.pannes.byElevator.map((e) => e.count))
  return (
    <div className="stack-lg">
      <div className="row between wrap no-print">
        <div><h1>Pilotage</h1><p className="muted">Du {fmtDate(p.from)} au {fmtDate(p.to)}. Indicateurs calculés à partir de vos interventions, contrats et factures.</p></div>
        <div className="row wrap">
          <div className="seg" role="radiogroup" aria-label="Période">
            {PERIODS.map(([d, label]) => <button key={d} type="button" role="radio" aria-checked={days === d} className={days === d ? 'ok on' : ''} onClick={() => setDays(d)}>{label}</button>)}
          </div>
          <button className="btn sm" onClick={() => downloadText(`pilotage-${p.from}-${p.to}.csv`, pilotageCsv(p))}>Exporter (CSV)</button>
          <button className="btn sm" onClick={() => window.print()}>Imprimer</button>
        </div>
      </div>

      <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <div className="card kpi"><span className="muted small">Pannes</span><b>{p.pannes.count}</b><span className="small muted">dont {p.pannes.trapped} avec personne bloquée</span></div>
        <div className="card kpi"><span className="muted small">Délai moyen d’arrivée</span><b>{p.pannes.avgResponseMin === null ? '—' : fmtMinutes(p.pannes.avgResponseMin)}</b><span className="small muted">après le signalement</span></div>
        <div className="card kpi"><span className="muted small">Délai moyen de résolution</span><b>{p.pannes.avgResolutionMin === null ? '—' : fmtMinutes(p.pannes.avgResolutionMin)}</b></div>
        <div className="card kpi"><span className="muted small">Respect du SLA</span><b style={{ color: p.sla.rate !== null && p.sla.rate < 90 ? 'var(--bad)' : undefined }}>{p.sla.rate === null ? '—' : `${p.sla.rate} %`}</b><span className="small muted">{p.sla.measured ? `${p.sla.respected}/${p.sla.measured} dépannages` : 'aucun engagement mesuré'}</span></div>
      </div>

      <section className="card stack">
        <h2>Visites d’entretien et défauts</h2>
        <Meter label={`Visites contractuelles réalisées (${p.visits.done} sur ${p.visits.expected} attendues)`} value={p.visits.rate} tone={rateTone(p.visits.rate)} />
        <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          <div className="kpi"><span className="muted small">Visites en retard</span><b style={p.visits.overdue ? { color: 'var(--warn)' } : undefined}>{p.visits.overdue}</b></div>
          <div className="kpi"><span className="muted small">Défauts ouverts</span><b>{p.defects.open}</b></div>
          <div className="kpi"><span className="muted small">Défauts hors délai</span><b style={p.defects.overdue ? { color: 'var(--bad)' } : undefined}>{p.defects.overdue}</b></div>
        </div>
      </section>

      <section className="card stack">
        <h2>Appareils les plus en panne</h2>
        {p.pannes.byElevator.length === 0 ? <p className="muted">Aucune panne sur la période.</p> : (
          <>
            <ul className="rank" aria-hidden="true">
              {p.pannes.byElevator.map((e) => <li key={e.elevatorId}><span className="rank-label">{e.label}</span><span className="rank-bar"><span style={{ width: `${(e.count / maxPannes) * 100}%` }} /></span><strong>{e.count}</strong></li>)}
            </ul>
            <div className="table-wrap" tabIndex={0} role="region" aria-label="Détail des pannes par appareil"><table>
              <thead><tr><th scope="col">Appareil</th><th scope="col">Client · site</th><th scope="col">Pannes</th><th scope="col">Personne bloquée</th><th scope="col">Résolution moyenne</th></tr></thead>
              <tbody>{p.pannes.byElevator.map((e) => (
                <tr key={e.elevatorId}><th scope="row"><Link to={`/office/elevator/${e.elevatorId}`}>{e.label}</Link></th><td>{e.client} · {e.site}</td><td><strong>{e.count}</strong></td><td>{e.trapped || '—'}</td><td>{e.minutesToFix === null ? '—' : fmtMinutes(e.minutesToFix)}</td></tr>
              ))}</tbody>
            </table></div>
          </>
        )}
      </section>

      {p.sla.breaches.length > 0 && (
        <section className="card stack">
          <h2>Délais garantis dépassés</h2>
          {p.sla.breaches.map((b) => <p key={b.jobId} className="small"><Badge tone="bad">SLA</Badge> <strong>{b.elevator}</strong> : arrivée en {fmtMinutes(b.response)} pour {fmtMinutes(b.limit)} garantis</p>)}
        </section>
      )}

      <section className="card stack">
        <h2>Facturation et contrats</h2>
        <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          <div className="kpi"><span className="muted small">Contrats actifs (par mois)</span><b>{fcfa(p.revenue.monthly)}</b></div>
          <div className="kpi"><span className="muted small">Facturé (TTC)</span><b>{fcfa(p.revenue.invoiced)}</b></div>
          <div className="kpi"><span className="muted small">Encaissé (TTC)</span><b style={{ color: 'var(--ok)' }}>{fcfa(p.revenue.collected)}</b></div>
          <div className="kpi"><span className="muted small">Impayé (TTC)</span><b style={p.revenue.unpaidOverdue ? { color: 'var(--bad)' } : undefined}>{fcfa(p.revenue.unpaid)}</b><span className="small muted">dont {fcfa(p.revenue.unpaidOverdue)} en retard</span></div>
        </div>
        {p.revenue.perContract.length > 0 && (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Détail par contrat"><table>
            <thead><tr><th scope="col">Client</th><th scope="col">Appareils</th><th scope="col">Mensualité</th><th scope="col">Facturé</th><th scope="col">Encaissé</th></tr></thead>
            <tbody>{p.revenue.perContract.map((c) => <tr key={c.contractId}><th scope="row">{c.client}</th><td>{c.elevators}</td><td>{fcfa(c.monthly)}</td><td>{c.invoiced ? fcfa(c.invoiced) : '—'}</td><td>{c.collected ? fcfa(c.collected) : '—'}</td></tr>)}</tbody>
          </table></div>
        )}
      </section>

      <section className="card stack no-print">
        <h2>À surveiller</h2>
        <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <Link to="/office/compliance" className="card kpi link"><span className="muted small">Échéances réglementaires</span><b style={{ color: p.compliance.late ? 'var(--bad)' : undefined }}>{p.compliance.late} dépassée(s)</b><span className="small muted">{p.compliance.soon} sous 30 jours</span></Link>
          <Link to="/office/stock" className="card kpi link"><span className="muted small">Stock de pièces</span><b style={{ color: p.stock.toReorder ? 'var(--warn)' : undefined }}>{p.stock.toReorder} à réapprovisionner</b><span className="small muted">{p.stock.references} références · {fcfa(p.stock.value)}</span></Link>
        </div>
      </section>
    </div>
  )
}
