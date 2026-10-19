import { describe, expect, it } from 'vitest'
import { decideMode } from './demo'

describe('mode de démarrage', () => {
  it('serveur joignable : mode serveur, pas de démo', () => {
    expect(decideMode({ reachable: true, explicitDemo: false, localHost: false })).toEqual({ demo: false, explicitDemo: false, server: true, unreachable: false })
  })
  it('serveur injoignable sur un vrai site : jamais la démo, message « service injoignable »', () => {
    expect(decideMode({ reachable: false, explicitDemo: false, localHost: false })).toEqual({ demo: false, explicitDemo: false, server: false, unreachable: true })
  })
  it('serveur absent en développement local : démo automatique (comme avant)', () => {
    expect(decideMode({ reachable: false, explicitDemo: false, localHost: true })).toEqual({ demo: true, explicitDemo: false, server: false, unreachable: false })
  })
  it('démo choisie explicitement : démo, même si le serveur répond (le serveur n\'est pas utilisé)', () => {
    expect(decideMode({ reachable: true, explicitDemo: true, localHost: false })).toEqual({ demo: true, explicitDemo: true, server: false, unreachable: false })
    expect(decideMode({ reachable: false, explicitDemo: true, localHost: false })).toEqual({ demo: true, explicitDemo: true, server: false, unreachable: false })
  })
})
