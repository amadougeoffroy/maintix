/** Gabarit HTML des e-mails Maintix : en-tête avec logo, carte de contenu, bouton d'action, pied de page.
 *  Mise en page par tableaux et styles en ligne (compatible Gmail, Outlook, Apple Mail). */
import { EMAIL_LOGO_PNG_BASE64 } from './emailLogo'
import type { Attachment } from './mailer'

const INK = '#0b2b2a'
const TEAL = '#0f766e'
const AMBER = '#f59e0b'
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif"

export const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const LOGO_CID = 'maintix-logo'
export const logoAttachment = (): Attachment => ({
  filename: 'maintix.png', content: Buffer.from(EMAIL_LOGO_PNG_BASE64, 'base64'), contentType: 'image/png', cid: LOGO_CID, inline: true,
})

export interface EmailContent {
  /** Texte d'aperçu affiché dans la liste de la boîte de réception. */
  preheader?: string
  title: string
  /** Paragraphes (texte brut, échappé). */
  paragraphs: string[]
  /** Encart « fiche » : libellé / valeur. */
  facts?: [string, string][]
  button?: { label: string; url: string }
  /** Paragraphes secondaires, en plus petit. */
  notes?: string[]
}

export function renderEmail(c: EmailContent): { html: string; attachments: Attachment[] } {
  const p = (t: string) => `<p style="margin:0 0 16px;font:400 16px/1.55 ${FONT};color:#1f2d2c">${esc(t).replace(/\n/g, '<br>')}</p>`
  const facts = c.facts?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 22px;background:#f1f6f5;border-radius:12px;border-left:4px solid ${AMBER}"><tr><td style="padding:14px 18px">${c.facts
        .map(([k, v]) => `<div style="font:400 12px/1.4 ${FONT};color:#5d716f;text-transform:uppercase;letter-spacing:.04em">${esc(k)}</div><div style="font:600 16px/1.4 ${FONT};color:${INK};margin:0 0 10px">${esc(v)}</div>`)
        .join('')
        .replace(/margin:0 0 10px">([^<]*)<\/div>$/, 'margin:0">$1</div>')}</td></tr></table>`
    : ''
  const button = c.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 22px"><tr><td align="center" bgcolor="${TEAL}" style="border-radius:10px"><a href="${esc(c.button.url)}" style="display:inline-block;padding:14px 28px;font:700 16px/1 ${FONT};color:#ffffff;text-decoration:none;border-radius:10px">${esc(c.button.label)}</a></td></tr></table>
<p style="margin:0 0 20px;font:400 12.5px/1.5 ${FONT};color:#5d716f">Le bouton ne fonctionne pas ? Copiez ce lien dans votre navigateur :<br><a href="${esc(c.button.url)}" style="color:${TEAL};word-break:break-all">${esc(c.button.url)}</a></p>`
    : ''
  const notes = (c.notes ?? []).map((n) => `<p style="margin:0 0 8px;font:400 13px/1.5 ${FONT};color:#5d716f">${esc(n)}</p>`).join('')
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(c.title)}</title></head>
<body style="margin:0;padding:0;background:#eef2f3">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(c.preheader ?? c.title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f3"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
    <tr><td align="center" bgcolor="${INK}" style="background:${INK};border-radius:16px 16px 0 0;padding:26px 24px">
      <img src="cid:${LOGO_CID}" alt="Maintix" width="200" height="48" style="display:block;border:0;outline:none;width:200px;height:48px">
    </td></tr>
    <tr><td bgcolor="${AMBER}" style="height:4px;line-height:4px;font-size:0;background:${AMBER}">&nbsp;</td></tr>
    <tr><td bgcolor="#ffffff" style="background:#ffffff;padding:32px 30px 14px;border-radius:0 0 16px 16px">
      <h1 style="margin:0 0 18px;font:800 22px/1.3 ${FONT};color:${INK};letter-spacing:-.01em">${esc(c.title)}</h1>
      ${c.paragraphs.map(p).join('')}${facts}${button}${notes}
    </td></tr>
    <tr><td align="center" style="padding:18px 12px 4px;font:400 12px/1.6 ${FONT};color:#7a8b89">Maintix · Maintenance d’ascenseurs, simplement.<br>Cet e-mail a été envoyé automatiquement, merci de ne pas y répondre.</td></tr>
  </table>
</td></tr></table>
</body></html>`
  return { html, attachments: [logoAttachment()] }
}

/** Texte brut équivalent (repli des clients sans HTML). */
export function plainEmail(c: EmailContent): string {
  return [
    c.title, '',
    ...c.paragraphs.flatMap((t) => [t, '']),
    ...(c.facts ?? []).map(([k, v]) => `${k} : ${v}`), ...(c.facts?.length ? [''] : []),
    ...(c.button ? [`${c.button.label} :`, c.button.url, ''] : []),
    ...(c.notes ?? []).flatMap((t) => [t, '']),
    'Maintix',
  ].join('\n')
}

/** Mail complet (texte + HTML + logo en pièce inline). */
export function emailParts(c: EmailContent, extra: Attachment[] = []) {
  const r = renderEmail(c)
  return { text: plainEmail(c), html: r.html, attachments: [...extra, ...r.attachments] }
}

export const ROLE_LABEL: Record<string, string> = { admin: 'Administrateur', bureau: 'Bureau', tech: 'Technicien', client: 'Client' }
