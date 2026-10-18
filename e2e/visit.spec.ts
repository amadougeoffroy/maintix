import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const loginTech = async (page: Page) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Moussa/ }).click()
}

test('visite complète hors ligne → rapport scellé', async ({ page, context }) => {
  await loginTech(page)
  await page.getByRole('link', { name: /Ascenseur A1/ }).click()
  await page.getByRole('button', { name: /Je suis sur place/ }).click()
  await context.setOffline(true)

  await page.getByRole('button', { name: /Je confirme la consignation/ }).click()
  for (let i = 0; i < 7; i++) {
    await page.getByRole('button', { name: /Suivant/ }).click()
    const all = page.getByRole('button', { name: 'Tout OK' })
    if (await all.count()) await all.click()
  }
  await page.getByRole('button', { name: /Conforme/ }).click()
  await page.getByRole('button', { name: /Suivant/ }).click() // mesures
  await page.getByRole('button', { name: /Suivant/ }).click() // pièces
  await page.getByRole('textbox', { name: /Remarques|Ex\. Remplacé/ }).fill('Remplacé deux galets au 3e. Frein à surveiller.')
  await page.getByRole('button', { name: /Analyser la note/ }).click()
  await expect(page.getByText('2 × Galet de porte palière')).toBeVisible()
  await page.getByRole('button', { name: 'Appliquer' }).click()
  await page.getByRole('button', { name: /Suivant/ }).click() // clôture

  // le point « frein » est passé à surveiller (pas de défaut → pas de photo exigée)
  await page.getByLabel('Nom du signataire').fill('Mme Dupont')
  const sig = page.getByLabel('Zone de signature')
  await sig.scrollIntoViewIfNeeded()
  const box = (await sig.boundingBox())!
  await page.mouse.move(box.x + 20, box.y + 20)
  await page.mouse.down()
  await page.mouse.move(box.x + 120, box.y + 80, { steps: 5 })
  await page.mouse.up()
  await page.getByRole('button', { name: 'Valider la signature' }).click()
  await page.getByRole('button', { name: /Terminer et générer/ }).click()

  await expect(page.getByText('Mission terminée, rapport scellé')).toBeVisible()
  await expect(page.getByText(/Le contenu du rapport est conforme au sceau/)).toBeVisible()
  await context.setOffline(false)
})

test('une mission est bloquée sans test d’appel ni signature', async ({ page }) => {
  await loginTech(page)
  await page.getByRole('link', { name: /Ascenseur B1/ }).click()
  await page.getByRole('button', { name: /Je suis sur place/ }).click()
  await page.getByRole('tab', { name: 'Clôture' }).click()
  await expect(page.getByRole('button', { name: /Terminer et générer/ })).toBeDisabled()
  await expect(page.getByText('Test de l’appel d’urgence')).toBeVisible()
})

test('technicien à habilitation expirée ne peut pas démarrer', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Lucas/ }).click()
  await page.goto('/#/tech/elevator/e5')
  await page.getByRole('button', { name: /Démarrer une visite/ }).click()
  await expect(page.getByText('Habilitation expirée').first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Je suis sur place/ })).toBeDisabled()
})

test('signalement public avec personne bloquée alerte l’astreinte', async ({ page }) => {
  await page.goto('/#/signal/e1')
  await page.getByRole('button', { name: /personne est-elle bloquée/ }).click()
  await page.getByLabel('Que se passe-t-il ?').fill('Cabine arrêtée entre deux étages')
  await page.getByRole('button', { name: 'Envoyer le signalement' }).click()
  await expect(page.getByText('Signalement envoyé')).toBeVisible()
  await page.getByRole('link', { name: /Suivre/ }).click()
  await expect(page.getByText(/PERSONNE BLOQUÉE/)).toBeVisible()
  await expect(page.getByText(/Astreinte alertée : Moussa/)).toBeVisible()
})

test('import CSV du parc côté bureau', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Responsable/ }).click()
  await page.goto('/#/office/import')
  await page.getByLabel('Données à importer').fill('Client;Site;Appareil;Marque;N° série;Année\nSyndic Neuf;Bât. Z;Asc Z1;Kone;Z-1;2015')
  await page.getByRole('button', { name: /Importer 1 appareil/ }).click()
  await expect(page.getByText(/1 appareil\(s\), 1 site\(s\) et 1 client\(s\) créés/)).toBeVisible()
})

test('CRUD client/site/contrat et dossier de contrôle technique', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Responsable/ }).click()
  await page.goto('/#/office/clients')
  await page.getByRole('button', { name: '+ Client' }).click()
  await page.getByLabel('Nom', { exact: true }).fill('Copro Test')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText('Copro Test')).toBeVisible()
  // un client avec sites ne peut pas être supprimé
  await page.getByRole('button', { name: 'Supprimer' }).first().click()
  await expect(page.getByRole('alert')).toContainText('encore des sites')
  await page.goto('/#/office/dossier/e1')
  await expect(page.getByRole('heading', { name: 'Dossier de contrôle technique' })).toBeVisible()
  await expect(page.getByText('Schindler 3300')).toBeVisible()
})

test('contrats : statut, indexation ; factures : brouillon, émission numérotée, export', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Responsable/ }).click()
  await page.goto('/#/office/contracts')
  await expect(page.getByText('à appliquer').first()).toBeVisible() // indexation due sur les contrats de démo
  await page.goto('/#/office/invoices')
  await expect(page.getByRole('heading', { name: 'À facturer' })).toBeVisible()
  await page.getByRole('button', { name: /Créer \d+ brouillon/ }).first().click()
  await page.getByRole('button', { name: 'Émettre' }).first().click() // la vue « Brouillons » ne montre plus la facture émise
  await page.getByRole('button', { name: 'Brouillons' }).click()
  await page.getByRole('button', { name: 'Émettre' }).first().click()
  await page.getByRole('button', { name: 'Toutes', exact: true }).click()
  const year = new Date().getFullYear()
  await expect(page.getByRole('link', { name: `FAC-${year}-0001` })).toBeVisible()
  await expect(page.getByRole('link', { name: `FAC-${year}-0002` })).toBeVisible() // séquence continue
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: /Journal des ventes/ }).click()
  expect((await dl).suggestedFilename()).toBe(`journal-ventes-${year}.csv`)
  await page.getByRole('link', { name: `FAC-${year}-0001` }).click()
  await expect(page.getByText('Total TTC').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Marquer payée' })).toBeVisible()
})

test.describe('accessibilité (axe)', () => {
  const pages: [string, string][] = [['login', '/'], ['signal', '/#/signal/e1'], ['status', '/#/status/e4']]
  for (const [name, url] of pages) {
    test(name, async ({ page }) => {
      await page.goto(url)
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
    })
  }
  test('écrans technicien et bureau', async ({ page }) => {
    test.setTimeout(180_000)
    await loginTech(page)
    for (const url of ['/#/tech', '/#/tech/scan', '/#/tech/urgences', '/#/tech/profil', '/#/tech/elevator/e1']) {
      await page.goto(url)
      await page.waitForTimeout(150)
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      expect(r.violations.map((v) => `${url} ${v.id}: ${v.nodes.length}`)).toEqual([])
    }
    await page.goto('/')
    await page.getByRole('button', { name: 'Quitter' }).click()
    await page.getByRole('button', { name: /Responsable/ }).click()
    for (const url of ['/#/office', '/#/office/planning', '/#/office/parc', '/#/office/clients', '/#/office/defects', '/#/office/contracts', '/#/office/invoices', '/#/office/oncall', '/#/office/settings']) {
      await page.goto(url)
      await page.waitForTimeout(150)
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      expect(r.violations.map((v) => `${url} ${v.id}: ${v.nodes.length}`)).toEqual([])
    }
  })
})
