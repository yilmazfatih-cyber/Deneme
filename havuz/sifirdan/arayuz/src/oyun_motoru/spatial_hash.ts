// Uzamsal karma (geniş evre): dünyayı eşit hücrelere böler; her nesne kapladığı hücrelere yazılır. Çarpışma
// adayı yalnız aynı hücreyi paylaşan çiftlerdir; n nesnede n² çift sınamak yerine yakın olanlar sınanır.
// Sonra dar evre (collision.ts) gerçek çakışmayı sınar. Hücre boyu tipik nesne boyunun 1–2 katı seçilir.
// Genişletme: çok farklı boyutlu nesneler için iki düzeyli karma ya da dörtlü ağaç (quadtree) kullanılabilir.
import type { Aabb } from './collision.ts'

export class SpatialHash {
  readonly cellSize: number
  private readonly cells = new Map<string, number[]>()
  private readonly boxes = new Map<number, Aabb>()

  constructor(cellSize: number) {
    if (cellSize <= 0) throw new Error('Hücre boyu pozitif olmalı.')
    this.cellSize = cellSize
  }

  clear(): void {
    this.cells.clear()
    this.boxes.clear()
  }

  private forCells(box: Aabb, fn: (key: string) => void): void {
    const x0 = Math.floor(box.x / this.cellSize)
    const y0 = Math.floor(box.y / this.cellSize)
    const x1 = Math.floor((box.x + box.w) / this.cellSize)
    const y1 = Math.floor((box.y + box.h) / this.cellSize)
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fn(`${x},${y}`)
  }

  insert(id: number, box: Aabb): void {
    this.boxes.set(id, box)
    this.forCells(box, (key) => {
      const list = this.cells.get(key)
      if (list) list.push(id)
      else this.cells.set(key, [id])
    })
  }

  /** Kutuyla aynı hücreleri paylaşan nesneler (aday; gerçek çakışma ayrıca sınanmalı). */
  query(box: Aabb): number[] {
    const found = new Set<number>()
    this.forCells(box, (key) => {
      for (const id of this.cells.get(key) ?? []) found.add(id)
    })
    return [...found]
  }

  /** Hücre paylaşan benzersiz çiftler [küçük, büyük], belirlenimci sırada. */
  pairs(): [number, number][] {
    const seen = new Set<string>()
    const out: [number, number][] = []
    for (const list of this.cells.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = Math.min(list[i] as number, list[j] as number)
          const b = Math.max(list[i] as number, list[j] as number)
          const key = `${a}|${b}`
          if (a === b || seen.has(key)) continue
          seen.add(key)
          out.push([a, b])
        }
      }
    }
    return out.sort((p, q) => p[0] - q[0] || p[1] - q[1])
  }
}
