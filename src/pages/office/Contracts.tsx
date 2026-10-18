import { actions, byId, useData } from '../../store'
import { Badge } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { applyIndexation, autoRenew, contractStatus, indexationDue, indexedPrice, nextIndexation, noticeDeadline, noticeMonths, renew, STATUS_LABEL, terminate, termEnd, termMonths, type ContractStatus } from '../../contracts'
import { eur, fmtDateLong, today } from '../../util'

const TONE: Record<ContractStatus, 'ok' | 'warn' | 'bad' | 'brand' | undefined> = { actif: 'ok', preavis_proche: 'warn', preavis_depasse: 'brand', echu: 'bad', resilie: undefined }
const ORDER: ContractStatus[] = ['echu', 'preavis_proche', 'actif', 'preavis_depasse', 'resilie']

export default function Contracts() {
  const s = useData()
  const on = today()
  const list = [...s.contracts].sort((a, b) => ORDER.indexOf(contractStatus(a, on)) - ORDER.indexOf(contractStatus(b, on)))
  const live = s.contracts.filter((c) => contractStatus(c, on) !== 'resilie')
  const total = live.reduce((t, c) => t + c.priceMonthly * 12, 0)
  return (
    <div className="stack-lg">
      <div><h1>Contrats</h1><p className="muted">Chiffre d’affaires récurrent annuel : <strong>{eur(total)}</strong> · {live.length} contrat(s) actif(s)</p></div>
      <div className="grid2">
        {list.map((c) => {
          const cl = byId(s.clients, c.clientId)!
          const st = contractStatus(c, on)
          const due = indexationDue(c, on)
          return (
            <div key={c.id} className="card stack">
              <div className="row between wrap"><strong>{cl.name}</strong><Badge tone={TONE[st]}>{STATUS_LABEL[st]}</Badge></div>
              <p>{eur(c.priceMonthly)} / mois · {eur(c.priceMonthly * 12)} / an · visite tous les {c.periodicityMonths} mois</p>
              <p className="small muted">
                Début {fmtDateLong(c.start)} · terme de {termMonths(c)} mois · {autoRenew(c) ? 'reconduction tacite' : 'sans reconduction tacite'}<br />
                {st !== 'resilie' && <>Fin du terme : <strong>{fmtDateLong(termEnd(c, on))}</strong> · {autoRenew(c) ? <>congé avant le <strong>{fmtDateLong(noticeDeadline(c, on))}</strong> ({noticeMonths(c)} mois de préavis)</> : 'à renouveler avant cette date'}</>}
                {c.terminatedAt && <>Résilié le {fmtDateLong(c.terminatedAt)}</>}
              </p>
              <p className="small muted">Indexation {c.indexation} % par an · prochaine : {fmtDateLong(nextIndexation(c))}{due && <> · <Badge tone="warn">à appliquer</Badge></>}</p>
              <ul style={{ margin: 0, paddingLeft: 18 }}>{c.elevatorIds.map((id) => { const e = byId(s.elevators, id); return <li key={id}>{e?.label} <span className="muted small">({byId(s.sites, e?.siteId)?.name})</span></li> })}</ul>
              {(c.priceHistory?.length ?? 0) > 0 && <details><summary className="small">Historique des prix</summary><ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>{c.priceHistory!.map((h, i) => <li key={i}>{fmtDateLong(h.date)} : {eur(h.from)} → {eur(h.to)} (+{h.rate} %)</li>)}</ul></details>}
              {st !== 'resilie' && (
                <div className="row wrap">
                  {due && <button className="btn sm primary" onClick={() => { if (confirm(`Passer ${eur(c.priceMonthly)} à ${eur(indexedPrice(c))} par mois ?`)) actions.upsertContract(applyIndexation(c, on)) }}>Appliquer l’indexation → {eur(indexedPrice(c))}</button>}
                  {!autoRenew(c) && <button className="btn sm" onClick={() => actions.upsertContract(renew(c))}><Icon n="check" /> Renouveler d’un terme</button>}
                  <button className="btn sm" onClick={() => { if (confirm(`Résilier le contrat de ${cl.name} ? Les visites planifiées restent à annuler.`)) actions.upsertContract(terminate(c, on)) }}>Résilier</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {s.elevators.filter((e) => !live.some((c) => c.elevatorIds.includes(e.id))).length > 0 && <p className="muted small">Appareils hors contrat signalés « Hors contrat » dans le parc.</p>}
    </div>
  )
}
