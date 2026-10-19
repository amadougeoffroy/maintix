import { expect, test } from '@playwright/test'

test.describe('retours d’action et menu groupé', () => {
  test.use({ viewport: { width: 1280, height: 800 } })
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Responsable/ }).click()
  })

  test('la suppression d’une mission demande une confirmation stylée puis affiche un toast', async ({ page }) => {
    await page.goto('/#/office/planning')
    const del = page.getByRole('button', { name: 'Annuler la mission' }).first()
    await expect(del).toBeVisible()
    await del.click()
    const dlg = page.getByRole('dialog')
    await expect(dlg.getByRole('heading', { name: 'Supprimer cette mission ?' })).toBeVisible()
    await dlg.getByRole('button', { name: 'Garder' }).click()
    await expect(dlg).toBeHidden()
    await del.click()
    await page.getByRole('dialog').getByRole('button', { name: 'Supprimer la mission' }).click()
    await expect(page.locator('.toast-item')).toContainText(/supprimée/i)
  })

  test('le menu latéral est groupé et repliable', async ({ page }) => {
    const nav = page.getByRole('navigation').first()
    await expect(nav.getByText('Pilotage')).toBeVisible()
    await expect(nav.getByText('Commercial')).toBeVisible()
    const group = nav.getByRole('button', { name: /Commercial/ })
    await group.click()
    await expect(nav.getByRole('link', { name: 'Devis' })).toBeHidden()
    await group.click()
    await expect(nav.getByRole('link', { name: 'Devis' })).toBeVisible()
  })
})

test('le thème choisi survit à un rechargement', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Moussa/ }).click()
  await page.goto('/#/tech/profil')
  await page.getByRole('button', { name: 'Clair' }).click()
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: 'Auto' }).click()
  await page.reload()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/)
})

test('un client peut revenir en arrière depuis la fiche d’un appareil', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Syndic Résidence/ }).click()
  await page.getByRole('link', { name: 'Signaler une panne' }).first().click()
  await page.getByRole('button', { name: /Retour/ }).click()
  await expect(page.getByRole('link', { name: 'Signaler une panne' }).first()).toBeVisible()
  // arrivée directe (QR code) sans historique : connecté, le retour mène à l'accueil
  await page.goto('/#/status/e1')
  await page.reload()
  await page.getByRole('button', { name: /Retour/ }).click()
  await expect(page.getByRole('link', { name: 'Signaler une panne' }).first()).toBeVisible()
})

test('le bouton clair/sombre bascule le thème et le mémorise', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await page.getByRole('button', { name: /Moussa/ }).click()
  await page.getByRole('button', { name: 'Passer au thème sombre' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Passer au thème clair' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.getByRole('button', { name: 'Passer au thème sombre' })).toBeVisible()
})
