// Génère src/emailLogo.ts : logo Maintix (version fond sombre) en PNG base64, joint aux e-mails en pièce « inline » (cid).
// Usage : node scripts/build-email-logo.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const svg = readFileSync(fileURLToPath(new URL('../../brand/assets/maintix-horizontal-fond-sombre.svg', import.meta.url)), 'utf8')
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 400, height: 100 }, deviceScaleFactor: 2 })
await page.setContent(`<body style="margin:0;background:transparent"><div style="width:200px;height:48px">${svg.replace('<svg ', '<svg width="200" height="48" ')}</div></body>`)
const png = await page.locator('div').screenshot({ omitBackground: true })
await browser.close()
writeFileSync(fileURLToPath(new URL('../src/emailLogo.ts', import.meta.url)), `// Généré par scripts/build-email-logo.mjs — ne pas modifier à la main.\nexport const EMAIL_LOGO_PNG_BASE64 = '${png.toString('base64')}'\n`)
console.log('ok', png.length, 'octets')
