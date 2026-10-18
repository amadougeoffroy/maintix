// Aperçu PNG d'un e-mail de connexion : node --import tsx server/scripts/preview-email.mjs <sortie.png>
import { chromium } from '@playwright/test'
import { emailParts } from '../src/emailTemplate.ts'
const m = emailParts({ preheader: 'x', title: 'Bonjour Awa Traoré,', paragraphs: ['Voici votre lien de connexion sécurisé à Maintix. Un clic suffit, aucun mot de passe à retenir.'], facts: [['Compte', 'awa@cliente.test'], ['Entreprise', 'Entreprise Cliente SA'], ['Rôle', 'Technicien']], button: { label: 'Accéder à la plateforme', url: 'https://maintix.windsit-digital.com/#/auth?token=rT-tp5xsH7JghEZfYMgGv18lPbT5WdqcnMeWdh65xHg' }, notes: ['Ce lien est valable 15 minutes et ne peut être utilisé qu’une seule fois.', 'Si vous n’êtes pas à l’origine de cette demande, ignorez simplement ce message : votre compte reste protégé.'] })
const logo = `data:image/png;base64,${m.attachments[0].content.toString('base64')}`
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 640, height: 800 } })
await p.setContent(m.html.replace('cid:maintix-logo', logo)); await p.screenshot({ path: process.argv[2], fullPage: true }); await b.close()
