import { useState } from 'react'
import { actions, byId, certStatus, currentOnCall, useData } from '../../store'
import { Badge, JOB_LABEL, StatusBadge } from '../../components/ui'
import { addDays, fmtDate, today, weekStart } from '../../util'
import type { JobType } from '../../types'
import { Icon } from '../../components/Icon'

export default function Planning() {
  const s = useData()
  const [ws, setWs] = useState(weekStart(today()))
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i))
  const [el, setEl] = useState(s.elevators[0]?.id ?? '')
  const [type, setType] = useState<JobType>('entretien')
  const [date, setDate] = useState(today())
  const [tech, setTech] = useState('')
  const techs = s.techs.filter((t) => t.role === 'tech')
  const suggested = currentOnCall(s)
  const unassigned = s.jobs.filter((j) => !j.techId && j.status !== 'terminee')

  const TechSelect = ({ jobId, value, jobDate }: { jobId: string; value: string | null; jobDate: string }) => (
    <select aria-label="Technicien" value={value ?? ''} onChange={(e) => {
      const t = byId(s.techs, e.target.value)
      if (t && !certStatus(t, jobDate).ok) { alert(`${t.name} a une habilitation expirée (${certStatus(t, jobDate).expired.map((c) => c.label).join(', ')}) : affectation impossible.`); return }
      actions.assign(jobId, e.target.value || null)
    }}>
      <option value="">— Non affecté —</option>
      {techs.map((t) => <option key={t.id} value={t.id}>{t.name}{certStatus(t, jobDate).ok ? '' : ' (habilitation expirée)'}</option>)}
    </select>
  )

  return (
    <div className="stack-lg">
      <div className="row between wrap">
        <h1>Planning</h1>
        <div className="row">
          <button className="btn sm" onClick={() => setWs(addDays(ws, -7))}>←</button>
          <strong>Semaine du {fmtDate(ws)}</strong>
          <button className="btn sm" onClick={() => setWs(addDays(ws, 7))}>→</button>
        </div>
      </div>

      {unassigned.length > 0 && (
        <section className="card alert stack">
          <h2>Missions à affecter ({unassigned.length})</h2>
          {unassigned.map((j) => (
            <div key={j.id} className="row wrap">
              <span className="grow">{JOB_LABEL[j.type]} · {byId(s.elevators, j.elevatorId)?.label} · {fmtDate(j.date)}</span>
              {suggested && <button className="btn sm" onClick={() => actions.assign(j.id, suggested.id)}>Affecter à {suggested.name}</button>}
              <TechSelect jobId={j.id} value={j.techId} jobDate={j.date} />
            </div>
          ))}
        </section>
      )}

      <div className="stack">
        {days.map((d) => {
          const jobs = s.jobs.filter((j) => j.date === d)
          return (
            <section key={d} className="card stack" style={d === today() ? { borderColor: 'var(--brand)' } : undefined}>
              <div className="row between"><strong>{fmtDate(d)}</strong>{d === today() && <Badge tone="brand">Aujourd’hui</Badge>}</div>
              {jobs.length === 0 && <p className="muted small">Rien de planifié.</p>}
              {jobs.map((j) => {
                const e = byId(s.elevators, j.elevatorId)!
                return (
                  <div key={j.id} className="row wrap" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                    <div className="grow"><strong>{e.label}</strong> <span className="muted small">{byId(s.sites, e.siteId)?.name}</span><br /><Badge tone={j.type === 'depannage' ? 'bad' : 'brand'}>{JOB_LABEL[j.type]}</Badge> <StatusBadge s={j.status} /></div>
                    {j.status !== 'terminee' ? (
                      <div className="row wrap">
                        <input type="date" aria-label="Reporter à" value={j.date} style={{ width: 160 }} onChange={(e) => e.target.value && actions.assign(j.id, j.techId, e.target.value)} />
                        <TechSelect jobId={j.id} value={j.techId} jobDate={j.date} />
                        {j.status === 'planifiee' && <button className="btn sm" aria-label="Annuler la mission" onClick={() => confirm('Annuler cette mission ?') && actions.cancelJob(j.id)}><Icon n="trash" /></button>}
                      </div>
                    ) : <span className="small muted">{byId(s.techs, j.techId)?.name}</span>}
                  </div>
                )
              })}
            </section>
          )
        })}
      </div>

      <form className="card stack" onSubmit={(e) => { e.preventDefault(); actions.createJob({ type, elevatorId: el, techId: tech || null, date }) }}>
        <h2>Planifier une mission</h2>
        <div className="grid2">
          <label className="field">Appareil<select value={el} onChange={(e) => setEl(e.target.value)}>{s.elevators.map((x) => <option key={x.id} value={x.id}>{x.label} – {byId(s.sites, x.siteId)?.name}</option>)}</select></label>
          <label className="field">Type<select value={type} onChange={(e) => setType(e.target.value as JobType)}>{(['entretien', 'travaux', 'controle', 'depannage'] as JobType[]).map((t) => <option key={t} value={t}>{JOB_LABEL[t]}</option>)}</select></label>
          <label className="field">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="field">Technicien<select value={tech} onChange={(e) => setTech(e.target.value)}><option value="">— Non affecté —</option>{techs.map((t) => <option key={t.id} value={t.id} disabled={!certStatus(t, date).ok}>{t.name}{certStatus(t, date).ok ? '' : ' (habilitation expirée)'}</option>)}</select></label>
        </div>
        <button className="btn primary">Planifier</button>
      </form>
    </div>
  )
}
