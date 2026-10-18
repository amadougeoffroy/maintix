import { describe, expect, it } from 'vitest'
import { search } from './search'
import { seed } from './seed'

describe('recherche globale', () => {
  const s = seed()
  it('trouve sans tenir compte des accents ni de la casse', () => {
    expect(search(s, 'HOTEL').some((h) => h.kind === 'client' && h.title.includes('Hôtel'))).toBe(true)
    expect(search(s, 'residence lilas').some((h) => h.kind === 'client')).toBe(true)
  })
  it('exige tous les mots et cherche dans les numéros de série', () => {
    const hits = search(s, 'otis 7732')
    expect(hits.filter((h) => h.kind === 'appareil').map((h) => h.title)).toEqual(['Ascenseur Sud'])
    expect(search(s, 'otis zzzz')).toEqual([])
    expect(search(s, '   ')).toEqual([])
  })
  it('retrouve défauts et pannes par leur texte et envoie vers la bonne page', () => {
    const d = search(s, 'éclairage secours').find((h) => h.kind === 'defaut')
    expect(d?.to).toBe('/office/defects')
    const p = search(s, 'porte palière 9e').find((h) => h.kind === 'rapport')
    expect(p?.title).toContain('Dépannage')
  })
  it('classe un début de mot avant un simple fragment et limite le nombre par catégorie', () => {
    const hits = search(s, 'a', 2)
    const byKind = new Map<string, number>()
    for (const h of hits) byKind.set(h.kind, (byKind.get(h.kind) ?? 0) + 1)
    expect([...byKind.values()].every((n) => n <= 2)).toBe(true)
    const first = search(s, 'lilas')[0]
    expect(first.score).toBeGreaterThanOrEqual(3)
  })
})
