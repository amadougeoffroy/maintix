import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Clock3, XCircle } from 'lucide-react'
import { api } from '../api'
import { Logo } from '../brand/Logo'
import { enterSession } from '../session'
import { fcfa, fmtDate } from '../util'

/** Retour de la page de paiement Jèko : attend la confirmation (webhook) puis rétablit l'accès. */
export default function BillingReturn() {
  const [q] = useSearchParams()
  const id = q.get('payment') ?? ''
  const [st, setSt] = useState<Awaited<ReturnType<typeof api.paymentStatus>> | null>(null)
  const [tries, setTries] = useState(0)
  useEffect(() => {
    if (!id) return
    let alive = true
    const t = setTimeout(async () => {
      try {
        const s = await api.paymentStatus(id)
        if (!alive) return
        setSt(s)
        if (s.status === 'paid') await enterSession(await api.session()) // l'accès est rétabli : recharge la session
        else if (s.status === 'pending') setTries((n) => n + 1)
      } catch { if (alive) setTries((n) => n + 1) }
    }, tries === 0 ? 300 : 3000)
    return () => { alive = false; clearTimeout(t) }
  }, [id, tries])
  const paid = st?.status === 'paid'
  const failed = st?.status === 'failed' || !!q.get('failed')
  const waiting = !paid && !failed
  return (
    <div className="hero"><div className="box stack">
      <div className="center stack"><Logo height={40} className="center-logo" /></div>
      <div className="card stack center" role="status">
        {paid ? <CheckCircle2 size={48} color="var(--ok)" style={{ margin: '0 auto' }} aria-hidden="true" /> : failed ? <XCircle size={48} color="var(--bad)" style={{ margin: '0 auto' }} aria-hidden="true" /> : <Clock3 size={48} color="var(--warn)" style={{ margin: '0 auto' }} aria-hidden="true" />}
        <h1>{paid ? 'Paiement confirmé' : failed ? 'Paiement non abouti' : 'Confirmation en cours…'}</h1>
        {paid && st && <p>Merci ! {fcfa(st.amount)} reçus pour {st.months} mois. {st.periodEnd ? `Abonnement valable jusqu’au ${fmtDate(st.periodEnd)}.` : ''}</p>}
        {failed && <p>Le paiement n’a pas abouti. Aucun montant n’a été débité par Maintix ; vous pouvez réessayer.</p>}
        {waiting && <p>Nous attendons la confirmation de Jèko, cela prend en général quelques secondes. Vous pouvez laisser cette page ouverte.</p>}
        {waiting && tries > 10 && <p className="small muted">La confirmation tarde : si vous avez bien payé, elle arrivera sous peu. En cas de doute, contactez Maintix avec votre référence de paiement.</p>}
        <Link className="btn primary" to="/">{paid ? 'Accéder à la plateforme' : 'Retour'}</Link>
      </div>
    </div></div>
  )
}
