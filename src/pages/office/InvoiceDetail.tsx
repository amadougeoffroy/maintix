import { orgIdentityLines, orgPayment } from '../../../shared/orgIds'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../../api'
import { actions, byId, runtime, useData } from '../../store'
import { Badge } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { History } from '../../components/History'
import { feedback } from '../../feedback'
import { isLocked, lineTotal, STATUS_LABEL, totals } from '../../invoicing'
import { issueInvoice } from '../../invoice-actions'
import { fcfa, fmtDateLong, today } from '../../util'
import type { Invoice } from '../../types'

export default function InvoiceDetail() {
  const { id } = useParams()
  const s = useData()
  const nav = useNavigate()
  const inv = byId(s.invoices, id)
  if (!inv) return <p>Facture introuvable. <Link to="/office/invoices">Retour</Link></p>
  const org = s.settings[0]
  const client = byId(s.clients, inv.clientId)
  const t = totals(inv)
  const locked = isLocked(inv)
  const set = (patch: Partial<Invoice>) => actions.upsertInvoice({ ...inv, ...patch })
  const setLine = (i: number, patch: Partial<Invoice['lines'][number]>) => set({ lines: inv.lines.map((l, n) => (n === i ? { ...l, ...patch } : l)) })

  const send = async () => {
    try { const r = await api.sendInvoice(inv.id); feedback.toast(`Facture envoyée à ${r.to.join(', ')}.`) }
    catch (e) { feedback.toast(e instanceof ApiError && e.code === 'no_recipient' ? 'Ce client n’a pas d’adresse e-mail.' : 'Envoi impossible pour le moment.', 'error') }
  }

  return (
    <div className="stack-lg">
      <div className="row between wrap no-print">
        <div><Link to="/office/invoices" className="small">← Factures</Link><h1>{inv.number ?? 'Brouillon de facture'} <Badge tone={inv.status === 'payee' ? 'ok' : inv.status === 'annulee' ? 'bad' : inv.status === 'emise' ? 'brand' : undefined}>{STATUS_LABEL[inv.status]}</Badge></h1></div>
        <div className="row wrap">
          {inv.status === 'brouillon' && <>
            <button className="btn primary" onClick={async () => { const r = await issueInvoice(inv.id); if (r.ok) feedback.toast('Facture émise et numérotée.'); else feedback.toast(r.error, 'error') }}>Émettre la facture</button>
            <button className="btn" onClick={async () => { if (await feedback.confirm({ tone: 'danger', title: 'Supprimer ce brouillon ?', body: 'Le brouillon sera supprimé définitivement. Une facture émise, elle, ne peut jamais être supprimée.', confirmLabel: 'Supprimer le brouillon', cancelLabel: 'Garder' }) && actions.deleteInvoice(inv.id)) { feedback.toast('Brouillon supprimé.'); nav('/office/invoices') } }}><Icon n="trash" /> Supprimer</button>
          </>}
          {inv.status !== 'brouillon' && <>
            <button className="btn" onClick={() => window.print()}><Icon n="printer" /> Imprimer</button>
            {runtime.server && <a className="btn" href={`/api/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer"><Icon n="file" /> PDF</a>}
            {runtime.server && <button className="btn" onClick={send}><Icon n="mail" /> Envoyer au client</button>}
          </>}
          {inv.status === 'emise' && <button className="btn" onClick={() => { set({ status: 'payee', paidAt: today() }); feedback.toast(`Facture ${inv.number} marquée payée.`) }}><Icon n="check" /> Marquer payée</button>}
          {inv.status === 'payee' && <button className="btn" onClick={() => { set({ status: 'emise', paidAt: undefined }); feedback.toast('Paiement annulé : la facture est de nouveau à encaisser.', 'info') }}>Annuler le paiement</button>}
          {inv.status === 'emise' && <button className="btn" onClick={async () => { if (await feedback.confirm({ tone: 'danger', title: 'Annuler cette facture ?', body: `La facture ${inv.number} reste conservée avec son numéro mais ne sera plus due. Cette action ne peut pas être annulée.`, confirmLabel: 'Annuler la facture', cancelLabel: 'Garder' })) { set({ status: 'annulee' }); feedback.toast(`Facture ${inv.number} annulée.`, 'info') } }}>Annuler la facture</button>}
        </div>
      </div>

      {!locked && (
        <section className="card stack no-print">
          <label className="field">Client<select value={inv.clientId} onChange={(e) => set({ clientId: e.target.value })}>{s.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <div className="tablewrap"><table>
            <thead><tr><th>Désignation</th><th>Qté</th><th>PU HT</th><th>Total</th><th></th></tr></thead>
            <tbody>{inv.lines.map((l, i) => (
              <tr key={i}>
                <td><input aria-label="Désignation" value={l.label} onChange={(e) => setLine(i, { label: e.target.value })} /></td>
                <td style={{ width: 90 }}><input aria-label="Quantité" inputMode="decimal" value={l.qty} onChange={(e) => setLine(i, { qty: +e.target.value.replace(',', '.') || 0 })} /></td>
                <td style={{ width: 120 }}><input aria-label="Prix unitaire HT" inputMode="decimal" value={l.unit} onChange={(e) => setLine(i, { unit: +e.target.value.replace(',', '.') || 0 })} /></td>
                <td>{fcfa(lineTotal(l))}</td>
                <td><button className="btn sm" aria-label="Supprimer la ligne" onClick={() => set({ lines: inv.lines.filter((_, n) => n !== i) })}><Icon n="trash" /></button></td>
              </tr>
            ))}</tbody>
          </table></div>
          <div className="row wrap">
            <button className="btn sm" onClick={() => set({ lines: [...inv.lines, { label: '', qty: 1, unit: 0 }] })}>+ Ligne</button>
            <label className="row small">TVA % <input type="number" step="0.1" style={{ width: 90 }} value={inv.vatRate} onChange={(e) => set({ vatRate: +e.target.value || 0 })} /></label>
          </div>
          <label className="field">Note (visible sur la facture)<textarea value={inv.note ?? ''} onChange={(e) => set({ note: e.target.value })} /></label>
        </section>
      )}

      <div className="no-print"><History collection="invoices" id={inv.id} /></div>

      <article className="paper">
        <div className="paper-head"><div><strong style={{ fontSize: '1.1rem' }}>{org?.legalName ?? 'Votre entreprise'}</strong><div className="small" style={{ fontWeight: 400 }}>{org?.address}{orgIdentityLines(org).map((l) => <span key={l}><br />{l}</span>)}</div></div><span style={{ fontSize: '1.3rem' }}>{inv.status === 'brouillon' ? 'PROFORMA' : 'FACTURE'}<br /><span style={{ fontSize: '.9rem', color: '#0f766e' }}>{inv.number ?? ''}</span></span></div>
        <p><strong>Facturé à :</strong> {client?.name}{client?.contact ? ` · ${client.contact}` : ''}</p>
        <p className="small">{inv.issuedAt && <>Émise le {fmtDateLong(inv.issuedAt)} · </>}{inv.dueAt && <>Échéance le {fmtDateLong(inv.dueAt)}</>}{inv.periodStart && <> · Période du {fmtDateLong(inv.periodStart)} au {fmtDateLong(inv.periodEnd!)}</>}</p>
        <table style={{ marginTop: 10 }}>
          <thead><tr><th>Désignation</th><th style={{ textAlign: 'right' }}>Qté</th><th style={{ textAlign: 'right' }}>PU HT</th><th style={{ textAlign: 'right' }}>Total HT</th></tr></thead>
          <tbody>{inv.lines.map((l, i) => <tr key={i}><td>{l.label}</td><td style={{ textAlign: 'right' }}>{l.qty}</td><td style={{ textAlign: 'right' }}>{fcfa(l.unit)}</td><td style={{ textAlign: 'right' }}>{fcfa(lineTotal(l))}</td></tr>)}</tbody>
          <tfoot>
            <tr><td colSpan={3} style={{ textAlign: 'right' }}>Total HT</td><td style={{ textAlign: 'right' }}>{fcfa(t.ht)}</td></tr>
            <tr><td colSpan={3} style={{ textAlign: 'right' }}>TVA {inv.vatRate} %</td><td style={{ textAlign: 'right' }}>{fcfa(t.vat)}</td></tr>
            <tr><td colSpan={3} style={{ textAlign: 'right' }}><strong>Total TTC</strong></td><td style={{ textAlign: 'right' }}><strong>{fcfa(t.ttc)}</strong></td></tr>
          </tfoot>
        </table>
        {inv.status === 'payee' && <p style={{ color: '#166534', fontWeight: 700 }}>Acquittée le {fmtDateLong(inv.paidAt!)}</p>}
        {inv.note && <p>{inv.note}</p>}
        {orgPayment(org) && <p className="small">Règlement : {orgPayment(org)} — référence {inv.number ?? ''}</p>}
        {org?.legalFooter && <p className="small" style={{ color: '#555' }}>{org.legalFooter}</p>}
      </article>
    </div>
  )
}
