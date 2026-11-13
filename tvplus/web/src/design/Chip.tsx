/**
 * Çip ve Geçiş (DESIGN_SPEC §2). Çipte seçili durum BEYAZ; sarı yalnız Geçiş'in seçili parçasında.
 */
import { useRef, type KeyboardEvent, type MouseEventHandler, type ReactElement, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cx } from './cx'
import { Icon } from './Icon'
import './buttons.css'

export interface ChipProps {
  children: ReactNode
  selected?: boolean
  onClick?: MouseEventHandler<HTMLElement>
  /** Bağlantı çipi (uygulama içi yol) */
  to?: string
  className?: string
}

export function Chip({ children, selected, onClick, to, className }: ChipProps): ReactElement {
  const cls = cx('cn-chip', selected && 'cn-chip--selected', className)
  if (to) {
    return (
      <Link className={cls} to={to} onClick={onClick} aria-current={selected ? 'page' : undefined}>
        {children}
      </Link>
    )
  }
  return (
    <button type="button" className={cls} onClick={onClick} aria-pressed={!!selected}>
      {children}
    </button>
  )
}

/** Uygulamanın iki modu: Canlı TV (`live`) ve Film & Dizi (`vod`). */
export type AppMode = 'live' | 'vod'

export interface ModeSwitchProps {
  value: AppMode
  onChange: (mode: AppMode) => void
  className?: string
}

const SEGMENTS: { mode: AppMode; label: string }[] = [
  { mode: 'live', label: 'Canlı TV' },
  { mode: 'vod', label: 'Film & Dizi' },
]

/**
 * Geçiş: mobilde tam genişlik (parça 44 px), web'de 280 px (parça 40 px). Seçili parça sarı.
 * Erişilebilirlik: radiogroup; ok tuşlarıyla parça değişir.
 */
export function ModeSwitch({ value, onChange, className }: ModeSwitchProps): ReactElement {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const next: AppMode = value === 'live' ? 'vod' : 'live'
    onChange(next)
    refs.current[next === 'live' ? 0 : 1]?.focus()
  }
  return (
    <div className={cx('cn-mode', className)} role="radiogroup" aria-label="Mod" onKeyDown={onKey}>
      {SEGMENTS.map((s, i) => {
        const on = s.mode === value
        return (
          <button
            key={s.mode}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className="cn-mode__seg"
            onClick={() => onChange(s.mode)}
          >
            {s.mode === 'live' ? <span className="cn-mode__dot" aria-hidden="true" /> : <Icon name="play" size={16} />}
            {s.label}
          </button>
        )
      })}
    </div>
  )
}
