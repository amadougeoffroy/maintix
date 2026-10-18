/** Calculs de facturation partagés (client et serveur). Le franc CFA n'a pas de centimes : montants entiers, arrondis à chaque étape. */
const r0 = (n: number) => Math.round(n + Number.EPSILON)
export const lineTotal = (l: { qty: number; unit: number }) => r0(l.qty * l.unit)
export function totals(inv: { lines: { qty: number; unit: number }[]; vatRate: number }) {
  const ht = inv.lines.reduce((t, l) => t + lineTotal(l), 0)
  const vat = r0((ht * inv.vatRate) / 100)
  return { ht, vat, ttc: ht + vat }
}
