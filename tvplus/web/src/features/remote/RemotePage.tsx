/**
 * Kumanda (#/kumanda) — UX_SPEC §5. Telefonu seçili TV'nin kumandası yapar (masaüstünde de çalışır).
 *
 *   Üstte hedef TV seçici ve bağlantı göstergesi · oynatma varsa "Şu an TV'de" kartı (sürgü SEEK, −10 / ⏯ / +10,
 *   ses −/sessiz/+, canlıda kanal −/+ ve rakam tuşları, Bölümler, Durdur, Bu Telefonda Devam Et) · dokunma pedi
 *   (dokun = OK, kaydır = yön, kaydırıp tut = yinele) ya da yön tuşları · Geri, Ana Sayfa, Ara · TV'deki arama
 *   kutusuna yazı (TEXT, yazdıkça).
 *   ?yansit=<viewableId> ile açılırsa içerik seçili TV'ye yansıtılır (cihaz vitrini ve paylaşılan bağlantılar).
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { DeviceInfo, NowPlaying, RemoteKey } from '../../../../shared/devices'
import { useDocumentTitle, useShellOptions } from '../../app'
import {
  buzz,
  seekBy,
  seekTo,
  send,
  sendKey,
  stopPlayback,
  toggleMute,
  togglePlay,
  useEffectiveNowPlaying,
  useSendStatus,
  volumeBy,
} from '../../devices/actions'
import { KeyRepeater, TouchPad, type Direction } from '../../devices/gestures'
import { formatClockSec, pickerDevices, positionAt } from '../../devices/progress'
import { deviceClient } from '../../devices/client'
import { castController } from '../../devices/runtime'
import { useDeviceState, useTarget } from '../../devices/state'
import { DeviceChoice, NowPlayingArt, NowPlayingText, OnlineDot, useTicker } from '../../devices/ui'
import { ButtonLink, cx, EmptyState, Icon, Sheet, type IconName } from '../../ui'
import './remote.css'

const browserTimers = {
  setTimeout: (fn: () => void, ms: number) => window.setTimeout(fn, ms),
  clearTimeout: (h: unknown) => window.clearTimeout(h as number),
  setInterval: (fn: () => void, ms: number) => window.setInterval(fn, ms),
  clearInterval: (h: unknown) => window.clearInterval(h as number),
  now: () => Date.now(),
}

const PAD_MODE_KEY = 'tvp.kumanda.ped'
type PadMode = 'touch' | 'dpad'
function readPadMode(): PadMode {
  try {
    return window.localStorage.getItem(PAD_MODE_KEY) === 'dpad' ? 'dpad' : 'touch'
  } catch {
    return 'touch'
  }
}

/** Kısa görsel yankı: hangi tuşun gittiğini pedde gösterir. */
function useFlash(): [{ key: RemoteKey; n: number } | null, (k: RemoteKey) => void] {
  const [flash, setFlash] = useState<{ key: RemoteKey; n: number } | null>(null)
  const n = useRef(0)
  return [flash, (key) => setFlash({ key, n: ++n.current })]
}

/* ───────────── sayfa ───────────── */

export default function RemotePage(): ReactElement {
  useShellOptions({ mobileTitle: 'Kumanda' })
  useDocumentTitle('Kumanda')
  const state = useDeviceState()
  const { target } = useTarget()
  const [pickerOpen, setPickerOpen] = useState(false)
  const tvs = useMemo(() => pickerDevices(state.devices), [state.devices])
  useCastDeepLink(target)

  // Çevrimiçi TV yoksa ve seçili hedef de yoksa: bağlanma yolu (çevrimdışı hedef varsa kumanda uyarıyla kalır).
  if (state.connection !== 'idle' && !target && !tvs.some((d) => d.online)) {
    return (
      <div className="rm-page rm-page--empty">
        <EmptyState
          icon="tv"
          title="Bağlı TV yok"
          message="TV'de TV+'ı aç ve ekrandaki QR kodu telefonunla okut. Ya da TV'deki kodu buraya gir."
          action={
            <ButtonLink to="/bagla" variant="play" icon="qr">
              TV'ye Bağlan
            </ButtonLink>
          }
        />
      </div>
    )
  }

  return (
    <div className="rm-page">
      <header className="rm-head">
        <button type="button" className="rm-target" onClick={() => setPickerOpen(true)} aria-haspopup="dialog">
          <Icon name="tv" size={22} />
          <span className="rm-target__name">{target ? target.name : 'Bir TV seç'}</span>
          {target ? <OnlineDot online={target.online} /> : null}
          <Icon name="chevronDown" size={18} />
        </button>
        <ConnectionChip connection={state.connection} target={target} />
      </header>

      {!target ? (
        <div className="rm-choose">
          <p className="rm-note">Kumanda etmek istediğin TV'yi seç.</p>
          {tvs.map((d) => (
            <DeviceChoice key={d.deviceId} device={d} disabled={!d.online} onSelect={() => setTargetDevice(d)} />
          ))}
        </div>
      ) : (
        <Remote target={target} />
      )}

      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="Kumanda edilecek TV">
        <div className="dv-picker">
          <div className="dv-picker__list">
            {tvs.map((d) => (
              <DeviceChoice
                key={d.deviceId}
                device={d}
                selected={d.deviceId === target?.deviceId}
                onSelect={() => {
                  setTargetDevice(d)
                  setPickerOpen(false)
                }}
              />
            ))}
          </div>
          <ButtonLink to="/bagla" variant="secondary" icon="qr" size="sm" className="rm-connect">
            TV'ye Bağlan
          </ButtonLink>
        </div>
      </Sheet>
    </div>
  )
}

function setTargetDevice(d: DeviceInfo): void {
  buzz()
  deviceClient.setTarget(d.deviceId)
}

/** ?yansit=<viewableId>: hedef hazır olunca bir kez yansıt, parametreyi adresten kaldır. */
function useCastDeepLink(target: DeviceInfo | null): void {
  const [params, setParams] = useSearchParams()
  const id = params.get('yansit')
  const done = useRef<string | null>(null)
  useEffect(() => {
    if (!id || !target || !target.online || done.current === id) return
    done.current = id
    void castController.castTo(target, { viewableId: id })
    const next = new URLSearchParams(params)
    next.delete('yansit')
    setParams(next, { replace: true })
  }, [id, target, params, setParams])
}

function ConnectionChip({ connection, target }: { connection: string; target: DeviceInfo | null }): ReactElement {
  const status = useSendStatus()
  const recentFail = status.failedAt !== null && Date.now() - status.failedAt < 8000
  let text = 'Bağlı'
  let tone: 'ok' | 'wait' | 'off' = 'ok'
  if (connection !== 'online') {
    text = 'Yeniden bağlanıyor'
    tone = 'wait'
  } else if (target && !target.online) {
    text = 'TV çevrimdışı'
    tone = 'off'
  } else if (recentFail) {
    text = 'TV yanıt vermiyor'
    tone = 'wait'
  }
  return (
    <span className={cx('rm-chip', `is-${tone}`)} role="status" aria-live="polite">
      <span className="rm-chip__dot" aria-hidden="true" />
      {text}
    </span>
  )
}

/* ───────────── kumanda gövdesi ───────────── */

function Remote({ target }: { target: DeviceInfo }): ReactElement {
  const navigate = useNavigate()
  const live = target.nowPlaying?.live ?? false
  const screen = target.screen
  const playing = !!target.nowPlaying
  const [mode, setMode] = useState<PadMode>(readPadMode)
  const [keypad, setKeypad] = useState(false)
  const [typing, setTyping] = useState(screen === 'search')
  const [flash, doFlash] = useFlash()
  const id = target.deviceId

  useEffect(() => {
    if (screen === 'search') setTyping(true)
  }, [screen])

  const sendWithFeedback = (key: RemoteKey, repeat: boolean) => {
    if (!repeat) buzz()
    doFlash(key)
    void sendKey(id, key)
  }
  const repeater = useMemo(() => new KeyRepeater(browserTimers, (k, r) => sendWithFeedback(k, r)), [id])
  useEffect(() => () => repeater.release(), [repeater])

  const changeMode = (m: PadMode) => {
    setMode(m)
    try {
      window.localStorage.setItem(PAD_MODE_KEY, m)
    } catch {
      /* gizli kip */
    }
  }

  const showKeypad = live || screen === 'live' || screen === 'guide'

  return (
    <div className="rm-body">
      {!target.online ? (
        <p className="rm-banner" role="status">
          {target.name} şu an çevrimdışı. TV'de TV+'ı açınca kumanda kendiliğinden bağlanır.
        </p>
      ) : null}

      {playing ? <NowPlayingPanel target={target} onKeypad={showKeypad ? () => setKeypad(true) : null} /> : null}

      {typing ? <TypeToTv deviceId={id} onClose={() => setTyping(false)} autoFocus={screen !== 'search'} /> : null}

      <div className="rm-modes" role="radiogroup" aria-label="Yön denetimi">
        {(
          [
            ['touch', 'Dokunmatik'],
            ['dpad', 'Yön tuşları'],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            className={cx('rm-mode', mode === m && 'is-on')}
            onClick={() => changeMode(m)}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'touch' ? <TouchArea repeater={repeater} flash={flash} /> : <DPad repeater={repeater} flash={flash} />}

      <div className="rm-keys">
        <KeyButton icon="back" label="Geri" onPress={() => repeater.tap('BACK')} />
        <KeyButton icon="home" label="Ana Sayfa" onPress={() => repeater.tap('HOME')} />
        <KeyButton
          icon="search"
          label="Ara"
          pressed={typing}
          onPress={() => {
            setTyping(true)
            repeater.tap('SEARCH')
          }}
        />
        {showKeypad ? (
          <KeyButton icon="grid" label="Rakamlar" onPress={() => setKeypad(true)} />
        ) : (
          <KeyButton icon="guide" label="Rehber" onPress={() => repeater.tap('GUIDE')} />
        )}
      </div>

      {showKeypad && !playing ? (
        <div className="rm-row rm-row--channels" aria-label="Kanal">
          <WideKey label="Kanal −" icon="chevronDown" onPress={() => repeater.tap('CHANNEL_DOWN')} />
          <WideKey label="Kanal +" icon="chevronUp" onPress={() => repeater.tap('CHANNEL_UP')} />
        </div>
      ) : null}

      <Sheet open={keypad} onClose={() => setKeypad(false)} title="Kanal numarası">
        <Keypad onDigit={(d) => sendWithFeedback(`DIGIT_${d}` as RemoteKey, false)} onOk={() => repeater.tap('OK')} />
      </Sheet>

      <p className="rm-tip">
        {mode === 'touch'
          ? 'Dokun: Tamam · Kaydır: yön · Kaydırıp tut: hızlı geçiş'
          : 'Yön tuşunu basılı tutunca hızlı geçer'}
      </p>
      <button type="button" className="dv-picker__link rm-devices" onClick={() => navigate('/cihazlar')}>
        <Icon name="tv" size={18} />
        Cihazlar
      </button>
    </div>
  )
}

function KeyButton({
  icon,
  label,
  onPress,
  pressed,
}: {
  icon: IconName
  label: string
  onPress: () => void
  pressed?: boolean
}): ReactElement {
  return (
    <button type="button" className={cx('rm-key', pressed && 'is-on')} onClick={onPress} aria-label={label}>
      <Icon name={icon} size={24} />
      <span>{label}</span>
    </button>
  )
}

function WideKey({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }): ReactElement {
  return (
    <button type="button" className="rm-wide" onClick={onPress}>
      <Icon name={icon} size={22} />
      {label}
    </button>
  )
}

/* ───────────── şu an oynayan ───────────── */

function NowPlayingPanel({
  target,
  onKeypad,
}: {
  target: DeviceInfo
  onKeypad: (() => void) | null
}): ReactElement | null {
  const raw = target.nowPlaying
  const now = useTicker(!!raw && !raw.paused)
  const np = useEffectiveNowPlaying(target, now)
  if (!np) return null
  return (
    <section className="rm-np" aria-label="Şu an TV'de">
      <div className="rm-np__top">
        <NowPlayingArt np={np} className="rm-np__art" />
        <NowPlayingText np={np} />
      </div>
      {np.live ? null : <Scrubber target={target} np={np} now={now} />}
      <div className="rm-transport">
        {np.live ? (
          <RoundKey
            icon="chevronDown"
            label="Kanal −"
            caption="Kanal"
            onPress={() => void sendKey(target.deviceId, 'CHANNEL_DOWN')}
          />
        ) : (
          <RoundKey icon="back10" label="10 saniye geri" onPress={() => seekBy(target, -10)} />
        )}
        <button
          type="button"
          className="rm-play"
          aria-label={np.paused ? 'Oynat' : 'Duraklat'}
          onClick={() => {
            buzz()
            togglePlay(target)
          }}
        >
          <Icon name={np.paused ? 'play' : 'pause'} size={34} />
        </button>
        {np.live ? (
          <RoundKey
            icon="chevronUp"
            label="Kanal +"
            caption="Kanal"
            onPress={() => void sendKey(target.deviceId, 'CHANNEL_UP')}
          />
        ) : (
          <RoundKey icon="forward10" label="10 saniye ileri" onPress={() => seekBy(target, 10)} />
        )}
      </div>
      <Volume target={target} np={np} />
      <div className="rm-np__extra">
        {np.live && onKeypad ? (
          <button type="button" className="rm-chipbtn" onClick={onKeypad}>
            <Icon name="grid" size={18} />
            Rakamlar
          </button>
        ) : null}
        {!np.live && np.subtitle ? (
          <button type="button" className="rm-chipbtn" onClick={() => void sendKey(target.deviceId, 'DOWN')}>
            <Icon name="episodes" size={18} />
            Bölümler
          </button>
        ) : null}
        <button type="button" className="rm-chipbtn" onClick={() => void sendKey(target.deviceId, 'SUBTITLES')}>
          <Icon name="subtitles" size={18} />
          Altyazı
        </button>
        <button
          type="button"
          className="rm-chipbtn"
          onClick={() => {
            buzz()
            void stopPlayback(target)
          }}
        >
          <Icon name="close" size={18} />
          Durdur
        </button>
        <button
          type="button"
          className="rm-chipbtn rm-chipbtn--strong"
          onClick={() => void castController.continueHere(target, np)}
        >
          <Icon name="phone" size={18} />
          Bu Cihazda Devam Et
        </button>
      </div>
    </section>
  )
}

function RoundKey({
  icon,
  label,
  caption,
  onPress,
}: {
  icon: IconName
  label: string
  /** Görünür kısa etiket (kanal tuşları yön tuşlarıyla karışmasın) */
  caption?: string
  onPress: () => void
}): ReactElement {
  return (
    <button
      type="button"
      className={cx('rm-round', caption && 'rm-round--caption')}
      aria-label={label}
      title={label}
      onClick={() => {
        buzz()
        onPress()
      }}
    >
      <Icon name={icon} size={caption ? 22 : 28} />
      {caption ? <span aria-hidden="true">{caption}</span> : null}
    </button>
  )
}

/** Sürükleme sırasında yalnız görüntü değişir; bırakınca tek SEEK gider. */
function Scrubber({ target, np, now }: { target: DeviceInfo; np: NowPlaying; now: number }): ReactElement {
  const [drag, setDrag] = useState<number | null>(null)
  const duration = np.durationSec ?? 0
  const pos = drag ?? positionAt(np, now)
  const commit = () => {
    if (drag === null) return
    seekTo(target, drag)
    setDrag(null)
  }
  return (
    <div className="rm-scrub">
      <input
        type="range"
        min={0}
        max={Math.max(1, Math.floor(duration))}
        step={1}
        value={Math.floor(pos)}
        aria-label="Konum"
        aria-valuetext={`${formatClockSec(pos)} / ${formatClockSec(duration)}`}
        style={{ '--p': `${duration ? (pos / duration) * 100 : 0}%` } as Record<string, string>}
        onChange={(e) => setDrag(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      <div className="rm-scrub__times">
        <span>{formatClockSec(pos)}</span>
        <span>−{formatClockSec(Math.max(0, duration - pos))}</span>
      </div>
    </div>
  )
}

function Volume({ target, np }: { target: DeviceInfo; np: NowPlaying }): ReactElement {
  const level = np.muted ? 0 : np.volume
  return (
    <div className="rm-volume" aria-label="Ses">
      <button
        type="button"
        className="rm-vbtn"
        aria-label="Sesi kıs"
        onClick={() => {
          buzz()
          volumeBy(target, -10)
        }}
      >
        −
      </button>
      <button
        type="button"
        className={cx('rm-vbtn rm-vbtn--mute', np.muted && 'is-on')}
        aria-label={np.muted ? 'Sesi aç' : 'Sessize al'}
        aria-pressed={np.muted}
        onClick={() => {
          buzz()
          toggleMute(target)
        }}
      >
        <Icon name={np.muted ? 'mute' : 'volume'} size={22} />
        <span className="rm-vlevel" aria-hidden="true">
          <span style={{ width: `${level}%` }} />
        </span>
      </button>
      <button
        type="button"
        className="rm-vbtn"
        aria-label="Sesi aç"
        onClick={() => {
          buzz()
          volumeBy(target, 10)
        }}
      >
        +
      </button>
    </div>
  )
}

/* ───────────── yön denetimi ───────────── */

const ARROW_ICON: Record<Direction, IconName> = {
  UP: 'chevronUp',
  DOWN: 'chevronDown',
  LEFT: 'chevronLeft',
  RIGHT: 'chevronRight',
}
const KEY_OF: Record<string, RemoteKey> = {
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
  Enter: 'OK',
  ' ': 'OK',
  Backspace: 'BACK',
  Escape: 'BACK',
}

/** Fiziksel klavye (masaüstü): ped odaktayken oklar, Enter, Geri. */
function useKeyboard(repeater: KeyRepeater): (e: KeyboardEvent<HTMLElement>) => void {
  return (e) => {
    const key = KEY_OF[e.key]
    if (!key) return
    e.preventDefault()
    if (e.repeat) return
    if (key === 'OK' || key === 'BACK') repeater.tap(key)
    else repeater.press(key)
  }
}

function TouchArea({
  repeater,
  flash,
}: {
  repeater: KeyRepeater
  flash: { key: RemoteKey; n: number } | null
}): ReactElement {
  const pad = useMemo(() => new TouchPad(browserTimers, repeater), [repeater])
  const onKeyDown = useKeyboard(repeater)
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pad.down(e.clientX, e.clientY)
  }
  return (
    <div
      className="rm-pad"
      role="application"
      aria-label="Dokunma pedi: dokun Tamam, kaydır yön. Klavyede oklar ve Enter."
      tabIndex={0}
      onPointerDown={onDown}
      onPointerMove={(e) => pad.move(e.clientX, e.clientY)}
      onPointerUp={(e) => pad.up(e.clientX, e.clientY)}
      onPointerCancel={() => pad.cancel()}
      onKeyDown={onKeyDown}
      onKeyUp={() => repeater.release()}
      onBlur={() => repeater.release()}
    >
      {(['UP', 'RIGHT', 'DOWN', 'LEFT'] as const).map((d) => (
        <span key={d} className={cx('rm-pad__hint', `rm-pad__hint--${d.toLowerCase()}`)} aria-hidden="true">
          <Icon name={ARROW_ICON[d]} size={22} />
        </span>
      ))}
      <span className="rm-pad__center" aria-hidden="true">
        Tamam
      </span>
      {flash ? (
        <span
          key={flash.n}
          className={cx('rm-pad__flash', `rm-pad__flash--${flash.key.toLowerCase()}`)}
          aria-hidden="true"
        />
      ) : null}
    </div>
  )
}

function DPad({
  repeater,
  flash,
}: {
  repeater: KeyRepeater
  flash: { key: RemoteKey; n: number } | null
}): ReactElement {
  const onKeyDown = useKeyboard(repeater)
  const press = (key: RemoteKey) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      if (key === 'OK') repeater.tap(key)
      else repeater.press(key)
    },
    onPointerUp: () => repeater.release(),
    onPointerCancel: () => repeater.release(),
    onLostPointerCapture: () => repeater.release(),
    // Klavye ile etkinleştirme (detail 0); dokunma zaten pointerdown'da gitti.
    onClick: (e: { detail: number }) => {
      if (e.detail === 0) repeater.tap(key)
    },
  })
  return (
    <div className="rm-dpad" onKeyDown={onKeyDown} onKeyUp={() => repeater.release()}>
      {(['UP', 'LEFT', 'RIGHT', 'DOWN'] as const).map((d) => (
        <button
          key={d}
          type="button"
          className={cx('rm-dpad__arrow', `rm-dpad__arrow--${d.toLowerCase()}`, flash?.key === d && 'is-flash')}
          aria-label={{ UP: 'Yukarı', DOWN: 'Aşağı', LEFT: 'Sol', RIGHT: 'Sağ' }[d]}
          {...press(d)}
        >
          <Icon name={ARROW_ICON[d]} size={30} />
        </button>
      ))}
      <button
        type="button"
        className={cx('rm-dpad__ok', flash?.key === 'OK' && 'is-flash')}
        aria-label="Tamam"
        {...press('OK')}
      >
        Tamam
      </button>
    </div>
  )
}

/* ───────────── yazı ve rakamlar ───────────── */

/** Telefon klavyesi → TV'deki arama kutusu: her değişiklikte kutunun TAM metni (TEXT) gider. */
function TypeToTv({
  deviceId,
  onClose,
  autoFocus,
}: {
  deviceId: string
  onClose: () => void
  autoFocus: boolean
}): ReactElement {
  const [text, setText] = useState('')
  const timer = useRef<number | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
    },
    [],
  )
  const push = (value: string, submit = false) => {
    if (timer.current) window.clearTimeout(timer.current)
    if (submit) {
      void send(deviceId, { type: 'TEXT', text: value, submit: true })
      return
    }
    // Kısa bekleme: hızlı yazarken her harf ayrı istek olmasın (kuyruk da eskisini birleştirir).
    timer.current = window.setTimeout(() => void send(deviceId, { type: 'TEXT', text: value }), 120)
  }
  return (
    <form
      className="rm-type"
      onSubmit={(e) => {
        e.preventDefault()
        push(text, true)
        ref.current?.blur()
      }}
    >
      <Icon name="keyboard" size={20} className="rm-type__icon" />
      <input
        ref={ref}
        className="rm-type__input"
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder="TV'de ara: başlıklar, kişiler, türler"
        aria-label="TV'deki arama kutusuna yaz"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          push(e.target.value)
        }}
      />
      <button type="button" className="rm-type__close" aria-label="Yazmayı kapat" onClick={onClose}>
        <Icon name="close" size={18} />
      </button>
    </form>
  )
}

function Keypad({ onDigit, onOk }: { onDigit: (d: number) => void; onOk: () => void }): ReactElement {
  return (
    <div className="rm-keypad">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
        <button key={d} type="button" className="rm-digit" onClick={() => onDigit(d)}>
          {d}
        </button>
      ))}
      <span />
      <button type="button" className="rm-digit" onClick={() => onDigit(0)}>
        0
      </button>
      <button type="button" className="rm-digit rm-digit--ok" onClick={onOk}>
        Tamam
      </button>
    </div>
  )
}
