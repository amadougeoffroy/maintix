import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, FileCheck2, QrCode, Receipt, ShieldCheck, Smartphone, WifiOff, Building2, ArrowRight } from 'lucide-react'
import { Logo } from '../brand/Logo'
import { ElevatorShaft } from '../components/ElevatorShaft'
import { ThemeToggle } from '../components/ThemeToggle'
import { runtime } from '../store'
import { startDemo } from '../demo'

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

/** Les sections de la page sont des « étages » : le panneau de droite fait office de boutons d'appel. */
const FLOORS: [string, string, string][] = [['top', 'RDC', 'Accueil'], ['fonctionnalites', '1', 'Fonctionnalités'], ['demarrer', '2', 'Démarrer'], ['acces', '3', 'Accès']]

function FloorPanel() {
  const [active, setActive] = useState('top')
  useEffect(() => {
    const els = FLOORS.map(([id]) => document.getElementById(id)).filter((e): e is HTMLElement => !!e)
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (vis) setActive(vis.target.id)
    }, { rootMargin: '-35% 0px -55% 0px', threshold: [0, 0.01, 0.5, 1] })
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [])
  return (
    <nav className="floor-panel" aria-label="Étages de la page">
      <ThemeToggle className="theme-btn" />
      {FLOORS.map(([id, label, name]) => (
        <a key={id} href={`#${id}`} className={active === id ? 'on' : ''} aria-label={`Aller à : ${name}`} aria-current={active === id ? 'true' : undefined} title={name}
          onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }) }}>{label}</a>
      ))}
    </nav>
  )
}

/** Accès à la démonstration : lancée explicitement (jamais automatiquement), ou reprise si elle est déjà active. */
function DemoLink({ dark = false }: { dark?: boolean }) {
  const style = dark ? { color: '#fbbf24' } : undefined
  return runtime.explicitDemo
    ? <Link to="/demo" style={style}>▶ Continuer la démonstration</Link>
    : <button type="button" className="link-btn" style={style} onClick={startDemo}>▶ Essayer la démonstration, sans compte</button>
}

/** Page de présentation publique (racine du site). */
export default function Landing() {
  return (
    <div className="landing" id="top">
      <FloorPanel />
      <header className="l-head">
        <div className="l-wrap l-head-in">
          <Link to="/" aria-label="Maintix, accueil"><Logo height={30} /></Link>
          <nav className="l-nav" aria-label="Présentation">
            <a href="#fonctionnalites">Fonctionnalités</a>
            <a href="#demarrer">Comment ça marche</a>
            <a href="#acces">Accès</a>
          </nav>
          <div className="l-actions">
            <Link className="btn sm ghost" to="/login">Se connecter</Link>
            <Link className="btn sm primary" to="/signup">Demander un accès</Link>
          </div>
        </div>
      </header>

      {runtime.unreachable && (
        <div className="l-alert" role="alert">
          <span>Le service est momentanément injoignable. Vérifiez votre connexion puis réessayez.</span>
          <button type="button" className="btn sm" onClick={() => location.reload()}>Réessayer</button>
        </div>
      )}
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
              <p className="small"><DemoLink /></p>
              <p className="small muted">Pas de mot de passe : un lien de connexion sécurisé vous est envoyé par e-mail.</p>
            </div>
            <div className="l-mock"><ElevatorShaft /></div>
          </div>
        </section>

        <section id="fonctionnalites" className="l-section">
          <div className="l-wrap">
            <p className="l-floor">Étage 1</p>
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
            <p className="l-floor">Étage 2</p>
            <h2>Démarrer en trois étapes</h2>
            <ol className="l-steps">
              {STEPS.map(([t, d], i) => (
                <li key={t}><span className="l-num">{i + 1}</span><h3>{t}</h3><p>{d}</p></li>
              ))}
            </ol>
          </div>
        </section>

        <section id="acces" className="l-section">
          <div className="l-wrap">
            <div className="l-final">
              <p className="l-floor on-dark">Étage 3 · Terminus</p>
              <h2>Prêt à simplifier vos interventions ?</h2>
              <p>Faites votre demande d’accès, ou connectez-vous si votre entreprise est déjà inscrite.</p>
              <div className="l-cta center">
                <Link className="btn primary" to="/signup">Demander un accès</Link>
                <Link className="btn" to="/login">Recevoir mon lien de connexion</Link>
              </div>
              <p className="small"><DemoLink dark /></p>
            </div>
          </div>
        </section>
      </main>

      <footer className="l-foot">
        <div className="l-wrap l-foot-in">
          <Logo height={22} />
          <nav className="l-legal" aria-label="Informations légales">
            <Link to="/legal/mentions">Mentions légales</Link>
            <Link to="/legal/confidentialite">Confidentialité</Link>
            <Link to="/legal/conditions">Conditions d’utilisation</Link>
          </nav>
          <span className="small muted">© {new Date().getFullYear()} Maintix · Maintenance d’ascenseurs, simplement.</span>
        </div>
      </footer>
    </div>
  )
}
