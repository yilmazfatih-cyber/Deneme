// Üç boyutlu vektör matematiği: toplama, ölçekleme, iç/dış çarpım, birim vektör, yansıma ve kırılma.
// Vektörler değişmez düz nesnelerdir ({ x, y, z }); her işlem yeni vektör döndürür (okunaklılık > hız).
// Kırılma Snell yasasıdır: n1·sin(θ1) = n2·sin(θ2); tam iç yansımada `undefined` döner.
// Genişletme: hız gerekirse Float64Array tabanlı "yerinde" sürümler (addInto vb.) ayrı dosyada yazılabilir.

export interface Vec3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

export const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z })
export const ZERO = vec(0, 0, 0)
export const add = (a: Vec3, b: Vec3): Vec3 => vec(a.x + b.x, a.y + b.y, a.z + b.z)
export const sub = (a: Vec3, b: Vec3): Vec3 => vec(a.x - b.x, a.y - b.y, a.z - b.z)
export const scale = (a: Vec3, s: number): Vec3 => vec(a.x * s, a.y * s, a.z * s)
/** Bileşen bileşen çarpım (renk filtresi). */
export const mul = (a: Vec3, b: Vec3): Vec3 => vec(a.x * b.x, a.y * b.y, a.z * b.z)
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
export const cross = (a: Vec3, b: Vec3): Vec3 =>
  vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
export const length = (a: Vec3): number => Math.sqrt(dot(a, a))
export const neg = (a: Vec3): Vec3 => vec(-a.x, -a.y, -a.z)
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(scale(a, 1 - t), scale(b, t))

export function normalize(a: Vec3): Vec3 {
  const len = length(a)
  if (len === 0) throw new Error('Sıfır uzunluklu vektör birim vektöre çevrilemez.')
  return scale(a, 1 / len)
}

/** Gelen yönü (yüzeye doğru) normal etrafında yansıtır: r = d − 2(d·n)n */
export function reflect(d: Vec3, n: Vec3): Vec3 {
  return sub(d, scale(n, 2 * dot(d, n)))
}

/**
 * Kırılan yön. `d` birim gelen yön, `n` gelen tarafa bakan birim normal, `eta` = n1/n2.
 * Tam iç yansıma (sin²θ2 > 1) varsa undefined.
 */
export function refract(d: Vec3, n: Vec3, eta: number): Vec3 | undefined {
  const cosI = -dot(d, n)
  const sin2T = eta * eta * (1 - cosI * cosI)
  if (sin2T > 1) return undefined
  const cosT = Math.sqrt(1 - sin2T)
  return add(scale(d, eta), scale(n, eta * cosI - cosT))
}

/** Schlick yaklaşımıyla Fresnel yansıma oranı (0..1). */
export function schlick(cosine: number, n1: number, n2: number): number {
  const r0 = ((n1 - n2) / (n1 + n2)) ** 2
  return r0 + (1 - r0) * (1 - cosine) ** 5
}
