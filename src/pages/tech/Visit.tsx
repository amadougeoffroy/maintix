import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { actions, buildSummary, byId, certStatus, emptyVisit, lastFinishedVisit, measureDrift, useData, visitReadiness } from '../../store'
import { COMMON_PARTS, MEASURES, ZONES, type Zone } from '../../checklist'
import { Badge, JOB_LABEL, PhotoPicker, SeverityBadge, SignaturePad, VoiceButton, useToast, Toast } from '../../components/ui'
import { saveDataUrl } from '../../files'
import { suggestFromNote, type NoteSuggestions } from '../../notes'
import { itemByKey } from '../../checklist'
import type { ItemStatus, Job } from '../../types'
import { Icon } from '../../components/Icon'

type Step = { k: 'safety' } | { k: 'zone'; zone: Zone } | { k: 'measures' } | { k: 'diag' } | { k: 'parts' } | { k: 'sign' }
const stepLabel = (st: Step): React.ReactNode =>
  st.k === 'safety' ? 'Sécurité' : st.k === 'zone' ? <><Icon n={st.zone.icon} size={16} /> {st.zone.label}</> : st.k === 'measures' ? 'Mesures' : st.k === 'diag' ? 'Constat' : st.k === 'parts' ? 'Pièces' : 'Clôture'

export default function Visit() {
  const { id } = useParams()
  const s = useData()
  const nav = useNavigate()
  const job = byId(s.jobs, id)
  const [i, setI] = useState(0)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const steps: Step[] = useMemo(
    () =>
      job?.type === 'depannage'
        ? [{ k: 'safety' }, { k: 'diag' }, { k: 'parts' }, { k: 'sign' }]
        : [{ k: 'safety' }, ...ZONES.map((zone) => ({ k: 'zone' as const, zone })), { k: 'measures' }, { k: 'parts' }, { k: 'sign' }],
    [job?.type],
  )
  if (!job) return <p>Mission introuvable.</p>
  const el = byId(s.elevators, job.elevatorId)!
  const site = byId(s.sites, el.siteId)!
  const me = byId(s.techs, s.session.techId)
  const certs = me ? certStatus(me) : null

  if (job.status === 'terminee') {
    return (
      <div className="stack">
        <h1 className="ico-line"><Icon n="done" size={26} /> Mission terminée</h1>
        <Link className="btn primary" to={`/report/${job.id}`}>Voir le rapport</Link>
      </div>
    )
  }

  if (job.status !== 'sur_place') {
    return (
      <div className="stack-lg">
        <div>
          <Badge tone={job.type === 'depannage' ? 'bad' : 'brand'}>{JOB_LABEL[job.type]}</Badge>
          <h1 style={{ marginTop: 6 }}>{el.label}</h1>
          <p className="muted">{site.name} · {site.address}</p>
        </div>
        {job.trapped && <div className="card alert"><strong className="ico-line"><Icon n="siren" size={20} /> Personne bloquée en cabine</strong><p className="small">Priorité absolue. Prévenez l’occupant dès votre arrivée.</p></div>}
        {job.description && <div className="card"><strong>Motif</strong><p>{job.description}</p></div>}
        <div className="card stack"><h2>Accès & risques</h2><p>{site.access}</p><p className="muted">{site.risks}</p></div>
        {certs && !certs.ok && (
          <div className="card alert"><strong>Habilitation expirée</strong><p className="small">{certs.expired.map((c) => c.label).join(', ')}. Vous ne pouvez pas démarrer cette mission : contactez le bureau.</p></div>
        )}
        <div className="grid2">
          <a className="btn" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.address)}`} target="_blank" rel="noreferrer" onClick={() => job.status === 'planifiee' && actions.setStatus(job.id, 'en_route')}><Icon n="compass" /> Y aller</a>
          <button className="btn primary" disabled={!!certs && !certs.ok} onClick={() => actions.setStatus(job.id, 'sur_place')}><Icon n="mappin" /> Je suis sur place</button>
        </div>
      </div>
    )
  }

  const v = job.visit ?? emptyVisit()
  const step = steps[i]
  const missing = visitReadiness(job)
  const answered = Object.keys(v.checklist).filter((k) => k !== 'diag').length

  const finish = async () => {
    setBusy(true)
    const started = job.timeline.find((t) => t.label === 'Technicien sur place')
    const minutes = v.minutes || (started ? Math.max(1, Math.round((Date.now() - new Date(started.at).getTime()) / 60000)) : 0)
    await actions.finishJob(job.id, minutes)
    nav(`/report/${job.id}?done=1`, { replace: true })
  }

  return (
    <div className="stack">
      <div className="row between">
        <div>
          <h1>{el.label}</h1>
          <p className="muted small">{JOB_LABEL[job.type]} · {site.name}</p>
        </div>
        {job.type === 'entretien' && <Badge tone="brand">{answered} pts</Badge>}
      </div>
      <div className="progress" role="progressbar" aria-label="Progression de la visite" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={i + 1} aria-valuetext={`Étape ${i + 1} sur ${steps.length}`}><div style={{ width: `${((i + 1) / steps.length) * 100}%` }} /></div>
      <div className="steps" role="tablist">
        {steps.map((st, n) => (
          <button key={n} role="tab" aria-selected={n === i} className={n === i ? 'on' : n < i ? 'done' : ''} onClick={() => setI(n)}>{stepLabel(st)}</button>
        ))}
      </div>

      {step.k === 'safety' && (
        <div className="card stack">
          <h2>Consignes de sécurité</h2>
          <p><strong>Risques du site :</strong> {site.risks}</p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>Baliser l’accès palier et afficher « Ascenseur en maintenance ».</li>
            <li>Consigner l’énergie avant toute intervention en gaine ou machinerie.</li>
            <li>Ne jamais intervenir seul en cuvette sans protection contre l’écrasement.</li>
          </ul>
          <button className={`btn block ${v.lockedOut ? '' : 'primary'}`} onClick={() => actions.updateVisit(job.id, { lockedOut: !v.lockedOut })}>
            {v.lockedOut ? <><Icon n="done" /> Consignation effectuée (appuyer pour annuler)</> : 'Je confirme la consignation et le balisage'}
          </button>
          <p className="small muted">Cette case trace votre déclaration, elle ne remplace pas vos procédures.</p>
        </div>
      )}

      {step.k === 'zone' && <ZoneStep job={job} zone={step.zone} />}

      {step.k === 'measures' && <MeasuresStep job={job} />}

      {step.k === 'diag' && (
        <div className="card stack">
          <h2>Constat et action</h2>
          <label className="field">Cause et action réalisée
            <textarea value={v.notes} onChange={(e) => actions.updateVisit(job.id, { notes: e.target.value })} placeholder="Ex. galet de porte palière 9e cassé, remplacé, essais OK" />
          </label>
          <VoiceButton onText={(t) => actions.updateVisit(job.id, { notes: `${v.notes} ${t}`.trim() })} />
          <PhotoPicker photos={v.checklist.diag?.photos ?? []} onAdd={(p) => actions.answer(job.id, 'diag', { status: 'ok', photos: [...(v.checklist.diag?.photos ?? []), p] })} />
        </div>
      )}

      {step.k === 'parts' && <PartsStep job={job} />}

      {step.k === 'sign' && (
        <SignStep job={job} summary={buildSummary(s, { ...job, visit: v })} missing={missing} busy={busy} onFinish={finish} />
      )}

      <div className="sticky-actions">
        <div className="grid2" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <button className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>← Précédent</button>
          <button className="btn primary" disabled={i === steps.length - 1} onClick={() => { setI(i + 1); window.scrollTo({ top: 0 }) }}>Suivant →</button>
        </div>
      </div>
      <Toast msg={toast.msg} />
    </div>
  )
}

function ZoneStep({ job, zone }: { job: Job; zone: Zone }) {
  const s = useData()
  const v = job.visit ?? emptyVisit()
  const open = s.defects.filter((d) => d.elevatorId === job.elevatorId && d.status !== 'leve')
  const set = (key: string, status: ItemStatus) => actions.answer(job.id, key, { status })
  return (
    <div className="stack">
      <div className="row between">
        <h2 className="ico-line"><Icon n={zone.icon} size={22} /> {zone.label}</h2>
        <button className="btn sm" onClick={() => zone.items.forEach((it) => !v.checklist[it.key] && set(it.key, 'ok'))}>Tout OK</button>
      </div>
      {zone.items.map((it) => {
        const a = v.checklist[it.key]
        const prevDefect = open.find((d) => d.itemKey === it.key)
        return (
          <div key={it.key} className="card stack">
            <div className="row between wrap"><strong>{it.label}</strong>{it.severity === 'critique' && <Badge tone="bad">Sécurité</Badge>}</div>
            {prevDefect && <p className="small" style={{ color: 'var(--warn)' }}><Icon n="alert" size={15} /> Défaut déjà ouvert : <SeverityBadge s={prevDefect.severity} /></p>}
            <div className="seg" role="group" aria-label={it.label}>
              <button className={`ok ${a?.status === 'ok' ? 'on' : ''}`} aria-pressed={a?.status === 'ok'} onClick={() => set(it.key, 'ok')}><Icon n="check" /> OK</button>
              <button className={`watch ${a?.status === 'watch' ? 'on' : ''}`} aria-pressed={a?.status === 'watch'} onClick={() => set(it.key, 'watch')}><Icon n="eye" /> Surveiller</button>
              <button className={`ko ${a?.status === 'ko' ? 'on' : ''}`} aria-pressed={a?.status === 'ko'} onClick={() => set(it.key, 'ko')}><Icon n="x" /> Défaut</button>
            </div>
            {a && a.status !== 'ok' && (
              <div className="stack">
                <textarea placeholder="Précision (optionnel)" value={a.note ?? ''} onChange={(e) => actions.answer(job.id, it.key, { note: e.target.value })} />
                <VoiceButton onText={(t) => actions.answer(job.id, it.key, { note: `${a.note ?? ''} ${t}`.trim() })} />
                <PhotoPicker photos={a.photos} onAdd={(p) => actions.answer(job.id, it.key, { photos: [...a.photos, p] })} label={a.status === 'ko' && a.photos.length === 0 ? 'Photo requise' : 'Ajouter une photo'} />
              </div>
            )}
          </div>
        )
      })}
      {zone.key === 'urgence' && (
        <div className="card stack">
          <strong>Test de l’appel d’urgence (obligatoire)</strong>
          <div className="seg two">
            <button className={`ok ${v.emergencyCallTest === 'ok' ? 'on' : ''}`} onClick={() => actions.updateVisit(job.id, { emergencyCallTest: 'ok' })}><Icon n="check" /> Conforme</button>
            <button className={`ko ${v.emergencyCallTest === 'ko' ? 'on' : ''}`} onClick={() => actions.updateVisit(job.id, { emergencyCallTest: 'ko' })}><Icon n="x" /> Non conforme</button>
          </div>
        </div>
      )}
    </div>
  )
}

function MeasuresStep({ job }: { job: Job }) {
  const s = useData()
  const v = job.visit ?? emptyVisit()
  const prev = lastFinishedVisit(s, job.elevatorId, job.id)?.visit
  return (
    <div className="stack">
      <h2>Mesures</h2>
      <p className="muted small">La dernière valeur est rappelée ; une dérive de plus de 20 % déclenche une alerte.</p>
      {MEASURES.map((m) => {
        const drift = measureDrift(prev?.measures[m.key], v.measures[m.key])
        return (
          <label key={m.key} className="card field">
            {m.label} ({m.unit})
            <input inputMode="decimal" value={v.measures[m.key] ?? ''} placeholder={prev?.measures[m.key] ? `Précédent : ${prev.measures[m.key]}` : '—'} onChange={(e) => actions.updateVisit(job.id, { measures: { ...v.measures, [m.key]: e.target.value } })} />
            {drift !== null && <Badge tone="warn"><Icon n="alert" size={14} /> Dérive de {Math.round(drift * 100)} % vs visite précédente</Badge>}
          </label>
        )
      })}
    </div>
  )
}

function PartsStep({ job }: { job: Job }) {
  const v = job.visit ?? emptyVisit()
  const [custom, setCustom] = useState('')
  const [sugg, setSugg] = useState<NoteSuggestions | null>(null)
  const applySugg = (sg: NoteSuggestions) => {
    let parts = [...v.parts]
    for (const p of sg.parts) {
      const ex = parts.find((x) => x.name === p.name)
      parts = ex ? parts.map((x) => (x.name === p.name ? { ...x, qty: Math.max(x.qty, p.qty) } : x)) : [...parts, p]
    }
    actions.updateVisit(job.id, { parts, ...(sg.emergencyCallTest && !v.emergencyCallTest ? { emergencyCallTest: sg.emergencyCallTest } : {}) })
    if (job.type === 'entretien') for (const it of sg.items) if (v.checklist[it.key]?.status !== 'ko') actions.answer(job.id, it.key, { status: it.status, note: it.note })
    setSugg(null)
  }
  const add = (name: string) => {
    const ex = v.parts.find((p) => p.name === name)
    actions.updateVisit(job.id, { parts: ex ? v.parts.map((p) => (p.name === name ? { ...p, qty: p.qty + 1 } : p)) : [...v.parts, { name, qty: 1 }] })
  }
  return (
    <div className="stack">
      <h2>Pièces & temps</h2>
      <div className="row wrap">
        {COMMON_PARTS.map((p) => <button key={p} className="btn sm" onClick={() => add(p)}>+ {p}</button>)}
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (custom.trim()) { add(custom.trim()); setCustom('') } }}>
        <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Autre pièce" /><button className="btn">Ajouter</button>
      </form>
      {v.parts.map((p) => (
        <div key={p.name} className="card row between">
          <span>{p.name}</span>
          <span className="row">
            <button className="btn sm" aria-label="Moins" onClick={() => actions.updateVisit(job.id, { parts: v.parts.map((x) => (x.name === p.name ? { ...x, qty: x.qty - 1 } : x)).filter((x) => x.qty > 0) })}>−</button>
            <strong>{p.qty}</strong>
            <button className="btn sm" aria-label="Plus" onClick={() => add(p.name)}>+</button>
          </span>
        </div>
      ))}
      <div className="card stack">
        <h3>Remarques</h3>
        <textarea value={v.notes} onChange={(e) => actions.updateVisit(job.id, { notes: e.target.value })} placeholder="Ex. Remplacé deux galets au 3e. Câbles usés côté contrepoids." />
        <div className="row wrap">
          <VoiceButton onText={(t) => actions.updateVisit(job.id, { notes: `${v.notes} ${t}`.trim() })} />
          <button className="btn sm" disabled={!v.notes.trim()} onClick={() => setSugg(suggestFromNote(v.notes))}><Icon n="sparkles" /> Analyser la note</button>
        </div>
        {sugg && (sugg.parts.length + (job.type === 'entretien' ? sugg.items.length : 0) === 0 && !sugg.emergencyCallTest ? (
          <p className="small muted">Rien de précis détecté. Les remarques restent dans le rapport.</p>
        ) : (
          <div className="stack" role="region" aria-label="Suggestions">
            <p className="small muted">Suggestions à vérifier avant d’appliquer :</p>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {sugg.parts.map((p) => <li key={p.name}>Pièce : {p.qty} × {p.name}</li>)}
              {job.type === 'entretien' && sugg.items.map((i) => <li key={i.key}>{itemByKey(i.key)?.label} → <strong>{i.status === 'ko' ? 'Défaut' : 'À surveiller'}</strong> (photo à ajouter)</li>)}
              {sugg.emergencyCallTest && <li>Appel d’urgence : {sugg.emergencyCallTest === 'ok' ? 'conforme' : 'non conforme'}</li>}
            </ul>
            <button className="btn primary sm" onClick={() => applySugg(sugg)}>Appliquer</button>
          </div>
        ))}
      </div>
      <label className="field">Temps passé (minutes, laissez vide pour le calcul automatique)
        <input inputMode="numeric" value={v.minutes || ''} onChange={(e) => actions.updateVisit(job.id, { minutes: parseInt(e.target.value) || 0 })} />
      </label>
    </div>
  )
}

function SignStep({ job, summary, missing, busy, onFinish }: { job: Job; summary: string; missing: string[]; busy: boolean; onFinish: () => void }) {
  const v = job.visit ?? emptyVisit()
  const [absent, setAbsent] = useState(false)
  const [name, setName] = useState('')
  const [role, setRole] = useState('Gardien')
  const [sig, setSig] = useState<string | null>(null)
  const [photo, setPhoto] = useState<string | undefined>()
  const signed = !!v.signature
  const canSign = absent ? !!photo : !!sig && name.trim().length > 1

  return (
    <div className="stack">
      <h2>Clôture</h2>
      <div className="card"><h3>Résumé automatique</h3><p className="small" style={{ marginTop: 6 }}>{summary}</p></div>
      {!signed ? (
        <div className="card stack">
          <div className="seg two">
            <button className={!absent ? 'ok on' : ''} onClick={() => setAbsent(false)}><Icon n="pen" /> Signature</button>
            <button className={absent ? 'watch on' : ''} onClick={() => setAbsent(true)}><Icon n="door" /> Client absent</button>
          </div>
          {absent ? (
            <>
              <p className="small muted">Photographiez l’affichage en cabine (plaque d’entretien) comme preuve de passage.</p>
              <PhotoPicker photos={photo ? [photo] : []} onAdd={setPhoto} label="Photo de l’affichage" />
            </>
          ) : (
            <>
              <label className="field">Nom du signataire<input value={name} onChange={(e) => setName(e.target.value)} /></label>
              <label className="field">Fonction
                <select value={role} onChange={(e) => setRole(e.target.value)}><option>Gardien</option><option>Syndic</option><option>Gestionnaire</option><option>Responsable de site</option><option>Autre</option></select>
              </label>
              <SignaturePad onChange={setSig} />
            </>
          )}
          <button className="btn primary block" disabled={!canSign} onClick={async () => actions.updateVisit(job.id, { signature: { absent, dataUrl: sig ? await saveDataUrl(sig) : undefined, name: absent ? undefined : name, role: absent ? undefined : role, photo, at: new Date().toISOString() } })}>Valider la signature</button>
        </div>
      ) : (
        <div className="card row between">
          <span>{v.signature!.absent ? <><Icon n="door" /> Client absent (photo enregistrée)</> : <><Icon n="pen" /> Signé par {v.signature!.name}</>}</span>
          <button className="btn sm" onClick={() => actions.updateVisit(job.id, { signature: undefined })}>Refaire</button>
        </div>
      )}
      {missing.length > 0 && (
        <div className="card alert"><strong>Avant de terminer :</strong><ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>{missing.map((m) => <li key={m}>{m}</li>)}</ul></div>
      )}
      <button className="btn primary block" disabled={missing.length > 0 || busy} onClick={onFinish}>{busy ? 'Enregistrement…' : 'Terminer et générer le rapport'}</button>
    </div>
  )
}
