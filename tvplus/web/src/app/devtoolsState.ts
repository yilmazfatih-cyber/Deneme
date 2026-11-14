/**
 * "Kaputun altı" panelinin açık / kapalı durumu — özellikler depoyu yoklamadan izlesin diye.
 * Panel (web/src/devtools) durumunu yalnız localStorage `tvp.kaput.v1` içine yazar ve olay yayınlamaz; burada
 * paneli değiştirebilecek tek tek olaylardan sonra (Ctrl+. / Esc, tıklama, başka sekmeden `storage`,
 * toggleDevtoolsPanel) depo bir kez yeniden okunur ve değiştiyse aboneler çağrılır. Yoklama zamanlayıcısı yok.
 *
 *   const open = useDevtoolsOpen()          // React
 *   const off = subscribeDevtools(() => …)  // React dışı; isDevtoolsOpen() anlık değer
 */
import { useSyncExternalStore } from 'react'

const PANEL_KEY = 'tvp.kaput.v1'

function read(): boolean {
  try {
    const raw = localStorage.getItem(PANEL_KEY)
    return raw ? (JSON.parse(raw) as { open?: unknown }).open === true : false
  } catch {
    return false
  }
}

let current = read()
const listeners = new Set<() => void>()
let timer = 0
let installed = false

/** Panel durumunu etkiden sonra yazar: kısa gecikmeyle (ve bir kez daha) yeniden oku. */
export function recheckDevtools(): void {
  window.clearTimeout(timer)
  const check = () => {
    const next = read()
    if (next === current) return
    current = next
    for (const l of listeners) l()
  }
  timer = window.setTimeout(() => {
    check()
    timer = window.setTimeout(check, 250)
  }, 60)
}

function onKey(e: KeyboardEvent): void {
  if (e.key === '.' || e.key === 'Escape') recheckDevtools()
}

function install(): void {
  if (installed) return
  installed = true
  window.addEventListener('keydown', onKey, true)
  document.addEventListener('click', recheckDevtools, true)
  window.addEventListener('storage', recheckDevtools)
}
function uninstall(): void {
  if (!installed || listeners.size) return
  installed = false
  window.removeEventListener('keydown', onKey, true)
  document.removeEventListener('click', recheckDevtools, true)
  window.removeEventListener('storage', recheckDevtools)
}

export function isDevtoolsOpen(): boolean {
  if (!installed) current = read()
  return current
}

export function subscribeDevtools(fn: () => void): () => void {
  listeners.add(fn)
  install()
  return () => {
    listeners.delete(fn)
    uninstall()
  }
}

export function useDevtoolsOpen(): boolean {
  return useSyncExternalStore(subscribeDevtools, isDevtoolsOpen, () => false)
}
