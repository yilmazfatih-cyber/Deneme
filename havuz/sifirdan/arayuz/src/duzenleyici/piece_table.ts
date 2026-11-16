// Parça tablosu (piece table): metin düzenleyicilerin (VS Code'un da) temel veri yapısı.
// Özgün metin hiç değiştirilmez; yazılan her şey "eklenenler" arabelleğinin sonuna eklenir. Belge, bu iki
// arabellekten dilimlere işaret eden parçaların sırasıdır:
//   özgün:  "Merhaba dünya"        eklenen: " güzel"
//   parçalar: [özgün 0..7] [eklenen 0..6] [özgün 7..13]  →  "Merhaba güzel dünya"
// Ekleme/silme yalnız parça listesini böler; büyük metin kopyalanmaz. Her parça kendi satır sonu konumlarını
// taşır: satır sayısı ve "n. satır nerede başlar?" soruları parçalar üzerinde toplama ile yanıtlanır.
// Konumlar UTF-16 kod birimidir (JS dizgisi gibi). Satır sonu yalnız "\n"dir: CRLF girişte "\n"ye çevrilir.
// Genişletme: çok büyük belgeler için parça dizisini dengeli ağaca (kırmızı-siyah) çevirin; arayüz aynı kalır.

interface Piece {
  /** 0: özgün arabellek, 1: eklenenler arabelleği */
  buffer: 0 | 1
  start: number
  length: number
  /** Parça içindeki "\n" konumları (parçanın başına göre). */
  breaks: number[]
}

export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

function findBreaks(text: string, start: number, length: number): number[] {
  const out: number[] = []
  for (let i = text.indexOf('\n', start); i !== -1 && i < start + length; i = text.indexOf('\n', i + 1))
    out.push(i - start)
  return out
}

export class PieceTable {
  private readonly original: string
  private added = ''
  private pieces: Piece[] = []
  private total = 0

  constructor(text = '') {
    this.original = normalizeNewlines(text)
    if (this.original.length > 0) this.pieces.push(this.makePiece(0, 0, this.original.length))
    this.total = this.original.length
  }

  get length(): number {
    return this.total
  }

  /** Parça sayısı (testler ve ölçüm için). */
  get pieceCount(): number {
    return this.pieces.length
  }

  get lineCount(): number {
    return this.pieces.reduce((sum, piece) => sum + piece.breaks.length, 0) + 1
  }

  private source(piece: Piece): string {
    return piece.buffer === 0 ? this.original : this.added
  }

  private makePiece(buffer: 0 | 1, start: number, length: number): Piece {
    const text = buffer === 0 ? this.original : this.added
    return { buffer, start, length, breaks: findBreaks(text, start, length) }
  }

  /** Parçayı [0, at) ve [at, length) olarak böler. */
  private split(piece: Piece, at: number): [Piece, Piece] {
    return [
      { buffer: piece.buffer, start: piece.start, length: at, breaks: piece.breaks.filter((b) => b < at) },
      {
        buffer: piece.buffer,
        start: piece.start + at,
        length: piece.length - at,
        breaks: piece.breaks.filter((b) => b >= at).map((b) => b - at),
      },
    ]
  }

  /** Konumu içeren parçanın sırası ve parça içi konum (konum parça sınırındaysa önceki parçanın sonu). */
  private locate(offset: number): { index: number; inner: number } {
    let start = 0
    for (let i = 0; i < this.pieces.length; i++) {
      const piece = this.pieces[i] as Piece
      if (offset <= start + piece.length) return { index: i, inner: offset - start }
      start += piece.length
    }
    return { index: this.pieces.length, inner: 0 }
  }

  private check(offset: number): void {
    if (!Number.isInteger(offset) || offset < 0 || offset > this.total) {
      throw new RangeError(`Konum ${offset} belgenin dışında (uzunluk ${this.total}).`)
    }
  }

  insert(offset: number, raw: string): void {
    this.check(offset)
    const text = normalizeNewlines(raw)
    if (text.length === 0) return
    const start = this.added.length
    this.added += text
    this.total += text.length
    const { index, inner } = this.locate(offset)
    const prev = this.pieces[index]
    // Yazma hızlandırması: önceki parçanın hemen sonuna, onun bittiği yerden devam eden ekleme → parçayı uzat.
    if (prev && inner === prev.length && prev.buffer === 1 && prev.start + prev.length === start) {
      prev.breaks.push(...findBreaks(this.added, start, text.length).map((b) => b + prev.length))
      prev.length += text.length
      return
    }
    const piece = this.makePiece(1, start, text.length)
    if (!prev) this.pieces.push(piece)
    else if (inner === 0) this.pieces.splice(index, 0, piece)
    else if (inner === prev.length) this.pieces.splice(index + 1, 0, piece)
    else {
      const [left, right] = this.split(prev, inner)
      this.pieces.splice(index, 1, left, piece, right)
    }
  }

  delete(offset: number, length: number): void {
    this.check(offset)
    this.check(offset + length)
    if (length <= 0) return
    const kept: Piece[] = []
    let start = 0
    const end = offset + length
    for (const piece of this.pieces) {
      const pieceEnd = start + piece.length
      if (pieceEnd <= offset || start >= end) kept.push(piece)
      else {
        if (start < offset) kept.push(this.split(piece, offset - start)[0])
        if (pieceEnd > end) kept.push(this.split(piece, end - start)[1])
      }
      start = pieceEnd
    }
    this.pieces = kept
    this.total -= length
  }

  getText(): string {
    return this.pieces.map((p) => this.source(p).slice(p.start, p.start + p.length)).join('')
  }

  slice(from: number, to: number = this.total): string {
    this.check(from)
    this.check(to)
    let out = ''
    let start = 0
    for (const piece of this.pieces) {
      const pieceEnd = start + piece.length
      if (pieceEnd > from && start < to) {
        const a = Math.max(from, start) - start
        const b = Math.min(to, pieceEnd) - start
        out += this.source(piece).slice(piece.start + a, piece.start + b)
      }
      if (pieceEnd >= to) break
      start = pieceEnd
    }
    return out
  }

  /** `line` (0 tabanlı) satırının başladığı konum. */
  lineStart(line: number): number {
    if (line <= 0) return 0
    let seen = 0
    let start = 0
    for (const piece of this.pieces) {
      if (seen + piece.breaks.length >= line) return start + (piece.breaks[line - seen - 1] as number) + 1
      seen += piece.breaks.length
      start += piece.length
    }
    return this.total
  }

  lineEnd(line: number): number {
    return line + 1 >= this.lineCount ? this.total : this.lineStart(line + 1) - 1
  }

  lineText(line: number): string {
    return this.slice(this.lineStart(line), this.lineEnd(line))
  }

  /** Konum → { satır, sütun } (sütun UTF-16 birimi). */
  positionAt(offset: number): { line: number; col: number } {
    this.check(offset)
    let line = 0
    let start = 0
    for (const piece of this.pieces) {
      if (start + piece.length >= offset) {
        line += piece.breaks.filter((b) => b < offset - start).length
        break
      }
      line += piece.breaks.length
      start += piece.length
    }
    return { line, col: offset - this.lineStart(line) }
  }

  offsetAt(line: number, col: number): number {
    const clampedLine = Math.max(0, Math.min(line, this.lineCount - 1))
    const start = this.lineStart(clampedLine)
    return Math.min(start + Math.max(0, col), this.lineEnd(clampedLine))
  }
}
