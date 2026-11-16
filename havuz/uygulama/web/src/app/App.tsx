/**
 * Uygulamanın kökü: sağlayıcılar (oturum, bildirim) + yönlendirici + rotalar.
 * Rotalar app/routes.tsx'ten gelir; burada yalnız düzen (kabuklu / sade) ve erişim kuralları uygulanır.
 *
 * Testlerde `AppProviders` + `MemoryRouter` + `AppRoutes` birlikte kullanılır (bkz. test/helpers/render.tsx).
 * Genişletme: yeni bir genel sağlayıcı (ör. tema) → `AppProviders` içine ekleyin.
 */
import { useEffect, type ReactNode } from 'react'
import { HashRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router'
import { t } from '../i18n/index.ts'
import type { ApiClient } from '../lib/api.ts'
import { SessionProvider } from '../lib/session/SessionProvider.tsx'
import { useSession } from '../lib/session/context.ts'
import { ToastProvider } from '../ui/index.ts'
import { APP } from './config.ts'
import { ErrorBoundary } from './ErrorBoundary.tsx'
import { NotFoundPage } from './NotFoundPage.tsx'
import { PwaNotices } from './PwaNotices.tsx'
import { activeRoutes, type AppRoute } from './routes.tsx'
import { Shell } from './Shell.tsx'
import { useRouteFocus } from './useRouteFocus.ts'

/** Sekme başlığı + erişim denetimi. */
function RouteGate({ route }: { route: AppRoute }) {
  const { state, loggedOut } = useSession()
  const location = useLocation()
  useEffect(() => {
    document.title = `${t(route.title)} · ${APP.name}`
  }, [route.title])

  const access = route.access ?? 'all'
  if (state.status === 'loading') return null
  const account = state.status === 'account'
  if ((access === 'account' || access === 'admin') && !account) {
    if (loggedOut) return <Navigate to="/" replace />
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/giris?next=${encodeURIComponent(next)}`} replace />
  }
  if (access === 'admin' && !(account && state.session.user.role === 'admin')) return <NotFoundPage />
  if (access === 'guest' && account) return <Navigate to="/gorevler" replace />
  return route.element
}

/** Oturum ekranları için sade düzen (odak yönetimiyle). */
function PlainLayout() {
  useRouteFocus()
  return <Outlet />
}

export function AppRoutes() {
  const { api } = useSession()
  const routes = activeRoutes({ dev: import.meta.env.DEV, apiEnabled: api !== null })
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Navigate to="/gorevler" replace />} />
        {routes
          .filter((route) => (route.layout ?? 'app') === 'app')
          .map((route) => (
            <Route key={route.path} path={route.path} element={<RouteGate route={route} />} />
          ))}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route element={<PlainLayout />}>
        {routes
          .filter((route) => route.layout === 'plain')
          .map((route) => (
            <Route key={route.path} path={route.path} element={<RouteGate route={route} />} />
          ))}
      </Route>
    </Routes>
  )
}

export function AppProviders({ api, children }: { api?: ApiClient | null; children: ReactNode }) {
  return (
    <ErrorBoundary>
      <SessionProvider {...(api === undefined ? {} : { api })}>
        <ToastProvider>{children}</ToastProvider>
      </SessionProvider>
    </ErrorBoundary>
  )
}

export function App() {
  return (
    <AppProviders>
      <HashRouter>
        <AppRoutes />
        <PwaNotices />
      </HashRouter>
    </AppProviders>
  )
}
