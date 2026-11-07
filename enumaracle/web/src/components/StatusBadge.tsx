import type { StatusInfo, Tone } from '../format'

const ICON: Record<Tone, string> = {
  success: '✓',
  warning: '!',
  danger: '✕',
  info: '•',
  neutral: '○',
}

/** A status pill that always carries text; color is only a secondary cue. */
export function Badge({ tone, children }: { tone: Tone; children: string }) {
  return (
    <span className={`badge badge-${tone}`}>
      <span aria-hidden="true" className="badge-icon">
        {ICON[tone]}
      </span>
      {children}
    </span>
  )
}

export function StatusBadge<K extends string>({ map, value }: { map: Record<K, StatusInfo>; value: K | undefined | null }) {
  if (!value) return <Badge tone="neutral">—</Badge>
  const info = (map as Record<string, StatusInfo | undefined>)[value] ?? { text: value, tone: 'neutral' as Tone }
  return <Badge tone={info.tone}>{info.text}</Badge>
}
