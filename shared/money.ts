/** Calculs de facturation partagés (client et serveur) : arrondi au centime à chaque étape. */
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
export const lineTotal = (l: { qty: number; unit: number }) => r2(l.qty * l.unit)
export function totals(inv: { lines: { qty: number; unit: number }[]; vatRate: number }) {
  const ht = r2(inv.lines.reduce((t, l) => t + lineTotal(l), 0))
  const vat = r2((ht * inv.vatRate) / 100)
  return { ht, vat, ttc: r2(ht + vat) }
}
