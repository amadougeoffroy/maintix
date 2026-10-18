import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import { feedback, useFeedback, type AskItem, type Tone } from '../feedback'

const ICON = { ok: CheckCircle2, info: Info, error: TriangleAlert } as const
const Ic = ({ tone, size = 20 }: { tone: Tone; size?: number }) => { const C = ICON[tone]; return <C size={size} aria-hidden="true" /> }

/** Rend les messages flottants et le dialogue de confirmation (balise <dialog> native : focus piégé, Échap, arrière-plan inerte). */
/** Question de confirmation ou de saisie (remplace confirm() et prompt() du navigateur). */
function AskDialog({ ask }: { ask: AskItem | null }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [text, setText] = useState('')
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (ask && !el.open) { setText(''); el.showModal() }
    if (!ask && el.open) el.close()
  }, [ask])
  const danger = ask?.tone === 'danger'
  const canSubmit = !ask || ask.kind === 'confirm' || !ask.required || text.trim().length > 0
  const submit = () => { if (!ask || !canSubmit) return; feedback.answerAsk(ask.kind === 'prompt' ? text.trim() : true) }
  return (
    <dialog ref={ref} className="fb-dialog ask" aria-labelledby="ask-title" aria-describedby="ask-body" onCancel={(e) => { e.preventDefault(); feedback.answerAsk(ask?.kind === 'prompt' ? null : false) }}>
      {ask && (
        <form method="dialog" className="stack" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <div className={`fb-badge ${danger ? 'error' : 'info'}`}>{danger ? <TriangleAlert size={30} aria-hidden="true" /> : <Info size={30} aria-hidden="true" />}</div>
          <h2 id="ask-title">{ask.title}</h2>
          {ask.body && <p id="ask-body">{ask.body}</p>}
          {ask.kind === 'prompt' && (
            <label className="field">{ask.label}
              {ask.multiline
                ? <textarea autoFocus value={text} placeholder={ask.placeholder} onChange={(e) => setText(e.target.value)} />
                : <input autoFocus value={text} placeholder={ask.placeholder} onChange={(e) => setText(e.target.value)} />}
            </label>
          )}
          <div className="fb-actions">
            <button type="button" className="btn" autoFocus={ask.kind === 'confirm' && danger} onClick={() => feedback.answerAsk(ask.kind === 'prompt' ? null : false)}>{ask.cancelLabel}</button>
            <button type="submit" className={`btn ${danger ? 'danger' : 'primary'}`} autoFocus={ask.kind === 'confirm' && !danger} disabled={!canSubmit}>{ask.confirmLabel}</button>
          </div>
        </form>
      )}
    </dialog>
  )
}

export function FeedbackHost() {
  const { toasts, dialog, ask } = useFeedback()
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
      <AskDialog ask={ask} />
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
