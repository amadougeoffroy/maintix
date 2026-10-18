// Assemble le kit graphique complet : brand/build-kit.mjs → docs/branding/maintix-kit-graphique/ + .zip
// Prérequis : npm run brand (logos et charte déjà générés).
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { icons } from 'lucide'
import { appIconSvg, stackedSvg, symbolSvg, wordmark, wordmarkSvg } from './lib.mjs'
import { colors, dark, pairs, semantic } from './tokens.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const kit = `${root}docs/branding/maintix-kit-graphique/`
const dirs = ['01-logos/svg', '01-logos/png', '02-icones-application', '03-favicon', '04-reseaux-sociaux', '05-couleurs', '06-typographie', '07-pictogrammes', '08-charte']
for (const d of dirs) mkdirSync(kit + d, { recursive: true })
const put = (rel, content) => writeFileSync(kit + rel, content.endsWith('\n') || Buffer.isBuffer(content) ? content : content + '\n')

const browser = await chromium.launch()
/** Rasterise un SVG en PNG. `bg` : couleur de fond ou 'transparent'. */
async function png(svg, rel, width, height, bg = 'transparent') {
  const page = await browser.newPage({ viewport: { width, height } })
  const sized = svg.replace(/<svg /, `<svg width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" `)
  await page.setContent(`<body style="margin:0;background:${bg}">${sized}</body>`)
  await page.screenshot({ path: kit + rel, omitBackground: bg === 'transparent' })
  await page.close()
}
const ratioOf = (svg) => { const m = svg.match(/viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/); return Number(m[1]) / Number(m[2]) }

/* ---------- 01 logos ---------- */
const variants = [['couleur', 'color'], ['fond-sombre', 'dark'], ['noir', 'ink'], ['blanc', 'white']]
for (const [fr, v] of variants) {
  const h = wordmarkSvg({ variant: v, size: 120, pad: 6 })
  put(`01-logos/svg/maintix-horizontal-${fr}.svg`, h)
  if (v !== 'dark') put(`01-logos/svg/maintix-empile-${fr}.svg`, stackedSvg({ variant: v }))
  put(`01-logos/svg/maintix-symbole-${fr}.svg`, symbolSvg(v))
  for (const w of [512, 1024, 2048]) await png(h, `01-logos/png/maintix-horizontal-${fr}-${w}px.png`, w, Math.round(w / ratioOf(h)))
  await png(symbolSvg(v), `01-logos/png/maintix-symbole-${fr}-512px.png`, 512, 512)
  if (v !== 'dark') {
    const s = stackedSvg({ variant: v })
    await png(s, `01-logos/png/maintix-empile-${fr}-1024px.png`, 1024, Math.round(1024 / ratioOf(s)))
  }
}
put('01-logos/svg/maintix-icone-application.svg', appIconSvg())

/* ---------- 02 icônes d'application ---------- */
const tile = appIconSvg({ id: 'k1' })
const bleed = appIconSvg({ bleed: true, id: 'k2' })
put('02-icones-application/maintix-icone-arrondie.svg', tile)
put('02-icones-application/maintix-icone-plein-cadre.svg', bleed)
// iOS : carré plein (le système arrondit), tailles usuelles
for (const s of [1024, 180, 167, 152, 120, 87, 80, 60]) await png(bleed, `02-icones-application/ios-${s}.png`, s, s, colors.maintix.hex)
// Android / PWA
for (const s of [512, 192, 144, 96, 72, 48]) await png(tile, `02-icones-application/android-${s}.png`, s, s)
await png(bleed, '02-icones-application/android-maskable-512.png', 512, 512, colors.maintix.hex)
await png(bleed, '02-icones-application/android-maskable-192.png', 192, 192, colors.maintix.hex)
await png(tile, '02-icones-application/icone-arrondie-1024.png', 1024, 1024)

/* ---------- 03 favicon ---------- */
put('03-favicon/favicon.svg', appIconSvg({ id: 'k3' }))
for (const s of [16, 32, 48, 64, 180, 192, 512]) await png(appIconSvg({ id: `f${s}` }), `03-favicon/favicon-${s}.png`, s, s)
execFileSync('python3', ['-c', `from PIL import Image
base=Image.open(${JSON.stringify(kit + '03-favicon/favicon-64.png')}).convert('RGBA')
base.save(${JSON.stringify(kit + '03-favicon/favicon.ico')}, sizes=[(16,16),(32,32),(48,48)])`])

/* ---------- 04 réseaux sociaux ---------- */
await png(tile, '04-reseaux-sociaux/avatar-400.png', 400, 400)
await png(bleed, '04-reseaux-sociaux/avatar-plein-cadre-400.png', 400, 400, colors.maintix.hex)
{
  const light = wordmarkSvg({ variant: 'color', size: 120, pad: 6 })
  await png(light, '04-reseaux-sociaux/signature-email-logo-600px.png', 600, Math.round(600 / ratioOf(light)))
  const wm = wordmark({ variant: 'dark', size: 100 })
  const banner = async (name, w, h, logoW, tagSize) => {
    const page = await browser.newPage({ viewport: { width: w, height: h } })
    await page.setContent(`<body style="margin:0;width:${w}px;height:${h}px;background:radial-gradient(${w * 0.7}px ${h * 1.6}px at 85% -20%,#12514c,${colors.gaine.hex});display:flex;align-items:center;padding:0 ${w * 0.07}px;gap:${w * 0.03}px;font-family:'Inter',system-ui,sans-serif;box-sizing:border-box">
      <svg viewBox="${wm.viewBox}" width="${logoW}" height="${(logoW * wm.height) / wm.width}">${wm.inner}</svg>
      <div style="color:#b7d3d0;font-size:${tagSize}px;letter-spacing:-.01em;border-left:2px solid #2a4b49;padding-left:${w * 0.03}px">Chaque visite, tracée.</div></body>`)
    await page.screenshot({ path: kit + `04-reseaux-sociaux/${name}.png` })
    await page.close()
  }
  await banner('banniere-linkedin-1584x396', 1584, 396, 520, 40)
  await banner('banniere-x-1500x500', 1500, 500, 500, 38)
  await banner('banniere-facebook-1640x624', 1640, 624, 540, 42)
}
copyFileSync(`${root}brand/assets/og-image-1200x630.png`, kit + '04-reseaux-sociaux/image-de-partage-1200x630.png')

/* ---------- 05 couleurs ---------- */
copyFileSync(`${root}brand/tokens.css`, kit + '05-couleurs/tokens.css')
copyFileSync(`${root}brand/tokens.json`, kit + '05-couleurs/tokens.json')
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const txt = [
  'MAINTIX — PALETTE (valeurs RVB/Hex ; CMJN et Pantone à calibrer avec l’imprimeur)', '',
  ...Object.values(colors).map((c) => `${c.name.padEnd(16)} ${c.hex.toUpperCase()}  RVB ${rgb(c.hex).join(', ').padEnd(14)} ${c.role}`), '',
  'États :', ...Object.values(semantic).map((s) => `${s.name.padEnd(16)} texte ${s.fg.toUpperCase()} · fond ${s.bg.toUpperCase()}`), '',
  'Mode sombre :', ...Object.entries(dark).map(([k, v]) => `${k.padEnd(16)} ${v.toUpperCase()}`), '',
  'Contrastes WCAG calculés :', ...pairs.map((p) => `${p.label.padEnd(34)} ${p.ratio.toFixed(2)} : 1`),
].join('\n')
put('05-couleurs/palette.txt', txt)
{
  const all = Object.values(colors)
  const sw = all.map((c, i) => `<g transform="translate(${(i % 4) * 300 + 20} ${Math.floor(i / 4) * 230 + 20})"><rect width="270" height="150" rx="18" fill="${c.hex}" ${['#ffffff', '#f4f6f7', '#eef2f3'].includes(c.hex) ? 'stroke="#d9e1e2"' : ''}/><text y="182" font-family="Inter,Arial,sans-serif" font-weight="700" font-size="18" fill="#0b2b2a">${c.name}</text><text y="205" font-family="ui-monospace,monospace" font-size="14" fill="#5b6b6a">${c.hex.toUpperCase()} · RVB ${rgb(c.hex).join(' ')}</text></g>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1240 ${Math.ceil(all.length / 4) * 230 + 40}"><rect width="100%" height="100%" fill="#fff"/>${sw}</svg>`
  put('05-couleurs/palette.svg', svg)
  await png(svg, '05-couleurs/palette.png', 1240, Math.ceil(all.length / 4) * 230 + 40, '#ffffff')
}

/* ---------- 06 typographie ---------- */
copyFileSync(`${root}node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2`, kit + '06-typographie/Inter-variable-latin.woff2')
copyFileSync(`${root}node_modules/@fontsource/inter/files/inter-latin-800-normal.woff2`, kit + '06-typographie/Inter-ExtraBold-latin.woff2')
copyFileSync(`${root}node_modules/@fontsource/inter/LICENSE`, kit + '06-typographie/LICENSE-Inter-SIL-OFL.txt')
put('06-typographie/LISEZMOI.txt', 'Maintix utilise Inter (licence SIL Open Font, libre d’usage commercial).\nPour Word/PowerPoint/Figma : installez Inter depuis https://rsms.me/inter/ (version complète avec TTF/OTF).\nCes fichiers WOFF2 (sous-ensemble latin) servent pour le web.\n')

/* ---------- 07 pictogrammes (Lucide) ---------- */
const used = new Set()
for (const f of ['src/components/Shells.tsx', 'src/components/Icon.tsx']) {
  const src = readFileSync(root + f, 'utf8')
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from 'lucide-react'/g)) for (const n of m[1].split(',').map((x) => x.trim().replace(/^type .*/, '')).filter(Boolean)) used.add(n)
}
used.delete('LucideIcon')
let count = 0
for (const name of [...used].sort()) {
  const nodes = icons[name]
  if (!nodes) continue
  const inner = nodes.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('')
  const kebab = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
  put(`07-pictogrammes/${kebab}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`)
  count++
}
{
  const custom = JSON.parse(readFileSync(`${root}brand/icons.json`, 'utf8'))
  mkdirSync(kit + '07-pictogrammes/metier', { recursive: true })
  for (const [name, nodes] of Object.entries(custom)) {
    if (name.startsWith('_')) continue
    const inner = nodes.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('')
    put(`07-pictogrammes/metier/${name}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`)
  }
}
copyFileSync(`${root}node_modules/lucide/LICENSE`, kit + '07-pictogrammes/LICENSE-Lucide-ISC.txt')
put('07-pictogrammes/LISEZMOI.txt', `${count} pictogrammes utilisés dans Maintix (bibliothèque Lucide, licence ISC).\nTrait de 2 px, grille 24 px, couleur héritée (currentColor) : Gaine #0b2b2a par défaut, Teal #0f766e pour l’actif, Signal profond #92400e pour l’alerte.\nToute la bibliothèque : https://lucide.dev\n`)

/* ---------- 08 charte ---------- */
copyFileSync(`${root}docs/branding/maintix-charte-graphique.pdf`, kit + '08-charte/maintix-charte-graphique.pdf')
copyFileSync(`${root}docs/branding/maintix-charte-graphique.html`, kit + '08-charte/maintix-charte-graphique.html')

/* ---------- lisez-moi ---------- */
put('LISEZMOI.txt', `MAINTIX — KIT GRAPHIQUE v1.0
Chaque visite, tracée.

CONTENU
01-logos/                Logo horizontal (principal), empilé, symbole. SVG (vectoriel) + PNG transparents.
                         Variantes : couleur (fond clair) · fond-sombre · noir · blanc.
02-icones-application/   Icône d'appli : iOS (carré plein, le système arrondit), Android, PWA, maskable.
03-favicon/              favicon.svg, favicon.ico (16/32/48) et PNG 16 → 512.
04-reseaux-sociaux/      Avatars, bannières LinkedIn / X / Facebook, image de partage, logo de signature e-mail.
05-couleurs/             Jetons CSS/JSON, palette (txt, svg, png) avec contrastes.
06-typographie/          Inter (WOFF2) + licence.
07-pictogrammes/         Pictogrammes Lucide utilisés (SVG) + licence ; metier/ : 7 pictogrammes ascenseur propres à Maintix.
08-charte/               Charte graphique (PDF et HTML).

RÈGLES ESSENTIELLES
- Utiliser toujours les fichiers fournis ; ne jamais redessiner ni déformer le logo.
- Fond clair : version « couleur ». Fond Gaine (#0b2b2a) : « fond-sombre ». Fond de marque ou photo sombre : « blanc ». Noir et blanc imprimé : « noir ».
- Zone de protection : hauteur du X autour du logo. Largeur minimale : 80 px (25 mm). En dessous : icône seule.
- Le Signal (#f59e0b) n'est jamais utilisé en texte sur fond clair.
- Détails complets : 08-charte/maintix-charte-graphique.pdf

LICENCES
Inter : SIL Open Font License 1.1 · Lucide : ISC. Le logo et le nom Maintix sont la propriété de leur titulaire ;
la disponibilité du nom (marque, domaine) reste à vérifier.
`)

await browser.close()

// archive
const zipPath = `${root}docs/branding/maintix-kit-graphique.zip`
execFileSync('rm', ['-f', zipPath])
execFileSync('zip', ['-qr', zipPath, 'maintix-kit-graphique'], { cwd: `${root}docs/branding` })
const count2 = (d) => readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count2(d + e.name + '/') : 1), 0)
console.log(`kit ok : ${count2(kit)} fichiers`)
