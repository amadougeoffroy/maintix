import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { actions, byId, useData } from '../../store'
import { Badge, SeverityBadge } from '../../components/ui'
import { feedback } from '../../feedback'
import { fmtDate, today } from '../../util'
import { Icon } from '../../components/Icon'

const ORIGIN = { visite: 'Visite', controle: 'Contrôle technique', signalement: 'Signalement' } as const

export default function Defects() {
  const s = useData()
  const nav = useNavigate()
  const [filter, setFilter] = useState<'ouverts' | 'retard' | 'leves'>('ouverts')
  const list = s.defects
    .filter((d) => (filter === 'leves' ? d.status === 'leve' : filter === 'retard' ? d.status !== 'leve' && d.due < today() : d.status !== 'leve'))
    .sort((a, b) => a.due.localeCompare(b.due))

  return (
    <div className="stack-lg">
      <h1>Défauts & mises en conformité</h1>
      <div className="seg">
        <button className={filter === 'ouverts' ? 'ok on' : ''} onClick={() => setFilter('ouverts')}>Ouverts</button>
        <button className={filter === 'retard' ? 'ko on' : ''} onClick={() => setFilter('retard')}>En retard</button>
        <button className={filter === 'leves' ? 'ok on' : ''} onClick={() => setFilter('leves')}>Levés</button>
      </div>
      <div className="stack">
        {list.length === 0 && <p className="muted">Aucun défaut dans cette vue.</p>}
        {list.map((d) => {
          const e = byId(s.elevators, d.elevatorId)!
          const late = d.status !== 'leve' && d.due < today()
          return (
            <div key={d.id} className="card stack">
              <div className="row between wrap"><span className="row"><SeverityBadge s={d.severity} /><Badge>{ORIGIN[d.origin]}</Badge>{d.status === 'devis' && <Badge tone="brand">Devis en cours</Badge>}</span><span className="small" style={{ color: late ? 'var(--bad)' : 'var(--muted)', fontWeight: late ? 700 : 400 }}>{late ? 'En retard · ' : 'Avant le '}{fmtDate(d.due)}</span></div>
              <p>{d.title}</p>
              <p className="small muted">{e.label} · {byId(s.sites, e.siteId)?.name}</p>
              {d.status !== 'leve' && (
                <div className="row wrap">
                  {d.status === 'ouvert' && <button className="btn sm" onClick={() => {
                    const site = byId(s.sites, e.siteId)!
                    const q = actions.createQuote({ clientId: site.clientId, elevatorId: e.id, defectId: d.id, lines: [{ label: d.title, qty: 1, unit: 0 }, { label: 'Main-d’œuvre', qty: 2, unit: 25000 }] })
                    feedback.toast('Devis créé à partir du défaut : complétez les montants.'); nav(`/office/quotes?open=${q.id}`)
                  }}><Icon n="euro" /> Créer un devis</button>}
                  <button className="btn sm" onClick={() => { actions.setDefectStatus(d.id, 'leve'); feedback.toast('Défaut marqué comme levé.') }}><Icon n="check" /> Marquer comme levé</button>
                </div>
              )}
              {d.status === 'leve' && <Badge tone="ok">Levé</Badge>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
