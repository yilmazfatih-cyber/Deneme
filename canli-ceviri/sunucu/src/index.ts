// Canlı Çeviri — geçici anahtar sunucusu (Cloudflare Worker, modül biçimi).
//
// Üretim girişi. Güven kökü burada, sabitlenmiş "Apple Root CA - G3" olarak verilir ve başka hiçbir yoldan
// değiştirilemez (bkz. kok.ts). Testler kendi köklerini `isleyiciOlustur` ile verir; bu giriş onu kabul etmez.

import type { Env } from './ayarlar'
import { APPLE_KOK_G3_DER } from './kok'
import { isleyiciOlustur } from './uygulama'

export { AbonelikSayaci, IpSayaci } from './sayac'

const isleyici = isleyiciOlustur({
  kokDer: APPLE_KOK_G3_DER,
  simdi: () => Date.now(),
  getir: (adres, secenekler) => fetch(adres, secenekler),
})

export default {
  fetch(istek: Request, env: Env): Promise<Response> {
    return isleyici(istek, env)
  },
} satisfies ExportedHandler<Env>
