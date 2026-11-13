/**
 * TV giriş ekranı (UX_SPEC §4 "Giriş", §5 "QR ile giriş"). Sol yarı: "Telefonunla giriş yap", üç adım, QR (beyaz kart).
 * Sağ yarı: adres ve büyük kod, geri sayım. Altta: "Bu TV'de demo hesabıyla giriş yap".
 * Onay gelince kısa bir "Hoş geldin" ve profil seçimi (onay bir profil seçtiyse doğrudan Ana Sayfa).
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import type { BootContext } from '../../../../shared/types'
import { apiUrl, peekBoot } from '../../api/session'
import { deviceClient } from '../../devices/client'
import { TV_PATHS } from '../shell/routes'
import { adoptApprovedLogin, loginDemo, useTvBoot } from '../shell/session'
import { displayAddress, formatCountdown, formatUserCode, TvButton, TvScreen, tvToast, useNow } from '../ui'
import { TvLoginFlow, type TvLoginView } from './machine'
import './login.css'

/** "Hoş geldin" ekranda kalma süresi */
const WELCOME_MS = 1600

const NOTICE_TEXT = {
  denied: 'Giriş reddedildi. Yeni kodla tekrar deneyebilirsin.',
  expired: 'Kodun süresi doldu. Yeni kod hazır.',
} as const

const DEMO_ID = 'giris:demo'

export function TvLogin(): ReactElement {
  const navigate = useNavigate()
  const boot = useTvBoot()
  const member = boot?.membershipStatus === 'CURRENT_MEMBER'
  // Girişli açıldıysa bu ekran gösterilmez; girişli hale bu ekrandayken gelindiyse "Hoş geldin" gösterilir.
  const [enteredAsMember] = useState(member)
  const [view, setView] = useState<TvLoginView>({ phase: 'starting', notice: null })
  const viewRef = useRef(view)
  viewRef.current = view
  const [welcome, setWelcome] = useState(false)
  const busy = useRef(false)
  const viaDemo = useRef(false)
  const now = useNow(1000)

  useEffect(() => {
    if (enteredAsMember) return
    const flow = new TvLoginFlow(
      {
        start: () => deviceClient.startTvLogin(),
        poll: (code) => deviceClient.pollTvLogin(code),
        now: () => Date.now(),
        setTimer: (fn, ms) => window.setTimeout(fn, ms),
        clearTimer: (h) => window.clearTimeout(h as number),
      },
      setView,
    )
    flow.begin()
    return () => flow.dispose()
  }, [enteredAsMember])

  const finish = (b: BootContext): void => {
    navigate(b.activeProfile ? TV_PATHS.home : TV_PATHS.profiles, { replace: true })
  }

  // Telefon onayladı (yoklama APPROVED ya da cihaz istemcisi bağlamı uyguladı): önce "Hoş geldin", sonra bağlam
  // (önbellekler boşaltılarak) uygulanır ve profil seçimine — onay profil seçtiyse Ana Sayfa'ya — gidilir.
  const approved = !enteredAsMember && (view.phase === 'approved' || (member && !viaDemo.current))
  useEffect(() => {
    if (!approved) return
    setWelcome(true)
    const t = window.setTimeout(() => {
      const v = viewRef.current
      adoptApprovedLogin(v.phase === 'approved' && v.boot ? v.boot : peekBoot()).then(finish, () => {
        setWelcome(false)
        tvToast('Giriş tamamlanamadı. Tekrar dene.')
      })
    }, WELCOME_MS)
    return () => window.clearTimeout(t)
  }, [approved])

  const demo = (): void => {
    if (busy.current || welcome) return
    busy.current = true
    viaDemo.current = true
    loginDemo().then(
      (b) => {
        busy.current = false
        finish(b)
      },
      () => {
        busy.current = false
        viaDemo.current = false
        tvToast('Giriş yapılamadı. Tekrar dene.')
      },
    )
  }

  if (enteredAsMember && boot) return <Navigate to={boot.activeProfile ? TV_PATHS.home : TV_PATHS.profiles} replace />

  const pending = view.phase === 'pending' ? view : null
  const notice = view.phase === 'approved' ? null : view.notice
  const secondsLeft = pending ? Math.max(0, Math.ceil((pending.expiresAt - now) / 1000)) : null

  return (
    <TvScreen id="giris" title="Giriş" defaultFocus={DEMO_ID}>
      <div className="tv-login">
        <img className="tv-login__logo" src="/brand/logo.png" alt="TV+" />
        <div className="tv-login__halves">
          <section className="tv-login__half tv-login__half--phone" aria-labelledby="giris-telefon">
            <h1 className="tv-login__title" id="giris-telefon">
              Telefonunla giriş yap
            </h1>
            <div className="tv-login__phone">
              <div className="tv-login__qr" aria-busy={!pending}>
                {pending ? (
                  <img
                    key={pending.start.qrUrl}
                    src={apiUrl(pending.start.qrUrl)}
                    alt={`Giriş için QR kodu: ${pending.start.userCode}`}
                  />
                ) : (
                  <div className="tv-login__qr-wait" />
                )}
              </div>
              <ol className="tv-login__steps">
                <li>
                  <span className="tv-login__step-no">1</span>Telefonunun kamerasını aç.
                </li>
                <li>
                  <span className="tv-login__step-no">2</span>QR kodu okut.
                </li>
                <li>
                  <span className="tv-login__step-no">3</span>Telefonunda girişi onayla.
                </li>
              </ol>
            </div>
          </section>

          <div className="tv-login__or" aria-hidden="true">
            <span>ya da</span>
          </div>

          <section className="tv-login__half tv-login__half--code" aria-labelledby="giris-kod">
            <h2 className="tv-login__subtitle" id="giris-kod">
              Tarayıcıdan giriş yap
            </h2>
            <p className="tv-login__label">Telefonunda ya da bilgisayarında aç:</p>
            <p className="tv-login__address">{pending ? displayAddress(pending.start.verificationUrl) : '…'}</p>
            <p className="tv-login__label">Bu kodu gir:</p>
            <p className="tv-login__code" aria-live="polite">
              {pending ? formatUserCode(pending.start.userCode) : view.phase === 'error' ? '— — — —' : '····-····'}
            </p>
            <p className="tv-login__countdown">
              {secondsLeft !== null
                ? `Kod ${formatCountdown(secondsLeft)} içinde yenilenir`
                : view.phase === 'error'
                  ? 'Kod alınamadı. Birazdan yeniden denenecek.'
                  : 'Kod hazırlanıyor…'}
            </p>
            {notice && (
              <p className="tv-login__notice" role="status">
                {NOTICE_TEXT[notice]}
              </p>
            )}
          </section>
        </div>
        <div className="tv-login__demo">
          <TvButton id={DEMO_ID} label="Bu TV'de demo hesabıyla giriş yap" onPress={demo} />
        </div>
      </div>
      {welcome && (
        // Giriş ekranının üstünde opak katman; odak alttaki düğmede kalır (odak hiçbir an kaybolmaz).
        <div className="tv-login-welcome" role="status">
          <img className="tv-login__logo" src="/brand/logo.png" alt="" />
          <h1 className="tv-login-welcome__title">Hoş geldin</h1>
          <p className="tv-subtle">Profiller açılıyor…</p>
        </div>
      )}
    </TvScreen>
  )
}
