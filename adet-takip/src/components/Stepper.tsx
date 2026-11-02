interface Props {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  label: string
  unit?: string
}

export function Stepper({ value, min, max, onChange, label, unit = 'gün' }: Props) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`${label} azalt`} disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <output aria-live="polite">
        {value} {unit}
      </output>
      <button type="button" aria-label={`${label} artır`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  )
}
