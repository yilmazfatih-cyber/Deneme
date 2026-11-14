/**
 * TvApp — TV (10-foot) uygulamasının kabuğu. Uygulama kabuğu ekran biçimi 'tv' iken her yolda bunu bağlar
 * (HashRouter içinde). Yaptıkları:
 *   - rem ölçeği: bağlıyken html { font-size: calc(100vw / 120) }, kalkınca eski değer
 *   - FocusRoot + tek yerden tuş işleme; kabuğun tuşları: Geri (geçmiş / Ana Sayfa'da yan menü), Ana Sayfa, Ara, Rehber
 *   - /tv altında iç içe yollar; /tv dışındaki her yol TV karşılığına yönlenir
 *   - korumalar: üye değil → /tv/giris · profil yok → /tv/profiller
 *   - yan menü, sağ üstte saat, bildirim katmanı, /tv/ayarlar
 *   - profil seçilince deviceClient.start({ kind: 'TV' }), yol değiştikçe reportState({ screen }), komut yönlendirme
 */
import { useEffect, useLayoutEffect, useState, type ReactElement, type ReactNode } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { deviceClient } from '../../devices/client'
import { assetUrl } from '../../lib/assetBase'
import { TvDetail, TvEpisodes } from '../detail'
import { FocusRoot, useFocusEngine, useKeyInterceptor } from '../focus'
import { TvCategory, TvHome } from '../home'
import { TvMyList } from '../list'
import { TvGuide, TvLive } from '../live'
import { TvLogin } from '../login'
import { TvWatch } from '../player'
import { TvProfiles } from '../profiles'
import { TvRemote } from '../remote'
import { TvSearch } from '../search'
import {
  formatClock,
  openRail,
  TV_RAIL_SCOPE,
  TvButton,
  TvRail,
  TvScreen,
  TvScreenEdgeProvider,
  TvToastHost,
  tvToast,
  useNow,
  type TvRailItem,
} from '../ui'
import { createCommandRouter } from './commands'
import { playerRemote } from '../../player'
import {
  getPlayerRemote,
  isTvDeviceStarted,
  nowPlayingOf,
  startTvDevice,
  stopTvDevice,
  tvPlayerOwnsKeys,
} from './device'
import { categoryPath, deviceScreenOf, railSectionOf, TV_PATHS, tvRedirectFor } from './routes'
import { useHistoryTracker, useTvBack } from './history'
import { ensureBoot, useTvBoot } from './session'
import { TvSettings } from './TvSettings'
import { TvUiDemo, TvUiDemo2 } from './TvUiDemo'
import './shell.css'

/* ───────────── Kök: rem ölçeği ───────────── */

/** Bağlıyken 1 rem = ekran genişliği / 120 (1920 px'te 16 px). */
function useTvRemScale(): void {
  useLayoutEffect(() => {
    const html = document.documentElement
    const prevSize = html.style.fontSize
    const prevOverflow = document.body.style.overflow
    html.style.fontSize = 'calc(100vw / 120)'
    document.body.style.overflow = 'hidden'
    html.dataset.tv = ''
    return () => {
      html.style.fontSize = prevSize
      document.body.style.overflow = prevOverflow
      delete html.dataset.tv
    }
  }, [])
}

/* ───────────── Ortak parçalar ───────────── */

function TvClock(): ReactElement {
  const now = useNow(10_000)
  return (
    <div className="tv-clock" aria-label={`Saat ${formatClock(now)}`}>
      {formatClock(now)}
    </div>
  )
}

/** Kabuğun tuşları (en düşük öncelik): ekranlar ve pencereler işlemezse buraya düşer. */
function ShellKeys(): null {
  useHistoryTracker()
  const boot = useTvBoot()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const back = useTvBack()
  const ready = boot?.membershipStatus === 'CURRENT_MEMBER' && !!boot.activeProfile
  useKeyInterceptor((key) => {
    switch (key) {
      case 'BACK':
        if (pathname === TV_PATHS.login) return false
        if (pathname === TV_PATHS.profiles && !ready) return false
        back()
        return true
      case 'HOME':
        if (!ready) return false
        navigate(TV_PATHS.home)
        return true
      case 'SEARCH':
        if (!ready) return false
        navigate(TV_PATHS.search)
        return true
      case 'GUIDE':
        if (!ready) return false
        navigate(TV_PATHS.guide)
        return true
      default:
        return false
    }
  }, -100)
  return null
}

/** Cihaz istemcisi: profil seçilince başlat, yol değiştikçe ekranı bildir, komutları yönlendir. */
function DeviceLink(): null {
  const boot = useTvBoot()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const engine = useFocusEngine()
  const back = useTvBack()
  const member = boot?.membershipStatus === 'CURRENT_MEMBER'
  const ready = member && !!boot?.activeProfile

  useEffect(() => {
    if (ready) startTvDevice()
    else if (!member) stopTvDevice()
  }, [ready, member])

  useEffect(() => {
    if (ready && isTvDeviceStarted()) deviceClient.reportState({ screen: deviceScreenOf(pathname) })
  }, [ready, pathname])

  // Oynatma durumu (kumanda "Şu an TV'de" kartı); istemci saniyede en çok bir kez yollar.
  useEffect(() => {
    if (!ready) return
    let last: unknown = undefined
    const report = (): void => {
      const s = playerRemote.getState()
      if (s === last) return
      last = s
      if (isTvDeviceStarted()) deviceClient.reportState({ nowPlaying: nowPlayingOf(s) })
    }
    report()
    return playerRemote.subscribe(report)
  }, [ready])

  // Yönlendirici her işlemede yeniden kurulmasın: değişen bağımlılıklar referansla okunur.
  const depsRef = useRefValue({ navigate, back })
  const [router] = useState(() =>
    createCommandRouter({
      dispatchKey: (key) => engine.dispatchKey(key),
      navigate: (to) => depsRef.current.navigate(to),
      back: () => depsRef.current.back(),
      toast: (text, kind) => tvToast(text, { kind }),
      player: getPlayerRemote,
      sendCommand: (id, cmd) => deviceClient.sendCommand(id, cmd),
      deviceName: (id) => deviceClient.getState().devices.find((d) => d.deviceId === id)?.name ?? null,
    }),
  )

  useEffect(() => {
    if (!ready) return
    return deviceClient.onCommand((env) => router.handle(env))
  }, [ready, router])
  return null
}

/** Her işlemede güncellenen ref (geri çağırmaların son değerleri görmesi için). */
function useRefValue<T>(value: T): { current: T } {
  const [ref] = useState(() => ({ current: value }))
  ref.current = value
  return ref
}

/* ───────────── Korumalar ───────────── */

function MemberOnly({ children }: { children: ReactNode }): ReactElement {
  const boot = useTvBoot()
  if (boot?.membershipStatus !== 'CURRENT_MEMBER') return <Navigate to={TV_PATHS.login} replace />
  return <>{children}</>
}

function RequireProfile(): ReactElement {
  const boot = useTvBoot()
  if (boot?.membershipStatus !== 'CURRENT_MEMBER') return <Navigate to={TV_PATHS.login} replace />
  if (!boot.activeProfile) return <Navigate to={TV_PATHS.profiles} replace />
  return <Outlet />
}

function RedirectToTv(): ReactElement {
  const { pathname, search } = useLocation()
  return <Navigate to={tvRedirectFor(pathname, search)} replace />
}

/* ───────────── Yan menülü düzen ───────────── */

const RAIL: readonly { id: string; label: string; icon: TvRailItem['icon']; to: string; bottom?: boolean }[] = [
  { id: 'ara', label: 'Ara', icon: 'search', to: TV_PATHS.search },
  { id: 'ana', label: 'Ana Sayfa', icon: 'home', to: TV_PATHS.home },
  { id: 'canli', label: 'Canlı TV', icon: 'live', to: TV_PATHS.live },
  { id: 'diziler', label: 'Diziler', icon: 'shows', to: categoryPath('shows') },
  { id: 'filmler', label: 'Filmler', icon: 'movies', to: categoryPath('movies') },
  { id: 'yeni', label: 'Yeni ve Popüler', icon: 'newPopular', to: categoryPath('newPopular') },
  { id: 'listem', label: 'Listem', icon: 'list', to: TV_PATHS.myList },
  { id: 'ayarlar', label: 'Ayarlar', icon: 'settings', to: TV_PATHS.settings, bottom: true },
]

function MainLayout(): ReactElement {
  const engine = useFocusEngine()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const boot = useTvBoot()
  const active = railSectionOf(pathname)

  const go = (to: string): void => {
    if (to === pathname) engine.focusScreen()
    else navigate(to)
  }
  const items: TvRailItem[] = RAIL.map((r) => ({
    id: r.id,
    label: r.label,
    icon: r.icon,
    bottom: r.bottom,
    active: r.id === active,
    onSelect: () => go(r.to),
  }))
  const profile = boot?.activeProfile
  const close = (): void => {
    if (!engine.focusScreen()) engine.focusScope(TV_RAIL_SCOPE)
  }

  // Ana Sayfa'da işlenmeyen Geri yan menüyü açar (menü açıkken Geri'yi menü kendisi işler).
  useKeyInterceptor((key) => {
    if (key !== 'BACK' || pathname !== TV_PATHS.home || engine.isWithin(TV_RAIL_SCOPE)) return false
    return openRail(engine, active)
  }, -50)

  return (
    <div className="tv-main">
      <TvScreenEdgeProvider onEdge={(dir) => dir === 'left' && openRail(engine, active)}>
        <Outlet />
      </TvScreenEdgeProvider>
      <TvRail
        items={items}
        profile={
          profile
            ? { name: profile.name, avatarUrl: profile.avatarUrl, onSelect: () => navigate(TV_PATHS.profiles) }
            : null
        }
        onClose={close}
      />
    </div>
  )
}

/* ───────────── Açılış ───────────── */

function BootGate({ children }: { children: ReactNode }): ReactElement {
  const boot = useTvBoot()
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (boot) return
    let alive = true
    setFailed(false)
    ensureBoot().catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [boot, attempt])
  if (boot) return <>{children}</>
  if (!failed)
    return (
      <div className="tv-splash" role="status" aria-label="TV+ açılıyor">
        <img src={assetUrl('/brand/logo.png')} alt="" />
      </div>
    )
  return (
    <TvScreen id="acilis-hata" title="TV+ açılamadı">
      <div className="tv-splash tv-splash--error">
        <img src={assetUrl('/brand/logo.png')} alt="" />
        <h1 className="tv-heading">TV+ açılamadı</h1>
        <p className="tv-subtle">Sunucuya ulaşılamadı. Bağlantını kontrol et.</p>
        <TvButton id="acilis-hata:tekrar" label="Tekrar dene" onPress={() => setAttempt((n) => n + 1)} />
      </div>
    </TvScreen>
  )
}

function TvChrome(): ReactElement | null {
  const { pathname } = useLocation()
  if (pathname.startsWith('/tv/izle/')) return null
  return <TvClock />
}

/* ───────────── Kök bileşen ───────────── */

export function TvApp(): ReactElement {
  useTvRemScale()
  return (
    <FocusRoot keyboardSuspended={tvPlayerOwnsKeys}>
      <div className="tv-root">
        <BootGate>
          <ShellKeys />
          <DeviceLink />
          <Routes>
            {/* Giriş ekranı kendi korumasını yapar (onaydan sonra "Hoş geldin" gösterebilmek için). */}
            <Route path="/tv/giris" element={<TvLogin />} />
            <Route
              path="/tv/profiller"
              element={
                <MemberOnly>
                  <TvProfiles />
                </MemberOnly>
              }
            />
            <Route element={<RequireProfile />}>
              <Route path="/tv/izle/:viewableId" element={<TvWatch />} />
              <Route path="/tv/baslik/:videoId" element={<TvDetail />} />
              <Route path="/tv/baslik/:videoId/bolumler" element={<TvEpisodes />} />
              <Route element={<MainLayout />}>
                <Route path="/tv" element={<TvHome />} />
                <Route path="/tv/kategori/:category" element={<TvCategory />} />
                <Route path="/tv/ara" element={<TvSearch />} />
                <Route path="/tv/listem" element={<TvMyList />} />
                <Route path="/tv/canli" element={<TvLive />} />
                <Route path="/tv/rehber" element={<TvGuide />} />
                <Route path="/tv/ayarlar" element={<TvSettings />} />
                <Route path="/tv/kumanda" element={<TvRemote />} />
                <Route path="/tv/_ui" element={<TvUiDemo />} />
                <Route path="/tv/_ui/2" element={<TvUiDemo2 />} />
                <Route path="/tv/*" element={<Navigate to={TV_PATHS.home} replace />} />
              </Route>
            </Route>
            <Route path="*" element={<RedirectToTv />} />
          </Routes>
          <TvChrome />
        </BootGate>
        <TvToastHost />
      </div>
    </FocusRoot>
  )
}
