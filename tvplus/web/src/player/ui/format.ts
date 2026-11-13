import { TIME_ZONE } from '../../../../shared/constants'

/** 75 → "1:15", 3725 → "1:02:05" */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(r).padStart(2, '0')}`
}

/** Sesli okuma için: "1 saat 2 dakika 5 saniye" */
export function spokenDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const parts: string[] = []
  if (h) parts.push(`${h} saat`)
  if (m) parts.push(`${m} dakika`)
  if (r || !parts.length) parts.push(`${r} saniye`)
  return parts.join(' ')
}

const hm = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TIME_ZONE })

/** "20:00–23:15" */
export function formatSpan(startIso: string, endIso: string): string {
  return `${hm.format(new Date(startIso))}–${hm.format(new Date(endIso))}`
}

/** "42 dk kaldı" */
export function remainingLabel(endIso: string, now = Date.now()): string {
  const min = Math.max(0, Math.ceil((new Date(endIso).getTime() - now) / 60_000))
  if (min >= 60) {
    const h = Math.floor(min / 60)
    const m = min % 60
    return m ? `${h} sa ${m} dk kaldı` : `${h} sa kaldı`
  }
  return `${min} dk kaldı`
}

export function airingProgress(startIso: string, endIso: string, now = Date.now()): number {
  const a = new Date(startIso).getTime()
  const b = new Date(endIso).getTime()
  if (!(b > a)) return 0
  return Math.max(0, Math.min(1, (now - a) / (b - a)))
}
