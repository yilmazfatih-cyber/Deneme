/**
 * Yan menü (Netflix TV'nin sol menüsü): kapalıyken 6.5 rem genişliğinde yalnız simgeler; odak içine girince 22 rem'e
 * açılır, etiketler görünür ve içerik kararır. Açık/kapalı durumu odaktan türetilir: odak menüdeyse açıktır.
 *   ← (ilk kartta) açar · → ya da Geri kapatır (odak ekranın hatırladığı öğeye döner) · OK seçer.
 */
import { useCallback, type ReactElement } from 'react'
import { FocusScope, useFocusable, useFocusEngine, useFocusWithin, useKeyInterceptor, type FocusEngine } from '../focus'
import { TvAvatar } from './cards'
import { TvIcon, type TvIconName } from './icons'

const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ')

export const TV_RAIL_SCOPE = 'yan-menu'
export const railItemId = (id: string): string => `yan-menu:${id}`

export interface TvRailItem {
  id: string
  label: string
  icon: TvIconName
  /** Şu an gösterilen bölüm (sarı gösterge) */
  active?: boolean
  onSelect: () => void
  /** Menünün altına yaslanır (Ayarlar) */
  bottom?: boolean
}

export interface TvRailProfile {
  name: string
  avatarUrl: string | null
  onSelect: () => void
}

export interface TvRailProps {
  items: readonly TvRailItem[]
  profile?: TvRailProfile | null
  /** → ya da Geri: menüyü kapat (kabuk odağı ekrana döndürür) */
  onClose: () => void
}

/** Menüyü açar: odak etkin bölüme (yoksa ilk öğeye) gider. */
export function openRail(engine: FocusEngine, activeId?: string | null): boolean {
  if (activeId && engine.focus(railItemId(activeId))) return true
  return engine.focusScope(TV_RAIL_SCOPE)
}

function RailEntry({
  id,
  label,
  icon,
  active,
  open,
  onSelect,
  avatar,
}: {
  id: string
  label: string
  icon?: TvIconName
  active?: boolean
  open: boolean
  onSelect: () => void
  avatar?: { url: string | null; name: string }
}): ReactElement {
  const { ref, focused } = useFocusable<HTMLDivElement>({ id: railItemId(id), onEnter: onSelect })
  return (
    <div
      ref={ref}
      role="menuitem"
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      className={cx(
        'tv-rail__item',
        active && 'is-active',
        focused && 'is-focused',
        avatar && 'tv-rail__item--profile',
      )}
    >
      <span className="tv-rail__icon">
        {avatar ? (
          <TvAvatar url={avatar.url} name={avatar.name} size={2.6} />
        ) : (
          icon && <TvIcon name={icon} size={2.2} />
        )}
      </span>
      <span className="tv-rail__label" aria-hidden={!open}>
        {label}
      </span>
    </div>
  )
}

export function TvRail({ items, profile, onClose }: TvRailProps): ReactElement {
  const engine = useFocusEngine()
  const open = useFocusWithin(TV_RAIL_SCOPE)
  // Durum tuş anında motordan okunur (kesici her zaman kayıtlı): işleme gecikmesi Geri'yi kaçırmaz.
  useKeyInterceptor((key) => {
    if (key !== 'BACK' || !engine.isWithin(TV_RAIL_SCOPE)) return false
    onClose()
    return true
  }, 10)
  const onEdge = useCallback(
    (dir: string) => {
      if (dir !== 'right') return false
      onClose()
      return true
    },
    [onClose],
  )
  const top = items.filter((i) => !i.bottom)
  const bottom = items.filter((i) => i.bottom)
  return (
    <>
      <div className={cx('tv-rail-scrim', open && 'is-open')} aria-hidden="true" />
      <FocusScope id={TV_RAIL_SCOPE} trap orientation="vertical" onEdge={onEdge}>
        <nav className={cx('tv-rail', open && 'is-open')} aria-label="Ana menü" role="menu">
          {profile && (
            <div className="tv-rail__profile">
              <RailEntry
                id="profil"
                label={profile.name}
                open={open}
                onSelect={profile.onSelect}
                avatar={{ url: profile.avatarUrl, name: profile.name }}
              />
            </div>
          )}
          <div className="tv-rail__main">
            {top.map((i) => (
              <RailEntry
                key={i.id}
                id={i.id}
                label={i.label}
                icon={i.icon}
                active={i.active}
                open={open}
                onSelect={i.onSelect}
              />
            ))}
          </div>
          <div className="tv-rail__bottom">
            {bottom.map((i) => (
              <RailEntry
                key={i.id}
                id={i.id}
                label={i.label}
                icon={i.icon}
                active={i.active}
                open={open}
                onSelect={i.onSelect}
              />
            ))}
          </div>
        </nav>
      </FocusScope>
    </>
  )
}
