/**
 * Uygulama ayarı (Expo): ad, kimlikler, sürüm, simgeler, açılış ekranı, izinler, eklentiler ve API adresi.
 * Mağazaya çıkmadan önce aşağıdaki "DEĞİŞTİRİN" satırlarını kendi bilgilerinizle değiştirin (docs/YAYINLAMA.md).
 *
 * Ortam değişkenleri (derleme/başlatma anında okunur; docs/AYARLAR.md):
 *   API_URL       API adresi: `https://api.ornek.com` ya da `none` (hesapsız; varsayılan). Geliştirmede telefondan
 *                 bilgisayara: `http://192.168.1.20:8310` (bilgisayarın yerel ağ adresi; 127.0.0.1 telefonda ÇALIŞMAZ)
 *   APP_VARIANT   `development` ise ad ve kimlik "(Geliştirme)" ekiyle ayrılır (iki sürüm aynı telefonda dursun)
 *
 * Genişletme: yeni bir derleme ayarı → `extra`'ya ekleyin, src/config.ts'te şemayla okuyun.
 */
import type { ConfigContext, ExpoConfig } from 'expo/config'

/** Simgelerin ve açılış ekranının zemin rengi (scripts/icons.ts → BRAND ile aynı). */
const BRAND_COLOR = '#0e6157'

const variant = process.env.APP_VARIANT === 'development' ? 'development' : 'production'
const suffix = variant === 'development' ? '.dev' : ''

function apiUrl(): string {
  const raw = (process.env.API_URL ?? 'none').trim()
  if (raw === '' || raw === 'none') return 'none'
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`API_URL geçersiz: "${raw}". Tam adres yazın (ör. https://api.ornek.com) ya da "none".`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`API_URL http ya da https ile başlamalı: "${raw}".`)
  }
  return url.href.replace(/\/+$/, '')
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  // DEĞİŞTİRİN: telefonda simgenin altında görünen ad (kısa tutun: ~12 karakter).
  name: variant === 'development' ? 'Yapıtaşı (Geliştirme)' : 'Yapıtaşı',
  // Expo projesinin kısa adı (EAS'ta proje adı). Küçük harf, tire.
  slug: 'havuz-mobil',
  // Kullanıcıya görünen sürüm. Her mağaza yayınında artırın (1.0.0 → 1.0.1). Derleme numaraları EAS'ta (eas.json).
  version: '0.1.0',
  orientation: 'portrait',
  // Derin bağlantı şeması: havuzmobil://tasks
  scheme: 'havuzmobil',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  ios: {
    // DEĞİŞTİRİN: ters alan adı biçiminde, dünyada tek (yayından sonra DEĞİŞMEZ).
    bundleIdentifier: `com.ornek.havuzmobil${suffix}`,
    supportsTablet: true,
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      // Yerel ağdaki geliştirme API'sine (http://192.168.…) bağlanabilmek için. Yayında API https olmalı.
      NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
    },
  },
  android: {
    // DEĞİŞTİRİN: iOS'takiyle aynı olabilir; yayından sonra DEĞİŞMEZ.
    package: `com.ornek.havuzmobil${suffix}`,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      monochromeImage: './assets/adaptive-icon-mono.png',
      backgroundColor: BRAND_COLOR,
    },
    // Uygulama hiçbir tehlikeli izin istemez (kamera, konum, kişiler yok). İnternet izni Expo'da varsayılandır.
    permissions: [],
    blockedPermissions: ['android.permission.RECORD_AUDIO', 'android.permission.SYSTEM_ALERT_WINDOW'],
    predictiveBackGestureEnabled: false,
  },
  web: {
    // Tek sayfa çıktısı: `expo export --platform web` → dist/index.html (yalnız deneme ve otomatik test için).
    output: 'single',
    bundler: 'metro',
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-sqlite',
    'expo-secure-store',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 160,
        backgroundColor: BRAND_COLOR,
        dark: { image: './assets/splash-icon.png', backgroundColor: BRAND_COLOR },
      },
    ],
  ],
  extra: {
    apiUrl: apiUrl(),
    // EAS projesine bağlanınca (`eas init`) buraya `eas: { projectId: '…' }` eklenir.
  },
})
