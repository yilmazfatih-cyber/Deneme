/**
 * Uzamsal gezinmenin saf geometrisi: yön tuşuna basıldığında sıradaki odak adayını seçer. DOM yok; birim testi
 * geometry.test.ts.
 *
 * Kural (her yön için aynı, eksenler döndürülerek):
 *   1. Aday, yönün yarı düzleminde olmalı: SAĞ için adayın sol kenarı mevcudun sol kenarından, sağ kenarı da mevcudun
 *      sağ kenarından ileride (üst üste binen — ör. büyümüş kartın altında kalan — komşular da aday sayılır).
 *   2. "En yakın hat": birincil eksendeki boşluğu en küçük olan adayın hattı (± mevcudun birincil boyunun yarısı).
 *      Böylece ↓ her zaman bir alttaki satıra iner; iki satır aşağıdaki hizalı kart, bir alttaki kayık karta yeğlenmez
 *      (düzensiz ızgaralarda son satırın son kartına inilir).
 *   3. Hat içinde: ikincil eksende örtüşen adaylar önce; sonra puan = birincil boşluk + 2 × ikincil boşluk;
 *      sonra merkezler arası ikincil uzaklık; sonra kayıt sırası; en son kimlik (belirlenimci).
 */

export type Direction = 'up' | 'down' | 'left' | 'right'

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export interface Candidate {
  id: string
  rect: Rect
  /** Eşitlikte küçük olan kazanır (belge / kayıt sırası) */
  order?: number
}

const EPS = 0.5
const SECONDARY_WEIGHT = 2

interface Span {
  /** birincil eksende başlangıç / bitiş (yön boyunca artan) */
  p0: number
  p1: number
  /** ikincil eksen */
  s0: number
  s1: number
}

/** Dikdörtgeni yöne göre döndürür: birincil eksen hep "ileri" doğru artar. */
function span(r: Rect, dir: Direction): Span {
  const right = r.left + r.width
  const bottom = r.top + r.height
  switch (dir) {
    case 'right':
      return { p0: r.left, p1: right, s0: r.top, s1: bottom }
    case 'left':
      return { p0: -right, p1: -r.left, s0: r.top, s1: bottom }
    case 'down':
      return { p0: r.top, p1: bottom, s0: r.left, s1: right }
    case 'up':
      return { p0: -bottom, p1: -r.top, s0: r.left, s1: right }
  }
}

export const isUsableRect = (r: Rect | null | undefined): r is Rect =>
  !!r && Number.isFinite(r.left) && Number.isFinite(r.top) && r.width > 0 && r.height > 0

/** Aday yönün yarı düzleminde mi? */
export function inDirection(from: Rect, to: Rect, dir: Direction): boolean {
  const a = span(from, dir)
  const b = span(to, dir)
  return b.p0 > a.p0 + EPS && b.p1 > a.p1 + EPS
}

interface Scored<T> {
  c: T
  primary: number
  secondaryGap: number
  centerDelta: number
  overlaps: boolean
}

function score<T extends Candidate>(from: Rect, c: T, dir: Direction): Scored<T> {
  const a = span(from, dir)
  const b = span(c.rect, dir)
  const primary = Math.max(0, b.p0 - a.p1)
  const secondaryGap = Math.max(0, b.s0 - a.s1, a.s0 - b.s1)
  const overlap = Math.min(a.s1, b.s1) - Math.max(a.s0, b.s0)
  const centerDelta = Math.abs((a.s0 + a.s1) / 2 - (b.s0 + b.s1) / 2)
  return { c, primary, secondaryGap, centerDelta, overlaps: overlap > EPS }
}

function compare<T extends Candidate>(x: Scored<T>, y: Scored<T>): number {
  if (x.overlaps !== y.overlaps) return x.overlaps ? -1 : 1
  const sx = x.primary + SECONDARY_WEIGHT * x.secondaryGap
  const sy = y.primary + SECONDARY_WEIGHT * y.secondaryGap
  if (Math.abs(sx - sy) > EPS) return sx - sy
  if (Math.abs(x.centerDelta - y.centerDelta) > EPS) return x.centerDelta - y.centerDelta
  const ox = x.c.order ?? Number.MAX_SAFE_INTEGER
  const oy = y.c.order ?? Number.MAX_SAFE_INTEGER
  if (ox !== oy) return ox - oy
  return x.c.id < y.c.id ? -1 : x.c.id > y.c.id ? 1 : 0
}

/**
 * `current` dikdörtgeninden `dir` yönünde gidilecek adayı seçer; yoksa null.
 * Kullanılamayan (boyutsuz, gizli) dikdörtgenler yok sayılır.
 */
export function pickNext<T extends Candidate>(current: Rect, candidates: readonly T[], dir: Direction): T | null {
  const scored: Scored<T>[] = []
  for (const c of candidates) {
    if (!isUsableRect(c.rect) || !inDirection(current, c.rect, dir)) continue
    scored.push(score(current, c, dir))
  }
  if (!scored.length) return null
  const a = span(current, dir)
  const band = Math.max(1, (a.p1 - a.p0) / 2)
  let line = Infinity
  for (const s of scored) line = Math.min(line, s.primary)
  const nearest = scored.filter((s) => s.primary <= line + band)
  nearest.sort(compare)
  return nearest[0]?.c ?? null
}

/**
 * Yön gözetmeden en yakın aday (kapsama girerken yön adayı yoksa): merkezler arası uzaklık, sonra sıra.
 */
export function pickNearest<T extends Candidate>(current: Rect, candidates: readonly T[]): T | null {
  const cx = current.left + current.width / 2
  const cy = current.top + current.height / 2
  let best: T | null = null
  let bestD = Infinity
  for (const c of candidates) {
    if (!isUsableRect(c.rect)) continue
    const d = Math.hypot(c.rect.left + c.rect.width / 2 - cx, c.rect.top + c.rect.height / 2 - cy)
    const better =
      d < bestD - EPS ||
      (Math.abs(d - bestD) <= EPS &&
        best !== null &&
        (c.order ?? Number.MAX_SAFE_INTEGER) < (best.order ?? Number.MAX_SAFE_INTEGER))
    if (best === null || better) {
      best = c
      bestD = d
    }
  }
  return best
}

/** Dikdörtgenlerin birleşimi (kapsamın kendi dikdörtgeni); boşsa null. */
export function unionRect(rects: readonly (Rect | null)[]): Rect | null {
  let l = Infinity
  let t = Infinity
  let r = -Infinity
  let b = -Infinity
  for (const x of rects) {
    if (!isUsableRect(x)) continue
    l = Math.min(l, x.left)
    t = Math.min(t, x.top)
    r = Math.max(r, x.left + x.width)
    b = Math.max(b, x.top + x.height)
  }
  return Number.isFinite(l) ? { left: l, top: t, width: r - l, height: b - t } : null
}

export const isHorizontal = (dir: Direction): boolean => dir === 'left' || dir === 'right'
