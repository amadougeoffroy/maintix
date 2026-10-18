import { useEffect, useState } from 'react'
import { Navigate, NavLink, useParams } from 'react-router-dom'
import { Bell, Building2, LifeBuoy, Users as UsersIcon } from 'lucide-react'
import { api, ApiError, type Member } from '../../api'
import { actions, certStatus, runtime, useData } from '../../store'
import type { OrgSettings } from '../../types'
import { PlanCard } from '../../components/PlanCard'
import { feedback } from '../../feedback'
import { patchOnboarding, useOnboarding } from '../../onboarding'
import { NotificationSettings } from '../../components/NotificationSettings'
import { Badge } from '../../components/ui'
import { fmtDateLong, today } from '../../util'

const ROLE: Record<Member['role'], string> = { admin: 'Administrateur', bureau: 'Bureau', tech: 'Technicien', client: 'Client' }

function Users() {
  const s = useData()
  const [members, setMembers] = useState<Member[]>([])
  const [f, setF] = useState({ email: '', fullName: '', role: 'tech', clientId: '' })
  const [msg, setMsg] = useState('')
  const reload = () => api.members().then((r) => setMembers(r.members)).catch(() => {})
  useEffect(() => { void reload() }, [])
  return (
    <section className="stack">
      <h2>Utilisateurs</h2>
      {members.map((m) => (
        <div key={m.userId} className="card row between wrap">
          <div><strong>{m.fullName}</strong> <span className="badge">{ROLE[m.role]}</span><p className="small muted">{m.email}</p></div>
          {s.session.isAdmin && <button className="btn sm" onClick={async () => { if (!(await feedback.confirm({ tone: 'danger', title: `Retirer ${m.fullName} ?`, body: `${m.fullName} ne pourra plus se connecter à cette entreprise. Ses sessions en cours sont fermées.`, confirmLabel: 'Retirer', cancelLabel: 'Garder' }))) return; try { await api.removeMember(m.userId); await reload(); feedback.toast(`${m.fullName} a été retiré de l’équipe.`) } catch (e) { feedback.toast(e instanceof ApiError && e.code === 'cannot_remove_self' ? 'Vous ne pouvez pas vous retirer vous-même.' : 'Retrait impossible.', 'error') } }}>Retirer</button>}
        </div>
      ))}
      {msg && <p role="alert" style={{ color: 'var(--bad)' }}>{msg}</p>}
      {s.session.isAdmin && (
        <form className="card stack" onSubmit={async (e) => {
          e.preventDefault()
          try { await api.invite({ email: f.email, fullName: f.fullName, role: f.role, clientId: f.role === 'client' ? f.clientId : undefined }); feedback.toast(`Invitation envoyée à ${f.email}.`); setMsg(''); setF({ ...f, email: '', fullName: '' }); await reload() }
          catch (x) { setMsg(x instanceof ApiError && x.code === 'already_member' ? 'Déjà membre.' : x instanceof ApiError && x.code === 'client_unknown' ? 'Choisissez un client existant.' : 'Invitation impossible.') }
        }}>
          <h3>Inviter un utilisateur</h3>
          <input aria-label="Nom complet" required placeholder="Nom complet" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
          <input aria-label="Adresse e-mail" type="email" required placeholder="E-mail" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <select aria-label="Rôle" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="tech">Technicien</option><option value="bureau">Bureau</option><option value="admin">Administrateur</option><option value="client">Client (portail)</option></select>
          {f.role === 'client' && <select aria-label="Client" required value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}><option value="">— Choisir un client —</option>{s.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
          <button className="btn primary">Envoyer l’invitation</button>
        </form>
      )}
    </section>
  )
}

function OrgForm() {
  const s = useData()
  const base: OrgSettings = { id: 'org', legalName: '', address: '', siret: '', vatNumber: '', iban: '', email: '', phone: '', legalFooter: 'En cas de retard de paiement : pénalités de retard exigibles dès le lendemain de l’échéance et indemnité forfaitaire de recouvrement.', paymentDays: 30, vatRate: 20 }
  const [f, setF] = useState<OrgSettings>(s.settings[0] ?? base)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  // les réglages arrivent de la synchronisation (ou d'un changement d'entreprise) : on les reprend tant que l'utilisateur n'a rien modifié
  useEffect(() => { if (!dirty && s.settings[0]) setF(s.settings[0]) }, [s.settings, dirty])
  const F = (k: keyof OrgSettings, label: string, props: Record<string, unknown> = {}) => (
    <label className="field">{label}<input value={String(f[k] ?? '')} onChange={(e) => { setSaved(false); setDirty(true); setF({ ...f, [k]: props.type === 'number' ? +e.target.value : e.target.value }) }} {...props} /></label>
  )
  return (
    <form className="card stack" onSubmit={(e) => { e.preventDefault(); actions.upsertSettings(f); setSaved(true); setDirty(false); feedback.toast('Informations de l’entreprise enregistrées.') }}>
      <h2>Entreprise et facturation</h2>
      <p className="small muted">Ces informations figurent sur vos factures. Vérifiez les mentions légales avec votre expert-comptable.</p>
      <div className="grid2">
        {F('legalName', 'Raison sociale', { required: true })}{F('siret', 'SIRET')}{F('vatNumber', 'N° de TVA intracommunautaire')}{F('iban', 'IBAN')}
        {F('email', 'E-mail', { type: 'email' })}{F('phone', 'Téléphone')}{F('paymentDays', 'Délai de paiement (jours)', { type: 'number', min: 0 })}{F('vatRate', 'TVA par défaut (%)', { type: 'number', step: '0.1' })}
      </div>
      {F('address', 'Adresse')}
      <label className="field">Mentions de pied de facture<textarea value={f.legalFooter} onChange={(e) => { setSaved(false); setDirty(true); setF({ ...f, legalFooter: e.target.value }) }} /></label>
      <div className="row"><button className="btn primary">Enregistrer</button>{saved && <span role="status" className="small">Enregistré.</span>}</div>
    </form>
  )
}

function Help() {
  const { flags } = useOnboarding()
  if (!runtime.server) return null
  return (
    <section className="stack" id="aide">
      <h2>Aide et prise en main</h2>
      <div className="card stack">
        <div className="row wrap">
          <button className="btn sm" onClick={() => { patchOnboarding({ welcomeSeen: false }); feedback.toast('La visite guidée va s’afficher.', 'info') }}>Revoir la visite guidée</button>
          <button className="btn sm" onClick={() => { patchOnboarding({ gettingStartedHidden: false }); feedback.toast('La liste « Premiers pas » est de nouveau affichée sur le tableau de bord.', 'info') }} disabled={flags.gettingStartedHidden === false}>Afficher les premiers pas</button>
        </div>
        <h3>Installer l’application sur un téléphone</h3>
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
          <li><strong>iPhone (Safari)</strong> : bouton Partager → « Sur l’écran d’accueil ». Indispensable pour recevoir les alertes (iOS 16.4 ou plus).</li>
          <li><strong>Android (Chrome)</strong> : menu ⋮ → « Installer l’application » ou « Ajouter à l’écran d’accueil ».</li>
          <li>Ensuite, chaque technicien ouvre <strong>Profil → Alertes d’astreinte</strong> pour activer les notifications.</li>
        </ul>
        {!flags.installDone && <div><button className="btn sm" onClick={() => patchOnboarding({ installDone: true })}>J’ai installé l’application</button></div>}
      </div>
    </section>
  )
}

const TABS = [
  ['entreprise', 'Entreprise', Building2],
  ['equipe', 'Équipe', UsersIcon],
  ['alertes', 'Alertes', Bell],
  ['aide', 'Aide et données', LifeBuoy],
] as const
type TabKey = (typeof TABS)[number][0]

function Team() {
  const s = useData()
  const [label, setLabel] = useState('')
  const [exp, setExp] = useState('')
  const [tech, setTech] = useState(s.techs.find((t) => t.role === 'tech')?.id ?? '')
  return (
    <div className="stack-lg">
      {runtime.server && <Users />}
      <section className="stack">
        <h2>Habilitations des techniciens</h2>
        <p className="muted small">Un technicien dont une habilitation est expirée ne peut plus être affecté à une mission.</p>
        {s.techs.filter((t) => t.role === 'tech').length === 0 && <p className="muted">Aucun technicien pour le moment.</p>}
        {s.techs.filter((t) => t.role === 'tech').map((t) => (
          <div key={t.id} className="card stack">
            <div className="row between"><strong>{t.name}</strong><Badge tone={certStatus(t).ok ? 'ok' : 'bad'}>{certStatus(t).ok ? 'Habilité' : 'Non affectable'}</Badge></div>
            {t.certs.map((c) => <div key={c.label} className="row between small"><span>{c.label}</span><span style={{ color: c.expires < today() ? 'var(--bad)' : undefined }}>{c.expires < today() ? 'Expirée le ' : 'Jusqu’au '}{fmtDateLong(c.expires)}</span></div>)}
          </div>
        ))}
        {s.techs.some((t) => t.role === 'tech') && (
          <form className="card stack" onSubmit={(e) => { e.preventDefault(); actions.addCert(tech, label, exp); setLabel(''); setExp(''); feedback.toast('Habilitation enregistrée.') }}>
            <h3>Ajouter / renouveler une habilitation</h3>
            <select aria-label="Technicien" value={tech} onChange={(e) => setTech(e.target.value)}>{s.techs.filter((t) => t.role === 'tech').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            <input aria-label="Intitulé de l’habilitation" required value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Habilitation électrique B2V" />
            <input aria-label="Date d’expiration" required type="date" value={exp} onChange={(e) => setExp(e.target.value)} />
            <button className="btn">Ajouter</button>
          </form>
        )}
      </section>
    </div>
  )
}

function Data() {
  const s = useData()
  return (
    <section className="stack">
      <h2>Données</h2>
      {runtime.server && s.elevators.length === 0 && (
        <div className="card stack">
          <p className="small muted">Votre entreprise est vide. Pour essayer Maintix sans saisir vos données, vous pouvez charger des clients, appareils et missions d’exemple (à ne pas utiliser pour une entreprise réelle).</p>
          <div><button className="btn" onClick={() => { actions.loadDemo(); feedback.toast('Données de démonstration chargées.') }}>Charger des données de démonstration</button></div>
        </div>
      )}
      <p className="muted small">{runtime.server ? 'Les données sont synchronisées avec le serveur et disponibles hors ligne sur cet appareil.' : 'Mode démonstration : données stockées sur cet appareil uniquement.'}</p>
      {!runtime.server && <div><button className="btn danger" onClick={async () => { if (await feedback.confirm({ tone: 'danger', title: 'Réinitialiser la démonstration ?', body: 'Toutes les modifications faites dans cette démonstration seront effacées et les données d’exemple restaurées.', confirmLabel: 'Réinitialiser' })) { actions.resetDemo(); feedback.toast('Données de démonstration réinitialisées.') } }}>Réinitialiser la démo</button></div>}
    </section>
  )
}

/** Réglages : une section par onglet (adresse propre à chaque onglet : /office/settings/equipe, etc.). */
export default function Settings() {
  const { tab } = useParams()
  if (!TABS.some(([k]) => k === tab)) return <Navigate to="/office/settings/entreprise" replace />
  const current = tab as TabKey
  return (
    <div className="stack-lg">
      <h1>Réglages</h1>
      <nav className="subtabs" aria-label="Sections des réglages">
        {TABS.map(([k, label, Icon]) => (
          <NavLink key={k} to={`/office/settings/${k}`} className={({ isActive }) => `subtab ${isActive ? 'on' : ''}`}><Icon size={18} aria-hidden="true" />{label}</NavLink>
        ))}
      </nav>
      {current === 'entreprise' && (<><PlanCard /><OrgForm /></>)}
      {current === 'equipe' && <Team />}
      {current === 'alertes' && <NotificationSettings />}
      {current === 'aide' && (<><Help /><Data /></>)}
    </div>
  )
}
