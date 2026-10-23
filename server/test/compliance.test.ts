import { beforeEach, describe, expect, it } from 'vitest'
import { sendComplianceReminders } from '../src/compliance'
import { api, bootstrap, createOrg, invite, login, makeEnv, push, type Env } from './helpers'

let env: Env
let op: ReturnType<typeof api>
beforeEach(async () => {
  env = await makeEnv()
  op = api(env, await bootstrap(env, 'ada@a.test'))
})
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
const elevator = (id: string, compliance: unknown) => ({ collection: 'elevators', id, data: { id, siteId: 's1', label: `Ascenseur ${id}`, status: 'ok', compliance } })
const mails = (to: string) => env.mailer.sent.filter((m) => m.to === to && /Échéance/.test(m.subject))

describe('rappels d’échéances réglementaires', () => {
  async function org() {
    await createOrg(op, 'Cliente SA', 'dg@c.test', 'Directeur')
    const dg = api(env, await login(env, 'dg@c.test'))
    await invite(env, dg, 'bureau@c.test', 'bureau')
    await invite(env, dg, 'tech@c.test', 'tech')
    return dg
  }
  it('prévient admin et bureau (pas les techniciens) avec un seul e-mail récapitulatif', async () => {
    const dg = await org()
    await push(dg, [
      elevator('e1', [{ id: 'i1', kind: 'controle_technique', label: 'Contrôle technique', due: inDays(20) }]),
      elevator('e2', [{ id: 'i2', kind: 'assurance', label: 'Assurance', due: inDays(5) }, { id: 'i3', kind: 'extincteur', label: 'Extincteur', due: inDays(120) }]),
    ])
    const sent = await sendComplianceReminders(env.db, env.mailer, env.config)
    expect(sent).toEqual([{ org: 'Cliente SA', count: 2 }]) // l'échéance à 120 jours n'est pas concernée
    expect(mails('dg@c.test')).toHaveLength(1)
    expect(mails('bureau@c.test')).toHaveLength(1)
    expect(mails('tech@c.test')).toHaveLength(0)
    const m = mails('dg@c.test')[0]
    expect(m.subject).toContain('Échéances à venir')
    expect(m.html).toContain('Contrôle technique · Ascenseur e1')
    expect(m.html).toContain('Assurance · Ascenseur e2')
    expect(m.html).toContain('/#/office/compliance')
    expect(m.html).not.toContain('Extincteur')
  })
  it('n’envoie qu’une fois par palier : 30 jours, 7 jours, puis dépassée', async () => {
    const dg = await org()
    const set = (due: string) => push(dg, [elevator('e1', [{ id: 'i1', kind: 'controle_technique', label: 'Contrôle technique', due }])])
    await set(inDays(25))
    expect(await sendComplianceReminders(env.db, env.mailer, env.config)).toHaveLength(1)
    expect(await sendComplianceReminders(env.db, env.mailer, env.config)).toEqual([]) // rien de nouveau
    // le temps passe : on simule en rapprochant la date
    await env.db.query(`update docs set data = jsonb_set(data, '{compliance,0,due}', to_jsonb($1::text)) where id = 'e1'`, [inDays(6)])
    expect(await sendComplianceReminders(env.db, env.mailer, env.config)).toHaveLength(1) // palier 7 jours
    expect(await sendComplianceReminders(env.db, env.mailer, env.config)).toEqual([])
    await env.db.query(`update docs set data = jsonb_set(data, '{compliance,0,due}', to_jsonb($1::text)) where id = 'e1'`, [inDays(-3)])
    await sendComplianceReminders(env.db, env.mailer, env.config)
    const last = mails('dg@c.test').at(-1)!
    expect(last.subject).toContain('Échéance dépassée')
    expect(last.html).toContain('dépassée de 3 jours')
    expect(mails('dg@c.test')).toHaveLength(3)
    expect(await sendComplianceReminders(env.db, env.mailer, env.config)).toEqual([]) // pas de rappel quotidien d'une échéance déjà signalée
  })
  it('une échéance validée (nouvelle date) repart sur un nouveau cycle de rappels', async () => {
    const dg = await org()
    await push(dg, [elevator('e1', [{ id: 'i1', kind: 'assurance', label: 'Assurance', due: inDays(3) }])])
    await sendComplianceReminders(env.db, env.mailer, env.config)
    await push(dg, [elevator('e1', [{ id: 'i1', kind: 'assurance', label: 'Assurance', due: inDays(380), lastDone: inDays(0) }])]) // validée : prochaine dans un an
    expect(await sendComplianceReminders(env.db, env.mailer, env.config)).toEqual([])
    await push(dg, [elevator('e1', [{ id: 'i1', kind: 'assurance', label: 'Assurance', due: inDays(10) }])])
    expect(await sendComplianceReminders(env.db, env.mailer, env.config)).toHaveLength(1)
  })
  it('ignore les entreprises suspendues, les appareils supprimés et les dates invalides', async () => {
    const dg = await org()
    await push(dg, [
      elevator('e1', [{ id: 'i1', kind: 'assurance', label: 'Assurance', due: 'demain' }]),
      elevator('e2', [{ id: 'i2', kind: 'assurance', label: 'Assurance', due: inDays(2) }]),
      elevator('e3', 'pas-un-tableau'),
    ])
    await push(dg, [{ collection: 'elevators', id: 'e2', data: null }])
    expect(await sendComplianceReminders(env.db, env.mailer, env.config)).toEqual([])
    await push(dg, [elevator('e4', [{ id: 'i4', kind: 'assurance', label: 'Assurance', due: inDays(2) }])])
    const id = (await env.db.query<{ id: string }>(`select id from organisations where name = 'Cliente SA'`)).rows[0].id
    await op.post(`/api/operator/orgs/${id}/suspend`, { code: 'unpaid' })
    expect(await sendComplianceReminders(env.db, env.mailer, env.config)).toEqual([])
  })
})
