import { describe, expect, it } from 'vitest'
import { computePilotage, expectedVisits, pilotageCsv } from './pilotage'
import { emptyState } from './seed'
import type { Contract, Invoice, Job, State } from './types'

const TODAY = '2026-10-22'
const base = (): State => ({
  ...emptyState(),
  clients: [{ id: 'c1', name: 'Syndic A', kind: 'syndic', contact: '', email: '', phone: '' }, { id: 'c2', name: 'Bailleur B', kind: 'bailleur', contact: '', email: '', phone: '' }],
  sites: [{ id: 's1', clientId: 'c1', name: 'Site 1', address: '', access: '', risks: '' }, { id: 's2', clientId: 'c2', name: 'Site 2', address: '', access: '', risks: '' }],
  elevators: [
    { id: 'e1', siteId: 's1', label: 'A1', brand: '', model: '', serial: '', year: 2015, loadKg: 630, stops: 5, machineRoom: 'haut', status: 'ok' },
    { id: 'e2', siteId: 's2', label: 'B1', brand: '', model: '', serial: '', year: 2015, loadKg: 630, stops: 5, machineRoom: 'haut', status: 'ok' },
  ],
  contracts: [
    { id: 'k1', clientId: 'c1', elevatorIds: ['e1'], periodicityMonths: 1, priceMonthly: 100000, start: '2025-01-01', indexation: 0, slaResponseHours: 2 },
    { id: 'k2', clientId: 'c2', elevatorIds: ['e2'], periodicityMonths: 3, priceMonthly: 50000, start: '2025-01-01', indexation: 0 },
  ],
})
const panne = (id: string, el: string, created: string, arrival?: string, end?: string, trapped = false): Job => ({
  id, type: 'depannage', elevatorId: el, techId: 't1', date: created.slice(0, 10), status: end ? 'terminee' : 'planifiee', createdAt: created, trapped,
  timeline: [...(arrival ? [{ at: arrival, label: 'Technicien sur place' }] : []), ...(end ? [{ at: end, label: 'Intervention terminée' }] : [])],
})
const invoice = (id: string, contractId: string, status: Invoice['status'], issuedAt: string, paidAt?: string, dueAt?: string): Invoice => ({ id, clientId: 'c1', kind: 'contrat', contractId, lines: [{ label: 'x', qty: 1, unit: 100000 }], vatRate: 18, status, createdAt: issuedAt, issuedAt, paidAt, dueAt })

describe('pilotage', () => {
  it('compte les pannes de la période et classe les appareils les plus en panne', () => {
    const s = base()
    s.jobs = [
      panne('p1', 'e1', '2026-10-10T08:00:00.000Z', '2026-10-10T09:00:00.000Z', '2026-10-10T11:00:00.000Z', true),
      panne('p2', 'e1', '2026-10-15T08:00:00.000Z', '2026-10-15T08:30:00.000Z', '2026-10-15T09:30:00.000Z'),
      panne('p3', 'e2', '2026-10-18T08:00:00.000Z'),
      panne('hors', 'e2', '2026-06-01T08:00:00.000Z'), // hors période
    ]
    const p = computePilotage(s, TODAY, 30)
    expect(p.from).toBe('2026-09-23')
    expect(p.pannes).toMatchObject({ count: 3, trapped: 1, avgResponseMin: 45, avgResolutionMin: 135 }) // arrivées 60 et 30 min ; résolutions 180 et 90 min
    expect(p.pannes.byElevator.map((e) => [e.label, e.count, e.trapped, e.client, e.minutesToFix])).toEqual([['A1', 2, 1, 'Syndic A', 135], ['B1', 1, 0, 'Bailleur B', null]])
  })
  it('mesure le respect du SLA sur les dépannages dont le technicien est arrivé', () => {
    const s = base()
    s.jobs = [
      panne('ok', 'e1', '2026-10-10T08:00:00.000Z', '2026-10-10T09:00:00.000Z'), // 60 min sur 120
      panne('ko', 'e1', '2026-10-12T08:00:00.000Z', '2026-10-12T11:00:00.000Z'), // 180 min sur 120
      panne('sans-sla', 'e2', '2026-10-13T08:00:00.000Z', '2026-10-13T20:00:00.000Z'), // contrat sans engagement : non mesuré
      panne('en-cours', 'e1', '2026-10-20T08:00:00.000Z'), // pas encore arrivé : non mesuré
    ]
    const p = computePilotage(s, TODAY, 30)
    expect(p.sla).toMatchObject({ measured: 2, respected: 1, rate: 50 })
    expect(p.sla.breaches).toEqual([{ jobId: 'ko', elevator: 'A1', limit: 120, response: 180 }])
  })
  it('compare les visites réalisées aux visites attendues par les contrats', () => {
    const s = base()
    const done = (id: string, el: string, at: string): Job => ({ id, type: 'entretien', elevatorId: el, techId: 't1', date: at.slice(0, 10), status: 'terminee', createdAt: at, timeline: [], visit: { finishedAt: at } as never })
    s.jobs = [done('v1', 'e1', '2026-10-05T10:00:00.000Z'), { ...done('v2', 'e1', '2026-10-06T10:00:00.000Z'), status: 'planifiee', date: '2026-10-01' }]
    const p = computePilotage(s, TODAY, 90) // 90 jours : 2 visites mensuelles complètes pour k1 (2,96 arrondi à l'entier inférieur), aucune pour k2 (trimestriel)
    expect(p.visits.expected).toBe(expectedVisits(s.contracts[0], p.from, p.to) + expectedVisits(s.contracts[1], p.from, p.to))
    expect(p.visits.expected).toBe(2)
    expect(p.visits.done).toBe(1)
    expect(p.visits.overdue).toBe(1)
    expect(p.visits.rate).toBe(Math.round((1 / p.visits.expected) * 100))
  })
  it('prorate les visites attendues d’un contrat commencé ou résilié en cours de période', () => {
    const c: Contract = { id: 'k', clientId: 'c', elevatorIds: ['a', 'b'], periodicityMonths: 1, priceMonthly: 0, start: '2025-01-01', indexation: 0 }
    expect(expectedVisits(c, '2026-01-01', '2026-03-31')).toBe(5) // 90 j / 30,44 × 2 appareils = 5,9 → 5
    expect(expectedVisits({ ...c, start: '2026-03-01' }, '2026-01-01', '2026-03-31')).toBe(2) // 31 j : une visite par appareil
    expect(expectedVisits({ ...c, terminatedAt: '2026-01-31' }, '2026-01-01', '2026-03-31')).toBe(2)
    expect(expectedVisits({ ...c, start: '2027-01-01' }, '2026-01-01', '2026-03-31')).toBe(0)
  })
  it('totalise facturé, encaissé et impayé (TTC) et détaille par contrat', () => {
    const s = base()
    s.invoices = [
      invoice('f1', 'k1', 'payee', '2026-10-01', '2026-10-10'), // 118 000 TTC, encaissé
      invoice('f2', 'k1', 'emise', '2026-10-05', undefined, '2026-10-20'), // impayé en retard
      invoice('f3', 'k2', 'emise', '2026-10-15', undefined, '2026-11-15'), // impayé non échu
      invoice('f4', 'k2', 'brouillon', '2026-10-15'), // ignoré
      invoice('f5', 'k2', 'annulee', '2026-10-15'), // ignoré
      invoice('f6', 'k1', 'payee', '2026-01-05', '2026-01-20'), // hors période
    ]
    const r = computePilotage(s, TODAY, 30).revenue
    expect(r).toMatchObject({ monthly: 150000, invoiced: 3 * 118000, collected: 118000, unpaid: 2 * 118000, unpaidOverdue: 118000 })
    expect(r.perContract.map((c) => [c.contractId, c.monthly, c.invoiced, c.collected])).toEqual([['k1', 100000, 236000, 118000], ['k2', 50000, 118000, 0]])
  })
  it('exporte un CSV lisible dans Excel, avec les nombres à virgule décimale', () => {
    const csv = pilotageCsv(computePilotage(base(), TODAY, 30))
    expect(csv.startsWith('﻿Indicateur;Valeur')).toBe(true)
    expect(csv).toContain('Période;2026-09-23 au 2026-10-22')
    expect(csv).toContain('Contrat (client);Appareils;Mensualité (FCFA)')
  })
})
