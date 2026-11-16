/**
 * Görünüm ayarları (tema, yazı boyutu, yüksek karşıtlık, azaltılmış hareket). Cihaza özgüdür: hesapla
 * eşitlenmez, localStorage'da durur. `<html>` öğesine `data-*` öznitelikleri olarak uygulanır; renkler
 * styles/index.css içindeki belirteçlerle değişir.
 *
 * Genişletme (yeni görünüm ayarı): şemaya `.default(...)` ile alan ekleyin, `applyAppearance` içinde
 * özniteliğini yazın, CSS'te karşılığını tanımlayın, Ayarlar → Görünüm'e denetimini koyun.
 */
import { useSyncExternalStore } from 'react'
import { z } from 'zod'
import { APP } from '../app/config.ts'

export const THEMES = ['system', 'light', 'dark'] as const
export const FONT_SCALES = ['normal', 'large', 'larger'] as const

export const appearanceSchema = z.object({
  theme: z.enum(THEMES).default('system'),
  fontScale: z.enum(FONT_SCALES).default('normal'),
  highContrast: z.boolean().default(false),
  /** Hareketi azalt: açıksa canlandırmalar kapanır. Kapalıyken de sistemin "hareketi azalt" ayarına uyulur. */
  reduceMotion: z.boolean().default(false),
})
export type Appearance = z.infer<typeof appearanceSchema>

const KEY = `${APP.id}.gorunum`
const DEFAULTS: Appearance = appearanceSchema.parse({})

function read(): Appearance {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    const parsed = appearanceSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

let current: Appearance | null = null
const listeners = new Set<() => void>()

export function getAppearance(): Appearance {
  current ??= read()
  return current
}

function prefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
}

/** Ayarları `<html>` öğesine uygular. */
export function applyAppearance(appearance: Appearance, root: HTMLElement = document.documentElement): void {
  const dark = appearance.theme === 'dark' || (appearance.theme === 'system' && prefersDark())
  root.dataset.theme = dark ? 'dark' : 'light'
  root.dataset.font = appearance.fontScale
  root.dataset.contrast = appearance.highContrast ? 'high' : 'normal'
  root.dataset.motion = appearance.reduceMotion ? 'reduce' : 'normal'
  const color = getComputedStyle(root).getPropertyValue('--canvas').trim()
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color || APP.themeColor)
}

export function setAppearance(appearance: Appearance): void {
  current = appearance
  try {
    localStorage.setItem(KEY, JSON.stringify(appearance))
  } catch {
    // Gizli pencere vb.: ayar bu oturumla sınırlı kalır.
  }
  applyAppearance(appearance)
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return
    current = read()
    applyAppearance(current)
    listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** Uygulama açılırken bir kez: ayarları uygular, sistem teması değişince yeniden uygular. */
export function startAppearance(): void {
  applyAppearance(getAppearance())
  if (typeof matchMedia === 'function') {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyAppearance(getAppearance()))
  }
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribe, getAppearance, getAppearance)
}
