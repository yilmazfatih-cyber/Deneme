// Yay (spring) fiziği: sönümlü harmonik salınıcı m·x'' + c·x' + k·x = 0. Süre yoktur; hareket "durulunca"
// biter. Konum kapalı formülle hesaplanır (kare hızından bağımsız, kesin):
//   ω0 = √(k/m), ζ = c / (2√(k·m))
//   ζ < 1 (az sönümlü, salınır):  x = e^(−ζω0t) · (x0·cos(ωd·t) + (v0 + ζω0·x0)/ωd · sin(ωd·t)),  ωd = ω0√(1−ζ²)
//   ζ = 1 (kritik, aşmadan en hızlı): x = e^(−ω0t) · (x0 + (v0 + ω0·x0)·t)
//   ζ > 1 (aşırı sönümlü, ağır):     x = C1·e^(r1·t) + C2·e^(r2·t),  r = −ω0(ζ ∓ √(ζ²−1))
// Burada x hedefe göre sapmadır (konum = hedef + x). Doğrulama: testte RK4 sayısal tümleviyle karşılaştırılır.
// Genişletme: hız değişince (sürükleyip bırakma) `springState`'e o anki hız verilerek yeni yay başlatılır.

export interface SpringConfig {
  stiffness?: number
  damping?: number
  mass?: number
  /** Bu sapma ve hızın altında yay durmuş sayılır. */
  restDisplacement?: number
  restVelocity?: number
}

export interface SpringState {
  position: number
  velocity: number
  done: boolean
}

export const SPRING_DEFAULTS = { stiffness: 170, damping: 26, mass: 1, restDisplacement: 0.001, restVelocity: 0.001 }

export function dampingRatio(config: SpringConfig = {}): number {
  const { stiffness, damping, mass } = { ...SPRING_DEFAULTS, ...config }
  return damping / (2 * Math.sqrt(stiffness * mass))
}

/** t saniye sonra konum ve hız (from → to, başlangıç hızı v0). */
export function springState(from: number, to: number, t: number, config: SpringConfig = {}, v0 = 0): SpringState {
  const c = { ...SPRING_DEFAULTS, ...config }
  if (c.stiffness <= 0 || c.mass <= 0 || c.damping < 0)
    throw new RangeError('Yay: stiffness ve mass pozitif, damping negatif olmayan olmalı.')
  const x0 = from - to
  const w0 = Math.sqrt(c.stiffness / c.mass)
  const zeta = c.damping / (2 * Math.sqrt(c.stiffness * c.mass))
  let x: number
  let v: number
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta)
    const a = x0
    const b = (v0 + zeta * w0 * x0) / wd
    const e = Math.exp(-zeta * w0 * t)
    const cos = Math.cos(wd * t)
    const sin = Math.sin(wd * t)
    x = e * (a * cos + b * sin)
    v = e * ((b * wd - zeta * w0 * a) * cos - (a * wd + zeta * w0 * b) * sin)
  } else if (zeta === 1) {
    const b = v0 + w0 * x0
    const e = Math.exp(-w0 * t)
    x = e * (x0 + b * t)
    v = e * (b - w0 * (x0 + b * t))
  } else {
    const root = Math.sqrt(zeta * zeta - 1)
    const r1 = -w0 * (zeta - root)
    const r2 = -w0 * (zeta + root)
    const c2 = (v0 - r1 * x0) / (r2 - r1)
    const c1 = x0 - c2
    x = c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t)
    v = c1 * r1 * Math.exp(r1 * t) + c2 * r2 * Math.exp(r2 * t)
  }
  const done = Math.abs(x) < c.restDisplacement && Math.abs(v) < c.restVelocity
  return { position: done ? to : to + x, velocity: done ? 0 : v, done }
}

/** Yayın durulma süresi (saniye): 1/60 s adımlarla ilk "durdu" anı (en çok `limit` saniye). */
export function settleTime(from: number, to: number, config: SpringConfig = {}, v0 = 0, limit = 30): number {
  for (let t = 0; t <= limit; t += 1 / 60) if (springState(from, to, t, config, v0).done) return t
  return limit
}

/** Karşılaştırma için sayısal çözüm: dördüncü derece Runge-Kutta ile bir adım. */
export function rk4Step(x: number, v: number, dt: number, config: SpringConfig = {}): [number, number] {
  const c = { ...SPRING_DEFAULTS, ...config }
  const acc = (px: number, pv: number) => (-c.stiffness * px - c.damping * pv) / c.mass
  const k1x = v
  const k1v = acc(x, v)
  const k2x = v + (k1v * dt) / 2
  const k2v = acc(x + (k1x * dt) / 2, v + (k1v * dt) / 2)
  const k3x = v + (k2v * dt) / 2
  const k3v = acc(x + (k2x * dt) / 2, v + (k2v * dt) / 2)
  const k4x = v + k3v * dt
  const k4v = acc(x + k3x * dt, v + k3v * dt)
  return [x + ((k1x + 2 * k2x + 2 * k3x + k4x) * dt) / 6, v + ((k1v + 2 * k2v + 2 * k3v + k4v) * dt) / 6]
}
