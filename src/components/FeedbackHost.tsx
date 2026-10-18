import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import { feedback, useFeedback, type Tone } from '../feedback'

const ICON = { ok: CheckCircle2, info: Info, error: TriangleAlert } as const
const Ic = ({ tone, size = 20 }: { tone: Tone; size?: number }) => { const C = ICON[tone]; return <C size={size} aria-hidden="true" /> }

/** Rend les messages flottants et le dialogue de confirmation (balise <dialog> native : focus piégé, Échap, arrière-plan inerte). */
export function FeedbackHost() {
  const { toasts, dialog } = useFeedback()
  const nav = useNavigate()
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (dialog && !el.open) el.showModal()
    if (!dialog && el.open) el.close()
  }, [dialog])

  return (
    <>
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast-item ${t.tone}`} role={t.tone === 'error' ? 'alert' : 'status'}>
            <Ic tone={t.tone} /><span>{t.text}</span>
            <button className="toast-x" aria-label="Fermer le message" onClick={() => feedback.dismissToast(t.id)}><X size={16} aria-hidden="true" /></button>
          </div>
        ))}
      </div>
      <dialog ref={ref} className="fb-dialog" aria-labelledby="fb-title" aria-describedby="fb-body" onClose={() => feedback.closeDialog()} onCancel={() => feedback.closeDialog()}>
        {dialog && (
          <div className="stack">
            <div className={`fb-badge ${dialog.tone}`}><Ic tone={dialog.tone} size={30} /></div>
            <h2 id="fb-title">{dialog.title}</h2>
            <p id="fb-body">{dialog.body}</p>
            {dialog.steps && dialog.steps.length > 0 && (
              <div className="fb-steps"><strong>Prochaines étapes</strong><ol>{dialog.steps.map((s) => <li key={s}>{s}</li>)}</ol></div>
            )}
            <div className="fb-actions">
              {dialog.actions.map((a) => (
                <button key={a.label} className={`btn ${a.primary ? 'primary' : ''}`} autoFocus={a.primary} onClick={() => { feedback.closeDialog(); a.onClick?.(); if (a.to) nav(a.to) }}>{a.label}</button>
              ))}
            </div>
          </div>
        )}
      </dialog>
    </>
  )
}
