import { describe, expect, it } from 'vitest'
import { dataUrlToBlob } from './files'

describe('dataUrlToBlob', () => {
  it('décode une data-URL base64 sans fetch (la CSP interdit fetch data:)', async () => {
    const b = dataUrlToBlob('data:image/png;base64,iVBORw0KGgo=')
    expect(b.type).toBe('image/png')
    expect(Array.from(new Uint8Array(await b.arrayBuffer()))).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  })
  it('décode une data-URL texte', async () => {
    expect(await dataUrlToBlob('data:text/plain,a%20b').text()).toBe('a b')
  })
})
