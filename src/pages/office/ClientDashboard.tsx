import { Link, useParams } from 'react-router-dom'
import { byId, healthScore, useData } from '../../store'
import { Badge, Health, SeverityBadge } from '../../components/ui'
import { contractStatus, STATUS_LABEL as C_LABEL } from '../../contracts'
import { clientStats } from '../../stats'
import { STATUS_LABEL as I_LABEL, totals } from '../../invoicing'
import { eur, fmtDate, today } from '../../util'

export default function ClientDashboard() {
  const { id } = useParams()
  const s = useData()
  const c = byId(s.clients, id)
  if (!c) return <p>Client introuvable. <Link to="/office/clients">Retour</Link></p>
  const on = today()
  const st = clientStats(s, c.id, on)
  const els = s.elevators.filter((e) => st.elevatorIds.includes(e.id))
  const defects = s.defects.filter((d) => st.elevatorIds.includes(d.elevatorId) && d.status !== 'leve').sort((a, b) => a.due.localeCompare(b.due))
  const reports = s.jobs.filter((j) => st.elevatorIds.includes(j.elevatorId) && j.status === 'terminee').sort((a, b) => (b.visit?.finishedAt ?? '').localeCompare(a.visit?.finishedAt ?? '')).slice(0, 6)
  const contracts = s.contracts.filter((k) => k.clientId === c.id)
  const invoices = s.invoices.filter((i) => i.clientId === c.id && i.status !== 'brouillon').sort((a, b) => (b.number ?? '').localeCompare(a.number ?? '')).slice(0, 6)
  const max = Math.max(1, ...st.perMonth.map((m) => m.n))
  const kpi = (label: string, value: string, tone?: 'bad' | 'warn') => <div className="card kpi"><span className="muted small">{label}</span><b style={tone ? { color: `var(--${tone})` } : undefined}>{value}</b></div>

  return (
    <div className="stack-lg">
      <div><Link to="/office/clients" className="small">← Clients</Link><h1>{c.name}</h1><p className="muted">{[c.contact, c.email, c.phone].filter(Boolean).join(' · ')}</p></div>
      <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {kpi('Appareils', String(els.length))}
        {kpi('Santé moyenne', st.avgHealth === null ? '—' : `${st.avgHealth}/100`, st.avgHealth !== null && st.avgHealth < 55 ? 'bad' : st.avgHealth !== null && st.avgHealth < 80 ? 'warn' : undefined)}
        {kpi('Défauts ouverts', String(st.open.critique + st.open.majeur + st.open.mineur), st.overdueDefects ? 'bad' : undefined)}
        {kpi('Pannes (12 mois)', String(st.breakdowns12m), st.breakdowns12m > 4 ? 'warn' : undefined)}
        {kpi('Délai moyen de réparation', st.mttrHours === null ? '—' : `${st.mttrHours} h`)}
        {kpi('Visites réalisées (12 mois)', String(st.visits12m), st.lateVisits ? 'warn' : undefined)}
        {kpi('CA récurrent annuel', eur(st.annualRevenue))}
        {kpi('À encaisser', eur(st.outstanding), st.overdueInvoices ? 'bad' : undefined)}
      </div>

      <section className="card stack">
        <h2>Pannes par mois</h2>
        <div className="row" style={{ alignItems: 'flex-end', height: 90, gap: 6 }} role="img" aria-label={`Pannes par mois sur 12 mois : ${st.perMonth.map((m) => `${m.month} ${m.n}`).join(', ')}`}>
          {st.perMonth.map((m) => <div key={m.month} style={{ flex: 1, display: 'grid', gap: 4, justifyItems: 'center', alignContent: 'end', height: '100%' }}><div title={`${m.month} : ${m.n}`} style={{ width: '100%', height: `${(m.n / max) * 70}%`, minHeight: m.n ? 6 : 2, background: m.n ? 'var(--brand)' : 'var(--line)', borderRadius: 4 }} /><small className="muted" style={{ fontSize: '.65rem' }}>{m.month.slice(5)}</small></div>)}
        </div>
      </section>

      <div className="grid2">
        <section className="stack">
          <h2>Appareils</h2>
          {els.map((e) => <Link key={e.id} to={`/office/elevator/${e.id}`} className="card link row between"><span><strong>{e.label}</strong><br /><span className="small muted">{byId(s.sites, e.siteId)?.name} · {e.brand} {e.model}</span></span><Health score={healthScore(s, e.id, on)} /></Link>)}
          {els.length === 0 && <p className="muted">Aucun appareil.</p>}
        </section>
        <section className="stack">
          <h2>Défauts ouverts</h2>
          {defects.map((d) => <div key={d.id} className="card"><div className="row between"><SeverityBadge s={d.severity} /><span className="small" style={{ color: d.due < on ? 'var(--bad)' : 'var(--muted)', fontWeight: d.due < on ? 700 : 400 }}>{d.due < on ? 'En retard · ' : 'Avant le '}{fmtDate(d.due)}</span></div><p style={{ marginTop: 6 }}>{d.title}</p></div>)}
          {defects.length === 0 && <p className="muted">Aucun défaut ouvert.</p>}
        </section>
      </div>

      <div className="grid2">
        <section className="stack">
          <h2>Contrats</h2>
          {contracts.map((k) => <Link key={k.id} to="/office/contracts" className="card link row between"><span>{eur(k.priceMonthly)}/mois · {k.elevatorIds.length} appareil(s)</span><Badge tone={contractStatus(k, on) === 'actif' ? 'ok' : contractStatus(k, on) === 'resilie' ? undefined : 'warn'}>{C_LABEL[contractStatus(k, on)]}</Badge></Link>)}
          {contracts.length === 0 && <p className="muted">Aucun contrat.</p>}
        </section>
        <section className="stack">
          <h2>Dernières factures</h2>
          {invoices.map((i) => <Link key={i.id} to={`/office/invoices/${i.id}`} className="card link row between"><span><strong>{i.number}</strong> <span className="small muted">{fmtDate(i.issuedAt!)}</span></span><span className="row"><strong>{eur(totals(i).ttc)}</strong><Badge tone={i.status === 'payee' ? 'ok' : i.status === 'annulee' ? 'bad' : i.dueAt! < on ? 'bad' : 'brand'}>{i.status === 'emise' && i.dueAt! < on ? 'En retard' : I_LABEL[i.status]}</Badge></span></Link>)}
          {invoices.length === 0 && <p className="muted">Aucune facture.</p>}
        </section>
      </div>

      <section className="stack">
        <h2>Derniers rapports</h2>
        {reports.map((j) => <Link key={j.id} to={`/report/${j.id}`} className="card link"><div className="row between"><strong>{byId(s.elevators, j.elevatorId)?.label}</strong><span className="small muted">{fmtDate(j.visit!.finishedAt!)}</span></div><p className="small muted">{j.visit?.summary}</p></Link>)}
        {reports.length === 0 && <p className="muted">Aucun rapport.</p>}
      </section>
    </div>
  )
}
