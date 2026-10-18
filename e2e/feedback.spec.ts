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
