/**
 * Arama girdisi.
 *   variant 'header' (masaüstü üst menü, HeaderSearch çerçeveler): yazdıkça #/ara?q=… — başka sayfadan ilk tuşta bir
 *     kez İLERİ gidilir, arama sayfasındayken adres `replace` ile güncellenir; kutu boşalınca aramanın başladığı
 *     sayfaya dönülür. Altında modelin tamamlama tahminleri açılır (yazılan kısım sönük, tahmin edilen kalan kalın,
 *     tür etiketi); ↑/↓ + Enter ya da işaretçiyle seçilir. Esc önce temizler, boşken kabuk kutuyu kapatır.
 *   variant 'page' (mobil /ara): üstte sabit 36 px girdi + "İptal"; tahminler sayfa gövdesinde listelenir.
 */
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactElement } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { cx, Icon } from '../../ui'
import { highlightPrediction } from './highlight'
import { predictionKindLabel, type SearchPrediction } from './searchModel'
import { historyIndex, recordSearch, searchOrigin, setSearchOrigin } from './searchStore'
import { usePredictions } from './useSearch'
import './searchbox.css'

export const SEARCH_PLACEHOLDER = 'Başlıklar, kişiler, türler'

export interface SearchFieldProps {
  className?: string
  variant?: 'header' | 'page'
  autoFocus?: boolean
  /** Mobil "İptal" */
  onCancel?: () => void
}

/** Adres: /ara?q=… (+ `tam=1` → yazım düzeltmesiz) */
export const searchPath = (q: string, exact = false) =>
  q ? `/ara?q=${encodeURIComponent(q)}${exact ? '&tam=1' : ''}` : '/ara'

export function SearchField({ className, variant = 'header', autoFocus, onCancel }: SearchFieldProps): ReactElement {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const onSearchPage = pathname === '/ara'
  const urlQ = onSearchPage ? (new URLSearchParams(search).get('q') ?? '') : ''
  const [value, setValue] = useState(urlQ)
  const [focused, setFocused] = useState(false)
  // Liste kullanıcı yazınca (ya da ↓) açılır; adresten dolan kutuda kendiliğinden açılmaz.
  const [dismissed, setDismissed] = useState(true)
  const [active, setActive] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const header = variant === 'header'

  // Adres değişince (geri, tahmine dokunma, "bunun yerine ara") kutu adresi izler.
  // Arama sayfasından başka bir yere gidilince (menü bağlantısı, geri) kutu boşalır.
  useEffect(() => {
    setValue(onSearchPage ? urlQ : '')
  }, [urlQ, onSearchPage])

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true })
  }, [autoFocus])

  const predictions = usePredictions(value, header && focused)
  const items = header && focused && !dismissed ? predictions.items : []
  const menuOpen = items.length > 0
  useEffect(() => setActive(-1), [predictions.prefix])

  const go = (q: string) => {
    if (onSearchPage) {
      navigate(searchPath(q), { replace: true })
      return
    }
    setSearchOrigin({ path: `${pathname}${search}`, idx: historyIndex() })
    navigate(searchPath(q))
  }

  /** Kutu boşaldı: masaüstünde aramanın başladığı yere dön; mobilde boş arama ekranı. */
  const leaveEmpty = () => {
    if (!onSearchPage) return
    const o = header ? searchOrigin() : null
    setSearchOrigin(null)
    if (!o) navigate('/ara', { replace: true })
    else if (o.idx !== null && historyIndex() === o.idx + 1) navigate(-1)
    else navigate(o.path, { replace: true })
  }

  const change = (q: string) => {
    setValue(q)
    setDismissed(false)
    if (q.trim()) go(q)
    else leaveEmpty()
  }

  const choose = (p: SearchPrediction) => {
    setValue(p.text)
    setDismissed(true)
    go(p.text)
    recordSearch(p.text)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (menuOpen && active >= 0 && items[active]) {
      choose(items[active])
      return
    }
    setDismissed(true)
    if (!value.trim()) return
    if (!onSearchPage) go(value)
    recordSearch(value)
    if (!header) inputRef.current?.blur() // mobilde klavyeyi kapat
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault()
      setDismissed(false)
      setActive((i) => (i + 1) % items.length)
    } else if (e.key === 'ArrowUp' && items.length) {
      e.preventDefault()
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1))
    } else if (e.key === 'Escape') {
      if (menuOpen && active >= 0) {
        e.preventDefault()
        e.stopPropagation()
        setDismissed(true)
        setActive(-1)
      } else if (value) {
        e.preventDefault()
        e.stopPropagation()
        change('')
      }
      // Boşken olay kabuğa gider: üst menü kutuyu kapatır.
    }
  }

  const activeId = menuOpen && active >= 0 ? `${listId}-${active}` : undefined

  return (
    <form
      role="search"
      className={cx('tvp-searchbox', header ? 'tvp-searchbox--header' : 'tvp-searchbox--page', className)}
      onSubmit={submit}
      onFocus={() => {
        setFocused(true)
        if (!value) setDismissed(false) // boş kutu: modelin "yazmadan önce" tahminleri
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setFocused(false)
          setActive(-1)
        }
      }}
    >
      <div className="tvp-searchbox__field">
        <Icon name="search" size={header ? 20 : 18} />
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
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          {...(header
            ? {
                role: 'combobox',
                'aria-expanded': menuOpen,
                'aria-controls': listId,
                'aria-autocomplete': 'list' as const,
                'aria-activedescendant': activeId,
              }
            : {})}
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
      </div>
      {!header && onCancel && (
        <button type="button" className="tvp-searchbox__cancel" onClick={onCancel}>
          İptal
        </button>
      )}
      {header && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Tahminler"
          className="tvp-predict"
          hidden={!menuOpen}
          onMouseDown={(e) => e.preventDefault() /* odak kutuda kalsın */}
        >
          {items.map((p, i) => (
            <li
              key={`${p.kind}:${p.text}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={cx('tvp-predict__item', i === active && 'is-active')}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(p)}
            >
              <Icon name={p.kind === 'QUERY' ? 'clock' : 'search'} size={16} className="tvp-predict__icon" />
              <PredictionText text={p.text} typed={value} />
              <span className="tvp-predict__kind">{predictionKindLabel(p.kind)}</span>
            </li>
          ))}
        </ul>
      )}
    </form>
  )
}

/** Yazılan kısım sönük, modelin tahmin ettiği kalan kısım kalın. */
export function PredictionText({ text, typed }: { text: string; typed: string }): ReactElement {
  return (
    <span className="tvp-predict__text" aria-label={text}>
      {highlightPrediction(text, typed).map((part, i) =>
        part.typed ? (
          <span key={i} className="tvp-predict__typed">
            {part.text}
          </span>
        ) : (
          <b key={i}>{part.text}</b>
        ),
      )}
    </span>
  )
}
