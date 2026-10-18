import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Logo } from '../brand/Logo'
import { Icon } from '../components/Icon'
import { Img } from '../components/ui'
import { api, ApiError } from '../api'
import { actions, byId, runtime, useData, verifyJob } from '../store'
import { ZONES } from '../checklist'
import { JOB_LABEL, SeverityBadge } from '../components/ui'
import { fmtDateLong, fmtTime } from '../util'

const LABEL = { ok: 'OK', watch: 'À surveiller', ko: 'Défaut' } as const

export default function Report() {
  const { id } = useParams()
  const [q] = useSearchParams()
  const s = useData()
  const job = byId(s.jobs, id)
  const [valid, setValid] = useState<boolean | null>(null)
  const [sendState, setSendState] = useState<string | null>(null)
  useEffect(() => {
    if (job) verifyJob(job).then(setValid)
  }, [job])
  if (!job || !job.visit?.finishedAt) return <div className="content"><p>Rapport indisponible (mission non terminée).</p><Link to="/">Retour</Link></div>
  const v = job.visit
  const el = byId(s.elevators, job.elevatorId)!
  const site = byId(s.sites, el.siteId)!
  const client = byId(s.clients, site.clientId)!
  const tech = byId(s.techs, job.techId)
  const photos = Object.entries(v.checklist).flatMap(([k, a]) => a.photos.map((p) => ({ k, p })))
  const raised = s.defects.filter((d) => d.jobId === job.id)

  const send = async () => {
    if (!runtime.server) return mail()
    setSendState('Envoi…')
    try {
      const r = await api.sendReport(job.id)
      setSendState(`Rapport PDF envoyé à ${r.to.join(', ')}.`)
    } catch (e) {
      setSendState(e instanceof ApiError && e.code === 'no_recipient' ? 'Ce client n’a pas d’adresse e-mail : renseignez-la dans Clients & sites.' : 'Envoi impossible pour le moment (réseau ?). Réessayez.')
    }
  }
  const mail = () => {
    const subject = encodeURIComponent(`Rapport ${JOB_LABEL[job.type]} – ${el.label} – ${fmtDateLong(v.finishedAt!)}`)
    const body = encodeURIComponent(`Bonjour,\n\n${v.summary}\n\nRapport complet : ${location.origin}${location.pathname}#/report/${job.id}\n\nCordialement,\n${tech?.name ?? ''}`)
    actions.markSent(job.id)
    window.location.href = `mailto:${client.email}?subject=${subject}&body=${body}`
  }

  return (
    <div className="content">
      <div className="stack-lg">
        {q.get('done') && (
          <div className="card no-print stack" style={{ borderColor: 'var(--ok)' }}>
            <strong className="ico-line"><Icon n="done" size={20} /> Mission terminée, rapport scellé.</strong>
            <div className="grid2">
              <button className="btn primary" onClick={send}><Icon n="mail" /> Envoyer à {client.name}</button>
              <Link className="btn" to="/">Retour à ma journée</Link>
            </div>
          </div>
        )}
        <div className="row no-print wrap">
          <button className="btn" onClick={() => window.print()}><Icon n="printer" /> Imprimer / PDF</button>
          <button className="btn" onClick={send}><Icon n="mail" /> Envoyer au client</button>
          {runtime.server && <a className="btn" href={`/api/reports/${job.id}/pdf`} target="_blank" rel="noreferrer"><Icon n="file" /> Télécharger le PDF</a>}
          <button className="btn ghost" onClick={() => history.back()}>← Retour</button>
          {sendState && <span className="small" role="status">{sendState}</span>}
          {v.sentAt && <span className="small muted">Envoyé le {fmtDateLong(v.sentAt)} à {fmtTime(v.sentAt)}</span>}
        </div>

        <article className="paper">
          <div className="paper-head"><Logo variant="color" height={30} /><span>Rapport scellé</span></div>
          <h1>{job.type === 'entretien' ? 'Rapport d’entretien' : job.type === 'depannage' ? 'Rapport de dépannage' : `Rapport d’intervention – ${JOB_LABEL[job.type]}`}</h1>
          <p>{client.name} · {site.name}, {site.address}</p>
          <table style={{ marginTop: 10 }}>
            <tbody>
              <tr><th>Appareil</th><td>{el.label} – {el.brand} {el.model} (n° {el.serial}, {el.year})</td></tr>
              <tr><th>Date</th><td>{fmtDateLong(v.finishedAt!)} · {fmtTime(v.finishedAt!)} · {v.minutes} min</td></tr>
              <tr><th>Technicien</th><td>{tech?.name}</td></tr>
              {job.description && <tr><th>Motif</th><td>{job.description}{job.trapped ? ' (personne bloquée)' : ''}</td></tr>}
              {job.type === 'entretien' && <tr><th>Appel d’urgence</th><td>{v.emergencyCallTest === 'ok' ? 'Conforme' : 'NON conforme'}</td></tr>}
            </tbody>
          </table>

          <h2>Synthèse</h2>
          <p>{v.summary}</p>

          {job.type === 'depannage' && job.timeline.length > 0 && (
            <>
              <h2>Chronologie</h2>
              <table><tbody>{job.timeline.map((t, i) => <tr key={i}><td style={{ width: 80 }}>{fmtTime(t.at)}</td><td>{t.label}</td></tr>)}</tbody></table>
            </>
          )}

          {job.type === 'entretien' && (
            <>
              <h2>Points de contrôle</h2>
              <table>
                <tbody>
                  {ZONES.map((z) => (
                    <FragmentRows key={z.key} title={<><Icon n={z.icon} size={15} /> {z.label}</>}>
                      {z.items.map((it) => {
                        const a = v.checklist[it.key]
                        return <tr key={it.key}><td>{it.label}</td><td style={{ whiteSpace: 'nowrap', color: a?.status === 'ko' ? '#b91c1c' : undefined, fontWeight: a?.status === 'ko' ? 700 : 400 }}>{a ? LABEL[a.status] : 'Non contrôlé'}</td><td>{a?.note}</td></tr>
                      })}
                    </FragmentRows>
                  ))}
                </tbody>
              </table>
              {Object.keys(v.measures).length > 0 && (
                <><h2>Mesures</h2><p>{Object.entries(v.measures).map(([k, val]) => `${k} : ${val}`).join(' · ')}</p></>
              )}
            </>
          )}

          {v.parts.length > 0 && <><h2>Pièces remplacées</h2><ul>{v.parts.map((p) => <li key={p.name}>{p.qty} × {p.name}</li>)}</ul></>}

          {raised.length > 0 && (
            <><h2>Défauts à lever</h2><ul>{raised.map((d) => <li key={d.id}><SeverityBadge s={d.severity} /> {d.title}</li>)}</ul></>
          )}

          {photos.length > 0 && (
            <><h2>Photos</h2><div className="photos">{photos.map((p, i) => <Img key={i} r={p.p} alt={`Photo ${i + 1}`} style={{ width: 120, height: 120 }} />)}</div></>
          )}

          <h2>Signature</h2>
          {v.signature?.absent ? (
            <><p>Client absent lors de la visite.</p>{v.signature.photo && <Img r={v.signature.photo} alt="Affichage en cabine" style={{ maxWidth: 220 }} />}</>
          ) : (
            <><p>{v.signature?.name} ({v.signature?.role})</p>{v.signature?.dataUrl && <Img r={v.signature.dataUrl} alt="Signature" style={{ maxWidth: 260, border: '1px solid #ddd' }} />}</>
          )}

          <h2>Sceau d’intégrité</h2>
          <p className="hash">SHA-256 : {v.hash}</p>
          <p className="small">{valid === null ? 'Vérification…' : valid ? <><Icon n="check" /> Le contenu du rapport est conforme au sceau enregistré à la clôture.</> : <><Icon n="x" /> Le contenu ne correspond plus au sceau.</>}</p>
        </article>
      </div>
    </div>
  )
}

function FragmentRows({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <tr><th colSpan={3} style={{ background: '#f1f5f5' }}>{title}</th></tr>
      {children}
    </>
  )
}
