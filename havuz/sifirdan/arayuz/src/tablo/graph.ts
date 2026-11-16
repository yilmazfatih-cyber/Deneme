// Bağımlılık çizgesi ve yeniden hesap sırası. Her formül hücresinin okuduğu hücreler (öncüller) ve her hücreyi
// okuyan formüller (ardıllar) iki yönlü tutulur. Bir hücre değişince:
//   1) etkilenenler = hücre + ardıllarının ardılları… (yalnız bunlar yeniden hesaplanır)
//   2) Tarjan algoritmasıyla bu alt çizgenin güçlü bağlı bileşenleri bulunur; bileşenler topolojik sıraya
//      dizilir (öncül önce). Birden çok hücreli ya da kendine bağlı bileşen bir döngüdür → #DÖNGÜ!.
// Tarjan özyinelemesiz yazıldı: 100.000 hücrelik bir zincirde bile çağrı yığını taşmaz.
// Genişletme: aralık başvurularını hücre hücre açmak yerine aralık dizini (interval tree) ile tutmak
// büyük sayfalarda belleği azaltır; arayüz (`setPrecedents`, `recalcOrder`) aynı kalır.

export class DependencyGraph {
  private readonly precedents = new Map<string, Set<string>>()
  private readonly dependents = new Map<string, Set<string>>()

  /** Hücrenin okuduğu hücreleri baştan belirler (eski kenarlar silinir). */
  setPrecedents(cell: string, reads: Iterable<string>): void {
    for (const old of this.precedents.get(cell) ?? []) this.dependents.get(old)?.delete(cell)
    const next = new Set(reads)
    if (next.size === 0) this.precedents.delete(cell)
    else this.precedents.set(cell, next)
    for (const source of next) {
      let set = this.dependents.get(source)
      if (!set) this.dependents.set(source, (set = new Set()))
      set.add(cell)
    }
  }

  dependentsOf(cell: string): ReadonlySet<string> {
    return this.dependents.get(cell) ?? new Set()
  }

  precedentsOf(cell: string): ReadonlySet<string> {
    return this.precedents.get(cell) ?? new Set()
  }

  /** Değişen hücrelerden ulaşılabilen tüm hücreler (kendileri dahil). */
  affectedBy(changed: Iterable<string>): Set<string> {
    const seen = new Set<string>()
    const stack = [...changed]
    while (stack.length > 0) {
      const cell = stack.pop() as string
      if (seen.has(cell)) continue
      seen.add(cell)
      for (const next of this.dependentsOf(cell)) if (!seen.has(next)) stack.push(next)
    }
    return seen
  }

  /**
   * Etkilenen hücrelerin hesap sırası: bileşen listesi, topolojik sırada. `cyclic` bileşenin döngü olduğunu söyler.
   * Tarjan bileşenleri "ters topolojik" sırada üretir (önce ardıllar); sonda ters çeviririz.
   */
  recalcOrder(affected: ReadonlySet<string>): { cells: string[]; cyclic: boolean }[] {
    const index = new Map<string, number>()
    const low = new Map<string, number>()
    const onStack = new Set<string>()
    const stack: string[] = []
    const components: { cells: string[]; cyclic: boolean }[] = []
    let counter = 0
    const successors = (cell: string) => [...this.dependentsOf(cell)].filter((c) => affected.has(c))

    for (const root of affected) {
      if (index.has(root)) continue
      const work: { cell: string; next: string[]; i: number }[] = []
      const open = (cell: string) => {
        index.set(cell, counter)
        low.set(cell, counter++)
        stack.push(cell)
        onStack.add(cell)
        work.push({ cell, next: successors(cell), i: 0 })
      }
      open(root)
      while (work.length > 0) {
        const frame = work[work.length - 1] as (typeof work)[number]
        if (frame.i < frame.next.length) {
          const next = frame.next[frame.i++] as string
          if (!index.has(next)) open(next)
          else if (onStack.has(next))
            low.set(frame.cell, Math.min(low.get(frame.cell) as number, index.get(next) as number))
          continue
        }
        work.pop()
        const parent = work[work.length - 1]
        if (parent) low.set(parent.cell, Math.min(low.get(parent.cell) as number, low.get(frame.cell) as number))
        if (low.get(frame.cell) !== index.get(frame.cell)) continue
        const cells: string[] = []
        let member: string
        do {
          member = stack.pop() as string
          onStack.delete(member)
          cells.push(member)
        } while (member !== frame.cell)
        const selfLoop = cells.length === 1 && this.dependentsOf(frame.cell).has(frame.cell)
        components.push({ cells, cyclic: cells.length > 1 || selfLoop })
      }
    }
    return components.reverse()
  }
}
