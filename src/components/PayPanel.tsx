import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { api, ApiError, type BillingOverview } from '../api'
import { feedback } from '../feedback'
import { fcfa, fmtDate } from '../util'
import { priceFor } from '../../shared/pricing'
import { Badge } from './ui'

const PLAN_STATUS: Record<string, string> = { pending: 'En attente', paid: 'Payé', failed: 'Échec' }

/** Choix de l'offre et de la durée (1, 3, 6 ou 12 mois), puis paiement en ligne par Jèko. */
export function PayPanel({ compact = false }: { compact?: boolean }) {
  const [o, setO] = useState<BillingOverview | null>(null)
  const [plan, setPlan] = useState('')
  const [months, setMonths] = useState(1)
  const [method, setMethod] = useState('wave')
  const [busy, setBusy] = useState(false)
  useEffect(() => { api.billing().then((v) => { setO(v); setPlan((p) => p || (v.plans.some((x) => x.code === v.current.plan) ? v.current.plan : v.plans[0]?.code ?? '')) }).catch(() => {}) }, [])
  if (!o) return null
  const chosen = o.plans.find((p) => p.code === plan)
  const vatRate = o.vat.enabled ? o.vat.rate : 0
  const quote = chosen ? priceFor(chosen.priceMonthly, months, vatRate) : null
  const amount = quote?.ttc ?? 0 // total à payer (TVA comprise si elle est activée)
  const sus = o.current.suspension
  const blocked = sus && !sus.payable
  return (
    <section className="stack">
      {!compact && <h2>Abonnement et paiement</h2>}
      {blocked ? (
        <div className="card alert" role="alert"><strong>Le paiement ne peut pas lever cette suspension.</strong><p className="small">Contactez votre interlocuteur Maintix : seule l’équipe Maintix peut rétablir l’accès.</p></div>
      ) : !o.canPay ? (
        <p className="muted small">Seul l’administrateur de l’entreprise peut payer l’abonnement.</p>
      ) : !o.online ? (
        <p className="muted small">Le paiement en ligne n’est pas encore activé. Contactez votre interlocuteur Maintix pour régler votre abonnement.</p>
      ) : (
        <form className="card stack" onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          try { const r = await api.checkout({ plan, months, method }); window.location.href = r.redirectUrl }
          catch (x) { setBusy(false); feedback.toast(x instanceof ApiError && x.code === 'not_payable' ? 'Ce paiement ne peut pas lever la suspension : contactez Maintix.' : 'Le paiement n’a pas pu démarrer. Réessayez dans un instant.', 'error') }
        }}>
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="small muted">Offre</legend>
            <div className="plan-cards" role="radiogroup" aria-label="Offre">
              {o.plans.map((p) => (
                <button key={p.code} type="button" role="radio" aria-checked={plan === p.code} className={`plan-card ${plan === p.code ? 'on' : ''}`} onClick={() => setPlan(p.code)}>
                  <span className="row between"><strong>{p.name}</strong>{o.current.plan === p.code && <Badge tone="brand">Offre actuelle</Badge>}</span>
                  <span className="plan-price">{fcfa(p.priceMonthly)} <small>/ mois{o.vat.enabled ? ' HT' : ''}</small></span>
                  <ul className="plan-perks">
                    <li><Check size={15} aria-hidden="true" /> {p.maxTechs === null ? 'Techniciens illimités' : `Jusqu’à ${p.maxTechs} techniciens`}</li>
                    <li><Check size={15} aria-hidden="true" /> {p.maxElevators === null ? 'Appareils illimités' : `Jusqu’à ${p.maxElevators} appareils`}</li>
                    <li><Check size={15} aria-hidden="true" /> Visites sur mobile, rapports scellés, planning, factures</li>
                    <li><Check size={15} aria-hidden="true" /> {p.overageMode === 'block' ? 'Plafonds fermes : changer d’offre pour en ajouter' : p.extraTechPrice || p.extraElevatorPrice ? `Au-delà : ${[p.extraTechPrice ? `${fcfa(p.extraTechPrice)} / technicien` : '', p.extraElevatorPrice ? `${fcfa(p.extraElevatorPrice)} / appareil` : ''].filter(Boolean).join(' · ')} par mois` : 'Ajouts possibles au-delà des plafonds'}</li>
                  </ul>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="small muted">Durée</legend>
            <div className="seg" role="radiogroup" aria-label="Durée du paiement">
              {o.months.map((m) => <button key={m} type="button" role="radio" aria-checked={months === m} className={months === m ? 'ok on' : ''} onClick={() => setMonths(m)}>{m} mois{(o.discounts[m] ?? 0) > 0 && <span className="disc-tag">−{o.discounts[m]} %</span>}</button>)}
            </div>
          </fieldset>
          <label className="field">Moyen de paiement
            <select value={method} onChange={(e) => setMethod(e.target.value)}>{o.methods.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}</select>
          </label>
          {chosen && (
            <div className="card stack" style={{ background: 'var(--surface-2)' }}>
              <div className="row between wrap"><span className="muted">{chosen.name} · {months} mois × {fcfa(chosen.priceMonthly)}{o.vat.enabled ? ' HT' : ''}{quote && quote.discountPct > 0 ? <> = <s>{fcfa(quote.list)}</s></> : null}</span>{!o.vat.enabled && <strong style={{ fontSize: '1.3rem' }}>{fcfa(amount)}</strong>}</div>
              {quote && o.vat.enabled && (
                <div className="stack" style={{ gap: 4 }}>
                  <div className="row between"><span className="muted">Total HT</span><span>{fcfa(quote.total)}</span></div>
                  <div className="row between"><span className="muted">TVA {String(o.vat.rate).replace('.', ',')} %</span><span>{fcfa(quote.vat)}</span></div>
                  <div className="row between"><strong>Total TTC à payer</strong><strong style={{ fontSize: '1.3rem' }}>{fcfa(quote.ttc)}</strong></div>
                </div>
              )}
              {quote && quote.discountPct > 0 && <p className="small" style={{ color: 'var(--ok)', fontWeight: 700 }}>Remise de {quote.discountPct} % : vous économisez {fcfa(quote.discount)}.</p>}
              <p className="small muted">Inclus : {chosen.maxTechs === null ? 'techniciens illimités' : `${chosen.maxTechs} techniciens`} et {chosen.maxElevators === null ? 'appareils illimités' : `${chosen.maxElevators} appareils`}.</p>
            </div>
          )}
          <button className="btn primary block" disabled={busy || !chosen}>{busy ? 'Redirection vers Jèko…' : `Payer ${fcfa(amount)} avec Jèko`}</button>
          <p className="small muted">Vous serez redirigé vers la page de paiement sécurisée de Jèko. L’accès est rétabli dès la confirmation du paiement.</p>
        </form>
      )}
      {!compact && o.current.endsOn && <p className="small muted">Abonnement valable jusqu’au {fmtDate(o.current.endsOn)}</p>}
      {!compact && o.payments.length > 0 && (
        <div className="card stack">
          <h3>Vos paiements</h3>
          {o.payments.map((p) => (
            <div key={p.id} className="row between wrap small">
              <span>{fmtDate(p.createdAt)} · {p.plan} · {p.months} mois</span>
              <span className="row"><strong>{fcfa(p.amount)}</strong>{(p.discountPct ?? 0) > 0 && <span className="disc-tag">−{p.discountPct} %</span>}<Badge tone={p.status === 'paid' ? 'ok' : p.status === 'failed' ? 'bad' : 'warn'}>{PLAN_STATUS[p.status]}</Badge>{p.status === 'paid' && p.receiptNumber && <a className="btn sm" href={`/api/billing/payments/${p.id}/receipt`} download aria-label={`Télécharger le reçu ${p.receiptNumber}`}>Reçu PDF</a>}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
