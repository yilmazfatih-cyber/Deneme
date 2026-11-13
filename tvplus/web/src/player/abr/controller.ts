/**
 * ABR karar kuralları (saf işlev):
 *  - hedef = tahminin 0,85 katını aşmayan en yüksek bit hızı (yoksa en düşük)
 *  - yukarı geçiş yalnızca tamponda ≥ 10 sn varken
 *  - tampon < 5 sn ise hedefe hemen in; mevcut bit hızı tahmini aşıyorsa da in
 *  - elle kilit (kalite menüsü) her şeyin önündedir; önizlemede yükseklik sınırı uygulanır
 */

export const ABR_SAFETY = 0.85
export const ABR_UP_MIN_BUFFER_SEC = 10
export const ABR_PANIC_BUFFER_SEC = 5

export interface AbrStream {
  bitrateKbps: number
  height?: number
}

export interface AbrInput {
  /** bit hızına göre artan */
  streams: AbrStream[]
  /** şu an eklenen akışın sırası; ilk karar için null */
  currentIndex: number | null
  estimateKbps: number
  bufferSec: number
  lockedIndex: number | null
  maxHeight: number | null
}

export type AbrReason = 'başlangıç' | 'elle' | 'bant genişliği arttı' | 'bant genişliği düştü' | 'tampon azaldı' | 'sınır' | 'aynı'

export interface AbrDecision {
  index: number
  reason: AbrReason
}

/** Yükseklik sınırına uyan en yüksek sıra (hiçbiri uymuyorsa 0). */
export function maxAllowedIndex(streams: AbrStream[], maxHeight: number | null): number {
  if (maxHeight === null) return streams.length - 1
  let best = 0
  streams.forEach((s, i) => {
    if ((s.height ?? 0) <= maxHeight) best = i
  })
  return best
}

export function targetIndex(streams: AbrStream[], estimateKbps: number, cap: number): number {
  let best = 0
  for (let i = 0; i <= cap && i < streams.length; i++) if (streams[i]!.bitrateKbps <= ABR_SAFETY * estimateKbps) best = i
  return best
}

export function decide(input: AbrInput): AbrDecision {
  const { streams, currentIndex, estimateKbps, bufferSec, lockedIndex, maxHeight } = input
  if (!streams.length) return { index: 0, reason: 'aynı' }
  const cap = maxAllowedIndex(streams, maxHeight)
  if (lockedIndex !== null) {
    const idx = Math.max(0, Math.min(lockedIndex, streams.length - 1))
    return { index: idx, reason: idx === currentIndex ? 'aynı' : 'elle' }
  }
  const target = targetIndex(streams, estimateKbps, cap)
  if (currentIndex === null) return { index: target, reason: 'başlangıç' }
  if (currentIndex > cap) return { index: cap, reason: 'sınır' }
  if (target > currentIndex) {
    return bufferSec >= ABR_UP_MIN_BUFFER_SEC ? { index: target, reason: 'bant genişliği arttı' } : { index: currentIndex, reason: 'aynı' }
  }
  if (target < currentIndex) {
    if (bufferSec < ABR_PANIC_BUFFER_SEC) return { index: target, reason: 'tampon azaldı' }
    if (streams[currentIndex]!.bitrateKbps > estimateKbps) return { index: target, reason: 'bant genişliği düştü' }
  }
  return { index: currentIndex, reason: 'aynı' }
}
