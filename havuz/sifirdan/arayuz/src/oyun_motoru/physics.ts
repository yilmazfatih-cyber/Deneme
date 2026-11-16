// Basit fizik: yarı örtük Euler tümlevi (önce hız, sonra konum — açık Euler'den kararlı), yerçekimi,
// sürtünme (hıza orantılı sönüm) ve çarpışma çözümü (itme + sekme). Yalnız dört işlem ve karekök kullanılır:
// aynı JS motorunda sonuç bit bit aynıdır (belirlenimcilik).
// Sekme: göreli hızın normal bileşeni ters çevrilip `restitution` ile çarpılır (1 = tam esnek, 0 = yapışkan).
// Genişletme: dönme (açısal hız) ve kütle oranlı iki dinamik cisim çözümü `resolvePair` olarak eklenebilir.
import type { Manifold } from './collision.ts'

export interface Vec {
  x: number
  y: number
}

export interface Body {
  vx: number
  vy: number
  /** Saniyede hız sönümü: 0 = yok, 8 = hızlı durur. */
  drag: number
  /** 0..1 sekme katsayısı. */
  restitution: number
  gravityScale: number
  /** Son adımda yere değdi mi? (zıplama için) */
  onGround: boolean
}

export function createBody(partial: Partial<Body> = {}): Body {
  return { vx: 0, vy: 0, drag: 0, restitution: 0, gravityScale: 1, onGround: false, ...partial }
}

/** Yarı örtük Euler: v += g·dt; v sönümlenir; p += v·dt. */
export function integrate(position: Vec, body: Body, dt: number, gravity: number): void {
  body.vy += gravity * body.gravityScale * dt
  if (body.drag > 0) {
    const damping = 1 / (1 + body.drag * dt)
    body.vx *= damping
    body.vy *= damping
  }
  position.x += body.vx * dt
  position.y += body.vy * dt
}

/**
 * Hareketli cismi sabit bir engelden ayırır. `m` cisimden engele doğru normaldir (collision.ts kuralı).
 * Cisim normal boyunca geri itilir; engele doğru hızı varsa sekme katsayısıyla yansıtılır.
 */
export function resolveStatic(position: Vec, body: Body, m: Manifold): void {
  position.x -= m.nx * m.depth
  position.y -= m.ny * m.depth
  const towards = body.vx * m.nx + body.vy * m.ny
  if (towards > 0) {
    body.vx -= (1 + body.restitution) * towards * m.nx
    body.vy -= (1 + body.restitution) * towards * m.ny
  }
  if (m.ny > 0.5) body.onGround = true
}

/** Düz bir yüzeye (ör. yer) düşen topun t saniye sonraki konumu: testlerde karşılaştırma için kapalı formül. */
export function freeFall(y0: number, vy0: number, gravity: number, t: number): number {
  return y0 + vy0 * t + 0.5 * gravity * t * t
}
