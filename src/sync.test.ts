import { beforeEach, describe, expect, it } from 'vitest'
import { actions, applyRemoteDocs, diffStates, getState, setStateForTests, verifyJob } from './store'
import { emptyState, remappedSeed, seed } from './seed'
import { canonicalJson } from '../shared/canonical'

beforeEach(() => setStateForTests(seed()))

describe('détection des changements à synchroniser', () => {
  it('ne liste que les documents modifiés, créés ou supprimés', () => {
    const a = getState()
    const job = a.jobs[0]
    const b = { ...a, jobs: [...a.jobs.slice(1), { ...job, status: 'en_route' as const }].sort((x, y) => x.id.localeCompare(y.id)), clients: a.clients.slice(1) }
    const ops = diffStates(a, b)
    expect(ops.find((o) => o.collection === 'jobs' && o.id === job.id)?.data).toMatchObject({ status: 'en_route' })
    expect(ops.find((o) => o.collection === 'clients' && o.id === a.clients[0].id)?.data).toBeNull()
    expect(ops.filter((o) => o.collection === 'sites')).toEqual([])
    expect(ops.length).toBe(2)
  })
  it('identifie onCall par weekStart', () => {
    const a = getState()
    const b = { ...a, onCall: [{ weekStart: '2030-01-07', techId: 't1' }] }
    const ops = diffStates(a, b).filter((o) => o.collection === 'onCall')
    expect(ops.map((o) => o.id)).toContain('2030-01-07')
  })
})

describe('application des documents distants', () => {
  it('crée, met à jour et supprime sans renvoyer', () => {
    const before = getState().clients.length
    applyRemoteDocs([
      { collection: 'clients', id: 'cX', data: { id: 'cX', name: 'Nouveau', kind: 'syndic', contact: '', email: '', phone: '' }, deleted: false },
      { collection: 'clients', id: 'c1', data: null, deleted: true },
      { collection: 'sites', id: 's1', data: { ...getState().sites[0], name: 'Renommé' }, deleted: false },
    ])
    const s = getState()
    expect(s.clients.length).toBe(before)
    expect(s.clients.some((c) => c.id === 'cX')).toBe(true)
    expect(s.clients.some((c) => c.id === 'c1')).toBe(false)
    expect(s.sites.find((x) => x.id === 's1')!.name).toBe('Renommé')
  })
  it('le sceau reste vérifiable après réordonnancement des clés (jsonb)', async () => {
    actions.setStatus('j1', 'sur_place')
    actions.updateVisit('j1', { lockedOut: true, emergencyCallTest: 'ok', signature: { absent: true, at: 'x', photo: 'x' } })
    actions.answer('j1', 'pal_galets', { status: 'ok', photos: [] })
    await actions.finishJob('j1', 12)
    const job = getState().jobs.find((j) => j.id === 'j1')!
    const reordered = JSON.parse(JSON.stringify(job, (_, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).reverse()) : v)))
    expect(await verifyJob(reordered)).toBe(true)
  })
})

describe('données de démonstration en mode serveur', () => {
  it('remappe tous les identifiants de façon cohérente', () => {
    let n = 0
    const demo = remappedSeed((p) => `${p}_${++n}`)
    const old = seed()
    expect(demo.elevators.map((e) => e.id)).not.toEqual(old.elevators.map((e) => e.id))
    const siteIds = new Set(demo.sites.map((s) => s.id))
    expect(demo.elevators.every((e) => siteIds.has(e.siteId))).toBe(true)
    const techIds = new Set(demo.techs.map((t) => t.id))
    expect(demo.jobs.filter((j) => j.techId).every((j) => techIds.has(j.techId!))).toBe(true)
    expect(demo.contracts.every((k) => k.elevatorIds.every((id) => demo.elevators.some((e) => e.id === id)))).toBe(true)
    expect(emptyState().jobs).toEqual([])
  })
  it('canonicalJson est insensible à l’ordre des clés', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: undefined } })).toBe(canonicalJson({ a: { c: undefined, d: [1, { y: 2, z: 1 }] }, b: 1 }))
  })
})
