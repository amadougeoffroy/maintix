import { useEffect, useState } from 'react'
import { api, ApiError, type Member } from '../../api'
import { actions, certStatus, runtime, useData } from '../../store'
import type { OrgSettings } from '../../types'
import { OrgSwitcher } from '../../components/OrgSwitcher'
import { feedback } from '../../feedback'
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
          {s.session.isAdmin && <button className="btn sm" onClick={async () => { if (confirm(`Retirer ${m.fullName} ?`)) { try { await api.removeMember(m.userId); await reload() } catch (e) { setMsg(e instanceof ApiError && e.code === 'cannot_remove_self' ? 'Vous ne pouvez pas vous retirer vous-même.' : 'Suppression impossible.') } } }}>Retirer</button>}
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
  const base: OrgSettings = { id: 'org', legalName: '', address: '', siret: '', vatNumber: '', iban: '', email: '', phone: '', legalFooter: 'En cas de retard de paiement : pénalités au taux de 3 fois le taux d’intérêt légal et indemnité forfaitaire de recouvrement de 40 €.', paymentDays: 30, vatRate: 20 }
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

export default function Settings() {
  const s = useData()
  const [label, setLabel] = useState('')
  const [exp, setExp] = useState('')
  const [tech, setTech] = useState(s.techs.find((t) => t.role === 'tech')?.id ?? '')
  return (
    <div className="stack-lg">
      <h1>Réglages</h1>
      <NotificationSettings />
      <OrgSwitcher />
      <OrgForm />
      <section className="stack">
        <h2>Équipe & habilitations</h2>
        {s.techs.filter((t) => t.role === 'tech').map((t) => (
          <div key={t.id} className="card stack">
            <div className="row between"><strong>{t.name}</strong><Badge tone={certStatus(t).ok ? 'ok' : 'bad'}>{certStatus(t).ok ? 'Habilité' : 'Non affectable'}</Badge></div>
            {t.certs.map((c) => <div key={c.label} className="row between small"><span>{c.label}</span><span style={{ color: c.expires < today() ? 'var(--bad)' : undefined }}>{c.expires < today() ? 'Expirée le ' : 'Jusqu’au '}{fmtDateLong(c.expires)}</span></div>)}
          </div>
        ))}
        <form className="card stack" onSubmit={(e) => { e.preventDefault(); actions.addCert(tech, label, exp); setLabel(''); setExp('') }}>
          <h3>Ajouter / renouveler une habilitation</h3>
          <select aria-label="Technicien" value={tech} onChange={(e) => setTech(e.target.value)}>{s.techs.filter((t) => t.role === 'tech').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <input aria-label="Intitulé de l’habilitation" required value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Habilitation électrique B2V" />
          <input aria-label="Date d’expiration" required type="date" value={exp} onChange={(e) => setExp(e.target.value)} />
          <button className="btn">Ajouter</button>
        </form>
      </section>
      {runtime.server && <Users />}
      <section className="stack">
        <h2>Données</h2>
        {runtime.server && s.elevators.length === 0 && <button className="btn" onClick={() => actions.loadDemo()}>Charger des données de démonstration</button>}
        <p className="muted small">{runtime.server ? 'Les données sont synchronisées avec le serveur et disponibles hors ligne sur cet appareil.' : 'Mode démonstration : données stockées sur cet appareil uniquement.'}</p>
        {!runtime.server && <button className="btn danger" onClick={() => { if (confirm('Réinitialiser les données de démonstration ?')) actions.resetDemo() }}>Réinitialiser la démo</button>}
      </section>
    </div>
  )
}
