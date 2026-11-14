/**
 * Düğmeler — Netflix kalıpları:
 *   Button / ButtonLink   dikdörtgen (köşe 4): 'play' beyaz "▶ Oynat" · 'secondary' gri saydam "ⓘ Daha Fazla Bilgi"
 *                         · 'outline' çerçeveli ("PROFİLLERİ YÖNET") · 'ghost' yalın metin · 'accent' sarı (karşılama
 *                         sayfasının tek çağrısı: Netflix'in kırmızı "Başla" düğmesi). Boyutlar sm / md / lg
 *                         (lg = masaüstü vitrin, genişlikle ölçeklenir).
 *   RoundButton           yuvarlak simge düğmesi: 'play' beyaz dolu ▶ · 'outline' çerçeveli saydam (＋ / beğen / ⌄ / ses).
 * `aria-pressed` verilen düğmeler basılı görünür (Listemde ✓, beğenildi).
 */
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactElement, ReactNode, Ref } from 'react'
import { Link } from 'react-router-dom'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'
import './buttons.css'

export type ButtonVariant = 'play' | 'secondary' | 'outline' | 'ghost' | 'accent'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonLookProps {
  /** Varsayılan 'secondary' */
  variant?: ButtonVariant
  /** Varsayılan 'md' */
  size?: ButtonSize
  /** Metnin solundaki ikon */
  icon?: IconName
  /** Kapsayıcının tam genişliği (mobil "▶ Oynat") */
  block?: boolean
  /** Sürüyor: metin yerine dönen halka, tıklanamaz */
  busy?: boolean
}

/** Paylaşılan sınıf üretici — kendi öğesini çizen bileşenler (ör. <label>) aynı görünümü alabilir. */
export function buttonClass({
  variant = 'secondary',
  size = 'md',
  block,
  busy,
  className,
}: ButtonLookProps & { className?: string }): string {
  return cx('ui-btn', `ui-btn--${variant}`, `ui-btn--${size}`, block && 'ui-btn--block', busy && 'is-busy', className)
}

function Content({ icon, size, children }: { icon?: IconName; size: ButtonSize; children?: ReactNode }) {
  const iconSize = size === 'sm' ? 18 : size === 'md' ? 22 : 28
  return (
    <>
      {icon && <Icon name={icon} size={iconSize} className="ui-btn__icon" />}
      {children !== undefined && children !== null && <span className="ui-btn__label">{children}</span>}
    </>
  )
}

export interface ButtonProps extends ButtonLookProps, ButtonHTMLAttributes<HTMLButtonElement> {
  ref?: Ref<HTMLButtonElement>
}

export function Button({
  variant,
  size = 'md',
  icon,
  block,
  busy,
  className,
  children,
  type = 'button',
  disabled,
  ...rest
}: ButtonProps): ReactElement {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, block, busy, className })}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      <Content icon={icon} size={size}>
        {children}
      </Content>
    </button>
  )
}

export interface ButtonLinkProps extends ButtonLookProps, Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  /** Uygulama içi yol (react-router Link) */
  to?: string
  /** Dış adres ya da tam bağlantı (<a href>) */
  href?: string
  replace?: boolean
  ref?: Ref<HTMLAnchorElement>
}

/** Bağlantı görünümlü düğme: `to` → uygulama içi Link, `href` → <a>. */
export function ButtonLink({
  variant,
  size = 'md',
  icon,
  block,
  busy,
  className,
  children,
  to,
  href,
  replace,
  ...rest
}: ButtonLinkProps): ReactElement {
  const cls = buttonClass({ variant, size, block, busy, className })
  const content = (
    <Content icon={icon} size={size}>
      {children}
    </Content>
  )
  if (to !== undefined)
    return (
      <Link to={to} replace={replace} className={cls} {...rest}>
        {content}
      </Link>
    )
  return (
    <a href={href} className={cls} {...rest}>
      {content}
    </a>
  )
}

export type RoundButtonVariant = 'play' | 'outline' | 'solid'
export type RoundButtonSize = 'sm' | 'md' | 'lg'

interface RoundLookProps {
  icon: IconName
  /** Ekran okuyucu adı (zorunlu: yalnız ikon görünür) */
  label: string
  /** 'play' beyaz dolu · 'outline' çerçeveli saydam (varsayılan) · 'solid' koyu dolu (modal ✕) */
  variant?: RoundButtonVariant
  /** sm 32 · md 40 (varsayılan) · lg 48 px; masaüstünde genişlikle hafifçe büyür */
  size?: RoundButtonSize
}

export interface RoundButtonProps extends RoundLookProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Verilirse gerçek bağlantı olarak çizilir (orta tıklama / yeni sekme çalışır): uygulama içi yol */
  to?: undefined
  href?: undefined
  ref?: Ref<HTMLButtonElement>
}

export interface RoundButtonLinkProps
  extends RoundLookProps, Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children' | 'href'> {
  /** Uygulama içi yol (react-router Link): ▶ → /izle/…, ⌄ → titleHref(…) */
  to?: string
  /** Tam adres (<a href>) */
  href?: string
  replace?: boolean
  ref?: Ref<HTMLAnchorElement>
}

function roundParts(icon: IconName, variant: RoundButtonVariant, size: RoundButtonSize, className?: string) {
  const iconSize = size === 'sm' ? 16 : size === 'md' ? 20 : 24
  return {
    cls: cx('ui-round', `ui-round--${variant}`, `ui-round--${size}`, className),
    glyph: <Icon name={icon} size={iconSize} strokeWidth={variant === 'play' ? 2 : 2.2} />,
  }
}

/**
 * Yuvarlak simge düğmesi. `to` ya da `href` verilirse aynı görünümde bağlantı çizer
 * (bkz. RoundButtonLinkProps); verilmezse <button>.
 */
export function RoundButton(props: RoundButtonProps | RoundButtonLinkProps): ReactElement {
  if (props.to !== undefined || props.href !== undefined) {
    const {
      icon,
      label,
      variant = 'outline',
      size = 'md',
      className,
      title,
      to,
      href,
      replace,
      ...rest
    } = props as RoundButtonLinkProps
    const { cls, glyph } = roundParts(icon, variant, size, className)
    if (to !== undefined)
      return (
        <Link to={to} replace={replace} className={cls} aria-label={label} title={title ?? label} {...rest}>
          {glyph}
        </Link>
      )
    return (
      <a href={href} className={cls} aria-label={label} title={title ?? label} {...rest}>
        {glyph}
      </a>
    )
  }
  const {
    icon,
    label,
    variant = 'outline',
    size = 'md',
    className,
    type = 'button',
    title,
    to: _to,
    href: _href,
    ...rest
  } = props as RoundButtonProps
  const { cls, glyph } = roundParts(icon, variant, size, className)
  return (
    <button type={type} className={cls} aria-label={label} title={title ?? label} {...rest}>
      {glyph}
    </button>
  )
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName
  /** Ekran okuyucu adı (zorunlu) */
  label: string
  /** İkon boyutu px; varsayılan 24 (dokunma alanı en az 40) */
  iconSize?: number
  /** Uygulama içi bağlantı olarak çiz */
  to?: string
  ref?: Ref<HTMLButtonElement>
}

/** Yalın simge düğmesi (üst menü: arama, TV'de izle, zil). Çerçevesiz; üzerine gelince hafif soluklaşır. */
export function IconButton({
  icon,
  label,
  iconSize = 24,
  to,
  className,
  type = 'button',
  title,
  ...rest
}: IconButtonProps): ReactElement {
  const cls = cx('ui-iconbtn', className)
  if (to !== undefined)
    return (
      <Link to={to} className={cls} aria-label={label} title={title ?? label}>
        <Icon name={icon} size={iconSize} />
      </Link>
    )
  return (
    <button type={type} className={cls} aria-label={label} title={title ?? label} {...rest}>
      <Icon name={icon} size={iconSize} />
    </button>
  )
}
