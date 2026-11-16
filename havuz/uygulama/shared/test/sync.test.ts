import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  applyMutation,
  defineEntity,
  jsonEqual,
  keyString,
  mutationSchema,
  rebase,
  SYNC_LIMITS,
  syncRequestSchema,
  type Doc,
  type EntityRegistry,
} from '../src/index.ts'

const task = (data: Record<string, unknown>, deleted = false): Doc => ({
  data: { listId: null, title: 'Süt al', note: '', done: false, dueDate: null, priority: 'normal', order: 0, ...data },
  deleted,
})

describe('applyMutation', () => {
  it('put: doğrular, varsayılanları doldurur, bilinmeyen alanı atar', () => {
    const result = applyMutation(null, { op: 'put', collection: 'tasks', data: { title: ' Süt al ', ek: 1 } })
    expect(result).toEqual({ ok: true, doc: task({}), changed: true })
  })

  it('put: aynı veriyle yeniden yazmak değişiklik sayılmaz; silinmiş kaydı geri getirir', () => {
    expect(applyMutation(task({}), { op: 'put', collection: 'tasks', data: { title: 'Süt al' } })).toMatchObject({
      ok: true,
      changed: false,
    })
    const revived = applyMutation(task({}, true), { op: 'put', collection: 'tasks', data: { title: 'Süt al' } })
    expect(revived).toMatchObject({ ok: true, changed: true, doc: { deleted: false } })
  })

  it('put: geçersiz veri Türkçe iletiyle reddedilir ve alan yolu döner', () => {
    const result = applyMutation(null, { op: 'put', collection: 'tasks', data: { title: '' } })
    expect(result).toMatchObject({ ok: false, code: 'validation', message: 'Göreve bir başlık yazın.' })
    expect(result.ok === false && result.details).toEqual([{ path: 'title', message: 'Göreve bir başlık yazın.' }])
  })

  it('patch: yalnız verilen alan değişir; ÖTEKİ ALANLAR VARSAYILANA DÖNMEZ', () => {
    const current = task({ done: true, note: 'ekmek de', priority: 'high', order: 7 })
    const result = applyMutation(current, { op: 'patch', collection: 'tasks', data: { title: 'Market' } })
    expect(result).toEqual({ ok: true, changed: true, doc: task({ ...current.data, title: 'Market' }) })
  })

  it('patch: birleşmiş kayıt şemaya uymuyorsa reddedilir; aynı değer değişiklik sayılmaz', () => {
    expect(applyMutation(task({}), { op: 'patch', collection: 'tasks', data: { priority: 'acil' } })).toMatchObject({
      ok: false,
      code: 'validation',
    })
    expect(applyMutation(task({}), { op: 'patch', collection: 'tasks', data: { done: false } })).toMatchObject({
      ok: true,
      changed: false,
    })
  })

  it('patch: kayıt yoksa not_found; silinmişse etkisiz', () => {
    expect(applyMutation(null, { op: 'patch', collection: 'tasks', data: { done: true } })).toMatchObject({
      ok: false,
      code: 'not_found',
    })
    const tombstone = task({}, true)
    expect(applyMutation(tombstone, { op: 'patch', collection: 'tasks', data: { done: true } })).toEqual({
      ok: true,
      doc: tombstone,
      changed: false,
    })
  })

  it('delete / restore', () => {
    expect(applyMutation(null, { op: 'delete', collection: 'tasks' })).toEqual({ ok: true, doc: null, changed: false })
    expect(applyMutation(task({}), { op: 'delete', collection: 'tasks' })).toEqual({
      ok: true,
      doc: task({}, true),
      changed: true,
    })
    expect(applyMutation(task({}, true), { op: 'delete', collection: 'tasks' })).toMatchObject({ changed: false })
    expect(applyMutation(task({}, true), { op: 'restore', collection: 'tasks' })).toEqual({
      ok: true,
      doc: task({}),
      changed: true,
    })
    expect(applyMutation(task({}), { op: 'restore', collection: 'tasks' })).toMatchObject({ changed: false })
    expect(applyMutation(null, { op: 'restore', collection: 'tasks' })).toMatchObject({ ok: false, code: 'not_found' })
  })

  it('tanınmayan koleksiyon her işlemde reddedilir', () => {
    for (const op of ['put', 'patch'] as const) {
      expect(applyMutation(null, { op, collection: 'yok', data: {} })).toMatchObject({ code: 'unknown_collection' })
    }
    expect(applyMutation(null, { op: 'delete', collection: 'constructor' })).toMatchObject({
      code: 'unknown_collection',
    })
  })

  it('çok büyük kayıt reddedilir (bayt olarak ölçülür)', () => {
    const registry: EntityRegistry = {
      blobs: defineEntity({
        collection: 'blobs',
        label: { singular: 'Parça', plural: 'Parçalar' },
        schema: z.object({ body: z.string() }),
      }),
    }
    const fits = 'a'.repeat(SYNC_LIMITS.maxRecordBytes - 20)
    expect(applyMutation(null, { op: 'put', collection: 'blobs', data: { body: fits } }, registry).ok).toBe(true)
    // "ş" UTF-8'de 2 bayttır: karakter sayısı sınırın altında, bayt sayısı üstünde.
    const tooBig = 'ş'.repeat(SYNC_LIMITS.maxRecordBytes / 2)
    expect(applyMutation(null, { op: 'put', collection: 'blobs', data: { body: tooBig } }, registry)).toMatchObject({
      ok: false,
      code: 'payload_too_large',
    })
  })
})

describe('rebase', () => {
  it('sunucu hâlinin üstüne bekleyenleri sırayla uygular', () => {
    const view = rebase(task({ title: 'Sunucu' }), [
      { op: 'patch', collection: 'tasks', data: { done: true } },
      { op: 'patch', collection: 'tasks', data: { note: 'yerel not' } },
    ])
    expect(view).toEqual(task({ title: 'Sunucu', done: true, note: 'yerel not' }))
  })

  it('uygulanamayan değişikliği atlar, kalanları uygular', () => {
    const view = rebase(null, [
      { op: 'patch', collection: 'tasks', data: { done: true } }, // kayıt yok → atlanır
      { op: 'put', collection: 'tasks', data: { title: 'Yeni' } },
      { op: 'patch', collection: 'tasks', data: { priority: 'geçersiz' } }, // şemaya uymaz → atlanır
      { op: 'delete', collection: 'tasks' },
    ])
    expect(view).toEqual(task({ title: 'Yeni' }, true))
    expect(rebase(null, [])).toBeNull()
  })
})

describe('yardımcılar ve şemalar', () => {
  it('jsonEqual: anahtar sırası ve undefined değerler önemsiz', () => {
    expect(jsonEqual({ a: 1, b: [1, { c: null }] }, { b: [1, { c: null }], a: 1 })).toBe(true)
    expect(jsonEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true)
    expect(jsonEqual({ a: 1 }, { a: 1, b: null })).toBe(false)
    expect(jsonEqual([1, 2], [2, 1])).toBe(false)
    expect(jsonEqual([], {})).toBe(false)
    expect(jsonEqual(null, {})).toBe(false)
    expect(jsonEqual('a', 'a')).toBe(true)
  })

  it('keyString alan + koleksiyon + kimlikten tek anahtar üretir', () => {
    expect(keyString({ workspaceId: 'w', collection: 'tasks', id: 'r' })).toBe('w/tasks/r')
  })

  it('mutationSchema: put/patch veri ister, kimlik ve sıra numarası denetlenir', () => {
    const base = { mid: 1, workspaceId: 'w', collection: 'tasks', recordId: 'r', at: '2026-01-01T00:00:00.000Z' }
    expect(mutationSchema.safeParse({ ...base, op: 'put', data: {} }).success).toBe(true)
    expect(mutationSchema.safeParse({ ...base, op: 'delete' }).success).toBe(true)
    expect(mutationSchema.safeParse({ ...base, op: 'put' }).success).toBe(false)
    expect(mutationSchema.safeParse({ ...base, op: 'sil' }).success).toBe(false)
    expect(mutationSchema.safeParse({ ...base, op: 'delete', mid: 0 }).success).toBe(false)
    expect(mutationSchema.safeParse({ ...base, op: 'delete', recordId: 'a/b' }).success).toBe(false)
    expect(mutationSchema.safeParse({ ...base, op: 'delete', at: '01.01.2026' }).success).toBe(false)
  })

  it('syncRequestSchema: istek başına değişiklik sınırı', () => {
    const mutation = (mid: number) => ({
      mid,
      workspaceId: 'w',
      collection: 'tasks',
      recordId: 'r',
      at: '2026-01-01T00:00:00.000Z',
      op: 'delete',
    })
    const make = (count: number) => ({
      protocolVersion: 1,
      clientId: 'c',
      cursors: { w: 0 },
      mutations: Array.from({ length: count }, (_, index) => mutation(index + 1)),
    })
    expect(syncRequestSchema.safeParse(make(SYNC_LIMITS.maxMutationsPerRequest)).success).toBe(true)
    expect(syncRequestSchema.safeParse(make(SYNC_LIMITS.maxMutationsPerRequest + 1)).success).toBe(false)
    expect(syncRequestSchema.safeParse({ ...make(0), cursors: { w: -1 } }).success).toBe(false)
  })
})
