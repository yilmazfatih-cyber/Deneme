// Karo haritası: dünyayı eşit kare karolara bölen bir ızgara (0 = boş, 1+ = karo türü). Satır dizgilerinden
// kurulur (`fromRows`), böylece bölümler kodun içinde okunaklı biçimde çizilir.
// Kutunun karolar arasında hareketi eksen eksen yapılır: önce x, sonra y. Her eksende yeni konumun kapladığı
// karolar denetlenir; katı karoya girildiyse kutu karonun kenarına yaslanır. Hızlı hareket karo boyundan
// büyükse adımlara bölünür (duvardan geçme / "tünelleme" olmasın).
// Genişletme: eğimli karo, tek yönlü platform (yalnız yukarıdan katı) `isSolid`'e yön parametresiyle eklenir.
import type { Aabb } from './collision.ts'

export interface MoveResult {
  x: number
  y: number
  hitX: boolean
  hitY: boolean
  onGround: boolean
}

export class TileMap {
  readonly width: number
  readonly height: number
  readonly tileSize: number
  private readonly tiles: Uint8Array
  /** Harita dışı katı sayılsın mı? (Oyuncu dünyadan düşmesin.) */
  outsideSolid = true

  constructor(width: number, height: number, tileSize: number, tiles?: Uint8Array) {
    this.width = width
    this.height = height
    this.tileSize = tileSize
    this.tiles = tiles ?? new Uint8Array(width * height)
  }

  /** Satırlardan harita kurar; `legend` karakter → karo türü. Diğer karakterler `onCell`'e bildirilir. */
  static fromRows(
    rows: readonly string[],
    tileSize: number,
    legend: Record<string, number>,
    onCell?: (ch: string, tx: number, ty: number) => void,
  ): TileMap {
    const width = Math.max(...rows.map((r) => r.length))
    const map = new TileMap(width, rows.length, tileSize)
    rows.forEach((row, ty) => {
      for (let tx = 0; tx < row.length; tx++) {
        const ch = row[tx] as string
        const tile = legend[ch]
        if (tile !== undefined) map.set(tx, ty, tile)
        else onCell?.(ch, tx, ty)
      }
    })
    return map
  }

  get(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return this.outsideSolid ? 1 : 0
    return this.tiles[ty * this.width + tx] as number
  }

  set(tx: number, ty: number, tile: number): void {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return
    this.tiles[ty * this.width + tx] = tile
  }

  isSolid(tx: number, ty: number): boolean {
    return this.get(tx, ty) !== 0
  }

  tileBox(tx: number, ty: number): Aabb {
    return { x: tx * this.tileSize, y: ty * this.tileSize, w: this.tileSize, h: this.tileSize }
  }

  /** Kutunun kapladığı karoları dolaşır. */
  forTilesIn(box: Aabb, fn: (tx: number, ty: number) => void): void {
    const s = this.tileSize
    const x0 = Math.floor(box.x / s)
    const y0 = Math.floor(box.y / s)
    const x1 = Math.floor((box.x + box.w - 1e-9) / s)
    const y1 = Math.floor((box.y + box.h - 1e-9) / s)
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) fn(tx, ty)
  }

  private overlapsSolid(box: Aabb): boolean {
    let hit = false
    this.forTilesIn(box, (tx, ty) => {
      if (this.isSolid(tx, ty)) hit = true
    })
    return hit
  }

  /** Kutuyu (dx, dy) kadar karolar arasında taşır. */
  moveBox(box: Aabb, dx: number, dy: number): MoveResult {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (this.tileSize * 0.5)))
    let { x, y } = box
    let hitX = false
    let hitY = false
    let onGround = false
    const s = this.tileSize
    for (let i = 0; i < steps; i++) {
      const nx = x + dx / steps
      if (!hitX && this.overlapsSolid({ x: nx, y, w: box.w, h: box.h })) {
        x = dx > 0 ? Math.floor((nx + box.w) / s) * s - box.w : Math.floor(nx / s) * s + s
        hitX = true
      } else if (!hitX) x = nx
      const ny = y + dy / steps
      if (!hitY && this.overlapsSolid({ x, y: ny, w: box.w, h: box.h })) {
        y = dy > 0 ? Math.floor((ny + box.h) / s) * s - box.h : Math.floor(ny / s) * s + s
        hitY = true
        if (dy > 0) onGround = true
      } else if (!hitY) y = ny
    }
    return { x, y, hitX, hitY, onGround }
  }

  /** Görünen karoları dolaşır (çizim için; görünmeyenler hiç dolaşılmaz). */
  forEachVisible(view: Aabb, fn: (tx: number, ty: number, tile: number) => void): void {
    this.forTilesIn(view, (tx, ty) => {
      if (tx >= 0 && ty >= 0 && tx < this.width && ty < this.height) {
        const tile = this.get(tx, ty)
        if (tile !== 0) fn(tx, ty, tile)
      }
    })
  }
}
