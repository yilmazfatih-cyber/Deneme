/**
 * Masaüstü üst menüde arama (UX_SPEC §2): büyüteç simgesi → tıklayınca sola doğru açılan kutu (siyah zemin,
 * 1 px beyaz çerçeve). Kutunun kendisi features/search `SearchBox`'tır (yazınca #/ara?q=…); burada yalnız aç/kapa
 * ve çerçeve var. Arama sayfasındayken kutu hep açıktır; boşken odak giderse ya da yol /ara dışına değişirse
 * (kutuda yazılmıyorken) kapanır.
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useLocation } from 'react-router-dom'
import { SearchBox } from '../features/search'
import { cx, IconButton } from '../ui'

export function HeaderSearch(): ReactElement {
  const { pathname } = useLocation()
  const onSearchPage = pathname === '/ara'
  const [open, setOpen] = useState(onSearchPage)
  const boxRef = useRef<HTMLDivElement>(null)
  const expanded = open || onSearchPage

  // Yol değişince: arama sayfasına girildiyse açık kalır; başka bir sayfaya gidildiyse (bağlantı, geri tuşu,
  // menü) kutu kapanır — yalnız kullanıcı o an kutuda yazıyorsa odak ve kutu korunur.
  useEffect(() => {
    if (onSearchPage) {
      setOpen(true)
      return
    }
    if (!boxRef.current?.contains(document.activeElement)) setOpen(false)
  }, [pathname, onSearchPage])

  const input = () => boxRef.current?.querySelector('input') ?? null

  useEffect(() => {
    if (open) input()?.focus({ preventScroll: true })
  }, [open])

  return (
    <div
      ref={boxRef}
      className={cx('app-hsearch', expanded && 'is-open')}
      onBlur={(e) => {
        if (onSearchPage || boxRef.current?.contains(e.relatedTarget as Node | null)) return
        if (!input()?.value) setOpen(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !input()?.value && !onSearchPage) {
          setOpen(false)
          boxRef.current?.querySelector<HTMLElement>('.app-hsearch__toggle')?.focus()
        }
      }}
    >
      {expanded ? (
        <SearchBox className="app-hsearch__box" />
      ) : (
        <IconButton icon="search" label="Ara" className="app-hsearch__toggle" onClick={() => setOpen(true)} />
      )}
    </div>
  )
}
