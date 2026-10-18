import { useNavigate } from 'react-router-dom'
import { useData } from '../store'

/** Retour pour les pages publiques : page précédente de l'app, sinon l'accueil de l'utilisateur connecté.
 *  Un visiteur arrivé par QR code, sans compte, n'a nulle part où retourner : rien n'est affiché. */
export function BackLink({ label = 'Retour' }: { label?: string }) {
  const nav = useNavigate()
  const s = useData()
  const canGoBack = (window.history.state?.idx ?? 0) > 0
  if (!canGoBack && !s.session.role && !s.session.clientId && !s.session.techId) return null
  return (
    <button type="button" className="btn ghost sm" style={{ justifySelf: 'start' }} onClick={() => (canGoBack ? nav(-1) : nav('/'))}>← {label}</button>
  )
}
