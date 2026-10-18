import { useEffect, useState } from 'react'
import { api } from '../api'
import { Badge } from './ui'
import { runtime } from '../store'
import { fcfa, fmtDate } from '../util'

const PLAN_NAME: Record<string, string> = { essai: 'Essai gratuit', essentiel: 'Essentiel', pro: 'Pro', 'sur-mesure': 'Sur mesure', interne: 'Interne' }

function Bar({ label, value, max }: { label: string; value: number; max: number | null }) {
  const over = max !== null && value > max
  return (
    <div>
      <div className="row between small"><span>{label}</span><strong style={over ? { color: 'var(--bad)' } : undefined}>{value}{max === null ? ' (illimité)' : ` / ${max}`}</strong></div>
      <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max ?? Math.max(value, 1)} aria-valuenow={value}><div style={{ width: `${max === null ? 10 : Math.min(100, (value / Math.max(1, max)) * 100)}%`, background: over ? 'var(--bad)' : undefined }} /></div>
    </div>
  )
}

/** Offre et usage de l'entreprise, visibles par ses responsables (transparence avant la facturation). */
export function PlanCard() {
  const [p, setP] = useState<Awaited<ReturnType<typeof api.orgPlan>> | null>(null)
  useEffect(() => { if (runtime.server) api.orgPlan().then(setP).catch(() => {}) }, [])
  if (!runtime.server || !p) return null
  return (
    <section className="stack">
      <h2>Votre offre</h2>
      <div className="card stack">
        <div className="row between wrap"><strong>{PLAN_NAME[p.offer.plan] ?? p.offer.plan}</strong><span className="row">{p.flags.trialExpired && <Badge tone="bad">Essai expiré</Badge>}{(p.flags.overTechs || p.flags.overElevators) && <Badge tone="warn">Plafond dépassé</Badge>}</span></div>
        {p.offer.plan === 'essai' && p.offer.trialEndsOn && <p className="small muted">Essai gratuit jusqu’au {fmtDate(p.offer.trialEndsOn)}.</p>}
        <Bar label="Techniciens" value={p.usage.techs} max={p.offer.maxTechs} />
        <Bar label="Appareils" value={p.usage.elevators} max={p.offer.maxElevators} />
        {p.offer.priceMonthly > 0 && <p className="small muted">Forfait : {fcfa(p.offer.priceMonthly)} par mois{p.estimate.amount > p.estimate.base ? `, soit ${fcfa(p.estimate.amount)} avec les dépassements actuels.` : '.'}</p>}
        {(p.flags.overTechs || p.flags.overElevators) && <p className="small">Vous dépassez les plafonds de votre offre : rien n’est bloqué, mais le dépassement sera facturé. Contactez-nous pour adapter votre offre.</p>}
      </div>
    </section>
  )
}
