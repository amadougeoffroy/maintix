import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../api'
import { Logo } from '../../brand/Logo'
import { feedback } from '../../feedback'
import { actions, byId, runtime, useData } from '../../store'
import { BackLink } from '../../components/BackLink'
import { Icon } from '../../components/Icon'

export default function Signal() {
  const { id } = useParams()
  const s = useData()
  const local = byId(s.elevators, id)
  const [remote, setRemote] = useState<{ label: string; siteName: string } | null>(null)
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    if (runtime.server && id) api.status(id).then((r) => setRemote({ label: r.label, siteName: r.siteName })).catch(() => setMissing(true))
  }, [id])
  const el = runtime.server ? (remote ? { id: id!, label: remote.label } : undefined) : local
  const [desc, setDesc] = useState('')
  const [trapped, setTrapped] = useState(false)
  const [who, setWho] = useState('')
  const [done, setDone] = useState(false)
  if (!el) return <div className="hero"><p>{runtime.server && !missing ? 'Chargement…' : 'Appareil inconnu.'}</p></div>
  const siteName = runtime.server ? remote!.siteName : byId(s.sites, local!.siteId)!.name

  return (
    <div className="hero">
      <div className="box">
        <BackLink />
        <div className="center stack"><Logo height={40} className="center-logo" /><h1>Signaler une panne</h1><p className="muted">{el.label} · {siteName}</p></div>
        {done ? (
          <div className="card stack center">
            <h2 className="ico-line center-line"><Icon n="done" size={24} /> Signalement envoyé</h2>
            <p>Un technicien d’astreinte a été alerté.</p>
            {trapped && <p><strong>Restez calme, utilisez le bouton d’alarme de la cabine. Ne forcez jamais les portes.</strong></p>}
            <Link className="btn primary" to={`/status/${el.id}`}>Suivre l’intervention</Link>
          </div>
        ) : (
          <form className="card stack" onSubmit={async (e) => { e.preventDefault(); const b = { elevatorId: el.id, description: desc || 'Panne signalée', trapped, reporter: who }; try { if (runtime.server) await api.report(b); else actions.report(b); setDone(true) } catch { feedback.dialog({ tone: 'error', title: 'Envoi impossible', body: 'Le signalement n’a pas pu être envoyé. Si une personne est bloquée, appelez les secours (18 / 112).' }) } }}>
            <button type="button" className={`btn block ${trapped ? 'danger' : ''}`} onClick={() => setTrapped(!trapped)} aria-pressed={trapped}>{trapped ? <><Icon n="siren" /> Une personne est bloquée dans la cabine</> : 'Une personne est-elle bloquée ? (appuyer si oui)'}</button>
            {trapped && <p className="small"><strong>En cas de danger, appelez les secours (18 / 112).</strong> Rassurez la personne, ne forcez jamais les portes.</p>}
            <label className="field">Que se passe-t-il ?<textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ex. la porte ne se ferme plus au 3e étage" /></label>
            <label className="field">Votre nom (optionnel)<input value={who} onChange={(e) => setWho(e.target.value)} /></label>
            <button className="btn primary block">Envoyer le signalement</button>
          </form>
        )}
      </div>
    </div>
  )
}
