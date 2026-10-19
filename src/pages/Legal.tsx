import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { Logo } from '../brand/Logo'
import { runtime } from '../store'

type Legal = Awaited<ReturnType<typeof api.info>>['legal']
const UPDATED = '19 octobre 2026'

function Contact({ legal }: { legal: Legal }) {
  return legal.email ? <a href={`mailto:${legal.email}`}>{legal.email}</a> : <>le formulaire de <Link to="/signup">demande d’accès</Link></>
}

function Mentions({ legal }: { legal: Legal }) {
  return (
    <>
      <h2>Éditeur du service</h2>
      <p>Le service Maintix est édité par {legal.name ? <strong>{legal.name}</strong> : 'son éditeur'}.</p>
      <ul>
        {legal.registration && <li>Immatriculation : {legal.registration}</li>}
        {legal.address && <li>Adresse : {legal.address}</li>}
        {legal.phone && <li>Téléphone : {legal.phone}</li>}
        {legal.email && <li>E-mail : <a href={`mailto:${legal.email}`}>{legal.email}</a></li>}
      </ul>
      <h2>Hébergement</h2>
      <p>{legal.host ? <>Le service est hébergé par {legal.host}.</> : 'Le service est hébergé sur une infrastructure dédiée, en conteneurs, avec une base de données PostgreSQL non partagée avec d’autres services.'}</p>
      <h2>Propriété intellectuelle</h2>
      <p>La marque Maintix, son logo, l’interface et le code du service sont protégés. Les données saisies par les entreprises clientes (parc, clients, rapports, photos, signatures) restent leur propriété.</p>
      <h2>Contact</h2>
      <p>Pour toute question : <Contact legal={legal} />.</p>
    </>
  )
}

function Privacy({ legal }: { legal: Legal }) {
  return (
    <>
      <p>Cette page explique quelles données Maintix traite, pourquoi, et quels sont vos droits. Elle s’applique aux utilisateurs des entreprises clientes (administrateurs, bureau, techniciens, clients) et aux visiteurs qui signalent une panne par QR code.</p>
      <h2>Qui est responsable ?</h2>
      <p>Chaque entreprise cliente décide de l’usage de ses données (parc, clients, rapports) : elle en est responsable ; {legal.name ?? 'l’éditeur de Maintix'} les traite pour son compte, comme sous-traitant, afin de faire fonctionner le service. Pour les comptes utilisateurs et la relation commerciale, {legal.name ?? 'l’éditeur'} est responsable du traitement.</p>
      <h2>Données traitées</h2>
      <ul>
        <li><strong>Compte :</strong> nom, adresse e-mail, fonction, numéro de téléphone (facultatif, pour les alertes d’astreinte).</li>
        <li><strong>Activité :</strong> visites, check-lists, mesures, photos, signatures de clients, rapports scellés, défauts, devis et factures, journal des actions.</li>
        <li><strong>Signalement public par QR code :</strong> description de la panne et nom facultatif du déclarant. Aucun compte n’est créé.</li>
        <li><strong>Demande d’accès :</strong> entreprise, nom, e-mail, téléphone facultatif et message.</li>
        <li><strong>Paiement :</strong> l’abonnement se règle par Jèko. Maintix ne reçoit ni ne conserve vos numéros de carte ou de compte de paiement mobile ; il conserve le montant, l’offre, la durée et la référence de la transaction.</li>
      </ul>
      <h2>Pourquoi et sur quelle base</h2>
      <p>Pour fournir le service et exécuter le contrat (connexion, suivi des interventions, rapports, facturation), pour la sécurité (journal d’audit, limitation des abus) et pour respecter nos obligations (conservation des documents comptables).</p>
      <h2>Cookies et traceurs</h2>
      <p>Maintix n’utilise <strong>aucun cookie publicitaire ni outil de mesure d’audience</strong>. Seul un cookie de session strictement nécessaire est déposé à la connexion. Le navigateur conserve aussi, sur votre appareil, vos préférences (thème clair ou sombre, menu replié) et les données nécessaires au fonctionnement hors ligne.</p>
      <h2>Destinataires</h2>
      <p>Les données ne sont ni vendues ni utilisées à des fins publicitaires. Elles ne sont accessibles qu’aux utilisateurs de votre entreprise, selon leur rôle, et aux équipes de la plateforme pour l’assistance. Prestataires techniques : hébergement, envoi des e-mails de service, et Jèko pour les paiements.</p>
      <h2>Durée de conservation</h2>
      <p>Les données sont conservées pendant la durée du contrat. Après la fin de l’abonnement, elles sont supprimées ou restituées sur demande, sous réserve des obligations légales (par exemple documents comptables). Les rapports scellés sont conçus pour être inaltérables : leur suppression intervient avec celle de l’espace de l’entreprise.</p>
      <h2>Sécurité</h2>
      <p>Connexion par lien à usage unique et durée limitée, session chiffrée en transit (HTTPS), cloisonnement strict des données de chaque entreprise, limitation du nombre de tentatives, journal d’audit, clés de paiement chiffrées.</p>
      <h2>Vos droits</h2>
      <p>Vous pouvez demander l’accès à vos données, leur rectification, leur suppression, la limitation ou l’opposition à leur traitement, conformément à la réglementation applicable en matière de protection des données personnelles (en Côte d’Ivoire, la loi n° 2013-450 du 19 juin 2013 et l’ARTCI, autorité de protection). Écrivez-nous via <Contact legal={legal} />. Les utilisateurs d’une entreprise peuvent aussi s’adresser à leur administrateur.</p>
    </>
  )
}

function Terms({ legal }: { legal: Legal }) {
  return (
    <>
      <p>Ces conditions encadrent l’utilisation de Maintix par les entreprises clientes et leurs utilisateurs.</p>
      <h2>1. Le service</h2>
      <p>Maintix est une plateforme de gestion de la maintenance d’ascenseurs : visites et rapports sur mobile (y compris hors ligne), planning, astreinte, parc, contrats, devis, factures, portail client et signalement par QR code.</p>
      <h2>2. Accès</h2>
      <p>L’accès s’obtient après une demande étudiée par l’équipe Maintix, qui crée l’espace de l’entreprise et son administrateur. Il n’y a pas de mot de passe : la connexion se fait par un lien envoyé à l’adresse e-mail du compte. L’administrateur invite ses utilisateurs et reste responsable de leurs accès.</p>
      <h2>3. Offres, durée et paiement</h2>
      <p>L’entreprise choisit une offre (plafonds de techniciens et d’appareils, prix mensuel en FCFA) et règle son abonnement en ligne pour 1, 3, 6 ou 12 mois par Jèko, ou par un autre moyen convenu avec Maintix. Une période d’essai gratuite peut être accordée. L’abonnement prend fin à la date d’échéance indiquée dans l’espace de l’entreprise, sauf renouvellement. Les dépassements de plafonds sont signalés et peuvent être facturés selon les conditions de l’offre.</p>
      <h2>4. Suspension</h2>
      <p>L’accès est suspendu automatiquement à la fin de l’essai ou à l’échéance de l’abonnement, et peut l’être par Maintix en cas d’impayé, de non-respect des présentes conditions ou de raison de sécurité. Les comptes de l’entreprise sont alors déconnectés et le motif est indiqué. Les suspensions pour fin d’essai, échéance ou impayé sont levées par le paiement ; les autres ne peuvent être levées que par Maintix. Les données sont conservées pendant la suspension.</p>
      <h2>5. Obligations de l’utilisateur</h2>
      <p>L’utilisateur renseigne des informations exactes, protège l’accès à sa messagerie, et utilise le service conformément à la loi. Les rapports d’intervention sont sous la responsabilité de l’entreprise de maintenance qui les établit ; Maintix en garantit seulement l’intégrité technique (sceau).</p>
      <h2>6. Données</h2>
      <p>Les données de l’entreprise lui appartiennent. Elle peut en demander la restitution à la fin du contrat. Le traitement des données personnelles est décrit dans la <Link to="/legal/confidentialite">politique de confidentialité</Link>.</p>
      <h2>7. Disponibilité et responsabilité</h2>
      <p>Maintix s’efforce d’assurer un service continu mais ne peut garantir l’absence d’interruption. Le service est un outil de gestion : il ne remplace pas les obligations réglementaires de contrôle et de sécurité des ascenseurs, ni le jugement du technicien. La responsabilité de Maintix est limitée aux dommages directs, dans la limite des sommes versées sur les douze derniers mois.</p>
      <h2>8. Résiliation</h2>
      <p>L’entreprise peut cesser d’utiliser le service à l’échéance de son abonnement. Maintix peut résilier en cas de manquement grave après avoir prévenu l’entreprise.</p>
      <h2>9. Modification et contact</h2>
      <p>Ces conditions peuvent évoluer ; la date de mise à jour figure en haut de la page. Pour toute question : <Contact legal={legal} />.</p>
    </>
  )
}

const PAGES = {
  mentions: { title: 'Mentions légales', Body: Mentions },
  confidentialite: { title: 'Politique de confidentialité', Body: Privacy },
  conditions: { title: 'Conditions d’utilisation', Body: Terms },
} as const

/** Pages légales publiques : mentions, confidentialité, conditions. Les informations de l'éditeur viennent de la configuration du serveur. */
export default function LegalPage() {
  const { page } = useParams()
  const [legal, setLegal] = useState<Legal>({})
  useEffect(() => { if (runtime.server) api.info().then((r) => setLegal(r.legal)).catch(() => {}) }, [])
  const def = PAGES[page as keyof typeof PAGES]
  useEffect(() => { document.title = def ? `${def.title} · Maintix` : 'Maintix'; return () => { document.title = 'Maintix' } }, [def])
  if (!def) return <Navigate to="/" replace />
  const Body = def.Body
  return (
    <div className="legal">
      <header className="l-head"><div className="l-wrap l-head-in"><Link to="/" aria-label="Maintix, accueil"><Logo height={30} /></Link><Link className="btn sm ghost" to="/">← Accueil</Link></div></header>
      <main id="main" className="l-wrap legal-body">
        <h1>{def.title}</h1>
        <p className="small muted">Dernière mise à jour : {UPDATED}</p>
        <Body legal={legal} />
        <nav className="legal-nav" aria-label="Autres pages légales">
          {Object.entries(PAGES).filter(([k]) => k !== page).map(([k, v]) => <Link key={k} to={`/legal/${k}`}>{v.title}</Link>)}
        </nav>
      </main>
    </div>
  )
}
