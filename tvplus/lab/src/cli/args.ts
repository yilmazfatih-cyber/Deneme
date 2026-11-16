/**
 * Komut satırı ayrıştırma: `komut alt --bayrak değer --acik-kapali`. Aynı ayrıştırıcı MCP aracındaki tek satırlık
 * komut metni için de kullanılır (tırnaklı parçalar korunur).
 */

export interface Args {
  /** Konumsal parçalar (komut ve alt komutlar) */
  _: string[]
  flags: Record<string, string | true>
}

/** Bayrak adları: Türkçe karakterler ASCII'ye indirgenir (--sıfırla = --sifirla). */
const fold = (s: string): string =>
  s
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .toLowerCase()

export function parseArgs(argv: readonly string[]): Args {
  const out: Args = { _: [], flags: {} }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--') && a.length > 2) {
      const eq = a.indexOf('=')
      if (eq > 0) {
        out.flags[fold(a.slice(2, eq))] = a.slice(eq + 1)
        continue
      }
      const key = fold(a.slice(2))
      const next = argv[i + 1]
      // Sonraki parça bayrak değilse değerdir (negatif sayılar değer sayılır)
      if (next !== undefined && (!next.startsWith('--') || /^--?\d/.test(next))) {
        out.flags[key] = next
        i++
      } else out.flags[key] = true
    } else out._.push(a)
  }
  return out
}

/** Tek satırlık komut metnini parçalara böler: boşluklar ayırır, çift/tek tırnak korur. */
export function splitCommandLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote: string | null = null
  let has = false
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null
      else cur += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
      has = true
    } else if (/\s/.test(ch)) {
      if (cur.length || has) out.push(cur)
      cur = ''
      has = false
    } else cur += ch
  }
  if (cur.length || has) out.push(cur)
  return out
}

export function flagStr(a: Args, ...names: string[]): string | undefined {
  for (const n of names) {
    const v = a.flags[n]
    if (typeof v === 'string') return v
  }
  return undefined
}
export function flagNum(a: Args, ...names: string[]): number | undefined {
  const s = flagStr(a, ...names)
  if (s === undefined) return undefined
  const n = Number(s)
  if (!Number.isFinite(n)) throw new Error(`--${names[0]} bir sayı olmalı (verilen: ${s})`)
  return n
}
export function flagBool(a: Args, ...names: string[]): boolean {
  for (const n of names) {
    const v = a.flags[n]
    if (v === true) return true
    if (typeof v === 'string') return !['hayir', 'hayır', 'false', '0', 'no'].includes(v.toLowerCase())
  }
  return false
}

/** Birden çok komut: satır sonu ya da tırnak dışındaki ';' ayırır. Boş parçalar atılır. */
export function splitBatch(text: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote: string | null = null
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null
      cur += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
      cur += ch
    } else if (ch === ';' || ch === '\n') {
      if (cur.trim()) out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}
