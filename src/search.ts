import { norm } from './importer'
import { totals } from './invoicing'
import type { State } from './types'

export type SearchKind = 'client' | 'site' | 'appareil' | 'contrat' | 'defaut' | 'rapport' | 'facture' | 'devis'
export interface SearchHit {
  kind: SearchKind
  id: string
  title: string
  subtitle: string
  to: string
  score: number
}
export const KIND_LABEL: Record<SearchKind, string> = { client: 'Clients', site: 'Sites', appareil: 'Appareils', contrat: 'Contrats', defaut: 'Défauts', rapport: 'Rapports et pannes', facture: 'Factures', devis: 'Devis' }

/** Recherche plein texte tolérante (accents, casse) : tous les mots doivent être présents ; début de mot = meilleur score. */
export function search(s: State, query: string, perKind = 6): SearchHit[] {
  const words = norm(query).split(' ').filter(Boolean)
  if (!words.length) return []
  const rank = (...fields: (string | undefined)[]): number => {
    const text = norm(fields.filter(Boolean).join(' '))
    if (!text) return 0
    let score = 0
    for (const w of words) {
      if (!text.includes(w)) return 0
      score += text.startsWith(w) ? 4 : text.includes(' ' + w) ? 3 : 1
    }
    return score
  }
  const client = (id: string) => s.clients.find((c) => c.id === id)
  const site = (id: string) => s.sites.find((x) => x.id === id)
  const elevator = (id: string) => s.elevators.find((e) => e.id === id)
  const hits: SearchHit[] = []
  const add = (kind: SearchKind, id: string, title: string, subtitle: string, to: string, score: number) => { if (score > 0) hits.push({ kind, id, title, subtitle, to, score }) }

  for (const c of s.clients) add('client', c.id, c.name, [c.contact, c.email, c.phone].filter(Boolean).join(' · '), `/office/clients/${c.id}`, rank(c.name, c.contact, c.email, c.phone))
  for (const x of s.sites) add('site', x.id, x.name, `${x.address} · ${client(x.clientId)?.name ?? ''}`, `/office/clients/${x.clientId}`, rank(x.name, x.address, x.access, client(x.clientId)?.name))
  for (const e of s.elevators) {
    const st = site(e.siteId)
    add('appareil', e.id, e.label, `${e.brand} ${e.model} · n° ${e.serial} · ${st?.name ?? ''}`, `/office/elevator/${e.id}`, rank(e.label, e.brand, e.model, e.serial, st?.name, st?.address, client(st?.clientId ?? '')?.name))
  }
  for (const k of s.contracts) add('contrat', k.id, `Contrat ${client(k.clientId)?.name ?? ''}`, `${k.priceMonthly} FCFA/mois · ${k.elevatorIds.length} appareil(s)`, '/office/contracts', rank(client(k.clientId)?.name, 'contrat', ...k.elevatorIds.map((id) => elevator(id)?.label)))
  for (const d of s.defects) add('defaut', d.id, d.title, `${d.severity} · ${elevator(d.elevatorId)?.label ?? ''} · ${d.status}`, '/office/defects', rank(d.title, d.severity, elevator(d.elevatorId)?.label))
  for (const j of s.jobs) {
    if (j.status !== 'terminee' && j.type !== 'depannage') continue
    const e = elevator(j.elevatorId)
    add('rapport', j.id, `${j.type === 'depannage' ? 'Dépannage' : 'Rapport'} · ${e?.label ?? ''}`, (j.visit?.summary ?? j.description ?? '').slice(0, 110), j.status === 'terminee' ? `/report/${j.id}` : '/office', rank(e?.label, j.description, j.visit?.summary, j.visit?.notes, j.reporter))
  }
  for (const i of s.invoices) add('facture', i.id, i.number ?? 'Brouillon de facture', `${client(i.clientId)?.name ?? ''} · ${Math.round(totals(i).ttc)} FCFA TTC`, `/office/invoices/${i.id}`, rank(i.number, client(i.clientId)?.name, ...i.lines.map((l) => l.label)))
  for (const q of s.quotes) add('devis', q.id, `Devis · ${elevator(q.elevatorId)?.label ?? ''}`, client(q.clientId)?.name ?? '', '/office/quotes', rank(client(q.clientId)?.name, elevator(q.elevatorId)?.label, ...q.lines.map((l) => l.label)))

  const out: SearchHit[] = []
  const counts = new Map<SearchKind, number>()
  for (const h of hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))) {
    const n = counts.get(h.kind) ?? 0
    if (n < perKind) { out.push(h); counts.set(h.kind, n + 1) }
  }
  return out
}
