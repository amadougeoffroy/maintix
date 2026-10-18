import { useEffect, useState } from 'react'
import { api } from '../api'
import { switchOrg } from '../session'
import { feedback } from '../feedback'
import { runtime, useData } from '../store'

/** Choix de l'entreprise (utilisateurs rattachés à plusieurs) et création d'une entreprise supplémentaire (administrateur). */
export function OrgSwitcher() {
  const s = useData()
  const [orgs, setOrgs] = useState<{ id: string; name: string; current: boolean }[]>([])
  const [msg, setMsg] = useState('')
  const [name, setName] = useState('')
  const reload = () => api.orgs().then((r) => setOrgs(r.orgs)).catch(() => {})
  useEffect(() => { if (runtime.server) void reload() }, [s.session.orgName])
  if (!runtime.server) return null
  const go = async (id: string) => {
    setMsg('Changement d’entreprise…')
    const r = await switchOrg(id)
    setMsg('')
    if (!r.ok) { feedback.toast(r.error, 'error'); return false }
    return true
  }
  return (
    <section className="stack">
      <h2>Entreprise</h2>
      <p className="muted small">Connecté à <strong>{s.session.orgName}</strong>.</p>
      {orgs.length > 1 && (
        <label className="field">Changer d’entreprise
          <select value={orgs.find((o) => o.current)?.id ?? ''} onChange={async (e) => { const target = orgs.find((o) => o.id === e.target.value); if (await go(e.target.value)) feedback.dialog({ tone: 'info', title: `Vous êtes dans « ${target?.name} »`, body: `Toutes les données affichées (clients, appareils, factures, utilisateurs) sont maintenant celles de « ${target?.name} ».` }) }}>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
        </label>
      )}
      {s.session.isAdmin && (
        <form className="row wrap" onSubmit={async (e) => {
          e.preventDefault()
          const created = name.trim()
          try {
            const r = await api.createOrg(created)
            setName('')
            if (await go(r.orgId)) {
              feedback.dialog({
                title: `Entreprise « ${created} » créée`,
                body: `Vous êtes maintenant connecté à « ${created} ». Cette entreprise est vide et séparée de « ${s.session.orgName} » : ses clients, appareils, factures et utilisateurs lui sont propres.`,
                steps: ['Renseignez « Entreprise et facturation » (raison sociale, SIRET, TVA, IBAN).', 'Invitez son responsable avec le rôle Administrateur (Réglages → Utilisateurs).', 'Importez son parc : Excel, CSV ou copier-coller.', 'Pour revenir à « ' + (s.session.orgName ?? 'votre entreprise') + ' », utilisez « Changer d’entreprise » dans Réglages.'],
                actions: [{ label: 'Plus tard' }, { label: 'Inviter son administrateur', primary: true, to: '/office/settings' }],
              })
            }
            await reload()
          } catch { feedback.toast('Création impossible (limite de 5 entreprises par jour atteinte ?).', 'error') }
        }}>
          <input aria-label="Nom de la nouvelle entreprise" placeholder="Nouvelle entreprise" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 280 }} />
          <button className="btn sm">Créer</button>
        </form>
      )}
      {msg && <p role="status" className="small">{msg}</p>}
    </section>
  )
}
