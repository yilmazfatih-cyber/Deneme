// E-tablo çekirdeği: hücre girişlerini çözümler, bağımlılık çizgesini günceller ve yalnız etkilenen hücreleri
// topolojik sırayla yeniden hesaplar. Giriş kuralları: "=..." formül, "'..." zorla metin, sayı (kipe göre "1,5"
// ya da "1.5"), DOĞRU/YANLIŞ, aksi hâlde metin. Bozuk formül hücrede #HATA! gösterir; giriş korunur.
// `stats.evaluations` kaç formülün gerçekten hesaplandığını sayar (testler "gereksiz hesap yok"u bununla kanıtlar).
// Genişletme: çoklu sayfa için `Sheet`'i bir `Workbook` içinde ada göre tutun; başvurulara sayfa adı ekleyin.
import { cellKey, normalizeRange, parseKey } from './address.ts'
import { evaluateCell, type EvalContext } from './evaluate.ts'
import { formatValue } from './format.ts'
import { DependencyGraph } from './graph.ts'
import { FormulaSyntaxError } from './lexer.ts'
import { collectRefs, parseFormula, type Node } from './parser.ts'
import { err, textToNumber, type CellValue, type NumberStyle } from './values.ts'

export interface SheetOptions {
  rows: number
  cols: number
  /** true: "1,5" sayı ve ";" ayraç (Türkçe). false: "1.5" ve ",". */
  decimalComma?: boolean
  now?: () => Date
}

interface Cell {
  input: string
  ast: Node | undefined
  value: CellValue
}

export class Sheet {
  readonly rows: number
  readonly cols: number
  readonly style: NumberStyle
  readonly stats = { evaluations: 0 }
  private readonly cells = new Map<string, Cell>()
  private readonly graph = new DependencyGraph()
  private readonly listeners = new Set<(changed: string[]) => void>()
  private readonly ctx: EvalContext

  constructor(options: SheetOptions) {
    this.rows = options.rows
    this.cols = options.cols
    this.style = { decimalComma: options.decimalComma ?? true }
    this.ctx = {
      style: this.style,
      now: options.now ?? (() => new Date()),
      rows: this.rows,
      cols: this.cols,
      getCell: (row, col) => this.cells.get(cellKey(row, col))?.value ?? null,
    }
  }

  /** Tek hücreyi yazar; yeniden hesaplanan hücrelerin anahtarlarını (hesap sırasıyla) döndürür. */
  setCell(address: string, input: string): string[] {
    return this.setCells([[address, input]])
  }

  /** Birden çok hücreyi (ör. yapıştırma) yazar; yeniden hesap tek seferde yapılır. */
  setCells(entries: readonly (readonly [string, string])[]): string[] {
    const changed: string[] = []
    for (const [address, input] of entries) {
      const { row, col } = parseKey(address)
      if (row >= this.rows || col >= this.cols)
        throw new Error(`${address} sayfanın dışında (${this.rows} satır × ${this.cols} sütun).`)
      const key = cellKey(row, col)
      this.store(key, input)
      changed.push(key)
    }
    return this.recalculate(changed)
  }

  getValue(address: string): CellValue {
    const { row, col } = parseKey(address)
    return this.cells.get(cellKey(row, col))?.value ?? null
  }

  getValueAt(row: number, col: number): CellValue {
    return this.cells.get(cellKey(row, col))?.value ?? null
  }

  getInput(address: string): string {
    const { row, col } = parseKey(address)
    return this.cells.get(cellKey(row, col))?.input ?? ''
  }

  getDisplay(address: string): string {
    return formatValue(this.getValue(address), this.style.decimalComma)
  }

  /** Dolu hücrelerin anahtarları. */
  keys(): string[] {
    return [...this.cells.keys()]
  }

  precedentsOf(address: string): string[] {
    return [...this.graph.precedentsOf(address)]
  }

  subscribe(listener: (changed: string[]) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private store(key: string, raw: string): void {
    const input = raw.replace(/\r\n?/g, '\n')
    if (input.trim() === '') {
      this.cells.delete(key)
      this.graph.setPrecedents(key, [])
      return
    }
    const cell: Cell = { input, ast: undefined, value: null }
    if (input.startsWith('=') && input.length > 1) {
      try {
        cell.ast = parseFormula(input.slice(1), this.style)
      } catch (error) {
        if (!(error instanceof FormulaSyntaxError)) throw error
        cell.value = err('parse', error.message)
      }
    } else cell.value = this.parseConstant(input)
    this.cells.set(key, cell)
    this.graph.setPrecedents(key, cell.ast ? this.referencedKeys(cell.ast) : [])
  }

  private parseConstant(input: string): CellValue {
    if (input.startsWith("'")) return input.slice(1)
    const n = textToNumber(input, this.style)
    if (n !== undefined) return n
    const upper = input.trim().toLocaleUpperCase('tr-TR')
    if (upper === 'DOĞRU' || upper === 'TRUE') return true
    if (upper === 'YANLIŞ' || upper === 'FALSE') return false
    return input
  }

  /** Formülün okuduğu hücreler; aralıklar sayfa sınırına kırpılıp hücre hücre açılır. */
  private referencedKeys(ast: Node): string[] {
    const keys = new Set<string>()
    for (const ref of collectRefs(ast)) {
      if ('from' in ref) {
        const box = normalizeRange(ref)
        for (let r = box.top; r <= Math.min(box.bottom, this.rows - 1); r++) {
          for (let c = box.left; c <= Math.min(box.right, this.cols - 1); c++) keys.add(cellKey(r, c))
        }
      } else if (ref.row < this.rows && ref.col < this.cols) keys.add(cellKey(ref.row, ref.col))
    }
    return [...keys]
  }

  private recalculate(changed: string[]): string[] {
    const affected = this.graph.affectedBy(changed)
    const updated: string[] = []
    for (const component of this.graph.recalcOrder(affected)) {
      for (const key of component.cells) {
        const cell = this.cells.get(key)
        if (cell?.ast) {
          if (component.cyclic) cell.value = err('cycle', 'döngüsel başvuru')
          else {
            this.stats.evaluations++
            cell.value = evaluateCell(cell.ast, this.ctx)
          }
        }
        updated.push(key)
      }
    }
    for (const listener of [...this.listeners]) listener(updated)
    return updated
  }
}
