import { Link } from 'react-router-dom'
import { CalendarClock, ClipboardCheck, FileCheck2, QrCode, Receipt, ShieldCheck, Smartphone, WifiOff, Building2, ArrowRight } from 'lucide-react'
import { Logo } from '../brand/Logo'

const FEATURES = [
  { icon: Smartphone, title: 'Visites sur mobile', text: 'Check-list guidée par zone, mesures, pièces, photos et signature du client, au doigt, sur le palier.' },
  { icon: WifiOff, title: 'Fonctionne sans réseau', text: 'En sous-sol ou en gaine, rien ne se perd : tout se synchronise dès que le réseau revient.' },
  { icon: FileCheck2, title: 'Rapports scellés', text: 'Chaque rapport est figé à la clôture avec une empreinte SHA-256, envoyé en PDF au client en un clic.' },
  { icon: CalendarClock, title: 'Planning et astreinte', text: 'Affectez les missions, suivez les habilitations, et alertez le bon technicien avec relance automatique.' },
  { icon: Building2, title: 'Parc et contrats', text: 'Appareils, sites, clients, contrats et indexations, dossier de contrôle technique par ascenseur.' },
  { icon: Receipt, title: 'Devis et factures', text: 'Factures numérotées sans trou, montants en FCFA, journal des ventes exportable pour la comptabilité.' },
  { icon: QrCode, title: 'Signalement par QR code', text: 'Un QR code par ascenseur : l’occupant signale une panne et suit la réparation, sans compte.' },
  { icon: ShieldCheck, title: 'Traçabilité complète', text: 'Journal d’audit, historique de chaque appareil, données cloisonnées par entreprise.' },
]

const STEPS = [
  ['Demandez un accès', 'Présentez votre entreprise. Nous étudions chaque demande et créons votre espace.'],
  ['Importez votre parc', 'Collez ou importez votre liste d’ascenseurs, invitez vos techniciens par e-mail.'],
  ['Intervenez, tracez, facturez', 'Vos équipes interviennent, les rapports partent chez vos clients, la facturation suit.'],
]

/** Page de présentation publique (racine du site). */
export default function Landing() {
  return (
    <div className="landing">
      <header className="l-head">
        <div className="l-wrap l-head-in">
          <Link to="/" aria-label="Maintix, accueil"><Logo height={30} /></Link>
          <nav className="l-nav" aria-label="Présentation">
            <a href="#fonctionnalites">Fonctionnalités</a>
            <a href="#demarrer">Comment ça marche</a>
          </nav>
          <div className="l-actions">
            <Link className="btn sm ghost" to="/login">Se connecter</Link>
            <Link className="btn sm primary" to="/signup">Demander un accès</Link>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="l-hero">
          <div className="l-wrap l-hero-in">
            <div className="l-hero-text">
              <p className="l-eyebrow">Maintenance d’ascenseurs</p>
              <h1>Chaque visite, tracée.</h1>
              <p className="l-lead">Maintix réunit vos techniciens, votre bureau et vos clients sur une seule plateforme : visites sur téléphone, rapports scellés, planning, contrats et facturation.</p>
              <div className="l-cta">
                <Link className="btn primary" to="/signup">Demander un accès <ArrowRight size={18} aria-hidden="true" /></Link>
                <Link className="btn" to="/login">Recevoir mon lien de connexion</Link>
              </div>
              <p className="small muted">Pas de mot de passe : un lien de connexion sécurisé vous est envoyé par e-mail.</p>
            </div>
            <div className="l-mock" aria-hidden="true">
              <div className="l-mock-card">
                <div className="l-mock-top"><span className="l-dot" /> Visite terminée</div>
                <strong>Ascenseur A1 · Les Lilas</strong>
                <ul>
                  <li><ClipboardCheck size={16} /> Check-list complète · 24 points</li>
                  <li><FileCheck2 size={16} /> Signature du gardien</li>
                  <li><ShieldCheck size={16} /> Rapport scellé · SHA-256</li>
                </ul>
                <div className="l-mock-btn">Envoyer le rapport au client</div>
              </div>
            </div>
          </div>
        </section>

        <section id="fonctionnalites" className="l-section">
          <div className="l-wrap">
            <h2>Tout le métier, dans une seule application</h2>
            <p className="l-sub">Pensée pour le terrain d’abord : gros boutons, saisie rapide, utilisable à une main.</p>
            <ul className="l-grid">
              {FEATURES.map((f) => (
                <li key={f.title} className="l-feature">
                  <span className="l-ico"><f.icon size={22} aria-hidden="true" /></span>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="demarrer" className="l-section alt">
          <div className="l-wrap">
            <h2>Démarrer en trois étapes</h2>
            <ol className="l-steps">
              {STEPS.map(([t, d], i) => (
                <li key={t}><span className="l-num">{i + 1}</span><h3>{t}</h3><p>{d}</p></li>
              ))}
            </ol>
          </div>
        </section>

        <section className="l-section">
          <div className="l-wrap">
            <div className="l-final">
              <h2>Prêt à simplifier vos interventions ?</h2>
              <p>Faites votre demande d’accès, ou connectez-vous si votre entreprise est déjà inscrite.</p>
              <div className="l-cta center">
                <Link className="btn primary" to="/signup">Demander un accès</Link>
                <Link className="btn" to="/login">Recevoir mon lien de connexion</Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="l-foot">
        <div className="l-wrap l-foot-in">
          <Logo height={22} />
          <span className="small muted">© {new Date().getFullYear()} Maintix · Maintenance d’ascenseurs, simplement.</span>
        </div>
      </footer>
    </div>
  )
}
