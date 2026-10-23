import { describe, expect, it } from 'vitest'
import { matchStockItem, movesForVisit, purchaseOrderCsv, reorderList, reorderQty, statusOf, stockLevels, stockRows } from './stock'
import type { StockItem, StockMove } from './types'

const item = (id: string, name: string, minQty: number, extra: Partial<StockItem> = {}): StockItem => ({ id, name, minQty, createdAt: '2026-01-01', ...extra })
const move = (id: string, itemId: string, delta: number, reason: StockMove['reason'] = 'ajustement'): StockMove => ({ id, itemId, delta, reason, at: '2026-01-01T00:00:00.000Z' })

describe('stock de pièces', () => {
  const items = [item('a', 'Galet de porte', 4, { unitCost: 18000, supplier: 'Pièces CI', ref: 'GP-1' }), item('b', 'Contacteur', 3, { unitCost: 22000 }), item('c', 'Patin', 6)]
  const moves = [move('1', 'a', 12, 'inventaire'), move('2', 'a', -9, 'sortie'), move('3', 'b', 5, 'inventaire'), move('4', 'c', 2, 'inventaire'), move('5', 'c', -2, 'visite')]

  it('calcule les niveaux à partir des mouvements', () => {
    const l = stockLevels(moves)
    expect([l.get('a'), l.get('b'), l.get('c')]).toEqual([3, 5, 0])
  })
  it('classe rupture, bas et ok, rupture en premier', () => {
    expect(statusOf(0, 3)).toBe('rupture')
    expect(statusOf(-2, 3)).toBe('rupture')
    expect(statusOf(3, 3)).toBe('bas')
    expect(statusOf(4, 3)).toBe('ok')
    expect(stockRows(items, moves).map((r) => [r.item.id, r.status])).toEqual([['c', 'rupture'], ['a', 'bas'], ['b', 'ok']])
  })
  it('valorise le stock sans compter les niveaux négatifs', () => {
    const rows = stockRows(items, [...moves, move('9', 'b', -9)])
    expect(rows.find((r) => r.item.id === 'a')!.value).toBe(3 * 18000)
    expect(rows.find((r) => r.item.id === 'b')!.value).toBe(0)
  })
  it('n’affiche pas les références archivées', () => {
    expect(stockRows([...items, item('z', 'Ancien', 1, { archived: true })], moves).map((r) => r.item.id)).not.toContain('z')
  })
  it('propose de réapprovisionner jusqu’à deux fois le seuil', () => {
    expect(reorderQty(3, 4)).toBe(5)
    expect(reorderQty(0, 6)).toBe(12)
    expect(reorderQty(-4, 2)).toBe(4)
    expect(reorderQty(1, 0)).toBe(1)
    const list = reorderList(items, moves)
    expect(list.map((l) => [l.item.id, l.qty])).toEqual([['c', 12], ['a', 5]])
    expect(list.find((l) => l.item.id === 'a')!.cost).toBe(5 * 18000)
  })
  it('reconnaît une pièce de visite par identifiant ou par nom, sans casse ni accents', () => {
    expect(matchStockItem(items, { name: 'x', qty: 1, stockId: 'b' })?.id).toBe('b')
    expect(matchStockItem(items, { name: 'GALET DE PORTE', qty: 1 })?.id).toBe('a')
    expect(matchStockItem([item('e', 'Câble électrique', 1)], { name: 'cable electrique', qty: 1 })?.id).toBe('e')
    expect(matchStockItem(items, { name: 'Inconnue', qty: 1 })).toBeUndefined()
    expect(matchStockItem([item('z', 'Galet de porte', 1, { archived: true })], { name: 'Galet de porte', qty: 1 })).toBeUndefined()
  })
  it('produit les sorties de stock d’une visite clôturée (pièces du stock uniquement)', () => {
    let n = 0
    const out = movesForVisit(items, [{ name: 'Galet de porte', qty: 2 }, { name: 'Pièce hors stock', qty: 1 }, { name: 'Contacteur', qty: 0 }, { name: 'x', qty: 1, stockId: 'c' }], 'j1', '2026-02-01T10:00:00.000Z', () => `m${++n}`, 't1')
    expect(out).toEqual([
      { id: 'm1', itemId: 'a', delta: -2, reason: 'visite', jobId: 'j1', at: '2026-02-01T10:00:00.000Z', by: 't1' },
      { id: 'm2', itemId: 'c', delta: -1, reason: 'visite', jobId: 'j1', at: '2026-02-01T10:00:00.000Z', by: 't1' },
    ])
  })
  it('génère un bon de commande CSV groupé par fournisseur', () => {
    const csv = purchaseOrderCsv(reorderList(items, moves))
    const rows = csv.replace(/^﻿/, '').trim().split('\r\n').map((r) => r.split(';'))
    expect(rows[0]).toHaveLength(8)
    expect(rows[1][0]).toBe('Pièces CI') // groupé par fournisseur, ceux sans fournisseur en dernier
    expect(rows[1]).toEqual(['Pièces CI', 'GP-1', 'Galet de porte', '3', '4', '5', '18000', '90000'])
    expect(rows[2][0]).toBe('Fournisseur à définir')
    expect(csv.startsWith('﻿')).toBe(true)
  })
})
