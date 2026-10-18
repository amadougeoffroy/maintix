import { describe, expect, it } from 'vitest'
import { detectDelimiter, parseDelimited, parseParc, TEMPLATE_CSV } from './importer'

describe('import du parc', () => {
  it('détecte le séparateur', () => {
    expect(detectDelimiter('a;b;c')).toBe(';')
    expect(detectDelimiter('a\tb\tc')).toBe('\t')
    expect(detectDelimiter('a,b,c')).toBe(',')
  })
  it('gère les guillemets et sauts de ligne dans une cellule', () => {
    expect(parseDelimited('a;"b;1";"x ""y"""\n1;2;3', ';')).toEqual([['a', 'b;1', 'x "y"'], ['1', '2', '3']])
  })
  it('importe le modèle fourni', () => {
    const r = parseParc(TEMPLATE_CSV)
    expect(r.errors).toEqual([])
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({ client: 'Syndic Les Tilleuls', brand: 'Kone', year: 2011, stops: 6, machineRoom: 'sans local' })
  })
  it('reconnaît des en-têtes Excel variés et colle depuis Excel (tabulations)', () => {
    const txt = 'Immeuble\tAscenseur\tConstructeur\tNuméro de série\tAnnée de mise en service\nRésidence X\tAsc 1\tOtis\tOT-1\t1999\nRésidence X\tAsc 1\tOtis\tOT-1\t1999'
    const r = parseParc(txt)
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({ site: 'Résidence X', brand: 'Otis', serial: 'OT-1', year: 1999, client: 'Client importé' })
    expect(r.errors[0].message).toContain('Doublon')
  })
  it('signale les colonnes obligatoires manquantes', () => {
    const r = parseParc('Marque;Année\nKone;2000')
    expect(r.rows).toEqual([])
    expect(r.errors.length).toBeGreaterThan(0)
  })
})
