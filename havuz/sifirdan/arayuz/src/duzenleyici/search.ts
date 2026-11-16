// Bul / değiştir: düz metin ya da düzenli ifade; büyük/küçük harf duyarlı ya da Türkçe kurala göre duyarsız;
// tam kelime seçeneği. Türkçe duyarsızlık JS'nin `i` bayrağıyla yapılamaz (`/i/i` "İ" ile eşleşmez, "I" ile
// eşleşir — Türkçede yanlış). Bunun yerine desen dönüştürülür: her harf, Türkçe büyük/küçük biçimlerini içeren
// bir karakter sınıfına çevrilir: "i" → [iİ], "ı" → [ıI], "a" → [aA]. Kaçış dizileri (\d, ç, \p{L}),
// adlı gruplar ve sayısal niceleyiciler dokunulmadan kopyalanır. Düz metin de önce kaçışlanıp aynı yoldan geçer.
// Genişletme: "aksan duyarsız" (ç → c) arama için `caseVariants`'a eşdeğer harf tablosu eklenebilir.

export interface SearchQuery {
  text: string
  regex?: boolean
  caseSensitive?: boolean
  wholeWord?: boolean
}

export interface Match {
  from: number
  to: number
  groups: string[]
  named: Record<string, string>
}

export class SearchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SearchError'
  }
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&')
}

/** Harfin Türkçe büyük/küçük biçimleri (tek kod noktası olanlar). */
export function caseVariants(ch: string): string[] {
  const out = new Set([ch])
  for (const v of [ch.toLocaleUpperCase('tr-TR'), ch.toLocaleLowerCase('tr-TR')]) if ([...v].length === 1) out.add(v)
  return [...out]
}

function classEscape(ch: string): string {
  return /[\\\]^-]/.test(ch) ? `\\${ch}` : ch
}

/** Kaçış dizisini (ters bölü dahil) olduğu gibi okur; uzunluğunu döndürür. */
function escapeLength(source: string, i: number): number {
  const next = source[i + 1] ?? ''
  if ((next === 'u' || next === 'p' || next === 'P') && source[i + 2] === '{') return source.indexOf('}', i) - i + 1
  if (next === 'u') return 6
  if (next === 'x') return 4
  if (next === 'c') return 3
  if (next === 'k' && source[i + 2] === '<') return source.indexOf('>', i) - i + 1
  return 1 + ([...source.slice(i + 1, i + 3)][0]?.length ?? 0)
}

/** Düzenli ifade kaynağını Türkçe büyük/küçük harf duyarsız hâle getirir (u kipi için). */
export function turkishCaseInsensitive(source: string): string {
  let out = ''
  let i = 0
  let inClass = false
  let classExtras = ''
  while (i < source.length) {
    const ch = String.fromCodePoint(source.codePointAt(i) as number)
    if (ch === '\\') {
      const length = Math.max(2, escapeLength(source, i))
      out += source.slice(i, i + length)
      i += length
      continue
    }
    if (!inClass && ch === '(' && source[i + 1] === '?') {
      const named = source[i + 2] === '<' && source[i + 3] !== '=' && source[i + 3] !== '!'
      const end = named ? source.indexOf('>', i) + 1 : i + (source[i + 2] === '<' ? 4 : 3)
      out += source.slice(i, end)
      i = end
      continue
    }
    if (!inClass && ch === '{') {
      const end = source.indexOf('}', i)
      if (end > i && /^\{\d*(,\d*)?\}$/.test(source.slice(i, end + 1))) {
        out += source.slice(i, end + 1)
        i = end + 1
        continue
      }
    }
    if (ch === '[' && !inClass) {
      inClass = true
      classExtras = ''
      out += source[i + 1] === '^' ? '[^' : '['
      i += source[i + 1] === '^' ? 2 : 1
      continue
    }
    if (ch === ']' && inClass) {
      inClass = false
      out += `${classExtras}]`
      i++
      continue
    }
    if (
      inClass &&
      source[i + ch.length] === '-' &&
      source[i + ch.length + 1] !== ']' &&
      source[i + ch.length + 1] !== undefined
    ) {
      const endChar = String.fromCodePoint(source.codePointAt(i + ch.length + 1) as number)
      const lo = ch.codePointAt(0) as number
      const hi = endChar.codePointAt(0) as number
      out += `${ch}-${endChar}`
      if (hi - lo <= 256) {
        for (let c = lo; c <= hi; c++) {
          for (const v of caseVariants(String.fromCodePoint(c)))
            if (v.codePointAt(0)! < lo || v.codePointAt(0)! > hi) classExtras += classEscape(v)
        }
      }
      i += ch.length + 1 + endChar.length
      continue
    }
    const variants = /\p{L}/u.test(ch) ? caseVariants(ch) : [ch]
    if (inClass) {
      out += ch
      classExtras += variants
        .filter((v) => v !== ch)
        .map(classEscape)
        .join('')
    } else out += variants.length > 1 ? `[${variants.map(classEscape).join('')}]` : ch
    i += ch.length
  }
  return out
}

/** Sorguyu derlenmiş düzenli ifadeye çevirir; geçersizse Türkçe açıklamalı SearchError atar. */
export function buildRegExp(query: SearchQuery): RegExp {
  let source = query.regex ? query.text : escapeRegExp(query.text)
  if (!query.caseSensitive) source = turkishCaseInsensitive(source)
  if (query.wholeWord) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`
  try {
    return new RegExp(source, 'gmu')
  } catch (error) {
    throw new SearchError(`Düzenli ifade geçersiz: ${(error as Error).message}`)
  }
}

/** Tüm eşleşmeler (boş eşleşmelerde sonsuz döngüye girmeden bir sonraki karaktere geçer). */
export function findAll(text: string, query: SearchQuery, limit = 10_000): Match[] {
  if (query.text === '') return []
  const regex = buildRegExp(query)
  const out: Match[] = []
  for (let m = regex.exec(text); m !== null && out.length < limit; m = regex.exec(text)) {
    out.push({
      from: m.index,
      to: m.index + m[0].length,
      groups: [...m].map((g) => g ?? ''),
      named: { ...(m.groups ?? {}) },
    })
    if (m[0].length === 0)
      regex.lastIndex = m.index + (String.fromCodePoint(text.codePointAt(m.index) ?? 32).length || 1)
  }
  return out
}

/** Değiştirme şablonunu açar: $1…$99, $<ad>, $& (tüm eşleşme), $$ (dolar). */
export function expandReplacement(template: string, match: Match): string {
  return template.replace(/\$(\$|&|<([^>]+)>|(\d{1,2}))/g, (whole, token: string, name?: string, digits?: string) => {
    if (token === '$') return '$'
    if (token === '&') return match.groups[0] ?? ''
    if (name !== undefined) return match.named[name] ?? ''
    const index = Number(digits)
    return index > 0 && index < match.groups.length ? (match.groups[index] ?? '') : whole
  })
}
