import { useSearchParams } from 'react-router-dom'
import { actions, byId, useData } from '../../store'
import { Badge } from '../../components/ui'
import { fcfa, fmtDateLong } from '../../util'
import type { Quote } from '../../types'
import { Icon } from '../../components/Icon'

export const quoteTotal = (q: Quote) => q.lines.reduce((t, l) => t + l.qty * l.unit, 0)
const TVA = 0.2

export default function Quotes() {
  const s = useData()
  const [sp] = useSearchParams()
  const openId = sp.get('open')
  const list = [...s.quotes].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return (
    <div className="stack-lg">
      <h1>Devis</h1>
      {list.length === 0 && <p className="muted">Aucun devis. Créez-en un depuis un défaut.</p>}
      {list.map((q) => {
        const e = byId(s.elevators, q.elevatorId)!
        const c = byId(s.clients, q.clientId)!
        const ht = quoteTotal(q)
        const editable = q.status === 'brouillon'
        const setLine = (i: number, patch: Partial<Quote['lines'][number]>) => actions.updateQuote(q.id, { lines: q.lines.map((l, n) => (n === i ? { ...l, ...patch } : l)) })
        return (
          <details key={q.id} className="card" open={q.id === openId}>
            <summary className="row between wrap" style={{ cursor: 'pointer' }}>
              <strong>{c.name} · {e.label}</strong>
              <span className="row"><Badge tone={q.status === 'accepte' ? 'ok' : q.status === 'envoye' ? 'brand' : undefined}>{q.status === 'accepte' ? 'Accepté' : q.status === 'envoye' ? 'Envoyé' : 'Brouillon'}</Badge><strong>{fcfa(ht * (1 + TVA))} TTC</strong></span>
            </summary>
            <div className="stack" style={{ marginTop: 12 }}>
              <p className="small muted">Créé le {fmtDateLong(q.createdAt)}</p>
              <div className="tablewrap"><table>
                <thead><tr><th>Désignation</th><th>Qté</th><th>PU HT</th><th>Total</th></tr></thead>
                <tbody>
                  {q.lines.map((l, i) => (
                    <tr key={i}>
                      <td>{editable ? <input value={l.label} onChange={(ev) => setLine(i, { label: ev.target.value })} /> : l.label}</td>
                      <td style={{ width: 80 }}>{editable ? <input inputMode="decimal" value={l.qty} onChange={(ev) => setLine(i, { qty: +ev.target.value || 0 })} /> : l.qty}</td>
                      <td style={{ width: 110 }}>{editable ? <input inputMode="decimal" value={l.unit} onChange={(ev) => setLine(i, { unit: +ev.target.value || 0 })} /> : fcfa(l.unit)}</td>
                      <td>{fcfa(l.qty * l.unit)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={3}>Total HT / TVA 20 %</td><td>{fcfa(ht)} / {fcfa(ht * TVA)}</td></tr></tfoot>
              </table></div>
              <div className="row wrap">
                {editable && <button className="btn sm" onClick={() => actions.updateQuote(q.id, { lines: [...q.lines, { label: 'Nouvelle ligne', qty: 1, unit: 0 }] })}>+ Ligne</button>}
                {editable && <button className="btn primary sm" onClick={() => actions.updateQuote(q.id, { status: 'envoye' })}><Icon n="mail" /> Envoyer au client</button>}
                {q.status === 'envoye' && <button className="btn sm" onClick={() => actions.updateQuote(q.id, { status: 'accepte' })}>Marquer comme accepté</button>}
              </div>
            </div>
          </details>
        )
      })}
    </div>
  )
}
