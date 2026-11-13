/**
 * Açılır menü — Netflix hesap menüsü (siyah %90, ince çerçeve, üstte küçük ok; masaüstünde üzerine gelince açılır)
 * ve "Türler ▾" açılır listesi (Dropdown: çok sütunlu).
 *
 *   <Menu label="Profil menüsü" openOnHover align="end"
 *     trigger={(p) => <button {...p}><Avatar …/><Icon name="caret" /></button>}>
 *     <MenuItem leading={<Avatar …/>} onSelect={…}>Çocuk</MenuItem>
 *     <MenuSeparator />
 *     <MenuItem icon="edit" to="/profiller/yonet">Profilleri Yönet</MenuItem>
 *   </Menu>
 * Klavye: tetikte ↓/Enter açar, menüde ↑/↓/Home/End gezer, Esc kapatıp odağı tetiğe döndürür, Tab kapatır.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react'
import { Link } from 'react-router-dom'
import { cx } from './cx'
import { useEscape } from './hooks'
import { Icon, type IconName } from './Icon'
import './overlay.css'

export interface MenuTriggerProps {
  ref: Ref<HTMLButtonElement>
  type: 'button'
  'aria-haspopup': 'menu'
  'aria-expanded': boolean
  'aria-controls': string
  onClick: () => void
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void
  /** Bilgi: menü açık mı (biçim için; DOM'a yaymayın) */
  'data-open': boolean
}

export interface MenuProps {
  /** Tetiği çizer: aldığı özellikleri düğmeye yayın */
  trigger: (props: MenuTriggerProps) => ReactNode
  children: ReactNode
  /** Menünün ekran okuyucu adı */
  label: string
  /** Panel tetiğin hangi kenarına hizalanır; varsayılan 'end' (sağ) */
  align?: 'start' | 'end'
  /** Masaüstünde üzerine gelince aç / ayrılınca kapat (Netflix avatar menüsü) */
  openOnHover?: boolean
  /** 'grid' çok sütunlu kategori listesi */
  variant?: 'list' | 'grid'
  /** 'grid' için sütun sayısı; varsayılan 3 */
  columns?: number
  /** Üstteki küçük ok; varsayılan true ('grid'de yok) */
  arrow?: boolean
  /** Panelin altında ayrı satır: <MenuItem footer>Çıkış</MenuItem> */
  footer?: ReactNode
  onOpenChange?: (open: boolean) => void
  className?: string
}

interface MenuCtx {
  close: (refocus?: boolean) => void
}
const MenuContext = createContext<MenuCtx>({ close: () => {} })

const items = (panel: HTMLElement | null) => Array.from(panel?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])

export function Menu({
  trigger,
  children,
  label,
  align = 'end',
  openOnHover,
  variant = 'list',
  columns = 3,
  arrow,
  footer,
  onOpenChange,
  className,
}: MenuProps): ReactElement {
  const [open, setOpenState] = useState(false)
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLUListElement>(null)
  const hoverTimer = useRef<number | null>(null)
  const focusFirst = useRef(false)

  const setOpen = useCallback(
    (v: boolean) => {
      setOpenState(v)
      onOpenChange?.(v)
    },
    [onOpenChange],
  )
  const close = useCallback(
    (refocus = true) => {
      setOpen(false)
      if (refocus) triggerRef.current?.focus()
    },
    [setOpen],
  )
  useEscape(open, () => close(true))

  useEffect(() => {
    if (!open) return
    if (focusFirst.current) {
      focusFirst.current = false
      items(panelRef.current)[0]?.focus()
    }
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open, setOpen])

  useEffect(
    () => () => {
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
    },
    [],
  )

  const hover = (next: boolean) => {
    if (!openOnHover || !window.matchMedia('(hover: hover)').matches) return
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
    hoverTimer.current = window.setTimeout(() => setOpen(next), next ? 120 : 300)
  }

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      focusFirst.current = true
      if (open) items(panelRef.current)[0]?.focus()
      else setOpen(true)
    }
  }

  const onPanelKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const list = items(panelRef.current)
    const i = list.indexOf(document.activeElement as HTMLElement)
    let next: HTMLElement | undefined
    if (e.key === 'ArrowDown') next = list[(i + 1) % list.length]
    else if (e.key === 'ArrowUp') next = list[(i - 1 + list.length) % list.length]
    else if (e.key === 'Home') next = list[0]
    else if (e.key === 'End') next = list[list.length - 1]
    else if (e.key === 'Tab') close(false)
    if (next) {
      e.preventDefault()
      next.focus()
    }
  }

  const showArrow = arrow ?? variant === 'list'
  return (
    <MenuContext.Provider value={{ close }}>
      <div
        ref={rootRef}
        className={cx('ui-menu', className)}
        onMouseEnter={() => hover(true)}
        onMouseLeave={() => hover(false)}
      >
        {trigger({
          ref: triggerRef,
          type: 'button',
          'aria-haspopup': 'menu',
          'aria-expanded': open,
          'aria-controls': panelId,
          onClick: () => setOpen(!open),
          onKeyDown: onTriggerKey,
          'data-open': open,
        })}
        {open && (
          <ul
            ref={panelRef}
            id={panelId}
            role="menu"
            aria-label={label}
            className={cx(
              'ui-menu__panel',
              `ui-menu__panel--${align}`,
              variant === 'grid' && 'ui-menu__panel--grid',
              !showArrow && 'ui-menu__panel--plain',
            )}
            style={variant === 'grid' ? ({ '--menu-cols': columns } as CSSProperties) : undefined}
            onKeyDown={onPanelKey}
          >
            {children}
            {footer}
          </ul>
        )}
      </div>
    </MenuContext.Provider>
  )
}

export interface MenuItemProps {
  children: ReactNode
  /** Soldaki ikon */
  icon?: IconName
  /** İkon yerine öğe (ör. küçük avatar) */
  leading?: ReactNode
  /** Uygulama içi bağlantı */
  to?: string
  onSelect?: () => void
  /** Etkin öğe (kalın) */
  current?: boolean
  /** Menünün alt satırı biçimi ("Çıkış") */
  footer?: boolean
}

export function MenuItem({ children, icon, leading, to, onSelect, current, footer }: MenuItemProps): ReactElement {
  const { close } = useContext(MenuContext)
  const content = (
    <>
      {leading ?? (icon ? <Icon name={icon} size={20} /> : null)}
      <span className="ui-menu__item-label">{children}</span>
    </>
  )
  const cls = footer ? 'ui-menu__footer' : 'ui-menu__item'
  const select = () => {
    close(false)
    onSelect?.()
  }
  return (
    <li role="none">
      {to !== undefined ? (
        <Link to={to} role="menuitem" className={cls} aria-current={current || undefined} onClick={select}>
          {content}
        </Link>
      ) : (
        <button type="button" role="menuitem" className={cls} aria-current={current || undefined} onClick={select}>
          {content}
        </button>
      )}
    </li>
  )
}

export function MenuSeparator(): ReactElement {
  return <li role="separator" className="ui-menu__sep" />
}

/**
 * "Türler ▾" kalıbı: siyah zeminli, ince beyaz çerçeveli tetik + çok sütunlu liste.
 * Öğeler <MenuItem to="/tur/…">Aksiyon</MenuItem>.
 */
export function Dropdown({
  label,
  children,
  columns = 3,
  align = 'start',
  className,
}: {
  /** Tetik metni ("Türler") */
  label: string
  children: ReactNode
  columns?: number
  align?: 'start' | 'end'
  className?: string
}): ReactElement {
  return (
    <Menu
      label={label}
      align={align}
      variant="grid"
      columns={columns}
      className={className}
      trigger={({ 'data-open': _open, ...p }) => (
        <button {...p} className="ui-dropdown__trigger">
          {label}
          <Icon name="caret" size={18} />
        </button>
      )}
    >
      {children}
    </Menu>
  )
}
