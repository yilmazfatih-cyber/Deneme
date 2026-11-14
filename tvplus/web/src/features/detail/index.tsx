/**
 * Başlık detayı — dışa aktarım adları SABİT (kabuk ve app/pages.ts yükler):
 *   DetailModalOutlet  masaüstü detay penceresi (`?jbv=<videoId>`), kabuk bir kez çizer
 *   TitlePage          mobil başlık sayfası (`/baslik/:videoId`)
 * Kişisel sayfalar (features/library, features/account) ortak parçaları buradan alır.
 */
export { DetailModalOutlet } from './DetailModal'
export { TitlePage } from './TitlePage'
