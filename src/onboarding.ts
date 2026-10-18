import { useSyncExternalStore } from 'react'
import { api } from './api'
import type { State } from './types'

export type OnboardingFlags = Partial<Record<'welcomeSeen' | 'gettingStartedHidden' | 'qrDone' | 'installDone' | 'teamDone', boolean>>
interface Snap { loaded: boolean; flags: OnboardingFlags }

let snap: Snap = { loaded: false, flags: {} }
const listeners = new Set<() => void>()
const set = (next: Snap) => { snap = next; listeners.forEach((l) => l()) }
export const useOnboarding = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => snap)

/** Charge l'avancement du membre pour l'entreprise active (appelé à la connexion et au changement d'entreprise). */
export async function loadOnboarding() {
  set({ loaded: false, flags: {} })
  try { set({ loaded: true, flags: (await api.onboarding()).onboarding }) } catch { set({ loaded: true, flags: { welcomeSeen: true } }) } // en cas d'échec, ne pas importuner
}
/** Mise à jour immédiate à l'écran, puis enregistrement serveur (le même didacticiel suit l'utilisateur d'un appareil à l'autre). */
export function patchOnboarding(patch: OnboardingFlags) {
  set({ ...snap, flags: { ...snap.flags, ...patch } })
  api.setOnboarding(patch).catch(() => {})
}
export const resetOnboarding = () => set({ loaded: false, flags: {} })

export interface Step { key: string; title: string; why: string; to: string; action: string; done: boolean; manual?: 'installDone' | 'teamDone' }

/** Étapes de démarrage d'un administrateur, cochées automatiquement d'après les données quand c'est possible. */
export function gettingStartedSteps(s: State, flags: OnboardingFlags): Step[] {
  const o = s.settings[0]
  return [
    { key: 'company', title: 'Renseigner votre entreprise', why: 'Raison sociale, SIRET, TVA, IBAN et mentions légales : ils figurent sur vos factures.', to: '/office/settings', action: 'Ouvrir les réglages', done: !!(o?.legalName?.trim() && o?.siret?.trim()) },
    { key: 'team', title: 'Inviter votre équipe', why: 'Techniciens (application mobile) et bureau : chacun reçoit un lien de connexion par e-mail.', to: '/office/settings', action: 'Inviter', done: s.techs.some((t) => t.role === 'tech') || !!flags.teamDone },
    { key: 'clients', title: 'Ajouter vos clients et leurs sites', why: 'Syndics, bailleurs, hôtels… et les adresses où se trouvent les ascenseurs.', to: '/office/clients', action: 'Ajouter un client', done: s.clients.length > 0 && s.sites.length > 0 },
    { key: 'parc', title: 'Ajouter ou importer vos appareils', why: 'Un par un, ou en important un fichier Excel/CSV (ou un copier-coller).', to: '/office/import', action: 'Importer le parc', done: s.elevators.length > 0 },
    { key: 'contract', title: 'Créer un contrat d’entretien', why: 'Il génère les visites périodiques, suit le préavis et l’indexation, et prépare la facturation.', to: '/office/clients', action: 'Créer un contrat', done: s.contracts.length > 0 },
    { key: 'oncall', title: 'Définir l’astreinte', why: 'Qui reçoit les pannes cette semaine : les signalements par QR lui sont envoyés.', to: '/office/oncall', action: 'Choisir l’astreinte', done: s.onCall.length > 0 },
    { key: 'qr', title: 'Imprimer les QR codes', why: 'À coller dans chaque cabine : le technicien ouvre la fiche, un usager signale une panne.', to: '/office/qr', action: 'Voir les QR codes', done: !!flags.qrDone },
    { key: 'install', title: 'Installer l’application sur les téléphones', why: 'Sur le téléphone : « Ajouter à l’écran d’accueil », puis activer les alertes d’astreinte dans Profil.', to: '/office/settings', action: 'Voir comment', done: !!flags.installDone, manual: 'installDone' },
  ]
}
