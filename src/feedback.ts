import { useSyncExternalStore } from 'react'

export type Tone = 'ok' | 'info' | 'error'
export interface ToastItem { id: number; tone: Tone; text: string }
export interface DialogAction { label: string; primary?: boolean; to?: string; onClick?: () => void }
export interface DialogItem { id: number; tone: Tone; title: string; body: string; steps?: string[]; actions: DialogAction[] }

export interface AskItem {
  id: number
  kind: 'confirm' | 'prompt'
  tone: 'danger' | 'info'
  title: string
  body?: string
  confirmLabel: string
  cancelLabel: string
  /** prompt : libellé du champ, valeur initiale, saisie obligatoire ou non */
  label?: string
  placeholder?: string
  required?: boolean
  multiline?: boolean
  resolve: (value: string | boolean | null) => void
}
export interface ConfirmOptions { title: string; body?: string; confirmLabel?: string; cancelLabel?: string; tone?: 'danger' | 'info' }
export interface PromptOptions extends ConfirmOptions { label: string; placeholder?: string; required?: boolean; multiline?: boolean }

interface Snapshot { toasts: ToastItem[]; dialog: DialogItem | null; ask: AskItem | null }
let snap: Snapshot = { toasts: [], dialog: null, ask: null }
const asks: AskItem[] = [] // file d'attente : plusieurs questions successives s'affichent l'une après l'autre
let seq = 0
const listeners = new Set<() => void>()
const set = (next: Partial<Snapshot>) => { snap = { ...snap, ...next }; listeners.forEach((l) => l()) }

export const useFeedback = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => snap)

/** Notifications visibles, utilisables depuis n'importe quel écran ou action. */
export const feedback = {
  /** Message flottant qui disparaît seul (5 s ; 8 s pour une erreur). */
  toast(text: string, tone: Tone = 'ok') {
    if (snap.toasts.some((t) => t.text === text && t.tone === tone)) return // pas de doublon identique affiché
    const id = ++seq
    set({ toasts: [...snap.toasts, { id, tone, text }].slice(-3) })
    setTimeout(() => feedback.dismissToast(id), tone === 'error' ? 8000 : 5000)
  },
  dismissToast(id: number) { set({ toasts: snap.toasts.filter((t) => t.id !== id) }) },
  /** Dialogue de confirmation : pour un événement important qui change le contexte (création, bascule d'entreprise). */
  dialog(d: Omit<DialogItem, 'id' | 'actions' | 'tone'> & { tone?: Tone; actions?: DialogAction[] }) {
    set({ dialog: { id: ++seq, tone: d.tone ?? 'ok', title: d.title, body: d.body, steps: d.steps, actions: d.actions ?? [{ label: 'Compris', primary: true }] } })
  },
  closeDialog() { set({ dialog: null }) },

  /** Demande de confirmation stylée (remplace window.confirm) : résout `true` si confirmé, `false` sinon (Annuler, Échap). */
  confirm(o: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => queueAsk({ kind: 'confirm', tone: o.tone ?? 'info', title: o.title, body: o.body, confirmLabel: o.confirmLabel ?? 'Confirmer', cancelLabel: o.cancelLabel ?? 'Annuler', resolve: (v) => resolve(v === true) }))
  },
  /** Saisie d'un texte (remplace window.prompt) : résout le texte saisi, ou `null` si annulé. */
  prompt(o: PromptOptions): Promise<string | null> {
    return new Promise((resolve) => queueAsk({ kind: 'prompt', tone: o.tone ?? 'info', title: o.title, body: o.body, confirmLabel: o.confirmLabel ?? 'Valider', cancelLabel: o.cancelLabel ?? 'Annuler', label: o.label, placeholder: o.placeholder, required: o.required, multiline: o.multiline, resolve: (v) => resolve(typeof v === 'string' ? v : null) }))
  },
  /** Répond à la question affichée (appelé par le composant). */
  answerAsk(value: string | boolean | null) {
    const cur = snap.ask
    if (!cur) return
    const next = asks.shift() ?? null
    set({ ask: next })
    cur.resolve(value)
  },
}

function queueAsk(a: Omit<AskItem, 'id'>) {
  const item: AskItem = { ...a, id: ++seq }
  if (snap.ask) asks.push(item)
  else set({ ask: item })
}
