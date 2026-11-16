/**
 * Düğmeler. Her düğme en az 48 px yüksekliğindedir (dokunma hedefi) ve klavye odağı görünürdür.
 *
 *   <Button onClick={save}>Kaydet</Button>                        birincil
 *   <Button variant="secondary" icon={Plus}>Yeni</Button>         ikincil, simgeli
 *   <Button variant="danger" loading={busy}>Sil</Button>          yıkıcı işlem (her zaman onayla birlikte)
 *   <IconButton icon={X} label="Kapat" onClick={close} />          yalnız simge: `label` ekran okuyucuya okunur
 *   <ButtonLink to="/gorevler/yeni" icon={Plus}>Yeni görev</ButtonLink>
 *
 * Genişletme: yeni görünüm → VARIANTS'a satır ekleyin (renkleri styles/index.css belirteçlerinden seçin).
 */
import type { LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { Link, type LinkProps } from 'react-router'
import { cx } from './cx.ts'
import { Spinner } from './Spinner.tsx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent/90 shadow-sm',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-surface-2',
  ghost: 'bg-transparent text-ink hover:bg-surface-2',
  danger: 'bg-danger text-white hover:bg-danger/90 shadow-sm',
}

const BASE =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold ' +
  'transition-colors select-none disabled:cursor-not-allowed disabled:opacity-55 ' +
  'aria-disabled:cursor-not-allowed aria-disabled:opacity-55'

export function buttonClass(variant: ButtonVariant = 'primary', block = false, extra?: string): string {
  return cx(BASE, VARIANTS[variant], block && 'w-full', extra)
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant
  readonly icon?: LucideIcon
  /** İşlem sürüyor: düğme kilitlenir, dönen simge görünür. */
  readonly loading?: boolean
  /** Satırı kaplasın. */
  readonly block?: boolean
  readonly ref?: Ref<HTMLButtonElement>
}

export function Button({
  variant = 'primary',
  icon: Icon,
  loading = false,
  block = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, block, className)}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={18} /> : Icon && <Icon aria-hidden size={20} strokeWidth={2.2} />}
      {children}
    </button>
  )
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  readonly icon: LucideIcon
  /** Ekran okuyucunun okuyacağı ad (zorunlu; simge tek başına anlaşılmaz). */
  readonly label: string
  readonly variant?: 'ghost' | 'secondary'
  readonly ref?: Ref<HTMLButtonElement>
}

export function IconButton({
  icon: Icon,
  label,
  variant = 'ghost',
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex size-12 shrink-0 items-center justify-center rounded-xl text-ink transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-55',
        variant === 'ghost' ? 'hover:bg-surface-2' : 'border border-line-strong bg-surface hover:bg-surface-2',
        className,
      )}
      {...rest}
    >
      <Icon aria-hidden size={22} strokeWidth={2} />
    </button>
  )
}

export interface ButtonLinkProps extends LinkProps {
  readonly variant?: ButtonVariant
  readonly icon?: LucideIcon
  readonly block?: boolean
  readonly children: ReactNode
}

/** Sayfa değiştiren düğme görünümlü bağlantı (anlamca bağlantıdır; ekran okuyucu "bağlantı" der). */
export function ButtonLink({
  variant = 'primary',
  icon: Icon,
  block = false,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={buttonClass(variant, block, typeof className === 'string' ? className : undefined)} {...rest}>
      {Icon && <Icon aria-hidden size={20} strokeWidth={2.2} />}
      {children}
    </Link>
  )
}
