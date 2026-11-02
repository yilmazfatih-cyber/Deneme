import type { Option } from '../lib/catalog'

interface MultiProps {
  options: Option[]
  value: string[]
  onChange: (v: string[]) => void
  label: string
}

export function MultiChips({ options, value, onChange, label }: MultiProps) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => {
        const on = value.includes(o.key)
        return (
          <button
            key={o.key}
            type="button"
            className="chip"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((k) => k !== o.key) : [...value, o.key])}
          >
            <span className="ic" aria-hidden="true">
              {o.icon}
            </span>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

interface SingleProps {
  options: Option[]
  value: string | undefined
  onChange: (v: string | undefined) => void
  label: string
}

export function SingleChips({ options, value, onChange, label }: SingleProps) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => {
        const on = value === o.key
        return (
          <button
            key={o.key}
            type="button"
            className="chip"
            aria-pressed={on}
            onClick={() => onChange(on ? undefined : o.key)}
          >
            <span className="ic" aria-hidden="true">
              {o.icon}
            </span>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
