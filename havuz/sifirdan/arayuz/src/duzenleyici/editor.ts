// Düzenleyici durumu ve komutları: belge (parça tablosu) + çoklu seçim + gruplu geri al geçmişi.
// Her düzenleme bir "işlem"dir: değişiklik kümesi kurulur, tersi geçmişe yazılır, seçimler değişiklik
// kümesinden geçirilerek yeni konumlarına taşınır. İmleç hareketleri grafem kümelerine göredir; dikey
// harekette "hedef sütun" hatırlanır (kısa satırdan geçince sütun kaybolmaz).
// Arayüzden bağımsızdır: gösterim sayfası klavye olaylarını bu komutlara çevirir.
// Genişletme: yeni komut = seçimlerden `Change` listesi üreten bir yöntem + `transact(...)` çağrısı.
import { ChangeSet, type Change } from './changes.ts'
import { UndoHistory, type EditKind } from './history.ts'
import { PieceTable } from './piece_table.ts'
import { expandReplacement, findAll, type SearchQuery } from './search.ts'
import {
  cursor,
  isEmpty,
  normalizeSelection,
  primaryRange,
  rangeFrom,
  rangeTo,
  single,
  type Range,
  type Selection,
} from './selection.ts'
import {
  graphemeCount,
  nextGrapheme,
  nextWordEnd,
  offsetOfGrapheme,
  prevGrapheme,
  prevWordStart,
  snapToGrapheme,
  wordAt,
} from './text_units.ts'

export interface EditorOptions {
  text?: string
  now?: () => number
  groupDelayMs?: number
  historyLimit?: number
}

export class Editor {
  readonly doc: PieceTable
  private sel: Selection = single(0)
  private goals: (number | undefined)[] = []
  private readonly history: UndoHistory
  private readonly now: () => number
  private readonly listeners = new Set<() => void>()

  constructor(options: EditorOptions = {}) {
    this.doc = new PieceTable(options.text ?? '')
    this.now = options.now ?? (() => Date.now())
    this.history = new UndoHistory({ groupDelayMs: options.groupDelayMs, limit: options.historyLimit })
  }

  get selection(): Selection {
    return this.sel
  }

  get canUndo(): boolean {
    return this.history.canUndo
  }

  get canRedo(): boolean {
    return this.history.canRedo
  }

  text(): string {
    return this.doc.getText()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener()
  }

  private line(offset: number): { start: number; end: number; text: string; line: number } {
    const { line } = this.doc.positionAt(offset)
    const start = this.doc.lineStart(line)
    const end = this.doc.lineEnd(line)
    return { start, end, text: this.doc.slice(start, end), line }
  }

  /** Konumu belgeye sığdırır ve grafem kümesinin ortasındaysa başına çeker. */
  snap(offset: number): number {
    const clamped = Math.max(0, Math.min(Math.round(offset), this.doc.length))
    const line = this.line(clamped)
    return line.start + snapToGrapheme(line.text, clamped - line.start)
  }

  setSelection(selection: Selection, keepGoals = false): void {
    const ranges = selection.ranges.map((r) => ({ anchor: this.snap(r.anchor), head: this.snap(r.head) }))
    this.sel = normalizeSelection({ ranges, primary: selection.primary })
    if (!keepGoals) this.goals = []
    this.emit()
  }

  private transact(changes: Change[], after: (set: ChangeSet) => Selection, kind: EditKind, closes = false): boolean {
    const set = new ChangeSet(changes)
    if (set.empty) return false
    const inverse = set.invert(this.doc)
    const before = this.sel
    set.apply(this.doc)
    this.sel = normalizeSelection(after(set))
    this.goals = []
    this.history.record({ changes: set, inverse }, kind, this.now(), before, this.sel, closes)
    this.emit()
    return true
  }

  /** Her seçimin yerine metni yazar (çoklu imleçte hepsine). */
  insertText(text: string): void {
    const ranges = this.sel.ranges
    this.transact(
      ranges.map((r) => ({ from: rangeFrom(r), to: rangeTo(r), insert: text })),
      (set) => ({ ranges: ranges.map((r) => cursor(set.mapPos(rangeTo(r), 1))), primary: this.sel.primary }),
      'insert',
      text.includes('\n'),
    )
  }

  private deleteBy(direction: -1 | 1, unit: 'char' | 'word'): void {
    const ranges = this.sel.ranges
    const spans = ranges.map((r) => {
      if (!isEmpty(r)) return { from: rangeFrom(r), to: rangeTo(r) }
      const target = this.step(r.head, direction, unit)
      return direction < 0 ? { from: target, to: r.head } : { from: r.head, to: target }
    })
    this.transact(
      spans.map((s) => ({ ...s, insert: '' })),
      (set) => ({ ranges: spans.map((s) => cursor(set.mapPos(s.from, -1))), primary: this.sel.primary }),
      'delete',
    )
  }

  deleteBackward(unit: 'char' | 'word' = 'char'): void {
    this.deleteBy(-1, unit)
  }

  deleteForward(unit: 'char' | 'word' = 'char'): void {
    this.deleteBy(1, unit)
  }

  /** Bir grafem ya da kelime ileri/geri; satır sonunda bir sonraki satıra geçer. */
  private step(offset: number, direction: -1 | 1, unit: 'char' | 'word'): number {
    const line = this.line(offset)
    const col = offset - line.start
    if (direction < 0) {
      if (col === 0) return Math.max(0, offset - 1)
      return line.start + (unit === 'word' ? prevWordStart(line.text, col) : prevGrapheme(line.text, col))
    }
    if (offset === line.end) return Math.min(this.doc.length, offset + 1)
    return line.start + (unit === 'word' ? nextWordEnd(line.text, col) : nextGrapheme(line.text, col))
  }

  moveHorizontal(direction: -1 | 1, extend = false, unit: 'char' | 'word' = 'char'): void {
    const ranges = this.sel.ranges.map((r): Range => {
      if (!extend && !isEmpty(r)) return cursor(direction < 0 ? rangeFrom(r) : rangeTo(r))
      const head = this.step(r.head, direction, unit)
      return extend ? { anchor: r.anchor, head } : cursor(head)
    })
    this.setSelection({ ranges, primary: this.sel.primary })
  }

  moveVertical(direction: -1 | 1, extend = false): void {
    const goals: (number | undefined)[] = []
    const ranges = this.sel.ranges.map((r, i): Range => {
      const line = this.line(r.head)
      const goal = this.goals[i] ?? graphemeCount(line.text, r.head - line.start)
      goals.push(goal)
      const target = line.line + direction
      let head: number
      if (target < 0) head = 0
      else if (target >= this.doc.lineCount) head = this.doc.length
      else {
        const start = this.doc.lineStart(target)
        head = start + offsetOfGrapheme(this.doc.lineText(target), goal)
      }
      return extend ? { anchor: r.anchor, head } : cursor(head)
    })
    this.setSelection({ ranges, primary: this.sel.primary }, true)
    this.goals = goals
  }

  moveLineBoundary(toEnd: boolean, extend = false): void {
    const ranges = this.sel.ranges.map((r): Range => {
      const line = this.line(r.head)
      const head = toEnd ? line.end : line.start
      return extend ? { anchor: r.anchor, head } : cursor(head)
    })
    this.setSelection({ ranges, primary: this.sel.primary })
  }

  moveDocBoundary(toEnd: boolean, extend = false): void {
    const head = toEnd ? this.doc.length : 0
    const anchor = extend ? primaryRange(this.sel).anchor : head
    this.setSelection(single(anchor, head))
  }

  selectAll(): void {
    this.setSelection(single(0, this.doc.length))
  }

  addCursor(offset: number): void {
    this.setSelection({ ranges: [...this.sel.ranges, cursor(offset)], primary: this.sel.ranges.length })
  }

  /** Ctrl+D: boş imleçte kelimeyi seçer; seçim varsa aynı metnin bir sonraki geçişini yeni seçim olarak ekler. */
  addNextOccurrence(): boolean {
    const main = primaryRange(this.sel)
    if (isEmpty(main)) {
      const line = this.line(main.head)
      const word = wordAt(line.text, main.head - line.start)
      if (word.from === word.to) return false
      const ranges = this.sel.ranges.map((r) =>
        r === main ? { anchor: line.start + word.from, head: line.start + word.to } : r,
      )
      this.setSelection({ ranges, primary: this.sel.primary })
      return true
    }
    const needle = this.doc.slice(rangeFrom(main), rangeTo(main))
    const text = this.text()
    const positions: number[] = []
    for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) positions.push(at)
    const taken = (at: number) => this.sel.ranges.some((r) => rangeFrom(r) < at + needle.length && at < rangeTo(r))
    const last = Math.max(...this.sel.ranges.map(rangeTo))
    const found = positions.find((at) => at >= last && !taken(at)) ?? positions.find((at) => !taken(at))
    if (found === undefined) return false
    this.setSelection({
      ranges: [...this.sel.ranges, { anchor: found, head: found + needle.length }],
      primary: this.sel.ranges.length,
    })
    return true
  }

  undo(): boolean {
    const entry = this.history.popUndo()
    if (!entry) return false
    for (let i = entry.steps.length - 1; i >= 0; i--) entry.steps[i]?.inverse.apply(this.doc)
    this.sel = entry.selectionBefore
    this.goals = []
    this.emit()
    return true
  }

  redo(): boolean {
    const entry = this.history.popRedo()
    if (!entry) return false
    for (const step of entry.steps) step.changes.apply(this.doc)
    this.sel = entry.selectionAfter
    this.goals = []
    this.emit()
    return true
  }

  /** Tüm eşleşmeleri tek işlemde değiştirir (tek adımda geri alınır); değişen sayısını döndürür. */
  replaceAll(query: SearchQuery, replacement: string): number {
    const matches = findAll(this.text(), query)
    const main = primaryRange(this.sel)
    this.transact(
      matches.map((m) => ({
        from: m.from,
        to: m.to,
        insert: query.regex ? expandReplacement(replacement, m) : replacement,
      })),
      (set) => single(set.mapPos(main.head, 1)),
      'other',
    )
    return matches.length
  }

  /** Birincil seçim tam bir eşleşmeyse onu değiştirir; sonra bir sonraki eşleşmeyi seçer. */
  replaceNext(query: SearchQuery, replacement: string): boolean {
    const main = primaryRange(this.sel)
    const current = findAll(this.text(), query).find((m) => m.from === rangeFrom(main) && m.to === rangeTo(main))
    if (current) {
      const insert = query.regex ? expandReplacement(replacement, current) : replacement
      this.transact(
        [{ from: current.from, to: current.to, insert }],
        (set) => single(set.mapPos(current.to, 1)),
        'other',
      )
    }
    return this.selectNextMatch(query)
  }

  /** İmleçten sonraki ilk eşleşmeyi seçer (sonda başa sarar). */
  selectNextMatch(query: SearchQuery): boolean {
    const matches = findAll(this.text(), query)
    const after = rangeTo(primaryRange(this.sel))
    const next = matches.find((m) => m.from >= after && m.to > m.from) ?? matches.find((m) => m.to > m.from)
    if (!next) return false
    this.setSelection(single(next.from, next.to))
    return true
  }
}
