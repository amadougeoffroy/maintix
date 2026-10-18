import { describe, expect, it } from 'vitest'
import { describeEntry } from './components/History'
import type { AuditEntry } from './api'

const e = (action: string, detail: AuditEntry['detail']): AuditEntry => ({ id: 1, at: '2026-01-01T10:00:00Z', action, collection: 'jobs', docId: 'j1', user: 'Ada', detail })

describe('historique lisible', () => {
  it('décrit une création, une modification et un refus', () => {
    expect(describeEntry(e('doc.write', { created: true }))).toBe('a créé')
    expect(describeEntry(e('doc.write', { changed: { status: { from: 'planifiee', to: 'sur_place' }, techId: { from: null, to: 't1' }, timeline: true } }))).toBe('a modifié : statut planifiee → sur_place ; technicien — → t1 ; timeline')
    expect(describeEntry(e('sync.rejected', { reason: 'immutable' }))).toContain('immutable')
    expect(describeEntry(e('invoice.issue', null))).toBe('a émis la facture')
  })
})
