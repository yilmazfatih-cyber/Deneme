/** Oynatıcı arayüzünün küçük parçaları: ilerleme çubuğu, menü, altyazı katmanı, istatistik, canlı bilgisi. */
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import type { PlayerAdapter } from '../adapters/types'
import type { TextTrackController } from '../text/textTracks'
import type { TtmlCue } from '../text/ttml'
import { airingProgress, formatClock, formatSpan, remainingLabel, spokenDuration } from './format'
import { IconCheck } from './icons'
import type { AiringBrief } from './metadata'

/* ───────────── ilerleme çubuğu ───────────── */

export function Scrubber(props: {
  position: number
  duration: number
  buffered: { start: number; end: number }[]
  disabled?: boolean
  onSeek: (sec: number) => void
  /** Fareyle üzerine gelince zaman balonu (masaüstü) */
  hoverLabel?: boolean
  /** TV sarma önizlemesi: hedef konum (balon + hayalet dolgu) */
  previewSec?: number | null
}): ReactElement {
  const { position, duration, buffered, disabled, onSeek } = props
  const ref = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const pct = (t: number) => (duration > 0 ? Math.max(0, Math.min(100, (t / duration) * 100)) : 0)
  const preview = props.previewSec ?? null
  const shown = drag ?? preview ?? position
  const timeAt = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration
  }
  const bubble = drag ?? preview ?? (props.hoverLabel ? hover : null)
  return (
    <div
      ref={ref}
      className="kb-scrub"
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="Oynatma konumu"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(shown)}
      aria-valuetext={`${spokenDuration(shown)} / ${spokenDuration(duration)}`}
      aria-disabled={disabled ? 'true' : 'false'}
      data-preview={preview !== null}
      onPointerDown={(e) => {
        if (disabled || duration <= 0) return
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        setDrag(timeAt(e.clientX))
      }}
      onPointerMove={(e) => {
        if (drag !== null) setDrag(timeAt(e.clientX))
        else if (props.hoverLabel && e.pointerType === 'mouse' && duration > 0) setHover(timeAt(e.clientX))
      }}
      onPointerLeave={() => setHover(null)}
      onPointerUp={(e) => {
        if (drag === null) return
        onSeek(timeAt(e.clientX))
        setDrag(null)
      }}
      onPointerCancel={() => setDrag(null)}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="kb-rail">
        {buffered.map((b, i) => (
          <span
            key={i}
            className="kb-buf"
            style={{ left: `${pct(b.start)}%`, width: `${Math.max(0, pct(b.end) - pct(b.start))}%` }}
          />
        ))}
        {preview !== null ? <span className="kb-ghost" style={{ width: `${pct(position)}%` }} /> : null}
        <span className="kb-fill" style={{ width: `${pct(shown)}%` }} />
        {hover !== null && drag === null && preview === null ? (
          <span className="kb-hoverfill" style={{ width: `${pct(hover)}%` }} />
        ) : null}
      </div>
      {!disabled && <span className="kb-thumb" style={{ left: `${pct(shown)}%` }} />}
      {bubble !== null && duration > 0 ? (
        <span className="kb-bubble" style={{ left: `${pct(bubble)}%` }} aria-hidden="true">
          {formatClock(bubble)}
        </span>
      ) : null}
    </div>
  )
}

export function Times({ position, duration }: { position: number; duration: number }): ReactElement {
  return (
    <div className="kb-times" aria-hidden="true">
      <span>{formatClock(position)}</span>
      <span>{duration > 0 ? `-${formatClock(Math.max(0, duration - position))}` : ''}</span>
    </div>
  )
}

/* ───────────── menü ───────────── */

export interface MenuOption {
  id: string
  label: string
  hint?: string
}

export function Menu(props: {
  title: string
  options: MenuOption[]
  selected: string | null
  onSelect: (id: string) => void
  onClose: () => void
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const first =
      ref.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]') ??
      ref.current?.querySelector<HTMLButtonElement>('button')
    first?.focus()
  }, [])
  return (
    <div
      ref={ref}
      className="kb-menu"
      role="menu"
      aria-label={props.title}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          props.onClose()
        }
      }}
    >
      <h2>{props.title}</h2>
      {props.options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="menuitemradio"
          aria-checked={o.id === props.selected}
          className="kb-opt"
          onClick={() => props.onSelect(o.id)}
        >
          <span className="kb-check">{o.id === props.selected ? <IconCheck size={20} /> : null}</span>
          <span>
            {o.label}
            {o.hint ? <small>{o.hint}</small> : null}
          </span>
        </button>
      ))}
    </div>
  )
}

/* ───────────── altyazı katmanı (medya saatine eşzamanlı) ───────────── */

export function SubtitleOverlay({
  controller,
  adapter,
  raised,
}: {
  controller: TextTrackController
  adapter: PlayerAdapter
  raised: boolean
}): ReactElement | null {
  const [cues, setCues] = useState<TtmlCue[]>([])
  useEffect(() => {
    let raf = 0
    let last = ''
    const loop = () => {
      const t = adapter.position()
      const now = controller.cuesAt(t)
      const sig = now.map((c) => `${c.start}-${c.end}`).join('|')
      if (sig !== last) {
        last = sig
        setCues(now)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    const off = controller.subscribe(() => {
      last = '#'
    })
    return () => {
      cancelAnimationFrame(raf)
      off()
    }
  }, [controller, adapter])
  if (!cues.length) return null
  return (
    <div className="kb-subs" data-raised={raised ? 'true' : 'false'} aria-live="off">
      {cues.map((c) =>
        c.lines.map((line, li) => (
          <div key={`${c.start}-${li}`}>
            <span className="kb-cue">
              {line.map((s, si) => {
                const inner = s.italic ? <em>{s.text}</em> : s.text
                return s.bold ? <strong key={si}>{inner}</strong> : <span key={si}>{inner}</span>
              })}
            </span>
          </div>
        )),
      )}
    </div>
  )
}

/* ───────────── istatistik ───────────── */

export function StatsOverlay({ adapter, onClose }: { adapter: PlayerAdapter; onClose: () => void }): ReactElement {
  const s = adapter.stats()
  const row = (k: string, v: ReactNode) => (
    <>
      <dt>{k}</dt>
      <dd>{v ?? '—'}</dd>
    </>
  )
  return (
    <section className="kb-stats" aria-label="Oynatma istatistikleri" onClick={onClose}>
      <h2>İstatistik</h2>
      <dl>
        {row('Kaynak', adapter.kind)}
        {row('Akış', s?.streamId)}
        {row('Biçim', s?.profile)}
        {row('Çözünürlük', s?.resolution)}
        {row('Bit hızı', s?.bitrateKbps ? `${s.bitrateKbps} kbps` : null)}
        {row('Tahmin', s?.estimateKbps ? `${s.estimateKbps} kbps` : null)}
        {row('Tampon', s ? `${s.bufferSec.toFixed(1)} sn` : null)}
        {row('CDN', s?.cdnId)}
        {row('Düşen kare', s ? `${s.droppedFrames} / ${s.totalFrames}` : null)}
      </dl>
    </section>
  )
}

/* ───────────── canlı ───────────── */

export function LiveTag(): ReactElement {
  return (
    <span className="kb-live-tag">
      <span className="kb-live-dot" aria-hidden="true" />
      CANLI
    </span>
  )
}

export function LiveProgramme({ airing }: { airing: AiringBrief }): ReactElement {
  const p = airingProgress(airing.startAt, airing.endAt)
  return (
    <div className="kb-live">
      <span className="kb-card-title">{airing.title}</span>
      <span className="kb-live-meta">
        {formatSpan(airing.startAt, airing.endAt)} · {remainingLabel(airing.endAt)}
      </span>
      <div
        className="kb-live-bar"
        role="progressbar"
        aria-label="Program ilerlemesi"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(p * 100)}
      >
        <span style={{ width: `${p * 100}%` }} />
      </div>
    </div>
  )
}
