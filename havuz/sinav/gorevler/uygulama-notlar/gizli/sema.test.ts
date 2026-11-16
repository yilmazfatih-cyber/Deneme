/**
 * Gizli sınav testi (uygulama-notlar): notes varlığı kayıtlı ve şeması görev metnine uygun.
 */
import { describe, expect, it } from 'vitest'
import { ENTITIES, getEntity } from '../src/index.ts'

const notes = () => {
  const entity = getEntity('notes')
  if (!entity) throw new Error('ENTITIES içinde notes varlığı yok')
  return entity
}

describe('gizli: notes varlığı', () => {
  it('kayıtlı; görünen adları Not / Notlar', () => {
    expect(Object.keys(ENTITIES)).toContain('notes')
    expect(notes().collection).toBe('notes')
    expect(notes().label).toEqual({ singular: 'Not', plural: 'Notlar' })
  })

  it('yalnız başlıkla kayıt: note boş, pinned false', () => {
    const parsed = notes().schema.parse({ title: 'Alışveriş' }) as Record<string, unknown>
    expect(parsed.title).toBe('Alışveriş')
    expect(parsed.note).toBe('')
    expect(parsed.pinned).toBe(false)
  })

  it('başlık zorunlu ve en çok 120 karakter; not en çok 5000 karakter', () => {
    const schema = notes().schema
    expect(schema.safeParse({ title: 'x'.repeat(120) }).success).toBe(true)
    expect(schema.safeParse({ title: 'x'.repeat(121) }).success).toBe(false)
    expect(schema.safeParse({ title: '' }).success).toBe(false)
    expect(schema.safeParse({}).success).toBe(false)
    expect(schema.safeParse({ title: 'a', note: 'x'.repeat(5000) }).success).toBe(true)
    expect(schema.safeParse({ title: 'a', note: 'x'.repeat(5001) }).success).toBe(false)
  })

  it('pinned evet/hayır değeri alır', () => {
    const schema = notes().schema
    expect((schema.parse({ title: 'a', pinned: true }) as Record<string, unknown>).pinned).toBe(true)
    expect(schema.safeParse({ title: 'a', pinned: 'evet' }).success).toBe(false)
  })
})
