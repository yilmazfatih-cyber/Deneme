/**
 * "Kim izliyor?" — TV profil kapısı. Büyük kare avatarlar tek satırda; odakta 1.08× + beyaz çerçeve.
 * Kilitli profilde PIN sorulur (TvKeypad; kumandanın rakam tuşları da çalışır): yanlış PIN → sallanma + mesaj,
 * çok deneme (429) → bekleme mesajı. Profil ekleme ve yönetme telefondan / webden yapılır.
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ManagedProfile } from '../../../../shared/devices'
import type { BootContext } from '../../../../shared/types'
import { deviceClient } from '../../devices/client'
import { FocusScope, useFocusable } from '../focus'
import { adoptBoot, useTvBoot } from '../shell/session'
import { TvAvatar, TvDialog, TvIcon, TvKeypad, TvScreen, tvToast } from '../ui'
import './profiles.css'

const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ')

export const profileFocusId = (guid: string): string => `profil:${guid}`

/** Profil listesi: profil servisinden; servis yanıt vermezse açılış bağlamındaki özetlerden. */
function fallbackProfiles(boot: BootContext | null): ManagedProfile[] {
  return (boot?.profiles ?? []).map((p) => ({
    guid: p.guid,
    name: p.name,
    avatarKey: p.avatarKey ?? '',
    avatarUrl: p.avatarUrl,
    isKids: p.isKids,
    isLocked: p.isLocked ?? false,
    maturityLevel: p.maturityLevel,
  }))
}

type PinError = 'invalid' | 'locked' | 'other'

function pinErrorOf(err: unknown): PinError {
  const msg = err instanceof Error ? err.message : String(err)
  if (/PIN_INVALID/.test(msg)) return 'invalid'
  if (/429|TOO_MANY|RATE|LOCKED|KILIT/i.test(msg)) return 'locked'
  return 'other'
}

const PIN_TEXT: Record<PinError, string> = {
  invalid: 'PIN yanlış. Tekrar dene.',
  locked: 'Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar dene.',
  other: 'Profil açılamadı. Tekrar dene.',
}

function ProfileTile({
  profile,
  busy,
  onSelect,
}: {
  profile: ManagedProfile
  busy: boolean
  onSelect: () => void
}): ReactElement {
  const { ref, focused } = useFocusable<HTMLDivElement>({ id: profileFocusId(profile.guid), onEnter: onSelect })
  return (
    <div
      ref={ref}
      role="button"
      aria-label={`${profile.name}${profile.isLocked ? ', kilitli' : ''}${profile.isKids ? ', çocuk profili' : ''}`}
      aria-busy={busy || undefined}
      className={cx('tv-profile', focused && 'is-focused', busy && 'is-busy')}
    >
      <TvAvatar url={profile.avatarUrl} name={profile.name} size={12} className="tv-profile__avatar" />
      <span className="tv-profile__name">{profile.name}</span>
      <span className="tv-profile__lock" aria-hidden="true">
        {profile.isLocked && <TvIcon name="lock" size={1.6} />}
      </span>
    </div>
  )
}

function PinDialog({
  profile,
  onClose,
  onDone,
}: {
  profile: ManagedProfile
  onClose: () => void
  onDone: (boot: BootContext) => void
}): ReactElement {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<PinError | null>(null)
  const [shake, setShake] = useState(0)
  const sending = useRef(false)

  const submit = (value: string): void => {
    if (sending.current || value.length !== 4) return
    sending.current = true
    deviceClient.switchProfile(profile.guid, value).then(
      (boot) => {
        sending.current = false
        onDone(boot)
      },
      (err: unknown) => {
        sending.current = false
        setError(pinErrorOf(err))
        setShake((n) => n + 1)
        setPin('')
      },
    )
  }

  const digit = (d: number): void => {
    if (sending.current || pin.length >= 4) return
    const next = pin + String(d)
    setPin(next)
    if (error) setError(null)
    if (next.length === 4) submit(next)
  }

  return (
    <TvDialog
      id="pin"
      title={`${profile.name} profili kilitli`}
      message="Profili açmak için 4 haneli PIN'ini gir."
      onClose={onClose}
      defaultFocus="pin-tus:1"
    >
      <div
        key={shake}
        className={cx('tv-pin__dots', shake > 0 && 'is-shaking')}
        aria-label={`${pin.length} hane girildi`}
      >
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cx('tv-pin__dot', i < pin.length && 'is-filled')} />
        ))}
      </div>
      <p className={cx('tv-pin__error', error && 'is-visible')} role="alert">
        {error ? PIN_TEXT[error] : ' '}
      </p>
      <TvKeypad id="pin-tus" onDigit={digit} onDelete={() => setPin((p) => p.slice(0, -1))} />
    </TvDialog>
  )
}

export function TvProfiles(): ReactElement {
  const boot = useTvBoot()
  const navigate = useNavigate()
  // Açılış bağlamındaki özetlerle hemen çiz (odak beklemeden kurulur); profil servisinin yanıtı gelince güncelle.
  const [profiles, setProfiles] = useState<ManagedProfile[] | null>(() =>
    boot?.profiles.length ? fallbackProfiles(boot) : null,
  )
  const [pinFor, setPinFor] = useState<ManagedProfile | null>(null)
  const [busyGuid, setBusyGuid] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    deviceClient.listProfiles().then(
      (res) => alive && setProfiles(res.profiles),
      () => alive && setProfiles((cur) => cur ?? fallbackProfiles(boot)),
    )
    return () => {
      alive = false
    }
    // Bağlam değişince (başka profil) liste yeniden istenmez; ilk açılıştaki liste yeter.
  }, [])

  const finish = (next: BootContext): void => {
    adoptBoot(next)
    navigate('/tv', { replace: true })
  }

  const select = (p: ManagedProfile): void => {
    if (busyGuid) return
    if (p.isLocked) {
      setPinFor(p)
      return
    }
    setBusyGuid(p.guid)
    deviceClient.switchProfile(p.guid).then(
      (next) => {
        setBusyGuid(null)
        finish(next)
      },
      (err: unknown) => {
        setBusyGuid(null)
        // Sunucu kilidi bizden önce bildiyse PIN sor.
        if (/PIN_REQUIRED/.test(err instanceof Error ? err.message : String(err))) setPinFor({ ...p, isLocked: true })
        else tvToast('Profil açılamadı. Tekrar dene.')
      },
    )
  }

  const activeGuid = boot?.activeProfile?.guid
  const list = profiles ?? []
  const defaultFocus = list.length
    ? profileFocusId(list.find((p) => p.guid === activeGuid)?.guid ?? list[0]!.guid)
    : undefined

  return (
    <TvScreen id="profiller" title="Kim izliyor?" defaultFocus={defaultFocus}>
      <div className="tv-profiles">
        <img className="tv-profiles__logo" src="/brand/logo.png" alt="TV+" />
        <h1 className="tv-profiles__title">Kim izliyor?</h1>
        <FocusScope id="profil-listesi" orientation="horizontal" defaultFocus={defaultFocus}>
          <div className="tv-profiles__row" role="list">
            {profiles === null
              ? [0, 1, 2].map((i) => <div key={i} className="tv-skel tv-profiles__skel" />)
              : list.map((p) => (
                  <ProfileTile key={p.guid} profile={p} busy={busyGuid === p.guid} onSelect={() => select(p)} />
                ))}
          </div>
        </FocusScope>
        <p className="tv-profiles__hint">Profil eklemek ve yönetmek için telefonunu ya da bilgisayarını kullan.</p>
      </div>
      {pinFor && <PinDialog profile={pinFor} onClose={() => setPinFor(null)} onDone={finish} />}
    </TvScreen>
  )
}
