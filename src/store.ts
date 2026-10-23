import { useSyncExternalStore } from 'react'
import { get, set } from 'idb-keyval'
import { emptyState, remappedSeed, seed } from './seed'
import { sealPayload } from '../shared/canonical'
import { issueLocal } from './invoicing'
import { ALL_ITEMS, DEFECT_DELAY, itemByKey } from './checklist'
import { addDays, addMonths, daysBetween, iso, sha256, today, uid } from './util'
import type { ParcRow } from './importer'
import { movesForVisit } from './stock'
import { completeItem } from './compliance'
import type {
  ChecklistAnswer, Client, ComplianceItem, Contract, Invoice, OrgSettings, Site, Defect, Elevator, Job, JobType, Quote, QuoteLine, Role, Severity, State, StockItem, Tech, VisitData,
} from './types'

/** `server` : l'API répond (vraie base, comptes, synchro). Sinon mode local de démonstration. */
/** server : API joignable et utilisée ; demo : mode démonstration (données locales) ; explicitDemo : choisi par l'utilisateur ; unreachable : serveur attendu mais injoignable */
export const runtime = { server: false, demo: false, explicitDemo: false, unreachable: false }
const storeKey = () => (runtime.server ? 'cabine-state-server-v1' : 'cabine-state-v2')
let state: State = seed()

export interface SyncOp {
  collection: string
  id: string
  data: Record<string, unknown> | null
}
const COLLECTIONS = ['clients', 'sites', 'elevators', 'techs', 'contracts', 'onCall', 'jobs', 'defects', 'quotes', 'invoices', 'settings', 'stock', 'stockMoves'] as const
type Col = (typeof COLLECTIONS)[number]
const docId = (col: Col, item: unknown) => String((item as Record<string, unknown>)[col === 'onCall' ? 'weekStart' : 'id'])
let syncHook: ((ops: SyncOp[]) => void) | null = null
export const setSyncHook = (h: ((ops: SyncOp[]) => void) | null) => void (syncHook = h)

/** Compare deux états et liste les documents créés, modifiés ou supprimés (comparaison par référence). */
export function diffStates(prev: State, next: State): SyncOp[] {
  const ops: SyncOp[] = []
  for (const col of COLLECTIONS) {
    const a = prev[col] as unknown[]
    const b = next[col] as unknown[]
    if (a === b) continue
    const before = new Map(a.map((x) => [docId(col, x), x]))
    const seen = new Set<string>()
    for (const item of b) {
      const id = docId(col, item)
      seen.add(id)
      if (before.get(id) !== item) ops.push({ collection: col, id, data: item as Record<string, unknown> })
    }
    for (const id of before.keys()) if (!seen.has(id)) ops.push({ collection: col, id, data: null })
  }
  return ops
}

/** Applique des documents reçus du serveur sans les renvoyer. */
export function applyRemoteDocs(docs: { collection: string; id: string; data: Record<string, unknown> | null; deleted: boolean }[]) {
  const next: Record<string, unknown[]> = {}
  const index: Record<string, Map<string, number>> = {}
  for (const col of COLLECTIONS) {
    next[col] = [...(state[col] as unknown[])]
    index[col] = new Map(next[col].map((x, i) => [docId(col, x), i]))
  }
  const removed: Record<string, Set<string>> = {}
  for (const d of docs) {
    const col = d.collection as Col
    if (!next[col]) continue
    const i = index[col].get(d.id)
    if (d.deleted || !d.data) {
      if (i !== undefined) (removed[col] ??= new Set()).add(d.id)
    } else if (i !== undefined) next[col][i] = d.data
    else { index[col].set(d.id, next[col].length); next[col].push(d.data) }
  }
  for (const col of COLLECTIONS) if (removed[col]) next[col] = next[col].filter((x) => !removed[col].has(docId(col, x)))
  state = { ...state, ...next } as State
  emit()
}

const listeners = new Set<() => void>()
let saveTimer: ReturnType<typeof setTimeout> | undefined

const DEMO_SESSION = 'cabine-demo-session'
/** Mode démo : la session s'écrit tout de suite (synchrone) pour survivre à un rechargement immédiat ; les données suivent en différé. */
function persistDemoSession() {
  if (runtime.server) return
  try { localStorage.setItem(DEMO_SESSION, JSON.stringify(state.session)) } catch { /* stockage indisponible */ }
}

function emit() {
  persistDemoSession()
  listeners.forEach((l) => l())
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    set(storeKey(), state).catch(() => {})
  }, 300)
}
function update(fn: (s: State) => State) {
  const prev = state
  state = fn(state)
  emit()
  if (syncHook) syncHook(diffStates(prev, state))
}

export async function loadStore() {
  try {
    const saved = await get<State>(storeKey())
    if (saved) state = { ...emptyState(), ...saved } // complète les collections ajoutées depuis l'enregistrement (stock, mouvements…)
    else if (runtime.server) state = emptyState()
    if (!runtime.server) {
      try { const sess = localStorage.getItem(DEMO_SESSION); if (sess) state = { ...state, session: JSON.parse(sess) } } catch { /* ignoré */ }
    }
  } catch {
    /* stockage indisponible : on garde la démo en mémoire */
  }
}
export function useData(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}
export const getState = () => state
export const setStateForTests = (s: State) => {
  state = s
}

export const emptyVisit = (): VisitData => ({
  lockedOut: false,
  checklist: {},
  measures: {},
  emergencyCallTest: null,
  parts: [],
  minutes: 0,
  notes: '',
})

/* ---------- sélecteurs purs ---------- */
export const byId = <T extends { id: string }>(list: T[], id: string | null | undefined) =>
  list.find((x) => x.id === id)

export function certStatus(tech: Tech, on = today()) {
  const bad = tech.certs.filter((c) => c.expires < on)
  const soon = tech.certs.filter((c) => c.expires >= on && daysBetween(on, c.expires) <= 30)
  return { ok: bad.length === 0, expired: bad, soon }
}

export function currentOnCall(s: State, on = today()) {
  const ws = on
  const slot = [...s.onCall].sort((a, b) => b.weekStart.localeCompare(a.weekStart)).find((o) => o.weekStart <= ws)
  return slot ? byId(s.techs, slot.techId) : undefined
}

export function contractFor(s: State, elevatorId: string) {
  return s.contracts.find((c) => c.elevatorIds.includes(elevatorId))
}

export function lastFinishedVisit(s: State, elevatorId: string, excludeJobId?: string) {
  return s.jobs
    .filter((j) => j.elevatorId === elevatorId && j.status === 'terminee' && j.visit && j.id !== excludeJobId)
    .sort((a, b) => (b.visit!.finishedAt ?? '').localeCompare(a.visit!.finishedAt ?? ''))[0]
}

export function healthScore(s: State, elevatorId: string, on = today()) {
  const el = byId(s.elevators, elevatorId)
  if (!el) return 0
  let score = 100
  for (const d of s.defects.filter((d) => d.elevatorId === elevatorId && d.status !== 'leve')) {
    score -= d.severity === 'critique' ? 20 : d.severity === 'majeur' ? 10 : 4
    if (d.due < on) score -= 10
  }
  const contract = contractFor(s, elevatorId)
  if (el.lastVisit && contract && daysBetween(el.lastVisit, on) > contract.periodicityMonths * 31 + 7) score -= 10
  if (on.slice(0, 4) > String(el.year + 25)) score -= 5
  const since = addDays(on, -90)
  score -= 5 * s.jobs.filter((j) => j.elevatorId === elevatorId && j.type === 'depannage' && j.date >= since).length
  if (el.status !== 'ok') score -= 15
  return Math.max(0, Math.min(100, score))
}
export const healthLevel = (score: number) => (score >= 80 ? 'ok' : score >= 55 ? 'warn' : 'bad')

export function measureDrift(prev: string | undefined, current: string | undefined, threshold = 0.2) {
  const a = parseFloat((prev ?? '').replace(',', '.'))
  const b = parseFloat((current ?? '').replace(',', '.'))
  if (!isFinite(a) || !isFinite(b) || a === 0) return null
  const ratio = (b - a) / Math.abs(a)
  return Math.abs(ratio) >= threshold ? ratio : null
}

export function buildSummary(s: State, job: Job): string {
  const v = job.visit
  const el = byId(s.elevators, job.elevatorId)
  if (!v || !el) return ''
  if (job.type === 'depannage') {
    const out = [`Dépannage de ${el.label}${job.trapped ? ' (personne bloquée)' : ''}.`]
    if (job.description) out.push(`Motif : ${job.description}`)
    out.push(v.notes.trim() ? `Constat et action : ${v.notes.trim()}` : 'Aucun détail saisi.')
    if (v.parts.length) out.push(`Pièces remplacées : ${v.parts.map((p) => `${p.qty} × ${p.name}`).join(', ')}.`)
    return out.join(' ')
  }
  const answers = Object.entries(v.checklist).filter(([k]) => k !== 'diag')
  const ko = answers.filter(([, a]) => a.status === 'ko')
  const watch = answers.filter(([, a]) => a.status === 'watch')
  const label = (k: string) => itemByKey(k)?.label ?? k
  const parts: string[] = []
  parts.push(`Visite d'entretien de ${el.label} : ${answers.length} point(s) contrôlé(s) sur ${ALL_ITEMS.length}.`)
  if (ko.length) parts.push(`Défauts constatés : ${ko.map(([k]) => label(k)).join(' ; ')}.`)
  if (watch.length) parts.push(`À surveiller : ${watch.map(([k]) => label(k)).join(' ; ')}.`)
  if (!ko.length && !watch.length) parts.push('Aucune anomalie constatée.')
  if (v.parts.length) parts.push(`Pièces remplacées : ${v.parts.map((p) => `${p.qty} × ${p.name}`).join(', ')}.`)
  parts.push(`Test de l'appel d'urgence : ${v.emergencyCallTest === 'ok' ? 'conforme' : v.emergencyCallTest === 'ko' ? 'NON conforme' : 'non réalisé'}.`)
  if (v.notes.trim()) parts.push(`Remarques : ${v.notes.trim()}`)
  return parts.join(' ')
}

/* ---------- actions ---------- */
export const actions = {
  setSession(session: State['session']) {
    update((s) => ({ ...s, session }))
  },
  /** Vide les données locales (déconnexion / changement de compte en mode serveur). */
  clearLocal() {
    state = emptyState()
    emit()
  },
  /** Mode serveur : remplit l'organisation avec des données de démonstration (identifiants uniques). */
  loadDemo() {
    const demo = remappedSeed((p) => uid(p))
    update((s) => ({ ...s, clients: demo.clients, sites: demo.sites, elevators: demo.elevators, techs: demo.techs, contracts: demo.contracts, onCall: demo.onCall, jobs: demo.jobs, defects: demo.defects, quotes: demo.quotes, stock: demo.stock, stockMoves: demo.stockMoves, settings: s.settings.length ? s.settings : demo.settings }))
  },
  login(role: Role, techId: string | null) {
    update((s) => ({ ...s, session: { ...s.session, role, techId } }))
  },
  loginClient(clientId: string) {
    update((s) => ({ ...s, session: { role: null, techId: null, clientId } }))
  },
  logout() {
    update((s) => ({ ...s, session: { role: null, techId: null, clientId: null } }))
  },
  resetDemo() {
    state = seed()
    emit()
  },

  /** Échéances réglementaires d'un appareil : ajout ou modification. */
  upsertCompliance(elevatorId: string, item: ComplianceItem) {
    update((s) => ({
      ...s,
      elevators: s.elevators.map((e) => {
        if (e.id !== elevatorId) return e
        const list = e.compliance ?? []
        return { ...e, compliance: list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item] }
      }),
    }))
  },
  removeCompliance(elevatorId: string, itemId: string) {
    update((s) => ({ ...s, elevators: s.elevators.map((e) => (e.id === elevatorId ? { ...e, compliance: (e.compliance ?? []).filter((x) => x.id !== itemId) } : e)) }))
  },
  /** Valide une échéance accomplie : la suivante est programmée (ou l'échéance est soldée si elle n'est pas périodique). */
  completeCompliance(elevatorId: string, itemId: string) {
    update((s) => ({
      ...s,
      elevators: s.elevators.map((e) => {
        if (e.id !== elevatorId) return e
        return { ...e, compliance: (e.compliance ?? []).flatMap((x) => (x.id === itemId ? [completeItem(x, today())].filter((y): y is ComplianceItem => !!y) : [x])) }
      }),
    }))
  },
  /** Nouvelle référence de stock ; une quantité initiale crée un mouvement d'inventaire. */
  addStockItem(i: Omit<StockItem, 'id' | 'createdAt'>, initialQty = 0) {
    const id = uid('st')
    const at = iso(new Date())
    update((s) => ({
      ...s,
      stock: [...s.stock, { ...i, id, createdAt: today() }],
      stockMoves: initialQty > 0 ? [...s.stockMoves, { id: uid('sm'), itemId: id, delta: initialQty, reason: 'inventaire', at, note: 'Stock initial' }] : s.stockMoves,
    }))
    return id
  },
  updateStockItem(id: string, patch: Partial<StockItem>) {
    update((s) => ({ ...s, stock: s.stock.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
  },
  /** Mouvement de stock : entrée (achat), sortie, ou inventaire (ajuste le niveau à la quantité comptée). */
  addStockMove(itemId: string, kind: 'achat' | 'sortie' | 'inventaire', qty: number, note?: string) {
    update((s) => {
      const level = s.stockMoves.filter((m) => m.itemId === itemId).reduce((t, m) => t + m.delta, 0)
      const delta = kind === 'achat' ? Math.abs(qty) : kind === 'sortie' ? -Math.abs(qty) : qty - level
      if (!delta) return s
      return { ...s, stockMoves: [...s.stockMoves, { id: uid('sm'), itemId, delta, reason: kind === 'inventaire' ? 'inventaire' : kind, at: iso(new Date()), ...(note?.trim() ? { note: note.trim() } : {}), ...(s.session.techId ? { by: s.session.techId } : {}) }] }
    })
  },
  setStatus(jobId: string, status: Job['status']) {
    const labels: Record<string, string> = {
      en_route: 'Technicien en route',
      sur_place: 'Technicien sur place',
      terminee: 'Intervention terminée',
    }
    update((s) => ({
      ...s,
      jobs: s.jobs.map((j) =>
        j.id !== jobId
          ? j
          : {
              ...j,
              status,
              visit: status === 'sur_place' && !j.visit ? emptyVisit() : j.visit,
              timeline: labels[status] ? [...j.timeline, { at: iso(new Date()), label: labels[status] }] : j.timeline,
            },
      ),
    }))
  },

  updateVisit(jobId: string, patch: Partial<VisitData>) {
    update((s) => ({
      ...s,
      jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, visit: { ...(j.visit ?? emptyVisit()), ...patch } } : j)),
    }))
  },
  answer(jobId: string, key: string, patch: Partial<ChecklistAnswer>) {
    update((s) => ({
      ...s,
      jobs: s.jobs.map((j) => {
        if (j.id !== jobId) return j
        const v = j.visit ?? emptyVisit()
        const prev = v.checklist[key] ?? { status: 'ok' as const, photos: [] }
        return { ...j, visit: { ...v, checklist: { ...v.checklist, [key]: { ...prev, ...patch } } } }
      }),
    }))
  },

  createJob(input: { type: JobType; elevatorId: string; techId: string | null; date: string; description?: string; trapped?: boolean; reporter?: string }) {
    const job: Job = {
      id: uid('j'),
      type: input.type,
      elevatorId: input.elevatorId,
      techId: input.techId,
      date: input.date,
      status: 'planifiee',
      description: input.description,
      trapped: input.trapped,
      reporter: input.reporter,
      createdAt: iso(new Date()),
      timeline: [],
    }
    update((s) => ({ ...s, jobs: [...s.jobs, job] }))
    return job
  },
  assign(jobId: string, techId: string | null, date?: string) {
    update((s) => ({
      ...s,
      jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, techId, date: date ?? j.date } : j)),
    }))
  },

  /** Signalement d'une panne (usager, QR public) : crée un dépannage affecté à l'astreinte. */
  report(input: { elevatorId: string; description: string; trapped: boolean; reporter: string }) {
    const on = currentOnCall(state)
    const now = iso(new Date())
    const job: Job = {
      id: uid('j'),
      type: 'depannage',
      elevatorId: input.elevatorId,
      techId: on?.id ?? null,
      date: today(),
      status: 'planifiee',
      description: input.description,
      trapped: input.trapped,
      reporter: input.reporter || 'Usager',
      createdAt: now,
      timeline: [
        { at: now, label: input.trapped ? 'Signalement reçu : PERSONNE BLOQUÉE' : 'Signalement reçu' },
        ...(on ? [{ at: now, label: `Astreinte alertée : ${on.name}` }] : []),
      ],
    }
    update((s) => ({
      ...s,
      jobs: [...s.jobs, job],
      elevators: s.elevators.map((e) => (e.id === input.elevatorId ? { ...e, status: 'panne' } : e)),
    }))
    return job
  },

  addDefect(d: Omit<Defect, 'id' | 'status'>) {
    update((s) => ({ ...s, defects: [...s.defects, { ...d, id: uid('d'), status: 'ouvert' }] }))
  },
  setDefectStatus(id: string, status: Defect['status']) {
    update((s) => ({ ...s, defects: s.defects.map((d) => (d.id === id ? { ...d, status } : d)) }))
  },

  createQuote(input: { clientId: string; elevatorId: string; defectId?: string; lines: QuoteLine[] }) {
    const q: Quote = { id: uid('q'), ...input, status: 'brouillon', createdAt: iso(new Date()) }
    update((s) => ({
      ...s,
      quotes: [...s.quotes, q],
      defects: s.defects.map((d) => (d.id === input.defectId ? { ...d, status: 'devis' } : d)),
    }))
    return q
  },
  updateQuote(id: string, patch: Partial<Quote>) {
    update((s) => ({ ...s, quotes: s.quotes.map((q) => (q.id === id ? { ...q, ...patch } : q)) }))
  },

  setOnCall(weekStart: string, techId: string) {
    update((s) => ({
      ...s,
      onCall: [...s.onCall.filter((o) => o.weekStart !== weekStart), { weekStart, techId }],
    }))
  },
  addCert(techId: string, label: string, expires: string) {
    update((s) => ({
      ...s,
      techs: s.techs.map((t) => (t.id === techId ? { ...t, certs: [...t.certs, { label, expires }] } : t)),
    }))
  },
  addElevator(e: Omit<Elevator, 'id' | 'status'>) {
    const el: Elevator = { ...e, id: uid('e'), status: 'ok' }
    update((s) => ({ ...s, elevators: [...s.elevators, el] }))
    return el
  },
  markSent(jobId: string) {
    update((s) => ({
      ...s,
      jobs: s.jobs.map((j) => (j.id === jobId && j.visit ? { ...j, visit: { ...j.visit, sentAt: iso(new Date()) } } : j)),
    }))
  },

  upsertClient(c: Client) {
    update((s) => ({ ...s, clients: s.clients.some((x) => x.id === c.id) ? s.clients.map((x) => (x.id === c.id ? c : x)) : [...s.clients, c] }))
  },
  /** Refuse la suppression d'un client qui a encore des sites. */
  deleteClient(id: string): boolean {
    if (state.sites.some((x) => x.clientId === id)) return false
    update((s) => ({ ...s, clients: s.clients.filter((x) => x.id !== id), contracts: s.contracts.filter((k) => k.clientId !== id) }))
    return true
  },
  upsertSite(site: Site) {
    update((s) => ({ ...s, sites: s.sites.some((x) => x.id === site.id) ? s.sites.map((x) => (x.id === site.id ? site : x)) : [...s.sites, site] }))
  },
  deleteSite(id: string): boolean {
    if (state.elevators.some((e) => e.siteId === id)) return false
    update((s) => ({ ...s, sites: s.sites.filter((x) => x.id !== id) }))
    return true
  },
  upsertInvoice(inv: Invoice) {
    update((s) => ({ ...s, invoices: s.invoices.some((x) => x.id === inv.id) ? s.invoices.map((x) => (x.id === inv.id ? inv : x)) : [...s.invoices, inv] }))
  },
  /** Supprime un brouillon (une facture émise ne se supprime jamais). */
  deleteInvoice(id: string): boolean {
    const f = state.invoices.find((x) => x.id === id)
    if (!f || f.status !== 'brouillon') return false
    update((s) => ({ ...s, invoices: s.invoices.filter((x) => x.id !== id) }))
    return true
  },
  /** Émission en mode local (démo) : numérotation séquentielle sur les factures de cet appareil. */
  issueInvoiceLocal(id: string) {
    const f = state.invoices.find((x) => x.id === id)
    if (!f) return
    update((s) => ({ ...s, invoices: s.invoices.map((x) => (x.id === id ? issueLocal(f, s.invoices, s.settings[0]) : x)) }))
  },
  upsertSettings(settings: OrgSettings) {
    update((s) => ({ ...s, settings: [settings] }))
  },
  upsertContract(c: Contract) {
    update((s) => ({ ...s, contracts: s.contracts.some((x) => x.id === c.id) ? s.contracts.map((x) => (x.id === c.id ? c : x)) : [...s.contracts, c] }))
  },
  deleteContract(id: string) {
    update((s) => ({ ...s, contracts: s.contracts.filter((x) => x.id !== id) }))
  },
  updateElevator(id: string, patch: Partial<Elevator>) {
    update((s) => ({ ...s, elevators: s.elevators.map((e) => (e.id === id ? { ...e, ...patch } : e)) }))
  },
  /** Supprime un appareil seulement s'il n'a aucune intervention clôturée (traçabilité). */
  deleteElevator(id: string): boolean {
    if (state.jobs.some((j) => j.elevatorId === id && j.status === 'terminee')) return false
    update((s) => ({
      ...s,
      elevators: s.elevators.filter((e) => e.id !== id),
      jobs: s.jobs.filter((j) => j.elevatorId !== id),
      defects: s.defects.filter((d) => d.elevatorId !== id),
      quotes: s.quotes.filter((q) => q.elevatorId !== id),
      contracts: s.contracts.map((k) => ({ ...k, elevatorIds: k.elevatorIds.filter((x) => x !== id) })),
    }))
    return true
  },
  /** Annule une mission non commencée. */
  cancelJob(id: string): boolean {
    const j = state.jobs.find((x) => x.id === id)
    if (!j || j.status !== 'planifiee') return false
    update((s) => ({ ...s, jobs: s.jobs.filter((x) => x.id !== id) }))
    return true
  },
  /** Importe un parc : crée clients, sites et appareils manquants. Retourne le détail. */
  importParc(rows: ParcRow[]) {
    let clients = 0, sites = 0, elevators = 0
    update((s) => {
      const next = { ...s, clients: [...s.clients], sites: [...s.sites], elevators: [...s.elevators] }
      for (const r of rows) {
        let c = next.clients.find((x) => x.name.toLowerCase() === r.client.toLowerCase())
        if (!c) {
          c = { id: uid('c'), name: r.client, kind: 'syndic', contact: '', email: '', phone: '' }
          next.clients.push(c)
          clients++
        }
        let site = next.sites.find((x) => x.clientId === c!.id && x.name.toLowerCase() === r.site.toLowerCase())
        if (!site) {
          site = { id: uid('s'), clientId: c.id, name: r.site, address: r.address, access: r.access, risks: '' }
          next.sites.push(site)
          sites++
        }
        if (next.elevators.some((e) => e.siteId === site!.id && (e.serial === r.serial || (!r.serial && e.label === r.label)))) continue
        next.elevators.push({ id: uid('e'), siteId: site.id, label: r.label, brand: r.brand, model: r.model, serial: r.serial, year: r.year, loadKg: r.loadKg, stops: r.stops, machineRoom: r.machineRoom, status: 'ok' })
        elevators++
      }
      return next
    })
    return { clients, sites, elevators }
  },

  /** Clôture : résumé, défauts, sceau SHA-256, prochaine visite. */
  async finishJob(jobId: string, minutes?: number) {
    const job = state.jobs.find((j) => j.id === jobId)
    if (!job || job.status === 'terminee') return // une visite ne se clôture qu'une fois : le stock n'est déduit qu'une fois
    const v = job.visit ?? emptyVisit()
    const now = iso(new Date())
    const done: Job = {
      ...job,
      status: 'terminee',
      visit: { ...v, minutes: minutes ?? v.minutes, finishedAt: now },
      timeline: [...job.timeline, { at: now, label: 'Intervention terminée' }],
    }
    const summary = buildSummary(state, done)
    done.visit = { ...done.visit!, summary }
    const hash = await sha256(sealPayload({ id: done.id, elevatorId: done.elevatorId, visit: done.visit as unknown as Record<string, unknown> }))
    done.visit = { ...done.visit, hash }

    update((s) => {
      // défauts issus des points KO (dédoublonnés par appareil + point)
      const newDefects: Defect[] = []
      for (const [key, a] of Object.entries(v.checklist)) {
        if (a.status !== 'ko') continue
        const exists = s.defects.some((d) => d.elevatorId === job.elevatorId && d.itemKey === key && d.status !== 'leve')
        if (exists) continue
        const item = itemByKey(key)
        const sev: Severity = item?.severity ?? 'majeur'
        newDefects.push({
          id: uid('d'), elevatorId: job.elevatorId, origin: 'visite', title: `${item?.label ?? key}${a.note ? ` – ${a.note}` : ''}`,
          severity: sev, due: addDays(today(), DEFECT_DELAY[sev]), status: 'ouvert', jobId: job.id, itemKey: key,
        })
      }
      // un point repassé OK lève le défaut ouvert correspondant
      const fixedKeys = Object.entries(v.checklist).filter(([, a]) => a.status === 'ok').map(([k]) => k)
      const defects = s.defects.map((d) =>
        d.elevatorId === job.elevatorId && d.itemKey && fixedKeys.includes(d.itemKey) && d.status !== 'leve' ? { ...d, status: 'leve' as const } : d,
      )
      // prochaine visite selon le contrat
      const contract = contractFor(s, job.elevatorId)
      const jobs = s.jobs.map((j) => (j.id === jobId ? done : j))
      if (job.type === 'entretien' && contract) {
        const next = addMonths(today(), contract.periodicityMonths)
        const already = jobs.some((j) => j.elevatorId === job.elevatorId && j.type === 'entretien' && j.status !== 'terminee' && j.date >= today())
        if (!already) {
          jobs.push({ id: uid('j'), type: 'entretien', elevatorId: job.elevatorId, techId: job.techId, date: next, status: 'planifiee', createdAt: now, timeline: [] })
        }
      }
      // les pièces du stock utilisées pendant la visite sont déduites du stock
      const stockMoves = [...s.stockMoves, ...movesForVisit(s.stock, v.parts, job.id, now, () => uid('sm'), s.session.techId ?? undefined)]
      return {
        ...s,
        jobs,
        stockMoves,
        defects: [...defects, ...newDefects],
        elevators: s.elevators.map((e) =>
          e.id === job.elevatorId
            ? { ...e, lastVisit: today(), status: job.type === 'depannage' ? 'ok' : e.status }
            : e,
        ),
      }
    })
  },
}

export function visitReadiness(job: Job) {
  const v = job.visit
  const missing: string[] = []
  if (!v?.lockedOut) missing.push('Consignation de sécurité')
  if (job.type === 'entretien' && !v?.emergencyCallTest) missing.push('Test de l’appel d’urgence')
  const noPhoto = Object.entries(v?.checklist ?? {}).filter(([k, a]) => a.status === 'ko' && k !== 'diag' && a.photos.length === 0)
  if (noPhoto.length) missing.push(`Photo manquante sur ${noPhoto.length} défaut(s)`)
  if (!v?.signature) missing.push('Signature client ou « client absent »')
  return missing
}

/** Recalcule le sceau d'un rapport et le compare à celui enregistré à la clôture. */
export async function verifyJob(job: Job): Promise<boolean> {
  const v = job.visit
  if (!v?.hash || v.summary === undefined) return false
  return (await sha256(sealPayload({ id: job.id, elevatorId: job.elevatorId, visit: v as unknown as Record<string, unknown> }))) === v.hash
}
