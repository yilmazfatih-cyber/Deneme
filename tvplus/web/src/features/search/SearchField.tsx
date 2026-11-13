/**
 * Arama girdisi (web üst çubuğu ve mobil arama sayfası ortak). Yazdıkça #/ara?q=… açılır:
 * arama sayfasındayken geçmiş `replace` ile güncellenir (her tuş yeni girdi açmaz), başka sayfadan ilk tuşta
 * bir kez ileri gidilir. Esc temizler, Enter aramayı kaydeder.
 */
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactElement } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { cx, Icon } from '../../design'
import { recordSearch } from './searchStore'
import './searchbox.css'

export const SEARCH_PLACEHOLDER = 'Film, dizi, kanal, program, oyuncu ara'

export function SearchField({ className, autoFocus }: { className?: string; autoFocus?: boolean }): ReactElement {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const onSearchPage = pathname === '/ara'
  const urlQ = onSearchPage ? (new URLSearchParams(search).get('q') ?? '') : ''
  const [value, setValue] = useState(urlQ)
  const inputRef = useRef<HTMLInputElement>(null)

  // Adres değişince (geri, öneriye dokunma, sekme) kutu adresi izler.
  useEffect(() => {
    if (onSearchPage) setValue(urlQ)
  }, [urlQ, onSearchPage])

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true })
  }, [autoFocus])

  const go = (q: string) => navigate(`/ara?q=${encodeURIComponent(q)}`, { replace: onSearchPage })

  const change = (q: string) => {
    setValue(q)
    if (onSearchPage || q.trim()) go(q)
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!onSearchPage) go(value)
    recordSearch(value)
    inputRef.current?.blur()
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && value) {
      e.preventDefault()
      e.stopPropagation()
      change('')
    }
  }

  return (
    <form role="search" className={cx('tvp-searchbox', className)} onSubmit={submit}>
      <Icon name="search" size={20} />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => change(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={SEARCH_PLACEHOLDER}
        aria-label="Ara"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
      />
      {value && (
        <button
          type="button"
          className="tvp-searchbox__clear"
          aria-label="Aramayı temizle"
          onClick={() => {
            change('')
            inputRef.current?.focus()
          }}
        >
          <Icon name="close" size={18} />
        </button>
      )}
    </form>
  )
}
