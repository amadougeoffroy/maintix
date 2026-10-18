import { expect, test } from '@playwright/test'

test('l’impression d’un rapport reste lisible en thème sombre', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await page.getByRole('button', { name: /Responsable/ }).click()
  await page.goto('/#/office/dashboard')
  await page.emulateMedia({ media: 'print', colorScheme: 'dark' })
  const { text, bg } = await page.evaluate(() => ({ text: getComputedStyle(document.body).color, bg: getComputedStyle(document.body).backgroundColor }))
  expect(bg).toBe('rgb(255, 255, 255)')
  expect(text).not.toBe('rgb(232, 240, 239)') // texte clair du thème sombre
})
