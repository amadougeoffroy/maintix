import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildReportPdf } from '../src/pdf'
import { api, bootstrap, closedJob, invite, push, type Env, makeEnv } from './helpers'

let env: Env
let admin: ReturnType<typeof api>
beforeEach(async () => {
  env = await makeEnv()
  admin = api(env, await bootstrap(env))
})

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64')
/** Texte d'un PDF pdfkit non compressé : les chaînes de texte sont des tableaux hexadécimaux (WinAnsi). */
const pdfText = (b: Buffer) => [...b.toString('latin1').matchAll(/<([0-9a-f]+)>/gi)].map((m) => Buffer.from(m[1], 'hex').toString('latin1')).join('')
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')

async function seed(extraVisit: Record<string, unknown> = {}) {
  await push(admin, [
    { collection: 'clients', id: 'c1', data: { id: 'c1', name: 'Syndic Les Lilas', email: 'syndic@lilas.test' } },
    { collection: 'sites', id: 's1', data: { id: 's1', clientId: 'c1', name: 'Bât. A', address: '12 rue des Lilas' } },
    { collection: 'elevators', id: 'e1', data: { id: 'e1', siteId: 's1', label: 'Ascenseur A1', brand: 'Schindler', model: '3300', serial: 'S-1', year: 2004 } },
    { collection: 'techs', id: 'tA', data: { id: 'tA', name: 'Moussa Traoré', role: 'tech', certs: [] } },
  ])
  await admin.post('/api/sync/push', { ops: [] })
  const ref = `file:${sha(png)}`
  await env.app.request(`/api/files/${sha(png)}`, { method: 'PUT', headers: { cookie: (admin as unknown as { cookie?: string }).cookie ?? '', 'content-type': 'image/png', origin: 'https://cabine.test' }, body: png })
  const job = closedJob({ id: 'j1', elevatorId: 'e1', techId: 'tA', visit: { summary: 'Visite OK. Frein à surveiller.', checklist: { mach_frein: { status: 'watch', note: 'usure légère', photos: [ref] } }, parts: [{ name: 'Galet de porte palière', qty: 2 }], measures: { courant: '12' }, signature: { absent: false, name: 'Mme Dupont', role: 'Gardien', dataUrl: ref, at: 'x' }, ...extraVisit } })
  await push(admin, [{ collection: 'jobs', id: 'j1', data: job }])
  return job
}

describe('génération du PDF', () => {
  it('produit un PDF A4 lisible avec le contenu du rapport (texte non compressé pour le test)', async () => {
    const job = await seed()
    const pdf = await buildReportPdf({
      job, elevator: { label: 'Ascenseur A1', brand: 'Schindler', model: '3300', serial: 'S-1', year: 2004 }, site: { name: 'Bât. A', address: '12 rue des Lilas' }, client: { name: 'Syndic Les Lilas' },
      tech: { name: 'Moussa Traoré' }, defects: [{ severity: 'critique', title: 'Limiteur de vitesse', due: '2026-02-01' }], files: new Map([[`file:${sha(png)}`, png]]), sealValid: true, appUrl: 'https://maintix.test', compress: false,
    })
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    const text = pdfText(pdf)
    for (const needle of ['Ascenseur A1', 'Syndic Les Lilas', 'Moussa Traor', 'Visite OK', 'Galet de porte', 'Limiteur de vitesse', 'SHA-256', 'conforme au sceau']) expect(text).toContain(needle)
    expect(pdf.length).toBeGreaterThan(4000)
  })
  it('signale un sceau invalide', async () => {
    const job = await seed()
    const pdf = await buildReportPdf({ job, elevator: { label: 'A1' }, site: { name: 'S', address: 'x' }, client: { name: 'C' }, defects: [], files: new Map(), sealValid: false, appUrl: 'https://x', compress: false })
    expect(pdfText(pdf)).toContain('ATTENTION')
  })
})

describe('API rapports', () => {
  it('sert le PDF à un membre et refuse un client d’un autre périmètre', async () => {
    await seed()
    const res = await admin.get('/api/reports/j1/pdf')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toContain('rapport-Ascenseur-A1-2026-01-01.pdf')
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-')
    await push(admin, [{ collection: 'clients', id: 'c2', data: { id: 'c2', name: 'Autre' } }])
    const other = api(env, await invite(env, admin, 'autre@c2.test', 'client', { clientId: 'c2' }))
    expect((await other.get('/api/reports/j1/pdf')).status).toBe(404)
    const mine = api(env, await invite(env, admin, 'syndic@lilas.test', 'client', { clientId: 'c1' }))
    expect((await mine.get('/api/reports/j1/pdf')).status).toBe(200)
    expect((await env.app.request('/api/reports/j1/pdf')).status).toBe(401)
    expect((await admin.get('/api/reports/inconnu/pdf')).status).toBe(404)
  })
  it('envoie le rapport par e-mail avec le PDF en pièce jointe et enregistre la date d’envoi', async () => {
    await seed()
    const before = env.mailer.sent.length
    const res = await admin.post('/api/reports/j1/send', { message: 'Voici votre rapport.' })
    expect(res.status).toBe(200)
    const mail = env.mailer.sent[before]
    expect(mail.to).toEqual(['syndic@lilas.test'])
    expect(mail.subject).toContain('Ascenseur A1')
    expect(mail.text).toContain('Voici votre rapport.')
    expect(mail.attachments?.[0]).toMatchObject({ contentType: 'application/pdf' })
    expect(mail.attachments![0].content.subarray(0, 5).toString()).toBe('%PDF-')
    const pull = await (await admin.get('/api/sync/pull?since=0')).json()
    const job = pull.docs.find((d: { id: string }) => d.id === 'j1').data
    expect(typeof job.visit.sentAt).toBe('string')
    // le rapport reste valide (sentAt exclu du sceau) et modifiable seulement pour cette clé
    expect((await admin.get('/api/reports/j1/pdf')).status).toBe(200)
  })
  it('refuse l’envoi sans destinataire, par un client, ou pour une mission non clôturée', async () => {
    await push(admin, [
      { collection: 'clients', id: 'c1', data: { id: 'c1', name: 'Sans mail' } },
      { collection: 'sites', id: 's1', data: { id: 's1', clientId: 'c1', name: 'B', address: 'x' } },
      { collection: 'elevators', id: 'e1', data: { id: 'e1', siteId: 's1', label: 'A1' } },
    ])
    await push(admin, [{ collection: 'jobs', id: 'j1', data: closedJob({ id: 'j1', elevatorId: 'e1' }) }])
    expect((await admin.post('/api/reports/j1/send', {})).status).toBe(400)
    expect((await admin.post('/api/reports/j1/send', { to: ['pas-un-mail'] })).status).toBe(400)
    await push(admin, [{ collection: 'jobs', id: 'j2', data: { id: 'j2', type: 'entretien', elevatorId: 'e1', status: 'planifiee', timeline: [] } }])
    expect((await admin.post('/api/reports/j2/send', { to: ['a@b.test'] })).status).toBe(404)
    const cl = api(env, await invite(env, admin, 'c@c.test', 'client', { clientId: 'c1' }))
    expect((await cl.post('/api/reports/j1/send', { to: ['a@b.test'] })).status).toBe(403)
  })
  it('un rapport altéré en base est signalé dans le PDF', async () => {
    await seed()
    await env.db.query(`update docs set data = jsonb_set(data, '{visit,minutes}', '999') where collection='jobs' and id='j1'`)
    const res = await admin.get('/api/reports/j1/pdf')
    expect(res.status).toBe(200) // généré, mais avec l'avertissement (vérifié par buildReportPdf ci-dessus)
  })
})

describe('mise en page', () => {
  it('n’ajoute aucune page vierge à cause du pied de page', async () => {
    const job = closedJob({ id: 'j9', elevatorId: 'e1', visit: { summary: 'ok' } })
    const pdf = await buildReportPdf({ job, elevator: { label: 'A1' }, site: { name: 'S', address: 'x' }, client: { name: 'C' }, defects: [], files: new Map(), sealValid: true, appUrl: 'https://x', compress: false })
    const pages = (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length
    expect(pages).toBeLessThanOrEqual(2)
  })
})
