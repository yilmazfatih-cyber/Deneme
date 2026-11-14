/**
 * TvBackground — Ana Sayfa / Detay arka planı: sağa yaslı görsel (varsayılan genişlik %68), sola ve aşağı doğru
 * zemine karartma. Görsel değişince yeni görsel yüklenir yüklenmez eskisinin üstünde belirir (çapraz geçiş);
 * hızlı gezinmede ara görseller atlanır. `overlay` görselin üstüne, karartmaların altına çizilir (sessiz tanıtım).
 */
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'

const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ')

interface Layer {
  key: number
  src: string
}

export interface TvBackgroundProps {
  src: string | null | undefined
  /** Görselin genişliği (CSS); varsayılan '68%' */
  width?: string
  /** Görselin yüksekliği (CSS); varsayılan '100%' */
  height?: string
  overlay?: ReactNode
  className?: string
}

export function TvBackground({
  src,
  width = '68%',
  height = '100%',
  overlay,
  className,
}: TvBackgroundProps): ReactElement {
  const [layers, setLayers] = useState<Layer[]>([])
  const seq = useRef(0)

  useEffect(() => {
    if (!src) {
      setLayers([])
      return
    }
    let alive = true
    const img = new Image()
    img.decoding = 'async'
    img.src = src
    const show = (): void => {
      if (!alive) return
      const key = ++seq.current
      // Yalnız son iki katman tutulur: altta eski, üstte yeni (geçiş bitince eski kalkar).
      setLayers((prev) => [...prev.slice(-1), { key, src }])
    }
    if (img.complete && img.naturalWidth) show()
    else {
      img.onload = show
      img.onerror = show
    }
    return () => {
      alive = false
      img.onload = null
      img.onerror = null
    }
  }, [src])

  return (
    <div className={cx('tv-bg', className)} aria-hidden="true">
      <div className="tv-bg__art" style={{ width, height }}>
        {layers.map((l, i) => (
          <img key={l.key} className={cx('tv-bg__img', i === layers.length - 1 && 'is-top')} src={l.src} alt="" />
        ))}
        {overlay && <div className="tv-bg__overlay">{overlay}</div>}
        <div className="tv-bg__fade-left" />
        <div className="tv-bg__fade-bottom" />
      </div>
    </div>
  )
}
