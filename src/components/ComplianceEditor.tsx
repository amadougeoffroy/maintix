import { useState } from 'react'
import { actions } from '../store'
import { feedback } from '../feedback'
import { Badge } from './ui'
import { complianceStatus, daysLeft, KIND_INTERVAL, KIND_LABEL } from '../compliance'
import { fmtDate, today, uid } from '../util'
import type { ComplianceItem, ComplianceKind, Elevator } from '../types'

const TONE = { depassee: 'bad', bientot: 'warn', ok: 'ok' } as const
const WORD = (d: number) => (d < 0 ? `dépassée de ${-d} j` : d === 0 ? 'aujourd’hui' : `dans ${d} j`)

/** Échéances réglementaires d'un appareil : suivi, validation (qui programme la suivante) et ajout. Lecture seule hors bureau. */
export function ComplianceEditor({ el, editable }: { el: Elevator; editable: boolean }) {
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState<{ kind: ComplianceKind; label: string; due: string; interval: string }>({ kind: 'controle_technique', label: KIND_LABEL.controle_technique, due: '', interval: String(KIND_INTERVAL.controle_technique) })
  const t = today()
  const items = [...(el.compliance ?? [])].sort((a, b) => a.due.localeCompare(b.due))
  const setKind = (kind: ComplianceKind) => setF({ ...f, kind, label: KIND_LABEL[kind], interval: KIND_INTERVAL[kind] ? String(KIND_INTERVAL[kind]) : '' })
  return (
    <section className="card stack" aria-label="Échéances réglementaires">
      <div className="row between wrap"><h2>Échéances réglementaires</h2>{editable && <button className="btn sm" aria-expanded={adding} onClick={() => setAdding(!adding)}>+ Échéance</button>}</div>
      {items.length === 0 && !adding && <p className="muted small">Aucune échéance suivie pour cet appareil.{editable ? ' Ajoutez le contrôle technique, l’assurance, etc. : vous serez prévenu avant la date.' : ''}</p>}
      {items.map((x: ComplianceItem) => {
        const st = complianceStatus(x, t)
        return (
          <div key={x.id} className="row between wrap" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
            <div><strong>{x.label}</strong><p className="small muted">{KIND_LABEL[x.kind]} · échéance {fmtDate(x.due)}{x.intervalMonths ? ` · tous les ${x.intervalMonths} mois` : ''}{x.lastDone ? ` · dernière fois le ${fmtDate(x.lastDone)}` : ''}</p></div>
            <div className="row wrap">
              <Badge tone={TONE[st]}>{WORD(daysLeft(x, t))}</Badge>
              {editable && <>
                <button className="btn sm primary" onClick={() => { actions.completeCompliance(el.id, x.id); feedback.toast(x.intervalMonths ? `« ${x.label} » validée : prochaine échéance programmée.` : `« ${x.label} » validée et soldée.`) }}>Valider (fait)</button>
                <button className="btn sm" onClick={async () => { if (await feedback.confirm({ tone: 'danger', title: `Supprimer « ${x.label} » ?`, body: 'L’échéance ne sera plus suivie pour cet appareil.', confirmLabel: 'Supprimer', cancelLabel: 'Garder' })) { actions.removeCompliance(el.id, x.id); feedback.toast('Échéance supprimée.', 'info') } }}>Supprimer</button>
              </>}
            </div>
          </div>
        )
      })}
      {adding && editable && (
        <form className="stack" onSubmit={(e) => {
          e.preventDefault()
          actions.upsertCompliance(el.id, { id: uid('cp'), kind: f.kind, label: f.label.trim() || KIND_LABEL[f.kind], due: f.due, ...(f.interval ? { intervalMonths: Math.max(1, Math.round(Number(f.interval))) } : {}) })
          feedback.toast(`Échéance « ${f.label} » ajoutée.`)
          setAdding(false)
        }}>
          <div className="grid2">
            <label className="field">Type<select value={f.kind} onChange={(e) => setKind(e.target.value as ComplianceKind)}>{(Object.keys(KIND_LABEL) as ComplianceKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label>
            <label className="field">Intitulé<input required value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></label>
            <label className="field">Prochaine échéance<input type="date" required value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></label>
            <label className="field">Périodicité (mois, facultatif)<input inputMode="numeric" value={f.interval} onChange={(e) => setF({ ...f, interval: e.target.value })} placeholder="12" /></label>
          </div>
          <div className="row"><button className="btn primary">Ajouter</button><button type="button" className="btn" onClick={() => setAdding(false)}>Annuler</button></div>
        </form>
      )}
    </section>
  )
}
