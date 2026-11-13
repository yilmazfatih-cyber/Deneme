/**
 * anka — SPA kökü: açılış bağlamı, HashRouter, ekran biçimine göre kabuk, yol tablosu, korumalar.
 *
 * Ekran biçimi (web/src/lib/formFactor.ts):
 *   tv       → her yol <TvApp /> (TV ekiplerinin kendi yol ağacı; /* altında)
 *   desktop  → DesktopShell (üst menü, ?jbv= detay penceresi, alt bilgi)
 *   mobile   → MobileShell (üst çubuk + haplar, alt sekmeler, detay /baslik/:id)
 *
 * Yol tablosu (MIMARI §9.1):
 *   /karsilama  /profiller  /profiller/yonet                       kabuksuz
 *   /goz-at  /goz-at/diziler  /goz-at/filmler  /yeni-ve-populer  /listem  /canli  /rehber  /ara?q=
 *   /baslik/:videoId (mobil)  /tvplusim  /kumanda  /cihazlar  /kisi/:id  /tur/:id  /koleksiyon/:id   kabuklu
 *   /bagla?kod=     odak düzeni (yalnız logo; profil gerekmez)
 *   /izle/:viewableId  /vitrin  /_ui                                kabuksuz
 *   Eski yollar: /film-dizi → /goz-at · /detay/:id → ?jbv= (masaüstü) | /baslik/:id (mobil) · /kitaplik → /listem
 */
import { Suspense, useEffect, useLayoutEffect, type ReactElement, type ReactNode } from 'react'
import { HashRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { DevtoolsPanel } from '../devtools'
import { useFormFactor, type FormFactor } from '../lib/formFactor'
import { ErrorState, Logo, Spinner, ToastHost } from '../ui'
import { DesktopShell } from './DesktopShell'
import { Guard } from './Guards'
import { buildTitleHref } from './links'
import { MobileShell } from './MobileShell'
import * as P from './pages'
import { PagePlaceholder } from './PagePlaceholder'
import { RouteEffects } from './RouteEffects'
import { RouteFrame } from './RouteFrame'
import { useProfileServices } from './services'
import { setSessionNavigator, useSession } from './sessionStore'
import './shell.css'

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

/** Eski /detay/:id → bu ekran biçiminin detayı (tctx korunur). */
function LegacyDetail({ formFactor }: { formFactor: FormFactor }): ReactElement {
  const { videoId = '' } = useParams()
  const { search } = useLocation()
  const tctx = new URLSearchParams(search).get('tctx')
  return <Navigate to={buildTitleHref(formFactor, { pathname: '/goz-at', search: '' }, videoId, tctx)} replace />
}

/** Masaüstünde /baslik/:id → aynı başlığın penceresi (paylaşılan mobil bağlantılar). */
function TitleRoute({ formFactor }: { formFactor: FormFactor }): ReactElement {
  if (formFactor === 'mobile') return <P.TitlePage />
  return <LegacyDetail formFactor={formFactor} />
}

/** Kabuksuz tam sayfa çerçevesi (karşılama, profil kapısı, oynatıcı, vitrin, galeri). */
function Bare({ children, hero = false }: { children: ReactNode; hero?: boolean }): ReactElement {
  return (
    <Guard>
      <RouteFrame hero={hero}>{children}</RouteFrame>
    </Guard>
  )
}

/** /bagla: yalnız logo olan sade düzen (Netflix "tv8" etkinleştirme sayfası gibi). */
function FocusLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <Guard>
      <div className="app-focus">
        <header className="app-focus__head">
          <Link to="/goz-at" aria-label="TV+ Ana Sayfa">
            <Logo height={28} decorative />
          </Link>
        </header>
        <main className="app-focus__main" id="icerik">
          <RouteFrame hero={false}>{children}</RouteFrame>
        </main>
      </div>
    </Guard>
  )
}

function ShellRoutes({ formFactor }: { formFactor: 'desktop' | 'mobile' }): ReactElement {
  const shell = formFactor === 'mobile' ? <MobileShell /> : <DesktopShell />
  return (
    <Routes>
      <Route path="/karsilama" element={<Bare>{<P.WelcomePage />}</Bare>} />
      <Route path="/profiller" element={<Bare>{<P.ProfileGatePage />}</Bare>} />
      <Route path="/profiller/yonet" element={<Bare>{<P.ManageProfilesPage />}</Bare>} />
      <Route path="/izle/:viewableId" element={<Bare>{<P.WatchPage />}</Bare>} />
      <Route path="/vitrin" element={<Bare>{<P.ShowcasePage />}</Bare>} />
      <Route path="/_ui" element={<Bare>{<P.UiGallery />}</Bare>} />
      <Route path="/bagla" element={<FocusLayout>{<P.PairPage />}</FocusLayout>} />

      {/* Eski yollar */}
      <Route path="/film-dizi" element={<Navigate to="/goz-at" replace />} />
      <Route path="/kitaplik" element={<Navigate to="/listem" replace />} />
      <Route path="/detay/:videoId" element={<LegacyDetail formFactor={formFactor} />} />

      <Route element={<Guard>{shell}</Guard>}>
        <Route index element={<Navigate to="/goz-at" replace />} />
        <Route path="/goz-at" element={<P.HomePage />} />
        <Route path="/goz-at/diziler" element={<P.CategoryPage category="shows" />} />
        <Route path="/goz-at/filmler" element={<P.CategoryPage category="movies" />} />
        <Route path="/yeni-ve-populer" element={<P.NewPopularPage />} />
        <Route path="/listem" element={<P.MyListPage />} />
        <Route path="/canli" element={<P.LiveHomePage />} />
        <Route path="/rehber" element={<P.GuidePage />} />
        <Route path="/ara" element={<P.SearchPage />} />
        <Route path="/baslik/:videoId" element={<TitleRoute formFactor={formFactor} />} />
        <Route path="/tvplusim" element={<P.AccountHubPage />} />
        <Route path="/kumanda" element={<P.RemotePage />} />
        <Route path="/cihazlar" element={<P.DevicesPage />} />
        <Route path="/kisi/:personId" element={<P.PersonPage />} />
        <Route path="/tur/:genreId" element={<P.GenrePage />} />
        <Route path="/koleksiyon/:collectionId" element={<P.CollectionPage />} />
        <Route path="/_ui/kabuk" element={<P.ShellDemoPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

function Splash(): ReactElement {
  return (
    <div className="app-splash" role="status" aria-label="TV+ açılıyor">
      <Logo height={56} decorative />
      <Spinner size={36} />
    </div>
  )
}

export function App(): ReactElement {
  const status = useSession((s) => s.status)
  const init = useSession((s) => s.init)
  const formFactor = useFormFactor()
  useProfileServices(formFactor)

  useEffect(() => {
    void init()
  }, [init])

  // Kök öğeye ekran biçimi: biçimler (ör. TV'nin rem ölçeği) buna bağlanabilir.
  useEffect(() => {
    document.documentElement.dataset.formFactor = formFactor
  }, [formFactor])

  if (status === 'loading') return <Splash />
  if (status === 'error') {
    return (
      <div className="app-splash">
        <ErrorState
          size="page"
          title="TV+ açılamadı"
          message="Sunucuya ulaşılamadı. Bağlantını kontrol et."
          onRetry={() => void init()}
        />
      </div>
    )
  }

  if (formFactor === 'tv') {
    return (
      <HashRouter>
        <NavigatorBridge />
        <Suspense fallback={<Splash />}>
          <Routes>
            <Route path="/*" element={<P.TvApp />} />
          </Routes>
        </Suspense>
      </HashRouter>
    )
  }

  return (
    <HashRouter>
      <NavigatorBridge />
      <RouteEffects />
      <ShellRoutes formFactor={formFactor} />
      <ToastHost />
      <DevtoolsPanel />
    </HashRouter>
  )
}
