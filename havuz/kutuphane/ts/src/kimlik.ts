/**
 * kimlik — kimlik (ID) üretimi: UUIDv7 (zamana göre sıralı, RFC 9562; veritabanı birincil anahtarı için ideal),
 * kısa rastgele kimlik (URL güvenli, sapmasız), insanın okuyup yazabileceği kod (Crockford Base32, isteğe bağlı
 * sağlama karakteri; "0/O" ve "1/I/L" karışmaz).
 *
 * Kullanım:
 *   uuidv7()                                  // "019a8c5e-3f2b-7c41-9d2e-5b7a1c3e9f04" (zaman sıralı)
 *   uuidv7Timestamp(id)                       // oluşturulma anı (ms)
 *   shortId()                                 // "V1StGXR8_Z5jdHi6B-myT" (21 karakter, ~126 bit)
 *   readableCode(8, { check: true })          // "7K3M-9QPX-R" → telefonda okunabilir
 *   validateReadableCode('7k3m 9qpx r')       // true (küçük harf, boşluk, O→0, I/L→1 düzeltilir)
 *
 * Rastgelelik `crypto.getRandomValues` (kriptografik) ile gelir; testte `randomBytes` verilebilir.
 * UUIDv7 üreteci aynı milisaniyede bile artan sırada üretir (74 bitlik sayaç); saat geri giderse son zamandan
 * devam eder.
 *
 * Sınırlar: UUIDv7 oluşturulma zamanını açığa vurur; zamanın gizli kalması gerekiyorsa shortId kullanın.
 * Okunaklı kod 8 karakterde 40 bittir: tahmin edilemezlik için yeterli ama kaba kuvvete karşı sınırlama
 * (hiz_siniri) gerekir. Sıralama garantisi tek üreteç (tek süreç) içindir.
 *
 * Genişletme: Yeni kimlik biçimi aynı `randomBytes` parametresini alan bir işlev olarak eklenir; Python eşine
 * (kutuphane/kimlik.py) aynı algoritmayla eklenir ki aynı baytlar aynı kimliği versin (vektorler/kimlik.json).
 */

export type RandomBytes = (count: number) => Uint8Array

export const URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
export const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** crypto.getRandomValues tek çağrıda en çok 65 536 bayt verir; büyük istekler parça parça doldurulur. */
const defaultRandomBytes: RandomBytes = (count) => {
  const out = new Uint8Array(count)
  for (let offset = 0; offset < count; offset += 65_536) {
    crypto.getRandomValues(out.subarray(offset, Math.min(count, offset + 65_536)))
  }
  return out
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function formatUuid(bytes: Uint8Array): string {
  const h = hex(bytes)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

function uuidFromCounter(timestampMs: number, counter: bigint): string {
  const bytes = new Uint8Array(16)
  let ts = BigInt(timestampMs)
  for (let i = 5; i >= 0; i--) {
    bytes[i] = Number(ts & 0xffn)
    ts >>= 8n
  }
  const randA = counter >> 62n
  let randB = (counter & ((1n << 62n) - 1n)) | (0b10n << 62n)
  bytes[6] = 0x70 | Number((randA >> 8n) & 0x0fn)
  bytes[7] = Number(randA & 0xffn)
  for (let i = 15; i >= 8; i--) {
    bytes[i] = Number(randB & 0xffn)
    randB >>= 8n
  }
  return formatUuid(bytes)
}

function counterFromBytes(random: Uint8Array): bigint {
  if (random.length < 10) throw new RangeError('UUIDv7 için en az 10 rastgele bayt gerekir.')
  let counter = BigInt((((random[0] ?? 0) & 0x0f) << 8) | (random[1] ?? 0))
  counter = (counter << 6n) | BigInt((random[2] ?? 0) & 0x3f)
  for (let i = 3; i < 10; i++) counter = (counter << 8n) | BigInt(random[i] ?? 0)
  return counter
}

function checkTimestamp(timestampMs: number): void {
  if (!Number.isInteger(timestampMs) || timestampMs < 0 || timestampMs >= 2 ** 48) {
    throw new RangeError(`Zaman damgası 0 ile 2^48 arasında tam sayı (ms) olmalı: ${timestampMs}.`)
  }
}

/** Belirli zaman ve 10 rastgele bayttan UUIDv7 kurar (test ve diller arası uyum için saf işlev). */
export function uuidv7FromParts(timestampMs: number, random: Uint8Array): string {
  checkTimestamp(timestampMs)
  return uuidFromCounter(timestampMs, counterFromBytes(random))
}

/** Aynı milisaniyede bile artan sırada UUIDv7 üreten üreteç. */
export class Uuidv7Generator {
  private lastMs = -1
  private counter = 0n
  private readonly now: () => number
  private readonly randomBytes: RandomBytes

  constructor(options: { now?: () => number; randomBytes?: RandomBytes } = {}) {
    this.now = options.now ?? (() => Date.now())
    this.randomBytes = options.randomBytes ?? defaultRandomBytes
  }

  next(): string {
    const ms = this.now()
    checkTimestamp(ms)
    if (ms > this.lastMs) {
      this.lastMs = ms
      this.counter = counterFromBytes(this.randomBytes(10))
    } else {
      this.counter += 1n // aynı ms ya da saat geri gitti: son zamandan sayaçla devam
      if (this.counter >= 1n << 74n) {
        this.lastMs += 1
        this.counter = counterFromBytes(this.randomBytes(10))
      }
    }
    return uuidFromCounter(this.lastMs, this.counter)
  }
}

const defaultGenerator = new Uuidv7Generator()

/** Zaman sıralı UUIDv7 üretir. */
export function uuidv7(): string {
  return defaultGenerator.next()
}

/** UUID biçiminde mi? (sürüm 1–8, RFC varyantı). `version` verilirse sürüm de denetlenir. */
export function isUuid(text: string, version?: number): boolean {
  const match = /^[0-9a-f]{8}-[0-9a-f]{4}-([1-8])[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.exec(text)
  return match !== null && (version === undefined || Number(match[1]) === version)
}

/** UUIDv7'nin oluşturulma anı (Unix ms). v7 değilse hata. */
export function uuidv7Timestamp(uuid: string): number {
  if (!isUuid(uuid, 7)) throw new RangeError(`"${uuid}" bir UUIDv7 değil.`)
  return Number.parseInt(uuid.replace(/-/g, '').slice(0, 12), 16)
}

/**
 * Sapmasız rastgele kimlik: her karakter alfabeden eşit olasılıkla seçilir (maske + reddetme; nanoid yöntemi).
 * Varsayılan 21 karakter, URL güvenli 64 harfli alfabe.
 */
export function shortId(length = 21, options: { alphabet?: string; randomBytes?: RandomBytes } = {}): string {
  const alphabet = Array.from(options.alphabet ?? URL_ALPHABET)
  if (alphabet.length < 2 || alphabet.length > 256 || new Set(alphabet).size !== alphabet.length) {
    throw new RangeError('Alfabe 2–256 farklı karakterden oluşmalı.')
  }
  if (!Number.isInteger(length) || length < 1) throw new RangeError('Uzunluk 1 veya daha büyük olmalı.')
  const randomBytes = options.randomBytes ?? defaultRandomBytes
  const mask = (2 << (31 - Math.clz32((alphabet.length - 1) | 1))) - 1
  const step = Math.ceil((1.6 * mask * length) / alphabet.length)
  const chars: string[] = []
  for (;;) {
    for (const byte of randomBytes(step)) {
      const index = byte & mask
      if (index < alphabet.length) {
        chars.push(alphabet[index] ?? '')
        if (chars.length === length) return chars.join('')
      }
    }
  }
}

/** Kodu karşılaştırılabilir biçime getirir: büyük harf, boşluk/tire yok, O→0, I/L/ı/i→1. */
export function normalizeReadableCode(code: string): string {
  return code
    .replace(/[\s-]+/g, '')
    .replace(/[oO]/g, '0')
    .replace(/[iIlLıİ]/g, '1')
    .toUpperCase() // harf: Crockford alfabesi ASCII; Türkçe i/ı önce 1 yapıldı
}

/** Luhn mod 32 sağlama karakteri (Crockford alfabesinde). */
export function checkCharacter(code: string): string {
  const body = normalizeReadableCode(code)
  const n = CROCKFORD_ALPHABET.length
  let factor = 2
  let sum = 0
  for (const ch of Array.from(body).reverse()) {
    const value = CROCKFORD_ALPHABET.indexOf(ch)
    if (value < 0) throw new RangeError(`"${ch}" kod alfabesinde yok.`)
    const addend = factor * value
    factor = factor === 2 ? 1 : 2
    sum += Math.floor(addend / n) + (addend % n)
  }
  return CROCKFORD_ALPHABET[(n - (sum % n)) % n] ?? '0'
}

/** İnsanın okuyup yazacağı kod: "7K3M-9QPX". `check: true` → sonuna sağlama karakteri eklenir ("…-R"). */
export function readableCode(
  length = 8,
  options: { groupSize?: number; check?: boolean; randomBytes?: RandomBytes } = {},
): string {
  let code = shortId(length, { alphabet: CROCKFORD_ALPHABET, randomBytes: options.randomBytes })
  if (options.check === true) code += checkCharacter(code)
  const groupSize = options.groupSize ?? 4
  if (groupSize <= 0) return code
  const groups: string[] = []
  for (let i = 0; i < code.length; i += groupSize) groups.push(code.slice(i, i + groupSize))
  return groups.join('-')
}

/** Kodu doğrular (yazım farklarını düzelterek). Varsayılan: son karakter sağlama karakteridir. */
export function validateReadableCode(code: string, options: { check?: boolean } = {}): boolean {
  const normalized = normalizeReadableCode(code)
  if (normalized === '' || Array.from(normalized).some((ch) => !CROCKFORD_ALPHABET.includes(ch))) return false
  if (options.check === false) return true
  return normalized.length >= 2 && checkCharacter(normalized.slice(0, -1)) === normalized.slice(-1)
}
