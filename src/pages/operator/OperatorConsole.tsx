import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError, type BillingView, type FinanceView, type OperatorOrg, type PaymentSettings, type PlanInput, type PlanPreset, type SignupRequest, type SuspensionReason } from '../../api'
import { Badge } from '../../components/ui'
import { feedback } from '../../feedback'
import { enterOrg } from '../../session'
import { fcfa, fmtDate, fmtTime } from '../../util'

type Tab = 'orgs' | 'signups' | 'plans' | 'finance' | 'payments' | 'billing' | 'operators'
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
  const nav = useNavigate()
  const [edit, setEdit] = useState(false)
  const [suspend, setSuspend] = useState(false)
  const [reasons, setReasons] = useState<SuspensionReason[]>([])
  const [sus, setSus] = useState({ code: 'unpaid', detail: '' })
  useEffect(() => { if (suspend && !reasons.length) api.opReasons().then((r) => setReasons(r.reasons)).catch(() => {}) }, [suspend, reasons.length])
  const [f, setF] = useState({ plan: org.offer.plan, trialEndsOn: org.offer.trialEndsOn ?? '', subscriptionEndsOn: org.offer.subscriptionEndsOn ?? '', overageMode: org.offer.overageMode ?? 'bill', maxTechs: org.offer.maxTechs === null ? '' : String(org.offer.maxTechs), maxElevators: org.offer.maxElevators === null ? '' : String(org.offer.maxElevators), priceMonthly: String(org.offer.priceMonthly), extraTechPrice: String(org.offer.extraTechPrice), extraElevatorPrice: String(org.offer.extraElevatorPrice), notes: org.offer.notes })
  const preset = (code: string) => {
    const p = plans.find((x) => x.code === code)
    if (p) setF({ ...f, plan: code, maxTechs: p.maxTechs === null ? '' : String(p.maxTechs), maxElevators: p.maxElevators === null ? '' : String(p.maxElevators), priceMonthly: String(p.priceMonthly), extraTechPrice: String(p.extraTechPrice), extraElevatorPrice: String(p.extraElevatorPrice), overageMode: p.overageMode ?? 'bill' })
  }
  const num = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.round(Number(v) || 0)))
  const suspended = org.status === 'suspended'
  const planName = plans.find((p) => p.code === org.offer.plan)?.name ?? org.offer.plan
  return (
    <article className={`card stack ${suspended ? 'alert' : ''}`}>
      <div className="row between wrap">
        <div><h3>{org.name}</h3><p className="small muted">Créée le {fmtDate(org.createdAt)} · {org.usage.members} membre(s) · dernière activité {when(org.lastActivity)}</p></div>
        <div className="row wrap"><Badge tone={suspended ? 'bad' : 'ok'}>{suspended ? 'Suspendue' : 'Active'}</Badge><Badge tone="brand">{planName}</Badge>{org.flags.trialExpired && <Badge tone="bad">Essai expiré</Badge>}{org.flags.subscriptionExpired && <Badge tone="bad">Abonnement échu</Badge>}{(org.flags.overTechs || org.flags.overElevators) && <Badge tone="warn">Dépassement</Badge>}</div>
      </div>
      {suspended && org.suspension && <p className="small"><strong>Motif :</strong> {org.suspension.label ?? org.suspendedReason}{org.suspension.detail ? ` — ${org.suspension.detail}` : ''} · <em>{org.suspension.payable ? 'levée possible par le paiement de l’entreprise ou par un opérateur' : 'seul un opérateur peut la lever'}</em></p>}
      <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <Meter label="Techniciens" value={org.usage.techs} max={org.offer.maxTechs} />
        <Meter label="Appareils" value={org.usage.elevators} max={org.offer.maxElevators} />
        <div className="kpi"><span className="muted small">Clients · missions (30 j)</span><b style={{ fontSize: '1.2rem' }}>{org.usage.clients} · {org.usage.jobs30}</b></div>
        <div className="kpi"><span className="muted small">Montant mensuel estimé</span><b style={{ fontSize: '1.2rem' }}>{suspended ? '—' : fcfa(org.estimate.amount)}</b>{org.estimate.amount > org.estimate.base && <span className="small muted">dont {fcfa(org.estimate.amount - org.estimate.base)} de dépassement</span>}</div>
      </div>
      {org.offer.subscriptionEndsOn && <p className="small muted">Abonnement valable jusqu’au {fmtDate(org.offer.subscriptionEndsOn)}</p>}
      {org.offer.trialEndsOn && org.offer.plan === 'essai' && <p className="small muted">Essai jusqu’au {fmtDate(org.offer.trialEndsOn)}</p>}
      {org.offer.notes && <p className="small muted">Note : {org.offer.notes}</p>}
      <div className="row wrap">
        <button className="btn sm primary" onClick={async () => { const r = await enterOrg(org.id); if (r.ok) { feedback.toast(`Vous êtes dans « ${org.name} ». Le bandeau orange permet de revenir à la console.`, 'info'); nav('/office') } else feedback.toast(r.error, 'error') }}>Ouvrir l’entreprise</button>
        <button className="btn sm" aria-expanded={edit} onClick={() => setEdit(!edit)}>{edit ? 'Fermer' : 'Offre et plafonds'}</button>
        {suspended
          ? <button className="btn sm primary" onClick={async () => { try { await api.opReactivate(org.id); feedback.toast(`« ${org.name} » est réactivée.`); onChange() } catch { feedback.toast('Réactivation impossible.', 'error') } }}>Réactiver</button>
          : <button className="btn sm" aria-expanded={suspend} onClick={() => setSuspend(!suspend)}>Suspendre…</button>}
      </div>
      {suspend && !suspended && (
        <form className="card stack" onSubmit={async (e) => {
          e.preventDefault()
          try { await api.opSuspend(org.id, sus.code, sus.detail); feedback.toast(`« ${org.name} » est suspendue.`, 'info'); setSuspend(false); onChange() } catch { feedback.toast('Suspension impossible.', 'error') }
        }}>
          <p className="small muted">Les utilisateurs ne pourront plus utiliser cette entreprise et les signalements par QR seront désactivés. Les données sont conservées.</p>
          <label className="field">Motif de suspension
            <select value={sus.code} onChange={(e) => setSus({ ...sus, code: e.target.value })}>{reasons.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}</select>
          </label>
          {reasons.find((r) => r.code === sus.code) && <p className="small">{reasons.find((r) => r.code === sus.code)!.liftedByPayment ? 'Cette suspension pourra être levée par le paiement de l’entreprise, ou par un opérateur.' : 'Seul un opérateur pourra lever cette suspension.'}</p>}
          <label className="field">Précision (affichée à l’entreprise, facultatif)<input value={sus.detail} onChange={(e) => setSus({ ...sus, detail: e.target.value })} placeholder="Ex. facture de mars" /></label>
          <div className="row"><button className="btn danger">Suspendre l’entreprise</button><button type="button" className="btn" onClick={() => setSuspend(false)}>Annuler</button></div>
        </form>
      )}
      {edit && (
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault()
          try {
            await api.opOffer(org.id, { overageMode: f.overageMode, plan: f.plan, trialEndsOn: f.trialEndsOn || null, subscriptionEndsOn: f.subscriptionEndsOn || null, maxTechs: num(f.maxTechs), maxElevators: num(f.maxElevators), priceMonthly: num(f.priceMonthly) ?? 0, extraTechPrice: num(f.extraTechPrice) ?? 0, extraElevatorPrice: num(f.extraElevatorPrice) ?? 0, notes: f.notes })
            feedback.toast(`Offre de « ${org.name} » enregistrée.`); setEdit(false); onChange()
          } catch { feedback.toast('Enregistrement impossible.', 'error') }
        }}>
          <label className="field">Offre
            <select value={f.plan} onChange={(e) => preset(e.target.value)}>{plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</select>
          </label>
          <p className="small muted">À la fin de l’essai ou à l’échéance de l’abonnement, l’entreprise est suspendue automatiquement ; son paiement en ligne rétablit l’accès. Laisser vide = pas d’échéance. Choisir une offre préremplit les champs ci-dessous ; vous pouvez ensuite les ajuster pour cette entreprise. Laisser un plafond vide = illimité.</p>
          <div className="grid2">
            <label className="field">Plafond techniciens<input inputMode="numeric" value={f.maxTechs} onChange={(e) => setF({ ...f, maxTechs: e.target.value })} placeholder="illimité" /></label>
            <label className="field">Plafond appareils<input inputMode="numeric" value={f.maxElevators} onChange={(e) => setF({ ...f, maxElevators: e.target.value })} placeholder="illimité" /></label>
            <label className="field">Forfait mensuel (FCFA)<input inputMode="numeric" value={f.priceMonthly} onChange={(e) => setF({ ...f, priceMonthly: e.target.value })} /></label>
            <label className="field">Technicien en plus (FCFA/mois)<input inputMode="numeric" value={f.extraTechPrice} onChange={(e) => setF({ ...f, extraTechPrice: e.target.value })} /></label>
            <label className="field">Appareil en plus (FCFA/mois)<input inputMode="numeric" value={f.extraElevatorPrice} onChange={(e) => setF({ ...f, extraElevatorPrice: e.target.value })} /></label>
            <label className="field">Fin de l’essai<input type="date" value={f.trialEndsOn} onChange={(e) => setF({ ...f, trialEndsOn: e.target.value })} /></label>
            <label className="field">En cas de dépassement
              <select value={f.overageMode} onChange={(e) => setF({ ...f, overageMode: e.target.value as 'bill' | 'block' })}><option value="bill">Facturer le dépassement</option><option value="block">Bloquer les ajouts</option></select>
            </label>
            <label className="field">Échéance de l’abonnement<input type="date" value={f.subscriptionEndsOn} onChange={(e) => setF({ ...f, subscriptionEndsOn: e.target.value })} /></label>
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
              <button className="btn sm" onClick={async () => { const reason = await feedback.prompt({ tone: 'danger', title: `Refuser la demande de « ${s.company} » ?`, body: 'Le demandeur est prévenu par e-mail.', label: 'Motif (envoyé au demandeur, facultatif)', confirmLabel: 'Refuser la demande', multiline: true }); if (reason === null) return; try { await api.opReject(s.id, reason); feedback.toast('Demande refusée, le demandeur a été prévenu.', 'info'); await load(); reload() } catch { feedback.toast('Refus impossible.', 'error') } }}>Refuser</button>
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

const numOrNull = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.round(Number(v))))
const blankPlan = { overageMode: 'bill' as 'bill' | 'block', code: '', name: '', maxTechs: '', maxElevators: '', priceMonthly: '0', extraTechPrice: '0', extraElevatorPrice: '0', trialDays: '', archived: false }
type PlanForm = typeof blankPlan
const formOf = (p: PlanPreset): PlanForm => ({ overageMode: p.overageMode ?? 'bill', code: p.code, name: p.name, maxTechs: p.maxTechs === null ? '' : String(p.maxTechs), maxElevators: p.maxElevators === null ? '' : String(p.maxElevators), priceMonthly: String(p.priceMonthly), extraTechPrice: String(p.extraTechPrice), extraElevatorPrice: String(p.extraElevatorPrice), trialDays: p.trialDays ? String(p.trialDays) : '', archived: !!p.archived })
const inputOf = (f: PlanForm): PlanInput => ({ overageMode: f.overageMode, name: f.name.trim(), maxTechs: numOrNull(f.maxTechs), maxElevators: numOrNull(f.maxElevators), priceMonthly: numOrNull(f.priceMonthly) ?? 0, extraTechPrice: numOrNull(f.extraTechPrice) ?? 0, extraElevatorPrice: numOrNull(f.extraElevatorPrice) ?? 0, trialDays: numOrNull(f.trialDays) || null, archived: f.archived })

function PlanFields({ f, setF, isNew }: { f: PlanForm; setF: (f: PlanForm) => void; isNew: boolean }) {
  const set = (k: keyof PlanForm) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
      {isNew && <label className="field">Code (identifiant)<input required pattern="[a-z0-9-]{2,30}" placeholder="premium" value={f.code} onChange={set('code')} /></label>}
      <label className="field">Nom de l’offre<input required minLength={2} value={f.name} onChange={set('name')} /></label>
      <label className="field">Prix mensuel (FCFA)<input type="number" min="0" required value={f.priceMonthly} onChange={set('priceMonthly')} /></label>
      <label className="field">Techniciens inclus<input type="number" min="0" placeholder="illimité" value={f.maxTechs} onChange={set('maxTechs')} /></label>
      <label className="field">Appareils inclus<input type="number" min="0" placeholder="illimité" value={f.maxElevators} onChange={set('maxElevators')} /></label>
      <label className="field">Technicien en plus (FCFA)<input type="number" min="0" value={f.extraTechPrice} onChange={set('extraTechPrice')} /></label>
      <label className="field">Appareil en plus (FCFA)<input type="number" min="0" value={f.extraElevatorPrice} onChange={set('extraElevatorPrice')} /></label>
      <label className="field">Essai (jours)<input type="number" min="1" placeholder="aucun" value={f.trialDays} onChange={set('trialDays')} /></label>
      <label className="field">En cas de dépassement des plafonds
        <select value={f.overageMode} onChange={(e) => setF({ ...f, overageMode: e.target.value as 'bill' | 'block' })}><option value="bill">Facturer le dépassement (ajout possible)</option><option value="block">Bloquer les ajouts</option></select>
      </label>
    </div>
  )
}

function PlanCardRow({ plan, onChange }: { plan: PlanPreset; onChange: (plans: PlanPreset[]) => void }) {
  const [edit, setEdit] = useState(false)
  const [f, setF] = useState(formOf(plan))
  const save = async (archived = f.archived) => {
    try { const r = await api.opUpdatePlan(plan.code, inputOf({ ...f, archived })); onChange(r.plans); setEdit(false); feedback.toast(archived !== !!plan.archived ? (archived ? `Offre « ${f.name} » archivée.` : `Offre « ${f.name} » réactivée.`) : `Offre « ${f.name} » enregistrée.`) }
    catch { feedback.toast('Enregistrement impossible : vérifiez les champs.', 'error') }
  }
  const remove = async () => {
    if (!(await feedback.confirm({ tone: 'danger', title: `Supprimer l’offre « ${plan.name} » ?`, body: 'Une offre utilisée par des entreprises ne peut pas être supprimée : archivez-la plutôt.', confirmLabel: 'Supprimer l’offre', cancelLabel: 'Garder' }))) return
    try { const r = await api.opDeletePlan(plan.code); onChange(r.plans); feedback.toast(`Offre « ${plan.name} » supprimée.`, 'info') }
    catch (e) { feedback.toast(e instanceof ApiError && e.code === 'in_use' ? 'Cette offre est utilisée par des entreprises : archivez-la au lieu de la supprimer.' : 'Suppression impossible.', 'error') }
  }
  return (
    <article className="card stack">
      <div className="row between wrap">
        <div><h3>{plan.name} <span className="small muted">({plan.code})</span></h3>
          <p className="small muted">{plan.priceMonthly > 0 ? `${fcfa(plan.priceMonthly)} / mois` : 'Gratuit ou sur devis'} · {plan.maxTechs === null ? 'techniciens illimités' : `${plan.maxTechs} techniciens`} · {plan.maxElevators === null ? 'appareils illimités' : `${plan.maxElevators} appareils`}{plan.trialDays ? ` · essai ${plan.trialDays} j` : ''} · {plan.overageMode === 'block' ? 'plafonds bloquants' : 'dépassement facturé'}</p></div>
        {plan.archived && <Badge tone="warn">Archivée</Badge>}
      </div>
      <div className="row wrap">
        <button className="btn sm" aria-expanded={edit} onClick={() => { setF(formOf(plan)); setEdit(!edit) }}>{edit ? 'Fermer' : 'Modifier'}</button>
        <button className="btn sm" onClick={() => { setF(formOf(plan)); void save(!plan.archived) }}>{plan.archived ? 'Réactiver' : 'Archiver'}</button>
        <button className="btn sm" onClick={remove}>Supprimer</button>
      </div>
      {edit && (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); void save() }}>
          <PlanFields f={f} setF={setF} isNew={false} />
          <p className="small muted">Les entreprises déjà abonnées gardent leurs conditions : modifiez-les depuis leur fiche pour les changer.</p>
          <div><button className="btn primary">Enregistrer l’offre</button></div>
        </form>
      )}
    </article>
  )
}

function Plans({ plans, reload }: { plans: PlanPreset[]; reload: () => void }) {
  const [list, setList] = useState(plans)
  const [f, setF] = useState(blankPlan)
  useEffect(() => setList(plans), [plans])
  const update = (p: PlanPreset[]) => { setList(p); reload() }
  return (
    <div className="stack-lg">
      <section className="stack">
        <h2>Offres commerciales</h2>
        <p className="muted small">Le catalogue proposé à la création d’une entreprise et à l’approbation d’une demande. Montants en FCFA par mois.</p>
        {list.map((p) => <PlanCardRow key={p.code} plan={p} onChange={update} />)}
      </section>
      <form className="card stack" onSubmit={async (e) => {
        e.preventDefault()
        try { const r = await api.opCreatePlan({ code: f.code.trim().toLowerCase(), ...inputOf(f) }); update(r.plans); setF(blankPlan); feedback.toast(`Offre « ${f.name} » créée.`) }
        catch (x) { feedback.toast(x instanceof ApiError && x.code === 'code_taken' ? 'Ce code d’offre existe déjà.' : 'Création impossible : vérifiez les champs.', 'error') }
      }}>
        <h3>Nouvelle offre</h3>
        <PlanFields f={f} setF={setF} isNew />
        <div><button className="btn primary">Créer l’offre</button></div>
      </form>
    </div>
  )
}

const PAY_STATUS: Record<string, [string, 'ok' | 'warn' | 'bad']> = { paid: ['Payé', 'ok'], pending: ['En attente', 'warn'], failed: ['Échec', 'bad'] }

function Finance({ plans }: { plans: PlanPreset[] }) {
  const [f, setF] = useState<FinanceView | null>(null)
  const [m, setM] = useState({ orgId: '', plan: '', months: '1', amount: '', note: '' })
  const load = useCallback(() => api.opFinance().then(setF).catch(() => feedback.toast('Chargement des finances impossible.', 'error')), [])
  useEffect(() => { void load() }, [load])
  if (!f) return <p className="muted">Chargement…</p>
  const max = Math.max(1, ...f.collected.series.map((x) => x.amount))
  return (
    <div className="stack-lg">
      <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <div className="card kpi"><span className="muted small">Encaissé (total)</span><b style={{ color: 'var(--ok)' }}>{fcfa(f.collected.total)}</b></div>
        <div className="card kpi"><span className="muted small">Encaissé ce mois</span><b>{fcfa(f.collected.thisMonth)}</b></div>
        <div className="card kpi"><span className="muted small">Reste à payer (échus)</span><b style={f.outstanding.amount ? { color: 'var(--bad)' } : undefined}>{fcfa(f.outstanding.amount)}</b><span className="small muted">{f.outstanding.orgs} entreprise(s)</span></div>
        <div className="card kpi"><span className="muted small">Paiements en cours</span><b style={f.pending.amount ? { color: 'var(--warn)' } : undefined}>{fcfa(f.pending.amount)}</b><span className="small muted">{f.pending.count} en attente de confirmation</span></div>
        <div className="card kpi"><span className="muted small">À renouveler sous 30 jours</span><b>{fcfa(f.upcoming30.amount)}</b><span className="small muted">{f.upcoming30.orgs} entreprise(s)</span></div>
      </div>
      <p className="small muted">« Reste à payer » : une mensualité estimée pour chaque entreprise dont l’essai ou l’abonnement est échu, ou suspendue pour impayé.</p>

      {f.collected.series.length > 0 && (
        <section className="card stack">
          <h2>Encaissements des 12 derniers mois</h2>
          <div className="bars" role="img" aria-label={`Encaissements par mois : ${f.collected.series.map((x) => `${x.month} ${fcfa(x.amount)}`).join(', ')}`}>
            {f.collected.series.map((x) => <div key={x.month} className="bar-col" title={`${x.month} : ${fcfa(x.amount)}`}><div className="bar" style={{ height: `${Math.max(6, (x.amount / max) * 100)}%` }} /><span className="small muted">{x.month.slice(5)}</span></div>)}
          </div>
        </section>
      )}

      <section className="stack">
        <h2>Par entreprise</h2>
        <div className="table-wrap"><table>
          <thead><tr><th>Entreprise</th><th>Offre</th><th>Échéance</th><th>Payé</th><th>En cours</th><th>Reste à payer</th></tr></thead>
          <tbody>{f.orgs.map((o) => (
            <tr key={o.orgId}>
              <td><strong>{o.name}</strong>{o.status === 'suspended' && <> <Badge tone="bad">Suspendue</Badge></>}</td>
              <td>{o.plan}</td><td>{o.endsOn ? fmtDate(o.endsOn) : '—'}</td>
              <td>{fcfa(o.paid)}</td><td>{o.pending ? fcfa(o.pending) : '—'}</td>
              <td style={o.due ? { color: 'var(--bad)', fontWeight: 700 } : undefined}>{o.due ? fcfa(o.due) : '—'}</td>
            </tr>))}
          </tbody>
        </table></div>
      </section>

      <section className="stack">
        <h2>Derniers paiements</h2>
        {f.recent.length === 0 && <p className="muted">Aucun paiement pour le moment.</p>}
        {f.recent.map((p) => (
          <div key={p.id} className="card row between wrap">
            <div><strong>{p.org}</strong> <span className="small muted">· {p.plan} · {p.months} mois · {p.source === 'manual' ? 'hors ligne' : `Jèko${p.method ? ` (${p.method})` : ''}`}</span><p className="small muted">{when(p.paidAt ?? p.createdAt)} · réf. {p.reference}{p.note ? ` · ${p.note}` : ''}</p></div>
            <div className="row wrap"><strong>{fcfa(p.amount)}</strong><Badge tone={PAY_STATUS[p.status][1]}>{PAY_STATUS[p.status][0]}</Badge>
              {p.status === 'pending' && <button className="btn sm" onClick={async () => { if (!(await feedback.confirm({ title: 'Confirmer ce paiement ?', body: 'À faire uniquement après avoir vérifié la transaction dans votre tableau de bord Jèko (notification non reçue). L’abonnement sera prolongé.', confirmLabel: 'Confirmer le paiement', cancelLabel: 'Annuler' }))) return; try { await api.opConfirmPayment(p.id); feedback.toast('Paiement confirmé, abonnement prolongé.'); await load() } catch { feedback.toast('Confirmation impossible.', 'error') } }}>Marquer payé</button>}
            </div>
          </div>
        ))}
      </section>

      <form className="card stack" onSubmit={async (e) => {
        e.preventDefault()
        try { const r = await api.opManualPayment(m.orgId, { plan: m.plan, months: Number(m.months), amount: m.amount ? Math.round(Number(m.amount)) : undefined, note: m.note }); feedback.toast(r.lifted ? 'Paiement enregistré, suspension levée.' : 'Paiement enregistré, abonnement prolongé.'); setM({ ...m, amount: '', note: '' }); await load() }
        catch { feedback.toast('Enregistrement impossible : vérifiez les champs.', 'error') }
      }}>
        <h3>Enregistrer un paiement reçu hors ligne</h3>
        <p className="small muted">Virement, espèces… L’abonnement est prolongé comme pour un paiement en ligne.</p>
        <div className="grid2">
          <label className="field">Entreprise<select required value={m.orgId} onChange={(e) => setM({ ...m, orgId: e.target.value })}><option value="">— Choisir —</option>{f.orgs.map((o) => <option key={o.orgId} value={o.orgId}>{o.name}</option>)}</select></label>
          <label className="field">Offre<select required value={m.plan} onChange={(e) => setM({ ...m, plan: e.target.value })}><option value="">— Choisir —</option>{plans.filter((p) => !p.archived).map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</select></label>
          <label className="field">Durée<select value={m.months} onChange={(e) => setM({ ...m, months: e.target.value })}>{[1, 3, 6, 12].map((x) => <option key={x} value={x}>{x} mois</option>)}</select></label>
          <label className="field">Montant reçu (FCFA, vide = prix de l’offre)<input inputMode="numeric" value={m.amount} onChange={(e) => setM({ ...m, amount: e.target.value })} /></label>
        </div>
        <label className="field">Note (référence du virement…)<input value={m.note} onChange={(e) => setM({ ...m, note: e.target.value })} /></label>
        <div><button className="btn primary">Enregistrer le paiement</button></div>
      </form>
    </div>
  )
}

function PaymentSettingsPanel() {
  const [v, setV] = useState<PaymentSettings | null>(null)
  const [f, setF] = useState({ apiKey: '', apiKeyId: '', storeId: '', webhookSecret: '' })
  const [stores, setStores] = useState<{ id: string; name: string }[] | null>(null)
  const load = useCallback(() => api.opPaymentSettings().then((x) => { setV(x); setF((p) => ({ ...p, apiKeyId: x.apiKeyId, storeId: x.storeId })) }).catch(() => {}), [])
  useEffect(() => { void load() }, [load])
  if (!v) return <p className="muted">Chargement…</p>
  return (
    <div className="stack-lg">
      <section className="stack">
        <h2>Paiements en ligne : Jèko</h2>
        <p className="muted small">Les clés se génèrent dans le tableau de bord Jèko (Paramètres → API & Webhooks). Elles sont enregistrées chiffrées et ne sont plus jamais affichées : laisser un champ vide conserve la valeur actuelle.</p>
        <div className="row wrap"><Badge tone={v.configured ? 'ok' : 'warn'}>{v.configured ? 'Clés API enregistrées' : 'Clés API manquantes'}</Badge><Badge tone={v.webhookConfigured ? 'ok' : 'warn'}>{v.webhookConfigured ? 'Secret du webhook enregistré' : 'Secret du webhook manquant'}</Badge></div>
      </section>
      <form className="card stack" onSubmit={async (e) => {
        e.preventDefault()
        try { const r = await api.opSavePaymentSettings({ apiKey: f.apiKey, apiKeyId: f.apiKeyId, storeId: f.storeId, webhookSecret: f.webhookSecret }); setV(r); setF({ apiKey: '', apiKeyId: r.apiKeyId, storeId: r.storeId, webhookSecret: '' }); feedback.toast('Réglages de paiement enregistrés.') }
        catch { feedback.toast('Enregistrement impossible.', 'error') }
      }}>
        <label className="field">Clé API (X-API-KEY){v.apiKeyMasked && <span className="small muted"> — actuelle : {v.apiKeyMasked}</span>}<input type="password" autoComplete="off" value={f.apiKey} onChange={(e) => setF({ ...f, apiKey: e.target.value })} placeholder={v.apiKeyMasked ? 'Laisser vide pour conserver' : ''} /></label>
        <label className="field">Identifiant de la clé (X-API-KEY-ID)<input autoComplete="off" value={f.apiKeyId} onChange={(e) => setF({ ...f, apiKeyId: e.target.value })} /></label>
        <label className="field">Identifiant de la boutique (storeId)<input autoComplete="off" value={f.storeId} onChange={(e) => setF({ ...f, storeId: e.target.value })} /></label>
        <label className="field">Secret de signature du webhook{v.webhookSecretMasked && <span className="small muted"> — actuel : {v.webhookSecretMasked}</span>}<input type="password" autoComplete="off" value={f.webhookSecret} onChange={(e) => setF({ ...f, webhookSecret: e.target.value })} placeholder={v.webhookSecretMasked ? 'Laisser vide pour conserver' : ''} /></label>
        <div className="row wrap">
          <button className="btn primary">Enregistrer</button>
          <button type="button" className="btn" onClick={async () => { try { const r = await api.opTestPayment(); setStores(r.stores); feedback.toast(r.storeFound ? 'Connexion à Jèko réussie, boutique reconnue.' : 'Connexion réussie : choisissez votre boutique dans la liste ci-dessous.', r.storeFound ? 'ok' : 'info') } catch { setStores(null); feedback.toast('Jèko a refusé ces clés ou ne répond pas. Vérifiez-les puis réessayez.', 'error') } }}>Tester la connexion</button>
          <button type="button" className="btn" onClick={async () => { if (!(await feedback.confirm({ tone: 'danger', title: 'Effacer les clés Jèko ?', body: 'Le paiement en ligne sera désactivé tant que de nouvelles clés ne sont pas enregistrées.', confirmLabel: 'Effacer les clés', cancelLabel: 'Garder' }))) return; const r = await api.opClearPaymentSettings(); setV(r); setF({ apiKey: '', apiKeyId: '', storeId: '', webhookSecret: '' }); setStores(null); feedback.toast('Clés Jèko effacées.', 'info') }}>Effacer</button>
        </div>
      </form>
      {stores && (
        <section className="card stack"><h3>Boutiques de votre compte Jèko</h3>
          {stores.map((st) => <div key={st.id} className="row between wrap"><div><strong>{st.name}</strong><p className="small muted">{st.id}</p></div><button className="btn sm" type="button" onClick={() => { setF({ ...f, storeId: st.id }); feedback.toast('Identifiant repris : enregistrez pour l’appliquer.', 'info') }}>Utiliser</button></div>)}
        </section>
      )}
      <section className="card stack">
        <h3>Adresse du webhook à renseigner dans Jèko</h3>
        <code style={{ wordBreak: 'break-all' }}>{v.webhookUrl}</code>
        <button type="button" className="btn sm" style={{ justifySelf: 'start' }} onClick={() => { void navigator.clipboard?.writeText(v.webhookUrl); feedback.toast('Adresse copiée.', 'info') }}>Copier l’adresse</button>
        <p className="small muted">Dans Jèko (Paramètres → API & Webhooks), saisissez cette adresse comme URL de notification et reportez ci-dessus le secret de signature fourni. Sans ce secret, les paiements ne sont pas confirmés automatiquement. Chiffrement : {v.encryptedWith}.</p>
      </section>
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
        <p className="muted small">Ils accèdent à cette console : création d’entreprises, offres, suspensions, validation des inscriptions. Ils peuvent ouvrir une entreprise pour assister ses utilisateurs (chaque entrée est tracée dans le journal).</p>
        {data?.operators.map((o) => (
          <div key={o.userId} className="card row between wrap">
            <div><strong>{o.email}</strong> {o.fromEnv && <Badge tone="brand">Défini par OPERATOR_EMAILS</Badge>}<p className="small muted">depuis le {fmtDate(o.createdAt)}</p></div>
            {o.fromEnv
              ? <span className="small muted">Non retirable ici : modifiez la variable d’environnement.</span>
              : <button className="btn sm" onClick={async () => { if (!(await feedback.confirm({ tone: 'danger', title: `Retirer ${o.email} ?`, body: 'Cette personne n’aura plus accès à la console opérateur.', confirmLabel: 'Retirer', cancelLabel: 'Garder' }))) return; try { await api.opRemoveOperator(o.userId); await load(); feedback.toast(`${o.email} n’est plus opérateur.`, 'info') } catch (e) { feedback.toast(e instanceof ApiError && e.code === 'cannot_remove_self' ? 'Vous ne pouvez pas vous retirer vous-même.' : e instanceof ApiError && e.code === 'env_operator' ? 'Cet opérateur est défini par la configuration du serveur.' : 'Retrait impossible.', 'error') } }}>Retirer</button>}
          </div>
        ))}
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
  const TABS: [Tab, string][] = [['orgs', 'Entreprises'], ['signups', `Demandes${data?.pendingSignups ? ` (${data.pendingSignups})` : ''}`], ['plans', 'Offres'], ['finance', 'Finances'], ['payments', 'Paiements Jèko'], ['billing', 'Usage et facturation'], ['operators', 'Opérateurs']]
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
      {data && tab === 'orgs' && <Orgs plans={data.plans.filter((p) => !p.archived)} orgs={data.orgs} reload={reload} />}
      {data && tab === 'signups' && <Signups plans={data.plans.filter((p) => !p.archived)} reload={reload} />}
      {data && tab === 'plans' && <Plans plans={data.plans} reload={reload} />}
      {data && tab === 'finance' && <Finance plans={data.plans} />}
      {tab === 'payments' && <PaymentSettingsPanel />}
      {tab === 'billing' && <Billing />}
      {tab === 'operators' && <Operators />}
    </div>
  )
}
