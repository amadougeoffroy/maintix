// Géométrie du logo Maintix : mot « Mainti » en tracés vectoriels (Inter ExtraBold, licence OFL) + symbole X en deux flèches.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import opentype from 'opentype.js'
import { colors } from './tokens.mjs'

const fontPath = fileURLToPath(new URL('../node_modules/@fontsource/inter/files/inter-latin-800-normal.woff', import.meta.url))
const buf = readFileSync(fontPath)
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
const upm = font.unitsPerEm
const xHeightEm = (font.tables.os2.sxHeight ?? 1118) / upm
const stemEm = (() => { const b = font.charToGlyph('l').getBoundingBox(); return (b.x2 - b.x1) / upm })()

export const PALETTE = {
  color: { word: colors.gaine.hex, top: colors.maintix.hex, bottom: colors.signal.hex },
  dark: { word: '#ffffff', top: '#5eead4', bottom: colors.signal.hex },
  ink: { word: '#000000', top: '#000000', bottom: '#000000' },
  white: { word: '#ffffff', top: '#ffffff', bottom: '#ffffff' },
}

const TRACK = -0.02
const GAP = 0.03

/** Deux chevrons qui se rejoignent au centre : un X. Boîte carrée de côté `side`, trait `sw`, origine (x, y) = coin haut-gauche. */
export function xMarkPaths(x, y, side, sw) {
  const h = sw / 2
  const mid = side / 2
  const top = `M${n(x + h)} ${n(y + h)}L${n(x + mid)} ${n(y + mid)}L${n(x + side - h)} ${n(y + h)}`
  const bottom = `M${n(x + h)} ${n(y + side - h)}L${n(x + mid)} ${n(y + mid)}L${n(x + side - h)} ${n(y + side - h)}`
  return { top, bottom }
}
const n = (v) => Math.round(v * 100) / 100

/** Mot-symbole « Maintix » : lettres vectorisées + X. Taille de police `size` (px) ; retourne un SVG autonome. */
export function wordmark({ variant = 'color', size = 100, pad = 0 } = {}) {
  const c = PALETTE[variant]
  const text = 'Mainti'
  // Mise en page manuelle (le moteur de substitution d'opentype.js ne gère pas les tables d'Inter).
  const path = new opentype.Path()
  let cx = 0
  for (const ch of text) {
    const g = font.charToGlyph(ch)
    const gp = g.getPath(cx, 0, size)
    path.commands.push(...gp.commands)
    cx += (g.advanceWidth / upm) * size + TRACK * size
  }
  const adv = cx
  const xh = xHeightEm * size
  const sw = stemEm * size
  const x0 = adv + GAP * size
  const { top, bottom } = xMarkPaths(x0, -xh, xh, sw)
  const bb = path.getBoundingBox()
  const left = Math.min(0, bb.x1)
  const topY = bb.y1 // négatif (au-dessus de la ligne de base)
  const width = x0 + xh - left + pad * 2
  const height = -topY + pad * 2
  const stroke = (d, col) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${n(sw)}" stroke-linecap="round" stroke-linejoin="round"/>`
  const inner = `<path d="${path.toPathData(2)}" fill="${c.word}"/>${stroke(top, c.top)}${stroke(bottom, c.bottom)}`
  return { width: n(width), height: n(height), viewBox: `${n(left - pad)} ${n(topY - pad)} ${n(width)} ${n(height)}`, inner }
}

export const wordmarkSvg = (opts = {}) => {
  const w = wordmark(opts)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${w.viewBox}" role="img" aria-label="Maintix">${w.inner}</svg>`
}

/** Symbole seul (les deux flèches). Boîte `side`, centré dans un viewBox carré `box`. */
export function symbolInner({ variant = 'color', box = 64, side = 36 } = {}) {
  const c = PALETTE[variant]
  const sw = side * 0.29
  const o = (box - side) / 2
  const { top, bottom } = xMarkPaths(o, o, side, sw)
  const s = (d, col) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${n(sw)}" stroke-linecap="round" stroke-linejoin="round"/>`
  return s(top, c.top) + s(bottom, c.bottom)
}
export const symbolSvg = (variant = 'color') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Maintix">${symbolInner({ variant })}</svg>`

/** Icône d'application : tuile teal, flèche haute blanche, flèche basse Signal. `bleed` = plein cadre (maskable). */
export function appIconSvg({ bleed = false, id = 'ic' } = {}) {
  const side = bleed ? 30 : 36
  const tile = bleed
    ? `<rect width="64" height="64" fill="url(#${id})"/>`
    : `<rect x="1" y="1" width="62" height="62" rx="15" fill="url(#${id})"/>`
  const sw = side * 0.29
  const o = (64 - side) / 2
  const { top, bottom } = xMarkPaths(o, o, side, sw)
  const s = (d, col) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${n(sw)}" stroke-linecap="round" stroke-linejoin="round"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Maintix"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${colors.lumiere.hex}"/><stop offset="1" stop-color="${colors.maintix.hex}"/></linearGradient></defs>${tile}${s(top, '#ffffff')}${s(bottom, colors.signal.hex)}</svg>`
}

/** Version empilée : icône au-dessus du mot-symbole. */
export function stackedSvg({ variant = 'color' } = {}) {
  const wm = wordmark({ variant, size: 100 })
  const iconSize = 150
  const total = Math.max(wm.width, iconSize)
  const wmScale = 1
  const gap = 34
  const ix = (total - iconSize) / 2
  const wx = (total - wm.width) / 2
  const [vx, vy] = wm.viewBox.split(' ').map(Number)
  const icon = appIconSvg({ id: 'st' }).replace(/<svg[^>]*>|<\/svg>/g, '')
  const mono = variant === 'ink' || variant === 'white'
  const iconG = mono
    ? `<g transform="translate(${ix} 0) scale(${iconSize / 64})"><rect x="1" y="1" width="62" height="62" rx="15" fill="${PALETTE[variant].word}"/>${symbolInner({ variant: variant === 'ink' ? 'white' : 'ink', side: 36 })}</g>`
    : `<g transform="translate(${ix} 0) scale(${iconSize / 64})">${icon}</g>`
  const h = iconSize + gap + wm.height
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(total)} ${n(h)}" role="img" aria-label="Maintix">${iconG}<g transform="translate(${n(wx - vx)} ${n(iconSize + gap - vy)}) scale(${wmScale})">${wm.inner}</g></svg>`
}
