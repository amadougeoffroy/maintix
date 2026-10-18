import { beforeEach, describe, expect, it } from 'vitest'
import { buildInvoicePdf } from '../src/pdf'
import { api, bootstrap, invite, makeEnv, push, type Env } from './helpers'

const pdfText = (b: Buffer) => [...b.toString('latin1').matchAll(/<([0-9a-f]+)>/gi)].map((m) => Buffer.from(m[1], 'hex').toString('latin1')).join('')

let env: Env
let admin: ReturnType<typeof api>
beforeEach(async () => {
  env = await makeEnv()
  admin = api(env, await bootstrap(env))
  await push(admin, [
    { collection: 'clients', id: 'c1', data: { id: 'c1', name: 'Syndic Les Lilas', email: 'syndic@lilas.test', contact: 'Mme Bernard' } },
    { collection: 'clients', id: 'c2', data: { id: 'c2', name: 'Autre client', email: 'autre@c2.test' } },
    { collection: 'settings', id: 'org', data: { id: 'org', legalName: 'Ascenseurs Dupont SAS', address: '1 rue X', siret: '123', vatNumber: 'FR12', iban: 'FR76 0000', paymentDays: 45, vatRate: 20, legalFooter: 'Pénalités de retard : 3 fois le taux légal.' } },
  ])
})
const draft = (id: string, clientId = 'c1', extra: Record<string, unknown> = {}) => ({ id, clientId, kind: 'libre', lines: [{ label: 'Contrat janvier', qty: 1, unit: 180 }], vatRate: 20, status: 'brouillon', createdAt: '2026-01-01', ...extra })
const issue = (a: ReturnType<typeof api>, id: string) => a.post(`/api/invoices/${id}/issue`, {})
const pull = async (a: ReturnType<typeof api>) => (await (await a.get('/api/sync/pull?since=0&limit=500')).json()) as { docs: { collection: string; id: string; data: Record<string, any> }[] } // eslint-disable-line @typescript-eslint/no-explicit-any

describe('émission numérotée', () => {
  it('un brouillon se synchronise, mais ne peut pas être émis ni numéroté par un envoi direct', async () => {
    expect((await push(admin, [{ collection: 'invoices', id: 'f1', data: draft('f1') }])).results[0].ok).toBe(true)
    expect((await push(admin, [{ collection: 'invoices', id: 'f1', data: draft('f1', 'c1', { status: 'emise' }) }])).results[0].reason).toBe('use_issue')
    expect((await push(admin, [{ collection: 'invoices', id: 'f2', data: draft('f2', 'c1', { number: 'FAC-2026-0042' }) }])).results[0].reason).toBe('use_issue')
  })
  it('attribue FAC-AAAA-NNNN, la date d’émission et l’échéance selon le délai de paiement', async () => {
    await push(admin, [{ collection: 'invoices', id: 'f1', data: draft('f1') }])
    const res = await issue(admin, 'f1')
    expect(res.status).toBe(200)
    const inv = (await res.json()).invoice
    const year = new Date().getUTCFullYear()
    expect(inv.number).toBe(`FAC-${year}-0001`)
    expect(inv.status).toBe('emise')
    const days = (new Date(inv.dueAt).getTime() - new Date(inv.issuedAt).getTime()) / 86400000
    expect(days).toBe(45)
    expect((await pull(admin)).docs.find((d) => d.id === 'f1')!.data.number).toBe(inv.number)
  })
  it('numérote sans trou ni doublon, même avec des émissions simultanées', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    await push(admin, ids.map((id) => ({ collection: 'invoices', id, data: draft(id) })))
    const results = await Promise.all(ids.map((id) => issue(admin, id)))
    expect(results.every((r) => r.status === 200)).toBe(true)
    const numbers = (await Promise.all(results.map((r) => r.json()))).map((j) => j.invoice.number as string).sort()
    const year = new Date().getUTCFullYear()
    expect(numbers).toEqual([1, 2, 3, 4, 5].map((n) => `FAC-${year}-${String(n).padStart(4, '0')}`))
  })
  it('refuse de ré-émettre, d’émettre une facture vide ou inconnue', async () => {
    await push(admin, [{ collection: 'invoices', id: 'f1', data: draft('f1') }, { collection: 'invoices', id: 'v', data: draft('v', 'c1', { lines: [] }) }])
    expect((await issue(admin, 'f1')).status).toBe(200)
    expect((await issue(admin, 'f1')).status).toBe(409)
    expect((await issue(admin, 'v')).status).toBe(422)
    expect((await issue(admin, 'zzz')).status).toBe(404)
  })
  it('réservée au bureau', async () => {
    await push(admin, [{ collection: 'invoices', id: 'f1', data: draft('f1') }])
    const tech = api(env, await invite(env, admin, 'tech@x.test', 'tech'))
    expect((await issue(tech, 'f1')).status).toBe(403)
    expect((await push(tech, [{ collection: 'invoices', id: 'f9', data: draft('f9') }])).results[0].reason).toBe('forbidden')
  })
})

describe('facture figée', () => {
  async function issued() {
    await push(admin, [{ collection: 'invoices', id: 'f1', data: draft('f1') }])
    return (await (await issue(admin, 'f1')).json()).invoice as Record<string, unknown>
  }
  it('refuse toute modification des lignes, du numéro, du client ou de la TVA', async () => {
    const inv = await issued()
    for (const patch of [{ lines: [{ label: 'x', qty: 1, unit: 1 }] }, { number: 'FAC-2026-0999' }, { clientId: 'c2' }, { vatRate: 5.5 }, { issuedAt: '2020-01-01' }]) {
      expect((await push(admin, [{ collection: 'invoices', id: 'f1', data: { ...inv, ...patch } }])).results[0].reason).toBe('immutable')
    }
  })
  it('autorise le paiement et la note, refuse le retour en brouillon et la suppression', async () => {
    const inv = await issued()
    expect((await push(admin, [{ collection: 'invoices', id: 'f1', data: { ...inv, status: 'payee', paidAt: '2026-02-01', paymentMethod: 'virement' } }])).results[0].ok).toBe(true)
    expect((await push(admin, [{ collection: 'invoices', id: 'f1', data: { ...inv, status: 'brouillon' } }])).results[0].reason).toBe('immutable')
    expect((await push(admin, [{ collection: 'invoices', id: 'f1', data: null }])).results[0].reason).toBe('immutable')
  })
  it('une facture annulée reste annulée', async () => {
    const inv = await issued()
    await push(admin, [{ collection: 'invoices', id: 'f1', data: { ...inv, status: 'annulee' } }])
    expect((await push(admin, [{ collection: 'invoices', id: 'f1', data: { ...inv, status: 'emise' } }])).results[0].reason).toBe('immutable')
  })
  it('un brouillon peut être supprimé', async () => {
    await push(admin, [{ collection: 'invoices', id: 'd', data: draft('d') }])
    expect((await push(admin, [{ collection: 'invoices', id: 'd', data: null }])).results[0].ok).toBe(true)
  })
})

describe('PDF et envoi', () => {
  it('génère le PDF avec numéro, montants TTC et mentions légales', async () => {
    const f = { ...draft('f1'), status: 'emise', number: 'FAC-2026-0007', issuedAt: '2026-03-01', dueAt: '2026-04-15' }
    const pdf = await buildInvoicePdf({ invoice: f, client: { name: 'Syndic Les Lilas', email: 'a@b.test' }, settings: { legalName: 'Ascenseurs Dupont SAS', iban: 'FR76 0000', legalFooter: 'Pénalités de retard : 3 fois le taux légal.', siret: '123' }, appUrl: 'https://x', compress: false })
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    const text = pdfText(pdf)
    for (const needle of ['FACTURE', 'FAC-2026-0007', 'Syndic Les Lilas', 'Contrat janvier', '216,00 EUR', 'IBAN FR76', 'Pénalités de retard']) expect(text).toContain(needle)
  })
  it('sert le PDF au bureau et au client concerné, jamais un brouillon, jamais à un autre client', async () => {
    await push(admin, [{ collection: 'invoices', id: 'f1', data: draft('f1') }, { collection: 'invoices', id: 'f2', data: draft('f2') }])
    await issue(admin, 'f1')
    expect((await admin.get('/api/invoices/f1/pdf')).status).toBe(200)
    const mine = api(env, await invite(env, admin, 'syndic@lilas.test', 'client', { clientId: 'c1' }))
    const other = api(env, await invite(env, admin, 'autre@c2.test', 'client', { clientId: 'c2' }))
    expect((await mine.get('/api/invoices/f1/pdf')).status).toBe(200)
    expect((await mine.get('/api/invoices/f2/pdf')).status).toBe(404) // brouillon
    expect((await other.get('/api/invoices/f1/pdf')).status).toBe(404)
    // périmètre de synchronisation du client : sa facture émise seulement
    const ids = (await pull(mine)).docs.filter((d) => d.collection === 'invoices').map((d) => d.id)
    expect(ids).toEqual(['f1'])
  })
  it('envoie la facture par e-mail avec le PDF', async () => {
    await push(admin, [{ collection: 'invoices', id: 'f1', data: draft('f1') }])
    await issue(admin, 'f1')
    const before = env.mailer.sent.length
    expect((await admin.post('/api/invoices/f1/send', {})).status).toBe(200)
    const m = env.mailer.sent[before]
    expect(m.to).toEqual(['syndic@lilas.test'])
    expect(m.subject).toContain('Ascenseurs Dupont SAS')
    expect(m.text).toContain('216,00 €')
    expect(m.attachments?.[0].contentType).toBe('application/pdf')
    await push(admin, [{ collection: 'invoices', id: 'd', data: draft('d') }])
    expect((await admin.post('/api/invoices/d/send', {})).status).toBe(404) // brouillon
  })
})
