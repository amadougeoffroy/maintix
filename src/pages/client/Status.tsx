import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../api'
import { Logo } from '../../brand/Logo'
import { byId, runtime, useData } from '../../store'
import { Badge, QR, publicUrl } from '../../components/ui'
import { fmtDateLong, fmtTime } from '../../util'
import { BackLink } from '../../components/BackLink'
import { Icon } from '../../components/Icon'

export default function Status() {
  const { id } = useParams()
  const s = useData()
  const [remote, setRemote] = useState<Awaited<ReturnType<typeof api.status>> | null | undefined>(undefined)
  useEffect(() => {
    if (!runtime.server || !id) return
    const load = () => api.status(id).then(setRemote).catch(() => setRemote(null))
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [id])
  const localEl = byId(s.elevators, id)
  const localJob = localEl ? s.jobs.filter((j) => j.elevatorId === localEl.id && j.type === 'depannage').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] : undefined
  const el = runtime.server ? (remote ? { id: id!, label: remote.label, lastVisit: remote.lastVisit ?? undefined } : undefined) : localEl
  if (!el) return <div className="hero"><p>{runtime.server && remote === undefined ? 'Chargement…' : 'Appareil inconnu.'}</p></div>
  const site = { name: runtime.server ? remote!.siteName : byId(s.sites, localEl!.siteId)!.name }
  const job = runtime.server ? (remote!.job ? { status: remote!.job.status, timeline: remote!.job.timeline } : undefined) : localJob
  const active = job && job.status !== 'terminee'
  return (
    <div className="hero">
      <div className="box">
        <BackLink />
        <div className="center stack"><Logo height={40} className="center-logo" /><h1>{el.label}</h1><p className="muted">{site.name}</p></div>
        <div className="card center stack">
          {active ? <Badge tone="bad"><Icon n="wrench" size={14} /> Panne signalée – intervention en cours</Badge> : <Badge tone="ok"><Icon n="check" size={14} /> En service</Badge>}
          {!active && el.lastVisit && <p className="small muted">Dernière visite d’entretien : {fmtDateLong(el.lastVisit)}</p>}
        </div>
        {job && (
          <section className="card stack">
            <h2>{active ? 'Suivi de l’intervention' : 'Dernière panne'}</h2>
            <ul className="timeline">
              {job.timeline.map((t, i) => <li key={i}><strong>{fmtTime(t.at)}</strong> · {t.label}</li>)}
              {job.timeline.length === 0 && <li>Signalement enregistré</li>}
            </ul>
          </section>
        )}
        <Link className="btn block" to={`/signal/${el.id}`}>Signaler une panne</Link>
        <div className="center"><QR value={publicUrl(`/status/${el.id}`)} size={100} /></div>
      </div>
    </div>
  )
}
