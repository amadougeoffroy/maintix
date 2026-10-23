import type { State } from './types'
import { addDays, today, weekStart } from './util'

export function seed(): State {
  const t = today()
  const ws = weekStart(t)
  return {
    session: { role: null, techId: null, clientId: null },
    clients: [
      { id: 'c1', name: 'Syndic Résidence Les Lilas', kind: 'syndic', contact: 'Mme Bernard', email: 'syndic.lilas@example.com', phone: '01 23 45 67 89' },
      { id: 'c2', name: 'Habitat Abidjan Bailleur', kind: 'bailleur', contact: 'M. Diallo', email: 'patrimoine@habitat-abidjan.example', phone: '+225 27 00 00 00 01' },
      { id: 'c3', name: 'Hôtel du Parc', kind: 'erp', contact: 'M. Lefèvre', email: 'direction@hotel-parc.example', phone: '04 70 00 00 00' },
    ],
    sites: [
      { id: 's1', clientId: 'c1', name: 'Les Lilas – Bât. A', address: 'Rue des Jardins, Cocody, Abidjan', access: 'Digicode 4521 · clé machinerie chez la gardienne (loge RDC)', risks: 'Machinerie en toiture : accès par échelle. Gaine peu profonde (cuvette 1,0 m).' },
      { id: 's2', clientId: 'c1', name: 'Les Lilas – Bât. B', address: 'Rue des Jardins (bât. B), Cocody, Abidjan', access: 'Digicode 4521 · local technique au sous-sol, clé au bâtiment A', risks: 'Sous-sol sans réseau mobile.' },
      { id: 's3', clientId: 'c2', name: 'Tour Habitat – 18 étages', address: 'Boulevard de la Paix, Plateau, Abidjan', access: 'Gardien sur place 7h–19h. Badge technicien à retirer.', risks: 'Travail en hauteur en machinerie haute. Deux ascenseurs, ne jamais les arrêter ensemble.' },
      { id: 's4', clientId: 'c3', name: 'Hôtel du Parc', address: 'Place du Parc, Marcory, Abidjan', access: 'Accueil hôtel, demander M. Lefèvre.', risks: 'Clients dans les étages : intervention en horaires creux.' },
    ],
    elevators: [
      { id: 'e1', siteId: 's1', label: 'Ascenseur A1', brand: 'Schindler', model: '3300', serial: 'SCH-3300-4412', year: 2004, loadKg: 630, stops: 7, machineRoom: 'haut', status: 'ok', lastVisit: addDays(t, -28), compliance: [{ id: 'cp1', kind: 'controle_technique', label: 'Contrôle technique périodique', due: addDays(t, 20), intervalMonths: 60 }, { id: 'cp2', kind: 'assurance', label: 'Assurance ascenseur', due: addDays(t, 200), intervalMonths: 12 }] },
      { id: 'e2', siteId: 's2', label: 'Ascenseur B1', brand: 'Kone', model: 'MonoSpace', serial: 'KON-MS-1188', year: 2012, loadKg: 450, stops: 5, machineRoom: 'sans local', status: 'ok', lastVisit: addDays(t, -35), compliance: [{ id: 'cp3', kind: 'assurance', label: 'Assurance ascenseur', due: addDays(t, -5), intervalMonths: 12 }] },
      { id: 'e3', siteId: 's3', label: 'Ascenseur Nord', brand: 'Otis', model: 'Gen2', serial: 'OTI-G2-7731', year: 2009, loadKg: 1000, stops: 18, machineRoom: 'haut', status: 'ok', lastVisit: addDays(t, -12), compliance: [{ id: 'cp4', kind: 'controle_technique', label: 'Contrôle technique périodique', due: addDays(t, 100), intervalMonths: 60 }] },
      { id: 'e4', siteId: 's3', label: 'Ascenseur Sud', brand: 'Otis', model: 'Gen2', serial: 'OTI-G2-7732', year: 2009, loadKg: 1000, stops: 18, machineRoom: 'haut', status: 'panne', lastVisit: addDays(t, -40) },
      { id: 'e5', siteId: 's4', label: 'Ascenseur principal', brand: 'ThyssenKrupp', model: 'Evolution', serial: 'TKE-EV-2210', year: 1998, loadKg: 800, stops: 6, machineRoom: 'bas', status: 'ok', lastVisit: addDays(t, -70) },
    ],
    techs: [
      { id: 't1', name: 'Moussa Traoré', role: 'tech', certs: [{ label: 'Habilitation électrique B2V', expires: addDays(t, 300) }, { label: 'Travail en hauteur', expires: addDays(t, 120) }] },
      { id: 't2', name: 'Lucas Martin', role: 'tech', certs: [{ label: 'Habilitation électrique B2V', expires: addDays(t, 20) }, { label: 'Travail en hauteur', expires: addDays(t, -10) }] },
      { id: 't3', name: 'Hélène Roux', role: 'bureau', certs: [] },
    ],
    contracts: [
      { id: 'k1', clientId: 'c1', elevatorIds: ['e1', 'e2'], periodicityMonths: 1, priceMonthly: 120000, start: addDays(t, -400), indexation: 3, slaResponseHours: 4, slaTrappedMinutes: 60 },
      { id: 'k2', clientId: 'c2', elevatorIds: ['e3', 'e4'], periodicityMonths: 1, priceMonthly: 280000, start: addDays(t, -800), indexation: 2.5, slaResponseHours: 2, slaTrappedMinutes: 45 },
      { id: 'k3', clientId: 'c3', elevatorIds: ['e5'], periodicityMonths: 2, priceMonthly: 65000, start: addDays(t, -200), indexation: 3 },
    ],
    onCall: [
      { weekStart: ws, techId: 't1' },
      { weekStart: addDays(ws, 7), techId: 't2' },
      { weekStart: addDays(ws, 14), techId: 't1' },
    ],
    jobs: [
      { id: 'j1', type: 'entretien', elevatorId: 'e1', techId: 't1', date: t, status: 'planifiee', createdAt: addDays(t, -5) + 'T08:00:00Z', timeline: [] },
      { id: 'j2', type: 'entretien', elevatorId: 'e2', techId: 't1', date: t, status: 'planifiee', createdAt: addDays(t, -5) + 'T08:00:00Z', timeline: [] },
      { id: 'j3', type: 'depannage', elevatorId: 'e4', techId: 't1', date: t, status: 'en_route', description: 'Porte palière du 9e qui ne se ferme plus.', reporter: 'Gardien', trapped: false, createdAt: new Date().toISOString(), timeline: [{ at: new Date(Date.now() - 3600_000).toISOString(), label: 'Signalement reçu' }, { at: new Date(Date.now() - 3000_000).toISOString(), label: 'Technicien d’astreinte alerté' }] },
      { id: 'j4', type: 'entretien', elevatorId: 'e5', techId: 't2', date: addDays(t, 2), status: 'planifiee', createdAt: addDays(t, -5) + 'T08:00:00Z', timeline: [] },
      { id: 'j5', type: 'entretien', elevatorId: 'e3', techId: null, date: addDays(t, 4), status: 'planifiee', createdAt: addDays(t, -5) + 'T08:00:00Z', timeline: [] },
    ],
    defects: [
      { id: 'd1', elevatorId: 'e4', origin: 'controle', title: 'Contrôle technique : protection des câbles de la machinerie à reprendre', severity: 'majeur', due: addDays(t, 14), status: 'ouvert' },
      { id: 'd2', elevatorId: 'e5', origin: 'controle', title: 'Contrôle technique : éclairage de secours cabine défaillant', severity: 'critique', due: addDays(t, -3), status: 'ouvert' },
      { id: 'd3', elevatorId: 'e1', origin: 'visite', title: 'Galets de porte palière 3e étage usés', severity: 'mineur', due: addDays(t, 60), status: 'ouvert' },
    ],
    quotes: [],
    invoices: [],
    stock: [
      { id: 'st1', name: 'Galet de porte palière', ref: 'GP-100', unit: 'pièce', minQty: 4, unitCost: 18000, supplier: 'Pièces Ascenseurs CI', createdAt: addDays(t, -90) },
      { id: 'st2', name: 'Patin de porte', ref: 'PP-210', unit: 'pièce', minQty: 6, unitCost: 6500, supplier: 'Pièces Ascenseurs CI', createdAt: addDays(t, -90) },
      { id: 'st3', name: 'Contacteur', ref: 'CT-24V', unit: 'pièce', minQty: 3, unitCost: 22000, supplier: 'Électro Abidjan', createdAt: addDays(t, -90) },
      { id: 'st4', name: 'Garniture de frein', ref: 'GF-350', unit: 'jeu', minQty: 2, unitCost: 45000, supplier: 'Électro Abidjan', createdAt: addDays(t, -90) },
    ],
    stockMoves: [
      { id: 'sm1', itemId: 'st1', delta: 12, reason: 'inventaire', at: addDays(t, -90) + 'T08:00:00.000Z', note: 'Stock initial' },
      { id: 'sm2', itemId: 'st2', delta: 20, reason: 'inventaire', at: addDays(t, -90) + 'T08:00:00.000Z', note: 'Stock initial' },
      { id: 'sm3', itemId: 'st3', delta: 5, reason: 'inventaire', at: addDays(t, -90) + 'T08:00:00.000Z', note: 'Stock initial' },
      { id: 'sm4', itemId: 'st4', delta: 3, reason: 'inventaire', at: addDays(t, -90) + 'T08:00:00.000Z', note: 'Stock initial' },
      { id: 'sm5', itemId: 'st1', delta: -9, reason: 'sortie', at: addDays(t, -30) + 'T09:00:00.000Z', note: 'Chantier Tour Habitat' },
      { id: 'sm6', itemId: 'st4', delta: -1, reason: 'sortie', at: addDays(t, -20) + 'T09:00:00.000Z', note: 'Remplacement Hôtel du Parc' },
    ],
    settings: [{ id: 'org', legalName: 'Ascenseurs Démo SAS', address: 'Zone industrielle de Yopougon, Abidjan', rccm: 'CI-ABJ-2019-B-12345', taxId: '1234567 A', taxRegime: 'Réel normal', bankDetails: 'RIB CI000 01234 012345678901 23 · Wave 07 00 00 00 00', email: 'contact@demo.example', phone: '+225 27 00 00 00 00', legalFooter: 'Tout retard de paiement entraîne l’application de pénalités de retard à compter du lendemain de la date d’échéance.', paymentDays: 30, vatRate: 18 }],
  }
}

export function emptyState(): State {
  return { session: { role: null, techId: null, clientId: null }, clients: [], sites: [], elevators: [], techs: [], contracts: [], onCall: [], jobs: [], defects: [], quotes: [], invoices: [], settings: [], stock: [], stockMoves: [] }
}

/** Données de démonstration avec des identifiants uniques (évite toute collision entre organisations). */
export function remappedSeed(newId: (prefix: string) => string): State {
  const base = seed()
  let json = JSON.stringify(base)
  const ids = new Set<string>()
  for (const col of ['clients', 'sites', 'elevators', 'techs', 'contracts', 'jobs', 'defects', 'quotes', 'invoices', 'stock', 'stockMoves'] as const) for (const x of base[col]) ids.add(x.id)
  const map = new Map([...ids].map((id) => [id, newId(id.replace(/\d+$/, ''))] as const))
  for (const [id, fresh] of map) json = json.split(`"${id}"`).join(`"${fresh}"`)
  return JSON.parse(json) as State
}
