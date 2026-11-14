/**
 * Oynatıcı panelleri: Ses ve Altyazı (iki sütun), Bölümler, Oynatma Hızı, Kaynak, Kanal listesi.
 * Üç görünüm: 'popover' (masaüstü, denetim satırının üstünde), 'sheet' (mobil alt sayfa), 'tv' (kumandayla gezilen
 * yan panel; odak durum makinesinden gelir, fare yoktur).
 */
import { useEffect, useRef, type ReactElement, type ReactNode, type RefObject } from 'react'
import { airingProgress } from './format'
import { IconCheck, IconClose } from './icons'
import type { ChannelBrief, EpisodeBrief, SeasonBrief } from './metadata'

export type PanelVariant = 'popover' | 'sheet' | 'tv'

export interface Choice {
  id: string
  label: string
  hint?: string
}

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5] as const
export function speedLabel(s: number): string {
  return s === 1 ? '1x (Normal)' : `${String(s).replace('.', ',')}x`
}

/** TV'de odaktaki satırı görünür tutar. */
function useScrollFocus(active: boolean, dep: unknown): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!active) return
    const el = ref.current?.querySelector<HTMLElement>('[data-focus="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [active, dep])
  return ref
}

function Shell(props: {
  variant: PanelVariant
  title: string
  className?: string
  onClose?: () => void
  children: ReactNode
  side?: 'left' | 'right'
}): ReactElement {
  const { variant } = props
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (variant === 'tv') return
    // Klavye kullanıcısı için: seçili seçeneğe odaklan
    const first =
      ref.current?.querySelector<HTMLElement>('[aria-checked="true"]') ??
      ref.current?.querySelector<HTMLElement>('button')
    first?.focus({ preventScroll: true })
  }, [variant])
  return (
    <div
      ref={ref}
      className={`kb-pnl kb-pnl-${variant}${props.side ? ` kb-pnl-${props.side}` : ''}${props.className ? ` ${props.className}` : ''}`}
      role="dialog"
      aria-label={props.title}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && props.onClose && variant !== 'tv') {
          e.stopPropagation()
          props.onClose()
        }
      }}
    >
      {variant === 'sheet' ? (
        <div className="kb-pnl-head">
          <span className="kb-pnl-grip" aria-hidden="true" />
          <h2>{props.title}</h2>
          {props.onClose ? (
            <button type="button" className="kb-ibtn" aria-label="Kapat" onClick={props.onClose}>
              <IconClose size={22} />
            </button>
          ) : null}
        </div>
      ) : null}
      {props.children}
    </div>
  )
}

function ChoiceList(props: {
  heading: string
  choices: Choice[]
  selected: string | null
  onSelect: (id: string) => void
  focusIndex: number | null
}): ReactElement {
  return (
    <div className="kb-col" role="group" aria-label={props.heading} data-active={props.focusIndex !== null}>
      <h3>{props.heading}</h3>
      <div className="kb-col-list">
        {props.choices.map((c, i) => {
          const on = c.id === props.selected
          return (
            <button
              key={c.id}
              type="button"
              role="menuitemradio"
              aria-checked={on}
              className="kb-choice"
              data-focus={props.focusIndex === i}
              tabIndex={props.focusIndex === null ? 0 : -1}
              onClick={() => props.onSelect(c.id)}
            >
              <span className="kb-choice-check">{on ? <IconCheck size={22} /> : null}</span>
              <span className="kb-choice-label">
                {c.label}
                {c.hint ? <small>{c.hint}</small> : null}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ───────────── Ses ve Altyazı ───────────── */

export function AudioSubsPanel(props: {
  variant: PanelVariant
  audio: Choice[]
  subs: Choice[]
  audioSelected: string | null
  subsSelected: string
  onAudio: (id: string) => void
  onSubs: (id: string) => void
  onClose?: () => void
  /** TV: [sütun, satır] */
  focus?: { column: number; index: number[] } | null
}): ReactElement {
  const f = props.focus ?? null
  const ref = useScrollFocus(!!f, f)
  return (
    <Shell variant={props.variant} title="Ses ve Altyazı" onClose={props.onClose} side="right">
      <div ref={ref} className="kb-cols">
        {props.audio.length ? (
          <ChoiceList
            heading="Ses"
            choices={props.audio}
            selected={props.audioSelected}
            onSelect={props.onAudio}
            focusIndex={f && f.column === 0 ? (f.index[0] ?? 0) : null}
          />
        ) : null}
        {props.subs.length ? (
          <ChoiceList
            heading="Altyazılar"
            choices={props.subs}
            selected={props.subsSelected}
            onSelect={props.onSubs}
            focusIndex={f && f.column === 1 ? (f.index[1] ?? 0) : null}
          />
        ) : null}
      </div>
    </Shell>
  )
}

/* ───────────── Hız ───────────── */

export function SpeedPanel(props: {
  variant: PanelVariant
  speed: number
  onSpeed: (s: number) => void
  onClose?: () => void
}): ReactElement {
  return (
    <Shell variant={props.variant} title="Oynatma Hızı" onClose={props.onClose} className="kb-pnl-speed">
      {props.variant === 'popover' ? <h2 className="kb-pnl-title">Oynatma Hızı</h2> : null}
      <div className="kb-speed" role="radiogroup" aria-label="Oynatma hızı">
        <span className="kb-speed-line" aria-hidden="true" />
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={s === props.speed}
            className="kb-speed-stop"
            onClick={() => props.onSpeed(s)}
          >
            <span className="kb-speed-dot" aria-hidden="true" />
            <span className="kb-speed-label">{speedLabel(s)}</span>
          </button>
        ))}
      </div>
    </Shell>
  )
}

/* ───────────── Kaynak ───────────── */

export function SourcePanel(props: {
  variant: PanelVariant
  /** varsayılan: Kaynak */
  title?: string
  choices: Choice[]
  selected: string
  onSelect: (id: string) => void
  onClose?: () => void
}): ReactElement {
  return (
    <Shell variant={props.variant} title={props.title ?? 'Kaynak'} onClose={props.onClose} side="right">
      <div className="kb-cols">
        <ChoiceList
          heading={props.title ?? 'Kaynak'}
          choices={props.choices}
          selected={props.selected}
          onSelect={props.onSelect}
          focusIndex={null}
        />
      </div>
    </Shell>
  )
}

/* ───────────── Bölümler ───────────── */

export function flattenEpisodes(seasons: SeasonBrief[]): EpisodeBrief[] {
  return seasons.flatMap((s) => s.episodes)
}

function EpisodeRow(props: {
  ep: EpisodeBrief
  current: boolean
  focus: boolean
  expanded: boolean
  tv: boolean
  onPlay: () => void
}): ReactElement {
  const { ep } = props
  const progress = ep.bookmark?.progress ?? 0
  return (
    <button
      type="button"
      className="kb-ep"
      data-current={props.current}
      data-focus={props.focus}
      data-expanded={props.expanded}
      aria-current={props.current ? 'true' : undefined}
      tabIndex={props.tv ? -1 : 0}
      disabled={!ep.isPlayable}
      onClick={props.onPlay}
    >
      <span className="kb-ep-num">{ep.number}</span>
      <span className="kb-ep-body">
        <span className="kb-ep-title">{ep.title}</span>
        {props.expanded ? (
          <span className="kb-ep-more">
            {ep.still?.url ? <img className="kb-ep-still" src={ep.still.url} alt="" /> : null}
            <span className="kb-ep-syn">
              {ep.runtimeSec ? <small>{Math.round(ep.runtimeSec / 60)} dk</small> : null}
              {ep.shortSynopsis}
            </span>
          </span>
        ) : null}
        {progress > 0 ? (
          <span className="kb-ep-bar" aria-hidden="true">
            <span style={{ width: `${Math.min(100, progress * 100)}%` }} />
          </span>
        ) : null}
      </span>
    </button>
  )
}

export function EpisodesPanel(props: {
  variant: PanelVariant
  showTitle: string
  seasons: SeasonBrief[]
  currentId: string | null
  onPlay: (ep: EpisodeBrief) => void
  onClose?: () => void
  /** TV: düz listede odaktaki satır */
  focusIndex?: number | null
  /** popover/sheet: gösterilen sezon ve değiştirme */
  season?: number
  onSeason?: (n: number | null) => void
}): ReactElement {
  const tv = props.variant === 'tv'
  const ref = useScrollFocus(tv, props.focusIndex)
  const currentSeason =
    props.season ??
    props.seasons.find((s) => s.episodes.some((e) => e.unifiedEntityId === props.currentId))?.number ??
    props.seasons[0]?.number ??
    1
  if (tv) {
    let i = -1
    return (
      <Shell variant="tv" title="Bölümler" side="right">
        <div ref={ref} className="kb-eps">
          <h2 className="kb-pnl-title">{props.showTitle}</h2>
          {props.seasons.map((s) => (
            <section key={s.seasonId} aria-label={s.title ?? `Sezon ${s.number}`}>
              <h3 className="kb-eps-season">{s.title ?? `Sezon ${s.number}`}</h3>
              {s.episodes.map((ep) => {
                i += 1
                const focus = props.focusIndex === i
                return (
                  <EpisodeRow
                    key={ep.unifiedEntityId}
                    ep={ep}
                    tv
                    current={ep.unifiedEntityId === props.currentId}
                    focus={focus}
                    expanded={focus}
                    onPlay={() => props.onPlay(ep)}
                  />
                )
              })}
            </section>
          ))}
        </div>
      </Shell>
    )
  }
  const season = props.seasons.find((s) => s.number === currentSeason) ?? props.seasons[0]
  return (
    <Shell variant={props.variant} title="Bölümler" onClose={props.onClose} side="right" className="kb-pnl-eps">
      <div className="kb-eps">
        <div className="kb-eps-head">
          {props.seasons.length > 1 && props.onSeason ? (
            <label className="kb-eps-select">
              <span className="kb-visually-hidden">Sezon</span>
              <select value={currentSeason} onChange={(e) => props.onSeason?.(Number(e.target.value))}>
                {props.seasons.map((s) => (
                  <option key={s.seasonId} value={s.number}>
                    {s.title ?? `Sezon ${s.number}`}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <h2 className="kb-pnl-title">
              {props.showTitle}
              {season ? <small>{season.title ?? `Sezon ${season.number}`}</small> : null}
            </h2>
          )}
        </div>
        <div className="kb-eps-list">
          {(season?.episodes ?? []).map((ep) => (
            <EpisodeRow
              key={ep.unifiedEntityId}
              ep={ep}
              tv={false}
              current={ep.unifiedEntityId === props.currentId}
              focus={false}
              expanded={ep.unifiedEntityId === props.currentId}
              onPlay={() => props.onPlay(ep)}
            />
          ))}
        </div>
      </div>
    </Shell>
  )
}

/* ───────────── Kanal listesi (TV) ───────────── */

export function ChannelListPanel(props: {
  channels: ChannelBrief[]
  currentId: number | null
  focusIndex: number
}): ReactElement {
  const ref = useScrollFocus(true, props.focusIndex)
  return (
    <Shell variant="tv" title="Kanallar" side="left" className="kb-pnl-channels">
      <div ref={ref} className="kb-chlist" role="listbox" aria-label="Kanallar">
        {props.channels.map((c, i) => {
          const p = c.now ? airingProgress(c.now.startAt, c.now.endAt) : 0
          return (
            <div
              key={c.channelId}
              className="kb-ch"
              role="option"
              aria-selected={c.channelId === props.currentId}
              data-focus={i === props.focusIndex}
              data-current={c.channelId === props.currentId}
            >
              <span className="kb-ch-num">{c.number}</span>
              <span className="kb-ch-logo">
                {c.logo?.url ? <img src={c.logo.url} alt="" /> : <span>{c.name.slice(0, 2)}</span>}
              </span>
              <span className="kb-ch-body">
                <span className="kb-ch-name">{c.name}</span>
                <span className="kb-ch-now">{c.now ? c.now.title : 'Yayın bilgisi yok'}</span>
                {c.now ? (
                  <span className="kb-ch-bar" aria-hidden="true">
                    <span style={{ width: `${p * 100}%` }} />
                  </span>
                ) : null}
              </span>
            </div>
          )
        })}
      </div>
    </Shell>
  )
}

/* ───────────── küçük parçalar ───────────── */

/** "S1:B3" */
export function episodeCode(season: number | undefined, num: number | undefined): string | null {
  if (!season || !num) return null
  return `S${season}:B${num}`
}
