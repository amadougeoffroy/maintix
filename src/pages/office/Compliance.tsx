import { useState } from 'react'
import { Link } from 'react-router-dom'
import { actions, useData } from '../../store'
import { Badge } from '../../components/ui'
import { feedback } from '../../feedback'
import { complianceRows, KIND_LABEL, SOON_DAYS } from '../../compliance'
import { fmtDate, today } from '../../util'

type Filter = 'urgent' | '90' | 'tout'
const TONE = { depassee: 'bad', bientot: 'warn', ok: 'ok' } as const
const WORD = (d: number) => (d < 0 ? `dépassée de ${-d} j` : d === 0 ? 'aujourd’hui' : `dans ${d} j`)

/** Échéances réglementaires de tout le parc : ce qui est dépassé ou arrive, avec validation directe. */
export default function Compliance() {
  const s = useData()
  const t = today()
  const [filter, setFilter] = useState<Filter>('urgent')
  const all = complianceRows(s, t)
  const late = all.filter((r) => r.status === 'depassee')
  const soon = all.filter((r) => r.status === 'bientot')
  const rows = filter === 'urgent' ? all.filter((r) => r.days <= SOON_DAYS) : filter === '90' ? all.filter((r) => r.days <= 90) : all
  return (
    <div className="stack-lg">
      <div><h1>Échéances réglementaires</h1><p className="muted">Contrôles techniques, assurances, extincteurs… de tous vos appareils. Vous êtes prévenu par e-mail 30 jours et 7 jours avant, puis quand l’échéance est dépassée.</p></div>
      <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <div className="card kpi"><span className="muted small">Dépassées</span><b style={late.length ? { color: 'var(--bad)' } : undefined}>{late.length}</b></div>
        <div className="card kpi"><span className="muted small">Sous {SOON_DAYS} jours</span><b style={soon.length ? { color: 'var(--warn)' } : undefined}>{soon.length}</b></div>
        <div className="card kpi"><span className="muted small">Suivies au total</span><b>{all.length}</b></div>
      </div>
      <div className="seg" role="radiogroup" aria-label="Filtrer les échéances">
        {([['urgent', `Urgentes (${late.length + soon.length})`], ['90', 'Sous 90 jours'], ['tout', `Toutes (${all.length})`]] as const).map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={filter === k} className={filter === k ? 'ok on' : ''} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>
      {all.length === 0 && <p className="muted">Aucune échéance suivie. Ouvrez la fiche d’un appareil (Parc) pour ajouter son contrôle technique ou son assurance.</p>}
      {all.length > 0 && rows.length === 0 && <p className="muted">Rien d’urgent : aucune échéance dans cette période.</p>}
      <div className="stack">
        {rows.map((r) => (
          <article key={`${r.elevatorId}:${r.item.id}`} className={`card row between wrap ${r.status === 'depassee' ? 'alert' : ''}`}>
            <div>
              <strong>{r.item.label}</strong> <span className="small muted">· {KIND_LABEL[r.item.kind]}</span>
              <p className="small muted"><Link to={`/office/elevator/${r.elevatorId}`}>{r.elevator}</Link> · {r.site}{r.client ? ` · ${r.client}` : ''} · échéance {fmtDate(r.item.due)}</p>
            </div>
            <div className="row wrap">
              <Badge tone={TONE[r.status]}>{WORD(r.days)}</Badge>
              <button className="btn sm primary" onClick={() => { actions.completeCompliance(r.elevatorId, r.item.id); feedback.toast(r.item.intervalMonths ? `« ${r.item.label} » validée : prochaine échéance programmée.` : `« ${r.item.label} » validée et soldée.`) }}>Valider (fait)</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
