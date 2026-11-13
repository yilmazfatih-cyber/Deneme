/**
 * Tam ekran oynatma sayfası: #/izle/:viewableId  (?tctx=…&baslat=bastan&kaynak=OWN_CDN|YOUTUBE)
 * PlaybackMetadata (GraphQL) ile lisanslı manifest (MSL) paralel yüklenir. Oynatılamıyorsa sakin bir alt sayfa,
 * gömmede (YouTube) arayüz çerçevenin çevresinde, kendi akışlarımızda kendi denetimlerimiz.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactElement } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { EmbedManifest, LicensedManifest } from '../../../../shared/playback'
import { devbus } from '../../lib/devbus'
import { createAdapter } from '../adapters'
import type { PlayerAdapter, PlayerError } from '../adapters/types'
import type { YouTubeAdapter } from '../adapters/youtube'
import { ManifestRequestError, prefetchManifest, requestManifest } from '../net/manifest'
import { startNetworkProbing } from '../net/ftl'
import { TextTrackController } from '../text/textTracks'
import {
  IconAudio,
  IconBack10,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconFullscreen,
  IconFwd10,
  IconMuted,
  IconNextEpisode,
  IconPause,
  IconPlay,
  IconRestart,
  IconSettings,
  IconSource,
  IconSubtitles,
  IconVolume,
} from './icons'
import { loadPlaybackMetadata, saveLastChannel, type PlaybackMetadata } from './metadata'
import { LiveProgramme, LiveTag, Menu, Scrubber, StatsOverlay, SubtitleOverlay, Times, type MenuOption } from './parts'
import { PlaybackSession } from './session'
import './player.css'

type Source = 'OWN_CDN' | 'YOUTUBE'
type MenuKind = 'subs' | 'audio' | 'quality' | 'source'

/** Kaynak değişiminde konumu korumak için (yeni manifest gelince oradan başlanır). */
let resumeHint: { viewableId: string; positionSec: number } | null = null
/** Son kaydedilen oynatma niyeti (StrictMode'un çift kurulumunda ikinciyi yutmak için) */
let lastIntent: { key: string; at: number } | null = null

interface LoadFailure {
  kind: 'access' | 'error'
  title: string
  text: string
  retryable: boolean
}

const SOURCE_LABEL: Record<Source, string> = { OWN_CDN: "Kendi CDN'imiz", YOUTUBE: 'YouTube' }

function failureFromError(err: unknown): LoadFailure {
  if (err instanceof ManifestRequestError) {
    switch (err.code) {
      case 'ACCESS_DENIED':
        return { kind: 'access', title: 'Bu içerik paketinde yok', text: err.access?.reasonText ?? 'Bu içeriği izleme yetkin yok.', retryable: false }
      case 'NOT_FOUND':
        return { kind: 'error', title: 'İçerik bulunamadı', text: 'Bu içerik artık yayında olmayabilir.', retryable: false }
      case 'NO_COMPATIBLE_SOURCE':
        return { kind: 'error', title: 'Bu cihazda oynatılamıyor', text: 'Tarayıcın bu yayının biçimini desteklemiyor.', retryable: false }
      case 'SOURCE_UNAVAILABLE':
        return { kind: 'error', title: 'Yayın şu an hazır değil', text: 'Biraz sonra yeniden dene.', retryable: true }
      default:
        return { kind: 'error', title: 'Oynatma başlatılamadı', text: 'Bağlantını kontrol edip yeniden dene.', retryable: true }
    }
  }
  return { kind: 'error', title: 'Oynatma başlatılamadı', text: 'Bağlantını kontrol edip yeniden dene.', retryable: true }
}

/** Başlangıç konumu: kaynak değişimi → canlıda katılma noktası → yer imi (baştan başlat istenmediyse). */
function startPosition(manifest: LicensedManifest, meta: PlaybackMetadata | null, fromStart: boolean, hintSec: number | null): { sec: number; resumed: boolean } {
  if (hintSec !== null) return { sec: hintSec, resumed: false }
  if (manifest.live) return { sec: manifest.live.joinOffsetMs / 1000, resumed: false }
  if (fromStart) return { sec: 0, resumed: false }
  // Devam konumu PlaybackMetadata'dan (her istekte taze); manifest.bookmark yalnızca yedek
  const bm = meta?.bookmark ? meta.bookmark.positionSec : manifest.bookmark ? manifest.bookmark.positionMs / 1000 : 0
  const dur = manifest.durationMs ? manifest.durationMs / 1000 : (meta?.video?.runtimeSec ?? 0)
  if (bm > 5 && (!dur || bm < dur - 10)) return { sec: bm, resumed: true }
  if (manifest.kind === 'EXTERNAL_EMBED' && manifest.startSec) return { sec: manifest.startSec, resumed: false }
  return { sec: 0, resumed: false }
}

export default function WatchPageImpl(): ReactElement {
  const params = useParams()
  const viewableId = decodeURIComponent(params.viewableId ?? '')
  const [sp, setSp] = useSearchParams()
  const navigate = useNavigate()
  const tctx = sp.get('tctx')
  const fromStart = sp.get('baslat') === 'bastan'
  const kaynakParam = sp.get('kaynak')
  const kaynak: Source | null = kaynakParam === 'OWN_CDN' || kaynakParam === 'YOUTUBE' ? kaynakParam : null
  const [meta, setMeta] = useState<PlaybackMetadata | null | undefined>(undefined)
  const [manifest, setManifest] = useState<LicensedManifest | null>(null)
  const [failure, setFailure] = useState<LoadFailure | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [session, setSession] = useState<PlaybackSession | null>(null)
  const [start, setStart] = useState<{ sec: number; resumed: boolean }>({ sec: 0, resumed: false })

  const goBack = useCallback(() => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/')
  }, [navigate])

  useEffect(() => {
    startNetworkProbing()
    const ctrl = new AbortController()
    const isChannel = viewableId.startsWith('Channel:')
    const live = isChannel || viewableId.startsWith('Airing:')
    const s = new PlaybackSession(viewableId, tctx, live)
    // StrictMode efekti iki kez kurar: aynı kullanıcı eylemi için tek playback.intent
    const intentKey = `${viewableId}|${fromStart}|${kaynak}|${reloadKey}|${tctx}`
    if (!(lastIntent && lastIntent.key === intentKey && performance.now() - lastIntent.at < 1500)) {
      lastIntent = { key: intentKey, at: performance.now() }
      s.intent({ fromStart, kaynak, reload: reloadKey })
    }
    setSession(s)
    setMeta(undefined)
    setManifest(null)
    setFailure(null)
    devbus.emit('player', 'durum: yükleniyor', { viewableId, state: 'loading', positionSec: 0 })
    const hint = resumeHint && resumeHint.viewableId === viewableId ? resumeHint : null
    const metaP = loadPlaybackMetadata(viewableId, ctrl.signal)
    const manP = (async (): Promise<LicensedManifest> => {
      if (isChannel && fromStart) {
        // Canlı kanalda "Baştan başlat": yayındaki programın kaydını iste
        const m = await metaP.catch(() => null)
        if (m?.airing?.startOver) return requestManifest(m.airing.unifiedEntityId, { startOver: true, fresh: reloadKey > 0 })
      }
      return requestManifest(viewableId, {
        preferredSource: kaynak ?? undefined,
        fresh: reloadKey > 0,
      })
    })()
    void Promise.allSettled([metaP, manP]).then(([mr, nr]) => {
      if (ctrl.signal.aborted) return
      const m = mr.status === 'fulfilled' ? mr.value : null
      setMeta(m)
      if (m && m.access.state !== 'PLAYABLE') {
        setFailure({ kind: 'access', title: m.title, text: m.access.reasonText ?? 'Bu içerik paketinde yok.', retryable: false })
        return
      }
      if (nr.status === 'rejected') {
        setFailure(failureFromError(nr.reason))
        return
      }
      const man = nr.value
      if (hint) resumeHint = null
      s.setLive(!!man.live)
      setStart(startPosition(man, m, fromStart, hint?.positionSec ?? null))
      setManifest(man)
    })
    return () => {
      ctrl.abort()
      s.dispose('exit')
    }
  }, [viewableId, fromStart, kaynak, reloadKey, tctx])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  const changeSource = useCallback(
    (src: Source, positionSec: number) => {
      resumeHint = { viewableId, positionSec }
      const next = new URLSearchParams(sp)
      next.set('kaynak', src)
      next.delete('baslat')
      setSp(next, { replace: true })
    },
    [sp, setSp, viewableId],
  )

  const goTo = useCallback(
    (target: string, extra: Record<string, string> = {}) => {
      const q = new URLSearchParams()
      if (tctx) q.set('tctx', tctx)
      for (const [k, v] of Object.entries(extra)) q.set(k, v)
      const qs = q.toString()
      navigate(`/izle/${encodeURIComponent(target)}${qs ? `?${qs}` : ''}`, { replace: true })
    },
    [navigate, tctx],
  )

  const setFromStart = useCallback(
    (on: boolean) => {
      const next = new URLSearchParams(sp)
      if (on) next.set('baslat', 'bastan')
      else next.delete('baslat')
      setSp(next, { replace: true })
    },
    [sp, setSp],
  )

  if (failure) {
    return (
      <NotPlayableSheet
        failure={failure}
        meta={meta ?? null}
        onBack={goBack}
        onRetry={failure.retryable ? () => setReloadKey((k) => k + 1) : null}
      />
    )
  }
  if (!manifest || !session) {
    return (
      <div className="kb-root" aria-busy="true">
        <div className="kb-chrome">
          <div className="kb-top">
            <button type="button" className="kb-ibtn" aria-label="Geri" onClick={goBack}>
              <IconChevronLeft />
            </button>
            <div className="kb-titles">
              <p className="kb-title">{meta?.title ?? ''}</p>
              {meta?.subtitle ? <p className="kb-sub">{meta.subtitle}</p> : null}
            </div>
          </div>
        </div>
        <div className="kb-spinner" role="status" aria-label="Yükleniyor" />
      </div>
    )
  }

  const common = {
    meta: meta ?? null,
    session,
    startSec: start.sec,
    onBack: goBack,
    onChangeSource: changeSource,
    onGoTo: goTo,
    onReload: reload,
    onFromStart: setFromStart,
    fromStart,
  }
  if (manifest.kind === 'EXTERNAL_EMBED') return <EmbedView key={manifest.manifestId} {...common} manifest={manifest} />
  return <VideoView key={manifest.manifestId} {...common} manifest={manifest} resumed={start.resumed} />
}

interface ViewProps {
  meta: PlaybackMetadata | null
  session: PlaybackSession
  startSec: number
  fromStart: boolean
  onBack: () => void
  onChangeSource: (src: Source, positionSec: number) => void
  onGoTo: (viewableId: string, extra?: Record<string, string>) => void
  onReload: () => void
  onFromStart: (on: boolean) => void
}

/* ───────────── canlı kanal ortak davranışları ───────────── */

function useChannelEffects(meta: PlaybackMetadata | null, manifest: LicensedManifest, onReload: () => void): void {
  const channelId = meta?.channel?.channelId ?? null
  useEffect(() => {
    if (channelId === null) return
    saveLastChannel(channelId).catch(() => undefined)
  }, [channelId])
  const prev = meta?.previousChannel?.channelId ?? null
  const next = meta?.nextChannel?.channelId ?? null
  useEffect(() => {
    // Zap anında başlasın diye komşu kanalların manifestini önceden hazırla
    if (prev !== null) void prefetchManifest(`Channel:${prev}`)
    if (next !== null) void prefetchManifest(`Channel:${next}`)
  }, [prev, next])
  const endAt = manifest.live?.endAt ?? null
  useEffect(() => {
    if (!endAt) return
    const ms = new Date(endAt).getTime() - Date.now() + 1000
    if (ms <= 0 || ms > 24 * 3600_000) return
    // Program bitince yeni programın manifestini iste
    const t = window.setTimeout(() => {
      devbus.emit('player', 'program bitti: manifest yenileniyor', { viewableId: manifest.viewableId, state: 'loading', endAt })
      onReload()
    }, ms)
    return () => clearTimeout(t)
  }, [endAt, manifest.viewableId, onReload])
}

function ZapButtons({ meta, onGoTo }: { meta: PlaybackMetadata | null; onGoTo: ViewProps['onGoTo'] }): ReactElement | null {
  const prev = meta?.previousChannel
  const next = meta?.nextChannel
  if (!prev && !next) return null
  return (
    <span className="kb-zap">
      <button type="button" className="kb-ibtn" aria-label={prev ? `Önceki kanal: ${prev.name}` : 'Önceki kanal yok'} disabled={!prev} onClick={() => prev && onGoTo(`Channel:${prev.channelId}`)}>
        <IconChevronLeft />
      </button>
      <button type="button" className="kb-ibtn" aria-label={next ? `Sonraki kanal: ${next.name}` : 'Sonraki kanal yok'} disabled={!next} onClick={() => next && onGoTo(`Channel:${next.channelId}`)}>
        <IconChevronRight />
      </button>
      {next ? <span className="kb-zap-label kb-wide-only">{next.number}. {next.name}</span> : null}
    </span>
  )
}

/* ───────────── kendi akışlarımız (STREAMS / PROGRESSIVE) ───────────── */

function VideoView(props: ViewProps & { manifest: Exclude<LicensedManifest, EmbedManifest>; resumed: boolean }): ReactElement {
  const { manifest, meta, session, startSec, onBack, onChangeSource, onGoTo, onReload, onFromStart, fromStart } = props
  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const adapterRef = useRef<PlayerAdapter | null>(null)
  const [adapter, setAdapter] = useState<PlayerAdapter | null>(null)
  const [, force] = useReducer((x: number) => x + 1, 0)
  const [error, setError] = useState<PlayerError | null>(null)
  const [menu, setMenu] = useState<MenuKind | null>(null)
  const [idle, setIdle] = useState(false)
  const [stats, setStats] = useState(false)
  const [resumeChip, setResumeChip] = useState(props.resumed)
  const [nextDismissed, setNextDismissed] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const idleTimer = useRef<number | null>(null)
  const text = useMemo(() => new TextTrackController(manifest.timedTextTracks), [manifest])

  useChannelEffects(meta, manifest, onReload)

  useEffect(() => {
    const a = createAdapter(manifest, {
      startSec,
      autoplay: true,
      muted: false,
      refreshManifest: () =>
        requestManifest(manifest.viewableId, {
          fresh: true,
          startOver: manifest.viewableId.startsWith('Airing:') || undefined,
          preferredSource: manifest.alternatives.length > 1 ? 'OWN_CDN' : undefined,
        }),
    })
    adapterRef.current = a
    session.attach(a, manifest)
    const off = a.on((e) => {
      if (e.type === 'error') setError(e.error)
      else if (e.type === 'state' && e.state !== 'error') setError(null)
      force()
    })
    setAdapter(a)
    if (stageRef.current) void a.mount(stageRef.current)
    return () => {
      off()
      a.destroy()
      adapterRef.current = null
    }
    // startSec yalnızca bağdaştırıcı kurulurken okunur
  }, [manifest, session])

  useEffect(() => {
    const id = window.setInterval(force, 250)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!resumeChip) return
    const t = window.setTimeout(() => setResumeChip(false), 12_000)
    return () => clearTimeout(t)
  }, [resumeChip])

  const poke = useCallback(() => {
    setIdle(false)
    if (idleTimer.current !== null) clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(() => setIdle(true), 3000)
  }, [])
  useEffect(() => {
    poke()
    return () => {
      if (idleTimer.current !== null) clearTimeout(idleTimer.current)
    }
  }, [poke])

  const state = adapter?.state() ?? 'loading'
  const pos = adapter?.position() ?? startSec
  const dur = adapter?.duration() || (manifest.durationMs ? manifest.durationMs / 1000 : 0)
  const isLive = !!manifest.live
  const seekable = !isLive || manifest.live?.seekable !== false
  const next = meta?.nextEpisode ?? null
  const credits = meta?.creditsOffsetSec ?? null
  const showNext = !!next && !nextDismissed && ((credits !== null && pos >= credits) || state === 'ended')
  const airing = meta?.airing ?? null
  const hidden = idle && state === 'playing' && !menu && !error && !showNext

  const togglePlay = useCallback(() => {
    const a = adapterRef.current
    if (!a) return
    if (a.state() === 'playing' || a.state() === 'buffering') a.pause()
    else void a.play()
  }, [])
  const seekBy = useCallback((d: number) => {
    const a = adapterRef.current
    if (a) a.seek(a.position() + d)
  }, [])
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    else void rootRef.current?.requestFullscreen?.().catch(() => undefined)
  }, [])
  const goNext = useCallback(() => {
    if (next) onGoTo(next.unifiedEntityId)
  }, [next, onGoTo])

  // Sonraki bölüm geri sayımı (yalnız oynarken ya da bitince ilerler)
  useEffect(() => {
    if (!showNext) {
      setCountdown(null)
      return
    }
    setCountdown((c) => (c === null ? 10 : c))
    const id = window.setInterval(() => {
      const st = adapterRef.current?.state()
      if (st !== 'playing' && st !== 'ended') return
      setCountdown((c) => (c === null ? 10 : Math.max(0, c - 1)))
    }, 1000)
    return () => clearInterval(id)
  }, [showNext])
  useEffect(() => {
    if (countdown === 0) goNext()
  }, [countdown, goNext])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const a = adapterRef.current
      if (!a) return
      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          togglePlay()
          break
        case 'ArrowLeft':
          if (!seekable) return
          seekBy(-10)
          break
        case 'ArrowRight':
          if (!seekable) return
          seekBy(10)
          break
        case 'ArrowUp':
          a.setVolume(a.volume() + 0.1)
          break
        case 'ArrowDown':
          a.setVolume(a.volume() - 0.1)
          break
        case 'm':
        case 'M':
          a.setMuted(!a.muted())
          break
        case 'f':
        case 'F':
          toggleFullscreen()
          break
        case 'i':
        case 'I':
          setStats((s) => !s)
          break
        case 'PageUp':
          if (meta?.previousChannel) onGoTo(`Channel:${meta.previousChannel.channelId}`)
          else return
          break
        case 'PageDown':
          if (meta?.nextChannel) onGoTo(`Channel:${meta.nextChannel.channelId}`)
          else return
          break
        case 'Escape':
          if (menu) setMenu(null)
          else if (stats) setStats(false)
          else if (!document.fullscreenElement) onBack()
          break
        default:
          return
      }
      e.preventDefault()
      poke()
      force()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay, seekBy, toggleFullscreen, meta, onGoTo, onBack, menu, stats, seekable, poke])

  const audioOpts = adapter?.audioOptions() ?? []
  const qualityOpts = adapter?.qualityOptions() ?? []
  const q = adapter?.currentQuality() ?? { lockedId: null, activeId: null }
  const activeQ = qualityOpts.find((o) => o.id === q.activeId)
  const sources = manifest.alternatives.filter((s): s is Source => s === 'OWN_CDN' || s === 'YOUTUBE')
  const showSourceMenu = sources.includes('OWN_CDN') && sources.includes('YOUTUBE')
  const muted = adapter?.muted() ?? false
  const playing = state === 'playing' || state === 'buffering'

  const menuEl = (() => {
    if (!menu || !adapter) return null
    const close = () => setMenu(null)
    if (menu === 'subs') {
      const opts: MenuOption[] = [{ id: 'off', label: 'Kapalı' }, ...text.tracks.map((t) => ({ id: t.trackId, label: t.languageDescription, hint: t.type === 'CC' ? 'İşitme engelliler için' : undefined }))]
      return (
        <Menu
          title="Altyazı"
          options={opts}
          selected={text.selectedId() ?? 'off'}
          onClose={close}
          onSelect={(id) => {
            text.select(id === 'off' ? null : id)
            close()
          }}
        />
      )
    }
    if (menu === 'audio') {
      return (
        <Menu
          title="Ses"
          options={audioOpts.map((o) => ({ id: o.id, label: o.label }))}
          selected={adapter.currentAudio()}
          onClose={close}
          onSelect={(id) => {
            adapter.selectAudio(id)
            close()
          }}
        />
      )
    }
    if (menu === 'quality') {
      const opts: MenuOption[] = [
        { id: 'auto', label: 'Otomatik', hint: activeQ ? `Şu an ${activeQ.label}` : undefined },
        ...[...qualityOpts].reverse().map((o) => ({ id: o.id, label: o.label })),
      ]
      return (
        <Menu
          title="Kalite"
          options={opts}
          selected={q.lockedId ?? 'auto'}
          onClose={close}
          onSelect={(id) => {
            adapter.selectQuality(id === 'auto' ? null : id)
            close()
          }}
        />
      )
    }
    return (
      <Menu
        title="Kaynak"
        options={sources.map((s) => ({ id: s, label: SOURCE_LABEL[s] }))}
        selected="OWN_CDN"
        onClose={close}
        onSelect={(id) => {
          close()
          if (id !== 'OWN_CDN') onChangeSource(id as Source, adapter.position())
        }}
      />
    )
  })()

  const menuButton = (kind: MenuKind, label: string, icon: ReactElement) => (
    <button
      type="button"
      className="kb-ibtn"
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={menu === kind}
      onClick={() => setMenu((m) => (m === kind ? null : kind))}
    >
      {icon}
    </button>
  )

  return (
    <div
      ref={rootRef}
      className="kb-root"
      data-idle={hidden ? 'true' : 'false'}
      onPointerMove={poke}
      onPointerDown={poke}
      role="region"
      aria-label={`Oynatıcı: ${meta?.title ?? manifest.title}`}
    >
      <div
        ref={stageRef}
        className="kb-stage"
        onClick={() => {
          if (menu) setMenu(null)
          else if (hidden) poke()
          else togglePlay()
        }}
        onDoubleClick={toggleFullscreen}
      />
      <SubtitleOverlayGate adapter={adapter} controller={text} raised={!hidden} />
      {(state === 'buffering' || state === 'loading') && !error ? <div className="kb-spinner" role="status" aria-label="Yükleniyor" /> : null}

      <div className="kb-chrome" data-hidden={hidden ? 'true' : 'false'}>
        <div className="kb-top">
          <button type="button" className="kb-ibtn" aria-label="Geri" onClick={onBack}>
            <IconChevronLeft />
          </button>
          <div className="kb-titles">
            <h1 className="kb-title">{meta?.title ?? manifest.title}</h1>
            {meta?.subtitle ? <p className="kb-sub">{meta.subtitle}</p> : null}
          </div>
          {isLive ? <LiveTag /> : null}
        </div>

        {!error && state !== 'loading' ? (
          <div className="kb-center">
            {seekable ? (
              <button type="button" className="kb-ibtn" aria-label="10 saniye geri" onClick={() => seekBy(-10)}>
                <IconBack10 size={28} />
              </button>
            ) : null}
            <button type="button" className="kb-big" aria-label={playing ? 'Duraklat' : 'Oynat'} onClick={togglePlay}>
              {playing ? <IconPause size={32} /> : <IconPlay size={32} />}
            </button>
            {seekable ? (
              <button type="button" className="kb-ibtn" aria-label="10 saniye ileri" onClick={() => seekBy(10)}>
                <IconFwd10 size={28} />
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="kb-bottom">
          {isLive && airing ? <LiveProgramme airing={airing} /> : null}
          {seekable ? (
            <>
              <Scrubber position={pos} duration={dur} buffered={adapter?.buffered() ?? []} onSeek={(t) => adapter?.seek(t)} />
              <Times position={pos} duration={dur} />
            </>
          ) : null}
          <div className="kb-row" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="kb-ibtn kb-wide-only" aria-label={playing ? 'Duraklat' : 'Oynat'} onClick={togglePlay}>
              {playing ? <IconPause /> : <IconPlay />}
            </button>
            <span className="kb-volume kb-wide-only">
              <button type="button" className="kb-ibtn" aria-label={muted ? 'Sesi aç' : 'Sesi kapat'} aria-pressed={muted} onClick={() => adapter?.setMuted(!muted)}>
                {muted ? <IconMuted /> : <IconVolume />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : (adapter?.volume() ?? 1)}
                aria-label="Ses düzeyi"
                onChange={(e) => {
                  adapter?.setVolume(Number(e.target.value))
                  force()
                }}
              />
            </span>
            {meta?.channel ? <ZapButtons meta={meta} onGoTo={onGoTo} /> : null}
            <span className="kb-spacer" />
            {isLive && airing?.startOver && !fromStart ? (
              <button type="button" className="kb-ibtn" aria-label="Baştan başlat" onClick={() => onFromStart(true)}>
                <IconRestart />
              </button>
            ) : null}
            {isLive && fromStart ? (
              <button type="button" className="kb-btn kb-btn-secondary" style={{ height: 44 }} onClick={() => onFromStart(false)}>
                Canlıya dön
              </button>
            ) : null}
            {next ? (
              <button type="button" className="kb-ibtn" aria-label={`Sonraki bölüm: ${next.title}`} onClick={goNext}>
                <IconNextEpisode />
              </button>
            ) : null}
            {text.tracks.length ? menuButton('subs', 'Altyazı', <IconSubtitles />) : null}
            {audioOpts.length > 1 ? menuButton('audio', 'Ses parçası', <IconAudio />) : null}
            {qualityOpts.length > 1 ? menuButton('quality', 'Kalite', <IconSettings />) : null}
            {showSourceMenu ? menuButton('source', 'Kaynak', <IconSource />) : null}
            <button type="button" className="kb-ibtn" aria-label="Tam ekran" onClick={toggleFullscreen}>
              <IconFullscreen />
            </button>
          </div>
        </div>
      </div>

      {menuEl}

      {resumeChip && !error && !hidden ? (
        <div className="kb-resume">
          <button
            type="button"
            className="kb-btn kb-btn-secondary"
            onClick={() => {
              adapter?.seek(0)
              setResumeChip(false)
            }}
          >
            <IconRestart size={20} />
            Baştan başlat
          </button>
        </div>
      ) : null}

      {showNext && next ? (
        <section className="kb-card" aria-label="Sonraki bölüm">
          <div className="kb-card-head">
            <div className="kb-titles">
              <div className="kb-card-meta">Sonraki bölüm{countdown !== null ? ` · ${countdown} sn` : ''}</div>
              <div className="kb-card-title">
                {next.seasonNumber ? `S${next.seasonNumber} B${next.number} · ` : ''}
                {next.title}
              </div>
            </div>
            <button type="button" className="kb-ibtn" aria-label="Kapat" onClick={() => setNextDismissed(true)}>
              <IconClose size={20} />
            </button>
          </div>
          <div className="kb-actions">
            <button type="button" className="kb-btn kb-btn-primary" onClick={goNext}>
              <IconPlay size={20} />
              Sonraki bölüm
            </button>
          </div>
        </section>
      ) : null}

      {stats && adapter ? <StatsOverlay adapter={adapter} onClose={() => setStats(false)} /> : null}

      {error ? (
        <section className="kb-panel" role="alert">
          <h2>{error.message}</h2>
          <p>{error.code === 'ALL_CDNS_FAILED' ? 'Bağlantı düzelince kaldığın yerden devam eder.' : 'Yeniden denemek çoğu zaman yeterli olur.'}</p>
          <div className="kb-actions">
            {error.retryable ? (
              <button
                type="button"
                className="kb-btn kb-btn-primary"
                onClick={() => {
                  setError(null)
                  adapter?.retry()
                }}
              >
                Tekrar dene
              </button>
            ) : null}
            <button type="button" className="kb-btn kb-btn-secondary" onClick={onBack}>
              Geri dön
            </button>
          </div>
        </section>
      ) : null}
    </div>
  )
}

function SubtitleOverlayGate({ adapter, controller, raised }: { adapter: PlayerAdapter | null; controller: TextTrackController; raised: boolean }): ReactElement | null {
  if (!adapter || !controller.selectedId()) return null
  return <SubtitleOverlay adapter={adapter} controller={controller} raised={raised} />
}

/* ───────────── YouTube gömmesi: arayüz çerçevenin çevresinde ───────────── */

function EmbedView(props: ViewProps & { manifest: EmbedManifest }): ReactElement {
  const { manifest, meta, session, startSec, onBack, onChangeSource, onGoTo, onReload } = props
  const frameRef = useRef<HTMLDivElement>(null)
  const adapterRef = useRef<YouTubeAdapter | null>(null)
  const [error, setError] = useState<PlayerError | null>(null)
  const [menu, setMenu] = useState(false)
  const [, force] = useReducer((x: number) => x + 1, 0)

  useChannelEffects(meta, manifest, onReload)

  useEffect(() => {
    const a = createAdapter(manifest, { startSec, autoplay: true, muted: false }) as YouTubeAdapter
    adapterRef.current = a
    session.attach(a, manifest)
    const off = a.on((e) => {
      if (e.type === 'error') setError(e.error)
      else if (e.type === 'state' && e.state !== 'error') setError(null)
      force()
    })
    if (frameRef.current) void a.mount(frameRef.current)
    return () => {
      off()
      a.destroy()
      adapterRef.current = null
    }
  }, [manifest, session])

  useEffect(() => {
    const id = window.setInterval(force, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (menu) setMenu(false)
        else onBack()
      } else if (e.key === 'PageUp' && meta?.previousChannel) onGoTo(`Channel:${meta.previousChannel.channelId}`)
      else if (e.key === 'PageDown' && meta?.nextChannel) onGoTo(`Channel:${meta.nextChannel.channelId}`)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu, meta, onBack, onGoTo])

  const sources = manifest.alternatives.filter((s): s is Source => s === 'OWN_CDN' || s === 'YOUTUBE')
  const showSourceMenu = sources.includes('OWN_CDN') && sources.includes('YOUTUBE')
  const channelName = meta?.channel?.name ?? adapterRef.current?.author() ?? manifest.attribution?.text ?? null
  const isLive = !!manifest.live || !!manifest.liveChannelId || !!meta?.live
  const airing = meta?.airing ?? null
  const external = adapterRef.current?.externalUrl() ?? (manifest.videoId ? `https://www.youtube.com/watch?v=${manifest.videoId}` : 'https://www.youtube.com/')

  return (
    <div className="kb-embed" role="region" aria-label={`Oynatıcı: ${meta?.title ?? manifest.title}`}>
      <header className="kb-embed-head">
        <button type="button" className="kb-ibtn" aria-label="Geri" onClick={onBack}>
          <IconChevronLeft />
        </button>
        <div className="kb-titles">
          <h1 className="kb-title">{meta?.title ?? manifest.title}</h1>
          {meta?.subtitle ? <p className="kb-sub">{meta.subtitle}</p> : null}
        </div>
        {isLive ? <LiveTag /> : null}
      </header>
      <div className="kb-embed-body">
        {/* YouTube çerçevesi: üstüne hiçbir şey çizilmez */}
        <div ref={frameRef} className="kb-frame" />
      </div>
      <footer className="kb-embed-foot">
        <span className="kb-source-line">YouTube{channelName ? ` · ${channelName}` : ''}</span>
        {isLive && airing ? <LiveProgramme airing={airing} /> : null}
        {meta?.channel ? <ZapButtons meta={meta} onGoTo={onGoTo} /> : null}
        <span className="kb-spacer" />
        {error ? (
          <span className="kb-embed-error" role="alert">
            {error.message}{' '}
            <a className="kb-link" href={error.externalUrl ?? external} target="_blank" rel="noopener noreferrer">
              YouTube'da aç
            </a>
          </span>
        ) : null}
        {error?.retryable ? (
          <button type="button" className="kb-btn kb-btn-secondary" onClick={() => adapterRef.current?.retry()}>
            Tekrar dene
          </button>
        ) : null}
        {showSourceMenu ? (
          <button type="button" className="kb-btn kb-btn-secondary" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            <IconSource size={20} />
            Kaynak: YouTube
          </button>
        ) : null}
      </footer>
      {menu ? (
        <Menu
          title="Kaynak"
          options={sources.map((s) => ({ id: s, label: SOURCE_LABEL[s] }))}
          selected="YOUTUBE"
          onClose={() => setMenu(false)}
          onSelect={(id) => {
            setMenu(false)
            if (id !== 'YOUTUBE') onChangeSource(id as Source, adapterRef.current?.position() ?? 0)
          }}
        />
      ) : null}
    </div>
  )
}

/* ───────────── oynatılamıyor: sakin alt sayfa (tam ekran hata değil) ───────────── */

function NotPlayableSheet({ failure, meta, onBack, onRetry }: { failure: LoadFailure; meta: PlaybackMetadata | null; onBack: () => void; onRetry: (() => void) | null }): ReactElement {
  const art = meta?.video?.storyArt?.url
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => ref.current?.focus(), [])
  return (
    <div className="kb-sheet-wrap">
      {art ? <div className="kb-sheet-art" style={{ backgroundImage: `url("${art}")` }} aria-hidden="true" /> : null}
      <section className="kb-sheet" role="dialog" aria-modal="true" aria-labelledby="kb-sheet-title">
        {failure.kind === 'access' && meta?.title ? <span className="kb-sheet-label">{meta.title}</span> : null}
        <h2 id="kb-sheet-title">{failure.kind === 'access' ? (meta?.access.requiredProductName ? `${meta.access.requiredProductName} paketiyle` : 'Paketinde yok') : failure.title}</h2>
        <p>{failure.text}</p>
        <div className="kb-actions">
          {onRetry ? (
            <button type="button" className="kb-btn kb-btn-primary" onClick={onRetry}>
              Tekrar dene
            </button>
          ) : null}
          <button ref={ref} type="button" className="kb-btn kb-btn-secondary" onClick={onBack}>
            Geri dön
          </button>
        </div>
      </section>
    </div>
  )
}
