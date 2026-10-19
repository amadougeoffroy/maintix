import { readFileSync } from 'node:fs'
import { expect, test, type Browser, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

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
/** Ferme la visite guidée d'accueil si elle s'affiche (première connexion d'un membre dans une entreprise). */
const skipWelcome = async (page: Page) => { await page.getByRole('button', { name: 'Passer', exact: true }).click({ timeout: 4000 }).catch(() => {}) }
const synced = (page: Page) => expect(page.getByRole('status').filter({ hasText: 'Synchronisé' })).toBeVisible({ timeout: 15000 })

const mailCount = (to: string) => { try { return readFileSync(MAIL, 'utf8').trim().split('\n').filter((l) => JSON.parse(l).to === to).length } catch { return 0 } }

/** Nouvelle connexion : demande un lien depuis l'écran de login puis l'ouvre. */
async function freshLogin(browser: Browser, email: string) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 839 } })
  const page = await ctx.newPage()
  const before = mailCount(email)
  await page.goto('/')
  await page.getByRole('link', { name: 'Recevoir mon lien de connexion' }).first().click() // depuis la page de présentation
  await page.getByLabel('Adresse e-mail').fill(email)
  await page.getByRole('button', { name: /Recevoir mon lien/ }).click()
  await expect(page.getByRole('status')).toContainText('lien de connexion')
  for (let i = 0; i < 40 && mailCount(email) === before; i++) await new Promise((r) => setTimeout(r, 150))
  await page.goto(lastLink(email))
  await skipWelcome(page)
  return { ctx, page }
}

async function loginWithLink(browser: Browser, email: string) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 839 } })
  const page = await ctx.newPage()
  await page.goto(await waitLink(email))
  await skipWelcome(page)
  return { ctx, page }
}

test.describe.serial('mode serveur', () => {
  test('page de présentation à la racine, avec accès à la connexion et à la demande d’accès', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Chaque visite, tracée.' })).toBeVisible()
    await page.waitForTimeout(300)
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      expect(axe.violations.map((v) => `${scheme} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
    }
    await page.emulateMedia({ colorScheme: 'light' })
    if (process.env.SHOTS) await page.screenshot({ path: 'docs/screenshots/47-page-presentation.png', fullPage: true })
    await page.getByRole('link', { name: 'Recevoir mon lien de connexion' }).first().click()
    await expect(page.getByRole('heading', { name: 'Recevoir mon lien de connexion' })).toBeVisible()
    await expect(page.getByLabel('Adresse e-mail')).toBeVisible()
    await page.getByRole('link', { name: /Retour à l’accueil/ }).click()
    await page.getByRole('link', { name: 'Demander un accès' }).first().click()
    await expect(page.getByRole('heading', { name: 'Demander un accès' })).toBeVisible()
    await expect(page.getByLabel('Nom de l’entreprise')).toBeVisible()
    await expect(page.getByRole('link', { name: 'politique de confidentialité' })).toBeVisible() // consentement explicite sur le formulaire

    // la démonstration est une option de la page d'accueil, jamais le comportement par défaut de la racine
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Chaque visite, tracée.' })).toBeVisible()
    await expect(page.getByText('Mode démonstration (aucun serveur détecté)')).toHaveCount(0)
    await page.getByRole('button', { name: /Essayer la démonstration/ }).first().click()
    await expect(page.getByText(/Mode démonstration : explorez Maintix/)).toBeVisible()
    await page.getByRole('button', { name: /Responsable/ }).click()
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Mode démonstration' })).toContainText('données d’exemple')
    await page.getByRole('button', { name: 'Quitter la démo' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Chaque visite, tracée.' })).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('maintix-demo'))).toBeNull()
    await page.goto('/#/login')
    await expect(page.getByRole('heading', { name: 'Recevoir mon lien de connexion' })).toBeVisible() // le mode serveur n'est pas touché
    await page.goto('/')

    // pages légales, depuis le pied de page
    await page.goto('/')
    for (const [link, title] of [['Mentions légales', 'Mentions légales'], ['Confidentialité', 'Politique de confidentialité'], ['Conditions d’utilisation', 'Conditions d’utilisation']] as const) {
      await page.getByRole('navigation', { name: 'Informations légales' }).getByRole('link', { name: link }).click()
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme })
        const a = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
        expect(a.violations.map((v) => `${title} ${scheme} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
      }
      await page.emulateMedia({ colorScheme: 'light' })
      await page.getByRole('link', { name: '← Accueil' }).click()
    }
  })

  test('installation, connexion par lien, démo, invitation, synchro entre appareils', async ({ browser, page }) => {
    // 1) installation de l'instance
    await page.goto('/#/setup')
    await page.getByLabel('Nom de l’entreprise').fill('Maintix')
    await page.getByLabel('Votre nom').fill('Opérateur Dupont')
    await page.getByLabel('Votre e-mail').fill('ops@dupont.test')
    await page.getByLabel(/Jeton d’installation/).fill('mauvais')
    await page.getByRole('button', { name: 'Créer l’organisation' }).click()
    await expect(page.getByRole('alert')).toContainText('incorrect')
    await page.getByLabel(/Jeton d’installation/).fill('e2e-secret')
    await page.getByRole('button', { name: 'Créer l’organisation' }).click()
    await expect(page.getByText('Organisation créée')).toBeVisible()

    // 1 bis) l'opérateur arrive sur la console (page par défaut) et crée l'entreprise cliente et son administrateur
    const op = await loginWithLink(browser, 'ops@dupont.test')
    await expect(op.page.getByRole('heading', { name: 'Console opérateur' })).toBeVisible()
    await op.page.getByLabel('Nom de l’entreprise').fill('Ascenseurs Dupont')
    await op.page.getByLabel('Nom de l’administrateur').fill('Ada Admin')
    await op.page.getByLabel('E-mail de l’administrateur').fill('ada@dupont.test')
    await op.page.getByRole('button', { name: 'Créer et envoyer l’invitation' }).click()
    await op.page.getByRole('dialog').getByRole('button', { name: 'Compris' }).click()
    await op.ctx.close()

    // 2) connexion de l'administrateur par lien magique (usage unique)
    const link = await waitLink('ada@dupont.test')
    await page.goto(link)
    await expect(page.getByRole('dialog').getByRole('heading', { name: /Bienvenue Ada/ })).toBeVisible() // première connexion : visite guidée
    await skipWelcome(page)
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()
    const again = await browser.newPage()
    await again.goto(link)
    await expect(again.getByText('Lien invalide ou expiré')).toBeVisible()
    await again.close()

    // 3) données de démonstration + invitation d'un technicien
    await page.goto('/#/office/settings/aide')
    await page.getByRole('button', { name: /Charger des données de démonstration/ }).click()
    await synced(page)
    await page.goto('/#/office/settings/equipe')
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

  test('console opérateur : création d’une entreprise et de son administrateur, offre, suspension, inscription libre-service', async ({ browser }) => {
    const ada = await freshLogin(browser, 'ops@dupont.test')
    const page = ada.page
    await expect(page.getByRole('heading', { name: 'Console opérateur' })).toBeVisible() // console = page par défaut d'un opérateur
    await expect(page.getByRole('heading', { name: 'Ascenseurs Dupont' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Maintix', exact: true })).toHaveCount(0) // l'entreprise plateforme n'est pas listée
    await expect(page.getByText('Techniciens').first()).toBeVisible()

    // l'entreprise de l'administrateur s'est déjà connectée ; filtre par connexion
    await expect(page.locator('article', { hasText: 'Ascenseurs Dupont' }).getByText('Déjà connectée')).toBeVisible()
    await page.getByRole('radio', { name: /Jamais connectées/ }).click()
    await expect(page.locator('article', { hasText: 'Ascenseurs Dupont' })).toHaveCount(0)
    await page.getByRole('radio', { name: /Déjà connectées/ }).click()
    await expect(page.locator('article', { hasText: 'Ascenseurs Dupont' })).toBeVisible()
    await page.getByRole('radio', { name: /Toutes/ }).click()

    // ouvrir une entreprise cliente, puis revenir à la console grâce au bandeau
    const dupont = page.locator('article', { hasText: 'Ascenseurs Dupont' })
    await dupont.getByRole('button', { name: 'Ouvrir l’entreprise' }).click()
    await expect(page.getByRole('region', { name: 'Mode opérateur' })).toContainText('Ascenseurs Dupont')
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0) // pas de visite guidée en mode opérateur
    await page.getByRole('region', { name: 'Mode opérateur' }).getByRole('button', { name: /Retour à la console/ }).click()
    await expect(page.getByRole('heading', { name: 'Console opérateur' })).toBeVisible()

    // catalogue d'offres géré depuis la console
    await page.getByRole('tab', { name: 'Offres' }).click()
    await page.getByLabel('Code (identifiant)').fill('premium')
    await page.getByLabel('Nom de l’offre').last().fill('Premium')
    await page.getByLabel('Prix mensuel (FCFA)').last().fill('150000')
    await page.getByRole('button', { name: 'Créer l’offre' }).click()
    await expect(page.locator('.toast-item', { hasText: 'Offre « Premium » créée' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Premium/ })).toBeVisible()
    await page.getByRole('tab', { name: 'Entreprises' }).click()

    // création d'une entreprise + son premier administrateur en une action
    await page.getByLabel('Nom de l’entreprise').fill('Entreprise Cliente SA')
    await page.getByLabel('Offre').first().selectOption({ label: 'Essentiel' })
    await page.getByLabel('Nom de l’administrateur').fill('Directeur Test')
    await page.getByLabel('E-mail de l’administrateur').fill('dg@cliente.test')
    await page.getByRole('button', { name: 'Créer et envoyer l’invitation' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Entreprise « Entreprise Cliente SA » créée' })).toBeVisible({ timeout: 20000 })
    await expect(dialog).toContainText('dg@cliente.test')
    if (process.env.SHOTS) await page.screenshot({ path: 'docs/screenshots/40-dialogue-entreprise-creee.png' })
    await page.waitForTimeout(500)
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
    await dialog.getByRole('button', { name: 'Compris' }).click()
    await expect(page.getByRole('heading', { name: 'Entreprise Cliente SA' })).toBeVisible()
    if (process.env.SHOTS) await page.screenshot({ path: 'docs/screenshots/44-console-operateur.png', fullPage: true })

    // le nouvel administrateur : visite guidée, nom de l'entreprise, offre visible, aucune console
    const dg = await browser.newContext({ viewport: { width: 412, height: 839 } })
    const dgPage = await dg.newPage()
    await dgPage.goto(await waitLink('dg@cliente.test'))
    await expect(dgPage.getByRole('dialog').getByRole('heading', { name: /Bienvenue Directeur/ })).toBeVisible()
    await skipWelcome(dgPage)
    await expect(dgPage.locator('.org-line')).toHaveText('Entreprise Cliente SA')
    await dgPage.goto('/#/operator')
    await expect(dgPage.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible() // redirigé : pas opérateur
    await expect(dgPage.getByRole('link', { name: 'Console opérateur' })).toHaveCount(0)
    await dgPage.goto('/#/office/settings/entreprise')
    await expect(dgPage.getByRole('heading', { name: 'Votre offre' })).toBeVisible()
    await expect(dgPage.getByText('Essentiel')).toBeVisible()
    await expect(dgPage.getByLabel('Nom de la nouvelle entreprise')).toHaveCount(0)

    // offre : plafonds modifiables par l'opérateur
    const card = page.locator('article', { hasText: 'Entreprise Cliente SA' })
    await card.getByRole('button', { name: 'Offre et plafonds' }).click()
    await card.getByLabel('Plafond techniciens').fill('2')
    await card.getByLabel('En cas de dépassement').selectOption('block')
    await card.getByRole('button', { name: 'Enregistrer l’offre' }).click()
    await expect(page.locator('.toast-item', { hasText: 'Offre de « Entreprise Cliente SA » enregistrée' })).toBeVisible()

    // plafond bloquant : 2 techniciens acceptés, le 3e est refusé avec un message clair
    await dgPage.goto('/#/office/settings/equipe')
    for (const [i, ok] of [[1, true], [2, true], [3, false]] as const) {
      await dgPage.getByLabel('Nom complet').fill(`Tech Plafond ${i}`)
      await dgPage.getByLabel('Adresse e-mail').fill(`plafond${i}@cliente.test`)
      await dgPage.getByRole('button', { name: 'Envoyer l’invitation' }).click()
      if (ok) await expect(dgPage.locator('.toast-item', { hasText: `plafond${i}@cliente.test` })).toBeVisible()
      else {
        await expect(dgPage.getByRole('dialog').getByRole('heading', { name: 'Limite de votre offre atteinte' })).toBeVisible()
        await expect(dgPage.getByRole('dialog').getByRole('button', { name: 'Changer d’offre' })).toBeVisible()
        await dgPage.getByRole('dialog').getByRole('button', { name: 'Fermer' }).click()
      }
    }

    // à 7 jours de l'échéance : bande rouge sur toutes les pages de l'entreprise, avec bouton vers l'abonnement
    const in3 = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)
    await card.getByRole('button', { name: 'Offre et plafonds' }).click()
    await card.getByLabel('Échéance de l’abonnement').fill(in3)
    await card.getByRole('button', { name: 'Enregistrer l’offre' }).click()
    await dgPage.goto('/#/office')
    await dgPage.reload()
    const banner = dgPage.locator('.renew-banner')
    await expect(banner).toContainText('Votre abonnement se termine dans 3 jours')
    await dgPage.goto('/#/office/planning')
    await expect(banner).toBeVisible() // visible sur toutes les pages
    if (process.env.SHOTS) await dgPage.screenshot({ path: 'docs/screenshots/48-bande-renouvellement.png' })
    await banner.getByRole('button', { name: 'Renouveler maintenant' }).click()
    await expect(dgPage.getByRole('heading', { name: 'Abonnement et paiement' })).toBeVisible()

    // suspension avec motif
    await card.getByRole('button', { name: 'Suspendre…' }).click()
    await card.getByLabel('Motif de suspension').selectOption({ label: 'Facture impayée' })
    await card.getByLabel(/Précision/).fill('Facture de mars')
    await card.getByRole('button', { name: 'Suspendre l’entreprise' }).click()
    await expect(card.getByText('Suspendue').first()).toBeVisible()
    await expect(card).toContainText('levée possible par le paiement')
    // les comptes de l'entreprise sont déconnectés aussitôt (au plus tard à la prochaine synchronisation)
    await expect(dgPage.getByText('Votre session a été fermée')).toBeVisible({ timeout: 35000 })
    await expect(dgPage.getByRole('heading', { level: 1, name: 'Chaque visite, tracée.' })).toBeVisible()
    // en se reconnectant, l'administrateur arrive sur l'écran de suspension
    const dg2 = await freshLogin(browser, 'dg@cliente.test')
    await expect(dg2.page.getByRole('heading', { name: 'Accès suspendu' })).toBeVisible()
    await expect(dg2.page.getByText('Facture impayée')).toBeVisible()
    await expect(dg2.page.getByText('paiement en ligne n’est pas encore activé')).toBeVisible() // motif payable, mais Jèko pas encore configuré
    if (process.env.SHOTS) await dg2.page.screenshot({ path: 'docs/screenshots/45-acces-suspendu.png' })
    // réactivation
    await card.getByRole('button', { name: 'Réactiver' }).click()
    await dg2.page.reload()
    await expect(dg2.page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()
    await dg2.ctx.close()

    // finances et réglages Jèko de la console
    await page.getByRole('tab', { name: 'Finances' }).click()
    await expect(page.getByText('Reste à payer (échus)').first()).toBeVisible()
    await expect(page.getByText('Encaissé (total)')).toBeVisible()
    // paiement reçu hors ligne : remise de 6 mois, reçu PDF, évolution par offre
    const form = page.locator('form', { hasText: 'Enregistrer un paiement reçu hors ligne' })
    await form.getByLabel('Entreprise').selectOption({ label: 'Entreprise Cliente SA' })
    await form.locator('select').nth(1).selectOption({ label: 'Essentiel' })
    await form.locator('select').nth(2).selectOption('6')
    await form.getByRole('button', { name: 'Enregistrer le paiement' }).click()
    await expect(page.locator('.toast-item', { hasText: 'Paiement enregistré' })).toBeVisible()
    await expect(page.getByText('189 000 FCFA').first()).toBeVisible() // 35 000 × 6 − 10 %
    await expect(page.getByRole('heading', { name: 'Évolution des encaissements par offre' })).toBeVisible()
    await expect(page.getByText('Remises de durée accordées : 21 000 FCFA')).toBeVisible()
    const receipt = page.getByRole('link', { name: /Télécharger le reçu REC-/ }).first()
    const href = await receipt.getAttribute('href')
    const res = await page.request.get(href!)
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toBe('application/pdf')
    expect((await res.body()).subarray(0, 5).toString()).toBe('%PDF-')
    await page.waitForTimeout(400)
    if (process.env.SHOTS) await page.screenshot({ path: 'docs/screenshots/51-finances-par-offre.png', fullPage: true })
    const axe4 = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(axe4.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
    await page.getByText('Voir le détail chiffré').click()
    await expect(page.getByRole('table', { name: /Encaissements par mois et par offre/ })).toBeVisible()
    await page.getByRole('tab', { name: 'Paiements Jèko' }).click()
    await page.getByLabel(/Clé API/).fill('sk_test_E2E00001')
    await page.getByLabel(/Identifiant de la clé/).fill('kid-e2e')
    await page.getByLabel(/Identifiant de la boutique/).fill('store-e2e')
    await page.getByLabel(/Secret de signature/).fill('whsec_E2E')
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await expect(page.locator('.toast-item', { hasText: 'Réglages de paiement enregistrés' })).toBeVisible()
    await expect(page.getByText('Clés API enregistrées')).toBeVisible()
    await expect(page.getByText('sk_test_E2E00001')).toHaveCount(0) // jamais réaffichée en clair
    await expect(page.getByLabel(/Clé API/)).toHaveValue('')
    await page.waitForTimeout(400)
    const axe2 = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(axe2.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])

    // l'administrateur voit, pour chaque offre, ses avantages (techniciens, appareils…) avant de payer
    const payer = await freshLogin(browser, 'dg@cliente.test')
    await payer.page.goto('/#/office/settings/abonnement')
    const cards = payer.page.getByRole('radiogroup', { name: 'Offre' })
    await expect(cards.getByRole('radio', { name: /Essentiel/ })).toContainText('Jusqu’à 2 techniciens'.replace('2', '5'))
    await expect(cards.getByRole('radio', { name: /Pro/ })).toContainText('Jusqu’à 15 techniciens')
    await expect(cards.getByRole('radio', { name: /Pro/ })).toContainText('Jusqu’à 500 appareils')
    await cards.getByRole('radio', { name: /Pro/ }).click()
    await payer.page.getByRole('radio', { name: '3 mois' }).click()
    await expect(payer.page.getByText('Pro · 3 mois × 90 000 FCFA')).toBeVisible()
    await expect(payer.page.getByRole('button', { name: /Payer 270 000 FCFA avec Jèko/ })).toBeVisible()
    // remises de durée : −10 % à 6 mois, −20 % à 12 mois
    await expect(payer.page.getByRole('radio', { name: /6 mois/ })).toContainText('−10 %')
    await payer.page.getByRole('radio', { name: /6 mois/ }).click()
    await expect(payer.page.getByText('Remise de 10 % : vous économisez 54 000 FCFA.')).toBeVisible()
    await expect(payer.page.getByRole('button', { name: /Payer 486 000 FCFA avec Jèko/ })).toBeVisible()
    await payer.page.getByRole('radio', { name: /12 mois/ }).click()
    await expect(payer.page.getByText('Remise de 20 % : vous économisez 216 000 FCFA.')).toBeVisible()
    await expect(payer.page.getByRole('button', { name: /Payer 864 000 FCFA avec Jèko/ })).toBeVisible()
    await payer.page.waitForTimeout(400)
    const axe3 = await new AxeBuilder({ page: payer.page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(axe3.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
    if (process.env.SHOTS) await payer.page.screenshot({ path: 'docs/screenshots/49-choix-offre.png', fullPage: true })
    await payer.ctx.close()

    // TVA optionnelle : activée par l'opérateur, elle s'ajoute au total et le détail HT / TVA / TTC apparaît
    await page.getByLabel('Appliquer la TVA aux abonnements').check()
    await page.getByLabel(/Taux de TVA/).fill('18')
    await page.getByRole('button', { name: 'Enregistrer la TVA' }).click()
    await expect(page.locator('.toast-item', { hasText: 'TVA de 18 % appliquée' })).toBeVisible()
    const payerVat = await freshLogin(browser, 'dg@cliente.test')
    await payerVat.page.goto('/#/office/settings/abonnement')
    await payerVat.page.getByRole('radio', { name: /Pro/ }).click()
    await payerVat.page.getByRole('radio', { name: '3 mois' }).click()
    await expect(payerVat.page.getByText('TVA 18 %')).toBeVisible()
    await expect(payerVat.page.getByText('Total TTC à payer')).toBeVisible()
    await expect(payerVat.page.getByRole('button', { name: /Payer 318 600 FCFA avec Jèko/ })).toBeVisible() // 270 000 HT + 48 600 de TVA
    await payerVat.ctx.close()
    await page.getByLabel('Appliquer la TVA aux abonnements').uncheck()
    await page.getByRole('button', { name: 'Enregistrer la TVA' }).click()
    await expect(page.locator('.toast-item', { hasText: 'TVA désactivée' })).toBeVisible()

    // interrupteur des paiements : désactivés, l'entreprise voit le message et le contact du support
    await page.getByLabel('Autoriser les entreprises à payer leur offre en ligne').uncheck()
    await page.getByRole('button', { name: 'Enregistrer l’interrupteur' }).click()
    await expect(page.locator('.toast-item', { hasText: 'Paiements en ligne désactivés' })).toBeVisible()
    const noPay = await freshLogin(browser, 'dg@cliente.test')
    await noPay.page.goto('/#/office/settings/abonnement')
    await expect(noPay.page.getByText('Paiements sur la plateforme désactivés temporairement')).toBeVisible()
    await expect(noPay.page.getByRole('link', { name: /Appeler le 0757820485/ })).toHaveAttribute('href', 'tel:0757820485')
    await expect(noPay.page.getByRole('link', { name: 'contact@windsit-digital.com' })).toHaveAttribute('href', 'mailto:contact@windsit-digital.com')
    await expect(noPay.page.getByRole('button', { name: /Payer .* avec Jèko/ })).toHaveCount(0)
    await noPay.page.waitForTimeout(400)
    const axe5 = await new AxeBuilder({ page: noPay.page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(axe5.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
    if (process.env.SHOTS) await noPay.page.screenshot({ path: 'docs/screenshots/52-paiements-desactives.png', fullPage: true })
    await noPay.ctx.close()
    await page.getByLabel('Autoriser les entreprises à payer leur offre en ligne').check()
    await page.getByRole('button', { name: 'Enregistrer l’interrupteur' }).click()
    await expect(page.locator('.toast-item', { hasText: 'Paiements en ligne activés' })).toBeVisible()

    // facturation de la plateforme : montants en FCFA
    await page.getByRole('tab', { name: 'Usage et facturation' }).click()
    await expect(page.getByText('35 000 FCFA').first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Exporter (CSV)' })).toBeVisible()

    // inscription en libre-service, validation par l'opérateur
    const anon = await browser.newContext({ viewport: { width: 412, height: 839 } })
    const ap = await anon.newPage()
    await ap.goto('/#/signup')
    await ap.getByLabel('Nom de l’entreprise').fill('Ascenseurs Diallo')
    await ap.getByLabel('Votre nom').fill('Awa Diallo')
    await ap.getByLabel('Votre e-mail professionnel').fill('awa@diallo.test')
    await ap.getByRole('button', { name: 'Envoyer ma demande' }).click()
    await expect(ap.getByRole('heading', { name: 'Demande envoyée' })).toBeVisible()
    await page.reload()
    await page.getByRole('tab', { name: /Demandes/ }).click()
    await expect(page.getByRole('heading', { name: 'Ascenseurs Diallo' })).toBeVisible({ timeout: 20000 })
    await page.getByRole('button', { name: 'Approuver et inviter' }).click()
    await expect(page.getByRole('dialog').getByRole('heading', { name: /Accès accordé/ })).toBeVisible()
    await page.getByRole('button', { name: 'Compris' }).click()
    const awa = await browser.newContext({ viewport: { width: 412, height: 839 } })
    const awaPage = await awa.newPage()
    await awaPage.goto(await waitLink('awa@diallo.test'))
    await expect(awaPage.getByRole('dialog').getByRole('heading', { name: /Bienvenue Awa/ })).toBeVisible()
    // suppression définitive d'une entreprise : le nom exact est retapé pour confirmer
    await page.reload()
    const diallo = page.locator('article', { hasText: 'Ascenseurs Diallo' })
    await diallo.getByRole('button', { name: 'Supprimer…' }).click()
    const confirmBtn = diallo.getByRole('button', { name: 'Supprimer définitivement' })
    await expect(confirmBtn).toBeDisabled()
    await diallo.getByLabel(/Retapez le nom exact/).fill('Ascenseurs Dialo')
    await expect(confirmBtn).toBeDisabled()
    await diallo.getByLabel(/Retapez le nom exact/).fill('Ascenseurs Diallo')
    await confirmBtn.click()
    await expect(page.locator('.toast-item', { hasText: 'et ses données ont été supprimées' })).toBeVisible()
    await expect(page.locator('article', { hasText: 'Ascenseurs Diallo' })).toHaveCount(0)
    await awaPage.reload()
    await expect(awaPage.getByRole('heading', { level: 1, name: 'Chaque visite, tracée.' })).toBeVisible() // son compte n'existe plus
    await Promise.all([dg.close(), anon.close(), awa.close(), ada.ctx.close()])
  })

  test('didacticiel : visite guidée au premier accès, nom de l’entreprise sur le tableau de bord, premiers pas qui se cochent', async ({ browser }) => {
    const admin = await freshLogin(browser, 'ada@dupont.test')
    const apage = admin.page
    await expect(apage.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()
    await expect(apage.locator('.org-line')).toHaveText('Ascenseurs Dupont') // nom visible sur le tableau de bord
    await expect(apage.locator('.org-side')).toHaveText('Ascenseurs Dupont') // et dans la barre latérale

    // l'opérateur crée une autre entreprise ; son administrateur (nouveau compte) se connecte
    const op = await freshLogin(browser, 'ops@dupont.test')
    await op.page.getByLabel('Nom de l’entreprise').fill('Entreprise Tuto')
    await op.page.getByLabel('Nom de l’administrateur').fill('Ada Tuto')
    await op.page.getByLabel('E-mail de l’administrateur').fill('tuto@dupont.test')
    await op.page.getByRole('button', { name: 'Créer et envoyer l’invitation' }).click()
    await op.page.getByRole('dialog').getByRole('button', { name: 'Compris' }).click()
    await op.ctx.close()
    await admin.ctx.close()
    const tutoCtx = await browser.newContext({ viewport: { width: 412, height: 839 } })
    const page2 = await tutoCtx.newPage()
    await page2.goto(await waitLink('tuto@dupont.test'))

    // première visite de cette entreprise : visite guidée en 5 écrans
    const page = page2
    const tour = page.getByRole('dialog')
    await expect(tour.getByRole('heading', { name: 'Bienvenue Ada' })).toBeVisible()
    await expect(tour).toContainText('Votre espace « Entreprise Tuto » est prêt')
    await page.waitForTimeout(500) // laisse finir l'animation d'ouverture (la transparence fausse la mesure des contrastes)
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} ${n.any[0]?.message ?? ''}`).join(' | ')}`)).toEqual([])
    await tour.getByRole('button', { name: 'Suivant' }).click()
    await expect(tour.getByRole('heading', { name: /application mobile/ })).toBeVisible()
    await tour.getByRole('button', { name: 'Précédent' }).click()
    await expect(tour.getByRole('heading', { name: 'Bienvenue Ada' })).toBeVisible()
    for (let i = 0; i < 4; i++) await tour.getByRole('button', { name: 'Suivant' }).click()
    await expect(tour.getByRole('heading', { name: /Commençons/ })).toBeVisible()
    if (process.env.SHOTS) await page.screenshot({ path: 'docs/screenshots/42-visite-guidee.png' })
    await tour.getByRole('button', { name: 'Voir mes premiers pas' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()

    // liste « Premiers pas » : 0/8, puis l'étape entreprise se coche d'elle-même
    await expect(page.getByRole('heading', { name: 'Premiers pas' })).toBeVisible()
    await expect(page.locator('.gs .badge')).toHaveText('0/8')
    await expect(page.locator('.org-line')).toHaveText('Entreprise Tuto')
    if (process.env.SHOTS) await page.screenshot({ path: 'docs/screenshots/43-premiers-pas.png' })
    await page.getByRole('link', { name: 'Ouvrir les réglages' }).click()
    const form = page.locator('form', { hasText: 'Entreprise et facturation' })
    await form.getByLabel('Raison sociale').fill('Entreprise Tuto SAS')
    await form.getByLabel(/RCCM/).fill('CI-ABJ-2020-B-12345')
    await form.getByRole('button', { name: 'Enregistrer' }).click()
    await page.goto('/#/office')
    await expect(page.locator('.gs .badge')).toHaveText('1/8')

    // l'avancement est enregistré sur le serveur : un nouvel appareil ne ré-affiche pas la visite
    const again = await freshLogin(browser, 'tuto@dupont.test')
    await again.page.goto('/#/office/settings/entreprise')
    await expect(again.page.getByRole('dialog')).toHaveCount(0)
    await again.ctx.close()

    // masquer puis réafficher la liste depuis les réglages
    await page.getByRole('button', { name: 'Masquer' }).click()
    await expect(page.getByRole('heading', { name: 'Premiers pas' })).toHaveCount(0)
    await page.goto('/#/office/settings/aide')
    await page.getByRole('button', { name: 'Afficher les premiers pas' }).click()
    await page.goto('/#/office')
    await expect(page.getByRole('heading', { name: 'Premiers pas' })).toBeVisible()
    // données de démonstration : chargées, puis vidées
    await page.goto('/#/office/settings/aide')
    await page.getByRole('button', { name: /Charger des données de démonstration/ }).click()
    await synced(page)
    await expect(page.getByRole('button', { name: 'Vider les données' })).toBeVisible()
    await page.getByRole('button', { name: 'Vider les données' }).click()
    await page.getByRole('dialog').getByLabel(/Tapez SUPPRIMER/).fill('SUPPRIMER')
    await page.getByRole('dialog').getByRole('button', { name: 'Tout supprimer' }).click()
    await expect(page.locator('.toast-item', { hasText: 'données de l’entreprise ont été supprimées' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Charger des données de démonstration/ })).toBeVisible() // l'entreprise est vide à nouveau
    await tutoCtx.close()
  })
})
