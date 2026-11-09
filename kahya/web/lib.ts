// İstemci yardımcıları: API çağrıları, veri kancası, biçimlendirme.
import { useCallback, useEffect, useState } from 'react'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: method === 'GET' ? undefined : { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  })
  const text = await res.text()
  let data: unknown
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('kahya:oturum'))
    const msg = (data as { error?: string } | null)?.error ?? `İstek başarısız (${res.status})`
    throw new ApiError(res.status, msg)
  }
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
}

type State<T> = { key: string; path: string | null; data?: T; error?: string }

/** GET isteği; yol değişince yeniden yükler. reload() aynı yolu tazeler (eski veri görünür kalır). */
export function useApi<T>(path: string | null) {
  const [nonce, setNonce] = useState(0)
  const key = `${path}#${nonce}`
  const [state, setState] = useState<State<T>>({ key: '', path: null })
  useEffect(() => {
    if (!path) return
    let alive = true
    api.get<T>(path).then(
      (data) => alive && setState({ key, path, data }),
      (e: Error) => alive && setState({ key, path, error: e.message }),
    )
    return () => {
      alive = false
    }
  }, [key, path])
  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const samePath = state.path === path
  return {
    data: samePath ? state.data : undefined,
    error: samePath && state.key === key ? state.error : undefined,
    loading: path !== null && state.key !== key,
    reload,
  }
}

// --- Biçimlendirme ---
const tl = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' })
const tlShort = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  notation: 'compact',
  maximumFractionDigits: 1,
})

export const money = (kurus: number | null | undefined) => (kurus == null ? '—' : tl.format(kurus / 100))
export const moneyShort = (kurus: number) => tlShort.format(kurus / 100)

/** "1.250,50" · "1250,5" · "1250.50" → kuruş */
export function parseTL(input: string): number | null {
  const s = input.replace(/[₺\s]|TL/gi, '')
  if (!s) return null
  let norm = s
  if (s.includes(',')) norm = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) norm = s.replace(/\./g, '')
  const v = Number(norm)
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) : null
}

export const tlInput = (kurus: number) =>
  (kurus / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
]

export function dateTR(d: string | null | undefined): string {
  if (!d) return '—'
  const s = d.length > 10 ? isoDateTR(d) : d
  return `${Number(s.slice(8, 10))} ${MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`
}

/** ISO zaman damgası → İstanbul yerel 'YYYY-AA-GG' */
export function isoDateTR(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

export function dateTimeTR(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function monthTR(m: string): string {
  return `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`
}

export function ago(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'az önce'
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`
  if (diff < 86_400) return `${Math.floor(diff / 3600)} sa önce`
  if (diff < 86_400 * 30) return `${Math.floor(diff / 86_400)} gün önce`
  return dateTR(iso)
}

export const nowISO = () => new Date().toISOString()

export function todayISO(): string {
  return isoDateTR(new Date().toISOString())
}

export function thisMonth(): string {
  return todayISO().slice(0, 7)
}

export function addMonth(m: string, n: number): string {
  const y = Number(m.slice(0, 4))
  const mm = Number(m.slice(5, 7)) - 1 + n
  return `${y + Math.floor(mm / 12)}-${String((((mm % 12) + 12) % 12) + 1).padStart(2, '0')}`
}

export function phoneTR(e164: string | null | undefined): string {
  if (!e164) return '—'
  const m = /^\+90(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(e164)
  return m ? `0${m[1]} ${m[2]} ${m[3]} ${m[4]}` : e164
}

export function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function storageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* gizli pencere vb. */
  }
}

export function download(filename: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
