/**
 * Tam ekran oynatma sayfası: #/izle/:viewableId  (?tctx=…&baslat=bastan&kaynak=OWN_CDN|YOUTUBE&konum=<sn>)
 * PlaybackMetadata (GraphQL) ile lisanslı manifest (MSL) paralel yüklenir. Oynatılamıyorsa sakin bir alt sayfa.
 * Kabuk: masaüstü / mobil / TV (`chrome`; 'auto' → ekran biçimi). Gömmede (YouTube) arayüz çerçevenin çevresinde.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { EmbedManifest, LicensedManifest } from '../../../../shared/playback'
import { devbus } from '../../lib/devbus'
import { useFormFactor } from '../../lib/formFactor'
import { ManifestRequestError, requestManifest } from '../net/manifest'
import { startNetworkProbing } from '../net/ftl'
import { makeSnapshot, publishSnapshot, type PlayerChrome } from '../remote'
import { NextCard } from './common'
import { SOURCE_LABEL, usePlayerCore, type CoreProps, type PlayerModel } from './core'
import { DesktopChrome, ZapButtons } from './DesktopChrome'
import { IconArrowLeft, IconCast, IconEpisodes, IconNextEpisode, IconSource } from './icons'
import { loadPlaybackMetadata, type PlaybackMetadata } from './metadata'
import { MobileChrome } from './MobileChrome'
import { parseWatchOptions, startPosition, type Source } from './options'
import { EpisodesPanel, SourcePanel } from './panels'
import { LiveProgramme, LiveTag } from './parts'
import { PlaybackSession } from './session'
import { TvChrome } from './TvChrome'
import './player.css'

export type WatchChrome = 'auto' | 'desktop' | 'mobile' | 'tv'
export interface WatchPageProps {
  /** 'auto' (varsayılan) → ekran biçimi (detectFormFactor) */
  chrome?: WatchChrome
  /** Çıkışta gidilecek yol (verilmezse tarayıcı geçmişinde geri) */
  exitTo?: string
}

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

function failureFromError(err: unknown): LoadFailure {
  if (err instanceof ManifestRequestError) {
    switch (err.code) {
      case 'ACCESS_DENIED':
        return {
          kind: 'access',
          title: 'Bu içerik paketinde yok',
          text: err.access?.reasonText ?? 'Bu içeriği izleme yetkin yok.',
          retryable: false,
        }
      case 'NOT_FOUND':
        return {
          kind: 'error',
          title: 'İçerik bulunamadı',
          text: 'Bu içerik artık yayında olmayabilir.',
          retryable: false,
        }
      case 'NO_COMPATIBLE_SOURCE':
        return {
          kind: 'error',
          title: 'Bu cihazda oynatılamıyor',
          text: 'Tarayıcın bu yayının biçimini desteklemiyor.',
          retryable: false,
        }
      case 'SOURCE_UNAVAILABLE':
        return { kind: 'error', title: 'Yayın şu an hazır değil', text: 'Biraz sonra yeniden dene.', retryable: true }
      default:
        return {
          kind: 'error',
          title: 'Oynatma başlatılamadı',
          text: 'Bağlantını kontrol edip yeniden dene.',
          retryable: true,
        }
    }
  }
  return {
    kind: 'error',
    title: 'Oynatma başlatılamadı',
    text: 'Bağlantını kontrol edip yeniden dene.',
    retryable: true,
  }
}

export default function WatchPageImpl(props: WatchPageProps): ReactElement {
  const params = useParams()
  const viewableId = decodeURIComponent(params.viewableId ?? '')
  const [sp, setSp] = useSearchParams()
  const navigate = useNavigate()
  const formFactor = useFormFactor()
  const chrome: PlayerChrome = props.chrome && props.chrome !== 'auto' ? props.chrome : formFactor
  const { tctx, fromStart, kaynak, konumSec } = parseWatchOptions(sp)
  const exitTo = props.exitTo
  const [meta, setMeta] = useState<PlaybackMetadata | null | undefined>(undefined)
  const [manifest, setManifest] = useState<LicensedManifest | null>(null)
  const [failure, setFailure] = useState<LoadFailure | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [session, setSession] = useState<PlaybackSession | null>(null)
  const [start, setStart] = useState<{ sec: number; resumed: boolean }>({ sec: 0, resumed: false })
  const konumRef = useRef(konumSec)
  konumRef.current = konumSec

  const goBack = useCallback(() => {
    if (exitTo) navigate(exitTo)
    else if (window.history.length > 1) navigate(-1)
    else navigate('/')
  }, [navigate, exitTo])

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
      s.intent({
        fromStart,
        kaynak,
        reload: reloadKey,
        ...(konumRef.current !== null ? { konum: konumRef.current } : {}),
      })
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
        if (m?.airing?.startOver)
          return requestManifest(m.airing.unifiedEntityId, { startOver: true, fresh: reloadKey > 0 })
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
        setFailure({
          kind: 'access',
          title: m.title,
          text: m.access.reasonText ?? 'Bu içerik paketinde yok.',
          retryable: false,
        })
        return
      }
      if (nr.status === 'rejected') {
        setFailure(failureFromError(nr.reason))
        return
      }
      const man = nr.value
      if (hint) resumeHint = null
      s.setLive(!!man.live)
      setStart(
        startPosition({
          manifest: man,
          metaBookmarkSec: m?.bookmark ? m.bookmark.positionSec : null,
          runtimeSec: m?.video?.runtimeSec ?? null,
          fromStart,
          hintSec: hint?.positionSec ?? null,
          konumSec: konumRef.current,
          linearChannel: isChannel && !fromStart,
        }),
      )
      setManifest(man)
    })
    return () => {
      ctrl.abort()
      s.dispose('exit')
    }
  }, [viewableId, fromStart, kaynak, reloadKey, tctx])

  // Yüklenirken de dışarıya "yükleniyor" durumu görünsün (oynatıcı takılınca kendi görüntüsünü yayınlar)
  const loadingTitle = meta?.title ?? ''
  const waiting = !manifest || !session
  useEffect(() => {
    if (!waiting || failure) return
    publishSnapshot(
      makeSnapshot({
        viewableId,
        title: loadingTitle,
        subtitle: null,
        artUrl: null,
        live: viewableId.startsWith('Channel:') || viewableId.startsWith('Airing:'),
        positionSec: konumRef.current ?? 0,
        durationSec: null,
        state: 'loading',
        volume: 1,
        muted: false,
        sourceKind: null,
        chrome,
      }),
    )
  }, [waiting, failure, viewableId, loadingTitle, chrome])
  useEffect(() => () => publishSnapshot(null), [])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  const changeSource = useCallback(
    (src: Source, positionSec: number) => {
      resumeHint = { viewableId, positionSec }
      const next = new URLSearchParams(sp)
      next.set('kaynak', src)
      next.delete('baslat')
      next.delete('konum')
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
      next.delete('konum')
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
        tv={chrome === 'tv'}
      />
    )
  }
  if (!manifest || !session) {
    return (
      <div className="kb-root" data-chrome={chrome} aria-busy="true">
        <div className="kb-chrome">
          <div className="kb-top">
            {chrome === 'tv' ? null : (
              <button type="button" className="kb-cbtn" aria-label="Geri" onClick={goBack}>
                <IconArrowLeft size={chrome === 'desktop' ? 36 : 28} />
              </button>
            )}
            <div className="kb-titles">
              <p className="kb-title">{meta?.title ?? ''}</p>
              {meta?.subtitle ? <p className="kb-sub">{meta.subtitle}</p> : null}
            </div>
          </div>
        </div>
        <div className="kb-spinner" role="status" aria-label="Yükleniyor" />
        {chrome === 'tv' ? <LoadingBackKey onBack={goBack} /> : null}
      </div>
    )
  }

  const common: CoreProps = {
    manifest,
    meta: meta ?? null,
    session,
    startSec: start.sec,
    resumed: start.resumed,
    chrome,
    fromStart,
    tctx,
    viewableId,
    onBack: goBack,
    onChangeSource: changeSource,
    onGoTo: goTo,
    onReload: reload,
    onFromStart: setFromStart,
  }
  if (manifest.kind === 'EXTERNAL_EMBED') return <EmbedView key={manifest.manifestId} {...common} />
  return <VideoView key={manifest.manifestId} {...common} />
}

/** TV'de yüklenirken Geri tuşu çıkar. */
function LoadingBackKey({ onBack }: { onBack: () => void }): null {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 461 || e.keyCode === 10009) {
        e.preventDefault()
        onBack()
      }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [onBack])
  return null
}

/* ───────────── kendi akışlarımız (STREAMS / PROGRESSIVE) ───────────── */

function VideoView(props: CoreProps): ReactElement {
  const stageRef = useRef<HTMLDivElement>(null)
  const m = usePlayerCore(props, stageRef)
  if (props.chrome === 'tv') return <TvChrome m={m} stageRef={stageRef} />
  if (props.chrome === 'mobile') return <MobileChrome m={m} stageRef={stageRef} />
  return <DesktopChrome m={m} stageRef={stageRef} />
}

/* ───────────── YouTube gömmesi: arayüz çerçevenin çevresinde ───────────── */

type EmbedPanel = 'episodes' | 'source'

function EmbedView(props: CoreProps): ReactElement {
  const frameRef = useRef<HTMLDivElement>(null)
  const m = usePlayerCore(props, frameRef)
  const frame = useMemo(
    () => (
      <div ref={frameRef} className="kb-frame">
        {/* YouTube çerçevesi: üstüne hiçbir şey çizilmez */}
      </div>
    ),
    [],
  )
  if (props.chrome === 'tv') return <TvChrome m={m} frame={frame} />
  return <EmbedPointer m={m} frame={frame} />
}

function EmbedPointer({ m, frame }: { m: PlayerModel; frame: ReactElement }): ReactElement {
  const [panel, setPanel] = useState<EmbedPanel | null>(null)
  const manifest = m.manifest as EmbedManifest
  const meta = m.meta
  const ref = useRef({ panel, m })
  ref.current = { panel, m }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { panel: pn, m: mm } = ref.current
      if (e.key === 'Escape') {
        if (pn) setPanel(null)
        else mm.act.back()
      } else if (e.key === 'PageUp') mm.act.zap(-1)
      else if (e.key === 'PageDown') mm.act.zap(1)
      else if (e.key === 'i' || e.key === 'I') mm.act.setStats((s) => !s)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const showSourceMenu = m.sources.includes('OWN_CDN') && m.sources.includes('YOUTUBE')
  const yt = m.adapter as (PlayerModel['adapter'] & { author?: () => string | null; externalUrl?: () => string }) | null
  const channelName = meta?.channel?.name ?? yt?.author?.() ?? manifest.attribution?.text ?? null
  const airing = meta?.airing ?? null
  const external =
    yt?.externalUrl?.() ??
    (manifest.videoId ? `https://www.youtube.com/watch?v=${manifest.videoId}` : 'https://www.youtube.com/')
  const error = m.error
  const toggle = (p: EmbedPanel) => setPanel((cur) => (cur === p ? null : p))

  return (
    <div className="kb-embed" data-chrome={m.chrome} role="region" aria-label={`Oynatıcı: ${m.title.main}`}>
      <header className="kb-embed-head">
        <button type="button" className="kb-cbtn" aria-label="Geri" onClick={() => m.act.back()}>
          <IconArrowLeft size={m.chrome === 'desktop' ? 32 : 28} />
        </button>
        <div className="kb-titles">
          <h1 className="kb-title">
            {m.title.main}
            {m.title.code ? <span className="kb-tl-code">{m.title.code}</span> : null}
          </h1>
          {m.title.sub ? <p className="kb-sub">{m.title.sub}</p> : null}
        </div>
        {m.isLive ? <LiveTag /> : null}
        {m.castAvailable ? (
          <button type="button" className="kb-cbtn" aria-label="TV'de İzle" onClick={() => m.act.cast()}>
            <IconCast size={28} />
          </button>
        ) : null}
      </header>
      <div className="kb-embed-body" data-panel={panel ?? 'none'}>
        {frame}
        {panel === 'episodes' && m.seasons ? (
          <aside className="kb-embed-aside">
            <EpisodesPanel
              variant="sheet"
              showTitle={m.title.main}
              seasons={m.seasons}
              currentId={m.currentEpisodeId}
              onPlay={(ep) => {
                setPanel(null)
                m.act.playEpisode(ep)
              }}
              onClose={() => setPanel(null)}
            />
          </aside>
        ) : null}
        {panel === 'source' ? (
          <aside className="kb-embed-aside">
            <SourcePanel
              variant="sheet"
              choices={m.sources.map((s) => ({ id: s, label: SOURCE_LABEL[s] }))}
              selected="YOUTUBE"
              onSelect={(id) => {
                setPanel(null)
                if (id !== 'YOUTUBE') m.act.changeSource('OWN_CDN')
              }}
              onClose={() => setPanel(null)}
            />
          </aside>
        ) : null}
      </div>
      <footer className="kb-embed-foot">
        <span className="kb-source-line">YouTube{channelName ? ` · ${channelName}` : ''}</span>
        {m.isLive && airing ? <LiveProgramme airing={airing} /> : null}
        {meta?.channel ? <ZapButtons m={m} /> : null}
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
          <button type="button" className="kb-btn kb-btn-secondary" onClick={() => m.act.retry()}>
            Tekrar dene
          </button>
        ) : null}
        {m.next ? (
          <button type="button" className="kb-btn kb-btn-secondary" onClick={() => m.act.goNext()}>
            <IconNextEpisode size={20} />
            Sonraki Bölüm
          </button>
        ) : null}
        {m.seasons && m.seasons.length ? (
          <button
            type="button"
            className="kb-btn kb-btn-secondary"
            aria-expanded={panel === 'episodes'}
            onClick={() => toggle('episodes')}
          >
            <IconEpisodes size={20} />
            Bölümler
          </button>
        ) : null}
        {showSourceMenu ? (
          <button
            type="button"
            className="kb-btn kb-btn-secondary"
            aria-haspopup="dialog"
            aria-expanded={panel === 'source'}
            onClick={() => toggle('source')}
          >
            <IconSource size={20} />
            Kaynak: YouTube
          </button>
        ) : null}
        <NextCard m={m} />
      </footer>
    </div>
  )
}

/* ───────────── oynatılamıyor: sakin alt sayfa (tam ekran hata değil) ───────────── */

function NotPlayableSheet({
  failure,
  meta,
  onBack,
  onRetry,
  tv,
}: {
  failure: LoadFailure
  meta: PlaybackMetadata | null
  onBack: () => void
  onRetry: (() => void) | null
  tv: boolean
}): ReactElement {
  const art = meta?.video?.storyArt?.url
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => ref.current?.focus(), [])
  useEffect(() => {
    if (!tv) return
    // TV: Geri tuşu çıkar (Enter odaktaki düğmeye gider)
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 461 || e.keyCode === 10009) {
        e.preventDefault()
        onBack()
      }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [tv, onBack])
  return (
    <div className="kb-sheet-wrap" data-chrome={tv ? 'tv' : undefined}>
      {art ? <div className="kb-sheet-art" style={{ backgroundImage: `url("${art}")` }} aria-hidden="true" /> : null}
      <section className="kb-sheet" role="dialog" aria-modal="true" aria-labelledby="kb-sheet-title">
        {failure.kind === 'access' && meta?.title ? <span className="kb-sheet-label">{meta.title}</span> : null}
        <h2 id="kb-sheet-title">
          {failure.kind === 'access'
            ? meta?.access.requiredProductName
              ? `${meta.access.requiredProductName} paketiyle`
              : 'Paketinde yok'
            : failure.title}
        </h2>
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
