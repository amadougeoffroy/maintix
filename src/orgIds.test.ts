import { describe, expect, it } from 'vitest'
import { DEFAULT_VAT_RATE, orgIdentityLines, orgPayment, orgRccm, orgTaxId } from '../shared/orgIds'

describe('identifiants de l’entreprise (Côte d’Ivoire)', () => {
  it('la TVA par défaut est de 18 %', () => expect(DEFAULT_VAT_RATE).toBe(18))
  it('affiche RCCM, n° de compte contribuable et régime d’imposition', () => {
    expect(orgIdentityLines({ rccm: 'CI-ABJ-2020-B-12345', taxId: '1234567 A', taxRegime: 'Réel normal' })).toEqual(['RCCM CI-ABJ-2020-B-12345', 'N° CC 1234567 A', 'Régime d’imposition : Réel normal'])
    expect(orgIdentityLines({})).toEqual([])
  })
  it('reprend les anciens champs déjà saisis (SIRET, TVA, IBAN) tant que les nouveaux sont vides', () => {
    const old = { siret: '123 456 789', vatNumber: 'FR12', iban: 'FR76 0000' }
    expect([orgRccm(old), orgTaxId(old), orgPayment(old)]).toEqual(['123 456 789', 'FR12', 'FR76 0000'])
    expect(orgRccm({ ...old, rccm: 'CI-1' })).toBe('CI-1')
  })
})
