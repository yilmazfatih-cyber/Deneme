/**
 * Açılır menü: üç nokta düğmesi + eylem listesi. Tarayıcının `popover` özelliğiyle üst katmanda açılır; dışarı
 * tıklayınca ya da Esc ile kapanır. Klavye: ↑/↓ öğeler arasında, Home/End uçlara, Esc kapatır ve odağı düğmeye
 * döndürür, Tab menüyü kapatır.
 *
 *   <Menu label="Görev seçenekleri" items={[
 *     { label: 'Düzenle', icon: Pencil, onSelect: () => navigate(…) },
 *     { label: 'Sil', icon: Trash, tone: 'danger', onSelect: remove },
 *   ]} />
 *
 * Genişletme: ayraç gerekiyorsa öğeyi `{ separator: true }` biçiminde destekleyecek şekilde genişletin.
 */
import { EllipsisVertical, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from './cx.ts'

export interface MenuItem {
  readonly label: string
  readonly icon?: LucideIcon
  readonly onSelect: () => void
  readonly tone?: 'default' | 'danger'
  readonly disabled?: boolean
}

export interface MenuProps {
  /** Düğmenin ekran okuyucu adı. */
  readonly label: string
  readonly items: readonly MenuItem[]
  readonly icon?: LucideIcon
  /** Düğmede simge yerine görünen içerik (ör. alan adı). */
  readonly trigger?: ReactNode
  readonly align?: 'start' | 'end'
  readonly triggerClassName?: string
}

export function Menu({
  label,
  items,
  icon: Icon = EllipsisVertical,
  trigger,
  align = 'end',
  triggerClassName,
}: MenuProps) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const close = (returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) buttonRef.current?.focus()
  }

  // Açılınca üst katmana al, düğmenin altına yerleştir ve ilk öğeye odaklan.
  useLayoutEffect(() => {
    const menu = menuRef.current
    const button = buttonRef.current
    if (!open || !menu || !button) return
    menu.showPopover()
    const rect = button.getBoundingClientRect()
    const width = menu.offsetWidth
    const left = align === 'end' ? rect.right - width : rect.left
    menu.style.left = `${Math.max(8, Math.min(left, window.innerWidth - width - 8))}px`
    const below = rect.bottom + 6
    const fitsBelow = below + menu.offsetHeight < window.innerHeight - 8
    menu.style.top = `${fitsBelow ? below : Math.max(8, rect.top - menu.offsetHeight - 6)}px`
    menu.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus()
  }, [open, align])

  // Dışarı tıklama / Esc ile tarayıcı kapatırsa durumu eşitle.
  useEffect(() => {
    const menu = menuRef.current
    if (!open || !menu) return
    const onToggle = (event: Event) => {
      if ((event as ToggleEvent).newState === 'closed') setOpen(false)
    }
    menu.addEventListener('toggle', onToggle)
    return () => menu.removeEventListener('toggle', onToggle)
  }, [open])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = [
      ...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? []),
    ]
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const focus = (next: number) => buttons[(next + buttons.length) % buttons.length]?.focus()
    if (event.key === 'ArrowDown') focus(index + 1)
    else if (event.key === 'ArrowUp') focus(index - 1)
    else if (event.key === 'Home') focus(0)
    else if (event.key === 'End') focus(buttons.length - 1)
    else if (event.key === 'Escape') close(true)
    else if (event.key === 'Tab') close(false)
    else return
    event.preventDefault()
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={trigger ? undefined : label}
        title={trigger ? undefined : label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={cx(
          'inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center gap-2 rounded-xl text-ink transition-colors hover:bg-surface-2',
          triggerClassName,
        )}
      >
        {trigger ?? <Icon aria-hidden size={22} />}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          popover="auto"
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          className="menu-in fixed m-0 min-w-56 max-w-[calc(100vw-1rem)] rounded-2xl border border-line bg-surface p-1.5 text-ink shadow-xl"
        >
          {items.map((item, index) => {
            const ItemIcon = item.icon
            return (
              <button
                key={`${index}-${item.label}`}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  close(true)
                  item.onSelect()
                }}
                className={cx(
                  'flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left font-medium hover:bg-surface-2 focus-visible:bg-surface-2 disabled:opacity-55',
                  item.tone === 'danger' && 'text-danger',
                )}
              >
                {ItemIcon && <ItemIcon aria-hidden size={20} />}
                {item.label}
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
