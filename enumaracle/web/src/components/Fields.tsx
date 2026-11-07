import { useId, type ChangeEvent, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

interface Common {
  label: string
  error?: string
  hint?: ReactNode
}

function Help({ id, hint, error }: { id: string; hint?: ReactNode; error?: string }) {
  return (
    <>
      {hint ? (
        <span className="hint" id={`${id}-h`}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="field-error" id={`${id}-e`}>
          {error}
        </span>
      ) : null}
    </>
  )
}

function describedBy(id: string, hint?: ReactNode, error?: string) {
  const ids = [hint ? `${id}-h` : '', error ? `${id}-e` : ''].filter(Boolean).join(' ')
  return ids || undefined
}

export function TextField({
  label,
  error,
  hint,
  onValue,
  ...rest
}: Common & InputHTMLAttributes<HTMLInputElement> & { onValue?: (v: string) => void }) {
  const id = useId()
  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>
        {label}
        {rest.required ? <span className="req" aria-hidden="true"> *</span> : null}
      </label>
      <input
        {...rest}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        onChange={onValue ? (e: ChangeEvent<HTMLInputElement>) => onValue(e.target.value) : rest.onChange}
      />
      <Help id={id} hint={hint} error={error} />
    </div>
  )
}

export function TextArea({
  label,
  error,
  hint,
  onValue,
  ...rest
}: Common & TextareaHTMLAttributes<HTMLTextAreaElement> & { onValue?: (v: string) => void }) {
  const id = useId()
  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>
        {label}
        {rest.required ? <span className="req" aria-hidden="true"> *</span> : null}
      </label>
      <textarea
        {...rest}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        onChange={onValue ? (e) => onValue(e.target.value) : rest.onChange}
      />
      <Help id={id} hint={hint} error={error} />
    </div>
  )
}

export function SelectField({
  label,
  error,
  hint,
  options,
  onValue,
  ...rest
}: Common &
  SelectHTMLAttributes<HTMLSelectElement> & {
    options: { value: string; label: string }[]
    onValue?: (v: string) => void
  }) {
  const id = useId()
  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>
        {label}
        {rest.required ? <span className="req" aria-hidden="true"> *</span> : null}
      </label>
      <select
        {...rest}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        onChange={onValue ? (e) => onValue(e.target.value) : rest.onChange}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Help id={id} hint={hint} error={error} />
    </div>
  )
}

export function CheckField({
  label,
  checked,
  onChecked,
  hint,
  disabled,
}: {
  label: string
  checked: boolean
  onChecked: (v: boolean) => void
  hint?: ReactNode
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="check">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChecked(e.target.checked)}
        aria-describedby={hint ? `${id}-h` : undefined}
      />
      <label htmlFor={id}>{label}</label>
      {hint ? (
        <span className="hint" id={`${id}-h`}>
          {hint}
        </span>
      ) : null}
    </div>
  )
}

/** Group of checkboxes for picking several values (scopes, events). */
export function CheckGroup({
  legend,
  options,
  value,
  onChange,
  error,
}: {
  legend: string
  options: { value: string; label: string }[]
  value: string[]
  onChange: (v: string[]) => void
  error?: string
}) {
  const id = useId()
  return (
    <fieldset className={`field check-group${error ? ' has-error' : ''}`} aria-describedby={error ? `${id}-e` : undefined}>
      <legend>{legend}</legend>
      {options.map((o) => (
        <CheckField
          key={o.value}
          label={o.label}
          checked={value.includes(o.value)}
          onChecked={(c) => onChange(c ? [...value, o.value] : value.filter((v) => v !== o.value))}
        />
      ))}
      {error ? (
        <span className="field-error" id={`${id}-e`}>
          {error}
        </span>
      ) : null}
    </fieldset>
  )
}

/** Picks the first matching field error from several possible API field names. */
export function fe(fields: Record<string, string>, ...names: string[]): string | undefined {
  for (const n of names) if (fields[n]) return fields[n]
  return undefined
}
