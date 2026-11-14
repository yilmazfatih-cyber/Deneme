/**
 * Denetimler: Tabs (mobil detay "Bölümler · Benzerleri · Fragmanlar"), Pill + PillClear + PillBar (mobil kategori
 * hapları), TextField, PinInput (4 haneli profil kilidi), Switch ("Çocuk profili").
 */
import {
  useId,
  useRef,
  type ChangeEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react'
import { Link } from 'react-router-dom'
import { cx } from './cx'
import { Icon } from './Icon'
import './controls.css'

/* ───────────── Sekmeler ───────────── */

export interface TabItem {
  id: string
  label: string
  disabled?: boolean
}

export interface TabsProps {
  items: readonly TabItem[]
  value: string
  onChange: (id: string) => void
  /** Sekme listesinin ekran okuyucu adı */
  label: string
  /** Panel kimliği üretici (verilirse aria-controls bağlanır): panelIdFor('bolumler') */
  panelIdFor?: (id: string) => string
  className?: string
}

/** Netflix mobil sekmeleri: etkin sekmenin üstünde sarı çizgi. ←/→ ile gezilir (otomatik seçim). */
export function Tabs({ items, value, onChange, label, panelIdFor, className }: TabsProps): ReactElement {
  const listRef = useRef<HTMLDivElement>(null)
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return
    const enabled = items.filter((t) => !t.disabled)
    const i = enabled.findIndex((t) => t.id === value)
    const next =
      e.key === 'Home'
        ? enabled[0]
        : e.key === 'End'
          ? enabled[enabled.length - 1]
          : enabled[(i + (e.key === 'ArrowRight' ? 1 : enabled.length - 1)) % enabled.length]
    if (!next) return
    e.preventDefault()
    onChange(next.id)
    listRef.current?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(next.id)}"]`)?.focus()
  }
  return (
    <div ref={listRef} className={cx('ui-tabs', className)} role="tablist" aria-label={label} onKeyDown={onKey}>
      {items.map((t) => {
        const on = t.id === value
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            data-tab={t.id}
            className="ui-tab"
            aria-selected={on}
            aria-controls={panelIdFor?.(t.id)}
            tabIndex={on ? 0 : -1}
            disabled={t.disabled}
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

/* ───────────── Haplar ───────────── */

export interface PillProps {
  children: ReactNode
  /** Seçili hap (beyaz çerçeve, kalın) */
  selected?: boolean
  /** Sonunda ▾ (ör. "Kategoriler ▾") */
  caret?: boolean
  to?: string
  onClick?: (e: MouseEvent<HTMLElement>) => void
  className?: string
  ref?: Ref<HTMLElement>
}

/** Mobil kategori hapı: 1 px çerçeve, tam yuvarlak. */
export function Pill({ children, selected, caret, to, onClick, className, ref }: PillProps): ReactElement {
  const cls = cx('ui-pill', selected && 'is-selected', className)
  const content = (
    <>
      <span>{children}</span>
      {caret && <Icon name="caret" size={16} />}
    </>
  )
  if (to !== undefined)
    return (
      <Link
        to={to}
        className={cls}
        aria-current={selected ? 'page' : undefined}
        onClick={onClick}
        ref={ref as Ref<HTMLAnchorElement>}
      >
        {content}
      </Link>
    )
  return (
    <button type="button" className={cls} aria-pressed={selected} onClick={onClick} ref={ref as Ref<HTMLButtonElement>}>
      {content}
    </button>
  )
}

/** Seçili kategorinin başındaki yuvarlak ✕ ("Diziler" seçiliyken: ⓧ Diziler · Kategoriler ▾). */
export function PillClear({
  onClick,
  to,
  label = 'Kategoriyi kaldır',
}: {
  onClick?: () => void
  to?: string
  label?: string
}): ReactElement {
  const icon = <Icon name="close" size={16} strokeWidth={2.4} />
  if (to !== undefined)
    return (
      <Link to={to} className="ui-pill-clear" aria-label={label} onClick={onClick}>
        {icon}
      </Link>
    )
  return (
    <button type="button" className="ui-pill-clear" aria-label={label} onClick={onClick}>
      {icon}
    </button>
  )
}

/** Hap sırası: yatay kayar, kenar boşluklu. */
export function PillBar({
  children,
  label = 'Kategoriler',
  className,
}: {
  children: ReactNode
  label?: string
  className?: string
}): ReactElement {
  return (
    <nav className={cx('ui-pillbar', className)} aria-label={label}>
      {children}
    </nav>
  )
}

/* ───────────── Metin alanı ───────────── */

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label: string
  value: string
  onChange: (value: string) => void
  /** Hata metni (alanın altında, sakin) */
  error?: string | null
  hint?: string
  /** Etiketi görsel olarak gizle (ekran okuyucu okur) */
  hideLabel?: boolean
  ref?: Ref<HTMLInputElement>
}

export function TextField({
  label,
  value,
  onChange,
  error,
  hint,
  hideLabel,
  className,
  id,
  ...rest
}: TextFieldProps): ReactElement {
  const auto = useId()
  const inputId = id ?? auto
  const noteId = `${inputId}-not`
  return (
    <div className={cx('ui-field', error && 'has-error', className)}>
      <label htmlFor={inputId} className={cx('ui-field__label', hideLabel && 'ui-sr-only')}>
        {label}
      </label>
      <input
        id={inputId}
        className="ui-field__input"
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? noteId : undefined}
        {...rest}
      />
      {(error || hint) && (
        <p id={noteId} className="ui-field__note" role={error ? 'alert' : undefined}>
          {error ?? hint}
        </p>
      )}
    </div>
  )
}

/* ───────────── PIN ───────────── */

export interface PinInputProps {
  value: string
  onChange: (value: string) => void
  /** Son hane girilince (ör. doğrulama isteği) */
  onComplete?: (value: string) => void
  /** Hane sayısı; varsayılan 4 */
  length?: number
  /** Hatalı PIN: kutular titrer ve çerçeve sarı olur */
  error?: boolean
  disabled?: boolean
  /** Ekran okuyucu adı; varsayılan "Profil kilidi PIN'i" */
  label?: string
  autoFocus?: boolean
  className?: string
}

/**
 * 4 haneli PIN: görünmez tek bir sayısal girdi + dört kutu (yapıştırma ve mobil klavye doğal çalışır).
 * Haneler görünmez, nokta olarak çizilir.
 */
export function PinInput({
  value,
  onChange,
  onComplete,
  length = 4,
  error,
  disabled,
  label = "Profil kilidi PIN'i",
  autoFocus,
  className,
}: PinInputProps): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null)
  const set = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, length)
    onChange(digits)
    if (digits.length === length && digits !== value) onComplete?.(digits)
  }
  return (
    <div
      className={cx('ui-pin', error && 'has-error', disabled && 'is-disabled', className)}
      onClick={() => inputRef.current?.focus()}
    >
      <input
        ref={inputRef}
        className="ui-pin__input"
        type="password"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={length}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={label}
        aria-invalid={error || undefined}
        onChange={(e) => set(e.target.value)}
      />
      {Array.from({ length }, (_, i) => (
        <span
          key={i}
          className={cx(
            'ui-pin__box',
            i < value.length && 'is-filled',
            i === Math.min(value.length, length - 1) && 'is-current',
          )}
          aria-hidden="true"
        />
      ))}
    </div>
  )
}

/* ───────────── Anahtar ───────────── */

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  /** Etiketin altında açıklama */
  description?: string
  disabled?: boolean
  className?: string
}

export function Switch({ checked, onChange, label, description, disabled, className }: SwitchProps): ReactElement {
  const id = useId()
  return (
    <div className={cx('ui-switch', className)}>
      <span className="ui-switch__text">
        <label htmlFor={id} className="ui-switch__label">
          {label}
        </label>
        {description && <span className="ui-switch__desc">{description}</span>}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className="ui-switch__control"
        onClick={() => onChange(!checked)}
      >
        <span className="ui-switch__thumb" />
      </button>
    </div>
  )
}
