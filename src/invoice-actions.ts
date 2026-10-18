import { api, ApiError } from './api'
import { actions, applyRemoteDocs, getState, runtime } from './store'
import { syncNow } from './sync'

/** Émet une facture : en mode serveur, le serveur attribue le numéro (séquence sans trou) ; sinon numérotation locale. */
export async function issueInvoice(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!runtime.server) {
      actions.issueInvoiceLocal(id)
      return { ok: true }
    }
    await syncNow() // le brouillon doit exister côté serveur
    const r = await api.issueInvoice(id)
    applyRemoteDocs([{ collection: 'invoices', id, data: r.invoice, deleted: false }])
    return { ok: true }
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.code === 'already_issued' ? 'Cette facture est déjà émise.' : e.code === 'empty' ? 'Facture vide ou à 0 €.' : 'Émission refusée par le serveur.' }
    if (e instanceof Error && e.message === 'offline') return { ok: false, error: 'Hors ligne : l’émission nécessite le serveur (numéro de facture unique).' }
    return { ok: false, error: e instanceof Error && e.message === 'Facture vide' ? 'Facture vide ou à 0 €.' : 'Émission impossible.' }
  }
}

export const settingsOf = () => getState().settings[0]
