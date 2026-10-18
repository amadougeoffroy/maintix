// Points de contrôle partagés entre l'application et le serveur (génération du PDF).
export type Severity = 'mineur' | 'majeur' | 'critique'

export interface CheckItem {
  key: string
  label: string
  severity: Severity
  hint?: string
}
export interface Zone {
  key: string
  label: string
  icon: string
  items: CheckItem[]
}

export const ZONES: Zone[] = [
  {
    key: 'machinerie',
    label: 'Machinerie',
    icon: 'traction',
    items: [
      { key: 'mach_propre', label: 'Local propre, accès dégagé, éclairage OK', severity: 'mineur' },
      { key: 'mach_machine', label: 'Machine de traction : bruit, vibrations, fuites', severity: 'majeur' },
      { key: 'mach_frein', label: 'Frein : usure garnitures, entrefer', severity: 'critique' },
      { key: 'mach_armoire', label: 'Armoire de manœuvre : contacteurs, câblage', severity: 'majeur' },
    ],
  },
  {
    key: 'cabine',
    label: 'Cabine',
    icon: 'cabine',
    items: [
      { key: 'cab_eclairage', label: 'Éclairage normal et de secours', severity: 'mineur' },
      { key: 'cab_boutons', label: 'Boutons, afficheur, signalétique', severity: 'mineur' },
      { key: 'cab_plancher', label: 'Arrêt à niveau (précision de palier)', severity: 'majeur' },
      { key: 'cab_porte', label: 'Porte de cabine : fermeture, détecteur', severity: 'majeur' },
    ],
  },
  {
    key: 'paliers',
    label: 'Portes palières',
    icon: 'door',
    items: [
      { key: 'pal_galets', label: 'Galets et patins de portes', severity: 'majeur' },
      { key: 'pal_verrou', label: 'Serrures / verrouillage des portes', severity: 'critique' },
      { key: 'pal_jeu', label: 'Jeu entre vantaux et seuils', severity: 'mineur' },
      { key: 'pal_deverr', label: 'Déverrouillage de secours', severity: 'majeur' },
    ],
  },
  {
    key: 'gaine',
    label: 'Gaine & cuvette',
    icon: 'cuvette',
    items: [
      { key: 'gai_cuvette', label: 'Cuvette : propreté, absence d’eau', severity: 'majeur' },
      { key: 'gai_amortisseurs', label: 'Amortisseurs de cuvette', severity: 'majeur' },
      { key: 'gai_guides', label: 'Guides, graissage, fixations', severity: 'majeur' },
      { key: 'gai_fins', label: 'Fins de course et contacts de gaine', severity: 'critique' },
    ],
  },
  {
    key: 'securites',
    label: 'Sécurités',
    icon: 'parachute',
    items: [
      { key: 'sec_parachute', label: 'Parachute : état, fonctionnement', severity: 'critique' },
      { key: 'sec_limiteur', label: 'Limiteur de vitesse', severity: 'critique' },
      { key: 'sec_stop', label: 'Boutons d’arrêt / contacts de sécurité', severity: 'critique' },
    ],
  },
  {
    key: 'cables',
    label: 'Câbles',
    icon: 'cable',
    items: [
      { key: 'cab_cables', label: 'Câbles / suspentes : usure, brins cassés', severity: 'critique' },
      { key: 'cab_poulie', label: 'Poulie de traction : gorges', severity: 'majeur' },
    ],
  },
  {
    key: 'urgence',
    label: 'Appel d’urgence',
    icon: 'phone',
    items: [
      { key: 'urg_liaison', label: 'Liaison phonique bidirectionnelle', severity: 'critique' },
      { key: 'urg_batterie', label: 'Alimentation de secours', severity: 'majeur' },
    ],
  },
]

export const ALL_ITEMS: CheckItem[] = ZONES.flatMap((z) => z.items)
export const itemByKey = (key: string) => ALL_ITEMS.find((i) => i.key === key)

export const MEASURES = [
  { key: 'courant', label: 'Courant moteur', unit: 'A' },
  { key: 'isolement', label: 'Isolement', unit: 'MΩ' },
  { key: 'precision', label: 'Précision d’arrêt', unit: 'mm' },
]

export const COMMON_PARTS = [
  'Galet de porte palière',
  'Patin de porte',
  'Contacteur',
  'Garniture de frein',
  'Graisse guides',
  'Lampe cabine',
  'Bouton de palier',
  'Batterie de secours',
]

// délai de levée d'un défaut selon gravité (jours)
export const DEFECT_DELAY: Record<Severity, number> = { critique: 7, majeur: 30, mineur: 90 }
