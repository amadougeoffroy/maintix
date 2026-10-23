/** Stock de pièces : niveaux calculés à partir des mouvements, alertes de seuil, liste de réapprovisionnement. */
import type { Part, StockItem, StockMove } from './types'

export type StockStatus = 'rupture' | 'bas' | 'ok'

/** Niveau actuel de chaque référence (somme des mouvements). */
export function stockLevels(moves: StockMove[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const x of moves) m.set(x.itemId, (m.get(x.itemId) ?? 0) + x.delta)
  return m
}
export const levelOf = (moves: StockMove[], itemId: string) => stockLevels(moves).get(itemId) ?? 0

export function statusOf(level: number, minQty: number): StockStatus {
  if (level <= 0) return 'rupture'
  return level <= minQty ? 'bas' : 'ok'
}

export interface StockRow { item: StockItem; level: number; status: StockStatus; value: number }
export function stockRows(items: StockItem[], moves: StockMove[], includeArchived = false): StockRow[] {
  const levels = stockLevels(moves)
  return items
    .filter((i) => includeArchived || !i.archived)
    .map((item) => { const level = levels.get(item.id) ?? 0; return { item, level, status: statusOf(level, item.minQty), value: Math.max(0, level) * (item.unitCost ?? 0) } })
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.item.name.localeCompare(b.item.name, 'fr'))
}
const ORDER: Record<StockStatus, number> = { rupture: 0, bas: 1, ok: 2 }

/** Quantité à commander pour revenir à deux fois le seuil (au moins 1). */
export const reorderQty = (level: number, minQty: number) => Math.max(1, minQty * 2 - Math.max(0, level))

export interface ReorderLine { item: StockItem; level: number; qty: number; cost: number }
export function reorderList(items: StockItem[], moves: StockMove[]): ReorderLine[] {
  return stockRows(items, moves).filter((r) => r.status !== 'ok').map((r) => { const qty = reorderQty(r.level, r.item.minQty); return { item: r.item, level: r.level, qty, cost: qty * (r.item.unitCost ?? 0) } })
}

/** Pièce du stock correspondant à une pièce saisie en visite : par identifiant, sinon par nom (sans tenir compte de la casse ni des accents). */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
export function matchStockItem(items: StockItem[], part: Part): StockItem | undefined {
  const active = items.filter((i) => !i.archived)
  return (part.stockId ? active.find((i) => i.id === part.stockId) : undefined) ?? active.find((i) => norm(i.name) === norm(part.name))
}

/** Mouvements de sortie à enregistrer quand une visite est clôturée avec ces pièces. */
export function movesForVisit(items: StockItem[], parts: Part[], jobId: string, at: string, newId: () => string, by?: string): StockMove[] {
  const out: StockMove[] = []
  for (const p of parts) {
    const item = matchStockItem(items, p)
    if (!item || p.qty <= 0) continue
    out.push({ id: newId(), itemId: item.id, delta: -p.qty, reason: 'visite', jobId, at, ...(by ? { by } : {}) })
  }
  return out
}

const fr = (n: number) => String(n).replace('.', ',')
/** Bon de commande (CSV, séparateur « ; ») groupé par fournisseur. */
export function purchaseOrderCsv(lines: ReorderLine[]): string {
  const rows = [['Fournisseur', 'Référence', 'Désignation', 'Stock actuel', 'Seuil', 'Quantité à commander', 'Coût unitaire (FCFA)', 'Total (FCFA)']]
  for (const l of [...lines].sort((a, b) => (a.item.supplier ?? 'zzz').localeCompare(b.item.supplier ?? 'zzz', 'fr') || a.item.name.localeCompare(b.item.name, 'fr'))) {
    rows.push([l.item.supplier ?? 'Fournisseur à définir', l.item.ref ?? '', l.item.name, fr(l.level), fr(l.item.minQty), fr(l.qty), String(l.item.unitCost ?? ''), String(l.cost)])
  }
  const cell = (v: string) => (/[;"\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v)
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n'
}
