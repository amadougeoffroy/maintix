export interface ParcRow {
  client: string
  site: string
  address: string
  access: string
  label: string
  brand: string
  model: string
  serial: string
  year: number
  loadKg: number
  stops: number
  machineRoom: 'haut' | 'bas' | 'sans local'
}
export interface ImportResult {
  rows: ParcRow[]
  errors: { line: number; message: string }[]
  mapping: Record<string, string>
  delimiter: string
}

export const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const SYNONYMS: Record<keyof ParcRow, string[]> = {
  client: ['client', 'syndic', 'proprietaire', 'bailleur', 'gestionnaire', 'societe'],
  site: ['site', 'immeuble', 'residence', 'batiment', 'etablissement', 'lieu'],
  address: ['adresse', 'address', 'localisation'],
  access: ['acces', 'digicode', 'code', 'cle'],
  label: ['appareil', 'ascenseur', 'designation', 'libelle', 'repere', 'nom'],
  brand: ['marque', 'constructeur', 'fabricant'],
  model: ['modele', 'type'],
  serial: ['n serie', 'numero de serie', 'no serie', 'serie', 'serial', 'numero serie', 'n de serie'],
  year: ['annee', 'mise en service', 'date de mise en service', 'annee de mise en service'],
  loadKg: ['charge', 'capacite', 'charge kg', 'charge nominale'],
  stops: ['arrets', 'niveaux', 'etages', 'nb arrets', 'nombre d arrets', 'nb niveaux'],
  machineRoom: ['machinerie', 'local machine', 'local'],
}

export function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? ''
  const counts = ['\t', ';', ','].map((d) => [d, first.split(d).length - 1] as const)
  return counts.sort((a, b) => b[1] - a[1])[0][1] > 0 ? counts.sort((a, b) => b[1] - a[1])[0][0] : ';'
}

export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (q) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') q = false
      else cell += ch
    } else if (ch === '"') q = true
    else if (ch === delimiter) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((c) => c.trim())) rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell)
  if (row.some((c) => c.trim())) rows.push(row)
  return rows
}

function matchHeader(header: string): keyof ParcRow | null {
  const h = norm(header)
  let best: keyof ParcRow | null = null
  for (const [field, syns] of Object.entries(SYNONYMS) as [keyof ParcRow, string[]][]) {
    if (syns.includes(h)) return field
    if (!best && syns.some((s) => s.length > 3 && h.includes(s))) best = field
  }
  return best
}

const num = (v: string | undefined, fallback: number) => {
  const n = parseInt((v ?? '').replace(/[^\d]/g, ''), 10)
  return isFinite(n) && n > 0 ? n : fallback
}

export function parseParc(text: string): ImportResult {
  const delimiter = detectDelimiter(text)
  const table = parseDelimited(text, delimiter)
  const errors: ImportResult['errors'] = []
  const mapping: Record<string, string> = {}
  if (table.length < 2) return { rows: [], errors: [{ line: 1, message: 'Il faut une ligne d’en-têtes puis au moins une ligne de données.' }], mapping, delimiter }

  const cols: Partial<Record<keyof ParcRow, number>> = {}
  table[0].forEach((h, i) => {
    const f = matchHeader(h)
    if (f && cols[f] === undefined) {
      cols[f] = i
      mapping[h.trim()] = f
    }
  })
  if (cols.site === undefined && cols.address === undefined) errors.push({ line: 1, message: 'Colonne « site » ou « adresse » introuvable.' })
  if (cols.label === undefined && cols.serial === undefined) errors.push({ line: 1, message: 'Colonne « appareil » ou « n° de série » introuvable.' })
  if (errors.length) return { rows: [], errors, mapping, delimiter }

  const rows: ParcRow[] = []
  const seen = new Set<string>()
  table.slice(1).forEach((r, idx) => {
    const g = (f: keyof ParcRow) => (cols[f] === undefined ? '' : (r[cols[f]!] ?? '').trim())
    const line = idx + 2
    const site = g('site') || g('address')
    const label = g('label') || g('serial')
    if (!site || !label) { errors.push({ line, message: 'Site ou appareil manquant : ligne ignorée.' }); return }
    const room = norm(g('machineRoom'))
    const key = `${norm(g('client'))}|${norm(site)}|${norm(g('serial') || label)}`
    if (seen.has(key)) { errors.push({ line, message: 'Doublon dans le fichier : ligne ignorée.' }); return }
    seen.add(key)
    rows.push({
      client: g('client') || 'Client importé',
      site,
      address: g('address'),
      access: g('access'),
      label,
      brand: g('brand'),
      model: g('model'),
      serial: g('serial'),
      year: num(g('year'), new Date().getFullYear()),
      loadKg: num(g('loadKg'), 630),
      stops: num(g('stops'), 5),
      machineRoom: room.includes('bas') ? 'bas' : room.includes('sans') || room.includes('mrl') ? 'sans local' : 'haut',
    })
  })
  return { rows, errors, mapping, delimiter }
}

export const TEMPLATE_CSV =
  'Client;Site;Adresse;Appareil;Marque;Modèle;N° série;Année;Charge (kg);Arrêts;Machinerie;Accès\n' +
  'Syndic Les Tilleuls;Bât. A;3 rue des Tilleuls 59000 Lille;Ascenseur A1;Kone;MonoSpace;KON-0001;2011;630;6;sans local;Digicode 1234\n'
