/** Identifiants légaux d'une entreprise, adaptés à la Côte d'Ivoire : RCCM, numéro de compte contribuable (CC), régime d'imposition,
 *  coordonnées de paiement. Les anciens champs (siret, vatNumber, iban) restent lus pour les données déjà saisies. */
export interface OrgIdFields {
  rccm?: string
  taxId?: string
  taxRegime?: string
  bankDetails?: string
  /** anciens champs, conservés en lecture */
  siret?: string
  vatNumber?: string
  iban?: string
}
export const DEFAULT_VAT_RATE = 18

export const orgRccm = (o?: OrgIdFields | null) => (o?.rccm ?? o?.siret ?? '').trim()
export const orgTaxId = (o?: OrgIdFields | null) => (o?.taxId ?? o?.vatNumber ?? '').trim()
export const orgTaxRegime = (o?: OrgIdFields | null) => (o?.taxRegime ?? '').trim()
export const orgPayment = (o?: OrgIdFields | null) => (o?.bankDetails ?? o?.iban ?? '').trim()

/** Lignes d'identité d'une entreprise pour l'en-tête d'une facture. */
export function orgIdentityLines(o?: OrgIdFields | null): string[] {
  const l: string[] = []
  if (orgRccm(o)) l.push(`RCCM ${orgRccm(o)}`)
  if (orgTaxId(o)) l.push(`N° CC ${orgTaxId(o)}`)
  if (orgTaxRegime(o)) l.push(`Régime d’imposition : ${orgTaxRegime(o)}`)
  return l
}
