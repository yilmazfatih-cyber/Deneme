import { describe, expect, it } from 'vitest'
import { gridIdOf } from './grid'

describe('tür sayfası kimliği', () => {
  it('sayısal kimlik tür, mg_ ile başlayan mikro tür, diğerleri geçersiz', () => {
    expect(gridIdOf('7424')).toEqual({ kind: 'genre', id: 7424 })
    expect(gridIdOf('mg_3fa92c1b')).toEqual({ kind: 'microgenre', id: 'mg_3fa92c1b' })
    expect(gridIdOf('0')).toEqual({ kind: 'invalid' })
    expect(gridIdOf('12abc')).toEqual({ kind: 'invalid' })
    expect(gridIdOf('mg_')).toEqual({ kind: 'invalid' })
    expect(gridIdOf('mg_a/../b')).toEqual({ kind: 'invalid' })
    expect(gridIdOf(undefined)).toEqual({ kind: 'invalid' })
  })
})
