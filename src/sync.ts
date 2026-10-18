import { feedback } from './feedback'
import { useSyncExternalStore } from 'react'
import { del, get, set } from 'idb-keyval'
import { api, ApiError, type PushResult, type RemoteDoc } from './api'
import { flushBlobs, wipeBlobs } from './files'
import { applyRemoteDocs, getState, setSyncHook, type SyncOp } from './store'

const OUTBOX_KEY = 'cabine-outbox-v1'
const CURSOR_KEY = 'cabine-cursor-v1'
const BATCH_BYTES = 3_000_000

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error' | 'unauthenticated'
interface Status {
  state: SyncState
  pending: number
  lastSync: number | null
  lastError: string | null
}

let status: Status = { state: 'idle', pending: 0, lastSync: null, lastError: null }
const listeners = new Set<() => void>()
const setStatus = (patch: Partial<Status>) => {
  status = { ...status, ...patch }
  listeners.forEach((l) => l())
}
export const useSyncStatus = () =>
  useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => status)
export const getSyncStatus = () => status

const keyOf = (o: { collection: string; id: string }) => `${o.collection}:${o.id}`
let outbox = new Map<string, SyncOp>()
let cursor = 0
let running = false
let rerun = false
let timer: ReturnType<typeof setTimeout> | undefined
let interval: ReturnType<typeof setInterval> | undefined
let active = false
let onUnauthenticated: (() => void) | undefined

const persist = () => set(OUTBOX_KEY, [...outbox.values()]).catch(() => {})

function schedule(delay = 500) {
  if (!active) return
  clearTimeout(timer)
  timer = setTimeout(() => void cycle(), delay)
}

export function enqueue(ops: SyncOp[]) {
  if (!active || !ops.length) return
  for (const o of ops) outbox.set(keyOf(o), o) // la dernière version d'un document remplace les précédentes
  setStatus({ pending: outbox.size })
  void persist()
  schedule()
}

function applyServerDocs(docs: RemoteDoc[]) {
  // un document avec une modification locale en attente n'est pas écrasé : elle sera poussée puis fera foi
  const fresh = docs.filter((d) => !outbox.has(keyOf(d)))
  if (fresh.length) applyRemoteDocs(fresh)
}

async function flush() {
  while (outbox.size) {
    const batch: SyncOp[] = []
    let bytes = 0
    for (const op of outbox.values()) {
      const size = JSON.stringify(op).length
      if (batch.length && (bytes + size > BATCH_BYTES || batch.length >= 100)) break
      batch.push(op)
      bytes += size
    }
    const { results } = await api.push(batch.map((o) => ({ collection: o.collection, id: o.id, data: o.data })))
    const rejected: RemoteDoc[] = []
    results.forEach((r: PushResult, i) => {
      const sent = batch[i]
      // si l'utilisateur a modifié le document entre-temps, la nouvelle version reste en file
      if (outbox.get(keyOf(sent)) === sent) outbox.delete(keyOf(sent))
      if (!r.ok && r.doc) rejected.push({ collection: r.collection, id: r.id, data: r.doc.data, deleted: r.doc.deleted, seq: r.doc.seq })
      if (!r.ok) {
        setStatus({ lastError: `Modification refusée (${r.reason ?? 'inconnue'}) : ${r.collection}` })
        feedback.toast('Une modification a été refusée par le serveur ; la version du serveur a été restaurée.', 'error')
      }
    })
    if (rejected.length) applyRemoteDocs(rejected) // la version serveur fait foi
    setStatus({ pending: outbox.size })
    await persist()
  }
}

async function pullAll() {
  for (;;) {
    const page = await api.pull(cursor)
    applyServerDocs(page.docs)
    cursor = page.cursor
    await set(CURSOR_KEY, cursor).catch(() => {})
    if (!page.more) break
  }
}

export async function cycle() {
  if (!active) return
  if (running) { rerun = true; return }
  running = true
  setStatus({ state: 'syncing' })
  try {
    await flushBlobs() // les fichiers partent avant les documents qui les référencent
    await flush()
    await pullAll()
    setStatus({ state: 'idle', lastSync: Date.now() })
  } catch (e) {
    if ((e as { status?: number }).status === 401) {
      setStatus({ state: 'unauthenticated' })
      onUnauthenticated?.()
    } else if (e instanceof ApiError) {
      setStatus({ state: 'error', lastError: e.message })
    } else {
      setStatus({ state: 'offline' }) // réseau coupé : on réessaiera
    }
  } finally {
    running = false
    if (rerun) { rerun = false; schedule(100) }
  }
}

/** Lance une synchronisation et attend sa fin (ex. avant d'émettre une facture, pour que le brouillon soit sur le serveur). */
export async function syncNow(): Promise<void> {
  if (!active) return
  for (let i = 0; i < 40 && running; i++) await new Promise((r) => setTimeout(r, 100))
  await cycle()
  if (getSyncStatus().state === 'offline') throw new Error('offline')
}

export async function startSync(opts: { onUnauthenticated?: () => void } = {}) {
  onUnauthenticated = opts.onUnauthenticated
  active = true
  outbox = new Map(((await get<SyncOp[]>(OUTBOX_KEY)) ?? []).map((o) => [keyOf(o), o]))
  cursor = (await get<number>(CURSOR_KEY)) ?? 0
  setStatus({ pending: outbox.size, state: 'idle' })
  setSyncHook(enqueue)
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)
  interval = setInterval(() => void cycle(), 20_000)
  void cycle()
}
const onOnline = () => schedule(100)
const onVisible = () => document.visibilityState === 'visible' && schedule(100)

/** Arrête la synchro. `wipe` efface aussi les données locales (déconnexion sur appareil partagé). */
export async function stopSync(wipe = false) {
  active = false
  clearTimeout(timer)
  clearInterval(interval)
  window.removeEventListener('online', onOnline)
  document.removeEventListener('visibilitychange', onVisible)
  setSyncHook(null)
  if (wipe) {
    outbox = new Map()
    cursor = 0
    await Promise.all([del(OUTBOX_KEY), del(CURSOR_KEY), wipeBlobs()]).catch(() => {})
  }
  setStatus({ pending: outbox.size, state: 'idle' })
}

/** Envoie tout l'état local (premier chargement de la démo, import massif). */
export function enqueueAll() {
  const s = getState()
  const ops: SyncOp[] = []
  for (const col of ['clients', 'sites', 'elevators', 'techs', 'contracts', 'onCall', 'jobs', 'defects', 'quotes', 'invoices', 'settings'] as const)
    for (const item of s[col] as unknown as Record<string, unknown>[]) ops.push({ collection: col, id: String(col === 'onCall' ? item.weekStart : item.id), data: item })
  enqueue(ops)
}
