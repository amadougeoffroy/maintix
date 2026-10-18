import { useEffect, useState } from 'react'
import { api, type AuditEntry } from '../api'
import { runtime } from '../store'
import { fmtDate, fmtTime } from '../util'

const KEYS: Record<string, string> = {
  status: 'statut', techId: 'technicien', date: 'date', name: 'nom', label: 'libellé', brand: 'marque', model: 'modèle', serial: 'n° de série', year: 'année', lastVisit: 'dernière visite',
  priceMonthly: 'prix mensuel', indexation: 'indexation', vatRate: 'TVA', paidAt: 'date de paiement', number: 'numéro', note: 'note', clientId: 'client', siteId: 'site', address: 'adresse',
  email: 'e-mail', phone: 'téléphone', due: 'échéance', severity: 'gravité', title: 'intitulé', description: 'motif', trapped: 'personne bloquée',
}
const ACTIONS: Record<string, string> = { 'doc.delete': 'a supprimé', 'sync.rejected': 'modification refusée', 'invoice.issue': 'a émis la facture', 'invoice.send': 'a envoyé la facture', 'report.send': 'a envoyé le rapport', login: 's’est connecté', 'member.add': 'a invité un membre', 'member.remove': 'a retiré un membre', 'public.report': 'signalement public' }
const val = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'boolean' ? (v ? 'oui' : 'non') : String(v))

export function describeEntry(e: AuditEntry): string {
  if (e.action === 'doc.write') {
    if (e.detail?.created) return 'a créé'
    const ch = Object.entries(e.detail?.changed ?? {})
    if (!ch.length) return 'a modifié'
    return 'a modifié : ' + ch.map(([k, v]) => (v === true ? KEYS[k] ?? k : `${KEYS[k] ?? k} ${val(v.from)} → ${val(v.to)}`)).join(' ; ')
  }
  if (e.action === 'sync.rejected') return `modification refusée (${val(e.detail?.reason)})`
  return ACTIONS[e.action] ?? e.action
}

/** Historique des modifications d'un document (serveur uniquement, bureau et administrateurs). */
export function History({ collection, id, title = 'Historique des modifications' }: { collection: string; id: string; title?: string }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [more, setMore] = useState(false)
  const load = (before?: number) => api.audit({ collection, id, before, limit: 20 }).then((r) => { setEntries((prev) => (before && prev ? [...prev, ...r.entries] : r.entries)); setMore(r.more) }).catch(() => setEntries([]))
  useEffect(() => { if (runtime.server) void load() }, [collection, id])
  if (!runtime.server) return null
  return (
    <section className="stack">
      <h2>{title}</h2>
      {entries === null && <p className="muted small">Chargement…</p>}
      {entries?.length === 0 && <p className="muted small">Aucune modification enregistrée.</p>}
      {entries && entries.length > 0 && (
        <ul className="timeline small">
          {entries.map((e) => <li key={e.id}><strong>{e.user ?? 'Système'}</strong> {describeEntry(e)}<br /><span className="muted">{fmtDate(e.at)} à {fmtTime(e.at)}</span></li>)}
        </ul>
      )}
      {more && entries && <button className="btn sm" onClick={() => load(entries[entries.length - 1].id)}>Voir plus ancien</button>}
    </section>
  )
}
