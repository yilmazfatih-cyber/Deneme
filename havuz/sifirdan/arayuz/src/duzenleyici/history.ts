// Geri al / yinele geçmişi, işlem gruplamalı: art arda yazılan harfler tek adımda geri alınır.
// Yeni işlem önceki grupla birleşir, eğer: aynı türdense (yazma/silme), `groupDelayMs` içinde geldiyse,
// seçim arada başka yere atlamadıysa ve yazılan metin yeni satır içermiyorsa. Her adım değişiklik kümesini,
// tersini ve öncesi/sonrası seçimi saklar; geri alma ters kümeleri sondan başa uygular.
// Saat dışarıdan verilir (`now`): testler zamanı elle ilerletir.
// Genişletme: "kelime sonunda grup kes" isterseniz `canMerge`'e boşluk denetimi ekleyin.
import type { ChangeSet } from './changes.ts'
import type { Selection } from './selection.ts'

export type EditKind = 'insert' | 'delete' | 'other'

export interface Step {
  changes: ChangeSet
  inverse: ChangeSet
}

export interface HistoryEntry {
  steps: Step[]
  kind: EditKind
  time: number
  selectionBefore: Selection
  selectionAfter: Selection
  /** Yeni satır gibi "grubu kapatan" bir işlem miydi? */
  closed: boolean
}

function sameSelection(a: Selection, b: Selection): boolean {
  return (
    a.ranges.length === b.ranges.length &&
    a.ranges.every((r, i) => r.anchor === b.ranges[i]?.anchor && r.head === b.ranges[i]?.head)
  )
}

export class UndoHistory {
  private done: HistoryEntry[] = []
  private undone: HistoryEntry[] = []
  private readonly limit: number
  private readonly groupDelayMs: number

  constructor(options: { limit?: number; groupDelayMs?: number } = {}) {
    this.limit = options.limit ?? 500
    this.groupDelayMs = options.groupDelayMs ?? 500
  }

  get canUndo(): boolean {
    return this.done.length > 0
  }

  get canRedo(): boolean {
    return this.undone.length > 0
  }

  get depth(): number {
    return this.done.length
  }

  record(step: Step, kind: EditKind, time: number, before: Selection, after: Selection, closes: boolean): void {
    this.undone = []
    const last = this.done[this.done.length - 1]
    const canMerge =
      last !== undefined &&
      kind !== 'other' &&
      last.kind === kind &&
      !last.closed &&
      time - last.time <= this.groupDelayMs &&
      sameSelection(last.selectionAfter, before)
    if (canMerge) {
      last.steps.push(step)
      last.time = time
      last.selectionAfter = after
      last.closed = closes
      return
    }
    this.done.push({ steps: [step], kind, time, selectionBefore: before, selectionAfter: after, closed: closes })
    if (this.done.length > this.limit) this.done.shift()
  }

  /** Geri alınacak adımı yığından alır (uygulamayı çağıran yapar). */
  popUndo(): HistoryEntry | undefined {
    const entry = this.done.pop()
    if (entry) this.undone.push(entry)
    const previous = this.done[this.done.length - 1]
    if (previous) previous.closed = true // geri almadan sonra yazılan, eski grupla birleşmesin
    return entry
  }

  popRedo(): HistoryEntry | undefined {
    const entry = this.undone.pop()
    if (entry) this.done.push({ ...entry, closed: true })
    return entry
  }
}
