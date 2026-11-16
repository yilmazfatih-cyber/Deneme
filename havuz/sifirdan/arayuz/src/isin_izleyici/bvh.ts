// Sınırlayıcı hacim hiyerarşisi (BVH): şekilleri iç içe kutulara yerleştirir. Işın bir kutuya değmiyorsa
// içindeki hiçbir şekle bakılmaz; n şekil için ışın başına ~log n kutu sınanır. Kurulum: şekillerin
// merkezleri en geniş eksen boyunca sıralanıp ortadan ikiye bölünür (medyan bölme); yaprakta en çok 4 şekil.
// Düzlemler sonsuz olduğu için BVH'ye girmez; sahne onları ayrıca dener.
// Kutu sınaması "levha" (slab) yöntemidir: her eksende giriş/çıkış t'leri, en geç giriş ≤ en erken çıkış.
// Genişletme: daha iyi ağaç için medyan yerine yüzey alanı sezgisi (SAH) ile bölün; arayüz aynı kalır.
import { EPS, intersect, type Ray, type Shape } from './geometry.ts'
import { vec, type Vec3 } from './vec.ts'

export interface Box {
  min: Vec3
  max: Vec3
}

type Node = { box: Box; left: Node; right: Node; items?: undefined } | { box: Box; items: number[]; left?: undefined; right?: undefined }

const LEAF_SIZE = 4

export function shapeBox(shape: Shape): Box {
  switch (shape.kind) {
    case 'sphere': {
      const { center: c, radius: r } = shape
      return { min: vec(c.x - r, c.y - r, c.z - r), max: vec(c.x + r, c.y + r, c.z + r) }
    }
    case 'triangle': {
      const { a, b, c } = shape
      return {
        min: vec(Math.min(a.x, b.x, c.x), Math.min(a.y, b.y, c.y), Math.min(a.z, b.z, c.z)),
        max: vec(Math.max(a.x, b.x, c.x), Math.max(a.y, b.y, c.y), Math.max(a.z, b.z, c.z)),
      }
    }
    case 'plane':
      throw new Error('Düzlem sonsuzdur; BVH yerine sahnenin düzlem listesine ekleyin.')
  }
}

function union(a: Box, b: Box): Box {
  return {
    min: vec(Math.min(a.min.x, b.min.x), Math.min(a.min.y, b.min.y), Math.min(a.min.z, b.min.z)),
    max: vec(Math.max(a.max.x, b.max.x), Math.max(a.max.y, b.max.y), Math.max(a.max.z, b.max.z)),
  }
}

const centroid = (box: Box, axis: 'x' | 'y' | 'z') => (box.min[axis] + box.max[axis]) / 2

/** Kutuya giriş uzaklığı (değmiyorsa Infinity). `inv` = 1 / yön (her bileşen). */
export function hitBox(box: Box, ray: Ray, inv: Vec3, limit: number): number {
  let tmin = EPS
  let tmax = limit
  for (const axis of ['x', 'y', 'z'] as const) {
    let t0 = (box.min[axis] - ray.origin[axis]) * inv[axis]
    let t1 = (box.max[axis] - ray.origin[axis]) * inv[axis]
    if (t0 > t1) [t0, t1] = [t1, t0]
    if (t0 > tmin) tmin = t0
    if (t1 < tmax) tmax = t1
    if (tmax < tmin) return Infinity
  }
  return tmin
}

export class Bvh {
  readonly shapes: readonly Shape[]
  private readonly root: Node | undefined
  /** Son sorguda sınanan kutu ve şekil sayısı (ölçüm/test için). */
  stats = { boxTests: 0, shapeTests: 0 }

  constructor(shapes: readonly Shape[]) {
    this.shapes = shapes
    const boxes = shapes.map(shapeBox)
    this.root = shapes.length > 0 ? this.build(shapes.map((_, i) => i), boxes) : undefined
  }

  private build(items: number[], boxes: Box[]): Node {
    const box = items.map((i) => boxes[i] as Box).reduce(union)
    if (items.length <= LEAF_SIZE) return { box, items }
    const size = { x: box.max.x - box.min.x, y: box.max.y - box.min.y, z: box.max.z - box.min.z }
    const axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z'
    const sorted = [...items].sort((a, b) => centroid(boxes[a] as Box, axis) - centroid(boxes[b] as Box, axis) || a - b)
    const mid = sorted.length >> 1
    return { box, left: this.build(sorted.slice(0, mid), boxes), right: this.build(sorted.slice(mid), boxes) }
  }

  /** En yakın kesişim: şekil sırası ve uzaklık. `anyHit` ise ilk bulunan (gölge sınaması) yeter. */
  intersect(ray: Ray, limit = Infinity, anyHit = false): { index: number; t: number } | undefined {
    if (!this.root) return undefined
    const inv = vec(1 / ray.dir.x, 1 / ray.dir.y, 1 / ray.dir.z)
    let best: { index: number; t: number } | undefined
    let bestT = limit
    const stack: Node[] = [this.root]
    while (stack.length > 0) {
      const node = stack.pop() as Node
      this.stats.boxTests++
      if (hitBox(node.box, ray, inv, bestT) === Infinity) continue
      if (node.items) {
        for (const index of node.items) {
          this.stats.shapeTests++
          const t = intersect(ray, this.shapes[index] as Shape)
          if (t < bestT) {
            bestT = t
            best = { index, t }
            if (anyHit) return best
          }
        }
      } else {
        stack.push(node.right, node.left)
      }
    }
    return best
  }
}
