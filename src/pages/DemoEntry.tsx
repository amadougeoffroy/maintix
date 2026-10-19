import { Link } from 'react-router-dom'
import { Logo } from '../brand/Logo'
import { startDemo } from '../demo'

/** Entrée de la démonstration : à lancer explicitement depuis le site (jamais automatiquement sur un vrai serveur). */
export default function DemoEntry() {
  return (
    <div className="hero"><div className="box stack center">
      <Logo height={44} className="center-logo" />
      <h1>Démonstration</h1>
      <p className="muted">Essayez Maintix avec des données d’exemple : technicien sur le terrain, bureau, portail client. Rien n’est envoyé au serveur : les données restent sur cet appareil.</p>
      <button className="btn primary block" onClick={startDemo}>Lancer la démonstration</button>
      <Link to="/">← Retour à l’accueil</Link>
    </div></div>
  )
}
