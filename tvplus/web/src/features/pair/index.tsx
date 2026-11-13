/**
 * TV'ye Bağlan (#/bagla?kod=KLMN-4821) — YER TUTUCU. Cihaz deneyimi ekibi dolduracak; dışa aktarım adı SABİT: PairPage.
 * UX_SPEC §5 "QR ile giriş": "Bu cihazda oturum açılsın mı? TV · Chrome" → Onayla / Reddet.
 * Kabuk bu sayfayı profil gerektirmeden, sade bir odak düzeninde (yalnız logo) açar; giriş yapılmamışsa önce
 * karşılama → giriş, ardından buraya geri dönülür.
 */
import type { ReactElement } from 'react'
import { PagePlaceholder } from '../../app'

export function PairPage(): ReactElement {
  return <PagePlaceholder title="TV'ye Bağlan" variant="grid" />
}
