/**
 * anka — SPA kökü: açılış bağlamı, HashRouter, yol tablosu, korumalar, kabuk.
 *
 * Yol tablosu (sabit):
 *   /                         → son kullanılan mod (/film-dizi ya da /canli)
 *   /karsilama                → WelcomePage (anonim)
 *   /profiller                → ProfileGatePage ("Kim izliyor?")
 *   /film-dizi /canli /rehber /ara?q= /kitaplik
 *   /detay/:videoId /koleksiyon/:collectionId /kisi/:personId /tur/:genreId
 *   /izle/:viewableId         → oynatıcı, kabuksuz (tam ekran)
 *   /_tasarim                 → tasarım sistemi galerisi (görsel QA)
 * Korumalar: üye değilse /karsilama; profil seçilmediyse /profiller.
 */
import { lazy, useEffect, useLayoutEffect, type ReactElement, type ReactNode } from 'react'
import { HashRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ErrorState, ToastHost } from '../design'
import { DevtoolsPanel } from '../devtools'
import { startNetworkProbing } from '../player'
import { installEventFlushOnExit } from '../telemetry/logger'
import { lastModePath } from './mode'
import { PagePlaceholder } from './PagePlaceholder'
import { RouteEffects } from './RouteEffects'
import { RouteFrame } from './RouteFrame'
import { setSessionNavigator, useSession } from './sessionStore'
import { Shell } from './Shell'
import './shell.css'

/* ───────────── Tembel sayfalar ───────────── */

const WelcomePage = lazy(() => import('../features/welcome').then((m) => ({ default: m.WelcomePage })))
const ProfileGatePage = lazy(() => import('../features/profiles').then((m) => ({ default: m.ProfileGatePage })))
const HomePage = lazy(() => import('../features/home').then((m) => ({ default: m.HomePage })))
const LiveHomePage = lazy(() => import('../features/live').then((m) => ({ default: m.LiveHomePage })))
const GuidePage = lazy(() => import('../features/guide').then((m) => ({ default: m.GuidePage })))
const SearchPage = lazy(() => import('../features/search').then((m) => ({ default: m.SearchPage })))
const LibraryPage = lazy(() => import('../features/library').then((m) => ({ default: m.LibraryPage })))
const DetailPage = lazy(() => import('../features/detail').then((m) => ({ default: m.DetailPage })))
const CollectionPage = lazy(() => import('../features/browse').then((m) => ({ default: m.CollectionPage })))
const PersonPage = lazy(() => import('../features/browse').then((m) => ({ default: m.PersonPage })))
const GenrePage = lazy(() => import('../features/browse').then((m) => ({ default: m.GenrePage })))
const WatchPage = lazy(() => import('../player').then((m) => ({ default: m.WatchPage })))
const DesignGallery = lazy(() => import('../design/Gallery').then((m) => ({ default: m.DesignGallery })))

/* ───────────── Korumalar ───────────── */

let profileServicesStarted = false
/** Profil seçildikten sonra bir kez: FTL ağ yoklaması + çıkışta olay boşaltma. */
function startProfileServices(): void {
  if (profileServicesStarted) return
  profileServicesStarted = true
  startNetworkProbing()
  installEventFlushOnExit()
}

/** Üye + seçili profil ister. */
function RequireProfile(): ReactElement {
  const boot = useSession((s) => s.boot)
  const ready = boot?.membershipStatus === 'CURRENT_MEMBER' && !!boot.activeProfile
  useEffect(() => {
    if (ready) startProfileServices()
  }, [ready])
  if (!boot || boot.membershipStatus !== 'CURRENT_MEMBER') return <Navigate to="/karsilama" replace />
  if (!boot.activeProfile) return <Navigate to="/profiller" replace />
  return <Outlet />
}

/** Yalnız üye ister (profil kapısı). */
function RequireMember({ children }: { children: ReactNode }): ReactElement {
  const boot = useSession((s) => s.boot)
  if (!boot || boot.membershipStatus !== 'CURRENT_MEMBER') return <Navigate to="/karsilama" replace />
  return <>{children}</>
}

/** Üye zaten girişliyse karşılamayı atlar. */
function AnonymousOnly({ children }: { children: ReactNode }): ReactElement {
  const boot = useSession((s) => s.boot)
  if (boot?.membershipStatus === 'CURRENT_MEMBER') return <Navigate to={boot.activeProfile ? lastModePath() : '/profiller'} replace />
  return <>{children}</>
}

function LastMode(): ReactElement {
  return <Navigate to={lastModePath()} replace />
}

/** Depo eylemlerinin (giriş, çıkış, profil) yönlendirebilmesi için. */
function NavigatorBridge(): null {
  const navigate = useNavigate()
  useLayoutEffect(() => {
    setSessionNavigator((to, opts) => navigate(to, opts))
    return () => setSessionNavigator(null)
  }, [navigate])
  return null
}

function NotFound(): ReactElement {
  const { pathname } = useLocation()
  return <PagePlaceholder title={`Bu sayfa bulunamadı: ${pathname}`} />
}

/* ───────────── Kök ───────────── */

function AppRoutes(): ReactElement {
  return (
    <Routes>
      <Route
        path="/karsilama"
        element={
          <AnonymousOnly>
            <RouteFrame>
              <WelcomePage />
            </RouteFrame>
          </AnonymousOnly>
        }
      />
      <Route
        path="/profiller"
        element={
          <RequireMember>
            <RouteFrame>
              <ProfileGatePage />
            </RouteFrame>
          </RequireMember>
        }
      />
      <Route
        path="/_tasarim"
        element={
          <RouteFrame>
            <DesignGallery />
          </RouteFrame>
        }
      />
      <Route element={<RequireProfile />}>
        <Route
          path="/izle/:viewableId"
          element={
            <RouteFrame>
              <WatchPage />
            </RouteFrame>
          }
        />
        <Route element={<Shell />}>
          <Route index element={<LastMode />} />
          <Route path="/film-dizi" element={<HomePage />} />
          <Route path="/canli" element={<LiveHomePage />} />
          <Route path="/rehber" element={<GuidePage />} />
          <Route path="/ara" element={<SearchPage />} />
          <Route path="/kitaplik" element={<LibraryPage />} />
          <Route path="/detay/:videoId" element={<DetailPage />} />
          <Route path="/koleksiyon/:collectionId" element={<CollectionPage />} />
          <Route path="/kisi/:personId" element={<PersonPage />} />
          <Route path="/tur/:genreId" element={<GenrePage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  )
}

export function App(): ReactElement {
  const status = useSession((s) => s.status)
  const init = useSession((s) => s.init)

  useEffect(() => {
    void init()
  }, [init])

  if (status === 'loading') {
    return (
      <div className="tvp-splash" role="status" aria-label="TV+ açılıyor">
        <img src="/brand/logo.png" alt="" />
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="tvp-splash">
        <ErrorState size="page" title="TV+ açılamadı" message="Sunucuya ulaşılamadı. Bağlantını kontrol et." onRetry={() => void init()} />
      </div>
    )
  }
  return (
    <HashRouter>
      <NavigatorBridge />
      <RouteEffects />
      <AppRoutes />
      <ToastHost />
      <DevtoolsPanel />
    </HashRouter>
  )
}
