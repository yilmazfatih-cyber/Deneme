/**
 * para — tam sayı KURUŞ temelli para tipi: biçimleme (₺1.234,56 · 1.234,56 TL), ayrıştırma, en büyük kalan
 * yöntemiyle paylaştırma (toplam her zaman tutara eşit), KDV dahil/hariç hesap, oranla dağıtım.
 * Hiçbir hesapta kayan nokta kullanılmaz: oranlar ondalık yazımlarından tam kesre çevrilir, bölmeler BigInt'le yapılır.
 *
 * Kullanım:
 *   const fiyat = parseMoney('1.234,56 TL')            // { kurus: 123456, currency: 'TRY' }
 *   formatMoney(fiyat)                                 // "₺1.234,56"   ({ style: 'code' } → "1.234,56 TL")
 *   addVat(money(10000), 20)                           // net ₺100,00 · KDV ₺20,00 · brüt ₺120,00
 *   removeVat(money(10000), 20).net                    // { kurus: 8333 }  (KDV 1667; toplam yine 10000)
 *   allocate(money(10000), [1, 1, 1]).map((m) => m.kurus)   // [3334, 3333, 3333]
 *   fromDecimal(0.1 + 0.2)                             // { kurus: 30 }  (sınırda bir kez yuvarlanır)
 *
 * Yuvarlama: varsayılan 'halfUp' (yarım kuruş sıfırdan uzağa: 0,5 → 1, -0,5 → -1; VUK uygulaması). Ayrıca
 * 'halfEven' (bankacı), 'down' (sıfıra doğru), 'up' (sıfırdan uzağa).
 *
 * Sınırlar: Tutarlar Number.MAX_SAFE_INTEGER kuruşu (~90 trilyon TL) aşamaz; aşarsa hata. Döviz çevirimi yok.
 * Kuruştan küçük birim (ör. akaryakıt fiyatında 3 ondalık) için bu tip uygun değildir. KDV satır satır mı
 * toplamda mı hesaplanacağı işletmenin kuralıdır: satır bazında `addVat` uygulayıp `sumMoney` ile toplayın.
 *
 * Genişletme: Yeni para birimi `SYMBOLS`'e (simge, kod) eklenir. Yeni işlem Money alıp yeni Money döndüren saf
 * bir işlev olarak yazılır. Her ekleme için `vektorler/para.json` dosyasına örnek yazın.
 */

export interface Money {
  readonly kurus: number
  readonly currency: string
}

export interface VatBreakdown {
  net: Money
  vat: Money
  gross: Money
}

export type Rounding = 'halfUp' | 'halfEven' | 'down' | 'up'

export class MoneyError extends Error {
  override name = 'MoneyError'
}

/** Para birimi → [simge, yazıda kullanılan kod]. */
const SYMBOLS: Record<string, readonly [string, string]> = {
  TRY: ['₺', 'TL'],
  USD: ['$', 'USD'],
  EUR: ['€', 'EUR'],
  GBP: ['£', 'GBP'],
}
/** Metinde para birimini belirten simge ya da kod (harfe bitişik olmayan): "TL", "₺", "usd"… */
const CURRENCY_TOKENS: readonly (readonly [RegExp, string])[] = [
  [/₺|(?<![A-Za-z])(?:TRY|TL)(?![A-Za-z])/i, 'TRY'],
  [/\$|(?<![A-Za-z])USD(?![A-Za-z])/i, 'USD'],
  [/€|(?<![A-Za-z])EUR(?![A-Za-z])/i, 'EUR'],
  [/£|(?<![A-Za-z])GBP(?![A-Za-z])/i, 'GBP'],
]

function checkSafe(kurus: bigint): number {
  if (kurus > BigInt(Number.MAX_SAFE_INTEGER) || kurus < -BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new MoneyError('Tutar çok büyük: en çok 90 trilyon TL (Number.MAX_SAFE_INTEGER kuruş) desteklenir.')
  }
  return Number(kurus)
}

/** Kuruş cinsinden tam sayıdan para oluşturur: money(123456) → ₺1.234,56. */
export function money(kurus: number, currency = 'TRY'): Money {
  if (!Number.isSafeInteger(kurus)) {
    throw new MoneyError(`Kuruş tam sayı olmalı (12,50 TL → 1250); verilen: ${kurus}. Ondalık için fromDecimal.`)
  }
  if (!/^[A-Z]{3}$/.test(currency))
    throw new MoneyError(`Para birimi üç büyük harfli kod olmalı (TRY); verilen: ${currency}.`)
  return Object.freeze({ kurus: kurus === 0 ? 0 : kurus, currency })
}

/** Ondalık sayıyı tam kesre çevirir: 0.1 → [1n, 10n], "7.5" → [75n, 10n], 1e-7 → [1n, 10000000n]. */
function toRational(value: number | string): readonly [bigint, bigint] {
  const text = typeof value === 'number' ? String(value) : value.trim()
  if (typeof value === 'number' && !Number.isFinite(value)) throw new MoneyError(`Sonlu bir sayı verin: ${value}.`)
  const match = /^([+-]?)([0-9]+)(?:\.([0-9]*))?(?:e([+-]?[0-9]+))?$/i.exec(text)
  if (!match) throw new MoneyError(`"${text}" bir ondalık sayı değil (nokta ondalık ayırıcıdır: "7.5").`)
  const fraction = match[3] ?? ''
  const exponent = Number(match[4] ?? '0') - fraction.length
  let numerator = BigInt((match[2] ?? '0') + fraction)
  let denominator = 1n
  if (exponent >= 0) numerator *= 10n ** BigInt(exponent)
  else denominator = 10n ** BigInt(-exponent)
  return [match[1] === '-' ? -numerator : numerator, denominator]
}

/** n / d bölümünü (d > 0) seçilen kurala göre tam sayıya yuvarlar. */
function divideRound(n: bigint, d: bigint, rounding: Rounding): bigint {
  const negative = n < 0n
  const a = negative ? -n : n
  let q = a / d
  const r = a % d
  if (rounding === 'up' && r > 0n) q += 1n
  else if (rounding === 'halfUp' && 2n * r >= d) q += 1n
  else if (rounding === 'halfEven' && (2n * r > d || (2n * r === d && q % 2n === 1n))) q += 1n
  return negative ? -q : q
}

/** Ondalık tutardan (sayı ya da "1234.567" metni) para; kuruşa bir kez yuvarlanır: fromDecimal(12.345) → 1235 kuruş. */
export function fromDecimal(value: number | string, currency = 'TRY', rounding: Rounding = 'halfUp'): Money {
  const [n, d] = toRational(value)
  return money(checkSafe(divideRound(n * 100n, d, rounding)), currency)
}

/** Paranın ondalık metni (veritabanı/JSON için): ₺1.234,56 → "1234.56", -₺0,05 → "-0.05". */
export function toDecimalString(m: Money): string {
  const abs = Math.abs(m.kurus)
  return `${m.kurus < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/**
 * Türkçe yazılmış tutarı ayrıştırır: "₺1.234,56", "1.234,56 TL", "-12,5", "1.234 TL" (= 1234 TL).
 * Para birimi metinde yoksa `currency` (varsayılan TRY) kullanılır; ikisi çelişirse hata verir.
 */
export function parseMoney(text: string, currency?: string): Money {
  let rest = text.trim()
  let detected: string | undefined
  for (const [pattern, code] of CURRENCY_TOKENS) {
    if (pattern.test(rest)) {
      if (detected !== undefined) throw new MoneyError(`"${text}" içinde birden çok para birimi var.`)
      detected = code
      rest = rest.replace(pattern, ' ')
    }
  }
  if (detected !== undefined && currency !== undefined && detected !== currency) {
    throw new MoneyError(`"${text}" ${detected} tutarı; beklenen para birimi ${currency}.`)
  }
  rest = rest.replace(/[ \u{a0}\u{202f}]+/gu, '')
  const match = /^([+\-\u{2212}]?)([0-9]+|[0-9]{1,3}(?:\.[0-9]{3})+)(?:,([0-9]{1,2}))?$/u.exec(rest)
  if (!match) {
    const hint = /,[0-9]{3,}$/.test(rest)
      ? 'Kuruştan küçük basamak olamaz (en çok 2 ondalık).'
      : 'Türkçe biçimde yazın: 1.234,56 (nokta binlik, virgül ondalık).'
    throw new MoneyError(`"${text}" tutar olarak okunamadı. ${hint}`)
  }
  const kurus = BigInt((match[2] ?? '').replace(/\./g, '')) * 100n + BigInt((match[3] ?? '').padEnd(2, '0'))
  return money(checkSafe(match[1] === '' || match[1] === '+' ? kurus : -kurus), detected ?? currency ?? 'TRY')
}

/** "₺1.234,56" (symbol, varsayılan) · "1.234,56 TL" (code) · "1.234,56" (plain). Negatif: "-₺1.234,56". */
export function formatMoney(m: Money, options: { style?: 'symbol' | 'code' | 'plain' } = {}): string {
  const abs = Math.abs(m.kurus)
  const lira = String(Math.floor(abs / 100)).replace(/\B(?=([0-9]{3})+(?![0-9]))/g, '.')
  const number = `${lira},${String(abs % 100).padStart(2, '0')}`
  const sign = m.kurus < 0 ? '-' : ''
  const [symbol, code] = SYMBOLS[m.currency] ?? [undefined, m.currency]
  const style = options.style ?? 'symbol'
  if (style === 'plain') return sign + number
  if (style === 'symbol' && symbol !== undefined) return `${sign}${symbol}${number}`
  return `${sign}${number} ${code}`
}

function sameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new MoneyError(`Farklı para birimleri birlikte hesaplanamaz: ${a.currency} ve ${b.currency}.`)
  }
}

export function add(a: Money, b: Money): Money {
  sameCurrency(a, b)
  return money(checkSafe(BigInt(a.kurus) + BigInt(b.kurus)), a.currency)
}

export function subtract(a: Money, b: Money): Money {
  sameCurrency(a, b)
  return money(checkSafe(BigInt(a.kurus) - BigInt(b.kurus)), a.currency)
}

export function negate(m: Money): Money {
  return money(-m.kurus, m.currency)
}

/** -1, 0 ya da 1 döner (sıralama için). */
export function compare(a: Money, b: Money): number {
  sameCurrency(a, b)
  return Math.sign(a.kurus - b.kurus)
}

export function isZero(m: Money): boolean {
  return m.kurus === 0
}

export function isNegative(m: Money): boolean {
  return m.kurus < 0
}

/** Toplam; boş liste `currency` (varsayılan TRY) cinsinden sıfır döner. */
export function sumMoney(items: readonly Money[], currency?: string): Money {
  let total = money(0, currency ?? items[0]?.currency ?? 'TRY')
  for (const item of items) total = add(total, item)
  return total
}

/** Çarpar ve kuruşa yuvarlar: multiply(money(1999), 3) → 5997; multiply(money(1000), '0.333') → 333. */
export function multiply(m: Money, factor: number | string, rounding: Rounding = 'halfUp'): Money {
  const [n, d] = toRational(factor)
  return money(checkSafe(divideRound(BigInt(m.kurus) * n, d, rounding)), m.currency)
}

/** Yüzde: percentOf(money(10000), 18) → 1800 kuruş. */
export function percentOf(m: Money, percent: number | string, rounding: Rounding = 'halfUp'): Money {
  const [n, d] = toRational(percent)
  return money(checkSafe(divideRound(BigInt(m.kurus) * n, d * 100n, rounding)), m.currency)
}

/**
 * En büyük kalan yöntemiyle oranla paylaştırır; parçaların toplamı HER ZAMAN tutara eşittir.
 * allocate(money(10000), [1, 1, 1]) → 3334, 3333, 3333 · allocate(money(100), [70, 30]) → 70, 30.
 * Eşit kalanlarda önce listede öndeki pay artırılır. Oranlar negatif olamaz; hepsi sıfır olamaz.
 */
export function allocate(m: Money, ratios: readonly (number | string)[]): Money[] {
  if (ratios.length === 0) throw new MoneyError('En az bir oran verin.')
  const rationals = ratios.map(toRational)
  const scale = rationals.reduce((max, [, d]) => (d > max ? d : max), 1n)
  const weights = rationals.map(([n, d]) => {
    if (n < 0n) throw new MoneyError('Oranlar negatif olamaz.')
    return (n * scale) / d
  })
  const totalWeight = weights.reduce((sum, w) => sum + w, 0n)
  if (totalWeight === 0n) throw new MoneyError('Oranların toplamı sıfırdan büyük olmalı.')
  const negative = m.kurus < 0
  const amount = BigInt(Math.abs(m.kurus))
  const shares = weights.map((w) => (amount * w) / totalWeight)
  const order = weights
    .map((w, index) => ({ index, remainder: (amount * w) % totalWeight }))
    .sort((x, y) => (x.remainder === y.remainder ? x.index - y.index : x.remainder > y.remainder ? -1 : 1))
  let leftover = amount - shares.reduce((sum, s) => sum + s, 0n)
  for (const { index } of order) {
    if (leftover === 0n) break
    shares[index] = (shares[index] ?? 0n) + 1n
    leftover -= 1n
  }
  return shares.map((share) => money(Number(negative ? -share : share), m.currency))
}

/** Eşit parçalara böler: split(money(10000), 3) → 3334, 3333, 3333. */
export function split(m: Money, parts: number): Money[] {
  if (!Number.isInteger(parts) || parts < 1) throw new MoneyError('Parça sayısı 1 veya daha büyük bir tam sayı olmalı.')
  return allocate(
    m,
    Array.from({ length: parts }, () => 1),
  )
}

/** KDV hariç tutara KDV ekler: addVat(money(10000), 20) → net 10000, KDV 2000, brüt 12000. */
export function addVat(net: Money, ratePercent: number | string, rounding: Rounding = 'halfUp'): VatBreakdown {
  const [n, d] = toRational(ratePercent)
  if (n < 0n) throw new MoneyError('KDV oranı negatif olamaz.')
  const vat = money(checkSafe(divideRound(BigInt(net.kurus) * n, d * 100n, rounding)), net.currency)
  return { net, vat, gross: add(net, vat) }
}

/** KDV dahil tutardan KDV'yi ayırır; net + KDV her zaman brüte eşittir: removeVat(money(10000), 20) → 8333 + 1667. */
export function removeVat(gross: Money, ratePercent: number | string, rounding: Rounding = 'halfUp'): VatBreakdown {
  const [n, d] = toRational(ratePercent)
  if (n < 0n) throw new MoneyError('KDV oranı negatif olamaz.')
  const net = money(checkSafe(divideRound(BigInt(gross.kurus) * 100n * d, 100n * d + n, rounding)), gross.currency)
  return { net, vat: subtract(gross, net), gross }
}
