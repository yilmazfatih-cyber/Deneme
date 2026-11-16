/**
 * Uygulama kabuğu: mobilde üst çubuk + alt gezinme, ≥1024 px'te yan menü. Geçerli çalışma alanını belirler ve
 * sayfalara `StoreProvider` ile verir; oturum süresi dolduysa uyarı şeridini, eşitleme bildirimlerini çizer.
 *
 * Genişletme: gezinmeye sayfa eklemek için routes.tsx'te rotaya `nav` verin (buraya dokunmayın).
 */
import { LogIn, UserRoundX } from 'lucide-react'
import { useMemo } from 'react'
import { Navigate, NavLink, Outlet } from 'react-router'
import { t } from '../i18n/index.ts'
import { useSession } from '../lib/session/context.ts'
import { useWorkspaceState } from '../lib/session/workspace.ts'
import { DbProvider, StoreProvider } from '../lib/store/context.tsx'
import { ButtonLink, cx, Spinner } from '../ui/index.ts'
import { SyncIndicator } from '../features/sync/SyncIndicator.tsx'
import { SyncNotices } from '../features/sync/SyncNotices.tsx'
import { WorkspaceSwitcher } from '../features/workspaces/WorkspaceSwitcher.tsx'
import { BrandMark } from './BrandMark.tsx'
import { APP } from './config.ts'
import { activeRoutes } from './routes.tsx'
import { useRouteFocus } from './useRouteFocus.ts'

interface NavItem {
  readonly to: string
  readonly label: string
  readonly icon: typeof LogIn
  readonly mobile: boolean
}

function useNavItems(): NavItem[] {
  const { state, api } = useSession()
  return useMemo(() => {
    const account = state.status === 'account'
    const items = activeRoutes({ dev: import.meta.env.DEV, apiEnabled: api !== null })
      .filter((route) => route.nav && (route.access !== 'account' || account))
      .toSorted((a, b) => (a.nav?.order ?? 0) - (b.nav?.order ?? 0))
      .map((route) => ({
        to: route.path,
        label: t(route.title),
        icon: route.nav?.icon ?? LogIn,
        mobile: route.nav?.mobile === true,
      }))
    if (!account && api) items.push({ to: '/giris', label: t('nav.login'), icon: LogIn, mobile: true })
    return items
  }, [state.status, api])
}

function SkipLink() {
  return (
    <a
      href="#ana-icerik"
      onClick={(event) => {
        event.preventDefault() // HashRouter: adres çubuğundaki # yola dokunmasın
        document.getElementById('ana-icerik')?.focus()
      }}
      className="sr-only z-50 rounded-xl bg-accent px-4 py-3 font-semibold text-accent-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
    >
      {t('nav.skip')}
    </a>
  )
}

export function Shell() {
  const session = useSession()
  const { state, api, welcomeDone } = session
  const { current, workspaces } = useWorkspaceState(state)
  const items = useNavItems()
  const mobileItems = items.filter((item) => item.mobile)
  useRouteFocus()

  if (state.status === 'loading' || (api && welcomeDone === undefined))
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner label={t('common.loading')} />
      </div>
    )
  if (api && state.status === 'guest' && welcomeDone === false) return <Navigate to="/hos-geldiniz" replace />

  const expired = state.status === 'account' && state.session.expired

  return (
    <DbProvider db={state.db}>
      <div className="min-h-dvh lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)]">
        <SkipLink />
        <aside className="hidden border-r border-line lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-6 lg:px-4 lg:py-6">
          <div className="flex items-center gap-2.5 px-2 text-lg font-extrabold tracking-tight">
            <BrandMark />
            {APP.name}
          </div>
          {current && !current.local && <WorkspaceSwitcher current={current} workspaces={workspaces} />}
          <nav aria-label={t('nav.main')}>
            <ul className="flex flex-col gap-1">
              {items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/gorevler' ? false : undefined}
                    className={({ isActive }) =>
                      cx(
                        'flex min-h-12 items-center gap-3 rounded-xl px-3 font-semibold transition-colors',
                        isActive ? 'bg-accent-soft text-accent-text' : 'text-muted hover:bg-surface-2 hover:text-ink',
                      )
                    }
                  >
                    <item.icon aria-hidden size={20} />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-auto flex flex-col gap-1 border-t border-line pt-4">
            <SyncIndicator />
            {state.status === 'account' && (
              <p className="truncate px-2.5 text-sm text-muted">{state.session.user.email}</p>
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-1 border-b border-line bg-canvas/90 px-2 backdrop-blur lg:hidden">
            <span className="px-1.5">
              <BrandMark size={28} />
            </span>
            <div className="min-w-0 flex-1">
              {current && !current.local ? (
                <WorkspaceSwitcher current={current} workspaces={workspaces} />
              ) : (
                <span className="px-1 text-lg font-extrabold tracking-tight">{APP.name}</span>
              )}
            </div>
            <SyncIndicator compact />
          </header>
          <main
            id="ana-icerik"
            tabIndex={-1}
            className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-[calc(var(--bottom-nav-height)+3rem)] outline-none sm:px-6 lg:px-10 lg:pt-10 lg:pb-16"
          >
            {expired && (
              <div
                role="status"
                className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl bg-warn-soft px-4 py-3 text-warn"
              >
                <UserRoundX aria-hidden size={22} />
                <p className="flex-1 font-medium">{t('account.expiredBanner')}</p>
                <ButtonLink
                  to={`/giris?eposta=${encodeURIComponent(state.session.user.email)}`}
                  variant="secondary"
                  icon={LogIn}
                >
                  {t('welcome.login')}
                </ButtonLink>
              </div>
            )}
            {current === undefined ? (
              <Spinner label={t('common.loading')} />
            ) : current === null ? (
              <Spinner label={t('workspace.preparing')} />
            ) : (
              <StoreProvider value={{ db: state.db, workspace: current }}>
                <Outlet />
                <SyncNotices />
              </StoreProvider>
            )}
          </main>
        </div>

        <nav
          aria-label={t('nav.main')}
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        >
          <ul className="mx-auto flex h-[var(--bottom-nav-height)] max-w-xl items-stretch justify-around px-1">
            {mobileItems.map((item) => (
              <li key={item.to} className="flex flex-1">
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    cx(
                      'flex min-h-12 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold transition-colors',
                      isActive ? 'text-accent-text' : 'text-muted hover:text-ink',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={cx(
                          'flex h-7 w-12 items-center justify-center rounded-full',
                          isActive && 'bg-accent-soft',
                        )}
                      >
                        <item.icon aria-hidden size={20} strokeWidth={isActive ? 2.4 : 2} />
                      </span>
                      {item.label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </DbProvider>
  )
}
