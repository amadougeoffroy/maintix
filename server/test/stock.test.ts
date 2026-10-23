import { beforeEach, describe, expect, it } from 'vitest'
import { api, bootstrap, invite, makeEnv, push, type Env } from './helpers'

let env: Env
let admin: ReturnType<typeof api>
beforeEach(async () => {
  env = await makeEnv()
  admin = api(env, await bootstrap(env, 'ada@a.test'))
})
const item = (id = 'st1') => ({ collection: 'stock', id, data: { id, name: 'Galet de porte', minQty: 4, createdAt: '2026-01-01' } })
const moveDoc = (id: string, extra: Record<string, unknown> = {}) => ({ collection: 'stockMoves', id, data: { id, itemId: 'st1', delta: 10, reason: 'inventaire', at: '2026-01-01T00:00:00.000Z', ...extra } })

describe('stock de pièces : règles de synchronisation', () => {
  it('le bureau crée des références et des mouvements', async () => {
    expect((await push(admin, [item(), moveDoc('m1')])).results.every((r) => r.ok)).toBe(true)
    const docs = (await (await admin.get('/api/sync/pull?since=0')).json()).docs as { collection: string }[]
    expect(docs.filter((d) => d.collection === 'stock' || d.collection === 'stockMoves')).toHaveLength(2)
  })
  it('un mouvement est écrit une fois : ni modifié, ni supprimé', async () => {
    await push(admin, [item(), moveDoc('m1')])
    expect((await push(admin, [moveDoc('m1', { delta: 99 })])).results[0]).toMatchObject({ ok: false, reason: 'immutable' })
    expect((await push(admin, [{ collection: 'stockMoves', id: 'm1', data: null }])).results[0].ok).toBe(false)
    expect((await env.db.query<{ data: { delta: number } }>(`select data from docs where collection = 'stockMoves' and id = 'm1'`)).rows[0].data.delta).toBe(10)
  })
  it('un technicien ne crée que des sorties de visite, et ne touche pas aux références', async () => {
    await push(admin, [item(), moveDoc('m1')])
    const tech = api(env, await invite(env, admin, 't@a.test', 'tech'))
    expect((await push(tech, [moveDoc('m2', { delta: -2, reason: 'visite', jobId: 'j1' })])).results[0].ok).toBe(true)
    expect((await push(tech, [moveDoc('m3', { delta: 5, reason: 'visite' })])).results[0].ok).toBe(false) // pas d'entrée
    expect((await push(tech, [moveDoc('m4', { delta: -2, reason: 'sortie' })])).results[0].ok).toBe(false) // pas une sortie de visite
    expect((await push(tech, [item('st2')])).results[0].ok).toBe(false)
    expect((await push(tech, [{ collection: 'stock', id: 'st1', data: { ...item().data, minQty: 99 } }])).results[0].ok).toBe(false)
  })
  it('un client du portail ne reçoit jamais le stock', async () => {
    await push(admin, [{ collection: 'clients', id: 'c1', data: { id: 'c1', name: 'Client' } }, item(), moveDoc('m1')])
    const client = api(env, await invite(env, admin, 'c@client.test', 'client', { clientId: 'c1' }))
    const docs = (await (await client.get('/api/sync/pull?since=0')).json()).docs as { collection: string }[]
    expect(docs.some((d) => d.collection === 'clients')).toBe(true)
    expect(docs.some((d) => d.collection === 'stock' || d.collection === 'stockMoves')).toBe(false)
    expect((await push(client, [moveDoc('m9', { delta: -1, reason: 'visite' })])).results[0].ok).toBe(false)
  })
  it('« Vider les données » supprime aussi le stock, avec propagation aux autres appareils', async () => {
    await push(admin, [item(), moveDoc('m1')])
    const cursor = (await (await admin.get('/api/sync/pull?since=0')).json()).cursor as number
    await admin.post('/api/org/clear-data', { confirm: 'SUPPRIMER' })
    const delta = (await (await admin.get(`/api/sync/pull?since=${cursor}`)).json()).docs as { collection: string; deleted: boolean }[]
    expect(delta.filter((d) => d.deleted).map((d) => d.collection).sort()).toEqual(['stock', 'stockMoves'])
  })
})
