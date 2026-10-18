import { useSyncExternalStore } from 'react'

export type Tone = 'ok' | 'info' | 'error'
export interface ToastItem { id: number; tone: Tone; text: string }
export interface DialogAction { label: string; primary?: boolean; to?: string; onClick?: () => void }
export interface DialogItem { id: number; tone: Tone; title: string; body: string; steps?: string[]; actions: DialogAction[] }

interface Snapshot { toasts: ToastItem[]; dialog: DialogItem | null }
let snap: Snapshot = { toasts: [], dialog: null }
let seq = 0
const listeners = new Set<() => void>()
const set = (next: Partial<Snapshot>) => { snap = { ...snap, ...next }; listeners.forEach((l) => l()) }

export const useFeedback = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => snap)

/** Notifications visibles, utilisables depuis n'importe quel écran ou action. */
export const feedback = {
  /** Message flottant qui disparaît seul (5 s ; 8 s pour une erreur). */
  toast(text: string, tone: Tone = 'ok') {
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
}
