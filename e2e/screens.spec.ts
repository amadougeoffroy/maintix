import { test, type Page } from '@playwright/test'

// Génère les captures : SHOTS=1 npx playwright test e2e/screens.spec.ts
test.skip(!process.env.SHOTS, 'captures uniquement sur demande')
const out = (n: string) => `docs/screenshots/${n}.png`
const shot = async (page: Page, name: string, full = false) => {
  await page.waitForTimeout(250)
  // en pleine page, l'en-tête collant s'afficherait au milieu de la capture
  if (full) await page.addStyleTag({ content: '.topbar{position:static!important}.sticky-actions{position:static!important}' })
  await page.screenshot({ path: out(name), fullPage: full })
}

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  test('technicien', async ({ page }) => {
    await page.goto('/')
    await shot(page, '01-connexion', true)
    await page.getByRole('button', { name: /Moussa/ }).click()
    await shot(page, '02-ma-journee')
    await page.getByRole('link', { name: /Ascenseur A1/ }).click()
    await shot(page, '03-avant-visite', true)
    await page.getByRole('button', { name: /Je suis sur place/ }).click()
    await page.getByRole('button', { name: /Je confirme la consignation/ }).click()
    await shot(page, '04-securite')
    await page.getByRole('button', { name: /Suivant/ }).click()
    await page.getByRole('button', { name: 'Tout OK' }).click()
    await page.getByRole('button', { name: /Surveiller/ }).first().click()
    await shot(page, '05-checklist-machinerie', true)
    for (let i = 0; i < 6; i++) {
      await page.getByRole('button', { name: /Suivant/ }).click()
      const a = page.getByRole('button', { name: 'Tout OK' })
      if (await a.count()) await a.click()
    }
    await page.getByRole('button', { name: /Conforme/ }).click()
    await page.getByRole('button', { name: /Suivant/ }).click()
    await page.getByLabel(/Courant moteur/).fill('12')
    await shot(page, '06-mesures')
    await page.getByRole('button', { name: /Suivant/ }).click()
    await page.getByRole('button', { name: /\+ Galet de porte/ }).click()
    await page.getByRole('textbox', { name: /Ex\. Remplacé/ }).fill('Remplacé deux galets au 3e. Frein à surveiller.')
    await page.getByRole('button', { name: /Analyser la note/ }).click()
    await shot(page, '07-pieces-et-note', true)
    await page.getByRole('button', { name: 'Appliquer' }).click()
    await page.getByRole('button', { name: /Suivant/ }).click()
    await page.getByLabel('Nom du signataire').fill('Mme Dupont')
    const sig = page.getByLabel('Zone de signature')
    await sig.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    const b = (await sig.boundingBox())!
    await page.mouse.move(b.x + 30, b.y + 100)
    await page.mouse.down()
    for (let i = 1; i <= 12; i++) await page.mouse.move(b.x + 30 + i * 20, b.y + 100 + Math.sin(i) * 40, { steps: 3 })
    await page.mouse.up()
    await shot(page, '08-signature', true)
    await page.getByRole('button', { name: 'Valider la signature' }).click()
    await page.getByRole('button', { name: /Terminer et générer/ }).click()
    await page.getByText('Mission terminée, rapport scellé').waitFor()
    await shot(page, '09-rapport-scelle', true)
    await page.goto('/#/tech/urgences')
    await shot(page, '10-urgences')
    await page.goto('/#/tech/scan')
    await shot(page, '11-scanner')
  })
  test('public et client', async ({ page }) => {
    await page.goto('/#/signal/e1')
    await page.getByRole('button', { name: /personne est-elle bloquée/ }).click()
    await shot(page, '12-signalement-public', true)
    await page.goto('/#/status/e4')
    await shot(page, '13-page-etat', true)
    await page.goto('/')
    await page.getByRole('button', { name: /Syndic Résidence/ }).click()
    await shot(page, '14-portail-client', true)
  })
})

test.describe('bureau', () => {
  test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 })
  test('écrans', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Responsable/ }).click()
    await shot(page, '20-bureau-tableau-de-bord', true)
    const pages: [string, string][] = [['planning', '21-planning'], ['parc', '22-parc'], ['elevator/e4', '23-fiche-appareil'], ['defects', '24-defauts'], ['clients', '25-clients'], ['contracts', '26-contrats'], ['oncall', '27-astreinte'], ['qr', '28-qr-codes'], ['dossier/e1', '29-dossier-controle'], ['clients/c1', '31-fiche-client'], ['search', '32-recherche']]
    for (const [url, n] of pages) {
      await page.goto(`/#/office/${url}`)
      await shot(page, n, true)
    }
    await page.goto('/#/office/invoices')
    await page.getByRole('button', { name: /Créer \d+ brouillon/ }).first().click()
    await page.getByRole('button', { name: 'Brouillons' }).click()
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Émettre' }).first().click()
    await page.getByRole('button', { name: 'Toutes', exact: true }).click()
    await shot(page, '33-factures', true)
    await page.getByRole('link', { name: /FAC-/ }).first().click()
    await shot(page, '34-facture-detail', true)
    await page.goto('/#/office/import')
    await page.getByLabel('Données à importer').fill('Client;Site;Appareil;Marque;N° série;Année\nSyndic Neuf;Bât. Z;Asc Z1;Kone;Z-1;2015\nSyndic Neuf;Bât. Z;Asc Z2;Otis;Z-2;2018')
    await shot(page, '30-import', true)
  })
})
