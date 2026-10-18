import { Link } from 'react-router-dom'
import { actions, byId, contractFor, healthScore, useData } from '../../store'
import { Badge, Health, JOB_LABEL, SeverityBadge } from '../../components/ui'
import { quoteTotal } from '../office/Quotes'
import { STATUS_LABEL as INV_LABEL, totals } from '../../invoicing'
import { runtime } from '../../store'
import { fcfa, fmtDate, fmtDateLong, today } from '../../util'
import { Icon } from '../../components/Icon'

export default function Portal() {
  const s = useData()
  const cid = s.session.clientId
  const sites = s.sites.filter((x) => x.clientId === cid)
  const els = s.elevators.filter((e) => sites.some((x) => x.id === e.siteId))
  const ids = els.map((e) => e.id)
  const defects = s.defects.filter((d) => ids.includes(d.elevatorId) && d.status !== 'leve')
  const reports = s.jobs.filter((j) => ids.includes(j.elevatorId) && j.status === 'terminee').sort((a, b) => (b.visit?.finishedAt ?? '').localeCompare(a.visit?.finishedAt ?? ''))
  const quotes = s.quotes.filter((q) => q.clientId === cid && q.status !== 'brouillon')
  const invoices = s.invoices.filter((i) => i.clientId === cid && i.status !== 'brouillon').sort((a, b) => (b.number ?? '').localeCompare(a.number ?? ''))
  const next = s.jobs.filter((j) => ids.includes(j.elevatorId) && j.status !== 'terminee' && j.type === 'entretien').sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div className="stack-lg">
      <section className="stack">
        <h2>Mes ascenseurs</h2>
        {els.map((e) => {
          const down = s.jobs.find((j) => j.elevatorId === e.id && j.type === 'depannage' && j.status !== 'terminee')
          return (
            <div key={e.id} className="card stack">
              <div className="row between"><strong>{e.label}</strong><Health score={healthScore(s, e.id)} /></div>
              <p className="small muted">{byId(s.sites, e.siteId)?.name}</p>
              {down ? <Link to={`/status/${e.id}`} className="badge bad"><Icon n="wrench" size={14} /> En panne – suivre la réparation</Link> : <Badge tone="ok">En service</Badge>}
              <div className="row wrap"><Link className="btn sm" to={`/signal/${e.id}`}>Signaler une panne</Link><span className="small muted">Contrat : {contractFor(s, e.id) ? `tous les ${contractFor(s, e.id)!.periodicityMonths} mois` : 'aucun'}</span></div>
            </div>
          )
        })}
      </section>

      {quotes.length > 0 && (
        <section className="stack">
          <h2>Devis à valider</h2>
          {quotes.map((q) => (
            <div key={q.id} className="card stack">
              <div className="row between"><strong>{byId(s.elevators, q.elevatorId)?.label}</strong><strong>{fcfa(quoteTotal(q) * 1.2)} TTC</strong></div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>{q.lines.map((l, i) => <li key={i}>{l.qty} × {l.label}</li>)}</ul>
              {q.status === 'envoye' ? <button className="btn primary" onClick={() => actions.updateQuote(q.id, { status: 'accepte' })}><Icon n="check" /> Accepter ce devis</button> : <Badge tone="ok">Accepté</Badge>}
            </div>
          ))}
        </section>
      )}

      {invoices.length > 0 && (
        <section className="stack">
          <h2>Factures</h2>
          {invoices.map((i) => (
            <div key={i.id} className="card row between wrap">
              <span><strong>{i.number}</strong> <span className="muted small">émise le {fmtDate(i.issuedAt!)} · échéance {fmtDate(i.dueAt!)}</span></span>
              <span className="row"><strong>{fcfa(totals(i).ttc)}</strong><Badge tone={i.status === 'payee' ? 'ok' : i.status === 'annulee' ? 'bad' : i.dueAt! < today() ? 'bad' : 'warn'}>{i.status === 'emise' && i.dueAt! < today() ? 'En retard' : INV_LABEL[i.status]}</Badge>{runtime.server && <a className="btn sm" href={`/api/invoices/${i.id}/pdf`} target="_blank" rel="noreferrer">PDF</a>}</span>
            </div>
          ))}
        </section>
      )}

      <section className="stack">
        <h2>Points à traiter ({defects.length})</h2>
        {defects.length === 0 && <p className="muted">Aucun défaut ouvert.</p>}
        {defects.map((d) => (
          <div key={d.id} className="card"><div className="row between"><SeverityBadge s={d.severity} /><span className="small" style={{ color: d.due < today() ? 'var(--bad)' : 'var(--muted)' }}>{d.due < today() ? 'Échéance dépassée' : `Avant le ${fmtDate(d.due)}`}</span></div><p style={{ marginTop: 6 }}>{d.title}</p></div>
        ))}
      </section>

      <section className="stack">
        <h2>Prochaines visites</h2>
        {next.map((j) => <div key={j.id} className="card row between"><span>{byId(s.elevators, j.elevatorId)?.label}</span><span className="muted">{fmtDateLong(j.date)}</span></div>)}
      </section>

      <section className="stack">
        <h2>Rapports</h2>
        {reports.length === 0 && <p className="muted">Aucun rapport pour le moment.</p>}
        {reports.map((j) => (
          <Link key={j.id} to={`/report/${j.id}`} className="card link">
            <div className="row between"><strong>{JOB_LABEL[j.type]} · {byId(s.elevators, j.elevatorId)?.label}</strong><span className="small muted">{fmtDate(j.visit!.finishedAt!)}</span></div>
            <p className="small muted">{j.visit?.summary}</p>
          </Link>
        ))}
      </section>
    </div>
  )
}
