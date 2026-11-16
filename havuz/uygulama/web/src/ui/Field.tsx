/**
 * Form alanları. Etiket, açıklama ve hata iletisi denetime bağlıdır (ekran okuyucu üçünü de okur).
 *
 *   <TextField label="Başlık" value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} />
 *   <TextAreaField label="Not" rows={4} … />
 *   <SelectField label="Öncelik" value={p} onChange={…}>{seçenekler}</SelectField>
 *   <Checkbox label="Tamamlandı" checked={done} onChange={…} />
 *   <Switch label="Yüksek karşıtlık" checked={on} onChange={(next) => …} />
 *   <Field label="Özel">{(control) => <input {...control} />}</Field>   kendi denetiminiz için
 *
 * Hata iletileri şemadan (shared) gelir ve alanın ALTINDA görünür; suçlamayan, ne yapılacağını söyleyen dil.
 * Genişletme: yeni bir denetim türü → `Field` ile sarıp `…Field` adıyla dışa aktarın.
 */
import { CircleExclamationPoint } from 'lucide-react'
import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cx } from './cx.ts'

export interface ControlProps {
  readonly id: string
  readonly 'aria-describedby'?: string
  readonly 'aria-invalid'?: true
  readonly required?: boolean
}

export interface FieldProps {
  readonly label: string
  readonly hint?: string | undefined
  readonly error?: string | undefined
  readonly required?: boolean
  /** Etiketi gizle (yine de ekran okuyucu okur) — ör. arama kutusu. */
  readonly hideLabel?: boolean
  readonly className?: string
  readonly children: (control: ControlProps) => ReactNode
}

export function Field({ label, hint, error, required, hideLabel, className, children }: FieldProps) {
  const id = useId()
  const hintId = hint ? `${id}-ipucu` : undefined
  const errorId = error ? `${id}-hata` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className={cx('text-sm font-semibold text-ink', hideLabel && 'sr-only')}>
        {label}
      </label>
      {children({
        id,
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        ...(error ? { 'aria-invalid': true as const } : {}),
        ...(required ? { required } : {}),
      })}
      {hint && !error && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 text-sm font-medium text-danger">
          <CircleExclamationPoint aria-hidden size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}

const CONTROL =
  'w-full min-h-12 rounded-xl border border-line-strong bg-surface px-3.5 text-base text-ink ' +
  'placeholder:text-muted transition-colors aria-invalid:border-danger aria-invalid:ring-1 aria-invalid:ring-danger ' +
  'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted'

export function Input({
  className,
  ref,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} className={cx(CONTROL, className)} {...rest} />
}

export function Textarea({
  className,
  ref,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea ref={ref} className={cx(CONTROL, 'py-3 leading-relaxed', className)} {...rest} />
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(CONTROL, 'appearance-auto pr-8', className)} {...rest}>
      {children}
    </select>
  )
}

type Labelled = Pick<FieldProps, 'label' | 'hint' | 'error' | 'hideLabel'>

export function TextField({
  label,
  hint,
  error,
  hideLabel,
  required,
  className,
  ref,
  ...rest
}: Labelled & InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return (
    <Field label={label} hint={hint} error={error} hideLabel={hideLabel} required={required} className={className}>
      {(control) => <Input ref={ref} {...rest} {...control} />}
    </Field>
  )
}

export function TextAreaField({
  label,
  hint,
  error,
  required,
  className,
  ...rest
}: Labelled & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {(control) => <Textarea {...rest} {...control} />}
    </Field>
  )
}

export function SelectField({
  label,
  hint,
  error,
  required,
  className,
  children,
  ...rest
}: Labelled & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {(control) => (
        <Select {...rest} {...control}>
          {children}
        </Select>
      )}
    </Field>
  )
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  readonly label: string
  readonly description?: string
}

export function Checkbox({ label, description, className, ...rest }: CheckboxProps) {
  const id = useId()
  return (
    <div className={cx('flex min-h-12 items-start gap-3 py-2', className)}>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-6 shrink-0 cursor-pointer rounded-md accent-accent"
        aria-labelledby={`${id}-ad`}
        aria-describedby={description ? `${id}-aciklama` : undefined}
        {...rest}
      />
      <label htmlFor={id} className="flex cursor-pointer flex-col gap-0.5">
        <span id={`${id}-ad`} className="font-medium text-ink">
          {label}
        </span>
        {description && (
          <span id={`${id}-aciklama`} className="text-sm text-muted">
            {description}
          </span>
        )}
      </label>
    </div>
  )
}

export interface SwitchProps {
  readonly label: string
  readonly description?: string
  readonly checked: boolean
  readonly onChange: (checked: boolean) => void
  readonly disabled?: boolean
}

/** Açık/kapalı anahtarı: yerel onay kutusu `role="switch"` ile (klavyede Boşluk tuşuyla değişir). */
export function Switch({ label, description, checked, onChange, disabled }: SwitchProps) {
  const id = useId()
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 py-2">
      <label htmlFor={id} className="flex cursor-pointer flex-col gap-0.5">
        <span id={`${id}-ad`} className="font-medium text-ink">
          {label}
        </span>
        {description && (
          <span id={`${id}-aciklama`} className="text-sm text-muted">
            {description}
          </span>
        )}
      </label>
      <span className="relative inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          aria-labelledby={`${id}-ad`}
          aria-describedby={description ? `${id}-aciklama` : undefined}
          onChange={(event) => onChange(event.target.checked)}
          className="peer h-8 w-14 cursor-pointer appearance-none rounded-full border-2 border-line-strong bg-surface-2 transition-colors checked:border-accent checked:bg-accent disabled:cursor-not-allowed disabled:opacity-55"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute top-1.5 left-1.5 size-5 rounded-full bg-muted transition-transform peer-checked:translate-x-6 peer-checked:bg-accent-ink"
        />
      </span>
    </div>
  )
}
