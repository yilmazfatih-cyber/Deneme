// sonuc modülünün testi.
import { describe, expect, it } from 'vitest'
import {
  andThen,
  combine,
  err,
  fold,
  isErr,
  isOk,
  mapErr,
  mapOk,
  ok,
  partition,
  tryCatch,
  tryCatchAsync,
  unwrap,
  UnwrapError,
  unwrapOr,
  type Result,
} from '../src/sonuc.ts'

function bol(a: number, b: number): Result<number, string> {
  return b === 0 ? err('sıfıra bölme') : ok(a / b)
}

describe('sonuc', () => {
  it('ok/err ve tip daraltma', () => {
    const r = bol(6, 3)
    expect(isOk(r)).toBe(true)
    if (r.ok) expect(r.value).toBe(2)
    expect(isErr(bol(1, 0))).toBe(true)
  })

  it('dönüştürme ve zincirleme hatada kısa devre yapar', () => {
    expect(mapOk(bol(6, 3), (v) => v * 10)).toEqual(ok(20))
    expect(mapOk(bol(6, 0), (v) => v * 10)).toEqual(err('sıfıra bölme'))
    expect(mapErr(bol(6, 0), (e) => e.length)).toEqual(err(12))
    expect(andThen(bol(12, 2), (v) => bol(v, 3))).toEqual(ok(2))
    expect(andThen(bol(12, 0), (v) => bol(v, 3))).toEqual(err('sıfıra bölme'))
    expect(fold(bol(1, 0), String, (e) => `hata: ${e}`)).toBe('hata: sıfıra bölme')
  })

  it('unwrap hatada UnwrapError fırlatır, asıl hata cause içindedir', () => {
    expect(unwrap(ok(5))).toBe(5)
    expect(unwrapOr(err('x'), 7)).toBe(7)
    try {
      unwrap(err({ kod: 404 }))
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(UnwrapError)
      expect((error as UnwrapError).cause).toEqual({ kod: 404 })
      expect((error as Error).message).toContain('404')
    }
  })

  it('tryCatch fırlatılan Error olmayan değeri de Error yapar', async () => {
    expect(tryCatch(() => JSON.parse('{"a":1}'))).toEqual(ok({ a: 1 }))
    const bad = tryCatch(() => JSON.parse('{'))
    expect(bad.ok).toBe(false)
    const thrownString = tryCatch(() => {
      throw 'düz metin' // eslint-disable-line @typescript-eslint/only-throw-error
    })
    expect(!thrownString.ok && thrownString.error).toBeInstanceOf(Error)
    expect(await tryCatchAsync(async () => 3)).toEqual(ok(3))
    const rejected = await tryCatchAsync(() => Promise.reject(new Error('ağ')))
    expect(!rejected.ok && rejected.error.message).toBe('ağ')
  })

  it('combine ilk hatayı, partition ikisini birden verir', () => {
    expect(combine([ok(1), ok(2)])).toEqual(ok([1, 2]))
    expect(combine([ok(1), err('a'), err('b')])).toEqual(err('a'))
    expect(partition([ok(1), err('a'), ok(2), err('b')])).toEqual({ values: [1, 2], errors: ['a', 'b'] })
  })
})
