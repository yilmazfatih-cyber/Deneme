/**
 * Açıklama kipi: modelin iç işleyişi yalnız istenince görünür.
 *   - "Kaputun altı" paneli açıkken (panelin kalıcı durumu: localStorage `tvp.kaput.v1`), ya da
 *   - adreste `?aciklama=1` varken.
 * Açıkken: her sonuçta puan çipi + öznitelik katkıları penceresi, sayfa altında model sürümü, yetenek bildirimi.
 * Panel kendi durumunu yayınlamadığı için kısayol / tıklamadan sonra depoyu yeniden okuruz (SÖZLEŞME notu).
 */
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

const PANEL_KEY = 'tvp.kaput.v1'

function panelOpen(): boolean {
  try {
    const raw = localStorage.getItem(PANEL_KEY)
    return raw ? (JSON.parse(raw) as { open?: unknown }).open === true : false
  } catch {
    return false
  }
}

export function useInspectMode(): boolean {
  const [params] = useSearchParams()
  const forced = params.get('aciklama') === '1'
  const [open, setOpen] = useState(panelOpen)

  useEffect(() => {
    let timer = 0
    // Panel durumunu etkiden sonra yazar: kısa bir gecikmeyle yeniden oku.
    const recheck = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setOpen(panelOpen()), 120)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '.' || e.key === 'Escape') recheck()
    }
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('click', recheck, true)
    window.addEventListener('storage', recheck)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('click', recheck, true)
      window.removeEventListener('storage', recheck)
    }
  }, [])

  return forced || open
}
