import { Link } from 'react-router-dom'
import { byId, certStatus, useData } from '../../store'
import { Badge, JOB_LABEL, StatusBadge } from '../../components/ui'
import { fmtDate, today } from '../../util'
import { Icon } from '../../components/Icon'

export default function Day() {
  const s = useData()
  const me = byId(s.techs, s.session.techId)
  const t = today()
  const mine = s.jobs.filter((j) => j.techId === s.session.techId)
  const todays = mine
    .filter((j) => j.date <= t && j.status !== 'terminee')
    .sort((a, b) => Number(!!b.trapped) - Number(!!a.trapped) || (a.type === 'depannage' ? -1 : 1) - (b.type === 'depannage' ? -1 : 1))
  const upcoming = mine.filter((j) => j.date > t && j.status !== 'terminee').sort((a, b) => a.date.localeCompare(b.date))
  const done = mine.filter((j) => j.status === 'terminee' && j.visit?.finishedAt?.slice(0, 10) === t)
  const cert = me ? certStatus(me) : null
  const total = todays.length + done.length

  const JobCard = ({ id }: { id: string }) => {
    const j = byId(s.jobs, id)!
    const el = byId(s.elevators, j.elevatorId)!
    const site = byId(s.sites, el.siteId)!
    const urgent = j.type === 'depannage'
    return (
      <Link to={`/tech/job/${j.id}`} className={`card link ${j.trapped ? 'alert' : ''}`}>
        <div className="row between">
          <strong>{el.label}</strong>
          <StatusBadge s={j.status} />
        </div>
        <p className="muted">{site.name} · {site.address}</p>
        <div className="row wrap" style={{ marginTop: 8 }}>
          <Badge tone={urgent ? 'bad' : 'brand'}>{JOB_LABEL[j.type]}</Badge>
          {j.trapped && <Badge tone="bad"><Icon n="siren" size={14} /> Personne bloquée</Badge>}
          <span className="muted small">{fmtDate(j.date)}</span>
        </div>
        {j.description && <p className="small" style={{ marginTop: 6 }}>{j.description}</p>}
      </Link>
    )
  }

  return (
    <div className="stack-lg">
      <div>
        <h1>Ma journée</h1>
        <p className="muted">{done.length}/{total} terminée(s) aujourd’hui</p>
        <div className="progress" style={{ marginTop: 8 }} role="progressbar" aria-label="Missions terminées aujourd’hui" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done.length}><div style={{ width: `${total ? (done.length / total) * 100 : 0}%` }} /></div>
      </div>
      {cert && !cert.ok && (
        <div className="card alert">
          <strong>Habilitation expirée</strong>
          <p className="small">{cert.expired.map((c) => c.label).join(', ')}. Contactez le bureau : certaines missions ne peuvent pas vous être affectées.</p>
        </div>
      )}
      {cert && cert.ok && cert.soon.length > 0 && (
        <div className="card"><Badge tone="warn">À renouveler</Badge> <span className="small">{cert.soon.map((c) => `${c.label} (${fmtDate(c.expires)})`).join(', ')}</span></div>
      )}
      <section className="stack">
        <h2>À faire</h2>
        {todays.length === 0 && <p className="muted">Rien de prévu aujourd’hui.</p>}
        {todays.map((j) => <JobCard key={j.id} id={j.id} />)}
      </section>
      {upcoming.length > 0 && (
        <section className="stack">
          <h2>À venir</h2>
          {upcoming.map((j) => <JobCard key={j.id} id={j.id} />)}
        </section>
      )}
      {done.length > 0 && (
        <section className="stack">
          <h2>Terminées</h2>
          {done.map((j) => {
            const el = byId(s.elevators, j.elevatorId)!
            return <Link key={j.id} to={`/report/${j.id}`} className="card link row between"><span className="row"><Icon n="done" /> {el.label}</span><span className="small muted">Voir le rapport</span></Link>
          })}
        </section>
      )}
    </div>
  )
}
