// KVKK: Dil modeline (yurt dışındaki bir API'ye) gönderilecek metinlerden kişisel verileri maskeler.
// Maskeleme geri alınabilir: yer tutucu → asıl değer eşlemesi sunucuda kalır, modelin yanıtına yerel olarak geri konur.

export type MaskResult = { text: string; map: Record<string, string>; counts: Record<string, number> }

export function isValidTckn(s: string): boolean {
  if (!/^[1-9]\d{10}$/.test(s)) return false
  const d = s.split('').map(Number)
  const odd = d[0]! + d[2]! + d[4]! + d[6]! + d[8]!
  const even = d[1]! + d[3]! + d[5]! + d[7]!
  const d10 = (((odd * 7 - even) % 10) + 10) % 10
  const d11 = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10
  return d[9] === d10 && d[10] === d11
}

export function isValidIban(raw: string): boolean {
  const s = raw.replace(/\s+/g, '').toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false
  if (s.startsWith('TR') && s.length !== 26) return false
  const rearranged = s.slice(4) + s.slice(0, 4)
  let rem = 0
  for (const ch of rearranged) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55)
    for (const digit of v) rem = (rem * 10 + Number(digit)) % 97
  }
  return rem === 1
}

function luhn(digits: string): boolean {
  let total = 0
  let alt = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i])
    if (alt) {
      n *= 2
      if (n > 9) n -= 9
    }
    total += n
    alt = !alt
  }
  return total % 10 === 0
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const GROUPS = ['aAâÂ', 'cCçÇ', 'gGğĞ', 'iIıİîÎ', 'oOöÖ', 'sSşŞ', 'uUüÜûÛ']

/** Ad için Türkçe harf farklarına duyarsız desen: "Ayşe" → "Ayse", "AYŞE", "ayşe" ile eşleşir. */
function namePattern(name: string): string {
  let out = ''
  for (const ch of name) {
    const group = GROUPS.find((g) => g.includes(ch))
    if (group) out += `[${group}]`
    else if (/\p{L}/u.test(ch))
      out += `[${escapeRe(ch.toLocaleLowerCase('tr-TR'))}${escapeRe(ch.toLocaleUpperCase('tr-TR'))}]`
    else if (/\s/.test(ch)) out += '\\s+'
    else out += escapeRe(ch)
  }
  return out
}

/**
 * Metindeki T.C. kimlik no, IBAN, kart no, telefon, e-posta ve verilen kişi adlarını yer tutucuyla değiştirir.
 * `names`: bilinen kişi adları (gönderen, daire sakinleri) — tam ad ve soyad ayrı ayrı aranır.
 */
export function maskPII(input: string, opts: { names?: string[] } = {}): MaskResult {
  const map: Record<string, string> = {}
  const counts: Record<string, number> = {}
  const seen = new Map<string, string>()
  let text = input

  const put = (kind: string, value: string) => {
    const key = `${kind}:${value}`
    const existing = seen.get(key)
    if (existing) return existing
    counts[kind] = (counts[kind] ?? 0) + 1
    const token = `[${kind}_${counts[kind]}]`
    map[token] = value
    seen.set(key, token)
    return token
  }

  // IBAN (boşluklu da olabilir)
  text = text.replace(/\bTR\d{2}(?:\s?[0-9A-Z]{4}){5}\s?[0-9A-Z]{2}\b/gi, (m) => (isValidIban(m) ? put('IBAN', m) : m))
  // Kart numarası (13–19 hane, boşluk/tire ile gruplanmış olabilir)
  text = text.replace(/\b(?:\d[ -]?){13,19}\b/g, (m) => {
    const digits = m.replace(/\D/g, '')
    return digits.length >= 13 && digits.length <= 19 && luhn(digits) && !isValidTckn(digits) ? put('KART', m) : m
  })
  // T.C. kimlik numarası
  text = text.replace(/\b[1-9]\d{10}\b/g, (m) => (isValidTckn(m) ? put('TCKN', m) : m))
  // E-posta
  text = text.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, (m) => put('EPOSTA', m))
  // Telefon: +90 / 0 ile başlayan 10 haneli Türkiye numaraları
  text = text.replace(/(?:\+90|0090|\b0)?[\s(-]*[2-5]\d{2}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}\b/g, (m) => {
    const digits = m.replace(/\D/g, '').replace(/^(0090|90|0)/, '')
    return digits.length === 10 ? put('TELEFON', m.trim()) : m
  })
  // Bilinen adlar: önce tam adlar, sonra 3+ harfli tek parçalar (ad veya soyad)
  const names = [...new Set((opts.names ?? []).map((n) => n.trim()).filter((n) => n.length >= 3))]
  const parts = new Set<string>()
  for (const n of names) for (const p of n.split(/\s+/)) if (p.length >= 3) parts.add(p)
  const candidates = [...names, ...parts].sort((a, b) => b.length - a.length)
  for (const name of candidates) {
    const re = new RegExp(`(?<![\\p{L}\\[_])${namePattern(name)}(?![\\p{L}\\]])`, 'gu')
    text = text.replace(re, (m) => put('KISI', m))
  }
  return { text, map, counts }
}

/** Yer tutucuları asıl değerlerle değiştirir. Model yeni bir yer tutucu uydurduysa olduğu gibi kalır. */
export function unmask(text: string, map: Record<string, string>): string {
  return text.replace(/\[(?:IBAN|KART|TCKN|EPOSTA|TELEFON|KISI)_\d+\]/g, (t) => map[t] ?? t)
}

export function maskedTotal(counts: Record<string, number>): number {
  return Object.values(counts).reduce((a, b) => a + b, 0)
}
