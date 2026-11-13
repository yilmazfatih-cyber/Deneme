/**
 * Yol değişiminin yan etkileri: belge başlığı, kaydırma (ileri gidişte en üst, geri dönüşte eski konum)
 * ve `navigate` olay kaydı. Yalnız sorgu değişirse (ör. `?jbv=` detay penceresi, arama yazımı) sayfa kaymaz.
 */
import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import { logEvent } from '../telemetry/logger'

const SUFFIX = ' · TV+'

/** Yol → başlık (sayfalar useDocumentTitle ile daha özel başlık koyabilir: "Sintel · TV+"). */
export function titleForPath(pathname: string): string {
  const table: [RegExp, string][] = [
    [/^\/goz-at\/diziler/, 'Diziler'],
    [/^\/goz-at\/filmler/, 'Filmler'],
    [/^\/goz-at/, 'Ana Sayfa'],
    [/^\/yeni-ve-populer/, 'Yeni ve Popüler'],
    [/^\/listem/, 'Listem'],
    [/^\/canli/, 'Canlı TV'],
    [/^\/rehber/, 'Rehber'],
    [/^\/ara/, 'Ara'],
    [/^\/baslik\//, 'Detay'],
    [/^\/koleksiyon\//, 'Koleksiyon'],
    [/^\/kisi\//, 'Oyuncu ve ekip'],
    [/^\/tur\//, 'Tür'],
    [/^\/izle\//, 'İzle'],
    [/^\/tvplusim/, "TV+'ım"],
    [/^\/kumanda/, 'Kumanda'],
    [/^\/cihazlar/, 'Cihazlar'],
    [/^\/bagla/, "TV'ye Bağlan"],
    [/^\/vitrin/, 'Cihaz vitrini'],
    [/^\/karsilama/, 'Hoş geldin'],
    [/^\/profiller\/yonet/, 'Profilleri Yönet'],
    [/^\/profiller/, 'Kim izliyor?'],
    [/^\/_ui/, 'Tasarım sistemi'],
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

/**
 * Kaydırma konumları, geçmiş girdisine yazılan kendi kimliğimizle saklanır (history.state.tvpEntry).
 * react-router'ın `location.key`'i güvenilmez: `location.hash = …` ya da elle düzenlenen adres yeni bir girdi açar
 * ama yönlendirici bunu POP olarak bildirir ve anahtar "default" olur. Kimliği olmayan girdi = hiç görülmemiş girdi
 * → en üstten başlar; yalnız daha önce görülmüş bir girdiye geri/ileri dönüşte konum geri yüklenir.
 */
const positions = new Map<string, number>()
let entrySeq = 0

/** Geçerli geçmiş girdisinin kimliği; yoksa üretir ve girdiye yazar. `fresh` = bu girdi ilk kez görülüyor. */
function currentEntry(): { id: string; fresh: boolean } {
  const state = (window.history.state ?? null) as Record<string, unknown> | null
  const existing = state && typeof state.tvpEntry === 'string' ? state.tvpEntry : null
  if (existing) return { id: existing, fresh: false }
  const id = `${Date.now().toString(36)}-${++entrySeq}`
  try {
    window.history.replaceState({ ...(state ?? {}), tvpEntry: id }, '')
  } catch {
    /* geçmiş yazılamıyorsa bu girdi yalnız en üstten açılır */
  }
  return { id, fresh: true }
}

export function RouteEffects(): null {
  const location = useLocation()
  const navType = useNavigationType()
  const prev = useRef<{ entry: string; pathname: string } | null>(null)
  const entryRef = useRef<string | null>(null)
  const lastY = useRef(0)

  // Kaydırma konumu sürekli izlenir; hangi girdiye ait olduğu entryRef'ten okunur.
  useEffect(() => {
    const onScroll = () => {
      lastY.current = window.scrollY
      if (entryRef.current) positions.set(entryRef.current, window.scrollY)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useLayoutEffect(() => {
    const before = prev.current
    if (before) positions.set(before.entry, lastY.current) // ayrılınan girdinin son konumu
    const { id, fresh } = currentEntry()
    entryRef.current = id
    prev.current = { entry: id, pathname: location.pathname }
    if (before && before.pathname === location.pathname && navType !== 'POP') return // yalnız sorgu değişti (ör. arama yazımı)
    const saved = positions.get(id)
    if (!fresh && navType === 'POP' && saved !== undefined) {
      // Tembel sayfa yüklenip yükseklik oluşana dek birkaç kare dene (en çok ~1 sn).
      let tries = 0
      let frame = 0
      const restore = () => {
        const max = document.documentElement.scrollHeight - window.innerHeight
        if (max >= saved || tries++ > 60) {
          window.scrollTo(0, Math.min(saved, Math.max(0, max)))
          lastY.current = window.scrollY
          return
        }
        frame = requestAnimationFrame(restore)
      }
      restore()
      return () => cancelAnimationFrame(frame)
    }
    window.scrollTo(0, 0)
    lastY.current = 0
  }, [location.key, location.pathname, location.search, location.hash, navType])

  useEffect(() => {
    document.title = titleForPath(location.pathname)
  }, [location.pathname])

  useEffect(() => {
    logEvent('navigate', { path: location.pathname, search: location.search, navigationType: navType })
  }, [location.pathname, location.search, navType])

  return null
}
