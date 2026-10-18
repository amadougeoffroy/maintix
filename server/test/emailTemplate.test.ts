import { describe, expect, it } from 'vitest'
import { emailParts, esc } from '../src/emailTemplate'

describe('gabarit e-mail', () => {
  const m = emailParts({ title: 'Bonjour Ada,', paragraphs: ['Texte <b>échappé</b>'], facts: [['Entreprise', 'Ascenseurs & Cie']], button: { label: 'Accéder à la plateforme', url: 'https://x.test/#/auth?token=abc' } })
  it('contient le logo inline, le bouton et les informations', () => {
    expect(m.html).toContain('src="cid:maintix-logo"')
    expect(m.html).toContain('Accéder à la plateforme')
    expect(m.html).toContain('Ascenseurs &amp; Cie')
    expect(m.attachments.find((a) => a.cid === 'maintix-logo')?.content.subarray(1, 4).toString()).toBe('PNG')
  })
  it('échappe le contenu', () => {
    expect(m.html).not.toContain('<b>échappé</b>')
    expect(esc('"<&>')).toBe('&quot;&lt;&amp;&gt;')
  })
  it('fournit un texte brut avec le lien', () => {
    expect(m.text).toContain('https://x.test/#/auth?token=abc')
    expect(m.text).toContain('Entreprise : Ascenseurs & Cie')
  })
})
