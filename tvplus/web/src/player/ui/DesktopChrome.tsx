/**
 * Masaüstü oynatıcı kabuğu (UX_SPEC §2 "Oynatıcı", Netflix web düzeni): sol üstte geri oku; altta vurgu renginde
 * ilerleme çubuğu + sağında kalan süre; denetim satırı — sol: oynat/duraklat · 10 sn geri · 10 sn ileri · ses;
 * orta: başlık; sağ: sonraki bölüm · bölümler · ses ve altyazı · hız · kaynak · TV'de izle · resim içinde resim ·
 * tam ekran. 3 sn hareketsizlikte gizlenir.
 */
import { useEffect, useRef, useState, type ReactElement, type ReactNode, type RefObject } from 'react'
import type { PlayerModel } from './core'
import { SOURCE_LABEL } from './core'
import {
  ErrorPanel,
  Glyph,
  NextCard,
  Stats,
  Subtitles,
  Busy,
  TitleLine,
  useGlyph,
  useIdle,
  type GlyphKind,
} from './common'
import { formatClock } from './format'
import {
  IconArrowLeft,
  IconAudioSubs,
  IconBack10,
  IconCast,
  IconChevronLeft,
  IconChevronRight,
  IconEpisodes,
  IconFullscreen,
  IconFullscreenExit,
  IconFwd10,
  IconMuted,
  IconNextEpisode,
  IconPause,
  IconPip,
  IconPlay,
  IconRestart,
  IconSettings,
  IconSource,
  IconSpeed,
  IconVolume,
} from './icons'
import { AudioSubsPanel, EpisodesPanel, SourcePanel, SpeedPanel } from './panels'
import { LiveProgramme, LiveTag, Scrubber } from './parts'

export type PointerPanel = 'audioSubs' | 'episodes' | 'speed' | 'source' | 'quality'

/** Masaüstü ve mobilde klavye kısayolları (Netflix web ile aynı): boşluk/K, ←/→, ↑/↓, M, F, I, Esc, PageUp/Down. */
export function usePointerKeys(
  m: PlayerModel,
  opts: {
    poke: () => void
    glyph: (k: GlyphKind, label?: string | null) => void
    closePanel: () => boolean
    fullscreen: () => void
  },
): void {
  const ref = useRef({ m, opts })
  ref.current = { m, opts }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const { m: mm, opts: o } = ref.current
      const a = mm.adapter
      if (!a) return
      // Odak bir düğmedeyken Enter/boşluk o düğmeye aittir
      if ((e.key === ' ' || e.key === 'Enter') && tag === 'BUTTON') return
      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          o.glyph(mm.playing ? 'pause' : 'play')
          mm.act.togglePlay()
          break
        case 'ArrowLeft':
        case 'j':
        case 'J':
          if (!mm.seekable) return
          mm.act.seekBy(-10)
          o.glyph('back')
          break
        case 'ArrowRight':
        case 'l':
        case 'L':
          if (!mm.seekable) return
          mm.act.seekBy(10)
          o.glyph('fwd')
          break
        case 'ArrowUp':
          mm.act.volumeBy(10)
          o.glyph('volume', `%${Math.round(Math.min(1, (mm.muted ? 0 : mm.volume) + 0.1) * 100)}`)
          break
        case 'ArrowDown': {
          mm.act.volumeBy(-10)
          const v = Math.max(0, (mm.muted ? 0 : mm.volume) - 0.1)
          o.glyph(v <= 0.001 ? 'muted' : 'volume', `%${Math.round(v * 100)}`)
          break
        }
        case 'm':
        case 'M':
          o.glyph(mm.muted ? 'volume' : 'muted')
          mm.act.toggleMute()
          break
        case 'f':
        case 'F':
          o.fullscreen()
          break
        case 'i':
        case 'I':
          mm.act.setStats((s) => !s)
          break
        case 'c':
        case 'C':
          if (!mm.act.toggleSubtitles()) return
          break
        case 'PageUp':
          if (!mm.act.zap(-1)) return
          break
        case 'PageDown':
          if (!mm.act.zap(1)) return
          break
        case 'Escape':
          if (o.closePanel()) break
          if (mm.stats) mm.act.setStats(false)
          else if (!document.fullscreenElement) mm.act.back()
          break
        default:
          return
      }
      e.preventDefault()
      o.poke()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export function toggleFullscreen(root: HTMLElement | null): void {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
  else void root?.requestFullscreen?.().catch(() => undefined)
}

function Btn(props: {
  label: string
  onClick: () => void
  children: ReactNode
  expanded?: boolean
  pressed?: boolean
  className?: string
  onHover?: (on: boolean) => void
}): ReactElement {
  return (
    <button
      type="button"
      className={`kb-cbtn${props.className ? ` ${props.className}` : ''}`}
      aria-label={props.label}
      title={props.label}
      aria-expanded={props.expanded}
      aria-pressed={props.pressed}
      aria-haspopup={props.expanded !== undefined ? 'dialog' : undefined}
      onClick={(e) => {
        e.stopPropagation()
        props.onClick()
      }}
      onPointerEnter={() => props.onHover?.(true)}
      onPointerLeave={() => props.onHover?.(false)}
    >
      {props.children}
    </button>
  )
}

export function ZapButtons({ m }: { m: PlayerModel }): ReactElement | null {
  const prev = m.meta?.previousChannel
  const next = m.meta?.nextChannel
  if (!prev && !next) return null
  return (
    <span className="kb-zap">
      <Btn label={prev ? `Önceki kanal: ${prev.name}` : 'Önceki kanal yok'} onClick={() => m.act.zap(-1)}>
        <IconChevronLeft size={32} />
      </Btn>
      <Btn label={next ? `Sonraki kanal: ${next.name}` : 'Sonraki kanal yok'} onClick={() => m.act.zap(1)}>
        <IconChevronRight size={32} />
      </Btn>
    </span>
  )
}

export function DesktopChrome({
  m,
  stageRef,
}: {
  m: PlayerModel
  stageRef: RefObject<HTMLDivElement | null>
}): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null)
  const [panel, setPanel] = useState<PointerPanel | null>(null)
  const [nextHover, setNextHover] = useState(false)
  const [season, setSeason] = useState<number | undefined>(undefined)
  const { idle, poke } = useIdle(3000)
  const [glyph, showGlyph] = useGlyph()
  const hidden = idle && m.playing && !panel && !m.error && !nextHover
  const fullscreen = () => toggleFullscreen(rootRef.current)
  usePointerKeys(m, {
    poke,
    glyph: showGlyph,
    fullscreen,
    closePanel: () => {
      if (!panel) return false
      setPanel(null)
      return true
    },
  })
  const toggle = () => {
    showGlyph(m.playing ? 'pause' : 'play')
    m.act.togglePlay()
  }
  const open = (p: PointerPanel) => setPanel((cur) => (cur === p ? null : p))
  const airing = m.meta?.airing ?? null
  const remaining = Math.max(0, m.duration - m.position)
  const showSource = m.sources.includes('OWN_CDN') && m.sources.includes('YOUTUBE')
  const n = m.next
  const qualityOpts = m.adapter?.qualityOptions() ?? []
  const q = m.adapter?.currentQuality() ?? { lockedId: null, activeId: null }
  const activeQ = qualityOpts.find((o) => o.id === q.activeId)

  return (
    <div
      ref={rootRef}
      className="kb-root"
      data-chrome="desktop"
      data-idle={hidden ? 'true' : 'false'}
      onPointerMove={poke}
      onPointerDown={poke}
      role="region"
      aria-label={`Oynatıcı: ${m.title.main}`}
    >
      <div
        ref={stageRef}
        className="kb-stage"
        onClick={() => {
          if (panel) setPanel(null)
          else toggle()
        }}
        onDoubleClick={fullscreen}
      />
      <Subtitles m={m} raised={!hidden} />
      <Busy m={m} />
      <Glyph glyph={glyph} />

      <div className="kb-chrome" data-hidden={hidden ? 'true' : 'false'}>
        <div className="kb-top">
          <Btn label="Geri" onClick={() => m.act.back()} className="kb-cbtn-back">
            <IconArrowLeft size={36} />
          </Btn>
          <span className="kb-spacer" />
          {m.isLive ? <LiveTag /> : null}
        </div>

        <div className="kb-bottom">
          {m.isLive && airing && !m.seekable ? <LiveProgramme airing={airing} /> : null}
          {m.seekable ? (
            <div className="kb-scrubrow">
              <Scrubber
                position={m.position}
                duration={m.duration}
                buffered={m.buffered}
                hoverLabel
                onSeek={(t) => m.act.seek(t)}
              />
              <span className="kb-remaining" aria-label={`Kalan süre ${formatClock(remaining)}`}>
                {formatClock(remaining)}
              </span>
            </div>
          ) : null}
          <div className="kb-ctrls">
            <div className="kb-ctrls-l">
              <Btn label={m.playing ? 'Duraklat' : 'Oynat'} onClick={toggle}>
                {m.playing ? <IconPause size={40} /> : <IconPlay size={40} />}
              </Btn>
              {m.seekable ? (
                <>
                  <Btn
                    label="10 saniye geri"
                    onClick={() => {
                      m.act.seekBy(-10)
                      showGlyph('back')
                    }}
                  >
                    <IconBack10 size={40} />
                  </Btn>
                  <Btn
                    label="10 saniye ileri"
                    onClick={() => {
                      m.act.seekBy(10)
                      showGlyph('fwd')
                    }}
                  >
                    <IconFwd10 size={40} />
                  </Btn>
                </>
              ) : null}
              <span className="kb-vol" onClick={(e) => e.stopPropagation()}>
                <Btn label={m.muted ? 'Sesi aç' : 'Sesi kapat'} pressed={m.muted} onClick={() => m.act.toggleMute()}>
                  {m.muted || m.volume === 0 ? <IconMuted size={40} /> : <IconVolume size={40} />}
                </Btn>
                <span className="kb-vol-pop">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={m.muted ? 0 : m.volume}
                    aria-label="Ses düzeyi"
                    onChange={(e) => m.act.setVolume(Number(e.target.value))}
                  />
                </span>
              </span>
              {m.meta?.channel ? <ZapButtons m={m} /> : null}
            </div>

            <div className="kb-ctrls-c">
              <TitleLine m={m} />
            </div>

            <div className="kb-ctrls-r">
              {m.isLive && airing?.startOver && !m.props.fromStart ? (
                <Btn label="Baştan başlat" onClick={() => m.act.startOver(true)}>
                  <IconRestart size={36} />
                </Btn>
              ) : null}
              {m.isLive && m.props.fromStart ? (
                <button
                  type="button"
                  className="kb-btn kb-btn-secondary kb-btn-sm"
                  onClick={() => m.act.startOver(false)}
                >
                  Canlıya dön
                </button>
              ) : null}
              {n ? (
                <span className="kb-nextwrap">
                  <Btn label={`Sonraki bölüm: ${n.title}`} onClick={() => m.act.goNext()} onHover={setNextHover}>
                    <IconNextEpisode size={40} />
                  </Btn>
                  {nextHover ? (
                    <span className="kb-nexthover" aria-hidden="true">
                      <span className="kb-nexthover-head">Sonraki Bölüm</span>
                      <span className="kb-nexthover-body">
                        {n.storyArt?.url ? <img src={n.storyArt.url} alt="" /> : null}
                        <span>
                          <strong>
                            {n.number}. {n.title}
                          </strong>
                          {n.runtimeSec ? <small>{Math.round(n.runtimeSec / 60)} dk</small> : null}
                        </span>
                      </span>
                    </span>
                  ) : null}
                </span>
              ) : null}
              {m.seasons && m.seasons.length ? (
                <Btn label="Bölümler" expanded={panel === 'episodes'} onClick={() => open('episodes')}>
                  <IconEpisodes size={40} />
                </Btn>
              ) : null}
              {m.audio.length > 1 || m.subs.length > 1 ? (
                <Btn label="Ses ve Altyazı" expanded={panel === 'audioSubs'} onClick={() => open('audioSubs')}>
                  <IconAudioSubs size={40} />
                </Btn>
              ) : null}
              {m.adapter?.media ? (
                <Btn label="Oynatma hızı" expanded={panel === 'speed'} onClick={() => open('speed')}>
                  <IconSpeed size={40} />
                </Btn>
              ) : null}
              {qualityOpts.length > 1 ? (
                <Btn label="Kalite" expanded={panel === 'quality'} onClick={() => open('quality')}>
                  <IconSettings size={40} />
                </Btn>
              ) : null}
              {showSource ? (
                <Btn label="Kaynak" expanded={panel === 'source'} onClick={() => open('source')}>
                  <IconSource size={40} />
                </Btn>
              ) : null}
              {m.castAvailable ? (
                <Btn label="TV'de İzle" onClick={() => m.act.cast()}>
                  <IconCast size={40} />
                </Btn>
              ) : null}
              {m.pipAvailable ? (
                <Btn label="Resim içinde resim" onClick={() => m.act.pip()}>
                  <IconPip size={40} />
                </Btn>
              ) : null}
              <Btn label={document.fullscreenElement ? 'Tam ekrandan çık' : 'Tam ekran'} onClick={fullscreen}>
                {document.fullscreenElement ? <IconFullscreenExit size={40} /> : <IconFullscreen size={40} />}
              </Btn>
            </div>
          </div>
        </div>
      </div>

      {panel === 'audioSubs' ? (
        <AudioSubsPanel
          variant="popover"
          audio={m.audio.length > 1 ? m.audio : []}
          subs={m.subs}
          audioSelected={m.audioSelected}
          subsSelected={m.subsSelected}
          onAudio={(id) => m.act.selectAudio(id)}
          onSubs={(id) => m.act.selectSubs(id)}
          onClose={() => setPanel(null)}
        />
      ) : null}
      {panel === 'speed' ? (
        <SpeedPanel
          variant="popover"
          speed={m.speed}
          onSpeed={(s) => m.act.setSpeed(s)}
          onClose={() => setPanel(null)}
        />
      ) : null}
      {panel === 'source' ? (
        <SourcePanel
          variant="popover"
          choices={m.sources.map((s) => ({ id: s, label: SOURCE_LABEL[s] }))}
          selected={m.currentSource}
          onSelect={(id) => {
            setPanel(null)
            m.act.changeSource(id === 'YOUTUBE' ? 'YOUTUBE' : 'OWN_CDN')
          }}
          onClose={() => setPanel(null)}
        />
      ) : null}
      {panel === 'quality' ? (
        <SourcePanel
          variant="popover"
          title="Kalite"
          choices={[
            { id: 'auto', label: 'Otomatik', hint: activeQ ? `Şu an ${activeQ.label}` : undefined },
            ...[...qualityOpts].reverse().map((o) => ({ id: o.id, label: o.label })),
          ]}
          selected={q.lockedId ?? 'auto'}
          onSelect={(id) => {
            m.adapter?.selectQuality(id === 'auto' ? null : id)
            setPanel(null)
          }}
          onClose={() => setPanel(null)}
        />
      ) : null}
      {panel === 'episodes' && m.seasons ? (
        <EpisodesPanel
          variant="popover"
          showTitle={m.title.main}
          seasons={m.seasons}
          currentId={m.currentEpisodeId}
          season={season}
          onSeason={(s) => setSeason(s ?? undefined)}
          onPlay={(ep) => {
            setPanel(null)
            m.act.playEpisode(ep)
          }}
          onClose={() => setPanel(null)}
        />
      ) : null}

      {m.resumeChip && !hidden ? (
        <div className="kb-resume">
          <button type="button" className="kb-btn kb-btn-secondary" onClick={() => m.act.restartFromBeginning()}>
            <IconRestart size={20} />
            Baştan başlat
          </button>
        </div>
      ) : null}
      <NextCard m={m} />
      <Stats m={m} />
      <ErrorPanel m={m} />
    </div>
  )
}
