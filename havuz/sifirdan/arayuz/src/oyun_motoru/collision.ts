// Çarpışma sınamaları (dar evre): eksen hizalı kutu (AABB) ve daire. Çakışma varsa bir "manifold" döner:
// itme yönü (birim normal, A'dan B'ye) ve derinlik. Çözüm (itme, sekme) physics.ts'tedir.
// Kutu sol-üst köşe + boyutla, daire merkez + yarıçapla tanımlanır. y ekseni aşağı doğrudur (ekran gibi).
// Genişletme: döndürülmüş kutu / çokgen için Ayırıcı Eksen Teoremi (SAT) ile `polygonManifold` eklenebilir.

export interface Aabb {
  x: number
  y: number
  w: number
  h: number
}

export interface Circle {
  x: number
  y: number
  r: number
}

export interface Manifold {
  /** A'dan B'ye birim normal. */
  nx: number
  ny: number
  depth: number
}

export function aabbOverlap(a: Aabb, b: Aabb): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/** En az iç içe geçen eksen boyunca ayrım. */
export function aabbManifold(a: Aabb, b: Aabb): Manifold | null {
  if (!aabbOverlap(a, b)) return null
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  if (overlapX < overlapY) return { nx: a.x + a.w / 2 < b.x + b.w / 2 ? 1 : -1, ny: 0, depth: overlapX }
  return { nx: 0, ny: a.y + a.h / 2 < b.y + b.h / 2 ? 1 : -1, depth: overlapY }
}

export function circleManifold(a: Circle, b: Circle): Manifold | null {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const radii = a.r + b.r
  const distSq = dx * dx + dy * dy
  if (distSq >= radii * radii) return null
  const dist = Math.sqrt(distSq)
  if (dist === 0) return { nx: 1, ny: 0, depth: radii }
  return { nx: dx / dist, ny: dy / dist, depth: radii - dist }
}

/** Daire ile kutu: kutudaki en yakın nokta bulunur. Normal daireden kutuya doğrudur. */
export function circleAabbManifold(c: Circle, box: Aabb): Manifold | null {
  const closestX = Math.max(box.x, Math.min(c.x, box.x + box.w))
  const closestY = Math.max(box.y, Math.min(c.y, box.y + box.h))
  const dx = closestX - c.x
  const dy = closestY - c.y
  const distSq = dx * dx + dy * dy
  if (distSq >= c.r * c.r) return null
  if (distSq === 0) {
    // Merkez kutunun içinde: daireyi en yakın kenardan dışarı it (normal daireden kutuya, itme tersine).
    const toLeft = c.x - box.x
    const toRight = box.x + box.w - c.x
    const toTop = c.y - box.y
    const toBottom = box.y + box.h - c.y
    const min = Math.min(toLeft, toRight, toTop, toBottom)
    if (min === toLeft) return { nx: 1, ny: 0, depth: toLeft + c.r }
    if (min === toRight) return { nx: -1, ny: 0, depth: toRight + c.r }
    if (min === toTop) return { nx: 0, ny: 1, depth: toTop + c.r }
    return { nx: 0, ny: -1, depth: toBottom + c.r }
  }
  const dist = Math.sqrt(distSq)
  return { nx: dx / dist, ny: dy / dist, depth: c.r - dist }
}

export function circleBounds(c: Circle): Aabb {
  return { x: c.x - c.r, y: c.y - c.r, w: c.r * 2, h: c.r * 2 }
}
