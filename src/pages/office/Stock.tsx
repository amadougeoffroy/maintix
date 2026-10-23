import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { actions, useData } from '../../store'
import { Badge } from '../../components/ui'
import { feedback } from '../../feedback'
import { purchaseOrderCsv, reorderList, stockRows, type StockRow, type StockStatus } from '../../stock'
import { downloadText, fcfa, fmtDate } from '../../util'
import type { StockItem, StockMove } from '../../types'

type Filter = 'tout' | 'alerte' | 'rupture'
type Action = 'achat' | 'sortie' | 'inventaire'
const STATUS: Record<StockStatus, { label: string; tone: 'ok' | 'warn' | 'bad' }> = { ok: { label: 'En stock', tone: 'ok' }, bas: { label: 'Stock bas', tone: 'warn' }, rupture: { label: 'Rupture', tone: 'bad' } }
const REASON: Record<StockMove['reason'], string> = { inventaire: 'Inventaire', achat: 'Entrée (achat)', sortie: 'Sortie', visite: 'Visite', ajustement: 'Ajustement' }
const ACTION_LABEL: Record<Action, string> = { achat: 'Entrée de stock', sortie: 'Sortie de stock', inventaire: 'Inventaire (quantité comptée)' }
const blank = { name: '', ref: '', unit: 'pièce', minQty: '2', unitCost: '', supplier: '', qty: '0' }

function MovePanel({ row, action, onDone }: { row: StockRow; action: Action; onDone: () => void }) {
  const [qty, setQty] = useState(action === 'inventaire' ? String(row.level) : '1')
  const [note, setNote] = useState('')
  return (
    <form className="card stack" onSubmit={async (e) => {
      e.preventDefault()
      const n = Number(qty.replace(',', '.'))
      if (!Number.isFinite(n) || (action !== 'inventaire' && n <= 0) || (action === 'inventaire' && n < 0)) { feedback.toast('Quantité invalide.', 'error'); return }
      if (action === 'sortie' && n > row.level && !(await feedback.confirm({ title: 'Sortie supérieure au stock', body: `Le stock affiche ${row.level} ${row.item.unit ?? ''}. Sortir ${n} le rendra négatif : vérifiez votre comptage ou faites un inventaire.`, confirmLabel: 'Sortir quand même', cancelLabel: 'Annuler' }))) return
      actions.addStockMove(row.item.id, action, n, note)
      feedback.toast(action === 'achat' ? `${n} × ${row.item.name} ajouté(s) au stock.` : action === 'sortie' ? `${n} × ${row.item.name} sorti(s) du stock.` : `Inventaire enregistré : ${n} × ${row.item.name}.`)
      onDone()
    }}>
      <h3>{ACTION_LABEL[action]} · {row.item.name}</h3>
      <div className="grid2">
        <label className="field">{action === 'inventaire' ? 'Quantité comptée' : 'Quantité'}<input inputMode="decimal" required value={qty} onChange={(e) => setQty(e.target.value)} /></label>
        <label className="field">Note (facultatif)<input value={note} onChange={(e) => setNote(e.target.value)} placeholder={action === 'achat' ? 'N° de bon de livraison…' : action === 'sortie' ? 'Chantier, véhicule…' : 'Comptage du…'} /></label>
      </div>
      <div className="row"><button className="btn primary">Enregistrer</button><button type="button" className="btn" onClick={onDone}>Annuler</button></div>
    </form>
  )
}

function ItemForm({ item, onDone }: { item?: StockItem; onDone: () => void }) {
  const [f, setF] = useState(item ? { name: item.name, ref: item.ref ?? '', unit: item.unit ?? 'pièce', minQty: String(item.minQty), unitCost: item.unitCost ? String(item.unitCost) : '', supplier: item.supplier ?? '', qty: '0' } : blank)
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <form className="card stack" onSubmit={(e) => {
      e.preventDefault()
      const data = { name: f.name.trim(), ref: f.ref.trim() || undefined, unit: f.unit.trim() || undefined, minQty: Math.max(0, Number(f.minQty) || 0), unitCost: f.unitCost ? Math.max(0, Math.round(Number(f.unitCost))) : undefined, supplier: f.supplier.trim() || undefined }
      if (item) { actions.updateStockItem(item.id, data); feedback.toast(`« ${data.name} » mis à jour.`) }
      else { actions.addStockItem(data, Math.max(0, Number(f.qty) || 0)); feedback.toast(`« ${data.name} » ajouté au stock.`) }
      onDone()
    }}>
      <h3>{item ? `Modifier ${item.name}` : 'Nouvelle pièce'}</h3>
      <div className="grid2">
        <label className="field">Désignation<input required minLength={2} value={f.name} onChange={set('name')} placeholder="Galet de porte palière" /></label>
        <label className="field">Référence<input value={f.ref} onChange={set('ref')} placeholder="GP-100" /></label>
        <label className="field">Unité<input value={f.unit} onChange={set('unit')} /></label>
        <label className="field">Seuil d’alerte<input inputMode="numeric" required value={f.minQty} onChange={set('minQty')} /></label>
        <label className="field">Coût unitaire (FCFA)<input inputMode="numeric" value={f.unitCost} onChange={set('unitCost')} /></label>
        <label className="field">Fournisseur<input value={f.supplier} onChange={set('supplier')} /></label>
        {!item && <label className="field">Quantité en stock<input inputMode="numeric" value={f.qty} onChange={set('qty')} /></label>}
      </div>
      <div className="row"><button className="btn primary">Enregistrer</button><button type="button" className="btn" onClick={onDone}>Annuler</button></div>
    </form>
  )
}

export default function Stock() {
  const s = useData()
  const [filter, setFilter] = useState<Filter>('tout')
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [panel, setPanel] = useState<{ id: string; action: Action } | null>(null)
  const [showOrder, setShowOrder] = useState(false)
  const rows = useMemo(() => stockRows(s.stock, s.stockMoves), [s.stock, s.stockMoves])
  const alerts = rows.filter((r) => r.status !== 'ok')
  const value = rows.reduce((t, r) => t + r.value, 0)
  const shown = rows.filter((r) => (filter === 'tout' || (filter === 'alerte' ? r.status !== 'ok' : r.status === 'rupture')) && [r.item.name, r.item.ref, r.item.supplier].join(' ').toLowerCase().includes(q.trim().toLowerCase()))
  const order = useMemo(() => reorderList(s.stock, s.stockMoves), [s.stock, s.stockMoves])
  const orderTotal = order.reduce((t, l) => t + l.cost, 0)
  const history = (id: string) => s.stockMoves.filter((m) => m.itemId === id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 15)

  return (
    <div className="stack-lg">
      <div className="row between wrap no-print">
        <div><h1>Stock de pièces</h1><p className="muted">Niveaux, alertes de seuil et réapprovisionnement. Les pièces utilisées en visite sont déduites à la clôture.</p></div>
        <div className="row wrap">
          <button className="btn" onClick={() => setShowOrder(!showOrder)} aria-expanded={showOrder}>Bon de commande{alerts.length ? ` (${alerts.length})` : ''}</button>
          <button className="btn primary" onClick={() => { setAdding(!adding); setEditing(null) }}>+ Pièce</button>
        </div>
      </div>

      <div className="grid2 no-print" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <div className="card kpi"><span className="muted small">Références</span><b>{rows.length}</b></div>
        <div className="card kpi"><span className="muted small">Valeur du stock</span><b>{fcfa(value)}</b></div>
        <div className="card kpi"><span className="muted small">À réapprovisionner</span><b style={alerts.length ? { color: 'var(--warn)' } : undefined}>{alerts.length}</b><span className="small muted">dont {rows.filter((r) => r.status === 'rupture').length} en rupture</span></div>
      </div>

      {adding && <div className="no-print"><ItemForm onDone={() => setAdding(false)} /></div>}

      {showOrder && (
        <section className="card stack paper" aria-label="Bon de commande">
          <div className="row between wrap"><h2>Bon de commande</h2>
            <span className="row no-print">
              <button className="btn sm" disabled={!order.length} onClick={() => downloadText(`bon-de-commande-${new Date().toISOString().slice(0, 10)}.csv`, purchaseOrderCsv(order))}>Télécharger (CSV)</button>
              <button className="btn sm" disabled={!order.length} onClick={() => window.print()}>Imprimer</button>
            </span>
          </div>
          {order.length === 0 ? <p className="muted">Rien à commander : tous les niveaux sont au-dessus du seuil.</p> : (
            <>
              <p className="small muted">Quantités proposées pour revenir à deux fois le seuil d’alerte.</p>
              <div className="table-wrap" tabIndex={0} role="region" aria-label="Pièces à commander"><table>
                <thead><tr><th scope="col">Fournisseur</th><th scope="col">Référence</th><th scope="col">Désignation</th><th scope="col">Stock</th><th scope="col">À commander</th><th scope="col">Total estimé</th></tr></thead>
                <tbody>{[...order].sort((a, b) => (a.item.supplier ?? 'zzz').localeCompare(b.item.supplier ?? 'zzz', 'fr')).map((l) => (
                  <tr key={l.item.id}><td>{l.item.supplier ?? '—'}</td><td>{l.item.ref ?? '—'}</td><td>{l.item.name}</td><td>{l.level}</td><td><strong>{l.qty}</strong> {l.item.unit ?? ''}</td><td>{l.cost ? fcfa(l.cost) : '—'}</td></tr>
                ))}</tbody>
                <tfoot><tr><td colSpan={5}><strong>Total estimé</strong></td><td><strong>{fcfa(orderTotal)}</strong></td></tr></tfoot>
              </table></div>
            </>
          )}
        </section>
      )}

      <div className="row between wrap no-print">
        <div className="seg" role="radiogroup" aria-label="Filtrer le stock">
          {([['tout', `Tout (${rows.length})`], ['alerte', `À réapprovisionner (${alerts.length})`], ['rupture', `Ruptures (${rows.filter((r) => r.status === 'rupture').length})`]] as const).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={filter === k} className={filter === k ? 'ok on' : ''} onClick={() => setFilter(k)}>{label}</button>
          ))}
        </div>
        <input type="search" aria-label="Rechercher une pièce" placeholder="Rechercher une pièce, une référence…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
      </div>

      {rows.length === 0 && <p className="muted">Aucune pièce en stock. Ajoutez vos références avec « + Pièce », ou chargez les données de démonstration dans Réglages.</p>}
      {rows.length > 0 && shown.length === 0 && <p className="muted">Aucune pièce ne correspond.</p>}
      <div className="stack no-print">
        {shown.map((r) => (
          <article key={r.item.id} className="card stack">
            <div className="row between wrap">
              <div>
                <h3>{r.item.name} {r.item.ref && <span className="small muted">· {r.item.ref}</span>}</h3>
                <p className="small muted">{r.item.supplier ?? 'Fournisseur non renseigné'}{r.item.unitCost ? ` · ${fcfa(r.item.unitCost)} l’unité` : ''} · seuil d’alerte {r.item.minQty}</p>
              </div>
              <div className="row wrap">
                <strong style={{ fontSize: '1.4rem' }} aria-label={`Stock : ${r.level} ${r.item.unit ?? ''}`}>{r.level} <small className="muted">{r.item.unit ?? ''}</small></strong>
                <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
              </div>
            </div>
            <div className="row wrap">
              <button className="btn sm" onClick={() => setPanel({ id: r.item.id, action: 'achat' })}>+ Entrée</button>
              <button className="btn sm" onClick={() => setPanel({ id: r.item.id, action: 'sortie' })}>− Sortie</button>
              <button className="btn sm" onClick={() => setPanel({ id: r.item.id, action: 'inventaire' })}>Inventaire</button>
              <button className="btn sm" onClick={() => { setEditing(editing === r.item.id ? null : r.item.id); setAdding(false) }}>Modifier</button>
              <button className="btn sm" onClick={async () => { if (await feedback.confirm({ tone: 'danger', title: `Retirer « ${r.item.name} » du stock ?`, body: 'La référence est archivée : elle n’apparaît plus, mais l’historique des mouvements est conservé.', confirmLabel: 'Archiver', cancelLabel: 'Garder' })) { actions.updateStockItem(r.item.id, { archived: true }); feedback.toast(`« ${r.item.name} » archivée.`, 'info') } }}>Archiver</button>
            </div>
            {panel?.id === r.item.id && <MovePanel row={r} action={panel.action} onDone={() => setPanel(null)} />}
            {editing === r.item.id && <ItemForm item={r.item} onDone={() => setEditing(null)} />}
            <details>
              <summary>Historique ({s.stockMoves.filter((m) => m.itemId === r.item.id).length} mouvement(s))</summary>
              <ul className="stock-history">
                {history(r.item.id).map((m) => (
                  <li key={m.id}><span className="muted small">{fmtDate(m.at)}</span> <strong style={{ color: m.delta < 0 ? 'var(--bad)' : 'var(--ok)' }}>{m.delta > 0 ? '+' : ''}{m.delta}</strong> {REASON[m.reason]}{m.note ? ` · ${m.note}` : ''}{m.jobId ? <> · <Link to={`/report/${m.jobId}`}>rapport</Link></> : null}</li>
                ))}
              </ul>
            </details>
          </article>
        ))}
      </div>
    </div>
  )
}
