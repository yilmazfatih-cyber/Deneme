// Banka hesap hareketi (CSV) ayrıştırıcı. Türk bankalarının dışa aktarımları farklı başlık, ayraç (; , sekme),
// tarih (GG.AA.YYYY) ve sayı (1.234,56) biçimleri kullanır; başlık satırından önce hesap bilgisi satırları olabilir.
import { parseAmount } from './money.ts'
import { fold } from './text.ts'

export type BankRow = { rowNo: number; date: string; description: string; amount: number; reference: string | null }

export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 20).join('\n')
  const counts = [';', '\t', ','].map((d) => ({ d, n: sample.split(d).length }))
  counts.sort((a, b) => b.n - a.n)
  return counts[0]!.n > 1 ? counts[0]!.d : ','
}

/** RFC 4180 uyumlu basit CSV ayrıştırıcı (tırnak içinde ayraç ve satır sonu desteklenir). */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const s = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
    } else if (ch === '"' && field === '') quoted = true
    else if (ch === delimiter) {
      row.push(field.trim())
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++
      row.push(field.trim())
      if (row.some((f) => f !== '')) rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  row.push(field.trim())
  if (row.some((f) => f !== '')) rows.push(row)
  return rows
}

/** "15.11.2026" · "15/11/2026" · "2026-11-15" · "15.11.2026 14:32" · "15.11.26" → 'YYYY-AA-GG' */
export function parseTrDate(input: string): string | null {
  const s = input.trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return valid(`${m[1]}-${m[2]}-${m[3]}`)
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/.exec(s)
  if (m) {
    const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!
    return valid(`${y}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`)
  }
  return null
}

function valid(d: string): string | null {
  const t = new Date(`${d}T00:00:00Z`)
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d ? d : null
}

export type Columns = {
  date: number
  description: number
  amount: number | null
  credit: number | null
  debit: number | null
  reference: number | null
}

const has = (h: string, ...words: string[]) => words.some((w) => h.includes(w))

export function detectColumns(header: string[]): Columns | null {
  const h = header.map((x) => fold(x))
  const find = (pred: (x: string) => boolean) => {
    const i = h.findIndex(pred)
    return i >= 0 ? i : null
  }
  const date = find((x) => has(x, 'islem tarihi', 'tarih', 'date') && !has(x, 'valor'))
  const description = find((x) => has(x, 'aciklama', 'description', 'islem detayi', 'detay', 'karsi taraf'))
  const amount = find((x) => (has(x, 'tutar', 'amount', 'miktar') && !has(x, 'bakiye')) || x === 'islem tutari')
  const credit = find((x) => has(x, 'alacak', 'gelen', 'yatan'))
  const debit = find((x) => (has(x, 'borc', 'giden', 'cekilen') && !has(x, 'alacak')) || false)
  const reference = find((x) => has(x, 'referans', 'dekont', 'fis no', 'islem no', 'reference'))
  if (date === null || description === null || (amount === null && credit === null)) return null
  return { date, description, amount, credit, debit, reference }
}

/**
 * Hesap hareketlerini ayrıştırır. Yalnız gelen (pozitif) tutarlar döner; giden ödemeler `skipped` sayılır.
 */
export function parseBankStatement(text: string): { rows: BankRow[]; skipped: number; columns: Columns | null } {
  const table = parseCsv(text)
  let headerIdx = -1
  let columns: Columns | null = null
  for (let i = 0; i < Math.min(table.length, 25); i++) {
    const c = detectColumns(table[i]!)
    if (c) {
      headerIdx = i
      columns = c
      break
    }
  }
  if (!columns) return { rows: [], skipped: table.length, columns: null }
  const rows: BankRow[] = []
  let skipped = 0
  for (let i = headerIdx + 1; i < table.length; i++) {
    const r = table[i]!
    const date = parseTrDate(r[columns.date] ?? '')
    const description = (r[columns.description] ?? '').replace(/\s+/g, ' ').trim()
    let amount: number | null = null
    if (columns.credit !== null && r[columns.credit]) {
      amount = parseAmount(r[columns.credit]!)
      if (amount !== null) amount = Math.abs(amount)
    }
    if ((amount === null || amount === 0) && columns.amount !== null) amount = parseAmount(r[columns.amount] ?? '')
    if (amount === null && columns.debit !== null && r[columns.debit]) {
      const d = parseAmount(r[columns.debit]!)
      amount = d === null ? null : -Math.abs(d)
    }
    if (!date || amount === null || amount <= 0 || !description) {
      skipped++
      continue
    }
    const reference = columns.reference !== null ? r[columns.reference]?.trim() || null : null
    rows.push({ rowNo: i + 1, date, description, amount, reference })
  }
  return { rows, skipped, columns }
}
