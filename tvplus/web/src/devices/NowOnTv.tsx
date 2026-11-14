/**
 * "Şu an TV'de" çubuğu ve "TV'de İzle" düğmesi (UX_SPEC §3, §5).
 *
 *   NowOnTvBar — mobil: alt sekmelerin üstünde ince çubuk (görsel, ad, ⏯, kumanda, Bu Cihazda Devam Et);
 *                masaüstü: sol altta küçük kart. Hedef TV bir şey oynatmıyorsa çizilmez.
 *   CastButton — başka çevrimiçi TV yoksa ve bağlı değilken gizli; boştayken seçiciyi açar, bağlıyken (hedef
 *                oynatıyor) sarı simge ve küçük panel: oynatma özeti, Kumandayı Aç, Yansıtmayı Durdur.
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import type { DeviceInfo, NowPlaying } from '../../../shared/devices'
import { useShellFormFactor } from '../app'
import { detectFormFactor } from '../lib/formFactor'
import { Button, cx, Icon, RoundButton, Sheet, useEscape } from '../ui'
import { buzz, stopPlayback, togglePlay, useEffectiveNowPlaying } from './actions'
import { castController, installDeviceUi, openCastPicker } from './runtime'
import { useOnlineTvs, useTarget } from './state'
import { NowPlayingArt, NowPlayingText, ThinProgress, timeLine, useTicker } from './ui'

installDeviceUi()

type Variant = 'mobile' | 'desktop'

function useVariant(explicit?: Variant): Variant {
  const ff = useShellFormFactor()
  if (explicit) return explicit
  return (ff ?? detectFormFactor()) === 'desktop' ? 'desktop' : 'mobile'
}

/** Hedef TV'nin (iyimser katmanlı) oynatma durumu ve saniyelik saat. */
function useTvPlayback(): { target: DeviceInfo | null; np: NowPlaying | null; now: number } {
  const { target, nowPlaying } = useTarget()
  const now = useTicker(!!nowPlaying && !nowPlaying.paused)
  const np = useEffectiveNowPlaying(nowPlaying ? target : null, now)
  return { target, np, now }
}

/* ───────────── Şu an TV'de ───────────── */

export function NowOnTvBar({ variant }: { variant?: Variant } = {}): ReactElement | null {
  const v = useVariant(variant)
  const { target, np, now } = useTvPlayback()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [hiddenFor, setHiddenFor] = useState<string | null>(null)

  if (!target || !np) return null
  // Kumanda sayfası aynı kartı zaten gösteriyor.
  if (pathname.startsWith('/kumanda')) return null
  if (v === 'desktop' && hiddenFor === np.viewableId) return null

  const continueHere = () => void castController.continueHere(target, np)
  const openRemote = () => navigate('/kumanda')
  const playLabel = np.paused ? 'Oynat' : 'Duraklat'

  if (v === 'mobile') {
    return (
      <section className="dv-bar" aria-label="Şu an TV'de">
        <ThinProgress np={np} now={now} className="dv-bar__progress" />
        <button type="button" className="dv-bar__main" onClick={openRemote} aria-label={`Kumandayı aç: ${np.title}`}>
          <NowPlayingArt np={np} className="dv-bar__art" />
          <NowPlayingText
            np={np}
            prefix={
              <span className="dv-bar__where">
                <Icon name="cast" size={14} />
                {target.name}
              </span>
            }
          />
        </button>
        <button
          type="button"
          className="dv-bar__btn"
          aria-label="Bu Cihazda Devam Et"
          title="Bu Cihazda Devam Et"
          onClick={continueHere}
        >
          <Icon name="phone" size={22} />
        </button>
        <button
          type="button"
          className="dv-bar__btn"
          aria-label={playLabel}
          onClick={() => {
            buzz()
            togglePlay(target)
          }}
        >
          <Icon name={np.paused ? 'play' : 'pause'} size={24} />
        </button>
      </section>
    )
  }

  const time = timeLine(np, now)
  return createPortal(
    <section className="dv-card" aria-label="Şu an TV'de">
      <div className="dv-card__top">
        <NowPlayingArt np={np} className="dv-card__art" />
        <div className="dv-card__text">
          <span className="dv-card__where">
            <Icon name="cast" size={14} />
            Şu an TV'de · {target.name}
          </span>
          <NowPlayingText np={np} />
        </div>
        <button
          type="button"
          className="dv-card__hide"
          aria-label="Kartı gizle"
          title="Kartı gizle"
          onClick={() => setHiddenFor(np.viewableId)}
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      <ThinProgress np={np} now={now} className="dv-card__progress" />
      {time ? <span className="dv-card__time">{time}</span> : null}
      <div className="dv-card__actions">
        <RoundButton
          icon={np.paused ? 'play' : 'pause'}
          label={playLabel}
          variant="play"
          onClick={() => togglePlay(target)}
        />
        <RoundButton icon="remote" label="Kumanda" onClick={openRemote} />
        <Button size="sm" variant="secondary" icon="laptop" onClick={continueHere}>
          Bu Cihazda Devam Et
        </Button>
      </div>
    </section>,
    document.body,
  )
}

/* ───────────── TV'de İzle düğmesi ───────────── */

function ConnectedPanel({
  target,
  np,
  now,
  canSwitch,
  onClose,
}: {
  target: DeviceInfo
  np: NowPlaying
  now: number
  canSwitch: boolean
  onClose: () => void
}): ReactElement {
  const navigate = useNavigate()
  const time = timeLine(np, now)
  return (
    <div className="dv-panel__body">
      <div className="dv-panel__np">
        <NowPlayingArt np={np} className="dv-panel__art" />
        <div className="dv-panel__text">
          <span className="dv-card__where">
            <Icon name="cast" size={14} />
            {target.name}
          </span>
          <NowPlayingText np={np} />
          {time ? <span className="dv-card__time">{time}</span> : null}
        </div>
        <RoundButton
          icon={np.paused ? 'play' : 'pause'}
          label={np.paused ? 'Oynat' : 'Duraklat'}
          variant="play"
          onClick={() => togglePlay(target)}
        />
      </div>
      <ThinProgress np={np} now={now} />
      <div className="dv-panel__actions">
        <Button
          variant="play"
          icon="remote"
          block
          onClick={() => {
            onClose()
            navigate('/kumanda')
          }}
        >
          Kumandayı Aç
        </Button>
        <Button
          variant="secondary"
          icon="close"
          block
          onClick={() => {
            onClose()
            void stopPlayback(target)
          }}
        >
          Yansıtmayı Durdur
        </Button>
        {canSwitch ? (
          <button
            type="button"
            className="dv-picker__link"
            onClick={() => {
              onClose()
              openCastPicker(null)
            }}
          >
            <Icon name="tv" size={20} />
            Başka bir TV seç
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function CastButton({ className }: { className?: string }): ReactElement | null {
  const variant = useVariant()
  const tvs = useOnlineTvs()
  const { target, np, now } = useTvPlayback()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const connected = !!(target && np)

  useEscape(open && variant === 'desktop', () => setOpen(false))
  useEffect(() => {
    if (!open || variant !== 'desktop') return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open, variant])
  useEffect(() => {
    if (!connected) setOpen(false)
  }, [connected])

  const desktopBar = variant === 'desktop' ? <NowOnTvBar variant="desktop" /> : null
  if (!connected && tvs.length === 0) return desktopBar

  const label = connected ? `TV'de İzle: ${target.name} bağlı` : "TV'de İzle"
  const onClick = () => {
    if (connected) setOpen((o) => !o)
    else openCastPicker(null)
  }

  return (
    <div className={cx('dv-cast', className)} ref={rootRef}>
      <button
        type="button"
        className={cx('ui-iconbtn', 'dv-cast__btn', connected && 'is-connected')}
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={connected ? open : undefined}
        onClick={onClick}
      >
        <Icon name="cast" size={24} />
        {connected ? <span className="dv-cast__pulse" aria-hidden="true" /> : null}
      </button>
      {connected && variant === 'desktop' && open ? (
        <div className="dv-panel" role="dialog" aria-label="Şu an TV'de">
          <ConnectedPanel target={target} np={np} now={now} canSwitch={tvs.length > 1} onClose={() => setOpen(false)} />
        </div>
      ) : null}
      {connected && variant === 'mobile' ? (
        <Sheet open={open} onClose={() => setOpen(false)} title="Şu an TV'de">
          <ConnectedPanel target={target} np={np} now={now} canSwitch={tvs.length > 1} onClose={() => setOpen(false)} />
        </Sheet>
      ) : null}
      {desktopBar}
    </div>
  )
}
