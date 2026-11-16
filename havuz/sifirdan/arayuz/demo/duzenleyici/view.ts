// Düzenleyici görünümü: satırları, imleçleri, seçimleri ve arama eşleşmelerini çizer; ekran koordinatını
// belge konumuna çevirir. Ölçüm, satırın metin düğümü üzerinde DOM Range ile yapılır (yazı tipi ne olursa
// olsun, emoji dahil, gerçek genişlik).
// Genişletme: çok uzun belgelerde yalnız görünen satırları çizmek için tablo gösterimindeki sanallaştırmaya bakın.
import { nextGrapheme, rangeFrom, rangeTo, type Editor, type Match } from '../../src/duzenleyici/index.ts'

export class EditorView {
  private readonly editor: Editor
  private readonly lines: HTMLElement
  private readonly numbers: HTMLElement
  private readonly layer: HTMLElement

  constructor(editor: Editor, lines: HTMLElement, numbers: HTMLElement, layer: HTMLElement) {
    this.editor = editor
    this.lines = lines
    this.numbers = numbers
    this.layer = layer
  }

  private lineElements(): HTMLElement[] {
    return [...this.lines.querySelectorAll<HTMLElement>('.satir-metni')]
  }

  /** Satırın içindeki `col` konumunun (UTF-16) katmana göre koordinatı. */
  private point(line: number, col: number): { x: number; y: number; h: number } {
    const el = this.lineElements()[line] as HTMLElement
    const base = this.lines.getBoundingClientRect()
    const text = el.firstChild
    if (!text || col === 0) {
      const r = el.getBoundingClientRect()
      return { x: r.left - base.left, y: r.top - base.top, h: r.height }
    }
    const range = document.createRange()
    range.setStart(text, Math.min(col, text.textContent?.length ?? 0))
    range.collapse(true)
    const rect = range.getClientRects()[0] ?? el.getBoundingClientRect()
    const lineRect = el.getBoundingClientRect()
    return { x: rect.left - base.left, y: lineRect.top - base.top, h: lineRect.height }
  }

  private box(cls: string, x: number, y: number, w: number, h: number): HTMLElement {
    const div = document.createElement('div')
    div.className = cls
    div.style.left = `${x}px`
    div.style.top = `${y}px`
    div.style.width = `${Math.max(2, w)}px`
    div.style.height = `${h}px`
    return div
  }

  /** [from, to) aralığını satır satır dikdörtgenlerle boyar. */
  private paint(from: number, to: number, cls: string, out: HTMLElement[]): void {
    const doc = this.editor.doc
    const a = doc.positionAt(from)
    const b = doc.positionAt(to)
    for (let line = a.line; line <= b.line; line++) {
      const start = line === a.line ? a.col : 0
      const end = line === b.line ? b.col : doc.lineText(line).length
      const p = this.point(line, start)
      const q = this.point(line, end)
      const extra = line < b.line ? 8 : 0
      out.push(this.box(cls, p.x, p.y, q.x - p.x + extra, p.h))
    }
  }

  render(matches: readonly Match[]): void {
    const doc = this.editor.doc
    const fragment = document.createDocumentFragment()
    const numbers = document.createDocumentFragment()
    for (let line = 0; line < doc.lineCount; line++) {
      const div = document.createElement('div')
      div.className = 'satir-metni'
      div.textContent = doc.lineText(line)
      fragment.append(div)
      const n = document.createElement('div')
      n.textContent = String(line + 1)
      numbers.append(n)
    }
    this.lines.replaceChildren(fragment, this.layer)
    this.numbers.replaceChildren(numbers)
    const marks: HTMLElement[] = []
    for (const m of matches) if (m.to > m.from) this.paint(m.from, m.to, 'eslesme', marks)
    for (const r of this.editor.selection.ranges) {
      if (rangeTo(r) > rangeFrom(r)) this.paint(rangeFrom(r), rangeTo(r), 'secim', marks)
      const pos = doc.positionAt(r.head)
      const p = this.point(pos.line, pos.col)
      marks.push(this.box('imlec', p.x, p.y, 2, p.h))
    }
    this.layer.replaceChildren(...marks)
  }

  /** Tıklanan ekran noktasına en yakın grafem sınırının belge konumu. */
  offsetAt(clientX: number, clientY: number): number {
    const els = this.lineElements()
    let line = els.findIndex((el) => el.getBoundingClientRect().bottom > clientY)
    if (line < 0) line = els.length - 1
    const text = this.editor.doc.lineText(line)
    const base = this.lines.getBoundingClientRect()
    const x = clientX - base.left
    let best = 0
    let bestDistance = Infinity
    for (let col = 0; ; col = nextGrapheme(text, col)) {
      const distance = Math.abs(this.point(line, col).x - x)
      if (distance < bestDistance) {
        bestDistance = distance
        best = col
      }
      if (col >= text.length) break
    }
    return this.editor.doc.lineStart(line) + best
  }

  /** Birincil imleci (kaydırılabilir kabın içinde) görünür alana getirir. */
  reveal(): void {
    this.layer.querySelector<HTMLElement>('.imlec')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }
}
