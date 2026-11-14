/**
 * `node:crypto` karşılığı (eşzamanlı): özet, HMAC, rastgele, scrypt, HKDF, AES-256-GCM ve P-256 ECDH.
 * WebCrypto eşzamansız olduğu için sunucu kodunun beklediği eşzamanlı API'ler saf JS (@noble) ile kurulur.
 */
import { gcm } from '@noble/ciphers/aes.js'
import { p256 } from '@noble/curves/nist.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { hmac } from '@noble/hashes/hmac.js'
import { md5, sha1 } from '@noble/hashes/legacy.js'
import { scrypt as nobleScrypt, scryptAsync } from '@noble/hashes/scrypt.js'
import { sha224, sha256, sha384, sha512 } from '@noble/hashes/sha2.js'
import { Buffer } from './buffer'

type BinaryLike = string | Uint8Array | ArrayBuffer | DataView
type Encoding = 'utf8' | 'utf-8' | 'hex' | 'base64' | 'base64url' | 'latin1' | 'binary' | 'ascii'

interface HashState {
  update(data: Uint8Array): HashState
  digest(): Uint8Array
}
interface HashFactory {
  create(): HashState
  outputLen: number
  blockLen: number
}

const HASHES: Record<string, HashFactory> = {
  sha1: sha1 as unknown as HashFactory,
  md5: md5 as unknown as HashFactory,
  sha224: sha224 as unknown as HashFactory,
  sha256: sha256 as unknown as HashFactory,
  sha384: sha384 as unknown as HashFactory,
  sha512: sha512 as unknown as HashFactory,
}

function hashOf(alg: string): HashFactory {
  const h = HASHES[alg.toLowerCase().replace('-', '')]
  if (!h) throw new Error(`Desteklenmeyen özet algoritması: ${alg}`)
  return h
}

export function toBytes(data: BinaryLike, enc?: string): Uint8Array {
  if (typeof data === 'string') return Buffer.from(data, (enc ?? 'utf8') as Encoding)
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  throw new TypeError('Veri dize ya da bayt dizisi olmalı')
}

function out(bytes: Uint8Array, enc?: string): Buffer | string {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return enc ? b.toString(enc as Encoding) : b
}

class Hash {
  #state: HashState
  constructor(state: HashState) {
    this.#state = state
  }
  update(data: BinaryLike, enc?: string): this {
    this.#state.update(toBytes(data, enc))
    return this
  }
  digest(): Buffer
  digest(enc: string): string
  digest(enc?: string): Buffer | string {
    return out(this.#state.digest(), enc)
  }
  copy(): Hash {
    const s = this.#state as HashState & { clone?: () => HashState }
    if (!s.clone) throw new Error('Özet kopyalanamıyor')
    return new Hash(s.clone())
  }
}

export function createHash(alg: string): Hash {
  return new Hash(hashOf(alg).create())
}

export function createHmac(alg: string, key: BinaryLike | { export(): Uint8Array }): Hash {
  const k = typeof key === 'object' && 'export' in key && typeof key.export === 'function' ? key.export() : key
  const state = hmac.create(hashOf(alg) as unknown as Parameters<typeof hmac.create>[0], toBytes(k as BinaryLike))
  return new Hash(state as unknown as HashState)
}

/** Tek seferlik özet (Node 21.7+ `crypto.hash`). Varsayılan çıktı onaltılık. */
export function hash(alg: string, data: BinaryLike, enc: string = 'hex'): string | Buffer {
  const s = hashOf(alg).create()
  s.update(toBytes(data))
  return out(s.digest(), enc === 'buffer' ? undefined : enc)
}

const fillRandom = (u: Uint8Array): void => {
  globalThis.crypto.getRandomValues(u as Uint8Array<ArrayBuffer>)
}

export function getRandomValues<T extends ArrayBufferView>(arr: T): T {
  return globalThis.crypto.getRandomValues(arr as unknown as Uint8Array<ArrayBuffer>) as unknown as T
}

export function randomBytes(n: number): Buffer
export function randomBytes(n: number, cb: (err: Error | null, buf: Buffer) => void): void
export function randomBytes(n: number, cb?: (err: Error | null, buf: Buffer) => void): Buffer | void {
  const buf = Buffer.alloc(n)
  for (let i = 0; i < n; i += 65536) fillRandom(buf.subarray(i, Math.min(n, i + 65536)))
  if (cb) {
    queueMicrotask(() => cb(null, buf))
    return
  }
  return buf
}

export function randomFillSync<T extends ArrayBufferView>(arr: T): T {
  const u = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength)
  for (let i = 0; i < u.length; i += 65536) fillRandom(u.subarray(i, Math.min(u.length, i + 65536)))
  return arr
}

export function randomUUID(): string {
  return globalThis.crypto.randomUUID()
}

/** [min, max) aralığında düzgün dağılımlı tam sayı (Node imzası: randomInt(max) ya da randomInt(min, max)). */
export function randomInt(a: number, b?: number): number {
  const min = b === undefined ? 0 : a
  const max = b === undefined ? a : b
  const range = max - min
  if (!Number.isSafeInteger(range) || range <= 0) throw new RangeError('randomInt aralığı geçersiz')
  const limit = Math.floor(2 ** 48 / range) * range
  const buf = new Uint8Array(6)
  for (;;) {
    globalThis.crypto.getRandomValues(buf)
    let x = 0
    for (const byte of buf) x = x * 256 + byte
    if (x < limit) return min + (x % range)
  }
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) throw new RangeError('Input buffers must have the same byte length')
  let diff = 0
  for (let i = 0; i < a.byteLength; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

interface ScryptOptions {
  N?: number
  r?: number
  p?: number
  cost?: number
  blockSize?: number
  parallelization?: number
  maxmem?: number
}

const scryptOpts = (keylen: number, o: ScryptOptions = {}) => ({
  N: o.N ?? o.cost ?? 16384,
  r: o.r ?? o.blockSize ?? 8,
  p: o.p ?? o.parallelization ?? 1,
  dkLen: keylen,
  maxmem: o.maxmem ?? 2 ** 30,
})

export function scryptSync(pwd: BinaryLike, salt: BinaryLike, keylen: number, opts?: ScryptOptions): Buffer {
  return out(nobleScrypt(toBytes(pwd), toBytes(salt), scryptOpts(keylen, opts))) as Buffer
}

export function scrypt(
  pwd: BinaryLike,
  salt: BinaryLike,
  keylen: number,
  optsOrCb: ScryptOptions | ((err: Error | null, key: Buffer) => void),
  maybeCb?: (err: Error | null, key: Buffer) => void,
): void {
  const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb!
  const opts = typeof optsOrCb === 'function' ? undefined : optsOrCb
  scryptAsync(toBytes(pwd), toBytes(salt), scryptOpts(keylen, opts)).then(
    (k) => cb(null, out(k) as Buffer),
    (err: unknown) => cb(err instanceof Error ? err : new Error(String(err)), Buffer.alloc(0)),
  )
}

export function hkdfSync(
  digest: string,
  ikm: BinaryLike,
  salt: BinaryLike,
  info: BinaryLike,
  keylen: number,
): ArrayBuffer {
  const okm = hkdf(
    hashOf(digest) as unknown as Parameters<typeof hkdf>[0],
    toBytes(ikm),
    toBytes(salt),
    toBytes(info),
    keylen,
  )
  return okm.slice().buffer
}

export function pbkdf2Sync(): never {
  throw new Error('pbkdf2 tarayıcı kipinde desteklenmiyor')
}

/* ───────────── AES-256-GCM ───────────── */

class GcmCipher {
  #key: Uint8Array
  #iv: Uint8Array
  #decrypt: boolean
  #aad: Uint8Array | undefined
  #tag: Uint8Array | null = null
  #chunks: Uint8Array[] = []

  constructor(alg: string, key: BinaryLike, iv: BinaryLike, decrypt: boolean) {
    if (!/^aes-(128|192|256)-gcm$/.test(alg.toLowerCase())) throw new Error(`Desteklenmeyen şifre: ${alg}`)
    this.#key = toBytes(key)
    this.#iv = toBytes(iv)
    this.#decrypt = decrypt
  }
  setAAD(aad: BinaryLike): this {
    this.#aad = toBytes(aad)
    return this
  }
  setAuthTag(tag: BinaryLike): this {
    this.#tag = toBytes(tag)
    return this
  }
  getAuthTag(): Buffer {
    if (!this.#tag) throw new Error('Doğrulama etiketi final() sonrasında alınır')
    return out(this.#tag) as Buffer
  }
  setAutoPadding(): this {
    return this
  }
  /** GCM akış şifresidir ama doğrulama sonda yapılır: parçalar toplanır, iş final()'de görülür. */
  update(data: BinaryLike, inEnc?: string, outEnc?: string): Buffer | string {
    this.#chunks.push(Uint8Array.from(toBytes(data, inEnc)))
    return outEnc ? '' : Buffer.alloc(0)
  }
  final(outEnc?: string): Buffer | string {
    const all = Buffer.concat(this.#chunks)
    const c = gcm(this.#key, this.#iv, this.#aad)
    let result: Uint8Array
    if (this.#decrypt) {
      if (!this.#tag) throw new Error('Doğrulama etiketi verilmedi')
      try {
        result = c.decrypt(Buffer.concat([all, this.#tag]))
      } catch {
        throw new Error('Unsupported state or unable to authenticate data')
      }
    } else {
      const sealed = c.encrypt(all)
      result = sealed.subarray(0, sealed.length - 16)
      this.#tag = sealed.slice(sealed.length - 16)
    }
    return out(result, outEnc)
  }
}

export function createCipheriv(alg: string, key: BinaryLike, iv: BinaryLike): GcmCipher {
  return new GcmCipher(alg, key, iv, false)
}
export function createDecipheriv(alg: string, key: BinaryLike, iv: BinaryLike): GcmCipher {
  return new GcmCipher(alg, key, iv, true)
}

/* ───────────── ECDH (P-256) ───────────── */

class Ecdh {
  #secret: Uint8Array | null = null
  generateKeys(enc?: string): Buffer | string {
    this.#secret = p256.utils.randomSecretKey()
    return this.getPublicKey(enc)
  }
  getPublicKey(enc?: string, format?: 'compressed' | 'uncompressed'): Buffer | string {
    if (!this.#secret) throw new Error('Önce generateKeys çağrılmalı')
    return out(p256.getPublicKey(this.#secret, format === 'compressed'), enc)
  }
  getPrivateKey(enc?: string): Buffer | string {
    if (!this.#secret) throw new Error('Önce generateKeys çağrılmalı')
    return out(this.#secret, enc)
  }
  setPrivateKey(key: BinaryLike, enc?: string): void {
    this.#secret = Uint8Array.from(toBytes(key, enc))
  }
  computeSecret(pub: BinaryLike, inEnc?: string, outEnc?: string): Buffer | string {
    if (!this.#secret) throw new Error('Önce generateKeys çağrılmalı')
    const shared = p256.getSharedSecret(this.#secret, toBytes(pub, inEnc), true)
    return out(shared.subarray(1), outEnc)
  }
}

export function createECDH(curve: string): Ecdh {
  if (!/^(prime256v1|p-?256|secp256r1)$/i.test(curve)) throw new Error(`Desteklenmeyen eğri: ${curve}`)
  return new Ecdh()
}

export const webcrypto = globalThis.crypto
export const subtle = globalThis.crypto?.subtle
export const constants = {}
export const getHashes = (): string[] => Object.keys(HASHES)

export default {
  createHash,
  createHmac,
  hash,
  randomBytes,
  randomFillSync,
  randomUUID,
  randomInt,
  timingSafeEqual,
  scrypt,
  scryptSync,
  hkdfSync,
  pbkdf2Sync,
  createCipheriv,
  createDecipheriv,
  createECDH,
  getRandomValues,
  webcrypto,
  subtle,
  constants,
  getHashes,
}
