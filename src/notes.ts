import { norm } from './importer'
import type { ItemStatus, Part } from './types'

export interface NoteSuggestions {
  parts: Part[]
  items: { key: string; status: ItemStatus; note: string }[]
  emergencyCallTest: 'ok' | 'ko' | null
}

const PARTS: [RegExp, string][] = [
  [/\bgalets?\b/, 'Galet de porte palière'],
  [/\bpatins?\b/, 'Patin de porte'],
  [/\bcontacteurs?\b/, 'Contacteur'],
  [/\bgarnitures?\b/, 'Garniture de frein'],
  [/\bgraisse\b/, 'Graisse guides'],
  [/\b(lampes?|ampoules?)\b/, 'Lampe cabine'],
  [/\bbouton\b/, 'Bouton de palier'],
  [/\bbatteries?\b/, 'Batterie de secours'],
]
const ITEMS: [RegExp, string][] = [
  [/\bgalets?\b/, 'pal_galets'],
  [/\b(verrou|verrouillage|serrures?)\b/, 'pal_verrou'],
  [/\bfrein\b/, 'mach_frein'],
  [/\bcuvette\b/, 'gai_cuvette'],
  [/\bparachute\b/, 'sec_parachute'],
  [/\blimiteur\b/, 'sec_limiteur'],
  [/\b(cables?|suspentes?)\b/, 'cab_cables'],
  [/\beclairage\b/, 'cab_eclairage'],
  [/\bporte (de )?cabine\b/, 'cab_porte'],
  [/\bamortisseurs?\b/, 'gai_amortisseurs'],
  [/\bguides?\b/, 'gai_guides'],
]
const BAD = /\b(use|usee|uses|casse|cassee|hs|defaillant|defaillante|grille|bruit|bruyant|fuite|fuit|ne fonctionne pas|ne ferme|coince|rouille|abime)\b/
const WATCH = /\b(surveiller|a suivre|leger|legere|debut d usure|a controler)\b/
const REPLACED = /\b(remplace|remplacee|remplaces|change|changee|changes|install|monte)\b/
const NUMS: Record<string, number> = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6 }

/** Heuristique locale (sans IA) : propose des pièces, points de contrôle et le test d'appel. L'humain valide. */
export function suggestFromNote(text: string): NoteSuggestions {
  const out: NoteSuggestions = { parts: [], items: [], emergencyCallTest: null }
  for (const raw of text.split(/[.;\n]+/)) {
    const s = norm(raw)
    if (!s) continue
    const replaced = REPLACED.test(s)
    if (replaced) {
      for (const [re, name] of PARTS) {
        const m = s.match(re)
        if (!m) continue
        const before = s.slice(0, m.index).trim().split(' ').slice(-1)[0] ?? ''
        const qty = /^\d+$/.test(before) ? parseInt(before, 10) : NUMS[before] ?? 1
        const ex = out.parts.find((p) => p.name === name)
        if (ex) ex.qty = Math.max(ex.qty, qty)
        else out.parts.push({ name, qty })
      }
    }
    const status: ItemStatus | null = BAD.test(s) ? 'ko' : WATCH.test(s) ? 'watch' : null
    if (status) {
      for (const [re, key] of ITEMS) {
        if (re.test(s) && !out.items.some((i) => i.key === key)) out.items.push({ key, status, note: raw.trim() })
      }
    }
    if (/\bappel\b/.test(s) && /\burgence\b/.test(s)) {
      if (/\b(ok|conforme|fonctionne|teste)\b/.test(s) && !/\bne fonctionne pas\b/.test(s)) out.emergencyCallTest = 'ok'
      if (/\b(ko|hs|non conforme|ne fonctionne pas|defaillant)\b/.test(s)) out.emergencyCallTest = 'ko'
    }
  }
  return out
}
