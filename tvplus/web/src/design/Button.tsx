/**
 * Butonlar (DESIGN_SPEC §2 "Butonlar"): birincil (sarı, ekranda en fazla bir tane), ikincil, üçüncül;
 * ikon buton (44×44, aria-label zorunlu) ve metin buton ("Tümü").
 * `to` verilirse uygulama içi bağlantı (react-router Link), `href` verilirse düz <a> olarak çizilir.
 */
import type { ButtonHTMLAttributes, MouseEventHandler, ReactElement, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'
import './buttons.css'

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary'
/** lg = 48 px (spesifikasyon ölçüsü), md = 40 px, sm = 36 px */
export type ButtonSize = 'lg' | 'md' | 'sm'

interface CommonProps {
  className?: string
  children?: ReactNode
  /** Bağlantı biçimi: uygulama içi yol (#/... olmadan, ör. "/detay/1"). */
  to?: string
  /** Bağlantı biçimi: tam adres. */
  href?: string
  onClick?: MouseEventHandler<HTMLElement>
  'aria-label'?: string
  /** Aç/kapa düğmesi (ör. "Listeme ekle"): yalnız <button> biçiminde yazılır; true → beyaz dolgu. */
  'aria-pressed'?: boolean
  /** İpucu metni */
  title?: string
}

export interface ButtonProps extends CommonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Etiketin solundaki ikon (16–20 px). */
  icon?: IconName
  /** İkincil buton görsel üstündeyse arka planı bulanıklaştırır. */
  overImage?: boolean
  /** Tam genişlik (mobil alt sayfalarda). */
  block?: boolean
  disabled?: boolean
  /** İşlem sürüyor: buton pasifleşir, aria-busy. */
  busy?: boolean
  type?: ButtonHTMLAttributes<HTMLButtonElement>['type']
}

/** Ortak çizim: button / Link / a arasında seçim yapar. */
function Pressable(
  props: CommonProps & { cls: string; disabled?: boolean; busy?: boolean; type?: ButtonProps['type'] },
): ReactElement {
  const { cls, to, href, onClick, children, disabled, busy, type, title } = props
  const label = props['aria-label']
  const pressed = props['aria-pressed']
  if (to && !disabled) {
    return (
      <Link className={cls} to={to} onClick={onClick} aria-label={label} title={title}>
        {children}
      </Link>
    )
  }
  if (href && !disabled) {
    return (
      <a className={cls} href={href} onClick={onClick} aria-label={label} title={title}>
        {children}
      </a>
    )
  }
  return (
    <button
      className={cls}
      type={type ?? 'button'}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      aria-pressed={pressed}
      aria-label={label}
      title={title}
    >
      {children}
    </button>
  )
}

export function Button({
  variant = 'primary',
  size = 'lg',
  icon,
  overImage,
  block,
  className,
  children,
  ...rest
}: ButtonProps): ReactElement {
  const cls = cx(
    'cn-btn',
    `cn-btn--${variant}`,
    `cn-btn--${size}`,
    overImage && 'cn-btn--over',
    block && 'cn-btn--block',
    className,
  )
  return (
    <Pressable cls={cls} {...rest}>
      {icon && <Icon name={icon} size={size === 'lg' ? 20 : 18} />}
      {children}
    </Pressable>
  )
}

export interface IconButtonProps extends Omit<CommonProps, 'children' | 'aria-label'> {
  icon: IconName
  /** Ekran okuyucu etiketi (zorunlu); aynı metin ipucu olarak da görünür. */
  label: string
  /** 44 (varsayılan), 40 ya da 36 px */
  size?: 44 | 40 | 36
  /** ghost: zeminsiz (üst çubuk ikonları) */
  variant?: 'tertiary' | 'ghost'
  overImage?: boolean
  disabled?: boolean
  /** Açılır menü/alt sayfa düğmeleri için */
  expanded?: boolean
  pressed?: boolean
}

export function IconButton({
  icon,
  label,
  size = 44,
  variant = 'tertiary',
  overImage,
  className,
  expanded,
  pressed,
  ...rest
}: IconButtonProps): ReactElement {
  const cls = cx('cn-iconbtn', `cn-iconbtn--${variant}`, `cn-iconbtn--${size}`, overImage && 'cn-btn--over', className)
  if (expanded !== undefined || pressed !== undefined) {
    return (
      <button
        className={cls}
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={expanded}
        aria-pressed={pressed}
        onClick={rest.onClick}
        disabled={rest.disabled}
      >
        <Icon name={icon} size={size === 36 ? 20 : 24} />
      </button>
    )
  }
  return (
    <Pressable cls={cls} aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={size === 36 ? 20 : 24} />
    </Pressable>
  )
}

export interface TextButtonProps extends CommonProps {
  disabled?: boolean
}

/** "Tümü" gibi sessiz metin eylemi (text-2, 13/600, 44 px yükseklik). */
export function TextButton({ className, ...rest }: TextButtonProps): ReactElement {
  return <Pressable cls={cx('cn-textbtn', className)} {...rest} />
}
