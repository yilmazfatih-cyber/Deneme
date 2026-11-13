/**
 * TV oynatıcı kabuğu (UX_SPEC §4): fare arayüzü yok, yalnız kumanda tuşları. Herhangi bir tuşta beliren, 4 sn sonra
 * gizlenen alt şerit (başlık, büyük ilerleme çubuğu, geçen / kalan süre, tuş ipuçları). Tuşlar hem doğrudan
 * (keydown) hem `playerRemote.dispatch({ type: 'KEY' })` ile gelir; mantık `tvKeys.ts` durum makinesindedir.
 * Doğrusal kanal tam ekran: ↑/↓ kanal, OK kanal listesi, rakamlarla numara, bilgi bandı.
 * YouTube gömmesinde çerçevenin üstüne hiçbir şey çizilmez: şerit çerçevenin altındaki ayrılmış alanda,
 * paneller çerçevenin yanındadır.
 */
import { useEffect, useRef, useState, type ReactElement, type ReactNode, type RefObject } from 'react'
import type { RemoteKey } from '../../../../shared/devices'
import { Busy, ErrorPanel, Glyph, NextCard, Stats, Subtitles, TitleLine, useGlyph } from './common'
import type { PlayerModel } from './core'
import { airingProgress, formatClock, formatSpan, remainingLabel } from './format'
import { loadChannels, type ChannelBrief } from './metadata'
import { AudioSubsPanel, ChannelListPanel, EpisodesPanel, flattenEpisodes } from './panels'
import { LiveTag, Scrubber } from './parts'
import {
  remoteKeyFromKeyboard,
  TV_BAND_HIDE_MS,
  TV_DIGITS_MS,
  TV_SEEK_COMMIT_MS,
  tvInitial,
  tvStep,
  type TvAction,
  type TvContext,
  type TvEffect,
  type TvState,
} from './tvKeys'

function Key({ children }: { children: ReactNode }): ReactElement {
  return <kbd className="kb-key">{children}</kbd>
}

export function TvChrome({
  m,
  stageRef,
  frame,
}: {
  m: PlayerModel
  stageRef?: RefObject<HTMLDivElement | null>
  /** YouTube çerçevesi (gömme düzeni) */
  frame?: ReactNode
}): ReactElement {
  const embed = frame !== undefined
  const [tv, setTv] = useState<TvState>(tvInitial)
  const tvRef = useRef<TvState>(tv)
  const [channels, setChannels] = useState<ChannelBrief[] | null>(null)
  const [tuneMsg, setTuneMsg] = useState<string | null>(null)
  const [glyph, showGlyph] = useGlyph()
  const timers = useRef<{ hide: number | null; commit: number | null; digits: number | null; msg: number | null }>({
    hide: null,
    commit: null,
    digits: null,
    msg: null,
  })

  const channel = m.meta?.channel ?? null
  const airing = m.meta?.airing ?? null
  const flatEps = m.seasons ? flattenEpisodes(m.seasons) : []
  const audioCol = m.audio
  const subsCol = m.subs
  const channelMode = m.linearChannel && !!channel

  useEffect(() => {
    if (!m.isLive && !channel) return
    let alive = true
    loadChannels()
      .then((list) => {
        if (alive) setChannels(list)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [m.isLive, channel])

  const ctx: TvContext = {
    position: m.position,
    duration: m.duration,
    seekable: m.seekable && m.state !== 'loading',
    channelMode,
    canZap: !!(m.meta?.previousChannel || m.meta?.nextChannel),
    canStartOver: !!airing?.startOver && !m.props.fromStart,
    panel: (kind) => {
      if (kind === 'audioSubs') {
        if (!audioCol.length && !subsCol.length) return null
        return {
          sizes: [audioCol.length, subsCol.length],
          selected: [
            Math.max(
              0,
              audioCol.findIndex((a) => a.id === m.audioSelected),
            ),
            Math.max(
              0,
              subsCol.findIndex((s) => s.id === m.subsSelected),
            ),
          ],
        }
      }
      if (kind === 'episodes') {
        if (!flatEps.length) return null
        return {
          sizes: [flatEps.length],
          selected: [
            Math.max(
              0,
              flatEps.findIndex((e) => e.unifiedEntityId === m.currentEpisodeId),
            ),
          ],
        }
      }
      if (!channels || !channels.length) return null
      return {
        sizes: [channels.length],
        selected: [
          Math.max(
            0,
            channels.findIndex((c) => c.channelId === channel?.channelId),
          ),
        ],
      }
    },
  }
  const live = useRef({ m, ctx, channels, flatEps })
  live.current = { m, ctx, channels, flatEps }

  const clear = (k: 'hide' | 'commit' | 'digits' | 'msg') => {
    const t = timers.current[k]
    if (t !== null) clearTimeout(t)
    timers.current[k] = null
  }

  const runEffect = (e: TvEffect) => {
    const { m: mm, channels: chs, flatEps: eps } = live.current
    switch (e.type) {
      case 'toggle':
        showGlyph(mm.playing ? 'pause' : 'play')
        mm.act.togglePlay()
        break
      case 'seek':
        mm.act.seek(e.sec)
        break
      case 'exit':
        mm.act.back()
        break
      case 'zap':
        mm.act.zap(e.dir)
        break
      case 'tune':
        void mm.act.tuneNumber(e.number).then((ok) => {
          if (ok) return
          setTuneMsg(`${e.number} numaralı kanal yok`)
          clear('msg')
          timers.current.msg = window.setTimeout(() => setTuneMsg(null), 2500)
        })
        break
      case 'select':
        if (e.kind === 'audioSubs') {
          if (e.column === 0) {
            const a = mm.audio[e.index]
            if (a) mm.act.selectAudio(a.id)
          } else {
            const s = mm.subs[e.index]
            if (s) mm.act.selectSubs(s.id)
          }
        } else if (e.kind === 'episodes') {
          const ep = eps[e.index]
          if (ep) mm.act.playEpisode(ep)
        } else {
          const c = chs?.[e.index]
          if (c) mm.act.tuneChannel(c.channelId)
        }
        break
      case 'startOver':
        mm.act.startOver(true)
        break
      case 'volume':
        mm.act.volumeBy(e.delta)
        break
      case 'mute':
        mm.act.toggleMute()
        break
      case 'subtitles':
        mm.act.toggleSubtitles()
        break
    }
  }

  const send = (a: TvAction): boolean => {
    const prev = tvRef.current
    const step = tvStep(prev, a, live.current.ctx)
    tvRef.current = step.state
    setTv(step.state)
    for (const e of step.effects) runEffect(e)
    if (a.type === 'KEY') {
      clear('hide')
      timers.current.hide = window.setTimeout(function hide() {
        // Duraklatılmışken şerit açık kalır (Netflix TV gibi); oynamaya dönünce gizlenir
        if (!live.current.m.playing) {
          timers.current.hide = window.setTimeout(hide, TV_BAND_HIDE_MS)
          return
        }
        send({ type: 'HIDE_BAND' })
      }, TV_BAND_HIDE_MS)
      if (step.state.seek && step.state.seek !== prev.seek) {
        clear('commit')
        timers.current.commit = window.setTimeout(() => send({ type: 'COMMIT_SEEK' }), TV_SEEK_COMMIT_MS)
      }
      if (step.state.digits && step.state.digits !== prev.digits) {
        clear('digits')
        timers.current.digits = window.setTimeout(() => send({ type: 'DIGITS_TIMEOUT' }), TV_DIGITS_MS)
      }
    }
    if (!step.state.seek) clear('commit')
    if (!step.state.digits) clear('digits')
    return step.handled
  }

  const handleKey = (k: RemoteKey): boolean => {
    const { m: mm } = live.current
    // Hata paneli ve sonraki bölüm kartı odağı alır
    if (mm.error) {
      if (k === 'OK') {
        if (mm.error.retryable) mm.act.retry()
        else mm.act.back()
        return true
      }
      if (k === 'BACK' || k === 'HOME') {
        mm.act.back()
        return true
      }
      return false
    }
    if (mm.showNext && !tvRef.current.panel) {
      if (k === 'OK') {
        mm.act.goNext()
        return true
      }
      if (k === 'BACK') {
        mm.act.dismissNext()
        return true
      }
    }
    return send({ type: 'KEY', key: k })
  }
  const handleRef = useRef(handleKey)
  handleRef.current = handleKey

  // playerRemote KEY ve doğrudan klavye aynı yoldan
  useEffect(() => {
    const keyRef = m.keyRef
    keyRef.current = (k) => handleRef.current(k)
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'i' || e.key === 'I') {
        live.current.m.act.setStats((s) => !s)
        return
      }
      const k = remoteKeyFromKeyboard(e)
      if (!k) return
      // Tam ekran oynatıcı tuşların sahibidir: TV kabuğunun odak motoruna ulaşmasın
      e.preventDefault()
      e.stopPropagation()
      handleRef.current(k)
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      if (keyRef.current) keyRef.current = null
    }
  }, [m.keyRef])

  useEffect(() => {
    // İlk açılışta şerit görünür; 4 sn sonra (oynuyorsa) gizlenir
    const t = timers.current
    t.hide = window.setTimeout(function hide() {
      if (!live.current.m.playing) {
        t.hide = window.setTimeout(hide, TV_BAND_HIDE_MS)
        return
      }
      send({ type: 'HIDE_BAND' })
    }, TV_BAND_HIDE_MS)
    return () => {
      for (const k of ['hide', 'commit', 'digits', 'msg'] as const) {
        const id = t[k]
        if (id !== null) clearTimeout(id)
      }
    }
    // yalnız kurulumda
  }, [])

  /* ───────────── çizim ───────────── */

  const p = tv.panel
  const panelEl = (() => {
    if (!p) return null
    if (p.kind === 'audioSubs')
      return (
        <AudioSubsPanel
          variant="tv"
          audio={audioCol}
          subs={subsCol}
          audioSelected={m.audioSelected}
          subsSelected={m.subsSelected}
          onAudio={() => undefined}
          onSubs={() => undefined}
          focus={{ column: p.column, index: p.index }}
        />
      )
    if (p.kind === 'episodes' && m.seasons)
      return (
        <EpisodesPanel
          variant="tv"
          showTitle={m.title.main}
          seasons={m.seasons}
          currentId={m.currentEpisodeId}
          onPlay={() => undefined}
          focusIndex={p.index[0] ?? 0}
        />
      )
    if (p.kind === 'channels' && channels)
      return (
        <ChannelListPanel channels={channels} currentId={channel?.channelId ?? null} focusIndex={p.index[0] ?? 0} />
      )
    return null
  })()

  const hasAudioSubs = !!ctx.panel('audioSubs')
  const hasEpisodes = flatEps.length > 0
  const hasChannels = !!channels && channels.length > 0
  const shownPos = tv.seek ? tv.seek.target : m.position
  const panelOpen = !!p
  const bandVisible = tv.band && !panelOpen

  const hints: ReactNode[] = []
  if (channelMode) {
    if (ctx.canZap)
      hints.push(
        <span key="z">
          <Key>▲</Key>
          <Key>▼</Key> Kanal değiştir
        </span>,
      )
    if (hasChannels)
      hints.push(
        <span key="l">
          <Key>OK</Key> Kanal listesi
        </span>,
      )
    if (ctx.canStartOver)
      hints.push(
        <span key="s">
          <Key>◀</Key> Baştan Başlat
        </span>,
      )
    hints.push(
      <span key="d">
        <Key>0–9</Key> Kanal numarası
      </span>,
    )
  } else {
    hints.push(
      <span key="ok">
        <Key>OK</Key> {m.playing ? 'Duraklat' : 'Oynat'}
      </span>,
    )
    if (ctx.seekable)
      hints.push(
        <span key="lr">
          <Key>◀</Key>
          <Key>▶</Key> 10 sn
        </span>,
      )
    if (hasAudioSubs)
      hints.push(
        <span key="up">
          <Key>▲</Key> Ses ve Altyazı
        </span>,
      )
    if (hasEpisodes || hasChannels)
      hints.push(
        <span key="dn">
          <Key>▼</Key> {hasEpisodes ? 'Bölümler' : 'Kanallar'}
        </span>,
      )
  }
  hints.push(
    <span key="b">
      <Key>Geri</Key> Çık
    </span>,
  )

  const nextAiring = channel?.next ?? null
  const band = channelMode ? (
    <div className="kb-tvband kb-tvband-ch" data-visible={bandVisible} aria-hidden={!bandVisible}>
      <div className="kb-chinfo">
        <span className="kb-chinfo-num">{channel?.number}</span>
        <span className="kb-chinfo-logo">
          {channel?.logo?.url ? <img src={channel.logo.url} alt="" /> : <span>{channel?.name.slice(0, 2)}</span>}
        </span>
        <div className="kb-chinfo-body">
          <div className="kb-chinfo-name">
            {channel?.name}
            <LiveTag />
          </div>
          {airing ? (
            <>
              <div className="kb-chinfo-prog">{airing.title}</div>
              <div className="kb-chinfo-meta">
                {formatSpan(airing.startAt, airing.endAt)} · {remainingLabel(airing.endAt)}
              </div>
              <div className="kb-chinfo-bar" aria-hidden="true">
                <span style={{ width: `${airingProgress(airing.startAt, airing.endAt) * 100}%` }} />
              </div>
            </>
          ) : (
            <div className="kb-chinfo-prog">Yayın bilgisi yok</div>
          )}
          {nextAiring ? (
            <div className="kb-chinfo-next">
              Sonra: {formatSpan(nextAiring.startAt, nextAiring.endAt).split('–')[0]} {nextAiring.title}
            </div>
          ) : null}
        </div>
      </div>
      <div className="kb-hints">{hints}</div>
    </div>
  ) : (
    <div className="kb-tvband" data-visible={bandVisible} aria-hidden={!bandVisible}>
      <div className="kb-tvband-title">
        <TitleLine m={m} />
        {m.isLive ? <LiveTag /> : null}
      </div>
      {m.seekable && m.duration > 0 ? (
        <div className="kb-tvscrub">
          <span className="kb-tvtime">{formatClock(shownPos)}</span>
          <Scrubber
            position={m.position}
            duration={m.duration}
            buffered={m.buffered}
            previewSec={tv.seek ? tv.seek.target : null}
            disabled
            onSeek={() => undefined}
          />
          <span className="kb-tvtime">{formatClock(Math.max(0, m.duration - shownPos))}</span>
        </div>
      ) : airing ? (
        <div className="kb-chinfo-meta">
          {airing.title} · {formatSpan(airing.startAt, airing.endAt)} · {remainingLabel(airing.endAt)}
        </div>
      ) : null}
      <div className="kb-hints">{hints}</div>
    </div>
  )

  const digits =
    tv.digits || tuneMsg ? (
      <div className="kb-digits" role="status" aria-live="polite">
        {tv.digits ? (
          <>
            <span className="kb-digits-num">{tv.digits.padEnd(Math.max(2, tv.digits.length), '–')}</span>
            <span className="kb-digits-hint">
              {channels?.find((c) => c.number === Number(tv.digits))?.name ?? 'Kanal numarası'}
            </span>
          </>
        ) : (
          <span className="kb-digits-hint">{tuneMsg}</span>
        )}
      </div>
    ) : null

  if (embed) {
    return (
      <div
        className="kb-root"
        data-chrome="tv"
        data-embed="true"
        role="region"
        aria-label={`Oynatıcı: ${m.title.main}`}
      >
        <div className="kb-tv-embed">
          <div className="kb-tv-frame-area" data-panel={p ? p.kind : 'none'}>
            {frame}
          </div>
          {panelEl ? (
            <aside className="kb-tv-aside" data-side={p?.kind === 'channels' ? 'left' : 'right'}>
              {panelEl}
            </aside>
          ) : null}
        </div>
        {/* Şerit için ayrılmış alan: çerçeve küçülür, şerit çerçevenin üstüne binmez */}
        <div className="kb-tv-slot">
          {band}
          {digits}
          {m.error ? <ErrorPanel m={m} tv /> : null}
          <NextCard m={m} tv />
        </div>
      </div>
    )
  }

  return (
    <div
      className="kb-root"
      data-chrome="tv"
      data-band={bandVisible ? 'true' : 'false'}
      role="region"
      aria-label={`Oynatıcı: ${m.title.main}`}
    >
      <div ref={stageRef} className="kb-stage" />
      <Subtitles m={m} raised={bandVisible} />
      <Busy m={m} />
      <Glyph glyph={glyph} />
      {band}
      {panelEl}
      {digits}
      <NextCard m={m} tv />
      <Stats m={m} />
      <ErrorPanel m={m} tv />
    </div>
  )
}
