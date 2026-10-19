import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { makeOperator } from '../src/cli'
import { loadConfig } from '../src/config'
import { memoryMailer } from '../src/mailer'
import { api, APP_URL, bootstrap, createOrg, invite, json, login, makeEnv, push, tokenFrom, type Env } from './helpers'

let env: Env
let op: ReturnType<typeof api>
let opCookie: string
beforeEach(async () => {
  env = await makeEnv()
  opCookie = await bootstrap(env, 'amadou@sodebat.test')
  op = api(env, opCookie)
})
const overview = async () => (await (await op.get('/api/operator/overview')).json()) as { orgs: any[]; pendingSignups: number; plans: any[] } // eslint-disable-line @typescript-eslint/no-explicit-any
const orgByName = async (name: string) => (await overview()).orgs.find((o) => o.name === name)

describe('accès à la console opérateur', () => {
  it('le compte d’installation est opérateur ; les autres non', async () => {
    expect((await (await op.get('/api/auth/session')).json()).operator).toBe(true)
    await createOrg(op, 'Cliente SA', 'dg@cliente.test')
    const dg = api(env, await login(env, 'dg@cliente.test'))
    expect((await (await dg.get('/api/auth/session')).json()).operator).toBe(false)
    for (const path of ['/api/operator/overview', '/api/operator/signups', '/api/operator/billing', '/api/operator/operators']) expect((await dg.get(path)).status).toBe(403)
    expect((await env.app.request('/api/operator/overview')).status).toBe(401)
  })
  it('OPERATOR_EMAILS accorde l’accès à la première connexion, la commande operator-add à un compte existant', async () => {
    // deuxième instance de l'application sur la même base, avec la variable d'environnement
    const withEnv = createApp({ db: env.db, config: loadConfig({ APP_URL, BOOTSTRAP_TOKEN: 'boot-secret', OPERATOR_EMAILS: 'Boss@Plateforme.test, autre@x.test' }), mailer: env.mailer })
    const orgId = (await env.db.query<{ id: string }>('select id from organisations limit 1')).rows[0].id
    const uid = crypto.randomUUID()
    await env.db.query(`insert into users (id, email) values ($1, 'boss@plateforme.test')`, [uid])
    await env.db.query(`insert into members (user_id, org_id, role, full_name) values ($1, $2, 'bureau', 'Boss')`, [uid, orgId])
    await withEnv.request('/api/auth/request-link', json({ email: 'boss@plateforme.test' }))
    const res = await withEnv.request('/api/auth/verify', json({ token: tokenFrom(env, 'boss@plateforme.test') }))
    const cookie = res.headers.get('set-cookie')!.split(';')[0]
    expect((await (await withEnv.request('/api/auth/session', { headers: { cookie } })).json()).operator).toBe(true)
    // commande : compte existant seulement
    expect(await makeOperator(env.db, 'inconnu@x.test')).toBe(false)
    await createOrg(op, 'Cliente SA', 'dg@cliente.test')
    expect(await makeOperator(env.db, ' DG@cliente.test ')).toBe(true)
    expect((await (await api(env, await login(env, 'dg@cliente.test')).get('/api/auth/session')).json()).operator).toBe(true)
  })
  it('gère les opérateurs : ajout, liste, retrait, pas de retrait de soi-même', async () => {
    await createOrg(op, 'Cliente SA', 'dg@cliente.test')
    expect((await op.post('/api/operator/operators', { email: 'dg@cliente.test' })).status).toBe(201)
    expect((await op.post('/api/operator/operators', { email: 'nul@part.test' })).status).toBe(404)
    const list = (await (await op.get('/api/operator/operators')).json()).operators as { userId: string; email: string }[]
    expect(list.map((o) => o.email).sort()).toEqual(['amadou@sodebat.test', 'dg@cliente.test'])
    const me = (await (await op.get('/api/auth/session')).json()).user.id
    expect((await op.del(`/api/operator/operators/${me}`)).status).toBe(400)
    expect((await op.del(`/api/operator/operators/${list.find((o) => o.email === 'dg@cliente.test')!.userId}`)).status).toBe(200)
  })
})

describe('création d’une entreprise et de son premier administrateur', () => {
  it('crée l’entreprise, le compte, la fiche technicien et envoie le lien de connexion', async () => {
    const before = env.mailer.sent.length
    const orgId = await createOrg(op, 'Ascenseurs Koné', 'kone@exemple.test', 'Moussa Koné')
    const mail = env.mailer.sent[before]
    expect(mail.to).toBe('kone@exemple.test')
    expect(mail.subject).toBe('Votre espace Maintix « Ascenseurs Koné » est prêt')
    expect(mail.text).toContain('#/auth?token=')
    expect(mail.text).toContain('visite guidée')
    const cookie = await login(env, 'kone@exemple.test')
    const s = await (await api(env, cookie).get('/api/auth/session')).json()
    expect(s).toMatchObject({ role: 'admin', org: { id: orgId, name: 'Ascenseurs Koné' }, fullName: 'Moussa Koné', operator: false, orgStatus: 'active' })
    const docs = (await (await api(env, cookie).get('/api/sync/pull?since=0')).json()).docs as { collection: string }[]
    expect(docs.map((d) => d.collection)).toEqual(['techs'])
    const org = await orgByName('Ascenseurs Koné')
    expect(org.offer.plan).toBe('essai')
    expect(org.offer.maxTechs).toBe(3)
    const days = (new Date(org.offer.trialEndsOn).getTime() - Date.now()) / 86400000
    expect(Math.ceil(days)).toBe(30) // fin de journée UTC du 30e jour
  })
  it('applique l’offre choisie, refuse une offre inconnue ou des données invalides', async () => {
    await createOrg(op, 'Pro SA', 'pro@x.test', 'Pro User', 'pro')
    expect((await orgByName('Pro SA')).offer).toMatchObject({ plan: 'pro', maxTechs: 15, maxElevators: 500, priceMonthly: 90000, trialEndsOn: null })
    expect((await op.post('/api/operator/orgs', { name: 'X', adminName: 'Xx', adminEmail: 'x@x.test', plan: 'inconnu' })).status).toBe(400)
    expect((await op.post('/api/operator/orgs', { name: 'X', adminName: 'Xx', adminEmail: 'pas-un-mail' })).status).toBe(400)
  })
  it('rattache une adresse déjà connue à la nouvelle entreprise sans dupliquer le compte', async () => {
    await createOrg(op, 'Première SA', 'multi@x.test', 'Multi User')
    await createOrg(op, 'Seconde SA', 'multi@x.test', 'Multi User')
    expect((await env.db.query<{ n: number }>(`select count(*)::int as n from users where email = 'multi@x.test'`)).rows[0].n).toBe(1)
    expect((await env.db.query<{ n: number }>(`select count(*)::int as n from members m join users u on u.id = m.user_id where u.email = 'multi@x.test'`)).rows[0].n).toBe(2)
  })
})

describe('usage et offre', () => {
  it('compte techniciens, appareils, clients et missions ; estime le montant avec les dépassements', async () => {
    await createOrg(op, 'Usage SA', 'dg@usage.test')
    const dg = api(env, await login(env, 'dg@usage.test'))
    await invite(env, dg, 't1@usage.test', 'tech'); await invite(env, dg, 't2@usage.test', 'tech')
    await push(dg, [
      { collection: 'clients', id: 'c1', data: { id: 'c1', name: 'C' } },
      { collection: 'elevators', id: 'e1', data: { id: 'e1', siteId: 's', label: 'A' } }, { collection: 'elevators', id: 'e2', data: { id: 'e2', siteId: 's', label: 'B' } }, { collection: 'elevators', id: 'e3', data: { id: 'e3', siteId: 's', label: 'C' } },
      { collection: 'jobs', id: 'j1', data: { id: 'j1', type: 'entretien', elevatorId: 'e1', status: 'planifiee', createdAt: new Date().toISOString(), timeline: [] } },
    ])
    const id = (await orgByName('Usage SA')).id
    expect((await orgByName('Usage SA')).usage).toMatchObject({ techs: 2, elevators: 3, clients: 1, jobs30: 1, members: 3 })
    const r = await op.post(`/api/operator/orgs/${id}/offer`, { plan: 'essentiel', trialEndsOn: null, maxTechs: 1, maxElevators: 2, priceMonthly: 35000, extraTechPrice: 5000, extraElevatorPrice: 150, notes: 'Contrat signé le 5/11' })
    expect(r.status).toBe(200)
    const org = (await r.json()).org
    expect(org.estimate).toEqual({ base: 35000, overTechs: 1, overElevators: 1, amount: 35000 + 5000 + 150 })
    expect(org.flags).toMatchObject({ overTechs: true, overElevators: true, trialExpired: false })
    expect(org.offer.notes).toBe('Contrat signé le 5/11')
    // plafond absent = illimité
    const free = (await (await op.post(`/api/operator/orgs/${id}/offer`, { plan: 'sur-mesure', trialEndsOn: null, maxTechs: null, maxElevators: null, priceMonthly: 120000, extraTechPrice: 0, extraElevatorPrice: 0, notes: '' })).json()).org
    expect(free.estimate.amount).toBe(120000)
    expect((await op.post(`/api/operator/orgs/${id}/offer`, { plan: 'zzz', maxTechs: 1, maxElevators: 1, priceMonthly: 1, extraTechPrice: 0, extraElevatorPrice: 0 })).status).toBe(400)
    expect((await op.post(`/api/operator/orgs/${id}/offer`, { plan: 'pro', maxTechs: -1, maxElevators: 1, priceMonthly: 1, extraTechPrice: 0, extraElevatorPrice: 0 })).status).toBe(400)
    expect((await op.post(`/api/operator/orgs/${crypto.randomUUID()}/offer`, { plan: 'pro', maxTechs: 1, maxElevators: 1, priceMonthly: 1, extraTechPrice: 0, extraElevatorPrice: 0, notes: '' })).status).toBe(404)
  })
  it('signale un essai expiré', async () => {
    await createOrg(op, 'Essai SA', 'e@essai.test')
    const id = (await orgByName('Essai SA')).id
    await env.db.query(`update organisations set trial_ends_on = current_date - 1 where id = $1`, [id])
    expect((await orgByName('Essai SA')).flags.trialExpired).toBe(true)
  })
  it('l’entreprise voit son offre et son usage (responsables seulement)', async () => {
    await createOrg(op, 'Voit SA', 'dg@voit.test', 'DG', 'essentiel')
    const dg = api(env, await login(env, 'dg@voit.test'))
    const plan = await (await dg.get('/api/org/plan')).json()
    expect(plan).toMatchObject({ status: 'active', offer: { plan: 'essentiel', maxTechs: 5 }, usage: { techs: 0, elevators: 0 } })
    const tech = api(env, await invite(env, dg, 't@voit.test', 'tech'))
    expect((await tech.get('/api/org/plan')).status).toBe(403)
  })
})

describe('suspension', () => {
  async function setup() {
    await createOrg(op, 'Suspendue SA', 'dg@susp.test', 'DG')
    const dg = api(env, await login(env, 'dg@susp.test'))
    await push(dg, [{ collection: 'sites', id: 's1', data: { id: 's1', clientId: 'c', name: 'S', address: 'x' } }, { collection: 'elevators', id: 'e1', data: { id: 'e1', siteId: 's1', label: 'A1', status: 'ok' } }])
    return { dg, id: (await orgByName('Suspendue SA')).id as string }
  }
  it('bloque l’entreprise avec un motif, mais laisse voir la session et se déconnecter', async () => {
    const { dg: before, id } = await setup()
    expect((await op.post(`/api/operator/orgs/${id}/suspend`, { reason: 'Facture impayée' })).status).toBe(200)
    expect((await before.get('/api/auth/session')).status).toBe(401) // déconnecté aussitôt
    const dg = api(env, await login(env, 'dg@susp.test')) // reconnexion : l'écran de suspension
    const sync = await dg.get('/api/sync/pull?since=0')
    expect(sync.status).toBe(403)
    expect(await sync.json()).toEqual({ error: 'org_suspended', reason: 'Facture impayée' })
    expect((await dg.post('/api/sync/push', { ops: [] })).status).toBe(403)
    expect((await dg.get('/api/members')).status).toBe(403)
    const s = await (await dg.get('/api/auth/session')).json()
    expect(s).toMatchObject({ orgStatus: 'suspended', suspendedReason: 'Facture impayée' })
    expect((await dg.post('/api/auth/logout', {})).status).toBe(200)
  })
  it('désactive le signalement public et la page d’état de ses appareils', async () => {
    const { id } = await setup()
    expect((await env.app.request('/api/public/status/e1')).status).toBe(200)
    await op.post(`/api/operator/orgs/${id}/suspend`, {})
    expect((await env.app.request('/api/public/status/e1')).status).toBe(404)
    expect((await env.app.request('/api/public/report', json({ elevatorId: 'e1', description: 'x', trapped: false, reporter: '' }))).status).toBe(404)
  })
  it('se réactive, et les données sont intactes', async () => {
    const { id } = await setup()
    await op.post(`/api/operator/orgs/${id}/suspend`, { reason: 'test' })
    expect((await op.post(`/api/operator/orgs/${id}/reactivate`, {})).status).toBe(200)
    const dg = api(env, await login(env, 'dg@susp.test'))
    const docs = (await (await dg.get('/api/sync/pull?since=0')).json()).docs as { id: string }[]
    expect(docs.map((d) => d.id)).toEqual(expect.arrayContaining(['s1', 'e1']))
    expect((await orgByName('Suspendue SA')).status).toBe('active')
  })
  it('l’entreprise plateforme des opérateurs n’apparaît jamais dans la console', async () => {
    await createOrg(op, 'Active SA', 'amadou@sodebat.test', 'Amadou')
    expect((await overview()).orgs.map((o) => o.name)).toEqual(['Active SA'])
    expect((await op.get('/api/operator/overview')).status).toBe(200)
  })
  it('refuse les identifiants invalides', async () => {
    expect((await op.post(`/api/operator/orgs/${crypto.randomUUID()}/suspend`, {})).status).toBe(404)
    expect((await op.post(`/api/operator/orgs/${crypto.randomUUID()}/reactivate`, {})).status).toBe(404)
  })
})

describe('inscription en libre-service', () => {
  const signup = (b: Record<string, unknown>, ip = '1.1.1.1') => env.app.request('/api/public/signup', json(b, { 'x-forwarded-for': ip }))
  const valid = { company: 'Ascenseurs Diallo', name: 'Awa Diallo', email: 'awa@diallo.test', phone: '+2250700000000', message: 'Nous avons 12 techniciens.' }

  it('enregistre la demande, confirme au demandeur et prévient les opérateurs', async () => {
    const before = env.mailer.sent.length
    const res = await signup(valid)
    expect(res.status).toBe(200)
    const sent = env.mailer.sent.slice(before)
    expect(sent.find((m) => m.to === 'awa@diallo.test')!.subject).toContain('bien reçue')
    const notifs = sent.filter((m) => m.subject === 'Nouvelle demande d\'accès : Ascenseurs Diallo')
    expect(notifs.map((m) => m.to)).toContain('amadou@sodebat.test') // un e-mail par opérateur, adresses non partagées
    expect(notifs.every((m) => typeof m.to === 'string')).toBe(true)
    expect(notifs[0].text).toContain('#/operator')
    expect(notifs[0].html).toContain('Étudier la demande') // même gabarit que les liens de connexion
    const list = (await (await op.get('/api/operator/signups?status=pending')).json()).signups
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ company: 'Ascenseurs Diallo', email: 'awa@diallo.test', status: 'pending' })
    expect((await overview()).pendingSignups).toBe(1)
  })
  it('ignore les doublons en attente et les robots (champ piège), sans rien révéler', async () => {
    await signup(valid); await signup(valid)
    const bot = await signup({ ...valid, email: 'bot@spam.test', website: 'http://spam.test' })
    expect(await bot.json()).toEqual({ ok: true })
    expect((await (await op.get('/api/operator/signups')).json()).signups).toHaveLength(1)
  })
  it('valide les champs et limite le débit', async () => {
    expect((await signup({ company: 'X', name: 'Y', email: 'bad' })).status).toBe(400)
    expect((await signup({ ...valid, email: 'a@b.test', message: 'x'.repeat(1001) })).status).toBe(400)
    const codes: number[] = []
    for (let i = 0; i < 7; i++) codes.push((await signup({ ...valid, email: `n${i}@x.test` }, '9.9.9.9')).status)
    expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0)
  })
  it('l’approbation crée l’entreprise et le premier administrateur, une seule fois', async () => {
    await signup(valid)
    const id = (await (await op.get('/api/operator/signups?status=pending')).json()).signups[0].id
    const before = env.mailer.sent.length
    const r = await op.post(`/api/operator/signups/${id}/approve`, { plan: 'essentiel' })
    expect(r.status).toBe(200)
    expect(env.mailer.sent[before].subject).toBe('Votre espace Maintix « Ascenseurs Diallo » est prêt')
    expect((await orgByName('Ascenseurs Diallo')).offer.plan).toBe('essentiel')
    const s = await (await api(env, await login(env, 'awa@diallo.test')).get('/api/auth/session')).json()
    expect(s).toMatchObject({ role: 'admin', fullName: 'Awa Diallo', org: { name: 'Ascenseurs Diallo' } })
    expect((await op.post(`/api/operator/signups/${id}/approve`, {})).status).toBe(409)
    expect((await (await op.get('/api/operator/signups?status=approved')).json()).signups[0].orgId).toBeTruthy()
    expect((await overview()).pendingSignups).toBe(0)
    expect((await op.post(`/api/operator/signups/${crypto.randomUUID()}/approve`, {})).status).toBe(404)
  })
  it('le refus prévient le demandeur avec le motif, sans créer d’entreprise', async () => {
    await signup(valid)
    const id = (await (await op.get('/api/operator/signups')).json()).signups[0].id
    const before = env.mailer.sent.length
    expect((await op.post(`/api/operator/signups/${id}/reject`, { reason: 'Zone non couverte' })).status).toBe(200)
    expect(env.mailer.sent[before].text).toContain('Motif : Zone non couverte')
    expect(await orgByName('Ascenseurs Diallo')).toBeUndefined()
    expect((await op.post(`/api/operator/signups/${id}/reject`, {})).status).toBe(404) // déjà traitée
    expect((await (await op.get('/api/operator/signups?status=rejected')).json()).signups).toHaveLength(1)
  })
  it('réservé aux opérateurs côté validation', async () => {
    await signup(valid)
    await createOrg(op, 'Cliente SA', 'dg@cliente.test')
    const dg = api(env, await login(env, 'dg@cliente.test'))
    const id = (await (await op.get('/api/operator/signups')).json()).signups[0].id
    expect((await dg.post(`/api/operator/signups/${id}/approve`, {})).status).toBe(403)
    expect((await dg.post(`/api/operator/signups/${id}/reject`, {})).status).toBe(403)
  })
})

describe('facturation de la plateforme', () => {
  it('calcule le total estimé, fige le mois (relançable) et exporte en CSV FCFA', async () => {
    await createOrg(op, 'Payante SA', 'dg@payante.test', 'DG', 'essentiel')
    const month = new Date().toISOString().slice(0, 7)
    const b = await (await op.get(`/api/operator/billing?month=${month}`)).json()
    expect(b.currency).toBe('FCFA')
    expect(b.live.find((o: { name: string }) => o.name === 'Payante SA').estimate.amount).toBe(35000)
    expect(b.totalEstimate).toBe(35000)
    expect((await op.post('/api/operator/billing/freeze', { month })).status).toBe(200)
    await op.post('/api/operator/billing/freeze', { month }) // idempotent
    const after = await (await op.get(`/api/operator/billing?month=${month}`)).json()
    expect(after.frozen.filter((f: { orgId: string }) => f.orgId).length).toBe(1)
    expect(after.frozen.find((f: { plan: string }) => f.plan === 'essentiel')).toMatchObject({ techs: 0, amount: 35000 })
    const res = await op.get(`/api/operator/billing.csv?month=${month}`)
    expect(res.headers.get('content-disposition')).toContain(`usage-maintix-${month}.csv`)
    const bytesRes = res.clone()
    const csv = await res.text()
    const bytes = Buffer.from(await bytesRes.arrayBuffer())
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]) // BOM UTF-8 pour Excel
    expect(csv).toContain('Montant estimé (FCFA)')
    expect(csv).toMatch(/Payante SA;essentiel;Actif;0;5;0;100;0;0;35000;0;35000/)
    expect(csv).not.toMatch(/€|EUR/)
  })
  it('exclut les entreprises suspendues du total et valide le mois', async () => {
    await createOrg(op, 'Payante SA', 'dg@payante.test', 'DG', 'essentiel')
    const id = (await orgByName('Payante SA')).id
    await op.post(`/api/operator/orgs/${id}/suspend`, {})
    expect((await (await op.get('/api/operator/billing')).json()).totalEstimate).toBe(0)
    expect((await op.get('/api/operator/billing?month=2026-13')).status).toBe(400)
    expect((await op.post('/api/operator/billing/freeze', { month: 'avril' })).status).toBe(400)
  })
})

describe('aucun contenu métier n’est exposé à la console', () => {
  it('la vue d’ensemble ne contient que des compteurs', async () => {
    await createOrg(op, 'Secrète SA', 'dg@secrete.test', 'DG')
    const dg = api(env, await login(env, 'dg@secrete.test'))
    await push(dg, [{ collection: 'clients', id: 'c1', data: { id: 'c1', name: 'Client très confidentiel', email: 'secret@client.test' } }])
    const text = JSON.stringify(await overview())
    expect(text).not.toContain('confidentiel')
    expect(text).not.toContain('secret@client.test')
  })
})

void createApp; void loadConfig; void memoryMailer; void APP_URL
