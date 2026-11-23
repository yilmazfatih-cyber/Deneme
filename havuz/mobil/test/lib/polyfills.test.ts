/**
 * Çalışma zamanı tamamlayıcıları: eksik özelliği ekler, var olana dokunmaz; UTF-8 kodlayıcı Node'unkiyle aynı baytları
 * üretir (Türkçe harfler, emoji, eşleşmemiş vekil karakter).
 */
import {
  installArrayPolyfills,
  installGlobalPolyfills,
  installObjectPolyfills,
  Utf8Encoder,
} from '../../src/lib/platform/polyfills.ts'

describe('çalışma zamanı tamamlayıcıları', () => {
  it('UTF-8 kodlayıcı yerleşik TextEncoder ile aynı baytları verir', () => {
    const samples = ['', 'Süt al', 'İĞÜŞÖÇ ığüşöç', 'emoji 👩\u200d💻 ✓', 'yarım \ud83d vekil', '\udc00 tek']
    const native = new TextEncoder()
    for (const sample of samples)
      expect(Array.from(new Utf8Encoder().encode(sample))).toEqual(Array.from(native.encode(sample)))
  })

  it('eksik toSorted, toReversed ve hasOwn eklenir; asıl dizi değişmez', () => {
    const proto = {}
    installArrayPolyfills(proto)
    const toSorted = (proto as { toSorted: (this: number[], compare?: (a: number, b: number) => number) => number[] })
      .toSorted
    const original = [3, 1, 2]
    expect(toSorted.call(original, (a, b) => a - b)).toEqual([1, 2, 3])
    expect(original).toEqual([3, 1, 2])
    const toReversed = (proto as { toReversed: (this: number[]) => number[] }).toReversed
    expect(toReversed.call(original)).toEqual([2, 1, 3])
    expect(original).toEqual([3, 1, 2])

    const objectCtor = {}
    installObjectPolyfills(objectCtor)
    const hasOwn = (objectCtor as { hasOwn: (o: object, k: PropertyKey) => boolean }).hasOwn
    expect(hasOwn({ a: 1 }, 'a')).toBe(true)
    expect(hasOwn(Object.create({ b: 1 }) as object, 'b')).toBe(false)
  })

  it('TextEncoder ve crypto.getRandomValues yoksa eklenir; varsa dokunulmaz', () => {
    const empty: Record<string, unknown> = {}
    installGlobalPolyfills(empty, (bytes) => bytes.fill(7))
    expect(new (empty.TextEncoder as typeof Utf8Encoder)().encode('ı')).toEqual(Uint8Array.from([0xc4, 0xb1]))
    const crypto = empty.crypto as { getRandomValues: (array: Uint16Array) => Uint16Array }
    expect(Array.from(crypto.getRandomValues(new Uint16Array(2)))).toEqual([0x0707, 0x0707])

    const own = () => new Uint8Array(0)
    const full: Record<string, unknown> = { TextEncoder: Utf8Encoder, crypto: { getRandomValues: own } }
    installGlobalPolyfills(full, () => {
      throw new Error('çağrılmamalı')
    })
    expect((full.crypto as { getRandomValues: unknown }).getRandomValues).toBe(own)
  })
})
