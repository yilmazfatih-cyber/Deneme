/**
 * Çalışma zamanı tamamlayıcıları: telefonun JavaScript motorunda (Hermes) bulunmayabilen birkaç özelliği ekler.
 * Ortak sözleşme (shared/) bunlara dayanır: `Array.prototype.toSorted`/`toReversed`, `Object.hasOwn`, `TextEncoder`
 * (kayıt boyutu sınırı) ve `crypto.getRandomValues` (UUIDv7 kimlikleri). Var olan özelliğe DOKUNULMAZ.
 *
 * Uygulama girişinde İLK satırda içe aktarılır (src/app/_layout.tsx → `import '../lib/platform/polyfills'`).
 * Genişletme: yeni bir eksik özellik için `install…` işlevi + test (test/lib/polyfills.test.ts) ekleyin.
 */
import { getRandomValues } from 'expo-crypto'

type RandomFill = (bytes: Uint8Array) => void

/** UTF-8 kodlayıcı (yalnız `encode`). Eşleşmemiş vekil (surrogate) karakter, TextEncoder gibi U+FFFD olur. */
export class Utf8Encoder {
  readonly encoding = 'utf-8'

  encode(input = ''): Uint8Array {
    const bytes: number[] = []
    for (let index = 0; index < input.length; index++) {
      let code = input.charCodeAt(index)
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = input.charCodeAt(index + 1)
        if (next >= 0xdc00 && next <= 0xdfff) {
          code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00)
          index += 1
        } else code = 0xfffd
      } else if (code >= 0xdc00 && code <= 0xdfff) code = 0xfffd
      if (code < 0x80) bytes.push(code)
      else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
      else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
      else
        bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    }
    return Uint8Array.from(bytes)
  }
}

function define(target: object, name: string, value: unknown): void {
  Object.defineProperty(target, name, { value, writable: true, configurable: true, enumerable: false })
}

/** `Array.prototype.toSorted` / `toReversed` yoksa ekler (kopyayı değiştirir; asıl dizi değişmez). */
export function installArrayPolyfills(proto: object = Array.prototype): void {
  if (typeof (proto as { toSorted?: unknown }).toSorted !== 'function') {
    define(proto, 'toSorted', function toSorted(this: unknown[], compare?: (a: unknown, b: unknown) => number) {
      const copy: unknown[] = Array.prototype.slice.call(this)
      return copy.sort(compare)
    })
  }
  if (typeof (proto as { toReversed?: unknown }).toReversed !== 'function') {
    define(proto, 'toReversed', function toReversed(this: unknown[]) {
      const copy: unknown[] = Array.prototype.slice.call(this)
      return copy.reverse()
    })
  }
}

/** `Object.hasOwn` yoksa ekler. */
export function installObjectPolyfills(objectCtor: object = Object): void {
  if (typeof (objectCtor as { hasOwn?: unknown }).hasOwn !== 'function') {
    define(objectCtor, 'hasOwn', (object: object, key: PropertyKey) =>
      Object.prototype.hasOwnProperty.call(object, key),
    )
  }
}

/** `TextEncoder` ve `crypto.getRandomValues` yoksa ekler. `fill`: rastgele bayt kaynağı (test için). */
export function installGlobalPolyfills(target: object, fill: RandomFill): void {
  const globals = target as { TextEncoder?: unknown; crypto?: { getRandomValues?: unknown } }
  if (typeof globals.TextEncoder !== 'function') define(target, 'TextEncoder', Utf8Encoder)
  const crypto = globals.crypto
  if (typeof crypto?.getRandomValues !== 'function') {
    const getRandom = <T extends ArrayBufferView>(array: T): T => {
      fill(new Uint8Array(array.buffer, array.byteOffset, array.byteLength))
      return array
    }
    if (crypto) define(crypto, 'getRandomValues', getRandom)
    else define(target, 'crypto', { getRandomValues: getRandom })
  }
}

const expoFill: RandomFill = (bytes) => {
  getRandomValues(bytes)
}

installArrayPolyfills()
installObjectPolyfills()
installGlobalPolyfills(globalThis, expoFill)
