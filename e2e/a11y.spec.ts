import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const scan = async (page: Page, label: string) => {
  await page.waitForTimeout(150)
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  return r.violations.map((v) => `${label} ${v.id}: ${v.nodes.length} (${v.nodes[0]?.target?.join(' ')})`)
}
const loginAs = async (page: Page, name: RegExp) => { await page.goto('/'); await page.getByRole('button', { name }).click() }

test('technicien : toutes les étapes d’une visite, le rapport et les écrans annexes', async ({ page }) => {
  test.setTimeout(120_000)
  await loginAs(page, /Moussa/)
  const problems: string[] = []
  await page.getByRole('link', { name: /Ascenseur A1/ }).click()
  problems.push(...(await scan(page, 'avant-visite')))
  await page.getByRole('button', { name: /Je suis sur place/ }).click()
  const tabs = page.getByRole('tab')
  const n = await tabs.count()
  for (let i = 0; i < n; i++) {
    await tabs.nth(i).click()
    if (i === 2) await page.getByRole('button', { name: /Surveiller/ }).first().click() // révèle note + photo
    problems.push(...(await scan(page, `visite-étape-${i + 1}`)))
  }
  for (const url of ['/#/tech', '/#/tech/scan', '/#/tech/urgences', '/#/tech/profil', '/#/tech/elevator/e1']) { await page.goto(url); problems.push(...(await scan(page, url))) }
  expect(problems).toEqual([])
})

test('rapport, fiche appareil, portail client et pages publiques', async ({ page }) => {
  const problems: string[] = []
  await loginAs(page, /Moussa/)
  // clôture rapide d'une visite pour obtenir un rapport
  await page.getByRole('link', { name: /Ascenseur B1/ }).click()
  await page.getByRole('button', { name: /Je suis sur place/ }).click()
  await page.getByRole('button', { name: /Je confirme la consignation/ }).click()
  for (let i = 0; i < 7; i++) { await page.getByRole('button', { name: /Suivant/ }).click(); const all = page.getByRole('button', { name: 'Tout OK' }); if (await all.count()) await all.click() }
  await page.getByRole('button', { name: /Conforme/ }).click()
  await page.getByRole('tab', { name: 'Clôture' }).click()
  await page.getByRole('button', { name: /Client absent/ }).click()
  await page.locator('input[type=file]').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64') })
  await page.getByRole('button', { name: 'Valider la signature' }).click()
  await page.getByRole('button', { name: /Terminer et générer/ }).click()
  await expect(page.getByText('Mission terminée, rapport scellé')).toBeVisible()
  problems.push(...(await scan(page, 'rapport')))
  for (const url of ['/#/signal/e1', '/#/status/e4']) { await page.goto(url); problems.push(...(await scan(page, url))) }
  await page.goto('/'); await page.getByRole('button', { name: 'Quitter' }).click()
  await page.getByRole('button', { name: /Syndic Résidence/ }).click()
  problems.push(...(await scan(page, 'portail-client')))
  expect(problems).toEqual([])
})

test('bureau : tous les écrans, y compris factures, recherche et fiche client', async ({ page }) => {
  test.setTimeout(120_000)
  await loginAs(page, /Responsable/)
  const problems: string[] = []
  const routes = ['', '/planning', '/parc', '/clients', '/clients/c1', '/import', '/defects', '/quotes', '/invoices', '/contracts', '/oncall', '/qr', '/search', '/audit', '/settings', '/more', '/elevator/e4', '/dossier/e1']
  for (const r of routes) { await page.goto(`/#/office${r}`); problems.push(...(await scan(page, `office${r}`))) }
  // détail d'une facture (brouillon)
  await page.goto('/#/office/invoices')
  await page.getByRole('button', { name: /Créer \d+ brouillon/ }).first().click()
  await page.getByRole('link', { name: 'Brouillon' }).first().click()
  problems.push(...(await scan(page, 'facture-brouillon')))
  await page.goto('/#/office/search'); await page.getByRole('searchbox', { name: 'Rechercher' }).fill('lilas')
  problems.push(...(await scan(page, 'recherche-résultats')))
  expect(problems).toEqual([])
})

test.describe('mode sombre', () => {
  test.use({ colorScheme: 'dark' })
  test('contrastes AA en thème sombre sur les écrans clés', async ({ page }) => {
    const problems: string[] = []
    await page.goto('/'); problems.push(...(await scan(page, 'login-dark')))
    await page.getByRole('button', { name: /Moussa/ }).click()
    problems.push(...(await scan(page, 'jour-dark')))
    await page.getByRole('link', { name: /Ascenseur A1/ }).click()
    await page.getByRole('button', { name: /Je suis sur place/ }).click()
    await page.getByRole('tab', { name: /Machinerie/ }).click()
    await page.getByRole('button', { name: /Défaut/ }).first().click()
    problems.push(...(await scan(page, 'visite-dark')))
    await page.goto('/'); await page.getByRole('button', { name: 'Quitter' }).click()
    await page.getByRole('button', { name: /Responsable/ }).click()
    for (const r of ['', '/planning', '/parc', '/defects', '/contracts', '/invoices', '/clients/c1']) { await page.goto(`/#/office${r}`); problems.push(...(await scan(page, `office${r}-dark`))) }
    expect(problems).toEqual([])
  })
})

test('clavier : lien d’évitement et focus déplacé à chaque changement d’écran', async ({ page }, testInfo) => {
  // Safari (WebKit) ne place le focus sur les boutons et liens qu'avec Option+Tab, par défaut
  const TAB = testInfo.project.name === 'webkit' ? 'Alt+Tab' : 'Tab'
  await loginAs(page, /Moussa/)
  await page.waitForTimeout(600) // laisse la session s'enregistrer localement
  await page.reload() // repart d'un focus neuf : le point de départ de la navigation séquentielle est le début de page
  await page.getByRole('button', { name: 'Aller au contenu' }).waitFor() // l'application est rendue avant de naviguer au clavier (sinon le Tab part d'un document vide)
  await page.waitForLoadState('networkidle')
  // le premier Tab entre dans le document ; le lien d'évitement doit être le premier élément focalisable
  await page.keyboard.press(TAB)
  if ((await page.evaluate(() => document.activeElement?.tagName)) === 'BODY') await page.keyboard.press(TAB)
  await expect(page.getByRole('button', { name: 'Aller au contenu' })).toBeFocused()
  await page.keyboard.press('Enter')
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('main')
  await page.getByRole('link', { name: 'Scanner' }).click()
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('main')
  // au clavier, chaque contrôle de la barre d'onglets reçoit un anneau de focus visible
  await page.goto('/#/tech')
  let outline = 'none'
  for (let i = 0; i < 60; i++) { // le nombre de contrôles avant la barre d'onglets dépend des missions du jour
    await page.keyboard.press(TAB)
    const info = await page.evaluate(() => { const el = document.activeElement as HTMLElement; return { text: el?.textContent ?? '', outline: getComputedStyle(el).outlineStyle, width: getComputedStyle(el).outlineWidth } })
    if (info.text.includes('Urgences')) { outline = `${info.outline} ${info.width}`; break }
  }
  expect(outline).toBe('solid 3px')
})
