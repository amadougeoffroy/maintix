// Génère tous les fichiers de marque : node brand/build-assets.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { appIconSvg, stackedSvg, symbolSvg, wordmark, wordmarkSvg } from './lib.mjs'
import { colors, cssTokens, pairs, semantic, dark, space, type } from './tokens.mjs'

const dir = fileURLToPath(new URL('.', import.meta.url))
const A = `${dir}assets/`
mkdirSync(A, { recursive: true })
const w = (f, s) => writeFileSync(A + f, s.endsWith('\n') ? s : s + '\n')

/* ---- SVG ---- */
for (const v of ['color', 'dark', 'ink', 'white']) {
  const name = { color: 'couleur', dark: 'fond-sombre', ink: 'noir', white: 'blanc' }[v]
  w(`maintix-horizontal-${name}.svg`, wordmarkSvg({ variant: v, size: 120, pad: 6 }))
  w(`maintix-empile-${name}.svg`, stackedSvg({ variant: v === 'dark' ? 'color' : v }))
  w(`maintix-symbole-${name}.svg`, symbolSvg(v))
}
w('maintix-icone-app.svg', appIconSvg())
w('maintix-icone-maskable.svg', appIconSvg({ bleed: true, id: 'mk' }))
w('favicon.svg', appIconSvg({ id: 'fv' }))

/* ---- jetons ---- */
w('../tokens.css', cssTokens())
writeFileSync(`${dir}tokens.json`, JSON.stringify({ colors, semantic, dark, type, space }, null, 2) + '\n')
const wm = wordmark({ variant: 'color', size: 100 })
writeFileSync(`${dir}logo-data.json`, JSON.stringify({ color: wordmark({ variant: 'color', size: 100, pad: 2 }), dark: wordmark({ variant: 'dark', size: 100, pad: 2 }), white: wordmark({ variant: 'white', size: 100, pad: 2 }), contrast: pairs.map((p) => ({ ...p, ratio: +p.ratio.toFixed(2) })) }, null, 2) + '\n')

/* ---- PNG ---- */
const browser = await chromium.launch()
const png = async (svgFile, out, size, bg = 'transparent') => {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  const svg = (await import('node:fs')).readFileSync(A + svgFile, 'utf8')
  await page.setContent(`<body style="margin:0;background:${bg}">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`)
  await page.screenshot({ path: A + out, omitBackground: bg === 'transparent' })
  await page.close()
}
await png('maintix-icone-app.svg', 'icon-512.png', 512)
await png('maintix-icone-app.svg', 'icon-192.png', 192)
await png('maintix-icone-maskable.svg', 'icon-maskable-512.png', 512, colors.maintix.hex)
await png('maintix-icone-maskable.svg', 'apple-touch-icon.png', 180, colors.maintix.hex)
await png('favicon.svg', 'favicon-32.png', 32)
await png('favicon.svg', 'favicon-16.png', 16)
// image de partage 1200×630
{
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
  const l = wordmark({ variant: 'dark', size: 150 })
  await page.setContent(`<body style="margin:0;width:1200px;height:630px;background:radial-gradient(900px 500px at 80% 0%,#12514c,${colors.gaine.hex});display:grid;place-items:center;font-family:Inter,system-ui,sans-serif">
    <div style="display:grid;gap:34px;justify-items:center"><svg viewBox="${l.viewBox}" width="${l.width}" height="${l.height}">${l.inner}</svg>
    <div style="color:#b7d3d0;font-size:34px;letter-spacing:-.01em">Chaque visite, tracée.</div></div></body>`)
  await page.screenshot({ path: A + 'og-image-1200x630.png' })
  await page.close()
}
await browser.close()
console.log('assets ok', wm.width, wm.height)
