import { createHash } from 'node:crypto'
import { canonicalJson, sealPayload } from '../../shared/canonical'
import type { Principal } from './auth'

export const COLLECTIONS = ['clients', 'sites', 'elevators', 'techs', 'contracts', 'onCall', 'jobs', 'defects', 'quotes', 'invoices', 'settings'] as const
export type Collection = (typeof COLLECTIONS)[number]
export type Doc = Record<string, unknown>
export type Verdict = { ok: true } | { ok: false; reason: string }
const no = (reason: string): Verdict => ({ ok: false, reason })
const ok: Verdict = { ok: true }

const hash = (s: string) => createHash('sha256').update(s).digest('hex')
const omit = (o: Doc, keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)))
const visitOf = (job: Doc) => (job.visit ?? undefined) as Doc | undefined

/** Un rapport clôturé est scellé : le hash doit correspondre au contenu et le contenu ne change plus. */
export function checkJobIntegrity(existing: Doc | null, incoming: Doc): Verdict {
  if (existing?.status === 'terminee') {
    if (incoming.status !== 'terminee') return no('immutable')
    const strip = (j: Doc) => canonicalJson({ ...j, visit: omit(visitOf(j) ?? {}, ['sentAt']) })
    if (strip(existing) !== strip(incoming)) return no('immutable')
  }
  if (incoming.status === 'terminee') {
    const v = visitOf(incoming)
    if (!v || typeof v.hash !== 'string' || typeof v.finishedAt !== 'string') return no('bad_hash')
    if (hash(sealPayload({ id: String(incoming.id), elevatorId: String(incoming.elevatorId), visit: v })) !== v.hash) return no('bad_hash')
  }
  return ok
}

/** Une facture émise est figée (numéro, montants, dates) : seuls paiement, annulation et note évoluent.
 *  Le numéro et le passage à « émise » sont réservés à l'API d'émission (séquence sans trou). */
export function checkInvoiceIntegrity(existing: Doc | null, incoming: Doc): Verdict {
  const draftBefore = !existing || existing.status === 'brouillon'
  if (draftBefore) {
    if (incoming.status !== 'brouillon' || incoming.number || incoming.issuedAt) return no('use_issue')
    return ok
  }
  const frozen = ['id', 'number', 'clientId', 'kind', 'contractId', 'quoteId', 'periodStart', 'periodEnd', 'lines', 'vatRate', 'createdAt', 'issuedAt', 'dueAt']
  for (const k of frozen) if (canonicalJson(existing[k] ?? null) !== canonicalJson(incoming[k] ?? null)) return no('immutable')
  if (!['emise', 'payee', 'annulee'].includes(String(incoming.status))) return no('immutable')
  if (existing.status === 'annulee' && incoming.status !== 'annulee') return no('immutable')
  return ok
}

/** Droits d'écriture par rôle. `incoming === null` signifie suppression. */
export function checkWrite(who: Principal, collection: Collection, existing: Doc | null, incoming: Doc | null): Verdict {
  // un nouveau contrat couvre au moins un appareil
  if (collection === 'contracts' && incoming && !existing && !(Array.isArray(incoming.elevatorIds) && incoming.elevatorIds.length > 0)) return no('contract_needs_elevator')
  if (collection === 'invoices') {
    if (existing && existing.status !== 'brouillon' && incoming === null) return no('immutable')
    if (incoming) {
      const integrity = checkInvoiceIntegrity(existing, incoming)
      if (!integrity.ok) return integrity
    }
  }
  if (collection === 'jobs') {
    if (existing?.status === 'terminee' && incoming === null) return no('immutable')
    if (incoming) {
      const integrity = checkJobIntegrity(existing, incoming)
      if (!integrity.ok) return integrity
    }
  }
  if (who.role === 'admin' || who.role === 'bureau') return ok

  if (who.role === 'tech') {
    if (incoming === null) return no('forbidden')
    if (collection === 'jobs') {
      const mine = incoming.techId === who.techId
      const wasMineOrFree = !existing || existing.techId === who.techId || existing.techId == null
      return mine && wasMineOrFree ? ok : no('forbidden')
    }
    if (collection === 'defects') return ok
    if (collection === 'elevators' && existing) {
      const same = canonicalJson(omit(existing, ['status', 'lastVisit'])) === canonicalJson(omit(incoming, ['status', 'lastVisit']))
      return same ? ok : no('forbidden')
    }
    return no('forbidden')
  }

  // client : uniquement accepter un devis qui lui a été envoyé
  if (who.role === 'client' && collection === 'quotes' && existing && incoming) {
    const accepting = existing.status === 'envoye' && incoming.status === 'accepte'
    const sameOtherwise = canonicalJson(omit(existing, ['status'])) === canonicalJson(omit(incoming, ['status']))
    return accepting && sameOtherwise && existing.clientId === who.clientId ? ok : no('forbidden')
  }
  return no('forbidden')
}

export const docKey = (collection: Collection, data: Doc): string => String(collection === 'onCall' ? data.weekStart : data.id)
