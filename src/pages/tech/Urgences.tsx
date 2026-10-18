import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { actions, byId, currentOnCall, useData } from '../../store'
import { Badge, StatusBadge } from '../../components/ui'
import { feedback } from '../../feedback'
import { fmtTime, today } from '../../util'
import { Icon } from '../../components/Icon'

export default function Urgences() {
  const s = useData()
  const nav = useNavigate()
  const onCall = currentOnCall(s)
  const open = s.jobs.filter((j) => j.type === 'depannage' && j.status !== 'terminee')
  const [el, setEl] = useState(s.elevators[0]?.id ?? '')
  const [desc, setDesc] = useState('')
  const [trapped, setTrapped] = useState(false)

  return (
    <div className="stack-lg">
      <div>
        <h1>Urgences</h1>
        <p className="muted">Astreinte cette semaine : <strong>{onCall?.name ?? 'non définie'}</strong></p>
      </div>
      <section className="stack">
        {open.length === 0 && <p className="muted">Aucune panne ouverte.</p>}
        {open.map((j) => {
          const e = byId(s.elevators, j.elevatorId)!
          const tech = byId(s.techs, j.techId)
          return (
            <Link key={j.id} to={`/tech/job/${j.id}`} className={`card link ${j.trapped ? 'alert' : ''}`}>
              <div className="row between"><strong>{e.label}</strong><StatusBadge s={j.status} /></div>
              <p className="small">{j.description}</p>
              <div className="row wrap small muted">
                {j.trapped && <Badge tone="bad"><Icon n="siren" size={14} /> Personne bloquée</Badge>}
                <span>Reçu à {fmtTime(j.createdAt)}</span>
                <span>· {tech?.name ?? 'Non affecté'}</span>
              </div>
            </Link>
          )
        })}
      </section>
      <form
        className="card stack"
        onSubmit={(ev) => {
          ev.preventDefault()
          const j = actions.createJob({ type: 'depannage', elevatorId: el, techId: s.session.techId, date: today(), description: desc || 'Panne déclarée par le technicien', trapped, reporter: 'Technicien' })
          actions.setStatus(j.id, 'sur_place')
          feedback.toast('Dépannage pris en charge : vous êtes sur place.')
          nav(`/tech/job/${j.id}`)
        }}
      >
        <h2>Déclarer un dépannage</h2>
        <label className="field">Appareil
          <select value={el} onChange={(e) => setEl(e.target.value)}>
            {s.elevators.map((e) => <option key={e.id} value={e.id}>{e.label} – {byId(s.sites, e.siteId)?.name}</option>)}
          </select>
        </label>
        <label className="field">Motif
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ex. arrêt intempestif entre le 3e et le 4e" />
        </label>
        <label className="row"><input type="checkbox" style={{ width: 24, minHeight: 24 }} checked={trapped} onChange={(e) => setTrapped(e.target.checked)} /> Personne bloquée en cabine</label>
        <button className="btn primary block">Je prends en charge</button>
      </form>
    </div>
  )
}
