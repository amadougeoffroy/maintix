import { actions, byId, certStatus, useData } from '../../store'
import { Badge } from '../../components/ui'
import { addDays, fmtDate, today, weekStart } from '../../util'

export default function OnCall() {
  const s = useData()
  const start = weekStart(today())
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(start, i * 7))
  const techs = s.techs.filter((t) => t.role === 'tech')
  return (
    <div className="stack-lg">
      <div><h1>Astreinte</h1><p className="muted">Les signalements urgents sont affectés automatiquement au technicien d’astreinte.</p></div>
      {weeks.map((w) => {
        const slot = s.onCall.find((o) => o.weekStart === w)
        const t = byId(s.techs, slot?.techId)
        return (
          <div key={w} className="card row between wrap">
            <div><strong>Semaine du {fmtDate(w)}</strong>{w === start && <> <Badge tone="brand">En cours</Badge></>}{!slot && <> <Badge tone="bad">Sans astreinte</Badge></>}{t && !certStatus(t, w).ok && <> <Badge tone="warn">Habilitation expirée</Badge></>}</div>
            <select aria-label={`Astreinte semaine du ${w}`} value={slot?.techId ?? ''} onChange={(e) => e.target.value && actions.setOnCall(w, e.target.value)} style={{ maxWidth: 260 }}>
              <option value="">— Choisir —</option>
              {techs.map((x) => <option key={x.id} value={x.id}>{x.name}{certStatus(x, w).ok ? '' : ' (habilitation expirée)'}</option>)}
            </select>
          </div>
        )
      })}
    </div>
  )
}
