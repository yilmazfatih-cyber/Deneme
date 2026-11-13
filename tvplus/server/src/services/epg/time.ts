/**
 * İstanbul saati yardımcıları. Türkiye 2016'dan beri yaz saati uygulamaz: sabit UTC+3.
 * Alan servislerinin tüm "bugün", "bu akşam", "gün dönümü" hesapları buradan geçer.
 */
export const TZ_OFFSET_MS = 3 * 60 * 60 * 1000
export const DAY_MS = 24 * 60 * 60 * 1000

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

/** Yerel (İstanbul) takvim parçaları */
export function localParts(d: Date): { y: number; m: number; d: number; hh: number; mm: number } {
  const l = new Date(d.getTime() + TZ_OFFSET_MS)
  return { y: l.getUTCFullYear(), m: l.getUTCMonth() + 1, d: l.getUTCDate(), hh: l.getUTCHours(), mm: l.getUTCMinutes() }
}

/** 1970-01-01'den bu yana yerel gün sayısı */
export function localDayNumber(d: Date): number {
  return Math.floor((d.getTime() + TZ_OFFSET_MS) / DAY_MS)
}

/** Yerel gün numarasının gece yarısı (UTC anı) */
export function localMidnight(dayNumber: number): Date {
  return new Date(dayNumber * DAY_MS - TZ_OFFSET_MS)
}

/** 'YYYY-MM-DD' (yerel) */
export function dayKey(d: Date): string {
  const p = localParts(d)
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`
}

/** 'YYYYMMDD' ve 'HHMM' (yerel) — yayın kimliği parçaları */
export function compactDate(d: Date): string {
  return dayKey(d).replaceAll('-', '')
}
export function compactTime(d: Date): string {
  const p = localParts(d)
  return `${pad(p.hh)}${pad(p.mm)}`
}

/** 'YYYY-MM-DD' (yerel tarih) → o günün yerel gece yarısı; geçersizse null */
export function parseLocalDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - TZ_OFFSET_MS
  return Number.isFinite(t) ? new Date(t) : null
}

/** 'YYYYMMDD' → yerel gün numarası; geçersizse null */
export function dayNumberFromCompact(s: string): number | null {
  const d = parseLocalDate(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`)
  return d ? localDayNumber(d) : null
}
