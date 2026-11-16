/**
 * maske — kişisel veriyi GÖSTERİMDE maskeler: TCKN "123******01", e-posta "a***@ornek.com", IBAN "TR** **** … 1326",
 * telefon "+90 532 *** ** 67", kart "**** **** **** 1111", ad "A*** Y***".
 *
 * Kullanım:
 *   maskTckn('12345678901')                  // "123******01"
 *   maskEmail('ali.veli@ornek.com')          // "a***@ornek.com"
 *   maskIban('TR330006100519786457841326')   // "TR** **** … 1326"   ({ style: 'full' } → "TR** **** … **13 26")
 *   maskCardNumber('4111 1111 1111 1111')    // "**** **** **** 1111"
 *   maskMiddle('ABC-12345', { keepStart: 1, keepEnd: 2 })   // "A**-***45" (ayırıcılar korunur)
 *
 * Sınırlar: Maskeleme yalnız görüntü içindir; veriyi korumaz. Gerçek veriyi istemciye hiç göndermemek ya da
 * şifrelemek ayrı bir iştir. E-posta ve adda uzunluk sızmasın diye yıldız sayısı sabittir (***). Çok kısa değerler
 * (açık bırakılacak hane sayısı kadar ya da daha kısa) tümüyle maskelenir. Biçimi bozuk girdi de güvenli tarafta
 * kalır: tanınmayan değer genel kurala göre (baş ve sondan birkaç hane açık) maskelenir.
 *
 * Genişletme: Yeni veri türü için `maskMiddle` üstüne kurulu küçük bir işlev yazın ve `vektorler/maske.json`
 * dosyasına örnek ekleyin.
 */

export interface MaskOptions {
  /** Baştan açık bırakılacak harf/rakam sayısı. */
  keepStart?: number
  /** Sondan açık bırakılacak harf/rakam sayısı. */
  keepEnd?: number
  /** Maske karakteri (varsayılan "*"). */
  char?: string
}

function isAlnum(ch: string): boolean {
  return /^[\p{L}\p{N}]$/u.test(ch)
}

/**
 * Harf ve rakamları maskeler, ayırıcıları (boşluk, tire, nokta, @) korur. Baştan `keepStart`, sondan `keepEnd`
 * harf/rakam açık kalır. Açık kalacak sayı, toplam harf/rakam sayısına eşit ya da büyükse HEPSİ maskelenir.
 */
export function maskMiddle(text: string, options: MaskOptions = {}): string {
  const keepStart = options.keepStart ?? 0
  const keepEnd = options.keepEnd ?? 0
  const char = options.char ?? '*'
  const chars = Array.from(text)
  const total = chars.filter(isAlnum).length
  const reveal = keepStart + keepEnd < total
  let seen = 0
  return chars
    .map((ch) => {
      if (!isAlnum(ch)) return ch
      seen += 1
      const visible = reveal && (seen <= keepStart || seen > total - keepEnd)
      return visible ? ch : char
    })
    .join('')
}

/** TCKN: ilk 3 ve son 2 hane açık → "123******01". 11 hane değilse yalnız son 2 hane açık kalır. */
export function maskTckn(value: string): string {
  const text = value.replace(/\s+/g, '')
  return /^[0-9]{11}$/.test(text) ? maskMiddle(text, { keepStart: 3, keepEnd: 2 }) : maskMiddle(text, { keepEnd: 2 })
}

/** VKN: ilk 2 ve son 2 hane açık → "12******90". */
export function maskVkn(value: string): string {
  const text = value.replace(/\s+/g, '')
  return /^[0-9]{10}$/.test(text) ? maskMiddle(text, { keepStart: 2, keepEnd: 2 }) : maskMiddle(text, { keepEnd: 2 })
}

/**
 * E-posta: yerel kısmın ilk harfi + "***" → "a***@ornek.com". `maskDomain: true` → "a***@o***.com" (yalnız uzantı açık).
 * "@" yoksa "***" döner.
 */
export function maskEmail(value: string, options: { maskDomain?: boolean } = {}): string {
  const text = value.trim()
  const at = text.lastIndexOf('@')
  if (at <= 0) return '***'
  const first = Array.from(text.slice(0, at))[0] ?? ''
  let domain = text.slice(at + 1)
  if (options.maskDomain === true) {
    const dot = domain.lastIndexOf('.')
    domain = dot > 0 ? `${Array.from(domain)[0] ?? ''}***${domain.slice(dot)}` : '***'
  }
  return `${first}***@${domain}`
}

/**
 * IBAN: ülke kodu ve son 4 hane açık. 'compact' (varsayılan) → "TR** **** … 1326";
 * 'full' → uzunluğu koruyarak "TR** **** **** **** **** **13 26".
 */
export function maskIban(value: string, options: { style?: 'compact' | 'full' } = {}): string {
  const iban = value.replace(/[\s-]+/g, '').toUpperCase() // harf: IBAN ASCII
  if (iban.length < 8) return '****'
  if ((options.style ?? 'compact') === 'compact') return `${iban.slice(0, 2)}** **** … ${iban.slice(-4)}`
  const masked = iban.slice(0, 2) + '*'.repeat(iban.length - 6) + iban.slice(-4)
  return masked.replace(/(.{4})(?=.)/g, '$1 ')
}

/** Telefon: TR numarasında operatör/alan kodu ve son 2 hane açık → "+90 532 *** ** 67". */
export function maskPhone(value: string): string {
  const digits = value.replace(/[^0-9]/g, '')
  let nsn: string | null = null
  if (digits.length === 12 && digits.startsWith('90')) nsn = digits.slice(2)
  else if (digits.length === 11 && digits.startsWith('0')) nsn = digits.slice(1)
  else if (digits.length === 10) nsn = digits
  if (nsn === null) return maskMiddle(value, { keepStart: 2, keepEnd: 2 })
  return `+90 ${nsn.slice(0, 3)} *** ** ${nsn.slice(8)}`
}

/** Kart numarası: yalnız son 4 hane açık; sağdan 4'lü gruplanır → "**** **** **** 1111". */
export function maskCardNumber(value: string): string {
  const digits = value.replace(/[^0-9]/g, '')
  if (digits.length < 8) return '****'
  const masked = '*'.repeat(digits.length - 4) + digits.slice(-4)
  const groups: string[] = []
  for (let end = masked.length; end > 0; end -= 4) groups.unshift(masked.slice(Math.max(0, end - 4), end))
  return groups.join(' ')
}

/** Ad soyad: her sözcüğün ilk harfi + "***" → "A*** Y***". */
export function maskName(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '')
    .map((word) => `${Array.from(word)[0] ?? ''}***`)
    .join(' ')
}
