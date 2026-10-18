import { describe, expect, it } from 'vitest'
import { suggestFromNote } from './notes'

describe('note dictée → suggestions', () => {
  it('extrait pièces remplacées avec quantités', () => {
    const r = suggestFromNote('Remplacé deux galets de porte au 3e. Changé 1 contacteur.')
    expect(r.parts).toEqual([{ name: 'Galet de porte palière', qty: 2 }, { name: 'Contacteur', qty: 1 }])
  })
  it('détecte les défauts et les points à surveiller', () => {
    const r = suggestFromNote('Câbles usés côté contrepoids. Frein à surveiller.')
    expect(r.items).toEqual([
      { key: 'cab_cables', status: 'ko', note: 'Câbles usés côté contrepoids' },
      { key: 'mach_frein', status: 'watch', note: 'Frein à surveiller' },
    ])
  })
  it('lit le test de l’appel d’urgence', () => {
    expect(suggestFromNote('Appel d’urgence testé ok').emergencyCallTest).toBe('ok')
    expect(suggestFromNote('Appel d’urgence ne fonctionne pas').emergencyCallTest).toBe('ko')
    expect(suggestFromNote('RAS').emergencyCallTest).toBeNull()
  })
  it('ne propose pas de pièce sans verbe de remplacement', () => {
    expect(suggestFromNote('Galet usé').parts).toEqual([])
  })
})
