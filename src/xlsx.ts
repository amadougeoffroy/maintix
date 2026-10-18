import { parseParc } from './importer'

type Cell = string | number | boolean | Date | null | undefined
/** Lignes de tableur → texte tabulé (même format que le copier-coller Excel), lisible par `parseParc`. */
export function rowsToTsv(rows: Cell[][]): string {
  const cell = (v: Cell) => (v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).replace(/[\t\r\n]+/g, ' ').trim()
  return rows.map((r) => r.map(cell).join('\t')).join('\n')
}

/** Lit la première feuille d'un fichier .xlsx (dans le navigateur ; chargé à la demande pour alléger l'application). */
export async function xlsxToText(file: Blob): Promise<string> {
  // « universal » : sans Web Worker (la politique de sécurité du serveur n'autorise que les workers de l'application)
  const { readSheet } = await import('read-excel-file/universal')
  return rowsToTsv((await readSheet(file)) as Cell[][])
}

export const importFromRows = (rows: Cell[][]) => parseParc(rowsToTsv(rows))
