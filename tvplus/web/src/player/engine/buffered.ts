/** TimeRanges yardımcıları. */

export interface Range {
  start: number
  end: number
}

/** Küçük boşlukları (ses/video başlangıç farkı gibi) yok sayma toleransı. */
export const GAP_TOLERANCE = 0.25

export function toRanges(tr: TimeRanges | null | undefined): Range[] {
  const out: Range[] = []
  if (!tr) return out
  for (let i = 0; i < tr.length; i++) out.push({ start: tr.start(i), end: tr.end(i) })
  return out
}

/** `t` anını (tolerans dahilinde) içeren aralık. */
export function rangeAt(ranges: Range[], t: number, tol = GAP_TOLERANCE): Range | null {
  for (const r of ranges) if (t >= r.start - tol && t <= r.end + tol) return r
  return null
}

/** `t`'den ileride kesintisiz tamponlanmış süre (sn). */
export function bufferedAhead(ranges: Range[], t: number, tol = GAP_TOLERANCE): number {
  // bitişik/çok yakın aralıkları birleştir
  let end: number | null = null
  for (const r of ranges) {
    if (end === null) {
      if (t >= r.start - tol && t <= r.end + tol) end = r.end
    } else if (r.start <= end + tol) {
      end = Math.max(end, r.end)
    }
  }
  return end === null ? 0 : Math.max(0, end - t)
}

/** `t`'nin hemen ilerisindeki (en çok `maxGap` sn) aralığın başı — oynatma bir boşlukta takıldıysa atlanacak yer. */
export function nextRangeStart(ranges: Range[], t: number, maxGap = 1): number | null {
  for (const r of ranges) if (r.start > t && r.start - t <= maxGap) return r.start
  return null
}
