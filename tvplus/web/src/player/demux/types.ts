/** Bir medya bölümünün dosyadaki bayt aralığı (dahil) ve sunum zamanı (saniye). */
export interface SegmentRef {
  start: number
  end: number
  startTime: number
  endTime: number
}

export interface SegmentIndex {
  segments: SegmentRef[]
  /** Dizinden çıkan toplam süre (sn); bilinmiyorsa son bölümün sonu */
  durationSec: number
}

/** `t` anını içeren bölümün sırası; t son bölümün sonundaysa -1. */
export function locateSegment(segments: SegmentRef[], t: number): number {
  if (!segments.length) return -1
  if (t < segments[0]!.startTime) return 0
  let lo = 0
  let hi = segments.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const s = segments[mid]!
    if (t < s.startTime) hi = mid - 1
    else if (t >= s.endTime) lo = mid + 1
    else return mid
  }
  return -1
}
