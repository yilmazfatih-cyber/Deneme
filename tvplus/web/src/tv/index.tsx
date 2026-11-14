/**
 * TV uygulaması (10-foot). Dışa aktarım adı `TvApp` SABİT: uygulama kabuğu ekran biçimi 'tv' iken her yolda bunu
 * bağlar (HashRouter içinde). Yol kökü /tv; ayrıntı: ./shell/TvApp.tsx.
 *
 * TV ekiplerinin kullandığı yüzeyler:
 *   ./focus  odak motoru (FocusScope, useFocusable, useKeyInterceptor, focusManager)
 *   ./ui     ilkeller (TvScreen, TvRow, TvRowsViewport, TvCard, TvRail, TvDialog, …)
 *   ./shell  yollar (TV_PATHS, watchPath, titlePath…), registerTextTarget, oturum yardımcıları
 */
export { TvApp } from './shell/TvApp'
