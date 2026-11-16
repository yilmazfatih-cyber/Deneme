/**
 * sayi_yazi — sayıyı Türkçe yazıya çevirir ("bin iki yüz otuz dört"), sıra sayısı ("dördüncü"), tutarın yazıyla
 * yazılışı (fatura/çek: "yalnız bin iki yüz otuz dört lira elli kuruş"), Türkçe sayı biçimini ayrıştırır/biçimler
 * ("1.234,56" ↔ 1234.56). `Intl`'e bağlı değildir; tarayıcıda, Node'da ve Python eşinde aynı sonucu verir.
 *
 * Kullanım:
 *   numberToWords(1234)                    // "bin iki yüz otuz dört"   ("bir bin" değil)
 *   ordinalWords(24)                       // "yirmi dördüncü"
 *   amountToWords(123450)                  // "yalnız bin iki yüz otuz dört lira elli kuruş"  (girdi KURUŞ)
 *   decimalToWords('3,05')                 // "üç virgül sıfır beş"
 *   parseNumberTr('1.234,56')              // 1234.56   ("1.23" ya da "1,234.56" → açık hata)
 *   formatNumberTr(2.675, { decimals: 2 }) // "2,68"  (yarım yukarı; toFixed'in 2,67 hatası yok)
 *
 * Sınırlar: Tam sayılar en çok 999 kentilyon (10^21 − 1). `amountToWords` kayan nokta kabul etmez: tutarı kuruş
 * cinsinden tam sayı verin (12,50 TL → 1250). `formatNumberTr` sayının en kısa ondalık yazımını (JS `String`,
 * Python `repr`) yuvarlar; bu yüzden 1.005 → "1,01" olur (insanın beklediği). `parseNumberTr` yalnız Türkçe biçimi
 * kabul eder: nokta binlik ayırıcı (üçlü gruplar), virgül ondalık; boşlukla gruplama kabul edilmez.
 *
 * Genişletme: Daha büyük basamak adı `SCALES` dizisinin sonuna eklenir (ve `MAX_GROUPS` artar). Yeni para birimi
 * `CURRENCIES`'e eklenir. Her ekleme için `vektorler/sayi_yazi.json` dosyasına örnek yazın.
 */

export class NumberFormatError extends Error {
  override name = 'NumberFormatError'
}

export interface WordsOptions {
  /** `true` → sözcükler bitişik yazılır ("binikiyüzotuzdört"); çek ve senetlerde kullanılır. */
  joined?: boolean
}

export interface AmountOptions extends WordsOptions {
  /** 'TRY' (varsayılan), 'USD', 'EUR', 'GBP' ya da { major: 'Türk lirası', minor: 'kuruş' }. */
  currency?: string | { major: string; minor: string }
  /** Başa yazılacak sözcük; varsayılan "yalnız". Boş metin verilirse yazılmaz. */
  prefix?: string
}

const ONES = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz']
const TENS = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan']
const SCALES = ['', 'bin', 'milyon', 'milyar', 'trilyon', 'katrilyon', 'kentilyon']
const MAX_GROUPS = SCALES.length
const CURRENCIES: Record<string, { major: string; minor: string }> = {
  TRY: { major: 'lira', minor: 'kuruş' },
  USD: { major: 'dolar', minor: 'sent' },
  EUR: { major: 'avro', minor: 'sent' },
  GBP: { major: 'sterlin', minor: 'peni' },
}
const VOWELS = 'aeıioöuü'
const WS = ' \t\n\r\f\v\u{a0}'

function trimWs(text: string): string {
  let start = 0
  let end = text.length
  while (start < end && WS.includes(text[start] ?? '')) start += 1
  while (end > start && WS.includes(text[end - 1] ?? '')) end -= 1
  return text.slice(start, end)
}

/** Girdiyi işaret + rakam dizisine çevirir; tam sayı değilse açıklayıcı hata verir. */
function integerDigits(value: number | bigint | string): { negative: boolean; digits: string } {
  let text: string
  if (typeof value === 'bigint') text = value.toString()
  else if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new NumberFormatError(
        `${value} tam sayı değil ya da çok büyük. Ondalık için decimalToWords, büyük sayı için bigint/metin verin.`,
      )
    }
    text = String(value)
  } else text = trimWs(value)
  const match = /^([+-]?)([0-9]+)$/.exec(text)
  if (!match) throw new NumberFormatError(`"${text}" bir tam sayı değil. Yalnız rakam (ve başta - işareti) kullanın.`)
  const digits = (match[2] ?? '').replace(/^0+(?=[0-9])/, '')
  return { negative: match[1] === '-' && digits !== '0', digits }
}

function groupWords(group: number): string[] {
  const words: string[] = []
  const hundreds = Math.floor(group / 100)
  if (hundreds === 1) words.push('yüz')
  else if (hundreds > 1) words.push(ONES[hundreds] ?? '', 'yüz')
  const tens = TENS[Math.floor(group / 10) % 10] ?? ''
  if (tens !== '') words.push(tens)
  const ones = ONES[group % 10] ?? ''
  if (ones !== '') words.push(ones)
  return words
}

function digitsToWords(digits: string): string[] {
  if (/^0*$/.test(digits)) return ['sıfır']
  const groups: number[] = []
  for (let end = digits.length; end > 0; end -= 3) groups.unshift(Number(digits.slice(Math.max(0, end - 3), end)))
  if (groups.length > MAX_GROUPS) {
    throw new NumberFormatError(`Sayı çok büyük: en çok ${MAX_GROUPS * 3} basamak (999 kentilyon) desteklenir.`)
  }
  const words: string[] = []
  groups.forEach((group, index) => {
    if (group === 0) return
    const scale = SCALES[groups.length - 1 - index] ?? ''
    if (!(scale === 'bin' && group === 1)) words.push(...groupWords(group)) // "bir bin" değil "bin"
    if (scale !== '') words.push(scale)
  })
  return words
}

/** Tam sayıyı yazıya çevirir: 1234 → "bin iki yüz otuz dört", -5 → "eksi beş", 0 → "sıfır". */
export function numberToWords(value: number | bigint | string, options: WordsOptions = {}): string {
  const { negative, digits } = integerDigits(value)
  const words = [...(negative ? ['eksi'] : []), ...digitsToWords(digits)]
  return words.join(options.joined === true ? '' : ' ')
}

/** Sıra sayısı: 1 → "birinci", 4 → "dördüncü", 40 → "kırkıncı", 1000 → "bininci". Negatif sayı hata verir. */
export function ordinalWords(value: number | bigint | string, options: WordsOptions = {}): string {
  const { negative, digits } = integerDigits(value)
  if (negative) throw new NumberFormatError('Negatif sayının sıra sayısı olmaz.')
  const base = digitsToWords(digits).join(options.joined === true ? '' : ' ')
  if (base.endsWith('dört')) return `${base.slice(0, -4)}dördüncü`
  const lastVowel =
    Array.from(base)
      .reverse()
      .find((ch) => VOWELS.includes(ch)) ?? 'i'
  const i = 'aı'.includes(lastVowel) ? 'ı' : 'ou'.includes(lastVowel) ? 'u' : 'öü'.includes(lastVowel) ? 'ü' : 'i'
  return VOWELS.includes(base.slice(-1)) ? `${base}nc${i}` : `${base}${i}nc${i}`
}

/** Türkçe biçimli sayının parçaları; biçim bozuksa yol gösteren hata verir. */
function splitTurkish(text: string, rejectAmbiguous: boolean): { sign: string; integer: string; fraction: string } {
  const trimmed = trimWs(text)
  if (trimmed === '') throw new NumberFormatError('Sayı boş olamaz.')
  const signMatch = /^[+\-\u{2212}]/u.exec(trimmed)
  const sign = signMatch && signMatch[0] !== '+' ? '-' : ''
  const body = signMatch ? trimmed.slice(signMatch[0].length) : trimmed
  if (rejectAmbiguous && /^[0-9]{1,3}[.,][0-9]{3}$/.test(body)) {
    throw new NumberFormatError(
      `"${trimmed}" belirsiz: binlik ayırıcı mı, ondalık mı anlaşılmıyor. Türkçe biçimde yazın: 1.234 (bin iki yüz otuz dört) ya da 1,234.`,
    )
  }
  if (/^[0-9]{1,3}(,[0-9]{3})+\.[0-9]+$/.test(body)) {
    throw new NumberFormatError(`"${trimmed}" İngilizce biçimde görünüyor. Türkçe biçim: 1.234,56 (virgül ondalık).`)
  }
  const match = /^([0-9]+|[0-9]{1,3}(?:\.[0-9]{3})+)(?:,([0-9]+))?$/.exec(body)
  if (!match) {
    const hint = body.includes('.')
      ? 'Nokta yalnız binlik ayırıcıdır ve üçlü grupları ayırır; ondalık için virgül kullanın (1.234,56).'
      : 'Yalnız rakam, binlik için nokta ve ondalık için tek virgül kullanın (1.234,56).'
    throw new NumberFormatError(`"${trimmed}" Türkçe sayı biçiminde değil. ${hint}`)
  }
  return { sign, integer: (match[1] ?? '').replace(/\./g, ''), fraction: match[2] ?? '' }
}

/** Ondalıklı Türkçe sayıyı yazıya çevirir: "3,05" → "üç virgül sıfır beş", "0,125" → "sıfır virgül yüz yirmi beş". */
export function decimalToWords(text: string, options: WordsOptions = {}): string {
  const { sign, integer, fraction } = splitTurkish(text, false)
  const words = digitsToWords(integer)
  if (fraction !== '') {
    words.push('virgül')
    const leadingZeros = /^0*/.exec(fraction)?.[0].length ?? 0
    for (let k = 0; k < leadingZeros; k++) words.push('sıfır')
    if (leadingZeros < fraction.length) words.push(...digitsToWords(fraction.slice(leadingZeros)))
  }
  const isZero = /^0*$/.test(integer + fraction)
  return [...(sign === '-' && !isZero ? ['eksi'] : []), ...words].join(options.joined === true ? '' : ' ')
}

/**
 * Tutarı yazıyla yazar (fatura, çek, senet). Girdi KURUŞ cinsinden tam sayıdır: 123450 → "yalnız bin iki yüz
 * otuz dört lira elli kuruş", 50 → "yalnız elli kuruş", 0 → "yalnız sıfır lira".
 */
export function amountToWords(kurus: number | bigint, options: AmountOptions = {}): string {
  if (typeof kurus === 'number' && !Number.isSafeInteger(kurus)) {
    throw new NumberFormatError(`Tutar kuruş cinsinden tam sayı olmalı (12,50 TL → 1250); verilen: ${kurus}.`)
  }
  const total = BigInt(kurus)
  if (total < 0n) throw new NumberFormatError('Tutar negatif olamaz.')
  const currency = typeof options.currency === 'object' ? options.currency : CURRENCIES[options.currency ?? 'TRY']
  if (currency === undefined) {
    throw new NumberFormatError(`Bilinmeyen para birimi: ${JSON.stringify(options.currency)}. { major, minor } verin.`)
  }
  const major = total / 100n
  const minor = total % 100n
  const words: string[] = []
  const prefix = options.prefix ?? 'yalnız'
  if (prefix !== '') words.push(prefix)
  if (major > 0n || minor === 0n) words.push(...digitsToWords(major.toString()), currency.major)
  if (minor > 0n) words.push(...digitsToWords(minor.toString()), currency.minor)
  return words.join(options.joined === true ? '' : ' ')
}

/**
 * Türkçe biçimli sayıyı ayrıştırır: "1.234,56" → 1234.56, "1.234" → 1234, "-12,5" → -12.5.
 * Bozuk ya da İngilizce biçim ("1.23", "1,234.56") açık hata verir. `rejectAmbiguous: true` iken "1.234" ve
 * "1,234" gibi iki türlü okunabilen girdiler de reddedilir (kaynağı belirsiz veri içe aktarırken kullanın).
 */
export function parseNumberTr(text: string, options: { rejectAmbiguous?: boolean } = {}): number {
  const { sign, integer, fraction } = splitTurkish(text, options.rejectAmbiguous === true)
  const value = Number(`${sign}${integer}${fraction === '' ? '' : `.${fraction}`}`)
  return Object.is(value, -0) ? 0 : value
}

/** Sayının düz ondalık yazımı (üssüz): 1e21 → "1000000000000000000000", 1e-7 → "0.0000001". */
function plainDecimal(value: number | bigint | string): { negative: boolean; integer: string; fraction: string } {
  let text: string
  if (typeof value === 'bigint') text = value.toString()
  else if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new NumberFormatError(`Sonlu bir sayı verin (verilen: ${value}).`)
    text = String(value)
  } else text = trimWs(value)
  const match = /^(-?)([0-9]+)(?:\.([0-9]+))?(?:e([+-]?[0-9]+))?$/.exec(text)
  if (!match) throw new NumberFormatError(`"${text}" bir sayı değil (metin girdide nokta ondalık ayırıcıdır).`)
  const digits = (match[2] ?? '') + (match[3] ?? '')
  const point = (match[2] ?? '').length + Number(match[4] ?? '0')
  const padded = point <= 0 ? '0'.repeat(1 - point) + digits : digits.padEnd(point, '0')
  const at = point <= 0 ? 1 : point
  const integer = padded.slice(0, at).replace(/^0+(?=[0-9])/, '')
  return { negative: match[1] === '-', integer, fraction: padded.slice(at).replace(/0+$/, '') }
}

/** Rakam dizisine 1 ekler: "199" → "200", "99" → "100". */
function incrementDigits(digits: string): string {
  const chars = digits.split('')
  for (let i = chars.length - 1; i >= 0; i--) {
    if (chars[i] !== '9') {
      chars[i] = String(Number(chars[i]) + 1)
      return chars.join('')
    }
    chars[i] = '0'
  }
  return `1${chars.join('')}`
}

/**
 * Türkçe biçimler: 1234.56 → "1.234,56". `decimals` verilirse o kadar ondalığa yarım-yukarı (sıfırdan uzağa)
 * yuvarlar ve eksik sıfırları tamamlar. `grouping: false` → binlik nokta konmaz. Metin girdi "1234.5" biçiminde olur.
 */
export function formatNumberTr(
  value: number | bigint | string,
  options: { decimals?: number; grouping?: boolean } = {},
): string {
  let { negative, integer, fraction } = plainDecimal(value)
  const decimals = options.decimals
  if (decimals !== undefined) {
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 20) {
      throw new NumberFormatError('decimals 0 ile 20 arasında bir tam sayı olmalı.')
    }
    if (fraction.length > decimals) {
      const roundUp = (fraction[decimals] ?? '0') >= '5'
      const kept = integer + fraction.slice(0, decimals)
      const rounded = roundUp ? incrementDigits(kept) : kept
      integer = rounded.slice(0, rounded.length - decimals)
      fraction = rounded.slice(rounded.length - decimals)
    }
    fraction = fraction.padEnd(decimals, '0')
  }
  if (integer === '') integer = '0'
  if (/^0*$/.test(integer + fraction)) negative = false
  const grouped = options.grouping === false ? integer : integer.replace(/\B(?=([0-9]{3})+(?![0-9]))/g, '.')
  return `${negative ? '-' : ''}${grouped}${fraction === '' ? '' : `,${fraction}`}`
}
