/**
 * dogrulama — Türkiye'ye özgü kimlik ve iletişim verilerinin doğrulanması: TCKN, VKN, IBAN (TR ve genel mod-97),
 * telefon (TR cep/sabit → E.164), plaka, posta kodu, kart numarası (Luhn), e-posta (pragmatik), URL.
 * Algoritmalar tanımlarından kurulmuştur; sınama için "geçerli ama uydurma" üreteçler de buradadır.
 *
 * Kullanım:
 *   validateTckn('10000000146')                   // true
 *   validateIban('TR33 0006 1005 1978 6457 8413 26')   // true (boşluklar yok sayılır)
 *   normalizePhoneTr('0 (532) 123 45 67')         // "+905321234567"   (geçersizse null)
 *   normalizePlate('34abc123')                    // "34 ABC 123"   (i → I; plakada İ yoktur)
 *   validateEmail('ayse@ornek.com.tr')            // true
 *   generateTckn(() => 0.5)                       // her çağrıda geçerli, uydurma bir TCKN
 *
 * Sınırlar: Bu işlevler yalnız BİÇİM ve SAĞLAMA hanesini denetler; numaranın gerçekten birine/bir bankaya ait
 * olduğunu söyleyemez (bunun için NVİ/GİB servisleri gerekir). VKN algoritması yaygın yayımlanmış tanımdan
 * yazıldı; resmî GİB belgesiyle karşılaştırılamadı. IBAN ülke uzunlukları tablosu SWIFT kaydından ezberden yazıldı
 * (doğrulanmadı); tabloda olmayan ülkede yalnız mod-97 ve 15–34 uzunluk denetlenir. Telefon: operatör önekleri
 * ayrıca denetlenmez (5xx cep sayılır); 444'lü numaralar desteklenmez. Plaka: yalnız sivil biçimler (34 A 1234,
 * 34 AB 123, 34 ABC 12…); resmî/diplomatik plakalar dışarıda. E-posta: tırnaklı yerel kısım ve IP adresli alan
 * reddedilir. URL: kullanıcı bilgisi (user@host) ve IPv6 reddedilir.
 *
 * Genişletme: Yeni ülke IBAN uzunluğu `IBAN_LENGTHS`'e, yeni alan kodu `AREA_CODES`'a eklenir. Her yeni doğrulayıcı
 * bir üreteç ve `vektorler/dogrulama.json` örnekleriyle gelir.
 */

export type PhoneType = 'mobile' | 'landline' | 'special'

/** İl alan kodları (İstanbul'da iki tane: 212 Avrupa, 216 Anadolu). */
const AREA_CODES = new Set(
  `212 216 222 224 226 228 232 236 242 246 248 252 256 258 262 264 266 272 274 276 282 284 286 288 312 318 322 324
  326 328 332 338 342 344 346 348 352 354 356 358 362 364 366 368 370 372 374 376 378 380 382 384 386 388 412 414
  416 422 424 426 428 432 434 436 438 442 446 452 454 456 458 462 464 466 472 474 476 478 482 484 486 488`
    .split(/\s+/)
    .filter((code) => code !== ''),
)
const SPECIAL_PREFIXES = ['850', '800', '900']

/** Ülke koduna göre IBAN uzunluğu (SWIFT IBAN kaydı; ezberden — doğrulanmadı). */
const IBAN_LENGTHS: Record<string, number> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BR: 29, BY: 28, CH: 21, CR: 22, CY: 28,
  CZ: 24, DE: 22, DK: 18, DO: 28, EE: 20, EG: 29, ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18,
  GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32,
  LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MD: 24, ME: 22, MK: 19, MR: 27, MT: 31, MU: 30, NL: 18, NO: 15, PK: 24,
  PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, SA: 24, SC: 31, SE: 24, SI: 19, SK: 24, SM: 27, ST: 25, SV: 28,
  TL: 23, TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20,
} // prettier-ignore

const PLATE_LETTERS = 'ABCDEFGHIJKLMNOPRSTUVYZ' // Ç Ğ İ Ö Ş Ü Q W X kullanılmaz
const PLATE_DIGITS: Record<number, readonly [number, number]> = { 1: [4, 5], 2: [3, 4], 3: [2, 3] }
const EMAIL_LOCAL_SPECIALS = "!#$%&'*+/=?^_`{|}~-"

function digitsOf(text: string): number[] {
  return Array.from(text, (ch) => Number(ch))
}

function isDigits(text: string, length?: number): boolean {
  return /^[0-9]+$/.test(text) && (length === undefined || text.length === length)
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m
}

// ---------------------------------------------------------------------------------------------------------------
// TCKN ve VKN
// ---------------------------------------------------------------------------------------------------------------

function tcknCheckDigits(first9: number[]): [number, number] {
  const odd = (first9[0] ?? 0) + (first9[2] ?? 0) + (first9[4] ?? 0) + (first9[6] ?? 0) + (first9[8] ?? 0)
  const even = (first9[1] ?? 0) + (first9[3] ?? 0) + (first9[5] ?? 0) + (first9[7] ?? 0)
  const d10 = mod(odd * 7 - even, 10)
  const d11 = mod(first9.reduce((sum, d) => sum + d, 0) + d10, 10)
  return [d10, d11]
}

/** T.C. Kimlik No: 11 hane, ilk hane 0 olamaz, 10. ve 11. haneler sağlama. */
export function validateTckn(value: string): boolean {
  const text = value.trim()
  if (!isDigits(text, 11) || text[0] === '0') return false
  const digits = digitsOf(text)
  const [d10, d11] = tcknCheckDigits(digits.slice(0, 9))
  return digits[9] === d10 && digits[10] === d11
}

function vknCheckDigit(first9: number[]): number {
  let sum = 0
  first9.forEach((digit, i) => {
    const tmp = (digit + 9 - i) % 10
    let v = (tmp * 2 ** (9 - i)) % 9
    if (tmp !== 0 && v === 0) v = 9
    sum += v
  })
  return (10 - (sum % 10)) % 10
}

/** Vergi Kimlik No: 10 hane, son hane sağlama (GİB algoritması; resmî belgeyle karşılaştırılmadı). */
export function validateVkn(value: string): boolean {
  const text = value.trim()
  if (!isDigits(text, 10)) return false
  const digits = digitsOf(text)
  return digits[9] === vknCheckDigit(digits.slice(0, 9))
}

// ---------------------------------------------------------------------------------------------------------------
// IBAN
// ---------------------------------------------------------------------------------------------------------------

/** Boşlukları ve tireleri atar, harfleri büyütür (ASCII): "tr33 0006…" → "TR330006…". */
export function normalizeIban(value: string): string {
  return value.replace(/[\s-]+/g, '').toUpperCase() // harf: IBAN yalnız ASCII harf içerir
}

function mod97(text: string): number {
  let remainder = 0
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    const chunk = code >= 65 ? String(code - 55) : ch // A=10 … Z=35
    for (const d of chunk) remainder = (remainder * 10 + Number(d)) % 97
  }
  return remainder
}

/** IBAN: biçim + ülke uzunluğu (tablodaysa) + ISO 13616 mod-97 sağlaması. */
export function validateIban(value: string): boolean {
  const iban = normalizeIban(value)
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) return false
  const expected = IBAN_LENGTHS[iban.slice(0, 2)]
  if (expected !== undefined && iban.length !== expected) return false
  return mod97(iban.slice(4) + iban.slice(0, 4)) === 1
}

/** Türk IBAN'ı: TR + 2 sağlama + 5 banka kodu + 1 ayrılmış hane (0) + 16 hesap no; toplam 26. */
export function validateIbanTr(value: string): boolean {
  const iban = normalizeIban(value)
  return /^TR[0-9]{7}0[0-9A-Z]{16}$/.test(iban) && validateIban(iban)
}

/** 4'lü gruplar: "TR33 0006 1005 1978 6457 8413 26". */
export function formatIban(value: string): string {
  return normalizeIban(value).replace(/(.{4})(?=.)/g, '$1 ')
}

function ibanWithCheck(country: string, bban: string): string {
  const check = 98 - mod97(`${bban}${country}00`)
  return `${country}${String(check).padStart(2, '0')}${bban}`
}

// ---------------------------------------------------------------------------------------------------------------
// Telefon
// ---------------------------------------------------------------------------------------------------------------

/** TR telefonunu E.164 biçimine çevirir: "0532 123 45 67" → "+905321234567". Geçersizse null. */
export function normalizePhoneTr(value: string): string | null {
  const text = value.trim()
  if (!/^\+?[0-9 ()./-]+$/.test(text)) return null
  const digits = text.replace(/[^0-9]/g, '')
  let nsn: string
  if (text.startsWith('+')) {
    if (!digits.startsWith('90')) return null
    nsn = digits.slice(2)
  } else if (digits.startsWith('0090')) nsn = digits.slice(4)
  else if (digits.startsWith('90') && digits.length === 12) nsn = digits.slice(2)
  else if (digits.startsWith('0') && digits.length === 11) nsn = digits.slice(1)
  else nsn = digits
  if (!isDigits(nsn, 10)) return null
  return phoneKind(nsn) === null ? null : `+90${nsn}`
}

function phoneKind(nsn: string): PhoneType | null {
  if (nsn.startsWith('5')) return 'mobile'
  if (AREA_CODES.has(nsn.slice(0, 3))) return 'landline'
  if (SPECIAL_PREFIXES.includes(nsn.slice(0, 3))) return 'special'
  return null
}

export function validatePhoneTr(value: string): boolean {
  return normalizePhoneTr(value) !== null
}

/** 'mobile' (5xx), 'landline' (il alan kodu), 'special' (0850/0800/0900) ya da geçersizse null. */
export function phoneTypeTr(value: string): PhoneType | null {
  const e164 = normalizePhoneTr(value)
  return e164 === null ? null : phoneKind(e164.slice(3))
}

/** "0532 123 45 67" ya da `international: true` ile "+90 532 123 45 67". Geçersizse null. */
export function formatPhoneTr(value: string, options: { international?: boolean } = {}): string | null {
  const e164 = normalizePhoneTr(value)
  if (e164 === null) return null
  const n = e164.slice(3)
  const body = `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6, 8)} ${n.slice(8)}`
  return options.international === true ? `+90 ${body}` : `0${body}`
}

// ---------------------------------------------------------------------------------------------------------------
// Plaka ve posta kodu
// ---------------------------------------------------------------------------------------------------------------

/** "34abc123", "34-ABC-123", "34 abc 123" → "34 ABC 123". Geçersizse null. Küçük i/ı → I (plakada İ yoktur). */
export function normalizePlate(value: string): string | null {
  const text = value
    .replace(/[\s-]+/g, '')
    .replace(/[iıİ]/g, 'I')
    .toUpperCase() // harf: plaka harfleri ASCII; i/ı/İ önce I yapıldı
  const match = /^(0[1-9]|[1-7][0-9]|8[01])([A-Z]{1,3})([0-9]{2,5})$/.exec(text)
  if (!match) return null
  const [, province = '', letters = '', number = ''] = match
  const [min, max] = PLATE_DIGITS[letters.length] ?? [0, 0]
  if (number.length < min || number.length > max) return null
  if (Array.from(letters).some((ch) => !PLATE_LETTERS.includes(ch))) return null
  return `${province} ${letters} ${number}`
}

export function validatePlate(value: string): boolean {
  return normalizePlate(value) !== null
}

/** Posta kodu: 5 hane, ilk iki hane il kodu (01–81). */
export function validatePostalCode(value: string): boolean {
  return /^(0[1-9]|[1-7][0-9]|8[01])[0-9]{3}$/.test(value.trim())
}

// ---------------------------------------------------------------------------------------------------------------
// Kart numarası (Luhn)
// ---------------------------------------------------------------------------------------------------------------

/** Luhn (mod 10) sağlaması: sağdan her ikinci hane iki katına çıkarılır. */
export function luhnCheck(digits: string): boolean {
  if (!isDigits(digits) || digits.length < 2) return false
  let sum = 0
  Array.from(digits)
    .reverse()
    .forEach((ch, i) => {
      let d = Number(ch)
      if (i % 2 === 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2
      sum += d
    })
  return sum % 10 === 0
}

/** Kart numarası: boşluk/tire atılır, 12–19 hane ve Luhn. (Kartın gerçekten var olduğunu söylemez.) */
export function validateCardNumber(value: string): boolean {
  const digits = value.replace(/[\s-]+/g, '')
  return isDigits(digits) && digits.length >= 12 && digits.length <= 19 && luhnCheck(digits)
}

// ---------------------------------------------------------------------------------------------------------------
// E-posta ve URL
// ---------------------------------------------------------------------------------------------------------------

function isAsciiAlnum(ch: string): boolean {
  return /^[A-Za-z0-9]$/.test(ch)
}

function isUnicodeAlnum(ch: string): boolean {
  return (ch.codePointAt(0) ?? 0) > 0x7f && /^[\p{L}\p{N}]$/u.test(ch)
}

function validDomain(domain: string, allowUnicode: boolean, requireTld: boolean): boolean {
  if (domain.length === 0 || Array.from(domain).length > 253) return false
  const labels = domain.split('.')
  if (requireTld && labels.length < 2) return false
  for (const label of labels) {
    const chars = Array.from(label)
    if (chars.length === 0 || chars.length > 63 || label.startsWith('-') || label.endsWith('-')) return false
    if (!chars.every((ch) => isAsciiAlnum(ch) || ch === '-' || (allowUnicode && isUnicodeAlnum(ch)))) return false
  }
  const tld = labels[labels.length - 1] ?? ''
  if (!requireTld) return true
  return tld.startsWith('xn--') || (Array.from(tld).length >= 2 && Array.from(tld).every((ch) => /\p{L}/u.test(ch)))
}

/**
 * Pragmatik e-posta denetimi: yerel@alan; yerel kısım en çok 64 karakter (harf, rakam, !#$%&'*+/=?^_`{|}~- ve
 * aralarda tek nokta), alan adı en az iki etiket ve harflerden oluşan bir uzantı. `allowUnicode: true` → "ayşe@örnek.com".
 */
export function validateEmail(value: string, options: { allowUnicode?: boolean } = {}): boolean {
  const allowUnicode = options.allowUnicode === true
  const text = value.trim()
  const at = text.lastIndexOf('@')
  if (at <= 0 || Array.from(text).length > 254) return false
  const local = text.slice(0, at)
  const domain = text.slice(at + 1)
  if (Array.from(local).length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
    return false
  }
  const localOk = Array.from(local).every(
    (ch) => isAsciiAlnum(ch) || ch === '.' || EMAIL_LOCAL_SPECIALS.includes(ch) || (allowUnicode && isUnicodeAlnum(ch)),
  )
  return localOk && validDomain(domain, allowUnicode, true)
}

/** Kenar boşluklarını atar ve alan adını küçük harfe çevirir (yerel kısma dokunmaz). */
export function normalizeEmail(value: string): string {
  const text = value.trim()
  const at = text.lastIndexOf('@')
  return at < 0 ? text : text.slice(0, at + 1) + text.slice(at + 1).toLowerCase() // harf: alan adı ASCII/IDN
}

/** Boşluk ya da denetim karakteri mi? (C0/C1 denetimleri, DEL, Unicode boşlukları, BOM) */
function isBadUrlChar(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0
  return (
    c <= 0x20 ||
    (c >= 0x7f && c <= 0xa0) ||
    c === 0x1680 ||
    (c >= 0x2000 && c <= 0x200a) ||
    c === 0x2028 ||
    c === 0x2029 ||
    c === 0x202f ||
    c === 0x205f ||
    c === 0x3000 ||
    c === 0xfeff
  )
}

/**
 * URL denetimi: şema (varsayılan http/https) + "://" + alan adı | IPv4 | localhost + isteğe bağlı kapı + yol.
 * Kullanıcı bilgisi (https://banka.com@kotu.com) ve boşluk/denetim karakteri reddedilir.
 */
export function validateUrl(
  value: string,
  options: { protocols?: readonly string[]; requireTld?: boolean; allowLocalhost?: boolean } = {},
): boolean {
  const protocols = options.protocols ?? ['http', 'https']
  if (value.length > 2048 || Array.from(value).some(isBadUrlChar)) return false
  const match = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#]*)([/?#].*)?$/.exec(value)
  if (!match) return false
  const scheme = (match[1] ?? '').toLowerCase() // harf: şema ASCII
  if (!protocols.includes(scheme)) return false
  const authority = match[2] ?? ''
  if (authority.includes('@')) return false
  const hostPort = /^(.*?)(?::([0-9]{1,5}))?$/.exec(authority)
  const host = (hostPort?.[1] ?? '').toLowerCase() // harf: alan adı
  const port = hostPort?.[2]
  if (port !== undefined && (Number(port) < 1 || Number(port) > 65535)) return false
  if (host === 'localhost') return options.allowLocalhost === true
  const ipv4 = /^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$/.exec(host)
  if (ipv4) return ipv4.slice(1).every((octet) => Number(octet) <= 255 && !/^0[0-9]/.test(octet))
  return validDomain(host, true, options.requireTld ?? true)
}

// ---------------------------------------------------------------------------------------------------------------
// Sınama için uydurma üreteçler (gerçek kişilere/hesaplara denk gelebilir; yalnız test verisi için kullanın)
// ---------------------------------------------------------------------------------------------------------------

function randomDigits(random: () => number, count: number, nonZeroFirst = false): number[] {
  return Array.from({ length: count }, (_, i) =>
    i === 0 && nonZeroFirst ? 1 + Math.min(8, Math.floor(random() * 9)) : Math.min(9, Math.floor(random() * 10)),
  )
}

/** Geçerli ama uydurma TCKN. `random` test için verilir (varsayılan Math.random). */
export function generateTckn(random: () => number = Math.random): string {
  const first9 = randomDigits(random, 9, true)
  return [...first9, ...tcknCheckDigits(first9)].join('')
}

/** Geçerli ama uydurma VKN. */
export function generateVkn(random: () => number = Math.random): string {
  const first9 = randomDigits(random, 9)
  return [...first9, vknCheckDigit(first9)].join('')
}

/** Geçerli ama uydurma TR IBAN; banka kodu verilebilir ("00061"). */
export function generateIbanTr(random: () => number = Math.random, bankCode?: string): string {
  const bank = bankCode ?? randomDigits(random, 5).join('')
  if (!isDigits(bank, 5)) throw new Error('Banka kodu 5 haneli olmalı.')
  return ibanWithCheck('TR', `${bank}0${randomDigits(random, 16).join('')}`)
}

/** Luhn'u tutan uydurma kart numarası (varsayılan 4 ile başlayan 16 hane). */
export function generateCardNumber(
  random: () => number = Math.random,
  options: { prefix?: string; length?: number } = {},
): string {
  const prefix = options.prefix ?? '4'
  const length = options.length ?? 16
  if (!isDigits(prefix) || length < 12 || length > 19 || prefix.length >= length) {
    throw new Error('prefix yalnız rakam olmalı; uzunluk 12–19 arası ve önekten uzun olmalı.')
  }
  const body = prefix + randomDigits(random, length - prefix.length - 1).join('')
  const check = [...Array(10).keys()].find((d) => luhnCheck(body + String(d))) ?? 0
  return body + String(check)
}

/** Uydurma TR cep telefonu (E.164): "+905xxxxxxxxx". */
export function generatePhoneTr(random: () => number = Math.random): string {
  return `+905${randomDigits(random, 9).join('')}`
}
