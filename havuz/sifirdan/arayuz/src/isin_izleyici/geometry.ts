// Işın ve şekiller: küre, düzlem, üçgen. Her kesişim işlevi ışının şekle değdiği en yakın pozitif uzaklığı
// (t) döndürür; değmiyorsa Infinity. EPS, yüzeyden çıkan ışının kendi yüzeyine yeniden çarpmasını
// ("gölge sivilcesi") önler.
// - Küre: |o + t·d − c|² = r² ikinci derece denklemi (d birim → a = 1, sadeleşmiş b).
// - Düzlem: (p − o)·n / (d·n); ışın düzleme paralelse yok.
// - Üçgen: Möller–Trumbore (ağırlık merkezi koordinatları u, v ile; ayrıca düzlem hesabı gerekmez).
// Genişletme: yeni şekil = `Shape` birleşimine üye + `intersect` + `normalAt` + bvh.ts'te sınır kutusu.
import { cross, dot, normalize, sub, type Vec3 } from './vec.ts'
import type { Material } from './material.ts'

export const EPS = 1e-6

export interface Ray {
  origin: Vec3
  dir: Vec3
}

export type Shape =
  | { kind: 'sphere'; center: Vec3; radius: number; material: Material }
  | { kind: 'plane'; point: Vec3; normal: Vec3; material: Material }
  | { kind: 'triangle'; a: Vec3; b: Vec3; c: Vec3; material: Material }

export function intersectSphere(ray: Ray, center: Vec3, radius: number): number {
  const oc = sub(ray.origin, center)
  const b = dot(oc, ray.dir)
  const c = dot(oc, oc) - radius * radius
  const disc = b * b - c
  if (disc < 0) return Infinity
  const s = Math.sqrt(disc)
  const t1 = -b - s
  if (t1 > EPS) return t1
  const t2 = -b + s
  return t2 > EPS ? t2 : Infinity
}

export function intersectPlane(ray: Ray, point: Vec3, normal: Vec3): number {
  const denom = dot(normal, ray.dir)
  if (Math.abs(denom) < 1e-12) return Infinity
  const t = dot(sub(point, ray.origin), normal) / denom
  return t > EPS ? t : Infinity
}

export function intersectTriangle(ray: Ray, a: Vec3, b: Vec3, c: Vec3): number {
  const e1 = sub(b, a)
  const e2 = sub(c, a)
  const p = cross(ray.dir, e2)
  const det = dot(e1, p)
  if (Math.abs(det) < 1e-12) return Infinity
  const inv = 1 / det
  const s = sub(ray.origin, a)
  const u = dot(s, p) * inv
  if (u < 0 || u > 1) return Infinity
  const q = cross(s, e1)
  const v = dot(ray.dir, q) * inv
  if (v < 0 || u + v > 1) return Infinity
  const t = dot(e2, q) * inv
  return t > EPS ? t : Infinity
}

export function intersect(ray: Ray, shape: Shape): number {
  switch (shape.kind) {
    case 'sphere':
      return intersectSphere(ray, shape.center, shape.radius)
    case 'plane':
      return intersectPlane(ray, shape.point, shape.normal)
    case 'triangle':
      return intersectTriangle(ray, shape.a, shape.b, shape.c)
  }
}

/** Yüzeyin dışa bakan birim normali (üçgende köşe sırasına göre: a→b→c saat yönünün tersi). */
export function normalAt(shape: Shape, point: Vec3): Vec3 {
  switch (shape.kind) {
    case 'sphere':
      return normalize(sub(point, shape.center))
    case 'plane':
      return shape.normal
    case 'triangle':
      return normalize(cross(sub(shape.b, shape.a), sub(shape.c, shape.a)))
  }
}
