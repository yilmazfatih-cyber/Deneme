/**
 * Tembel sayfa modülleri — dışa aktarım adları SABİTTİR (her ekip kendi modülünü bu adlarla doldurur).
 * Her sayfa ayrı parça olarak ilk ziyarette yüklenir.
 */
import { lazy } from 'react'

export const WelcomePage = lazy(() => import('../features/welcome').then((m) => ({ default: m.WelcomePage })))
export const ProfileGatePage = lazy(() => import('../features/profiles').then((m) => ({ default: m.ProfileGatePage })))
export const ManageProfilesPage = lazy(() =>
  import('../features/profiles').then((m) => ({ default: m.ManageProfilesPage })),
)
export const HomePage = lazy(() => import('../features/home').then((m) => ({ default: m.HomePage })))
export const CategoryPage = lazy(() => import('../features/browse').then((m) => ({ default: m.CategoryPage })))
export const CollectionPage = lazy(() => import('../features/browse').then((m) => ({ default: m.CollectionPage })))
export const PersonPage = lazy(() => import('../features/browse').then((m) => ({ default: m.PersonPage })))
export const GenrePage = lazy(() => import('../features/browse').then((m) => ({ default: m.GenrePage })))
export const NewPopularPage = lazy(() => import('../features/newpopular').then((m) => ({ default: m.NewPopularPage })))
export const MyListPage = lazy(() => import('../features/library').then((m) => ({ default: m.MyListPage })))
export const TitlePage = lazy(() => import('../features/detail').then((m) => ({ default: m.TitlePage })))
export const AccountHubPage = lazy(() => import('../features/account').then((m) => ({ default: m.AccountHubPage })))
export const SearchPage = lazy(() => import('../features/search').then((m) => ({ default: m.SearchPage })))
export const LiveHomePage = lazy(() => import('../features/live').then((m) => ({ default: m.LiveHomePage })))
export const GuidePage = lazy(() => import('../features/guide').then((m) => ({ default: m.GuidePage })))
export const RemotePage = lazy(() => import('../features/remote').then((m) => ({ default: m.RemotePage })))
export const DevicesPage = lazy(() => import('../features/remote').then((m) => ({ default: m.DevicesPage })))
export const PairPage = lazy(() => import('../features/pair').then((m) => ({ default: m.PairPage })))
export const ShowcasePage = lazy(() => import('../features/showcase').then((m) => ({ default: m.ShowcasePage })))
export const StudioPage = lazy(() => import('../features/studio').then((m) => ({ default: m.StudioPage })))
export const WatchPage = lazy(() => import('../player').then((m) => ({ default: m.WatchPage })))
export const TvApp = lazy(() => import('../tv').then((m) => ({ default: m.TvApp })))
export const UiGallery = lazy(() => import('../ui/Gallery').then((m) => ({ default: m.UiGallery })))
export const ShellDemoPage = lazy(() => import('./ShellDemo').then((m) => ({ default: m.ShellDemoPage })))
