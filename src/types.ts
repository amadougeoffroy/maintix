export type Role = 'tech' | 'bureau'
export type ClientKind = 'syndic' | 'bailleur' | 'erp' | 'entreprise'
export type ItemStatus = 'ok' | 'watch' | 'ko'
export type JobType = 'entretien' | 'depannage' | 'travaux' | 'controle'
export type JobStatus = 'planifiee' | 'en_route' | 'sur_place' | 'terminee'
export type Severity = 'mineur' | 'majeur' | 'critique'

export interface Client {
  id: string
  name: string
  kind: ClientKind
  contact: string
  email: string
  phone: string
}
export interface Site {
  id: string
  clientId: string
  name: string
  address: string
  access: string
  risks: string
}
export interface Elevator {
  id: string
  siteId: string
  label: string
  brand: string
  model: string
  serial: string
  year: number
  loadKg: number
  stops: number
  machineRoom: 'haut' | 'bas' | 'sans local'
  status: 'ok' | 'panne' | 'arret'
  lastVisit?: string
}
export interface Certification {
  label: string
  expires: string
}
export interface Tech {
  id: string
  name: string
  role: Role
  certs: Certification[]
}
export interface PriceChange {
  date: string
  from: number
  to: number
  rate: number
}
export interface Contract {
  id: string
  clientId: string
  elevatorIds: string[]
  periodicityMonths: number
  priceMonthly: number
  start: string
  indexation: number
  /** durée d'un terme en mois (12 par défaut) */
  termMonths?: number
  /** reconduction tacite (oui par défaut) */
  autoRenew?: boolean
  /** préavis de résiliation en mois (3 par défaut) */
  noticeMonths?: number
  /** nombre de renouvellements manuels (contrats sans reconduction tacite) */
  renewedTerms?: number
  /** dernière date d'indexation appliquée */
  lastIndexed?: string
  priceHistory?: PriceChange[]
  terminatedAt?: string
}
export interface OnCallSlot {
  weekStart: string
  techId: string
}
export interface TimelineEntry {
  at: string
  label: string
}
export interface ChecklistAnswer {
  status: ItemStatus
  note?: string
  photos: string[]
}
export interface Part {
  name: string
  qty: number
}
export interface Signature {
  absent: boolean
  dataUrl?: string
  name?: string
  role?: string
  photo?: string
  at: string
}
export interface VisitData {
  lockedOut: boolean
  checklist: Record<string, ChecklistAnswer>
  measures: Record<string, string>
  emergencyCallTest: 'ok' | 'ko' | null
  parts: Part[]
  minutes: number
  notes: string
  signature?: Signature
  summary?: string
  hash?: string
  finishedAt?: string
  sentAt?: string
}
export interface Job {
  id: string
  type: JobType
  elevatorId: string
  techId: string | null
  date: string
  status: JobStatus
  trapped?: boolean
  description?: string
  reporter?: string
  createdAt: string
  timeline: TimelineEntry[]
  visit?: VisitData
}
export interface Defect {
  id: string
  elevatorId: string
  origin: 'visite' | 'controle' | 'signalement'
  title: string
  severity: Severity
  due: string
  status: 'ouvert' | 'devis' | 'leve'
  jobId?: string
  itemKey?: string
}
export interface QuoteLine {
  label: string
  qty: number
  unit: number
}
export interface Quote {
  id: string
  clientId: string
  elevatorId: string
  defectId?: string
  lines: QuoteLine[]
  status: 'brouillon' | 'envoye' | 'accepte'
  createdAt: string
}
export interface OrgSettings {
  id: 'org'
  legalName: string
  address: string
  siret: string
  vatNumber: string
  iban: string
  email: string
  phone: string
  /** mentions de pied de facture (pénalités, indemnité de recouvrement…) */
  legalFooter: string
  /** délai de paiement en jours */
  paymentDays: number
  vatRate: number
}
export type InvoiceStatus = 'brouillon' | 'emise' | 'payee' | 'annulee'
export interface Invoice {
  id: string
  /** attribué à l'émission, de façon séquentielle et sans trou : FAC-AAAA-NNNN */
  number?: string
  clientId: string
  kind: 'contrat' | 'devis' | 'libre'
  contractId?: string
  quoteId?: string
  periodStart?: string
  periodEnd?: string
  lines: QuoteLine[]
  vatRate: number
  status: InvoiceStatus
  createdAt: string
  issuedAt?: string
  dueAt?: string
  paidAt?: string
  paymentMethod?: string
  note?: string
}
export interface State {
  session: { role: Role | null; techId: string | null; clientId: string | null; isAdmin?: boolean; fullName?: string; orgName?: string }
  clients: Client[]
  sites: Site[]
  elevators: Elevator[]
  techs: Tech[]
  contracts: Contract[]
  onCall: OnCallSlot[]
  jobs: Job[]
  defects: Defect[]
  quotes: Quote[]
  invoices: Invoice[]
  settings: OrgSettings[]
}
