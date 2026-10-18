import { readFileSync } from 'node:fs'
import { expect, test, type Browser, type Page } from '@playwright/test'

const MAIL = '/tmp/cabine-e2e-mail.jsonl'
const lastLink = (to: string): string => {
  const lines = readFileSync(MAIL, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { to: string; text: string })
  const m = [...lines].reverse().find((x) => x.to === to)
  const url = m?.text.match(/(http\S+#\/auth\?token=[\w-]+)/)?.[1]
  if (!url) throw new Error(`pas de lien pour ${to}`)
  return url
}
const waitLink = async (to: string) => {
  for (let i = 0; i < 40; i++) { try { return lastLink(to) } catch { await new Promise((r) => setTimeout(r, 150)) } }
  throw new Error('lien introuvable')
}
const synced = (page: Page) => expect(page.getByRole('status').filter({ hasText: 'Synchronisé' })).toBeVisible({ timeout: 15000 })

const mailCount = (to: string) => { try { return readFileSync(MAIL, 'utf8').trim().split('\n').filter((l) => JSON.parse(l).to === to).length } catch { return 0 } }

/** Nouvelle connexion : demande un lien depuis l'écran de login puis l'ouvre. */
async function freshLogin(browser: Browser, email: string) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 839 } })
  const page = await ctx.newPage()
  const before = mailCount(email)
  await page.goto('/')
  await page.getByLabel('Adresse e-mail').fill(email)
  await page.getByRole('button', { name: /Recevoir mon lien/ }).click()
  await expect(page.getByRole('status')).toContainText('lien de connexion')
  for (let i = 0; i < 40 && mailCount(email) === before; i++) await new Promise((r) => setTimeout(r, 150))
  await page.goto(lastLink(email))
  return { ctx, page }
}

async function loginWithLink(browser: Browser, email: string) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 839 } })
  const page = await ctx.newPage()
  await page.goto(await waitLink(email))
  return { ctx, page }
}

test.describe.serial('mode serveur', () => {
  test('installation, connexion par lien, démo, invitation, synchro entre appareils', async ({ browser, page }) => {
    // 1) installation de l'instance
    await page.goto('/#/setup')
    await page.getByLabel('Nom de l’entreprise').fill('Ascenseurs Dupont')
    await page.getByLabel('Votre nom').fill('Ada Admin')
    await page.getByLabel('Votre e-mail').fill('ada@dupont.test')
    await page.getByLabel(/Jeton d’installation/).fill('mauvais')
    await page.getByRole('button', { name: 'Créer l’organisation' }).click()
    await expect(page.getByRole('alert')).toContainText('incorrect')
    await page.getByLabel(/Jeton d’installation/).fill('e2e-secret')
    await page.getByRole('button', { name: 'Créer l’organisation' }).click()
    await expect(page.getByText('Organisation créée')).toBeVisible()

    // 2) connexion par lien magique (usage unique)
    const link = await waitLink('ada@dupont.test')
    await page.goto(link)
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()
    const again = await browser.newPage()
    await again.goto(link)
    await expect(again.getByText('Lien invalide ou expiré')).toBeVisible()
    await again.close()

    // 3) données de démonstration + invitation d'un technicien
    await page.goto('/#/office/settings')
    await page.getByRole('button', { name: /Charger des données de démonstration/ }).click()
    await synced(page)
    await page.getByLabel('Nom complet').fill('Moussa Technicien')
    await page.getByLabel('Adresse e-mail').fill('moussa@dupont.test')
    await page.getByRole('button', { name: 'Envoyer l’invitation' }).click()
    await expect(page.getByText('Invitation envoyée')).toBeVisible()

    // 4) le bureau affecte une mission au nouveau technicien
    await page.goto('/#/office/planning')
    const row = page.locator('section', { hasText: 'Aujourd’hui' }).locator('div.row', { hasText: 'Ascenseur A1' }).first()
    await row.getByLabel('Technicien').selectOption({ label: 'Moussa Technicien' })
    await synced(page)

    // 5) le technicien (autre appareil) se connecte et reçoit la mission
    const tech = await loginWithLink(browser, 'moussa@dupont.test')
    await expect(tech.page.getByRole('link', { name: /Ascenseur A1/ })).toBeVisible({ timeout: 20000 })

    // 6) hors ligne : le technicien démarre la mission, la modification attend puis part au retour du réseau
    await tech.page.getByRole('link', { name: /Ascenseur A1/ }).click()
    await synced(tech.page)
    await tech.ctx.setOffline(true)
    await tech.page.getByRole('button', { name: /Je suis sur place/ }).click()
    await expect(tech.page.getByRole('status').filter({ hasText: /en attente|Hors ligne/ })).toBeVisible()
    await tech.ctx.setOffline(false)
    await tech.page.evaluate(() => window.dispatchEvent(new Event('online')))
    await synced(tech.page)

    // 7) le bureau voit le statut « Sur place » après synchronisation
    await page.reload()
    await page.goto('/#/office/planning')
    await expect(page.locator('section', { hasText: 'Aujourd’hui' }).getByText('Sur place').first()).toBeVisible({ timeout: 25000 })
    await tech.ctx.close()
  })

  test('un technicien n’accède pas au bureau ; signalement public relayé à l’astreinte', async ({ browser }) => {
    const tech = await freshLogin(browser, 'moussa@dupont.test')
    await expect(tech.page.getByRole('heading', { name: 'Ma journée' })).toBeVisible()
    await tech.page.goto('/#/office')
    await expect(tech.page.getByRole('heading', { name: 'Tableau de bord' })).toHaveCount(0)
    await tech.ctx.close()

    // signalement public (sans connexion) d'un appareil de la démo
    const adminSession = await freshLogin(browser, 'ada@dupont.test')
    const page = adminSession.page
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()
    await page.goto('/#/office/parc')
    await page.getByRole('link', { name: /Ascenseur A1/ }).first().click()
    const url = new URL(page.url())
    const id = url.hash.split('/').pop()!
    const anon = await browser.newContext()
    const p = await anon.newPage()
    await p.goto(`/#/signal/${id}`)
    await p.getByRole('button', { name: /personne est-elle bloquée/ }).click()
    await p.getByLabel('Que se passe-t-il ?').fill('Cabine immobilisée')
    await p.getByRole('button', { name: 'Envoyer le signalement' }).click()
    await expect(p.getByText('Signalement envoyé')).toBeVisible()
    await p.getByRole('link', { name: /Suivre/ }).click()
    await expect(p.getByText(/PERSONNE BLOQUÉE/)).toBeVisible()
    await anon.close()

    // le bureau voit la panne remonter par la synchro
    await page.goto('/#/office')
    await expect(page.getByText(/PERSONNE BLOQUÉE/).first()).toBeVisible({ timeout: 25000 })
    await adminSession.ctx.close()
  })

  test('une photo prise par le technicien est stockée sur le serveur, adressée par empreinte', async ({ browser }) => {
    const tech = await freshLogin(browser, 'moussa@dupont.test')
    const page = tech.page
    await expect(page.getByRole('heading', { name: 'Ma journée' })).toBeVisible()
    await page.getByRole('link', { name: /Ascenseur A1/ }).click()
    await page.getByRole('button', { name: /Je confirme la consignation/ }).click()
    await page.getByRole('button', { name: /Suivant/ }).click()
    await page.getByRole('button', { name: /Défaut/ }).first().click()
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64')
    await page.locator('input[type=file]').first().setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: png })
    await expect(page.getByRole('img', { name: 'Photo 1' })).toBeVisible()
    await synced(page)
    const result = await page.evaluate(async () => {
      const pull = await (await fetch('/api/sync/pull?since=0&limit=500')).json()
      const ref = JSON.stringify(pull.docs).match(/file:([0-9a-f]{64})/)?.[1]
      if (!ref) return { ref: null }
      const f = await fetch(`/api/files/${ref}`)
      return { ref, status: f.status, type: f.headers.get('content-type'), inline: JSON.stringify(pull.docs).includes('data:image') }
    })
    expect(result.ref).toMatch(/^[0-9a-f]{64}$/)
    expect(result.status).toBe(200)
    expect(result.type).toBe('image/jpeg')
    expect(result.inline).toBe(false) // plus aucune image en base64 dans les documents
    await tech.ctx.close()
  })

  test('facture : émission numérotée par le serveur, historique visible, PDF et envoi par e-mail', async ({ browser }) => {
    const admin = await freshLogin(browser, 'ada@dupont.test')
    const page = admin.page
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible() // la connexion par lien doit être terminée
    await page.goto('/#/office/invoices')
    await page.getByRole('button', { name: /Créer \d+ brouillon/ }).first().click()
    await page.getByRole('button', { name: 'Émettre' }).first().click()
    await page.getByRole('button', { name: 'Toutes', exact: true }).click()
    const year = new Date().getFullYear()
    const link = page.getByRole('link', { name: `FAC-${year}-0001` })
    await expect(link).toBeVisible({ timeout: 20000 }) // numéro attribué par le serveur
    await link.click()
    await expect(page.getByRole('heading', { name: new RegExp(`FAC-${year}-0001`) })).toBeVisible()
    // historique : l'émission et la création sont tracées avec l'utilisateur
    await expect(page.getByText('a émis la facture')).toBeVisible({ timeout: 20000 })
    await expect(page.getByText('Ada Admin').first()).toBeVisible()
    // PDF
    const pdf = await page.evaluate(async () => {
      const id = location.hash.split('/').pop()
      const r = await fetch(`/api/invoices/${id}/pdf`)
      return { status: r.status, type: r.headers.get('content-type'), head: new TextDecoder().decode((await r.arrayBuffer()).slice(0, 5)) }
    })
    expect(pdf).toEqual({ status: 200, type: 'application/pdf', head: '%PDF-' })
    // envoi par e-mail avec pièce jointe
    const before = mailCount('syndic.lilas@example.com')
    await page.getByRole('button', { name: 'Envoyer au client' }).click()
    await expect(page.getByText(/Facture envoyée à syndic\.lilas@example\.com/)).toBeVisible()
    for (let i = 0; i < 30 && mailCount('syndic.lilas@example.com') === before; i++) await new Promise((r) => setTimeout(r, 100))
    const lines = readFileSync(MAIL, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { to: string[] | string; subject: string; attachments?: { filename: string }[] })
    const sent = [...lines].reverse().find((m) => [m.to].flat().includes('syndic.lilas@example.com'))!
    expect(sent.subject).toContain(`FAC-${year}-0001`)
    expect(sent.attachments?.[0].filename).toBe(`FAC-${year}-0001.pdf`)
    await admin.ctx.close()
  })
})
