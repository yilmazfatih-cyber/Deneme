/**
 * Düğmeler ve tuş takımı. Odaktaki düğme: beyaz zemin + siyah yazı (UX_SPEC §4).
 */
import type { ReactElement } from 'react'
import { digitOf, FocusScope, useFocusable, useKeyInterceptor } from '../focus'
import { TvIcon, type TvIconName } from './icons'

const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ')

export interface TvButtonProps {
  label: string
  icon?: TvIconName
  onPress?: () => void
  /** Sabit odak kimliği (varsayılan odak / focusManager.focus için) */
  id?: string
  /**
   * 'play' "Oynat": odaksızken de beyaz zemin + siyah yazı, odakta büyür ve beyaz halka alır ·
   * 'primary' biraz daha belirgin yarı saydam · 'secondary' yarı saydam · 'quiet' yalnız yazı
   */
  variant?: 'play' | 'primary' | 'secondary' | 'quiet'
  size?: 'md' | 'lg'
  disabled?: boolean
  autoFocus?: boolean
  /** Ekran okuyucu için ek açıklama */
  description?: string
  className?: string
}

export function TvButton({
  label,
  icon,
  onPress,
  id,
  variant = 'secondary',
  size = 'md',
  disabled,
  autoFocus,
  description,
  className,
}: TvButtonProps): ReactElement {
  const { ref, focused } = useFocusable<HTMLDivElement>({ id, onEnter: onPress, disabled, autoFocus })
  return (
    <div
      ref={ref}
      role="button"
      aria-disabled={disabled || undefined}
      aria-description={description}
      className={cx(
        'tv-btn',
        `tv-btn--${variant}`,
        `tv-btn--${size}`,
        focused && 'is-focused',
        disabled && 'is-disabled',
        className,
      )}
    >
      {icon && <TvIcon name={icon} size={size === 'lg' ? 2 : 1.6} />}
      <span className="tv-btn__label">{label}</span>
    </div>
  )
}

export interface TvAction {
  id?: string
  label: string
  icon?: TvIconName
  onPress: () => void
  disabled?: boolean
  description?: string
}

/** Dikey eylem listesi (Detay: ▶ Oynat · Baştan Başlat · Bölümler … — her biri 4 rem). */
export function TvActionList({
  id,
  actions,
  playFirst = true,
  className,
}: {
  id?: string
  actions: readonly TvAction[]
  /** İlk eylem beyaz "Oynat" biçiminde (varsayılan true); oynatma dışı listelerde false */
  playFirst?: boolean
  className?: string
}): ReactElement {
  return (
    <FocusScope id={id} orientation="vertical">
      <div className={cx('tv-actions', className)} role="group">
        {actions.map((a, i) => (
          <TvButton
            key={a.id ?? `${a.label}-${i}`}
            id={a.id}
            label={a.label}
            icon={a.icon}
            onPress={a.onPress}
            disabled={a.disabled}
            description={a.description}
            variant={i === 0 && playFirst ? 'play' : 'secondary'}
            size="lg"
            className="tv-actions__item"
          />
        ))}
      </div>
    </FocusScope>
  )
}

interface KeyProps {
  id: string
  label: string
  icon?: TvIconName
  onPress: () => void
  wide?: boolean
}

function KeypadKey({ id, label, icon, onPress }: KeyProps): ReactElement {
  const { ref, focused } = useFocusable<HTMLDivElement>({ id, onEnter: onPress })
  return (
    <div ref={ref} role="button" aria-label={label} className={cx('tv-key', focused && 'is-focused')}>
      {icon ? <TvIcon name={icon} size={2} /> : label}
    </div>
  )
}

export interface TvKeypadProps {
  /** Kapsam ve tuş kimliklerinin öneki */
  id: string
  onDigit: (digit: number) => void
  onDelete: () => void
  /** Verilirse sağ altta "Tamam" tuşu çıkar */
  onSubmit?: () => void
  submitLabel?: string
  /** Kumandanın rakam tuşları da kabul edilsin (varsayılan true) */
  remoteDigits?: boolean
  className?: string
}

/** Rakam tuş takımı (PIN, kanal numarası): 1–9, altta Sil · 0 · (Tamam). */
export function TvKeypad({
  id,
  onDigit,
  onDelete,
  onSubmit,
  submitLabel = 'Tamam',
  remoteDigits = true,
  className,
}: TvKeypadProps): ReactElement {
  useKeyInterceptor(
    (key) => {
      const d = digitOf(key)
      if (d === null) return false
      onDigit(d)
      return true
    },
    50,
    remoteDigits,
  )
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  return (
    <FocusScope id={id} orientation="grid" defaultFocus={`${id}:1`}>
      <div className={cx('tv-keypad', className)} role="group" aria-label="Rakam tuşları">
        {digits.map((d) => (
          <KeypadKey key={d} id={`${id}:${d}`} label={String(d)} onPress={() => onDigit(d)} />
        ))}
        <KeypadKey id={`${id}:sil`} label="Sil" icon="backspace" onPress={onDelete} />
        <KeypadKey id={`${id}:0`} label="0" onPress={() => onDigit(0)} />
        {onSubmit ? (
          <KeypadKey id={`${id}:tamam`} label={submitLabel} icon="check" onPress={onSubmit} />
        ) : (
          <span aria-hidden="true" />
        )}
      </div>
    </FocusScope>
  )
}
