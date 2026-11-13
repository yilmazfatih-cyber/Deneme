/**
 * TV kodu girişi: 8 karakter, 4'ten sonra tire kendiliğinden, büyük/küçük harf fark etmez; abecede olmayan
 * karakterler (0, O, 1, I, L) sunucuya gitmeden nazikçe belirtilir.
 */
import { useRef, type ReactElement } from 'react'
import { cx } from '../ui'
import { caretAfterFormat, checkCode, cleanCode, formatCode } from './code'
import './devices.css'

export function codeHint(raw: string): string | null {
  const c = checkCode(raw)
  if (c.kind !== 'ambiguous') return null
  return `Kodda ${c.chars.map((x) => `“${x}”`).join(', ')} yok. TV'deki koda yeniden bak.`
}

export function CodeField({
  value,
  onChange,
  onSubmit,
  autoFocus,
  label = "TV'deki kod",
  disabled,
  className,
}: {
  /** Temiz kod (tiresiz, büyük harf) */
  value: string
  onChange: (clean: string) => void
  onSubmit?: (clean: string) => void
  autoFocus?: boolean
  label?: string
  disabled?: boolean
  className?: string
}): ReactElement {
  const ref = useRef<HTMLInputElement>(null)
  const hint = codeHint(value)
  return (
    <div className={cx('dv-code', hint && 'has-hint', className)}>
      <label className="dv-code__label" htmlFor="tv-kodu">
        {label}
      </label>
      <input
        id="tv-kodu"
        ref={ref}
        className="dv-code__input"
        value={formatCode(value)}
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="one-time-code"
        autoCorrect="off"
        spellCheck={false}
        maxLength={9}
        placeholder="ABCD-2345"
        autoFocus={autoFocus}
        disabled={disabled}
        aria-invalid={hint ? true : undefined}
        aria-describedby={hint ? 'tv-kodu-not' : undefined}
        onChange={(e) => {
          const raw = e.target.value
          const caret = e.target.selectionStart ?? raw.length
          const clean = cleanCode(raw)
          onChange(clean)
          const formatted = formatCode(clean)
          const pos = caretAfterFormat(raw, caret, formatted)
          requestAnimationFrame(() => {
            if (document.activeElement === ref.current) ref.current?.setSelectionRange(pos, pos)
          })
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onSubmit) {
            e.preventDefault()
            onSubmit(value)
          }
        }}
      />
      {hint ? (
        <p className="dv-code__hint" id="tv-kodu-not" role="status">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
