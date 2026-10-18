import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { actions, byId, runtime, useData } from '../../store'
import { Badge } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { contractStatus } from '../../contracts'
import { draftFromContract, draftFromQuote, fec, salesJournalCsv, STATUS_LABEL, totals, unbilledPeriods } from '../../invoicing'
import { issueInvoice } from '../../invoice-actions'
import { fcfa, fmtDate, today, uid } from '../../util'
import type { Invoice } from '../../types'

const TONE = { brouillon: undefined, emise: 'brand', payee: 'ok', annulee: 'bad' } as const
type Filter = 'toutes' | 'brouillon' | 'encaisser' | 'payee'

function download(name: string, content: string, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([content], { type }))
  a.download = name
  a.click()
}

export default function Invoices() {
  const s = useData()
  const nav = useNavigate()
  const [filter, setFilter] = useState<Filter>('toutes')
  const [msg, setMsg] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const vat = s.settings[0]?.vatRate ?? 20
  const on = today()

  const list = [...s.invoices]
    .filter((i) => filter === 'toutes' || (filter === 'brouillon' && i.status === 'brouillon') || (filter === 'encaisser' && i.status === 'emise') || (filter === 'payee' && i.status === 'payee'))
    .sort((a, b) => (b.number ?? b.createdAt).localeCompare(a.number ?? a.createdAt))

  const toBill = s.contracts.filter((c) => contractStatus(c, on) !== 'resilie').map((c) => ({ c, periods: unbilledPeriods(c, s.invoices, on) })).filter((x) => x.periods.length)
  const quotesToBill = s.quotes.filter((q) => q.status === 'accepte' && !s.invoices.some((i) => i.quoteId === q.id && i.status !== 'annulee'))
  const overdue = s.invoices.filter((i) => i.status === 'emise' && i.dueAt && i.dueAt < on)
  const outstanding = s.invoices.filter((i) => i.status === 'emise').reduce((t, i) => t + totals(i).ttc, 0)

  return (
    <div className="stack-lg">
      <div className="row between wrap">
        <div><h1>Factures</h1><p className="muted">À encaisser : <strong>{fcfa(outstanding)}</strong>{overdue.length > 0 && <> · <span style={{ color: 'var(--bad)', fontWeight: 700 }}>{overdue.length} en retard</span></>}</p></div>
        <button className="btn primary" onClick={() => { const f: Invoice = { id: uid('f'), clientId: s.clients[0]?.id ?? '', kind: 'libre', lines: [{ label: '', qty: 1, unit: 0 }], vatRate: vat, status: 'brouillon', createdAt: on }; actions.upsertInvoice(f); nav(`/office/invoices/${f.id}`) }} disabled={!s.clients.length}>+ Facture</button>
      </div>
      {msg && <div className="card alert" role="alert">{msg}</div>}

      {(toBill.length > 0 || quotesToBill.length > 0) && (
        <section className="card stack">
          <h2>À facturer</h2>
          {toBill.map(({ c, periods }) => (
            <div key={c.id} className="row between wrap">
              <span><strong>{byId(s.clients, c.clientId)?.name}</strong> <span className="muted small">{periods.length} mois non facturé(s) · {fcfa(c.priceMonthly)}/mois</span></span>
              <button className="btn sm" onClick={() => { periods.forEach((p) => actions.upsertInvoice(draftFromContract(c, p, 1, c.elevatorIds.length, vat, on))); setFilter('brouillon') }}><Icon n="file" /> Créer {periods.length} brouillon(s)</button>
            </div>
          ))}
          {quotesToBill.map((q) => (
            <div key={q.id} className="row between wrap">
              <span><strong>Devis accepté</strong> · {byId(s.clients, q.clientId)?.name} · {byId(s.elevators, q.elevatorId)?.label}</span>
              <button className="btn sm" onClick={() => { const f = draftFromQuote(q, vat, on); actions.upsertInvoice(f); nav(`/office/invoices/${f.id}`) }}><Icon n="euro" /> Facturer</button>
            </div>
          ))}
        </section>
      )}

      <div className="seg" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        {([['toutes', 'Toutes'], ['brouillon', 'Brouillons'], ['encaisser', 'À encaisser'], ['payee', 'Payées']] as const).map(([k, l]) => <button key={k} className={filter === k ? 'ok on' : ''} onClick={() => setFilter(k)}>{l}</button>)}
      </div>

      <div className="card pad0 tablewrap"><table>
        <thead><tr><th>N°</th><th>Client</th><th>Émise le</th><th>Échéance</th><th style={{ textAlign: 'right' }}>TTC</th><th>Statut</th><th></th></tr></thead>
        <tbody>
          {list.length === 0 && <tr><td colSpan={7} className="muted">Aucune facture dans cette vue.</td></tr>}
          {list.map((i) => (
            <tr key={i.id}>
              <td><Link to={`/office/invoices/${i.id}`}><strong>{i.number ?? 'Brouillon'}</strong></Link></td>
              <td>{byId(s.clients, i.clientId)?.name}</td>
              <td>{i.issuedAt ? fmtDate(i.issuedAt) : '—'}</td>
              <td style={i.status === 'emise' && i.dueAt && i.dueAt < on ? { color: 'var(--bad)', fontWeight: 700 } : undefined}>{i.dueAt ? fmtDate(i.dueAt) : '—'}</td>
              <td style={{ textAlign: 'right' }}>{fcfa(totals(i).ttc)}</td>
              <td><Badge tone={TONE[i.status]}>{STATUS_LABEL[i.status]}</Badge></td>
              <td>
                {i.status === 'brouillon' && <button className="btn sm primary" onClick={async () => { const r = await issueInvoice(i.id); setMsg(r.ok ? '' : r.error) }}>Émettre</button>}
                {i.status === 'emise' && <button className="btn sm" onClick={() => actions.upsertInvoice({ ...i, status: 'payee', paidAt: on })}>Marquer payée</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>

      <section className="card stack">
        <h2>Export comptable</h2>
        <div className="row wrap">
          <label className="row small">Exercice <input type="number" style={{ width: 100 }} value={year} onChange={(e) => setYear(+e.target.value || year)} /></label>
          <button className="btn sm" onClick={() => download(`journal-ventes-${year}.csv`, salesJournalCsv(s.invoices.filter((i) => i.issuedAt?.startsWith(String(year))), s.clients), 'text/csv;charset=utf-8')}><Icon n="import" /> Journal des ventes (CSV)</button>
          <button className="btn sm" onClick={() => download(`FEC-${year}.txt`, fec(s.invoices, s.clients, year), 'text/plain;charset=utf-8')}><Icon n="import" /> FEC {year}</button>
        </div>
        <p className="small muted">Le FEC reprend les comptes par défaut (411 clients, 706 prestations, 44571 TVA collectée, 512 banque) : à faire valider par votre expert-comptable avant tout usage fiscal.{!runtime.server && ' Mode démonstration : numérotation locale à cet appareil.'}</p>
      </section>
    </div>
  )
}
