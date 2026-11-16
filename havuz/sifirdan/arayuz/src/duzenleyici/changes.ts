// Değişiklik kümesi: aynı anda uygulanan, sıralı ve çakışmasız { from, to, insert } değişiklikleri (konumlar
// değişiklik ÖNCESİ belgeye göredir). Çoklu imleçle yazmak tek bir değişiklik kümesidir.
// - apply: sondan başa uygulanır, böylece öndeki konumlar kaymaz.
// - invert: geri alma için ters küme (silinen metni öncesindeki belgeden okur).
// - mapPos: bir konumu (ör. imleç) değişiklikten sonraki belgeye taşır.
// Genişletme: işbirlikli düzenleme (OT) için iki kümeyi birbirine göre "dönüştüren" `transform` buraya yazılır.
import type { PieceTable } from './piece_table.ts'

export interface Change {
  from: number
  to: number
  insert: string
}

export class ChangeSet {
  readonly changes: readonly Change[]

  constructor(changes: readonly Change[]) {
    const sorted = [...changes].sort((a, b) => a.from - b.from || a.to - b.to)
    const merged: Change[] = []
    for (const change of sorted) {
      if (change.from > change.to) throw new RangeError('Değişiklikte from, to değerinden büyük olamaz.')
      const last = merged[merged.length - 1]
      if (last && change.from < last.to) {
        last.to = Math.max(last.to, change.to)
        last.insert += change.insert
      } else merged.push({ ...change })
    }
    this.changes = merged.filter((c) => c.from !== c.to || c.insert !== '')
  }

  get empty(): boolean {
    return this.changes.length === 0
  }

  apply(doc: PieceTable): void {
    for (let i = this.changes.length - 1; i >= 0; i--) {
      const change = this.changes[i] as Change
      if (change.to > change.from) doc.delete(change.from, change.to - change.from)
      if (change.insert) doc.insert(change.from, change.insert)
    }
  }

  /** Bu kümeyi geri alan küme. `docBefore`, kümenin uygulanmadan önceki belgesi olmalıdır. */
  invert(docBefore: PieceTable): ChangeSet {
    let delta = 0
    const inverse: Change[] = []
    for (const change of this.changes) {
      const from = change.from + delta
      inverse.push({ from, to: from + change.insert.length, insert: docBefore.slice(change.from, change.to) })
      delta += change.insert.length - (change.to - change.from)
    }
    return new ChangeSet(inverse)
  }

  /**
   * Konumu yeni belgeye taşır. Silinen bölgenin içindeki konum, eklenen metnin başına (assoc -1) ya da
   * sonuna (assoc 1) gider. Tam ekleme noktasındaki konum da assoc'a göre önce ya da sonra kalır.
   */
  mapPos(pos: number, assoc: -1 | 1 = 1): number {
    let delta = 0
    for (const change of this.changes) {
      if (pos < change.from || (pos === change.from && change.from === change.to && assoc < 0)) break
      if (pos <= change.to) return change.from + delta + (assoc > 0 ? change.insert.length : 0)
      delta += change.insert.length - (change.to - change.from)
    }
    return pos + delta
  }
}
