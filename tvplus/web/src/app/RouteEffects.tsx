/**
 * Yol değişiminin yan etkileri: belge başlığı, kaydırma (ileri gidişte en üst, geri dönüşte eski konum),
 * mod hafızası ve `navigate` olay kaydı.
 */
import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import { logEvent } from '../telemetry/logger'
import { modeOfPath, setLastMode } from './mode'

const SUFFIX = ' · TV+'

/** Yol → başlık (sayfalar useDocumentTitle ile daha özel başlık koyabilir). */
export function titleForPath(pathname: string): string {
  const table: [RegExp, string][] = [
    [/^\/film-dizi/, 'Film & Dizi'],
    [/^\/canli/, 'Canlı TV'],
    [/^\/rehber/, 'Rehber'],
    [/^\/ara/, 'Ara'],
    [/^\/kitaplik/, 'Kitaplığım'],
    [/^\/detay\//, 'Detay'],
    [/^\/koleksiyon\//, 'Koleksiyon'],
    [/^\/kisi\//, 'Oyuncu ve ekip'],
    [/^\/tur\/783$/, 'Çocuk'],
    [/^\/tur\//, 'Tür'],
    [/^\/izle\//, 'İzle'],
    [/^\/karsilama/, 'Hoş geldin'],
    [/^\/profiller/, 'Kim izliyor?'],
    [/^\/_tasarim/, 'Tasarım sistemi'],
  ]
  for (const [re, t] of table) if (re.test(pathname)) return t + SUFFIX
  return 'TV+'
}

/** Sayfanın kendi başlığı (ör. film adı): "Kuzgun · TV+". Boş değer verilirse dokunulmaz. */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (title) document.title = title + SUFFIX
  }, [title])
}

const positions = new Map<string, number>()

export function RouteEffects(): null {
  const location = useLocation()
  const navType = useNavigationType()
  const prev = useRef<{ key: string; pathname: string } | null>(null)

  // Geçerli girdinin kaydırma konumunu sürekli sakla.
  useEffect(() => {
    const key = location.key
    const onScroll = () => positions.set(key, window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [location.key])

  useLayoutEffect(() => {
    const before = prev.current
    prev.current = { key: location.key, pathname: location.pathname }
    if (before && before.pathname === location.pathname) return // yalnız sorgu değişti (ör. arama yazımı)
    const saved = positions.get(location.key)
    if (navType === 'POP' && saved !== undefined) {
      // Tembel sayfa yüklenip yükseklik oluşana dek birkaç kare dene (en çok ~1 sn).
      let tries = 0
      let frame = 0
      const restore = () => {
        const max = document.documentElement.scrollHeight - window.innerHeight
        if (max >= saved || tries++ > 60) {
          window.scrollTo(0, Math.min(saved, Math.max(0, max)))
          return
        }
        frame = requestAnimationFrame(restore)
      }
      restore()
      return () => cancelAnimationFrame(frame)
    }
    window.scrollTo(0, 0)
  }, [location.key, location.pathname, navType])

  useEffect(() => {
    document.title = titleForPath(location.pathname)
    const mode = modeOfPath(location.pathname)
    if (mode) setLastMode(mode)
  }, [location.pathname])

  useEffect(() => {
    logEvent('navigate', { path: location.pathname, search: location.search, navigationType: navType })
  }, [location.pathname, location.search, navType])

  return null
}
