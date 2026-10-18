import { appendFileSync } from 'node:fs'
import nodemailer from 'nodemailer'

export interface Attachment {
  filename: string
  content: Buffer
  contentType: string
}
export interface Mail {
  to: string | string[]
  subject: string
  text: string
  attachments?: Attachment[]
}
export interface Mailer {
  send(mail: Mail): Promise<void>
}

export function smtpMailer(url: string, from: string): Mailer {
  const transport = nodemailer.createTransport(url)
  return { send: async (m) => void (await transport.sendMail({ from, ...m })) }
}
/** Sans SMTP : le lien de connexion est écrit dans les logs (développement uniquement). */
export const consoleMailer: Mailer = {
  send: async (m) => console.log(`[mail console] à ${[m.to].flat().join(', ')} — ${m.subject}${m.attachments?.length ? ` (+${m.attachments.length} pièce(s) jointe(s))` : ''}\n${m.text}`),
}
export function memoryMailer(): Mailer & { sent: Mail[] } {
  const sent: Mail[] = []
  return { sent, send: async (m) => void sent.push(m) }
}
/** Écrit chaque e-mail dans un fichier JSONL (tests de bout en bout uniquement, jamais en production). */
export const fileMailer = (path: string): Mailer => ({
  send: async (m) => void appendFileSync(path, JSON.stringify({ ...m, attachments: m.attachments?.map((a) => ({ filename: a.filename, size: a.content.length })) }) + '\n'),
})
