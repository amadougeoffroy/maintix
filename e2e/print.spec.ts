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

test('le logo des étiquettes QR est lisible sur papier blanc, même en thème sombre', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await page.getByRole('button', { name: /Responsable/ }).click()
  await page.goto('/#/office/qr')
  await page.emulateMedia({ media: 'print', colorScheme: 'dark' })
  const fills = await page.locator('.qr-brand svg path').evaluateAll((els) => els.map((e) => getComputedStyle(e).fill))
  expect(fills.length).toBeGreaterThan(0)
  expect(fills).not.toContain('rgb(255, 255, 255)') // pas de texte blanc sur fond blanc
})
