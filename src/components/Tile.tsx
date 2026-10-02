import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Fitz } from '../content/schema'
import { useBlobUrl } from '../lib/hooks'
import { Icon, type IconName } from './Icon'
import { usePress } from './usePress'

export interface TileProps {
  label: string
  onSelect: () => void
  symbol?: string
  photo?: Blob
  icon?: IconName
  fitz?: Fitz
  tone?: 'yes' | 'no' | 'urgent' | 'neutral' | 'primary'
  holdMs?: number
  badge?: ReactNode
  /** Ekran okuyucu için ek bilgi */
  description?: string
  disabled?: boolean
  testId?: string
}

/**
 * Kart anatomisi: üstte resim (alanın ~%70'i), altta kelime, kategori renginde kenarlık.
 * Seçilince kısa süre kalın çerçeve gösterir; ses çağıran tarafından çalınır.
 */
export function Tile({
  label,
  onSelect,
  symbol,
  photo,
  icon,
  fitz,
  tone = 'neutral',
  holdMs = 0,
  badge,
  description,
  disabled,
  testId,
}: TileProps) {
  const photoUrl = useBlobUrl(photo)
  const [flash, setFlash] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const select = () => {
    setFlash(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setFlash(false), 700)
    onSelect()
  }
  const { handlers, holding } = usePress(select, holdMs)
  const image = photoUrl ?? symbol

  return (
    <button
      type="button"
      className="tile"
      data-fitz={fitz}
      data-tone={tone}
      data-flash={flash || undefined}
      data-testid={testId}
      aria-label={description ? `${label}. ${description}` : label}
      disabled={disabled}
      {...handlers}
    >
      <span className="tile-image" aria-hidden="true">
        {image ? (
          <img src={image} alt="" draggable={false} className={photoUrl ? 'is-photo' : undefined} />
        ) : icon ? (
          <Icon name={icon} size={48} strokeWidth={2.6} />
        ) : (
          <span className="tile-initial">{label.charAt(0)}</span>
        )}
      </span>
      <span className="tile-label" style={{ '--len': longestWord(label) } as CSSProperties}>
        {label}
      </span>
      {badge ? <span className="tile-badge">{badge}</span> : null}
      {holding ? (
        <span className="tile-hold" style={{ '--hold-ms': `${holdMs}ms` } as CSSProperties} aria-hidden="true" />
      ) : null}
    </button>
  )
}

function longestWord(label: string): number {
  return Math.max(4, ...label.split(/\s+/).map((w) => w.length))
}
