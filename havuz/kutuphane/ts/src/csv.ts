/**
 * csv — RFC 4180 CSV ayrıştırıcı ve yazıcı; Türkçe Excel uyumu (";" ayırıcı, ondalık virgül, UTF-8 BOM, CRLF),
 * formül enjeksiyonuna karşı koruma, parça parça (akışla) ayrıştırma.
 *
 * Kullanım:
 *   parseCsv('ad;yaş\r\nAyşe;30')                    // [['ad','yaş'],['Ayşe','30']]  (ayırıcı kendiliğinden bulunur)
 *   parseCsvObjects('ad,yaş\nAli,40')                // [{ ad: 'Ali', yaş: '40' }]
 *   toExcelCsv([['Ürün', 'Fiyat'], ['Çay', 12.5]])    // "\ufeffÜrün;Fiyat\r\nÇay;12,5\r\n"  (Excel TR doğrudan açar)
 *   const p = new CsvParser(); p.push(parca1); p.push(parca2); p.end()   // akış: tam satırları döndürür
 *   for await (const satir of parseCsvStream(dosya.stream().pipeThrough(new TextDecoderStream()))) { … }
 *
 * Kurallar: Alan çift tırnakla başlıyorsa tırnaklıdır; içinde "" bir tırnaktır; ayırıcı ve satır sonu tırnak
 * içinde veri sayılır. Satır sonu CRLF, LF ya da CR olabilir. Baştaki BOM atılır. Boş satırlar varsayılan olarak
 * atlanır. Kapanmamış tırnak her zaman hata verir (veri kaybını önlemek için). `strict: true` iken tırnaksız alanda
 * tırnak ve kapanış tırnağından sonra karakter de hata verir; aksi hâlde Excel gibi olduğu gibi alınır.
 * Yazarken: ayırıcı, tırnak, satır sonu ya da baş/son boşluk içeren alan tırnaklanır. `escapeFormulas` → = + - @
 * ile başlayan METİN hücrelerinin başına ' konur (CSV/formül enjeksiyonu; OWASP).
 *
 * Sınırlar: Tür dönüşümü yapılmaz; her alan metindir (sayı için sayi_yazi.parseNumberTr). Ayırıcı kendiliğinden
 * bulunurken yalnız İLK satıra bakılır (",", ";", sekme, "|"). Excel'in kendi biçimi (xlsx) desteklenmez.
 *
 * Genişletme: Yeni seçenek `CsvOptions`'a eklenir, `CsvParser.consume` içinde tek yerde uygulanır; Python eşine
 * (kutuphane/csv.py) aynı adla eklenir ve `vektorler/csv.json`'a örnek yazılır.
 */

export class CsvError extends Error {
  override name = 'CsvError'
}

export interface CsvOptions {
  /** Ayırıcı ya da 'auto' (varsayılan; ilk satırdan bulunur). */
  delimiter?: string
  /** Boş satırlar atlansın mı? (varsayılan true) */
  skipEmptyLines?: boolean
  /** Bozuk tırnak kullanımında hata verilsin mi? (varsayılan false) */
  strict?: boolean
}

export type CsvCell = string | number | bigint | boolean | null | undefined | Date

export interface CsvWriteOptions {
  delimiter?: string
  lineEnding?: string
  bom?: boolean
  quoteAll?: boolean
  escapeFormulas?: boolean
  /** Sayılarda ondalık ayırıcı virgül olsun (Türkçe Excel). */
  decimalComma?: boolean
}

const CANDIDATES = [',', ';', '\t', '|']

/** İlk satırda (tırnak dışında) en çok geçen ayırıcıyı bulur; eşitlikte , ; sekme | sırası, hiç yoksa ",". */
export function detectDelimiter(text: string): string {
  const counts = new Map<string, number>(CANDIDATES.map((c) => [c, 0]))
  let inQuotes = false
  for (const ch of text.replace(/^\u{feff}/u, '')) {
    if (ch === '"') inQuotes = !inQuotes
    else if (!inQuotes && (ch === '\n' || ch === '\r')) break
    else if (!inQuotes && counts.has(ch)) counts.set(ch, (counts.get(ch) ?? 0) + 1)
  }
  let best = ','
  let bestCount = 0
  for (const candidate of CANDIDATES) {
    const count = counts.get(candidate) ?? 0
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return best
}

/** Parça parça CSV ayrıştırıcı: `push` tamamlanan satırları, `end` kalanları döndürür. */
export class CsvParser {
  private delimiter: string | null
  private readonly skipEmptyLines: boolean
  private readonly strict: boolean
  private pending = '' // ayırıcı bulunana kadar biriken metin
  private started = false
  private field = ''
  private row: string[] = []
  private rowHasContent = false
  private fieldQuoted = false
  private inQuotes = false
  private quoteSeen = false
  private afterQuoted = false
  private pendingCR = false
  private line = 1
  private quoteLine = 1
  private out: string[][] = []

  constructor(options: CsvOptions = {}) {
    const delimiter = options.delimiter ?? 'auto'
    if (delimiter !== 'auto' && (Array.from(delimiter).length !== 1 || delimiter === '"' || /[\r\n]/.test(delimiter))) {
      throw new CsvError('Ayırıcı tek karakter olmalı ve tırnak ya da satır sonu olamaz.')
    }
    this.delimiter = delimiter === 'auto' ? null : delimiter
    this.skipEmptyLines = options.skipEmptyLines ?? true
    this.strict = options.strict ?? false
  }

  private endField(): void {
    this.row.push(this.field)
    this.field = ''
    this.fieldQuoted = false
    this.afterQuoted = false
  }

  private endRow(): void {
    const quotedEmpty = this.fieldQuoted
    this.endField()
    const empty = this.row.length === 1 && this.row[0] === '' && !quotedEmpty
    if (!(empty && this.skipEmptyLines)) this.out.push(this.row)
    this.row = []
    this.rowHasContent = false
    this.line += 1
  }

  private consume(text: string, delimiter: string): void {
    for (const ch of text) {
      if (!this.started) {
        this.started = true
        if (ch === '\u{feff}') continue
      }
      if (this.pendingCR) {
        this.pendingCR = false
        if (ch === '\n') continue
      }
      if (this.inQuotes) {
        if (this.quoteSeen) {
          this.quoteSeen = false
          if (ch === '"') {
            this.field += '"'
            continue
          }
          this.inQuotes = false
          this.afterQuoted = true
        } else {
          if (ch === '"') this.quoteSeen = true
          else {
            this.field += ch
            if (ch === '\n') this.line += 1
          }
          continue
        }
      }
      this.rowHasContent = true
      if (ch === delimiter) this.endField()
      else if (ch === '\r' || ch === '\n') {
        this.endRow()
        this.pendingCR = ch === '\r'
      } else if (ch === '"' && this.field === '' && !this.afterQuoted && !this.fieldQuoted) {
        this.inQuotes = true
        this.fieldQuoted = true
        this.quoteLine = this.line
      } else {
        if (this.strict && ch === '"') throw new CsvError(`Satır ${this.line}: tırnaksız alanda tırnak işareti var.`)
        if (this.strict && this.afterQuoted) {
          throw new CsvError(`Satır ${this.line}: kapanış tırnağından sonra ayırıcı ya da satır sonu bekleniyordu.`)
        }
        this.field += ch
      }
    }
  }

  /** Yeni parçayı işler; bu parçayla tamamlanan satırları döndürür. */
  push(chunk: string): string[][] {
    if (this.delimiter === null) {
      this.pending += chunk
      const body = this.pending.replace(/^\u{feff}/u, '')
      let inQuotes = false
      let complete = false
      for (const ch of body) {
        if (ch === '"') inQuotes = !inQuotes
        else if (!inQuotes && (ch === '\n' || ch === '\r')) {
          complete = true
          break
        }
      }
      if (!complete) return []
      this.delimiter = detectDelimiter(this.pending)
      chunk = this.pending
      this.pending = ''
    }
    this.consume(chunk, this.delimiter)
    const rows = this.out
    this.out = []
    return rows
  }

  /** Girdinin bittiğini bildirir; kalan satırı döndürür. Kapanmamış tırnak varsa CsvError. */
  end(): string[][] {
    if (this.delimiter === null) {
      this.delimiter = detectDelimiter(this.pending)
      this.consume(this.pending, this.delimiter)
      this.pending = ''
    }
    if (this.inQuotes && !this.quoteSeen) {
      throw new CsvError(`Satır ${this.quoteLine}: tırnak açılmış ama kapanmamış (alanın sonuna " ekleyin).`)
    }
    if (this.quoteSeen) {
      this.quoteSeen = false
      this.inQuotes = false
      this.afterQuoted = true
      this.rowHasContent = true
    }
    if (this.rowHasContent || this.field !== '' || this.row.length > 0) this.endRow()
    const rows = this.out
    this.out = []
    return rows
  }
}

/** Metnin tamamını ayrıştırır: satırlar × alanlar. */
export function parseCsv(text: string, options: CsvOptions = {}): string[][] {
  const parser = new CsvParser(options)
  return [...parser.push(text), ...parser.end()]
}

/** İlk satırı başlık sayar ve her satırı nesneye çevirir. Eksik alan '' olur; fazla alan ve yinelenen başlık hata. */
export function parseCsvObjects(text: string, options: CsvOptions = {}): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text, options)
  if (header === undefined) return []
  header.forEach((name, i) => {
    if (name.trim() === '') throw new CsvError(`Başlıkta ${i + 1}. sütunun adı boş; her sütuna bir ad verin.`)
    if (header.indexOf(name) !== i) throw new CsvError(`Başlıkta "${name}" sütunu birden çok kez geçiyor.`)
  })
  return rows.map((row, r) => {
    if (row.length > header.length) {
      throw new CsvError(`Veri satırı ${r + 1}: ${row.length} alan var, başlıkta ${header.length} sütun var.`)
    }
    return Object.fromEntries(header.map((name, i) => [name, row[i] ?? '']))
  })
}

/** Türkçe Excel'in kaydettiği CSV: ";" ayırıcı, BOM olabilir. */
export function parseExcelCsv(text: string, options: Omit<CsvOptions, 'delimiter'> = {}): string[][] {
  return parseCsv(text, { ...options, delimiter: ';' })
}

/** Sayının üssüz ondalık yazımı: 1e21 → "1000000000000000000000", 1e-7 → "0.0000001". */
function plainNumber(value: number): string {
  if (!Number.isFinite(value)) throw new CsvError(`Sonlu olmayan sayı CSV'ye yazılamaz: ${value}.`)
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(String(value))
  if (!match) return String(value)
  const digits = (match[2] ?? '') + (match[3] ?? '')
  const point = (match[2] ?? '').length + Number(match[4] ?? '0')
  const padded = point <= 0 ? '0'.repeat(1 - point) + digits : digits.padEnd(point, '0')
  const at = point <= 0 ? 1 : point
  const integer = padded.slice(0, at).replace(/^0+(?=\d)/, '')
  const fraction = padded.slice(at).replace(/0+$/, '')
  const sign = match[1] === '-' && /[1-9]/.test(integer + fraction) ? '-' : ''
  return `${sign}${integer}${fraction === '' ? '' : `.${fraction}`}`
}

function cellText(value: CsvCell, options: CsvWriteOptions): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'number') {
    const text = plainNumber(value)
    return options.decimalComma === true ? text.replace('.', ',') : text
  }
  if (value instanceof Date) return value.toISOString()
  if (options.escapeFormulas === true && /^[=+\-@\t\r]/.test(value)) return `'${value}`
  return value
}

/** Satırları CSV metnine çevirir (her satırın sonunda satır sonu vardır). */
export function toCsv(rows: readonly (readonly CsvCell[])[], options: CsvWriteOptions = {}): string {
  const delimiter = options.delimiter ?? ','
  const lineEnding = options.lineEnding ?? '\r\n'
  const lines = rows.map((row) =>
    row
      .map((value) => {
        const text = cellText(value, options)
        const needsQuotes =
          options.quoteAll === true ||
          text.includes(delimiter) ||
          /["\r\n]/.test(text) ||
          text.startsWith(' ') ||
          text.endsWith(' ')
        return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text
      })
      .join(delimiter),
  )
  return (options.bom === true ? '\u{feff}' : '') + lines.map((line) => line + lineEnding).join('')
}

/** Türkçe Excel'in doğrudan açacağı CSV: ";" ayırıcı, BOM, CRLF, ondalık virgül, formül koruması. */
export function toExcelCsv(rows: readonly (readonly CsvCell[])[]): string {
  return toCsv(rows, { delimiter: ';', bom: true, lineEnding: '\r\n', decimalComma: true, escapeFormulas: true })
}

/** Akıştan satır satır ayrıştırır (bayt akışını önce TextDecoderStream'den geçirin). */
export async function* parseCsvStream(
  source: AsyncIterable<string> | ReadableStream<string>,
  options: CsvOptions = {},
): AsyncGenerator<string[]> {
  const parser = new CsvParser(options)
  if ('getReader' in source) {
    const reader = source.getReader()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        yield* parser.push(value)
      }
    } finally {
      reader.releaseLock()
    }
  } else {
    for await (const chunk of source) yield* parser.push(chunk)
  }
  yield* parser.end()
}
