import { Link } from 'react-router-dom'
import { byId, certStatus, currentOnCall, healthScore, useData } from '../../store'
import { Badge, Health, JOB_LABEL, SeverityBadge, StatusBadge } from '../../components/ui'
import { contractAlerts } from '../../contracts'
import { GettingStarted } from '../../components/GettingStarted'
import { fmtDate, fmtTime, today } from '../../util'
import { Icon } from '../../components/Icon'

export default function Dashboard() {
  const s = useData()
  const t = today()
  const urgent = s.jobs.filter((j) => j.type === 'depannage' && j.status !== 'terminee')
  const late = s.jobs.filter((j) => j.type === 'entretien' && j.status !== 'terminee' && j.date < t)
  const unassigned = s.jobs.filter((j) => !j.techId && j.status !== 'terminee')
  const overdue = s.defects.filter((d) => d.status !== 'leve' && d.due < t)
  const open = s.defects.filter((d) => d.status !== 'leve')
  const todays = s.jobs.filter((j) => j.date === t)
  const doneToday = todays.filter((j) => j.status === 'terminee').length
  const onCall = currentOnCall(s)
  const cAlerts = contractAlerts(s.contracts, t)
  const certAlerts = s.techs.filter((x) => x.role === 'tech' && (!certStatus(x).ok || certStatus(x).soon.length))
  const worst = [...s.elevators].map((e) => ({ e, sc: healthScore(s, e.id) })).sort((a, b) => a.sc - b.sc).slice(0, 4)
  const sentToday = s.jobs.filter((j) => j.visit?.sentAt?.slice(0, 10) === t).length

  return (
    <div className="stack-lg">
      <div className="row between wrap">
        <div><h1>Tableau de bord</h1>{s.session.orgName && <p className="org-line">{s.session.orgName}</p>}</div>
        <span className="muted">Astreinte : <strong>{onCall?.name ?? '—'}</strong></span>
      </div>
      <GettingStarted />
      <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <div className="card kpi"><span className="muted small">Pannes en cours</span><b style={{ color: urgent.length ? 'var(--bad)' : undefined }}>{urgent.length}</b></div>
        <div className="card kpi"><span className="muted small">Visites en retard</span><b style={{ color: late.length ? 'var(--warn)' : undefined }}>{late.length}</b></div>
        <div className="card kpi"><span className="muted small">Défauts hors délai</span><b style={{ color: overdue.length ? 'var(--bad)' : undefined }}>{overdue.length}/{open.length}</b></div>
        <div className="card kpi"><span className="muted small">Aujourd’hui</span><b>{doneToday}/{todays.length}</b></div>
        <div className="card kpi"><span className="muted small">Rapports envoyés</span><b>{sentToday}</b></div>
      </div>

      {urgent.length > 0 && (
        <section className="stack">
          <h2 className="ico-line"><Icon n="siren" size={22} /> Pannes en cours</h2>
          {urgent.map((j) => {
            const e = byId(s.elevators, j.elevatorId)!
            return (
              <div key={j.id} className={`card ${j.trapped ? 'alert' : ''}`}>
                <div className="row between wrap"><strong>{e.label} · {byId(s.sites, e.siteId)?.name}</strong><StatusBadge s={j.status} /></div>
                <p className="small">{j.description}</p>
                <ul className="timeline small" style={{ marginTop: 10 }}>{j.timeline.map((x, i) => <li key={i}>{fmtTime(x.at)} · {x.label}</li>)}</ul>
                {!j.techId && <p style={{ color: 'var(--bad)', fontWeight: 700 }}>Non affectée – <Link to="/office/planning">affecter</Link></p>}
              </div>
            )
          })}
        </section>
      )}

      <div className="grid2">
        <section className="stack">
          <h2>À traiter</h2>
          {unassigned.length > 0 && <Link to="/office/planning" className="card link row"><Icon n="pin" /> {unassigned.length} mission(s) sans technicien</Link>}
          {late.map((j) => <Link key={j.id} to="/office/planning" className="card link">⏰ {JOB_LABEL[j.type]} en retard : {byId(s.elevators, j.elevatorId)?.label} ({fmtDate(j.date)})</Link>)}
          {overdue.map((d) => (
            <Link key={d.id} to="/office/defects" className="card link"><SeverityBadge s={d.severity} /> {d.title}<p className="small muted">Échéance dépassée le {fmtDate(d.due)}</p></Link>
          ))}
          {cAlerts.map((a) => (
            <Link key={a.contract.id + a.kind} to="/office/contracts" className="card link"><Badge tone={a.kind === 'echu' ? 'bad' : 'warn'}>Contrat</Badge> <strong>{byId(s.clients, a.contract.clientId)?.name}</strong><p className="small muted">{a.label} · {fmtDate(a.date)}</p></Link>
          ))}
          {certAlerts.map((x) => (
            <div key={x.id} className="card">
              <strong>{x.name}</strong>
              <p className="small">{[...certStatus(x).expired.map((c) => `${c.label} expirée`), ...certStatus(x).soon.map((c) => `${c.label} expire le ${fmtDate(c.expires)}`)].join(' · ')}</p>
              {!certStatus(x).ok && <Badge tone="bad">Ne peut pas être affecté</Badge>}
            </div>
          ))}
          {!unassigned.length && !late.length && !overdue.length && !certAlerts.length && !cAlerts.length && <p className="muted">Tout est à jour.</p>}
        </section>
        <section className="stack">
          <h2>Santé du parc</h2>
          {worst.map(({ e, sc }) => (
            <Link key={e.id} to={`/office/elevator/${e.id}`} className="card link row between">
              <span><strong>{e.label}</strong><br /><span className="small muted">{byId(s.sites, e.siteId)?.name}</span></span>
              <Health score={sc} />
            </Link>
          ))}
        </section>
      </div>
    </div>
  )
}
