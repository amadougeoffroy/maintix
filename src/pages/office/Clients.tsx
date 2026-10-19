import { useState } from 'react'
import { Link } from 'react-router-dom'
import { actions, byId, useData } from '../../store'
import { Badge } from '../../components/ui'
import { feedback } from '../../feedback'
import { fcfa, today, uid } from '../../util'
import type { Client, ClientKind, Contract, Site } from '../../types'
import { Icon } from '../../components/Icon'

const KINDS: Record<ClientKind, string> = { syndic: 'Syndic', bailleur: 'Bailleur', erp: 'ERP', entreprise: 'Entreprise' }
const blankClient = (): Client => ({ id: uid('c'), name: '', kind: 'syndic', contact: '', email: '', phone: '' })
const blankSite = (clientId: string): Site => ({ id: uid('s'), clientId, name: '', address: '', access: '', risks: '' })

export default function Clients() {
  const s = useData()
  const [client, setClient] = useState<Client | null>(null)
  const [site, setSite] = useState<Site | null>(null)
  const [contract, setContract] = useState<Contract | null>(null)

  return (
    <div className="stack-lg">
      <div className="row between wrap"><h1>Clients, sites & contrats</h1><button className="btn primary" onClick={() => setClient(blankClient())}>+ Client</button></div>

      {client && (
        <form className="card stack" onSubmit={(e) => { e.preventDefault(); const isNew = !s.clients.some((c) => c.id === client.id); actions.upsertClient(client); setClient(null); feedback.toast(`Client « ${client.name} » ${isNew ? 'créé' : 'enregistré'}.`) }}>
          <h2>{s.clients.some((c) => c.id === client.id) ? 'Modifier le client' : 'Nouveau client'}</h2>
          <div className="grid2">
            <label className="field">Nom<input required value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} /></label>
            <label className="field">Type<select value={client.kind} onChange={(e) => setClient({ ...client, kind: e.target.value as ClientKind })}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="field">Contact<input value={client.contact} onChange={(e) => setClient({ ...client, contact: e.target.value })} /></label>
            <label className="field">E-mail<input type="email" value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} /></label>
            <label className="field">Téléphone<input type="tel" value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} /></label>
          </div>
          <div className="row"><button className="btn primary">Enregistrer</button><button type="button" className="btn" onClick={() => setClient(null)}>Annuler</button></div>
        </form>
      )}

      {site && (
        <form className="card stack" onSubmit={(e) => { e.preventDefault(); const isNew = !s.sites.some((x) => x.id === site.id); actions.upsertSite(site); setSite(null); feedback.toast(`Site « ${site.name} » ${isNew ? 'créé' : 'enregistré'}.`) }}>
          <h2>{s.sites.some((x) => x.id === site.id) ? 'Modifier le site' : 'Nouveau site'}</h2>
          <label className="field">Nom du site<input required value={site.name} onChange={(e) => setSite({ ...site, name: e.target.value })} /></label>
          <label className="field">Adresse<input required value={site.address} onChange={(e) => setSite({ ...site, address: e.target.value })} /></label>
          <label className="field">Accès (digicode, clés, gardien)<textarea value={site.access} onChange={(e) => setSite({ ...site, access: e.target.value })} /></label>
          <label className="field">Risques du site<textarea value={site.risks} onChange={(e) => setSite({ ...site, risks: e.target.value })} placeholder="Accès toiture, cuvette peu profonde, pas de réseau…" /></label>
          <div className="row"><button className="btn primary">Enregistrer</button><button type="button" className="btn" onClick={() => setSite(null)}>Annuler</button></div>
        </form>
      )}

      {contract && <ContractForm contract={contract} onChange={setContract} />}

      {s.clients.map((c) => {
        const sites = s.sites.filter((x) => x.clientId === c.id)
        const contracts = s.contracts.filter((k) => k.clientId === c.id)
        return (
          <section key={c.id} className="card stack">
            <div className="row between wrap">
              <div><Link to={`/office/clients/${c.id}`}><strong>{c.name}</strong></Link> <Badge>{KINDS[c.kind]}</Badge><p className="small muted">{[c.contact, c.email, c.phone].filter(Boolean).join(' · ')}</p></div>
              <div className="row wrap">
                <button className="btn sm" onClick={() => setClient(c)}>Modifier</button>
                <button className="btn sm" onClick={async () => { if (s.sites.some((x) => x.clientId === c.id)) { feedback.dialog({ tone: 'error', title: 'Suppression impossible', body: `« ${c.name} » a encore des sites : supprimez-les d’abord.` }); return } if (await feedback.confirm({ tone: 'danger', title: `Supprimer « ${c.name} » ?`, body: 'Le client et ses contrats seront supprimés. Cette action est définitive.', confirmLabel: 'Supprimer le client', cancelLabel: 'Garder' })) { actions.deleteClient(c.id); feedback.toast(`Client « ${c.name} » supprimé.`) } }}>Supprimer</button>
              </div>
            </div>
            <div className="stack">
              {sites.map((x) => (
                <div key={x.id} className="row between wrap" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                  <div><strong>{x.name}</strong><p className="small muted">{x.address} · {s.elevators.filter((e) => e.siteId === x.id).length} appareil(s)</p></div>
                  <div className="row"><button className="btn sm" onClick={() => setSite(x)}>Modifier</button><button className="btn sm" onClick={async () => { if (s.elevators.some((e) => e.siteId === x.id)) { feedback.dialog({ tone: 'error', title: 'Suppression impossible', body: `« ${x.name} » contient des appareils : supprimez-les d’abord.` }); return } if (await feedback.confirm({ tone: 'danger', title: `Supprimer le site « ${x.name} » ?`, body: 'Cette action est définitive.', confirmLabel: 'Supprimer le site', cancelLabel: 'Garder' })) { actions.deleteSite(x.id); feedback.toast(`Site « ${x.name} » supprimé.`) } }}>Supprimer</button></div>
                </div>
              ))}
              <button className="btn sm" onClick={() => setSite(blankSite(c.id))}>+ Site</button>
            </div>
            <div className="stack">
              {contracts.map((k) => (
                <div key={k.id} className="row between wrap" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                  <span className="row"><Icon n="file" /> {k.elevatorIds.length} appareil(s) · tous les {k.periodicityMonths} mois · {fcfa(k.priceMonthly)}/mois</span>
                  <div className="row"><button className="btn sm" onClick={() => setContract(k)}>Modifier</button><button className="btn sm" onClick={async () => { if (await feedback.confirm({ tone: 'danger', title: 'Supprimer ce contrat ?', body: `Le contrat de ${c.name} (${fcfa(k.priceMonthly)} par mois) sera supprimé. Pour garder l’historique, préférez « Résilier » dans Contrats.`, confirmLabel: 'Supprimer le contrat', cancelLabel: 'Garder' })) { actions.deleteContract(k.id); feedback.toast('Contrat supprimé.') } }}>Supprimer</button></div>
                </div>
              ))}
              <button className="btn sm" onClick={() => {
                const hasElevator = s.elevators.some((e) => s.sites.some((x) => x.id === e.siteId && x.clientId === c.id))
                if (!hasElevator) { feedback.dialog({ tone: 'error', title: 'Aucun appareil pour ce client', body: `« ${c.name} » n’a encore aucun appareil : un contrat doit couvrir au moins un ascenseur. Ajoutez d’abord un site et un appareil, puis créez le contrat.`, actions: [{ label: 'Ajouter un appareil', primary: true, to: '/office/parc' }, { label: 'Fermer' }] }); return }
                setContract({ id: uid('k'), clientId: c.id, elevatorIds: [], periodicityMonths: 1, priceMonthly: 0, start: today(), indexation: 3 })
              }}>+ Contrat</button>
            </div>
          </section>
        )
      })}
    </div>
  )
}

function ContractForm({ contract, onChange }: { contract: Contract; onChange: (c: Contract | null) => void }) {
  const s = useData()
  const sites = s.sites.filter((x) => x.clientId === contract.clientId)
  const els = s.elevators.filter((e) => sites.some((x) => x.id === e.siteId))
  const taken = (id: string) => s.contracts.some((k) => k.id !== contract.id && k.elevatorIds.includes(id))
  const toggle = (id: string) => onChange({ ...contract, elevatorIds: contract.elevatorIds.includes(id) ? contract.elevatorIds.filter((x) => x !== id) : [...contract.elevatorIds, id] })
  return (
    <form className="card stack" onSubmit={(e) => { e.preventDefault(); const isNew = !s.contracts.some((k) => k.id === contract.id); actions.upsertContract(contract); onChange(null); feedback.toast(`Contrat ${isNew ? 'créé' : 'enregistré'} : ${fcfa(contract.priceMonthly)} par mois, ${contract.elevatorIds.length} appareil(s).`) }}>
      <h2>Contrat – {byId(s.clients, contract.clientId)?.name}</h2>
      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="row between wrap" style={{ fontWeight: 700, width: '100%', padding: 0 }}>
          <span>Appareils couverts</span>
          <span className={`badge ${contract.elevatorIds.length ? 'ok' : ''}`} role="status">{contract.elevatorIds.length} sélectionné(s) sur {els.length}</span>
        </legend>
        {els.length === 0 && <p className="muted small">Ce client n’a pas encore d’appareil : ajoutez-en un avant de créer un contrat.</p>}
        {sites.map((site) => {
          const list = els.filter((e) => e.siteId === site.id)
          if (!list.length) return null
          const free = list.filter((e) => !taken(e.id))
          const allOn = free.length > 0 && free.every((e) => contract.elevatorIds.includes(e.id))
          const setAll = (on: boolean) => onChange({ ...contract, elevatorIds: on ? [...new Set([...contract.elevatorIds, ...free.map((e) => e.id)])] : contract.elevatorIds.filter((id) => !free.some((e) => e.id === id)) })
          return (
            <div key={site.id} className="el-site">
              <div className="row between wrap">
                <div><strong>{site.name}</strong><div className="small muted">{site.address}</div></div>
                {free.length > 1 && <button type="button" className="btn sm" onClick={() => setAll(!allOn)}>{allOn ? 'Tout désélectionner' : 'Tout sélectionner'}</button>}
              </div>
              <div className="el-tiles">
                {list.map((e) => (
                  <label key={e.id} className={`el-tile ${contract.elevatorIds.includes(e.id) ? 'on' : ''} ${taken(e.id) ? 'off' : ''}`}>
                    <input type="checkbox" className="sr-only" disabled={taken(e.id)} checked={contract.elevatorIds.includes(e.id)} onChange={() => toggle(e.id)} />
                    <span className="el-check" aria-hidden="true">{contract.elevatorIds.includes(e.id) ? '✓' : ''}</span>
                    <span className="el-body"><strong>{e.label}</strong><span className="small muted">{[e.brand, e.model].filter(Boolean).join(' ') || 'Appareil'}{e.serial ? ` · n° ${e.serial}` : ''}</span>{taken(e.id) && <span className="small" style={{ color: 'var(--warn)' }}>Déjà sous un autre contrat</span>}</span>
                  </label>
                ))}
              </div>
            </div>
          )
        })}
      </fieldset>
      <div className="grid2">
        <label className="field">Périodicité (mois)<input type="number" min={1} max={12} value={contract.periodicityMonths} onChange={(e) => onChange({ ...contract, periodicityMonths: +e.target.value || 1 })} /></label>
        <label className="field">Prix mensuel HT (FCFA)<input type="number" min={0} value={contract.priceMonthly} onChange={(e) => onChange({ ...contract, priceMonthly: +e.target.value || 0 })} /></label>
        <label className="field">Début<input type="date" value={contract.start} onChange={(e) => onChange({ ...contract, start: e.target.value })} /></label>
        <label className="field">Indexation annuelle (%)<input type="number" step="0.1" value={contract.indexation} onChange={(e) => onChange({ ...contract, indexation: +e.target.value || 0 })} /></label>
        <label className="field">Durée d’un terme (mois)<input type="number" min={1} max={120} value={contract.termMonths ?? 12} onChange={(e) => onChange({ ...contract, termMonths: +e.target.value || 12 })} /></label>
        <label className="field">Préavis de résiliation (mois)<input type="number" min={0} max={12} value={contract.noticeMonths ?? 3} onChange={(e) => onChange({ ...contract, noticeMonths: +e.target.value || 0 })} /></label>
        <label className="row" style={{ alignSelf: 'end', minHeight: 48 }}><input type="checkbox" style={{ width: 24, minHeight: 24 }} checked={contract.autoRenew ?? true} onChange={(e) => onChange({ ...contract, autoRenew: e.target.checked })} /> Reconduction tacite</label>
      </div>
      <div className="row wrap"><button className="btn primary" disabled={contract.elevatorIds.length === 0}>Enregistrer</button><button type="button" className="btn" onClick={() => onChange(null)}>Annuler</button>{contract.elevatorIds.length === 0 && <span className="small muted">Sélectionnez au moins un appareil.</span>}</div>
    </form>
  )
}
