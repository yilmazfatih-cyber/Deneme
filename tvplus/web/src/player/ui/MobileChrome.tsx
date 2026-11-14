/**
 * Mobil oynatıcı kabuğu (UX_SPEC §3, Netflix telefon düzeni): üst çubuk (geri · başlık · TV'de izle); ortada büyük
 * −10 / oynat-duraklat / +10; altta ilerleme + kalan süre ve etiketli düğmeler (Hız · Bölümler · Ses ve Altyazı ·
 * Sonraki Bölüm). Dokunma denetimleri açar/kapatır; sol/sağ yarıya çift dokunma 10 sn sarar. Paneller alt sayfadır.
 * Video her yönde ortalanmış, kenardan kenara (dikeyde yan çevirme ipucu).
 */
import { useEffect, useRef, useState, type PointerEvent, type ReactElement, type RefObject } from 'react'
import type { PlayerModel } from './core'
import { Busy, ErrorPanel, NextCard, Stats, Subtitles, TitleLine, useGlyph, useIdle, Glyph } from './common'
import { usePointerKeys, toggleFullscreen, ZapButtons, type PointerPanel } from './DesktopChrome'
import { formatClock } from './format'
import {
  IconArrowLeft,
  IconAudioSubs,
  IconBack10,
  IconCast,
  IconEpisodes,
  IconFwd10,
  IconNextEpisode,
  IconPause,
  IconPlay,
  IconRestart,
  IconRotate,
  IconSpeed,
} from './icons'
import { AudioSubsPanel, EpisodesPanel, SpeedPanel, speedLabel } from './panels'
import { LiveProgramme, LiveTag, Scrubber } from './parts'

const DOUBLE_TAP_MS = 300
const RIPPLE_MS = 700

interface Ripple {
  side: -1 | 1
  total: number
  n: number
}

function usePortrait(): boolean {
  const q = '(orientation: portrait)'
  const [p, setP] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const on = () => setP(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return p
}

export function MobileChrome({
  m,
  stageRef,
}: {
  m: PlayerModel
  stageRef: RefObject<HTMLDivElement | null>
}): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null)
  const [panel, setPanel] = useState<PointerPanel | null>(null)
  const [userHid, setUserHid] = useState(false)
  const [ripple, setRipple] = useState<Ripple | null>(null)
  const { idle, poke: idlePoke, hideNow } = useIdle(3000)
  const [glyph, showGlyph] = useGlyph()
  const portrait = usePortrait()
  const [rotateHint, setRotateHint] = useState(portrait)
  const tap = useRef<{ t: number; side: -1 | 1; timer: number | null; seekAt: number }>({
    t: 0,
    side: 1,
    timer: null,
    seekAt: 0,
  })
  const rippleTimer = useRef<number | null>(null)

  const poke = () => {
    setUserHid(false)
    idlePoke()
  }
  const hidden = idle && !panel && !m.error && (m.playing || userHid)

  usePointerKeys(m, {
    poke,
    glyph: showGlyph,
    fullscreen: () => toggleFullscreen(rootRef.current),
    closePanel: () => {
      if (!panel) return false
      setPanel(null)
      return true
    },
  })

  useEffect(() => {
    if (!rotateHint) return
    const t = window.setTimeout(() => setRotateHint(false), 5000)
    return () => clearTimeout(t)
  }, [rotateHint])
  useEffect(() => {
    if (portrait) setRotateHint(true)
  }, [portrait])
  useEffect(
    () => () => {
      if (tap.current.timer !== null) clearTimeout(tap.current.timer)
      if (rippleTimer.current !== null) clearTimeout(rippleTimer.current)
    },
    [],
  )

  const seekTap = (side: -1 | 1) => {
    m.act.seekBy(side * 10)
    tap.current.seekAt = performance.now()
    // Netflix gibi: çift dokunuşla sararken denetimler çekilir, yalnız dalga görünür
    setUserHid(true)
    hideNow()
    setRipple((r) => ({ side, total: r && r.side === side ? r.total + 10 : 10, n: (r?.n ?? 0) + 1 }))
    if (rippleTimer.current !== null) clearTimeout(rippleTimer.current)
    rippleTimer.current = window.setTimeout(() => setRipple(null), RIPPLE_MS)
  }

  const onStageUp = (e: PointerEvent<HTMLDivElement>) => {
    if (panel) {
      setPanel(null)
      return
    }
    const r = e.currentTarget.getBoundingClientRect()
    const side: -1 | 1 = e.clientX < r.left + r.width / 2 ? -1 : 1
    const now = performance.now()
    const t = tap.current
    // Sarma sürerken aynı yana her dokunuş 10 sn daha
    if (m.seekable && ripple && ripple.side === side && now - t.seekAt < RIPPLE_MS) {
      seekTap(side)
      return
    }
    if (m.seekable && now - t.t < DOUBLE_TAP_MS && t.side === side && t.timer !== null) {
      clearTimeout(t.timer)
      t.timer = null
      t.t = 0
      seekTap(side)
      return
    }
    if (t.timer !== null) clearTimeout(t.timer)
    t.t = now
    t.side = side
    t.timer = window.setTimeout(() => {
      t.timer = null
      if (hidden) poke()
      else {
        setUserHid(true)
        hideNow()
      }
    }, DOUBLE_TAP_MS)
  }

  const toggle = () => {
    m.act.togglePlay()
    poke()
  }
  const open = (p: PointerPanel) => {
    setPanel((cur) => (cur === p ? null : p))
    poke()
  }
  const airing = m.meta?.airing ?? null
  const remaining = Math.max(0, m.duration - m.position)
  const closePanel = () => setPanel(null)

  return (
    <div
      ref={rootRef}
      className="kb-root"
      data-chrome="mobile"
      data-idle={hidden ? 'true' : 'false'}
      role="region"
      aria-label={`Oynatıcı: ${m.title.main}`}
    >
      <div ref={stageRef} className="kb-stage" onPointerUp={onStageUp} />
      <Subtitles m={m} raised={!hidden} />
      <Busy m={m} />
      <Glyph glyph={glyph} />
      {ripple ? (
        <div key={ripple.n} className="kb-ripple" data-side={ripple.side === -1 ? 'left' : 'right'} aria-hidden="true">
          {ripple.side === -1 ? <IconBack10 size={36} /> : <IconFwd10 size={36} />}
          <span>{ripple.total} sn</span>
        </div>
      ) : null}

      <div className="kb-chrome" data-hidden={hidden ? 'true' : 'false'}>
        <div className="kb-top">
          <button type="button" className="kb-cbtn" aria-label="Geri" onClick={() => m.act.back()}>
            <IconArrowLeft size={28} />
          </button>
          <div className="kb-mtitle">
            <TitleLine m={m} />
          </div>
          {m.isLive ? <LiveTag /> : null}
          {m.castAvailable ? (
            <button type="button" className="kb-cbtn" aria-label="TV'de İzle" onClick={() => m.act.cast()}>
              <IconCast size={28} />
            </button>
          ) : (
            <span className="kb-cbtn-ph" aria-hidden="true" />
          )}
        </div>

        {!m.error && m.state !== 'loading' ? (
          <div className="kb-center">
            {m.seekable ? (
              <button
                type="button"
                className="kb-cbtn kb-cbtn-mid"
                aria-label="10 saniye geri"
                onClick={() => {
                  m.act.seekBy(-10)
                  poke()
                }}
              >
                <IconBack10 size={44} />
              </button>
            ) : null}
            <button
              type="button"
              className="kb-cbtn kb-cbtn-big"
              aria-label={m.playing ? 'Duraklat' : 'Oynat'}
              onClick={toggle}
            >
              {m.playing ? <IconPause size={60} /> : <IconPlay size={60} />}
            </button>
            {m.seekable ? (
              <button
                type="button"
                className="kb-cbtn kb-cbtn-mid"
                aria-label="10 saniye ileri"
                onClick={() => {
                  m.act.seekBy(10)
                  poke()
                }}
              >
                <IconFwd10 size={44} />
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="kb-bottom">
          {m.isLive && airing && !m.seekable ? <LiveProgramme airing={airing} /> : null}
          {m.seekable ? (
            <div className="kb-scrubrow">
              <Scrubber
                position={m.position}
                duration={m.duration}
                buffered={m.buffered}
                onSeek={(t) => {
                  m.act.seek(t)
                  poke()
                }}
              />
              <span className="kb-remaining">{formatClock(remaining)}</span>
            </div>
          ) : null}
          <div className="kb-mrow">
            {m.adapter?.media ? (
              <button type="button" className="kb-lbtn" onClick={() => open('speed')} aria-expanded={panel === 'speed'}>
                <IconSpeed size={24} />
                <span>Hız ({speedLabel(m.speed).replace(' (Normal)', '')})</span>
              </button>
            ) : null}
            {m.seasons && m.seasons.length ? (
              <button
                type="button"
                className="kb-lbtn"
                onClick={() => open('episodes')}
                aria-expanded={panel === 'episodes'}
              >
                <IconEpisodes size={24} />
                <span>Bölümler</span>
              </button>
            ) : null}
            {m.audio.length > 1 || m.subs.length > 1 ? (
              <button
                type="button"
                className="kb-lbtn"
                onClick={() => open('audioSubs')}
                aria-expanded={panel === 'audioSubs'}
              >
                <IconAudioSubs size={24} />
                <span>Ses ve Altyazı</span>
              </button>
            ) : null}
            {m.next ? (
              <button type="button" className="kb-lbtn" onClick={() => m.act.goNext()}>
                <IconNextEpisode size={24} />
                <span>Sonraki Bölüm</span>
              </button>
            ) : null}
            {m.isLive && airing?.startOver && !m.props.fromStart ? (
              <button type="button" className="kb-lbtn" onClick={() => m.act.startOver(true)}>
                <IconRestart size={24} />
                <span>Baştan Başlat</span>
              </button>
            ) : null}
            {m.isLive && m.props.fromStart ? (
              <button type="button" className="kb-lbtn" onClick={() => m.act.startOver(false)}>
                <IconPlay size={24} />
                <span>Canlıya Dön</span>
              </button>
            ) : null}
            {m.meta?.channel ? <ZapButtons m={m} /> : null}
          </div>
        </div>
      </div>

      {panel === 'audioSubs' ? (
        <AudioSubsPanel
          variant="sheet"
          audio={m.audio.length > 1 ? m.audio : []}
          subs={m.subs}
          audioSelected={m.audioSelected}
          subsSelected={m.subsSelected}
          onAudio={(id) => m.act.selectAudio(id)}
          onSubs={(id) => m.act.selectSubs(id)}
          onClose={closePanel}
        />
      ) : null}
      {panel === 'speed' ? (
        <SpeedPanel
          variant="sheet"
          speed={m.speed}
          onSpeed={(s) => {
            m.act.setSpeed(s)
            closePanel()
          }}
          onClose={closePanel}
        />
      ) : null}
      {panel === 'episodes' && m.seasons ? (
        <EpisodesPanel
          variant="sheet"
          showTitle={m.title.main}
          seasons={m.seasons}
          currentId={m.currentEpisodeId}
          onPlay={(ep) => {
            closePanel()
            m.act.playEpisode(ep)
          }}
          onClose={closePanel}
        />
      ) : null}

      {rotateHint && portrait && !panel ? (
        <div className="kb-rotate" role="status">
          <IconRotate size={28} />
          <span>Daha büyük görüntü için telefonunu yan çevir</span>
        </div>
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
