import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, QrCode, ShieldCheck, Smartphone, Users } from 'lucide-react'
import { useFeedback } from '../feedback'
import { patchOnboarding, useOnboarding } from '../onboarding'
import { runtime, useData } from '../store'

type Slide = { icon: typeof Users; title: string; body: string; points?: string[] }

const ADMIN_SLIDES = (org: string, name: string): Slide[] => [
  { icon: Building2, title: `Bienvenue ${name}`, body: `Votre espace « ${org} » est prêt. En quelques minutes, vous allez pouvoir suivre chaque visite d’ascenseur, de la tournée du technicien au rapport signé du client.`, points: ['Tout fonctionne sur téléphone, même sans réseau', 'Chaque rapport est scellé : on peut prouver ce qui a été fait', 'Vos données sont séparées de celles des autres entreprises'] },
  { icon: Smartphone, title: 'Vos techniciens : l’application mobile', body: 'Chaque technicien ouvre sa journée sur son téléphone, scanne le QR de l’appareil, suit la checklist, prend ses photos et fait signer le client.', points: ['Visite guidée par zones : machinerie, cabine, portes, gaine, sécurités', 'Mesures comparées à la visite précédente, alertes de dérive', 'Rapport PDF envoyé au client dès la fin de la visite'] },
  { icon: CalendarDays, title: 'Vous, au bureau', body: 'Vous planifiez, suivez les pannes en direct, gérez les contrats, les devis et la facturation.', points: ['Planning avec contrôle des habilitations de chaque technicien', 'Astreinte : les pannes signalées par QR alertent la bonne personne', 'Factures numérotées, export comptable (CSV, FEC)'] },
  { icon: QrCode, title: 'Vos clients : transparence', body: 'Un QR code dans chaque cabine permet de signaler une panne sans compte. Vos clients (syndics, gestionnaires) ont un portail avec leurs rapports, défauts et devis.', points: ['Page d’état publique : « signalé à 8h12, technicien en route »', 'Priorité maximale si une personne est bloquée'] },
  { icon: ClipboardCheck, title: 'Commençons : 8 étapes', body: 'Une liste « Premiers pas » vous attend sur le tableau de bord. Elle se coche toute seule au fur et à mesure et vous emmène directement au bon écran.', points: ['1. Votre entreprise  ·  2. Votre équipe  ·  3. Clients et sites  ·  4. Appareils', '5. Contrat  ·  6. Astreinte  ·  7. QR codes  ·  8. Téléphones'] },
]
const TECH_SLIDES = (name: string): Slide[] => [
  { icon: Smartphone, title: `Bienvenue ${name}`, body: 'Maintix remplace le papier : vos visites se remplissent en quelques minutes, sur votre téléphone, même sans réseau.', points: ['Ma journée : vos missions du jour, urgences en premier', 'Vos saisies sont enregistrées sur le téléphone puis synchronisées'] },
  { icon: ClipboardCheck, title: 'Une visite, pas à pas', body: 'Scannez le QR de l’appareil (ou choisissez-le dans la liste), confirmez la consignation de sécurité, puis parcourez les zones.', points: ['OK / Surveiller / Défaut sur chaque point, photo obligatoire pour un défaut', 'Test de l’appel d’urgence, mesures, pièces remplacées', 'Signature du client, ou « client absent » avec photo'] },
  { icon: ShieldCheck, title: 'Alertes et installation', body: 'Ajoutez Maintix à l’écran d’accueil de votre téléphone, puis activez les alertes dans Profil pour recevoir les pannes d’astreinte.', points: ['iPhone : bouton Partager → « Sur l’écran d’accueil »', 'Android : menu du navigateur → « Installer l’application »'] },
]

/** Visite guidée d'accueil, affichée une seule fois par personne et par entreprise (progression enregistrée sur le serveur). */
export function WelcomeTour({ kind }: { kind: 'admin' | 'tech' }) {
  const s = useData()
  const { loaded, flags } = useOnboarding()
  const { dialog: otherDialog } = useFeedback()
  const nav = useNavigate()
  const ref = useRef<HTMLDialogElement>(null)
  const [i, setI] = useState(0)
  const first = (s.session.fullName ?? '').split(' ')[0]
  const slides = kind === 'admin' ? ADMIN_SLIDES(s.session.orgName ?? 'votre entreprise', first) : TECH_SLIDES(first)
  const show = runtime.server && loaded && !flags.welcomeSeen && !otherDialog

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (show && !el.open) { setI(0); el.showModal() }
    if (!show && el.open) el.close()
  }, [show])

  const finish = (goHome = false) => {
    patchOnboarding({ welcomeSeen: true })
    if (goHome && kind === 'admin') nav('/office')
  }
  if (!runtime.server) return null
  const slide = slides[Math.min(i, slides.length - 1)]
  const last = i >= slides.length - 1
  const Icon = slide.icon

  return (
    <dialog ref={ref} className="fb-dialog tour" aria-labelledby="tour-title" aria-describedby="tour-body" onCancel={(e) => { e.preventDefault(); finish() }}>
      {show && (
        <div className="stack">
          <div className="fb-badge info"><Icon size={30} aria-hidden="true" /></div>
          <h2 id="tour-title">{slide.title}</h2>
          <p id="tour-body">{slide.body}</p>
          {slide.points && <ul className="tick">{slide.points.map((p) => <li key={p}>{p}</li>)}</ul>}
          <div className="tour-dots" role="group" aria-label={`Étape ${i + 1} sur ${slides.length}`}>{slides.map((_, n) => <span key={n} className={n === i ? 'on' : ''} />)}</div>
          <div className="fb-actions">
            <button className="btn ghost" onClick={() => finish()}>Passer</button>
            {i > 0 && <button className="btn" onClick={() => setI(i - 1)}><ChevronLeft size={18} aria-hidden="true" /> Précédent</button>}
            {last ? <button className="btn primary" autoFocus onClick={() => finish(true)}>{kind === 'admin' ? 'Voir mes premiers pas' : 'C’est parti'}</button> : <button className="btn primary" autoFocus onClick={() => setI(i + 1)}>Suivant <ChevronRight size={18} aria-hidden="true" /></button>}
          </div>
        </div>
      )}
    </dialog>
  )
}
