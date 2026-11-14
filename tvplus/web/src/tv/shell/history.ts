/**
 * Uygulama içi geçmiş. `navigate(-1)` TV uygulamasının dışına (önceki siteye, about:blank) çıkmasın diye kabuk kendi
 * yığınını tutar: PUSH ekler, POP o girişe kadar kısaltır, REPLACE tepeyi değiştirir. Geri, yığında önceki giriş
 * yoksa Ana Sayfa'ya gider. `previousPath()` bir önceki TV yolunu verir (oynatıcı çıkışta nereye döneceğini bilir).
 * Saf yığın: TvHistoryStack (history.test.ts).
 */
import { useEffect } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { TV_PATHS } from './routes'

export type NavigationKind = 'PUSH' | 'POP' | 'REPLACE'

interface Entry {
  key: string
  /** pathname + search */
  path: string
}

export class TvHistoryStack {
  private entries: Entry[] = []

  /** Yönlendirme olayını uygular. Aynı olay iki kez gelirse (StrictMode) yığın bozulmaz. */
  apply(kind: NavigationKind, key: string, path: string): void {
    const top = this.entries[this.entries.length - 1]
    if (kind === 'PUSH') {
      if (top?.key === key) top.path = path
      else this.entries.push({ key, path })
    } else if (kind === 'REPLACE') {
      if (top) this.entries[this.entries.length - 1] = { key, path }
      else this.entries.push({ key, path })
    } else {
      // POP: geri (ya da ileri / ilk yükleme) — yığında varsa oraya kadar kısalt, yoksa tek giriş say.
      const i = this.entries.findLastIndex((e) => e.key === key)
      if (i >= 0) this.entries.length = i + 1
      else this.entries = [{ key, path }]
    }
  }

  canGoBack(): boolean {
    return this.entries.length > 1
  }

  /** Bir önceki uygulama içi yol (ör. '/tv/baslik/42'); yoksa null. */
  previousPath(): string | null {
    return this.entries.length > 1 ? this.entries[this.entries.length - 2]!.path : null
  }

  currentPath(): string | null {
    return this.entries[this.entries.length - 1]?.path ?? null
  }

  depth(): number {
    return this.entries.length
  }
}

/** Uygulamanın tek geçmiş yığını. */
export const tvHistory = new TvHistoryStack()

/** Kabukta bir kez bağlanır: yönlendirme olaylarını izler. */
export function useHistoryTracker(): void {
  const location = useLocation()
  const type = useNavigationType()
  useEffect(() => {
    tvHistory.apply(type, location.key, `${location.pathname}${location.search}`)
  }, [location.key, location.pathname, location.search, type])
}

export const canGoBack = (): boolean => tvHistory.canGoBack()

/** Bir önceki uygulama içi TV yolu (pathname + sorgu) ya da null. */
export const previousPath = (): string | null => tvHistory.previousPath()

/** Geri: uygulama içinde önceki ekran, yoksa Ana Sayfa. */
export function useTvBack(): () => void {
  const navigate = useNavigate()
  return () => {
    if (canGoBack()) navigate(-1)
    else navigate(TV_PATHS.home, { replace: true })
  }
}
