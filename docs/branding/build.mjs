// Génère les pistes de logo Maintix : SVG des symboles + planche comparative (HTML et PNG).
// Usage : node docs/branding/build.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const dir = fileURLToPath(new URL('.', import.meta.url))
mkdirSync(`${dir}marks`, { recursive: true })

const TEAL = '#0f766e'
const TEAL_L = '#14b8a6'
const INK = '#0b2b2a'
const AMBER = '#f59e0b'

// Chaque symbole est dessiné dans un carré 64×64.
const marks = [
  {
    id: 'A-portes',
    name: 'A · Portes',
    idea: 'Deux portes d’ascenseur qui s’ouvrent. Lecture immédiate du métier, très lisible en petit.',
    svg: (p) => `<defs><linearGradient id="${p}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${TEAL_L}"/><stop offset="1" stop-color="${TEAL}"/></linearGradient></defs>
<rect x="2" y="2" width="60" height="60" rx="15" fill="url(#${p}g)"/>
<rect x="15" y="14" width="15" height="34" rx="3.5" fill="#fff"/>
<rect x="34" y="14" width="15" height="34" rx="3.5" fill="#fff" opacity=".88"/>
<rect x="15" y="52" width="34" height="3.5" rx="1.75" fill="#fff" opacity=".55"/>`,
    word: { color: INK, accent: TEAL },
  },
  {
    id: 'B-m-gaine',
    name: 'B · M dans la gaine',
    idea: 'Un M dont le V central porte la cabine (point ambre). Monogramme sérieux, mémorisable.',
    svg: () => `<rect x="2" y="2" width="60" height="60" rx="15" fill="${INK}"/>
<path d="M16 46V18l16 18 16-18v28" fill="none" stroke="#fff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="27.5" y="38" width="9" height="9" rx="2.5" fill="${AMBER}"/>`,
    word: { color: INK, accent: AMBER },
  },
  {
    id: 'C-chevrons',
    name: 'C · Chevrons ascendants',
    idea: 'Deux chevrons qui montent : progression, niveaux, fiabilité. Moderne et très « app ».',
    svg: (p) => `<defs><linearGradient id="${p}g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${TEAL}"/><stop offset="1" stop-color="#10b981"/></linearGradient></defs>
<rect x="2" y="2" width="60" height="60" rx="15" fill="url(#${p}g)"/>
<path d="M17 36l15-15 15 15" fill="none" stroke="#fff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M17 50l15-15 15 15" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    word: { color: INK, accent: TEAL },
  },
  {
    id: 'D-cabine',
    name: 'D · Cabine en gaine',
    idea: 'Une cabine (ambre) dans sa gaine (contour). Minimaliste, style monoligne, élégant en grand.',
    svg: () => `<rect x="12" y="6" width="40" height="52" rx="10" fill="none" stroke="${TEAL}" stroke-width="6"/>
<rect x="22" y="30" width="20" height="20" rx="5" fill="${AMBER}"/>
<path d="M26 20l6-6 6 6" fill="none" stroke="${TEAL}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
    word: { color: INK, accent: AMBER },
  },
  {
    id: 'E-hexagone',
    name: 'E · Hexagone conforme',
    idea: 'Hexagone (mécanique, écrou) et coche : met en avant la conformité et la traçabilité du rapport.',
    svg: (p) => `<defs><linearGradient id="${p}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${TEAL_L}"/><stop offset="1" stop-color="${TEAL}"/></linearGradient></defs>
<path d="M32 3l25 14.5v29L32 61 7 46.5v-29z" fill="url(#${p}g)" stroke="url(#${p}g)" stroke-width="4" stroke-linejoin="round"/>
<path d="M20 33l9 9 16-19" fill="none" stroke="#fff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    word: { color: INK, accent: TEAL },
  },
  {
    id: 'F-x-fleches',
    name: 'F · Le X en flèches',
    idea: 'Le « x » de Maintix devient deux flèches qui se rejoignent (montée / descente). Logo surtout typographique.',
    svg: () => `<g transform="translate(6 6) scale(2.2)">
<path d="M3 3l11.5 11.5L26 3" fill="none" stroke="${TEAL}" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M3 26l11.5-11.5L26 26" fill="none" stroke="${AMBER}" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/></g>`,
    word: { color: INK, accent: AMBER, xAsMark: true },
  },
]

const FONT = `'Inter','SF Pro Display','Helvetica Neue',Arial,system-ui,sans-serif`
const markSvg = (m, size, p = m.id) => `<svg viewBox="0 0 64 64" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Maintix">${m.svg(p)}</svg>`

function lockup(m, { dark = false, h = 56 } = {}) {
  const ink = dark ? '#fff' : m.word.color
  const accent = m.word.accent
  const tx = m.id === 'F-x-fleches'
    ? `<span style="font:800 ${h * 0.62}px/1 ${FONT};letter-spacing:-.03em;color:${ink}">Mainti</span>`
    : `<span style="font:800 ${h * 0.62}px/1 ${FONT};letter-spacing:-.03em;color:${ink}">Main<span style="color:${accent}">tix</span></span>`
  if (m.id === 'F-x-fleches') {
    const x = `<svg viewBox="0 0 29 29" width="${h * 0.5}" height="${h * 0.5}" style="margin-left:2px;margin-top:${h * 0.07}px"><path d="M3 3l11.5 11.5L26 3" fill="none" stroke="${dark ? '#5eead4' : TEAL}" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 26l11.5-11.5L26 26" fill="none" stroke="${AMBER}" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    return `<div style="display:flex;align-items:center;gap:0">${tx}${x}</div>`
  }
  return `<div style="display:flex;align-items:center;gap:${h * 0.28}px">${markSvg(m, h, m.id + (dark ? 'd' : 'l'))}${tx}</div>`
}

const card = (m) => `
<section class="card">
  <header><h2>${m.name}</h2><p>${m.idea}</p></header>
  <div class="row light">${lockup(m)}</div>
  <div class="row dark">${lockup(m, { dark: true })}</div>
  <div class="row small">
    ${m.id === 'F-x-fleches' ? '' : `<div class="app">${markSvg(m, 72, m.id + 'a')}<small>Icône app</small></div><div class="app">${markSvg(m, 32, m.id + 'f')}<small>Favicon</small></div>`}
    <div class="app mono"><svg viewBox="0 0 64 64" width="44" height="44" style="filter:grayscale(1) contrast(1.4)">${m.svg(m.id + 'm')}</svg><small>Monochrome</small></div>
  </div>
</section>`

const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Maintix – pistes de logo</title>
<style>
  :root{font-family:${FONT}}
  body{margin:0;background:#eef2f3;color:${INK};padding:36px}
  h1{font-size:30px;margin:0 0 4px;letter-spacing:-.02em} .lead{margin:0 0 28px;color:#4b5f5e}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:22px}
  .card{background:#fff;border-radius:20px;padding:22px;box-shadow:0 1px 3px rgb(0 0 0/.08);display:grid;gap:14px}
  h2{font-size:17px;margin:0 0 2px} header p{margin:0;font-size:13.5px;color:#4b5f5e;line-height:1.4}
  .row{border-radius:14px;padding:26px 28px;display:flex;align-items:center}
  .light{background:#fff;border:1px solid #e1e8e9} .dark{background:${INK}}
  .small{gap:26px;background:#f4f7f7;padding:16px 22px}
  .app{display:grid;justify-items:center;gap:6px} .app small{font-size:11px;color:#6b7c7b}
</style>
<h1>Maintix — pistes de logo</h1>
<p class="lead">6 directions. Couleurs : vert-teal (confiance, technique) + ambre (alerte, énergie). Typographie : sans-serif géométrique grasse (Inter / équivalent).</p>
<div class="grid">${marks.map(card).join('')}</div></html>`

for (const m of marks) writeFileSync(`${dir}marks/${m.id}.svg`, `<?xml version="1.0" encoding="UTF-8"?>\n${markSvg(m, 512)}\n`)
writeFileSync(`${dir}logos.html`, html)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1240, height: 900 }, deviceScaleFactor: 1.5 })
await page.setContent(html)
await page.screenshot({ path: `${dir}maintix-pistes-logo.png`, fullPage: true })
await browser.close()
console.log('ok')
