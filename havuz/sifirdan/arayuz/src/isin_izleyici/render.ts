// Çizim: her piksel için n×n alt örnek (kenar yumuşatma). Alt örnekler tabakalı titreşimlidir: piksel n×n
// hücreye bölünür, her hücrede rastgele bir nokta seçilir (tohumlu → belirlenimci). Örneklerin ortalaması
// doğrusal uzayda alınır, sonra sRGB'ye çevrilir. Görüntü parça parça (karo) çizilebilir: Web Worker her
// karoyu ayrı gönderir, sayfa onu hemen gösterir (aşamalı çizim).
// Genişletme: uyarlamalı örnekleme (komşularla fark büyükse daha çok örnek) kenar kalitesini ucuza artırır.
import { toByte, type RgbaImage } from './image.ts'
import type { Scene } from './scene.ts'
import { trace } from './shade.ts'
import { add, scale, ZERO, type Vec3 } from './vec.ts'

export interface RenderOptions {
  width: number
  height: number
  /** Kenar başına alt örnek (2 → piksel başına 4 örnek). */
  samples?: number
  seed?: number
}

export interface Tile {
  x: number
  y: number
  w: number
  h: number
}

/** Tohumlu üreteç (mulberry32). Asıl kaynak: oyun_motoru/rng.ts; sistem bağımsız kalsın diye kopya. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function renderPixel(scene: Scene, px: number, py: number, options: RenderOptions): Vec3 {
  const n = Math.max(1, Math.floor(options.samples ?? 1))
  const random = rng(((options.seed ?? 1) * 73856093) ^ (px * 19349663) ^ (py * 83492791))
  const aspect = options.width / options.height
  let sum = ZERO
  for (let sy = 0; sy < n; sy++) {
    for (let sx = 0; sx < n; sx++) {
      const u = (px + (sx + (n > 1 ? random() : 0.5)) / n) / options.width
      const v = (py + (sy + (n > 1 ? random() : 0.5)) / n) / options.height
      sum = add(sum, trace(scene, scene.primaryRay(u, v, aspect)))
    }
  }
  return scale(sum, 1 / (n * n))
}

/** Bir karoyu çizer; RGBA baytlarını döndürür (karo genişliği × yüksekliği × 4). */
export function renderTile(scene: Scene, tile: Tile, options: RenderOptions): Uint8ClampedArray {
  const out = new Uint8ClampedArray(tile.w * tile.h * 4)
  for (let y = 0; y < tile.h; y++) {
    for (let x = 0; x < tile.w; x++) {
      const color = renderPixel(scene, tile.x + x, tile.y + y, options)
      const i = (y * tile.w + x) * 4
      out[i] = toByte(color.x)
      out[i + 1] = toByte(color.y)
      out[i + 2] = toByte(color.z)
      out[i + 3] = 255
    }
  }
  return out
}

export function render(scene: Scene, options: RenderOptions): RgbaImage {
  const data = renderTile(scene, { x: 0, y: 0, w: options.width, h: options.height }, options)
  return { width: options.width, height: options.height, data }
}

/** Görüntüyü karolara böler (önce ortadakiler: göz merkeze bakar). */
export function tiles(width: number, height: number, size: number): Tile[] {
  const out: Tile[] = []
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) out.push({ x, y, w: Math.min(size, width - x), h: Math.min(size, height - y) })
  }
  const cx = width / 2
  const cy = height / 2
  const distance = (t: Tile) => (t.x + t.w / 2 - cx) ** 2 + (t.y + t.h / 2 - cy) ** 2
  return out.sort((a, b) => distance(a) - distance(b))
}
