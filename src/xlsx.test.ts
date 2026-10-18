import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readSheet } from 'read-excel-file/node'
import { importFromRows, rowsToTsv } from './xlsx'

describe('import Excel (.xlsx)', () => {
  it('convertit des lignes en texte tabulé en nettoyant tabulations et sauts de ligne', () => {
    expect(rowsToTsv([['a', 1, null], ['x\ty', true, new Date('2026-03-01T10:00:00Z')]])).toBe('a\t1\t\nx y\ttrue\t2026-03-01')
  })
  it('lit un vrai fichier .xlsx et crée les appareils attendus', async () => {
    const rows = await readSheet(readFileSync(new URL('./__fixtures__/parc.xlsx', import.meta.url)))
    const r = importFromRows(rows as (string | number | null)[][])
    expect(r.errors).toEqual([])
    expect(r.rows).toHaveLength(3)
    expect(r.rows[0]).toMatchObject({ client: 'Syndic Excel', site: 'Bât. X', label: 'Asc X1', brand: 'Kone', serial: 'KX-1', year: 2012, stops: 6, machineRoom: 'sans local' })
    expect(r.rows[2]).toMatchObject({ client: 'Bailleur Y', machineRoom: 'bas', year: 2005, loadKg: 800 })
  })
})
