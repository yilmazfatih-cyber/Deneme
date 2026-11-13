/**
 * Uygulama içi geçmiş derinliği. `navigate(-1)` TV uygulamasının dışına (önceki siteye, about:blank) çıkmasın diye
 * kabuk kendi yığınını tutar: PUSH ekler, POP çıkarır, REPLACE tepeyi değiştirir. Geri, yığında önceki giriş
 * yoksa Ana Sayfa'ya gider.
 */
import { useEffect } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { TV_PATHS } from './routes'

const stack: string[] = []

/** Kabukta bir kez bağlanır: yönlendirme olaylarını izler. */
export function useHistoryTracker(): void {
  const location = useLocation()
  const type = useNavigationType()
  useEffect(() => {
    const key = location.key
    if (type === 'PUSH') {
      if (stack[stack.length - 1] !== key) stack.push(key)
    } else if (type === 'REPLACE') stack.splice(Math.max(0, stack.length - 1), 1, key)
    else {
      // POP: geri (ya da ileri / ilk yükleme) — yığında varsa oraya kadar kısalt, yoksa tek giriş say.
      const i = stack.lastIndexOf(key)
      if (i >= 0) stack.length = i + 1
      else stack.splice(0, stack.length, key)
    }
  }, [location.key, type])
}

export const canGoBack = (): boolean => stack.length > 1

/** Geri: uygulama içinde önceki ekran, yoksa Ana Sayfa. */
export function useTvBack(): () => void {
  const navigate = useNavigate()
  return () => {
    if (canGoBack()) navigate(-1)
    else navigate(TV_PATHS.home, { replace: true })
  }
}
