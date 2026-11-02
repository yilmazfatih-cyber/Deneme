import type { Phase } from '../lib/cycle'

interface Props {
  /** 0–1 arası döngü ilerlemesi. */
  progress: number
  phase: Phase | null
  kicker: string
  main: string
  sub?: string
  small?: boolean
}

const PHASE_COLOR: Record<Phase, string> = {
  period: 'var(--primary)',
  follicular: 'var(--follicular)',
  fertile: 'var(--fertile)',
  ovulation: 'var(--ovulation)',
  luteal: 'var(--luteal)',
}

/** Flo'daki gibi döngü halkası: dış çember döngü ilerlemesi, orta kısım bugünün mesajı. */
export function Ring({ progress, phase, kicker, main, sub, small }: Props) {
  const r = 46
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(1, progress))
  const color = phase ? PHASE_COLOR[phase] : 'var(--line)'
  return (
    <div className="ring-wrap" role="img" aria-label={`${kicker} ${main} ${sub ?? ''}`.trim()}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--bg-2)" strokeWidth="6" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      </svg>
      <div className="ring-center">
        <div className="ring-kicker">{kicker}</div>
        <div className={`ring-main${small ? ' small' : ''}`}>{main}</div>
        {sub && <div className="ring-sub">{sub}</div>}
      </div>
    </div>
  )
}
