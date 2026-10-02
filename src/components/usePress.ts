import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

/**
 * Tek dokunuşla seçim. "Dokunmayı tutma süresi" ayarı > 0 ise, parmak o süre basılı kalınca seçer;
 * titreyen elde yanlış seçimi önler. Klavye (Enter/Boşluk) ve ekran okuyucu her zaman hemen seçer.
 * İlerleme çubuğu CSS animasyonudur (--hold-ms); "Hareketi azalt" açıkken görünmez ama seçim çalışır.
 */
export function usePress(onSelect: () => void, holdMs: number) {
  const [holding, setHolding] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const fired = useRef(false)
  const latest = useRef(onSelect)
  useEffect(() => {
    latest.current = onSelect
  })
  useEffect(() => () => clearTimeout(timer.current), [])

  if (holdMs <= 0) {
    return { holding: false, handlers: { onClick: () => latest.current() } }
  }

  const stop = () => {
    clearTimeout(timer.current)
    setHolding(false)
  }

  return {
    holding,
    handlers: {
      onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
        if (e.button !== 0) return
        fired.current = false
        setHolding(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => {
          fired.current = true
          setHolding(false)
          latest.current()
        }, holdMs)
      },
      onPointerUp: stop,
      onPointerLeave: stop,
      onPointerCancel: stop,
      onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
      onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          latest.current()
        }
      },
      // Fare/dokunma tıklaması tutma süresi dolmadan seçmez; ekran okuyucu tıklaması (detail 0) seçer.
      onClick: (e: { detail: number }) => {
        if (e.detail === 0 && !fired.current) latest.current()
      },
    },
  }
}
