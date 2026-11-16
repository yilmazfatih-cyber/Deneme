import { describe, expect, it } from 'vitest'
import {
  COLLECTION_PATTERN,
  defineEntity,
  ENTITIES,
  getEntity,
  isCollectionName,
  listEntity,
  taskEntity,
} from '../src/index.ts'
import { z } from 'zod'

describe('varlık kaydı (kural testleri)', () => {
  it('her kayıt anahtarı varlığın collection adıyla aynıdır', () => {
    for (const [key, entity] of Object.entries(ENTITIES)) {
      expect(entity.collection, `ENTITIES.${key}: anahtar ile collection adı aynı olmalı`).toBe(key)
      expect(key).toMatch(COLLECTION_PATTERN)
    }
  })

  it('her varlığın Türkçe görünen adı vardır', () => {
    for (const entity of Object.values(ENTITIES)) {
      expect(entity.label.singular.length, `${entity.collection}: label.singular boş olamaz`).toBeGreaterThan(0)
      expect(entity.label.plural.length, `${entity.collection}: label.plural boş olamaz`).toBeGreaterThan(0)
    }
  })

  it('her varlık, yalnız zorunlu alanları dolu bir kayıttan TAM bir kayıt üretir (yeni alanların varsayılanı var)', () => {
    // Bu test, "yeni alan eklerken .default(...) verin" kuralını korur: eski kayıtlar okunurken bozulmasın.
    const minimal: Record<string, Record<string, unknown>> = {
      lists: { name: 'Ev' },
      tasks: { title: 'Süt al' },
      // YENİ VARLIK BURAYA: yalnız zorunlu (varsayılanı olmayan) alanlarla en küçük geçerli kayıt
    }
    for (const [key, entity] of Object.entries(ENTITIES)) {
      const sample = minimal[key]
      expect(sample, `"${key}" için bu teste en küçük geçerli kayıt örneği ekleyin`).toBeDefined()
      const parsed = entity.schema.parse(sample)
      for (const field of Object.keys(entity.schema.shape)) {
        expect(parsed, `${key}.${field}: zorunlu değilse .default(...) verin`).toHaveProperty(field)
        expect((parsed as Record<string, unknown>)[field]).not.toBeUndefined()
      }
    }
  })

  it('getEntity yalnız kayıtlı koleksiyonları tanır', () => {
    expect(getEntity('tasks')).toBe(taskEntity)
    expect(getEntity('lists')).toBe(listEntity)
    expect(getEntity('toString')).toBeUndefined()
    expect(getEntity('__proto__')).toBeUndefined()
    expect(isCollectionName('tasks')).toBe(true)
    expect(isCollectionName('constructor')).toBe(false)
  })

  it('geçersiz koleksiyon adı tanım anında yakalanır', () => {
    const define = (collection: string) =>
      defineEntity({ collection, label: { singular: 'X', plural: 'X' }, schema: z.object({}) })
    expect(() => define('Görevler')).toThrow(/Geçersiz koleksiyon adı/)
    expect(() => define('2tasks')).toThrow()
    expect(() => define('tasks-new')).toThrow()
    expect(() => define('notes_v2')).not.toThrow()
  })

  it('görev şeması: boşluk kırpılır, tarih biçimi denetlenir, iletiler Türkçedir', () => {
    expect(taskEntity.schema.parse({ title: '  Rapor  ' }).title).toBe('Rapor')
    expect(taskEntity.schema.safeParse({ title: '   ' }).error?.issues[0]?.message).toBe('Göreve bir başlık yazın.')
    expect(taskEntity.schema.safeParse({ title: 'x', dueDate: '16.11.2026' }).success).toBe(false)
    expect(taskEntity.schema.parse({ title: 'x', dueDate: '2026-11-16' }).dueDate).toBe('2026-11-16')
    expect(taskEntity.schema.safeParse({ title: 'x', done: 'evet' }).error?.issues[0]?.message).toMatch(/Geçersiz/)
    expect(taskEntity.schema.safeParse({ title: 'x', order: Number.NaN }).success).toBe(false)
  })
})
