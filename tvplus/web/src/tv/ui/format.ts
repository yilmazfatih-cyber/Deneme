/**
 * TV'nin küçük, saf biçim yardımcıları (web/src/design'dan içe aktarmamak için kopyalandı). Saat 24'lük, İstanbul.
 */
import { useEffect, useState } from 'react'
import { TIME_ZONE } from '../../../../shared/constants'

const pad2 = (n: number): string => String(n).padStart(2, '0')

const CLOCK = new Intl.DateTimeFormat('tr-TR', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: TIME_ZONE,
})

/** "21:04" */
export function formatClock(d: Date | string | number): string {
  return CLOCK.format(typeof d === 'object' ? d : new Date(d))
}

/** Geri sayım: 581 → "9:41"; 3700 → "1:01:40". Negatif 0 sayılır. */
export function formatCountdown(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h ? `${h}:${pad2(m)}:${pad2(sec)}` : `${m}:${pad2(sec)}`
}

/** Süre: 5280 → "1 sa 28 dk"; 2580 → "43 dk"; 40 → "1 dk". */
export function formatDuration(totalSec: number): string {
  const min = Math.max(1, Math.round(totalSec / 60))
  const h = Math.floor(min / 60)
  const m = min % 60
  if (!h) return `${m} dk`
  return m ? `${h} sa ${m} dk` : `${h} sa`
}

/** Kalan süre: "42 dk kaldı" · "1 sa 5 dk kaldı" */
export function formatRemaining(totalSec: number): string {
  return `${formatDuration(totalSec)} kaldı`
}

/** "20:00–23:15" */
export function formatTimeRange(start: Date | string | number, end: Date | string | number): string {
  return `${formatClock(start)}–${formatClock(end)}`
}

/** Kodu okunaklı gruplara ayırır: "KLMN4821" → "KLMN-4821" (zaten tireliyse dokunmaz). */
export function formatUserCode(code: string): string {
  if (code.includes('-') || code.length !== 8) return code
  return `${code.slice(0, 4)}-${code.slice(4)}`
}

/** Adresi ekranda göstermek için sadeleştirir: şema ve `kod` parametresi atılır. */
export function displayAddress(url: string): string {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/([?&])kod=[^&#]*&?/, '$1')
    .replace(/[?&]$/, '')
}

/** Belirli aralıkla yenilenen "şimdi" (saat, geri sayım). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}
