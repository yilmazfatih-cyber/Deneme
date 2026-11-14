/**
 * Çerez kavanozu: tarayıcının çerez deposunun yerine geçer (sayfa ile arka uç arasında gerçek HTTP yok).
 * Tarayıcı başına tek arka uç olduğu için tek kavanoz vardır; sanal cihazlar (`?vd=`) çerez adlarına `__<ad>` ekini
 * sunucu koyduğundan birbirine karışmaz. Kalıcı çerezler `/data/.tarayici/cerezler.json`'a yazılır (dosya sistemiyle
 * birlikte IndexedDB'ye gider). Oturum çerezleri (Max-Age/Expires yok) de yazılır ama arka uç
 * SESSION_IDLE_MS'ten uzun süre kapalı kaldıysa açılışta atılır: "tarayıcı kapandı" sayılır.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from '../node/fs'

const FILE = '/data/.tarayici/cerezler.json'
const SESSION_IDLE_MS = 30 * 60 * 1000
const TOUCH_MS = 60 * 1000

interface Cookie {
  value: string
  /** epoch ms; null → oturum çerezi */
  expires: number | null
}

interface Saved {
  savedAt: number
  cookies: Record<string, Cookie>
}

const jar = new Map<string, Cookie>()
let touchTimer: ReturnType<typeof setInterval> | null = null

function save(): void {
  const data: Saved = { savedAt: Date.now(), cookies: Object.fromEntries(jar) }
  try {
    mkdirSync('/data/.tarayici', { recursive: true })
    writeFileSync(FILE, JSON.stringify(data))
  } catch (err) {
    console.warn('[TV+ arka uç] çerezler kaydedilemedi', err)
  }
}

export function loadCookies(): void {
  jar.clear()
  if (existsSync(FILE)) {
    try {
      const saved = JSON.parse(String(readFileSync(FILE, 'utf8'))) as Saved
      const now = Date.now()
      const sessionAlive = now - saved.savedAt < SESSION_IDLE_MS
      for (const [k, c] of Object.entries(saved.cookies ?? {})) {
        if (c.expires === null ? sessionAlive : c.expires > now) jar.set(k, c)
      }
    } catch {
      /* bozuk dosya: boş kavanoz */
    }
  }
  // Oturum çerezlerinin "son görülme" anı düzenli tazelenir.
  touchTimer ??= setInterval(() => {
    if ([...jar.values()].some((c) => c.expires === null)) save()
  }, TOUCH_MS)
}

/** İsteğe eklenecek `cookie` başlığı. */
export function cookieHeader(): string | null {
  const now = Date.now()
  const parts: string[] = []
  for (const [k, c] of jar) {
    if (c.expires !== null && c.expires <= now) {
      jar.delete(k)
      continue
    }
    parts.push(`${k}=${c.value}`)
  }
  return parts.length ? parts.join('; ') : null
}

/** Yanıt başlıklarındaki Set-Cookie'leri kavanoza işler ve sayfaya gitmeyecek biçimde ayıklar. */
export function absorb(headers: [string, string][]): [string, string][] {
  const kept: [string, string][] = []
  let changed = false
  for (const [k, v] of headers) {
    if (k.toLowerCase() !== 'set-cookie') {
      kept.push([k, v])
      continue
    }
    if (apply(v)) changed = true
  }
  if (changed) save()
  return kept
}

function apply(line: string): boolean {
  const [pair, ...attrs] = line.split(';')
  if (!pair) return false
  const eq = pair.indexOf('=')
  if (eq <= 0) return false
  const name = pair.slice(0, eq).trim()
  const value = pair.slice(eq + 1).trim()
  let expires: number | null = null
  let maxAge: number | null = null
  for (const a of attrs) {
    const i = a.indexOf('=')
    const key = (i < 0 ? a : a.slice(0, i)).trim().toLowerCase()
    const val = i < 0 ? '' : a.slice(i + 1).trim()
    if (key === 'max-age') maxAge = Number(val)
    else if (key === 'expires') {
      const t = Date.parse(val)
      if (Number.isFinite(t)) expires = t
    }
  }
  if (maxAge !== null && Number.isFinite(maxAge)) expires = Date.now() + maxAge * 1000
  if (expires !== null && expires <= Date.now()) return jar.delete(name)
  const prev = jar.get(name)
  if (prev && prev.value === value && prev.expires === expires) return false
  jar.set(name, { value, expires })
  return true
}
