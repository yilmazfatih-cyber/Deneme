/** Bayt yardımcıları: UTF-8 ve standart base64 (tarayıcıda ve Node'da aynı davranır). */

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function utf8(s: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(s)
}

export function fromUtf8(b: Uint8Array): string {
  return decoder.decode(b)
}

export function b64encode(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

export function b64decode(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  let len = 0
  for (const p of parts) len += p.length
  const out = new Uint8Array(len)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

/** JSON değerini base64(utf8(JSON)) olarak kodlar (MSL tokendata, PLAINTEXT_DEV gövdeleri). */
export function b64json(value: unknown): string {
  return b64encode(utf8(JSON.stringify(value)))
}

export function parseB64json<T>(s: string): T {
  return JSON.parse(fromUtf8(b64decode(s))) as T
}
