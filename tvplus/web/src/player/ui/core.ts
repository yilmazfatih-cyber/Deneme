/**
 * Oynatıcının kabuktan bağımsız çekirdeği: bağdaştırıcıyı kurar, oturuma bağlar, `playerRemote`'a kaydeder ve
 * anlık görüntüyü yayınlar; üç kabuğun (masaüstü, mobil, TV) ve gömmenin ortak kullandığı model ve eylemler.
 */
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react'
import type { RemoteKey } from '../../../../shared/devices'
import type { LicensedManifest } from '../../../../shared/playback'
import { isCastAvailable, requestCast, subscribeCastAvailable } from '../../devices/bridge'
import { devbus } from '../../lib/devbus'
import { createAdapter, sourceKindOf } from '../adapters'
import type { AudioOption, PlaybackState, PlayerAdapter, PlayerError } from '../adapters/types'
import { prefetchManifest, requestManifest } from '../net/manifest'
import { attachPlayer, makeSnapshot, publishSnapshot, type PlayerChrome } from '../remote'
import { TextTrackController } from '../text/textTracks'
import {
  basicKeyCommand,
  clampPosition,
  isPlayingState,
  nextSubtitleChoice,
  runCommand,
  type CommandTarget,
} from './commands'
import {
  loadChannels,
  saveLastChannel,
  type ChannelBrief,
  type EpisodeBrief,
  type PlaybackMetadata,
  type SeasonBrief,
} from './metadata'
import type { Source } from './options'
import { readAdapter } from './readout'
import { episodeCode, type Choice } from './panels'
import type { PlaybackSession } from './session'

/** Gömme bu süre içinde hazır olmazsa hata gösterilir */
const EMBED_LOAD_TIMEOUT_MS = 15_000

export const SOURCE_LABEL: Record<Source, string> = { OWN_CDN: "Kendi CDN'imiz", YOUTUBE: 'YouTube' }

export interface CoreProps {
  manifest: LicensedManifest
  meta: PlaybackMetadata | null
  session: PlaybackSession
  startSec: number
  resumed: boolean
  chrome: PlayerChrome
  fromStart: boolean
  tctx: string | null
  /** Oynatılan adres (Channel:1 gibi; manifest başka bir yayının kaydı olabilir) */
  viewableId: string
  onBack: () => void
  onChangeSource: (src: Source, positionSec: number) => void
  onGoTo: (viewableId: string, extra?: Record<string, string>) => void
  onReload: () => void
  onFromStart: (on: boolean) => void
}

export interface TitleParts {
  /** Film adı / dizi adı / kanal adı */
  main: string
  /** "S1:B3" */
  code: string | null
  /** Bölüm adı / yayındaki program */
  sub: string | null
}

export interface PlayerModel {
  props: CoreProps
  chrome: PlayerChrome
  manifest: LicensedManifest
  meta: PlaybackMetadata | null
  adapter: PlayerAdapter | null
  embed: boolean
  text: TextTrackController | null
  state: PlaybackState
  error: PlayerError | null
  position: number
  duration: number
  buffered: { start: number; end: number }[]
  playing: boolean
  muted: boolean
  /** 0–1 */
  volume: number
  speed: number
  isLive: boolean
  seekable: boolean
  /** Doğrusal kanal tam ekran (baştan başlatılmamış Channel:*) */
  linearChannel: boolean
  title: TitleParts
  next: PlaybackMetadata['nextEpisode']
  seasons: SeasonBrief[] | null
  currentEpisodeId: string | null
  audio: Choice[]
  audioSelected: string | null
  subs: Choice[]
  subsSelected: string
  sources: Source[]
  currentSource: Source
  castAvailable: boolean
  pipAvailable: boolean
  /** Sonraki bölüm kartı ve geri sayımı */
  showNext: boolean
  countdown: number | null
  resumeChip: boolean
  stats: boolean
  /** TV kabuğu kumanda tuşlarını buradan alır (playerRemote KEY) */
  keyRef: RefObject<((k: RemoteKey) => boolean) | null>
  act: PlayerActions
}

export interface PlayerActions {
  togglePlay(): void
  play(): void
  pause(): void
  seek(sec: number): void
  seekBy(d: number): void
  setVolume(v: number): void
  volumeBy(delta100: number): void
  toggleMute(): void
  setSpeed(s: number): void
  selectAudio(id: string): void
  selectSubs(id: string): void
  toggleSubtitles(): boolean
  goNext(): boolean
  dismissNext(): void
  playEpisode(ep: EpisodeBrief): void
  zap(dir: 1 | -1): boolean
  tuneChannel(channelId: number): void
  /** Numaraya göre kanala geç; numara yoksa false */
  tuneNumber(n: number): Promise<boolean>
  startOver(on: boolean): void
  changeSource(src: Source): void
  cast(): void
  pip(): void
  restartFromBeginning(): void
  setStats(on: boolean | ((v: boolean) => boolean)): void
  back(): void
  /** Yer imini kaydet ve çık */
  stop(): void
  retry(): void
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
      devbus.emit('player', 'program bitti: manifest yenileniyor', {
        viewableId: manifest.viewableId,
        state: 'loading',
        endAt,
      })
      onReload()
    }, ms)
    return () => clearTimeout(t)
  }, [endAt, manifest.viewableId, onReload])
}

export function titleParts(meta: PlaybackMetadata | null, manifest: LicensedManifest): TitleParts {
  const v = meta?.video
  if (v?.parentShow) {
    return { main: v.parentShow.title, code: episodeCode(v.seasonNumber, v.number), sub: v.title }
  }
  if (meta?.channel) {
    return { main: meta.channel.name, code: null, sub: meta.airing?.title ?? null }
  }
  return { main: meta?.title ?? manifest.title, code: null, sub: meta?.subtitle ?? null }
}

/** Bağdaştırıcıyı `mountRef`'e kurar; arayüz 250 ms'de (gömmede 500 ms) bir yenilenir. */
export function usePlayerCore(props: CoreProps, mountRef: RefObject<HTMLDivElement | null>): PlayerModel {
  const { manifest, meta, session, startSec, chrome, onReload } = props
  const embed = manifest.kind === 'EXTERNAL_EMBED'
  const adapterRef = useRef<PlayerAdapter | null>(null)
  const [adapter, setAdapter] = useState<PlayerAdapter | null>(null)
  const [, force] = useReducer((x: number) => x + 1, 0)
  const [error, setError] = useState<PlayerError | null>(null)
  const [speed, setSpeedState] = useState(1)
  const speedRef = useRef(1)
  const [stats, setStats] = useState(false)
  const [resumeChip, setResumeChip] = useState(props.resumed)
  const [nextDismissed, setNextDismissed] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const keyRef = useRef<((k: RemoteKey) => boolean) | null>(null)
  const loadSinceRef = useRef(0)
  const errorRef = useRef<PlayerError | null>(null)
  const propsRef = useRef(props)
  propsRef.current = props
  const text = useMemo(
    () => (manifest.kind === 'EXTERNAL_EMBED' ? null : new TextTrackController(manifest.timedTextTracks)),
    [manifest],
  )
  const lastSubRef = useRef<string | null>(null)
  const castAvailable = useSyncExternalStore(subscribeCastAvailable, isCastAvailable)

  useChannelEffects(meta, manifest, onReload)

  useEffect(() => {
    const a = createAdapter(manifest, {
      startSec,
      autoplay: true,
      muted: false,
      refreshManifest: embed
        ? undefined
        : () =>
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
      // Motor oynatma hızını sıfırlarsa (kaynak / akış değişimi) seçili hızı geri yükle
      if (a.media && a.media.playbackRate !== speedRef.current) a.media.playbackRate = speedRef.current
      force()
    })
    setAdapter(a)
    if (mountRef.current) void a.mount(mountRef.current)
    // Gömme bekçisi: YouTube çerçevesi hiç hazır olmazsa (engellenmiş ağ, bozuk gömme) sonsuza dek "yükleniyor"da
    // kalınmaz; sakin bir hata gösterilir ki izleyici Tekrar dene / Geri ile çıkabilsin.
    loadSinceRef.current = performance.now()
    const watchdog = embed
      ? window.setInterval(() => {
          if (errorRef.current || a.state() !== 'loading') return
          if (performance.now() - loadSinceRef.current < EMBED_LOAD_TIMEOUT_MS) return
          devbus.emit(
            'embed',
            'YouTube: yanıt yok',
            {
              videoId: (manifest as { videoId?: string | null }).videoId ?? null,
              state: 'UNSTARTED',
              error: 'TIMEOUT',
            },
            { ok: false },
          )
          setError({ code: 'EMBED_TIMEOUT', message: 'YouTube oynatıcısı açılamadı.', retryable: true })
        }, 1000)
      : null
    return () => {
      if (watchdog !== null) clearInterval(watchdog)
      off()
      a.destroy()
      adapterRef.current = null
    }
    // startSec yalnızca bağdaştırıcı kurulurken okunur
  }, [manifest, session])

  // Kabuk değişince (masaüstü ↔ mobil, pencere boyutu) sahne öğesi yeniden kurulur: <video> yeni sahneye taşınır.
  // Yerleşim efekti aynı görevde çalışır; öğe belgeden çıkıp duraklamaya fırsat bulmaz.
  useLayoutEffect(() => {
    const media = adapterRef.current?.media
    const host = mountRef.current
    if (media && host && media.parentElement !== host) host.append(media)
  })

  useEffect(() => {
    const id = window.setInterval(force, embed ? 500 : 250)
    return () => clearInterval(id)
  }, [embed])

  useEffect(() => {
    if (!text) return
    return text.subscribe(force)
  }, [text])

  useEffect(() => {
    const on = () => force()
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])

  useEffect(() => {
    if (!resumeChip) return
    const t = window.setTimeout(() => setResumeChip(false), 12_000)
    return () => clearTimeout(t)
  }, [resumeChip])

  errorRef.current = error

  /* ───── türetilmiş değerler ───── */
  // Okumalar fırlatmaz (YouTube oynatıcısı hazır olmadan yöntemsizdir): bkz. readout.ts
  const rd = readAdapter(adapter, startSec, manifest.durationMs ? manifest.durationMs / 1000 : 0)
  const state: PlaybackState = rd.state
  const position = rd.position
  const duration = rd.duration
  const isLive = !!manifest.live || (embed && (!!manifest.liveChannelId || !!meta?.live))
  const seekable = embed ? !manifest.liveChannelId : !manifest.live || manifest.live.seekable !== false
  const linearChannel = props.viewableId.startsWith('Channel:') && !props.fromStart
  const next = meta?.nextEpisode ?? null
  const credits = meta?.creditsOffsetSec ?? null
  const showNext = !!next && !nextDismissed && ((credits !== null && position >= credits) || state === 'ended')
  const seasons = meta?.video?.parentShow?.seasons ?? null
  const currentEpisodeId = meta?.video?.parentShow ? meta.video.unifiedEntityId : null
  const audioOpts: AudioOption[] = rd.audio
  const audio: Choice[] = audioOpts.map((o) => ({ id: o.id, label: o.label }))
  const subs: Choice[] = text
    ? [
        { id: 'off', label: 'Kapalı' },
        ...text.tracks.map((t) => ({
          id: t.trackId,
          label: t.languageDescription,
          hint: t.type === 'CC' ? 'İşitme engelliler için' : undefined,
        })),
      ]
    : []
  const subsSelected = text?.selectedId() ?? 'off'
  const sources = manifest.alternatives.filter((s): s is Source => s === 'OWN_CDN' || s === 'YOUTUBE')
  const currentSource: Source = embed ? 'YOUTUBE' : 'OWN_CDN'
  const pipAvailable =
    !embed &&
    typeof document !== 'undefined' &&
    !!document.pictureInPictureEnabled &&
    !!adapter?.media &&
    !adapter.media.disablePictureInPicture
  const title = titleParts(meta, manifest)
  const playing = isPlayingState(state)

  /* ───── sonraki bölüm geri sayımı (yalnız oynarken ya da bitince ilerler) ───── */
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

  /* ───── eylemler (kararlı; güncel değerleri ref'ten okur) ───── */
  const targetRef = useRef<CommandTarget | null>(null)
  const currentEpisodeIdRef = useRef<string | null>(null)
  currentEpisodeIdRef.current = currentEpisodeId
  const act = useMemo<PlayerActions>(() => {
    const a = () => adapterRef.current
    const p = () => propsRef.current
    const goTo = (id: string, extra?: Record<string, string>) => p().onGoTo(id, extra)
    const actions: PlayerActions = {
      togglePlay() {
        const x = a()
        if (!x) return
        const st = x.state()
        if (isPlayingState(st)) x.pause()
        else {
          if (st === 'ended') x.seek(0)
          void x.play()
        }
        force()
      },
      play() {
        void a()?.play()
      },
      pause() {
        a()?.pause()
      },
      seek(sec) {
        const x = a()
        if (!x) return
        x.seek(clampPosition(sec, x.duration()))
        force()
      },
      seekBy(d) {
        const x = a()
        if (!x) return
        x.seek(clampPosition(x.position() + d, x.duration()))
        force()
      },
      setVolume(v) {
        const x = a()
        if (!x) return
        x.setVolume(Math.max(0, Math.min(1, v)))
        if (v > 0 && x.muted()) x.setMuted(false)
        force()
      },
      volumeBy(delta) {
        const x = a()
        if (!x) return
        runCommand(target, { type: 'VOLUME_BY', delta })
        force()
      },
      toggleMute() {
        const x = a()
        if (!x) return
        x.setMuted(!x.muted())
        force()
      },
      setSpeed(s) {
        speedRef.current = s
        setSpeedState(s)
        const m = a()?.media
        if (m) m.playbackRate = s
        devbus.emit('player', `hız: ${s}x`, {
          viewableId: p().manifest.viewableId,
          state: a()?.state() ?? null,
          positionSec: Math.round(a()?.position() ?? 0),
          playbackRate: s,
        })
      },
      selectAudio(id) {
        a()?.selectAudio(id)
        force()
      },
      selectSubs(id) {
        if (!text) return
        const sel = id === 'off' ? null : id
        if (sel) lastSubRef.current = sel
        text.select(sel)
      },
      toggleSubtitles() {
        if (!text || !text.tracks.length) return false
        const cur = text.selectedId()
        if (cur) lastSubRef.current = cur
        text.select(nextSubtitleChoice(text.tracks, cur, lastSubRef.current))
        return true
      },
      goNext() {
        const n = p().meta?.nextEpisode
        if (n) {
          goTo(n.unifiedEntityId)
          return true
        }
        if (p().meta?.channel) return actions.zap(1)
        return false
      },
      dismissNext() {
        setNextDismissed(true)
      },
      playEpisode(ep) {
        if (ep.unifiedEntityId === currentEpisodeIdRef.current) return
        goTo(ep.unifiedEntityId)
      },
      zap(dir) {
        const m = p().meta
        const ch = dir === 1 ? m?.nextChannel : m?.previousChannel
        if (!ch) return false
        goTo(`Channel:${ch.channelId}`)
        return true
      },
      tuneChannel(channelId) {
        if (p().meta?.channel?.channelId === channelId && !p().fromStart) return
        goTo(`Channel:${channelId}`)
      },
      async tuneNumber(n) {
        let list: ChannelBrief[] = []
        try {
          list = await loadChannels()
        } catch {
          return false
        }
        const ch = list.find((c) => c.number === n)
        if (!ch) return false
        actions.tuneChannel(ch.channelId)
        return true
      },
      startOver(on) {
        p().onFromStart(on)
      },
      changeSource(src) {
        if (src === (p().manifest.kind === 'EXTERNAL_EMBED' ? 'YOUTUBE' : 'OWN_CDN')) return
        p().onChangeSource(src, a()?.position() ?? 0)
      },
      cast() {
        const x = a()
        const pr = p()
        const live = !!pr.manifest.live
        requestCast({
          viewableId: pr.viewableId,
          positionSec: live || !x ? undefined : Math.floor(x.position()),
          startOver: pr.fromStart || undefined,
          tctx: pr.tctx ?? undefined,
          title: titleParts(pr.meta, pr.manifest).main,
        })
      },
      pip() {
        const m = a()?.media
        if (!m) return
        if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => undefined)
        else void m.requestPictureInPicture().catch(() => undefined)
      },
      restartFromBeginning() {
        a()?.seek(0)
        setResumeChip(false)
      },
      setStats(on) {
        setStats(on)
      },
      back() {
        p().onBack()
      },
      stop() {
        p().session.saveBookmark('durdur')
        p().onBack()
      },
      retry() {
        loadSinceRef.current = performance.now()
        setError(null)
        a()?.retry()
      },
    }
    const target: CommandTarget = {
      state: () => a()?.state() ?? 'loading',
      position: () => a()?.position() ?? 0,
      duration: () => a()?.duration() ?? 0,
      volume: () => a()?.volume() ?? 1,
      muted: () => a()?.muted() ?? false,
      play: () => void a()?.play(),
      pause: () => a()?.pause(),
      seek: (s) => a()?.seek(s),
      setVolume: (v) => a()?.setVolume(v),
      setMuted: (m) => a()?.setMuted(m),
      seekable: () => {
        const m = p().manifest
        return m.kind === 'EXTERNAL_EMBED' ? !m.liveChannelId : !m.live || m.live.seekable !== false
      },
      stop: () => actions.stop(),
      next: () => actions.goNext(),
      toggleSubtitles: () => actions.toggleSubtitles(),
      key: (k) => {
        const h = keyRef.current
        if (h) return h(k)
        const cmd = basicKeyCommand(k, !!p().meta?.channel)
        return cmd ? runCommand(target, cmd) : false
      },
    }
    targetRef.current = target
    return actions
    // Eylemler ref'ler üzerinden çalışır; metin denetleyicisi manifestle değişir
  }, [text])
  useEffect(() => {
    if (countdown === 0) act.goNext()
  }, [countdown, act])

  /* ───── playerRemote: kayıt ve anlık görüntü ───── */
  useEffect(() => {
    if (!adapter) return
    return attachPlayer({
      dispatch: (cmd) => {
        const t = targetRef.current
        if (!t || !adapterRef.current) return false
        const ok = runCommand(t, cmd)
        force()
        return ok
      },
    })
  }, [adapter])

  const artUrl = meta?.video?.storyArt?.url ?? meta?.channel?.logo?.url ?? null
  const volume = rd.volume
  const muted = rd.muted
  useEffect(() => {
    if (!adapter) return
    publishSnapshot(
      makeSnapshot({
        viewableId: props.viewableId,
        title: title.main,
        subtitle: title.sub ? (title.code ? `${title.code} · ${title.sub}` : title.sub) : null,
        artUrl,
        live: isLive,
        positionSec: position,
        durationSec: isLive && !seekable ? null : duration,
        state: error ? 'error' : state,
        volume,
        muted,
        sourceKind: sourceKindOf(manifest),
        chrome,
      }),
    )
  })

  return {
    props,
    chrome,
    manifest,
    meta,
    adapter,
    embed,
    text,
    state,
    error,
    position,
    duration,
    buffered: rd.buffered,
    playing,
    muted,
    volume,
    speed,
    isLive,
    seekable,
    linearChannel,
    title,
    next,
    seasons,
    currentEpisodeId,
    audio,
    audioSelected: rd.currentAudio,
    subs,
    subsSelected,
    sources,
    currentSource,
    castAvailable,
    pipAvailable,
    showNext,
    countdown,
    resumeChip: resumeChip && !error,
    stats,
    keyRef,
    act,
  }
}
