/**
 * ROTA KAYDI: uygulamanın bütün sayfaları burada, tek listede. Gezinme menüsü ve sekme başlığı da buradan üretilir.
 * Adresler HashRouter iledir: `https://ornek.app/#/gorevler`.
 *
 * Alanlar:
 *   path     adres (Türkçe, küçük harf, ASCII: `/gorevler/:id`)
 *   title    sekme başlığı ve gezinme adı (sözlük anahtarı)
 *   element  sayfa bileşeni
 *   access   'all' (herkes) · 'account' (giriş gerekli) · 'admin' · 'guest' (yalnız girişsiz: giriş/kayıt ekranları)
 *   layout   'app' (gezinmeli kabuk) · 'plain' (ortada tek kart: oturum ekranları)
 *   needsApi `true` → hesapsız derlemede (VITE_API_URL=none) bu sayfa yoktur
 *   nav      gezinmede görünsün mü: simge + sıra; `mobile: true` alt çubukta da görünür (en çok 5)
 *   devOnly  yalnız geliştirmede (ör. bileşen kataloğu)
 *
 * Genişletme: yeni sayfa → `npm run gen -- page <ad>` ya da aşağıya bir satır ekleyin (kural testi
 * test/rules/routes.test.ts her sayfanın burada kayıtlı olduğunu ve başlığının sözlükte bulunduğunu denetler).
 */
import { House, Layers, ListChecks, Settings, Trash, UserRound, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { MessageKey } from '../i18n/index.ts'
import { AccountPage } from '../features/account/AccountPage.tsx'
import { LoginPage } from '../features/auth/LoginPage.tsx'
import { MigratePage } from '../features/auth/MigratePage.tsx'
import { ForgotPasswordPage, ResetPasswordPage } from '../features/auth/PasswordPages.tsx'
import { RegisterPage } from '../features/auth/RegisterPage.tsx'
import { WelcomePage } from '../features/auth/WelcomePage.tsx'
import { CatalogPage } from '../features/catalog/CatalogPage.tsx'
import { AdminUsersPage } from '../features/settings/AdminUsersPage.tsx'
import { SettingsPage } from '../features/settings/SettingsPage.tsx'
import { ListsPage } from '../features/tasks/ListsPage.tsx'
import { TaskEditPage } from '../features/tasks/TaskEditPage.tsx'
import { TasksPage } from '../features/tasks/TasksPage.tsx'
import { TrashPage } from '../features/tasks/TrashPage.tsx'
import { InvitePage } from '../features/workspaces/InvitePage.tsx'
import { WorkspacePage } from '../features/workspaces/WorkspacePage.tsx'
import { WorkspacesPage } from '../features/workspaces/WorkspacesPage.tsx'
// YENİ SAYFA İÇE AKTARMASI BURAYA

export type RouteAccess = 'all' | 'account' | 'admin' | 'guest'

export interface AppRoute {
  readonly path: string
  readonly title: MessageKey
  readonly element: ReactNode
  readonly access?: RouteAccess
  readonly layout?: 'app' | 'plain'
  readonly needsApi?: boolean
  readonly nav?: { readonly icon: LucideIcon; readonly order: number; readonly mobile?: boolean }
  readonly devOnly?: boolean
}

export const ROUTES: readonly AppRoute[] = [
  { path: '/gorevler', title: 'nav.tasks', element: <TasksPage />, nav: { icon: House, order: 10, mobile: true } },
  { path: '/gorevler/:id', title: 'page.task', element: <TaskEditPage /> },
  { path: '/listeler', title: 'nav.lists', element: <ListsPage />, nav: { icon: ListChecks, order: 20, mobile: true } },
  { path: '/silinenler', title: 'nav.trash', element: <TrashPage />, nav: { icon: Trash, order: 60 } },
  {
    path: '/alanlar',
    title: 'nav.workspaces',
    element: <WorkspacesPage />,
    access: 'account',
    needsApi: true,
    nav: { icon: Layers, order: 30, mobile: true },
  },
  { path: '/alanlar/:id', title: 'page.workspace', element: <WorkspacePage />, access: 'account', needsApi: true },
  {
    path: '/ayarlar',
    title: 'nav.settings',
    element: <SettingsPage />,
    nav: { icon: Settings, order: 50, mobile: true },
  },
  {
    path: '/hesap',
    title: 'nav.account',
    element: <AccountPage />,
    access: 'account',
    needsApi: true,
    nav: { icon: UserRound, order: 40, mobile: true },
  },
  { path: '/yonetim', title: 'admin.title', element: <AdminUsersPage />, access: 'admin', needsApi: true },
  {
    path: '/hos-geldiniz',
    title: 'page.welcome',
    element: <WelcomePage />,
    access: 'guest',
    layout: 'plain',
    needsApi: true,
  },
  { path: '/giris', title: 'page.login', element: <LoginPage />, access: 'guest', layout: 'plain', needsApi: true },
  {
    path: '/kayit',
    title: 'page.register',
    element: <RegisterPage />,
    access: 'guest',
    layout: 'plain',
    needsApi: true,
  },
  {
    path: '/sifremi-unuttum',
    title: 'page.forgot',
    element: <ForgotPasswordPage />,
    access: 'guest',
    layout: 'plain',
    needsApi: true,
  },
  { path: '/sifre-sifirla', title: 'page.reset', element: <ResetPasswordPage />, layout: 'plain', needsApi: true },
  {
    path: '/hesaba-tasi',
    title: 'page.migrate',
    element: <MigratePage />,
    access: 'account',
    layout: 'plain',
    needsApi: true,
  },
  { path: '/davet', title: 'page.invite', element: <InvitePage />, layout: 'plain', needsApi: true },
  { path: '/katalog', title: 'catalog.title', element: <CatalogPage />, devOnly: true },
  // YENİ ROTA BURAYA
]

/** Bu derlemede etkin rotalar (geliştirme/yayın ve API varlığına göre süzülür). */
export function activeRoutes(options: { dev: boolean; apiEnabled: boolean }): AppRoute[] {
  return ROUTES.filter((route) => (options.dev || !route.devOnly) && (options.apiEnabled || !route.needsApi))
}
