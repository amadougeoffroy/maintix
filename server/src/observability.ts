import { randomUUID } from 'node:crypto'

export type Level = 'debug' | 'info' | 'warn' | 'error'
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }

/** Journal structuré (une ligne JSON par événement) : exploitable par Dokploy, Loki, Datadog… */
export interface Logger {
  log(level: Level, msg: string, fields?: Record<string, unknown>): void
}
export function createLogger(level: Level | 'silent' = 'info', write: (line: string) => void = (l) => process.stdout.write(l + '\n')): Logger {
  return {
    log(lvl, msg, fields = {}) {
      if (level === 'silent' || ORDER[lvl] < ORDER[level]) return
      write(JSON.stringify({ ts: new Date().toISOString(), level: lvl, msg, ...fields }))
    },
  }
}
export const silentLogger: Logger = { log() {} }

export const newRequestId = (incoming?: string | null) => (incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID())

type Labels = Record<string, string | number>
const key = (name: string, labels: Labels = {}) => name + Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `|${k}=${v}`).join('')

/** Compteurs et histogrammes minimaux au format texte Prometheus. */
export class Metrics {
  private counters = new Map<string, { name: string; labels: Labels; v: number }>()
  private hist = new Map<string, { name: string; labels: Labels; sum: number; count: number; buckets: number[] }>()
  private gauges = new Map<string, () => Promise<number> | number>()
  static BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]

  inc(name: string, labels: Labels = {}, by = 1) {
    const k = key(name, labels)
    const c = this.counters.get(k) ?? { name, labels, v: 0 }
    c.v += by
    this.counters.set(k, c)
  }
  observe(name: string, seconds: number, labels: Labels = {}) {
    const k = key(name, labels)
    const h = this.hist.get(k) ?? { name, labels, sum: 0, count: 0, buckets: Metrics.BUCKETS.map(() => 0) }
    h.sum += seconds
    h.count += 1
    Metrics.BUCKETS.forEach((b, i) => { if (seconds <= b) h.buckets[i] += 1 })
    this.hist.set(k, h)
  }
  gauge(name: string, fn: () => Promise<number> | number) { this.gauges.set(name, fn) }
  counter(name: string, labels: Labels = {}) { return this.counters.get(key(name, labels))?.v ?? 0 }

  async render(): Promise<string> {
    const fmt = (l: Labels) => (Object.keys(l).length ? `{${Object.entries(l).map(([k, v]) => `${k}="${String(v).replace(/["\\\n]/g, '_')}"`).join(',')}}` : '')
    const out: string[] = []
    const seen = new Set<string>()
    const head = (name: string, type: string) => { if (!seen.has(name)) { seen.add(name); out.push(`# TYPE ${name} ${type}`) } }
    for (const c of this.counters.values()) { head(c.name, 'counter'); out.push(`${c.name}${fmt(c.labels)} ${c.v}`) }
    for (const h of this.hist.values()) {
      head(h.name, 'histogram')
      Metrics.BUCKETS.forEach((b, i) => out.push(`${h.name}_bucket${fmt({ ...h.labels, le: b })} ${h.buckets[i]}`))
      out.push(`${h.name}_bucket${fmt({ ...h.labels, le: '+Inf' })} ${h.count}`, `${h.name}_sum${fmt(h.labels)} ${h.sum}`, `${h.name}_count${fmt(h.labels)} ${h.count}`)
    }
    for (const [name, fn] of this.gauges) { head(name, 'gauge'); try { out.push(`${name} ${await fn()}`) } catch { out.push(`${name} NaN`) } }
    return out.join('\n') + '\n'
  }
}

/** Envoie les erreurs serveur à un webhook (Slack, Mattermost, ntfy…) : au plus une par minute et par message. */
export function createErrorReporter(url: string | undefined, fetchImpl: typeof fetch = fetch, now: () => number = Date.now) {
  const last = new Map<string, number>()
  return async (msg: string) => {
    if (!url) return
    const k = msg.slice(0, 120)
    const prev = last.get(k)
    if (prev !== undefined && now() - prev < 60_000) return
    last.set(k, now())
    try { await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: `Maintix : ${msg}`.slice(0, 1500) }) }) } catch { /* l'alerte ne doit jamais faire échouer la requête */ }
  }
}
