import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, type BillingView, type OperatorOrg, type PlanPreset, type SignupRequest } from '../../api'
import { Badge } from '../../components/ui'
import { feedback } from '../../feedback'
import { fcfa, fmtDate, fmtTime } from '../../util'

type Tab = 'orgs' | 'signups' | 'billing' | 'operators'
const when = (iso: string | null) => (iso ? `${fmtDate(iso)} ${fmtTime(iso)}` : '—')

function Meter({ label, value, max }: { label: string; value: number; max: number | null }) {
  const over = max !== null && value > max
  return (
    <div className="meter" title={`${label} : ${value}${max === null ? ' (illimité)' : ` sur ${max}`}`}>
      <div className="row between small"><span className="muted">{label}</span><strong style={over ? { color: 'var(--bad)' } : undefined}>{value}{max === null ? '' : ` / ${max}`}</strong></div>
      <div className="progress"><div style={{ width: `${max === null ? Math.min(100, value) : Math.min(100, (value / Math.max(1, max)) * 100)}%`, background: over ? 'var(--bad)' : undefined }} /></div>
    </div>
  )
}

function OrgCard({ org, plans, onChange }: { org: OperatorOrg; plans: PlanPreset[]; onChange: () => void }) {
  const [edit, setEdit] = useState(false)
  const [f, setF] = useState({ plan: org.offer.plan, trialEndsOn: org.offer.trialEndsOn ?? '', maxTechs: org.offer.maxTechs === null ? '' : String(org.offer.maxTechs), maxElevators: org.offer.maxElevators === null ? '' : String(org.offer.maxElevators), priceMonthly: String(org.offer.priceMonthly), extraTechPrice: String(org.offer.extraTechPrice), extraElevatorPrice: String(org.offer.extraElevatorPrice), notes: org.offer.notes })
  const preset = (code: string) => {
    const p = plans.find((x) => x.code === code)
    if (p) setF({ ...f, plan: code, maxTechs: p.maxTechs === null ? '' : String(p.maxTechs), maxElevators: p.maxElevators === null ? '' : String(p.maxElevators), priceMonthly: String(p.priceMonthly), extraTechPrice: String(p.extraTechPrice), extraElevatorPrice: String(p.extraElevatorPrice) })
  }
  const num = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.round(Number(v) || 0)))
  const suspended = org.status === 'suspended'
  const planName = plans.find((p) => p.code === org.offer.plan)?.name ?? org.offer.plan
  return (
    <article className={`card stack ${suspended ? 'alert' : ''}`}>
      <div className="row between wrap">
        <div><h3>{org.name}</h3><p className="small muted">Créée le {fmtDate(org.createdAt)} · {org.usage.members} membre(s) · dernière activité {when(org.lastActivity)}</p></div>
        <div className="row wrap"><Badge tone={suspended ? 'bad' : 'ok'}>{suspended ? 'Suspendue' : 'Active'}</Badge><Badge tone="brand">{planName}</Badge>{org.flags.trialExpired && <Badge tone="bad">Essai expiré</Badge>}{(org.flags.overTechs || org.flags.overElevators) && <Badge tone="warn">Dépassement</Badge>}</div>
      </div>
      {suspended && org.suspendedReason && <p className="small"><strong>Motif :</strong> {org.suspendedReason}</p>}
      <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <Meter label="Techniciens" value={org.usage.techs} max={org.offer.maxTechs} />
        <Meter label="Appareils" value={org.usage.elevators} max={org.offer.maxElevators} />
        <div className="kpi"><span className="muted small">Clients · missions (30 j)</span><b style={{ fontSize: '1.2rem' }}>{org.usage.clients} · {org.usage.jobs30}</b></div>
        <div className="kpi"><span className="muted small">Montant mensuel estimé</span><b style={{ fontSize: '1.2rem' }}>{suspended ? '—' : fcfa(org.estimate.amount)}</b>{org.estimate.amount > org.estimate.base && <span className="small muted">dont {fcfa(org.estimate.amount - org.estimate.base)} de dépassement</span>}</div>
      </div>
      {org.offer.trialEndsOn && org.offer.plan === 'essai' && <p className="small muted">Essai jusqu’au {fmtDate(org.offer.trialEndsOn)}</p>}
      {org.offer.notes && <p className="small muted">Note : {org.offer.notes}</p>}
      <div className="row wrap">
        <button className="btn sm" aria-expanded={edit} onClick={() => setEdit(!edit)}>{edit ? 'Fermer' : 'Offre et plafonds'}</button>
        {suspended
          ? <button className="btn sm primary" onClick={async () => { await api.opReactivate(org.id); feedback.toast(`« ${org.name} » est réactivée.`); onChange() }}>Réactiver</button>
          : <button className="btn sm" onClick={async () => { const reason = prompt(`Suspendre « ${org.name} » ?\nLes utilisateurs ne pourront plus se connecter à cette entreprise, et les signalements QR seront désactivés.\n\nMotif (affiché à l’entreprise) :`); if (reason === null) return; await api.opSuspend(org.id, reason); feedback.toast(`« ${org.name} » est suspendue.`, 'info'); onChange() }}>Suspendre</button>}
      </div>
      {edit && (
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault()
          try {
            await api.opOffer(org.id, { plan: f.plan, trialEndsOn: f.trialEndsOn || null, maxTechs: num(f.maxTechs), maxElevators: num(f.maxElevators), priceMonthly: num(f.priceMonthly) ?? 0, extraTechPrice: num(f.extraTechPrice) ?? 0, extraElevatorPrice: num(f.extraElevatorPrice) ?? 0, notes: f.notes })
            feedback.toast(`Offre de « ${org.name} » enregistrée.`); setEdit(false); onChange()
          } catch { feedback.toast('Enregistrement impossible.', 'error') }
        }}>
          <label className="field">Offre
            <select value={f.plan} onChange={(e) => preset(e.target.value)}>{plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</select>
          </label>
          <p className="small muted">Choisir une offre préremplit les champs ci-dessous ; vous pouvez ensuite les ajuster pour cette entreprise. Laisser un plafond vide = illimité.</p>
          <div className="grid2">
            <label className="field">Plafond techniciens<input inputMode="numeric" value={f.maxTechs} onChange={(e) => setF({ ...f, maxTechs: e.target.value })} placeholder="illimité" /></label>
            <label className="field">Plafond appareils<input inputMode="numeric" value={f.maxElevators} onChange={(e) => setF({ ...f, maxElevators: e.target.value })} placeholder="illimité" /></label>
            <label className="field">Forfait mensuel (FCFA)<input inputMode="numeric" value={f.priceMonthly} onChange={(e) => setF({ ...f, priceMonthly: e.target.value })} /></label>
            <label className="field">Technicien en plus (FCFA/mois)<input inputMode="numeric" value={f.extraTechPrice} onChange={(e) => setF({ ...f, extraTechPrice: e.target.value })} /></label>
            <label className="field">Appareil en plus (FCFA/mois)<input inputMode="numeric" value={f.extraElevatorPrice} onChange={(e) => setF({ ...f, extraElevatorPrice: e.target.value })} /></label>
            <label className="field">Fin de l’essai<input type="date" value={f.trialEndsOn} onChange={(e) => setF({ ...f, trialEndsOn: e.target.value })} /></label>
          </div>
          <label className="field">Note interne<textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
          <div><button className="btn primary">Enregistrer l’offre</button></div>
        </form>
      )}
    </article>
  )
}

function Orgs({ plans, orgs, reload }: { plans: PlanPreset[]; orgs: OperatorOrg[]; reload: () => void }) {
  const [f, setF] = useState({ name: '', adminName: '', adminEmail: '', plan: 'essai' })
  const [busy, setBusy] = useState(false)
  return (
    <div className="stack-lg">
      <form className="card stack" onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        try {
          await api.opCreateOrg(f)
          feedback.dialog({ title: `Entreprise « ${f.name} » créée`, body: `Un lien de connexion a été envoyé à ${f.adminEmail}. ${f.adminName} est administrateur de l’entreprise et verra une visite guidée à sa première connexion.`, steps: ['Il renseigne son entreprise et invite son équipe.', 'Vous suivez son usage dans cette console et ajustez son offre.'] })
          setF({ name: '', adminName: '', adminEmail: '', plan: f.plan })
          reload()
        } catch (x) { feedback.toast(x instanceof ApiError && x.code === 'invalid' ? 'Vérifiez les champs (e-mail valide, noms de 2 caractères minimum).' : 'Création impossible.', 'error') }
        setBusy(false)
      }}>
        <h2>Créer une entreprise et son administrateur</h2>
        <div className="grid2">
          <label className="field">Nom de l’entreprise<input required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="field">Offre<select value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })}>{plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</select></label>
          <label className="field">Nom de l’administrateur<input required minLength={2} value={f.adminName} onChange={(e) => setF({ ...f, adminName: e.target.value })} /></label>
          <label className="field">E-mail de l’administrateur<input type="email" required value={f.adminEmail} onChange={(e) => setF({ ...f, adminEmail: e.target.value })} /></label>
        </div>
        <div><button className="btn primary" disabled={busy}>Créer et envoyer l’invitation</button></div>
      </form>
      <section className="stack">
        <h2>Entreprises ({orgs.length})</h2>
        {orgs.map((o) => <OrgCard key={o.id} org={o} plans={plans} onChange={reload} />)}
      </section>
    </div>
  )
}

function Signups({ plans, reload }: { plans: PlanPreset[]; reload: () => void }) {
  const [list, setList] = useState<SignupRequest[] | null>(null)
  const [plan, setPlan] = useState('essai')
  const load = useCallback(() => api.opSignups().then((r) => setList(r.signups)).catch(() => setList([])), [])
  useEffect(() => { void load() }, [load])
  const pending = (list ?? []).filter((s) => s.status === 'pending')
  const done = (list ?? []).filter((s) => s.status !== 'pending')
  return (
    <div className="stack-lg">
      <section className="stack">
        <div className="row between wrap"><h2>Demandes en attente ({pending.length})</h2><label className="row small">Offre à l’approbation <select aria-label="Offre à l’approbation" value={plan} onChange={(e) => setPlan(e.target.value)} style={{ maxWidth: 200 }}>{plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</select></label></div>
        {list && pending.length === 0 && <p className="muted">Aucune demande en attente.</p>}
        {pending.map((s) => (
          <article key={s.id} className="card stack">
            <div className="row between wrap"><div><h3>{s.company}</h3><p className="small muted">{s.contactName} · {s.email}{s.phone ? ` · ${s.phone}` : ''} · reçue le {when(s.createdAt)}</p></div></div>
            {s.message && <p className="small">« {s.message} »</p>}
            <div className="row wrap">
              <button className="btn sm primary" onClick={async () => { try { await api.opApprove(s.id, plan); feedback.dialog({ title: `Accès accordé à « ${s.company} »`, body: `L’entreprise est créée et un lien de connexion a été envoyé à ${s.email}.` }); await load(); reload() } catch { feedback.toast('Approbation impossible (déjà traitée ?).', 'error') } }}>Approuver et inviter</button>
              <button className="btn sm" onClick={async () => { const reason = prompt(`Refuser la demande de « ${s.company} » ?\nMotif (envoyé au demandeur, facultatif) :`); if (reason === null) return; try { await api.opReject(s.id, reason); feedback.toast('Demande refusée, le demandeur a été prévenu.', 'info'); await load(); reload() } catch { feedback.toast('Refus impossible.', 'error') } }}>Refuser</button>
            </div>
          </article>
        ))}
      </section>
      {done.length > 0 && (
        <section className="stack">
          <h2>Historique</h2>
          <div className="card pad0 tablewrap"><table>
            <thead><tr><th>Entreprise</th><th>Contact</th><th>Décision</th><th>Date</th></tr></thead>
            <tbody>{done.map((s) => <tr key={s.id}><td>{s.company}</td><td>{s.email}</td><td><Badge tone={s.status === 'approved' ? 'ok' : 'bad'}>{s.status === 'approved' ? 'Approuvée' : 'Refusée'}</Badge>{s.decisionReason ? ` ${s.decisionReason}` : ''}</td><td>{when(s.decidedAt)}</td></tr>)}</tbody>
          </table></div>
        </section>
      )}
    </div>
  )
}

function Billing() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [b, setB] = useState<BillingView | null>(null)
  const load = useCallback(() => api.opBilling(month).then(setB).catch(() => setB(null)), [month])
  useEffect(() => { void load() }, [load])
  const frozenOf = (id: string) => b?.frozen.find((x) => x.orgId === id)
  return (
    <div className="stack-lg">
      <div className="row between wrap">
        <div><h2>Usage et facturation</h2><p className="muted small">Montants en FCFA, calculés d’après l’offre de chaque entreprise et son usage actuel (techniciens et appareils au-delà des plafonds).</p></div>
        <div className="row wrap">
          <label className="row small">Mois <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} style={{ maxWidth: 170 }} /></label>
          <button className="btn sm" onClick={async () => { const r = await api.opFreeze(month); feedback.toast(`Usage de ${month} figé pour ${r.frozen} entreprise(s).`); await load() }}>Figer le mois</button>
          <a className="btn sm" href={`/api/operator/billing.csv?month=${month}`}>Exporter (CSV)</a>
        </div>
      </div>
      {b && (
        <>
          <div className="card kpi"><span className="muted small">Total mensuel estimé (entreprises actives)</span><b>{fcfa(b.totalEstimate)}</b></div>
          <div className="card pad0 tablewrap"><table>
            <thead><tr><th>Entreprise</th><th>Offre</th><th>Techniciens</th><th>Appareils</th><th style={{ textAlign: 'right' }}>Estimé</th><th>Mois figé</th></tr></thead>
            <tbody>
              {b.live.map((o) => { const fz = frozenOf(o.orgId); return (
                <tr key={o.orgId}>
                  <td>{o.name}{o.status !== 'active' && <> <Badge tone="bad">Suspendue</Badge></>}</td><td>{o.plan}</td>
                  <td style={o.flags.overTechs ? { color: 'var(--bad)', fontWeight: 700 } : undefined}>{o.usage.techs}</td>
                  <td style={o.flags.overElevators ? { color: 'var(--bad)', fontWeight: 700 } : undefined}>{o.usage.elevators}</td>
                  <td style={{ textAlign: 'right' }}>{o.status === 'active' ? fcfa(o.estimate.amount) : '—'}</td>
                  <td>{fz ? <span className="small">{fcfa(fz.amount)} <span className="muted">({fmtDate(fz.frozenAt)})</span></span> : <span className="muted small">non figé</span>}</td>
                </tr>) })}
            </tbody>
          </table></div>
        </>
      )}
    </div>
  )
}

function Operators() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.opOperators>> | null>(null)
  const [email, setEmail] = useState('')
  const load = useCallback(() => api.opOperators().then(setData).catch(() => {}), [])
  useEffect(() => { void load() }, [load])
  return (
    <div className="stack-lg">
      <section className="stack">
        <h2>Opérateurs de la plateforme</h2>
        <p className="muted small">Ils accèdent à cette console : création d’entreprises, offres, suspensions, validation des inscriptions. Ils ne voient pas les données métier des entreprises.</p>
        {data?.operators.map((o) => <div key={o.userId} className="card row between wrap"><div><strong>{o.email}</strong><p className="small muted">depuis le {fmtDate(o.createdAt)}</p></div><button className="btn sm" onClick={async () => { if (!confirm(`Retirer ${o.email} des opérateurs ?`)) return; try { await api.opRemoveOperator(o.userId); await load() } catch (e) { feedback.toast(e instanceof ApiError && e.code === 'cannot_remove_self' ? 'Vous ne pouvez pas vous retirer vous-même.' : 'Retrait impossible.', 'error') } }}>Retirer</button></div>)}
        {data && data.fromEnv.length > 0 && <p className="small muted">Aussi opérateurs d’après la variable OPERATOR_EMAILS : {data.fromEnv.join(', ')}.</p>}
      </section>
      <form className="card stack" onSubmit={async (e) => { e.preventDefault(); try { await api.opAddOperator(email); feedback.toast(`${email} est maintenant opérateur.`); setEmail(''); await load() } catch (x) { feedback.toast(x instanceof ApiError && x.code === 'user_unknown' ? 'Cette adresse n’a pas de compte : invitez d’abord la personne dans une entreprise.' : 'Ajout impossible.', 'error') } }}>
        <h3>Ajouter un opérateur</h3>
        <input type="email" required aria-label="Adresse e-mail du nouvel opérateur" placeholder="E-mail d’un compte existant" value={email} onChange={(e) => setEmail(e.target.value)} />
        <div><button className="btn primary">Ajouter</button></div>
      </form>
    </div>
  )
}

export default function OperatorConsole() {
  const [tab, setTab] = useState<Tab>('orgs')
  const [data, setData] = useState<Awaited<ReturnType<typeof api.opOverview>> | null>(null)
  const [error, setError] = useState(false)
  const reload = useCallback(() => api.opOverview().then((d) => { setData(d); setError(false) }).catch(() => setError(true)), [])
  useEffect(() => { void reload() }, [reload])
  const TABS: [Tab, string][] = [['orgs', 'Entreprises'], ['signups', `Demandes${data?.pendingSignups ? ` (${data.pendingSignups})` : ''}`], ['billing', 'Facturation'], ['operators', 'Opérateurs']]
  const totals = data ? { orgs: data.orgs.length, active: data.orgs.filter((o) => o.status === 'active').length, techs: data.orgs.reduce((t, o) => t + o.usage.techs, 0), elevators: data.orgs.reduce((t, o) => t + o.usage.elevators, 0) } : null
  return (
    <div className="stack-lg">
      <div><h1>Console opérateur</h1><p className="muted">Gérez les entreprises clientes de la plateforme.</p></div>
      {error && <p role="alert" style={{ color: 'var(--bad)' }}>Chargement impossible.</p>}
      {totals && (
        <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <div className="card kpi"><span className="muted small">Entreprises actives</span><b>{totals.active}/{totals.orgs}</b></div>
          <div className="card kpi"><span className="muted small">Techniciens</span><b>{totals.techs}</b></div>
          <div className="card kpi"><span className="muted small">Appareils</span><b>{totals.elevators}</b></div>
          <div className="card kpi"><span className="muted small">Demandes en attente</span><b style={data!.pendingSignups ? { color: 'var(--warn)' } : undefined}>{data!.pendingSignups}</b></div>
        </div>
      )}
      <div className="subtabs" role="tablist" aria-label="Sections de la console">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={`subtab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {data && tab === 'orgs' && <Orgs plans={data.plans} orgs={data.orgs} reload={reload} />}
      {data && tab === 'signups' && <Signups plans={data.plans} reload={reload} />}
      {tab === 'billing' && <Billing />}
      {tab === 'operators' && <Operators />}
    </div>
  )
}
