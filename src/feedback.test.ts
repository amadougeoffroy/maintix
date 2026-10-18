import { describe, expect, it } from 'vitest'
import { feedback } from './feedback'

describe('feedback', () => {
  it('confirm se résout selon la réponse', async () => {
    const p = feedback.confirm({ title: 'Supprimer ?', body: 'x' })
    feedback.answerAsk(true)
    expect(await p).toBe(true)
    const q = feedback.confirm({ title: 'Supprimer ?', body: 'x' })
    feedback.answerAsk(false)
    expect(await q).toBe(false)
  })
  it('prompt renvoie le texte ou null', async () => {
    const p = feedback.prompt({ title: 'Motif', body: 'x', label: 'Motif' })
    feedback.answerAsk('abc')
    expect(await p).toBe('abc')
    const q = feedback.prompt({ title: 'Motif', body: 'x', label: 'Motif' })
    feedback.answerAsk(null)
    expect(await q).toBeNull()
  })
  it('les demandes sont traitées l’une après l’autre', async () => {
    const a = feedback.confirm({ title: 'A', body: '' })
    const b = feedback.confirm({ title: 'B', body: '' })
    feedback.answerAsk(true)
    expect(await a).toBe(true)
    feedback.answerAsk(false)
    expect(await b).toBe(false)
  })
})
