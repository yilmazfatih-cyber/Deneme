/**
 * Uygulamanın kimliği ve ortam ayarları. Ayarlar derleme anında `app.config.ts` → `extra` alanından gelir
 * (expo-constants) ve burada şemayla doğrulanır: bozuk ya da eksik ayar uygulamayı çökertmez, hesapsız kipe düşer.
 *
 *   APP.id        → yerel veritabanı adlarının öneki (aynı telefonda iki uygulama karışmasın)
 *   API_CONFIG    → API adresi; `none` ise hesap ekranları gizlenir, veri yalnız telefonda kalır
 *
 * Genişletme: yeni bir derleme ayarı → app.config.ts `extra`'ya ekleyin, burada `extraSchema`'ya alan açın.
 */
import Constants from 'expo-constants'
import { z } from 'zod'

export const APP = {
  /** Depolama öneki (küçük harf, tire). Yayından sonra DEĞİŞTİRMEYİN: eski veritabanları bu adla durur. */
  id: 'havuz-mobil',
} as const

export type ApiConfig =
  | { readonly enabled: false; readonly reason: 'none' | 'invalid' }
  | { readonly enabled: true; readonly baseUrl: string }

/** `API_URL` değerini çözümler: boş ya da `none` → hesapsız; `http(s)://…` → o adres (sondaki `/` atılır). */
export function parseApiUrl(raw: unknown): ApiConfig {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (value === '' || value === 'none') return { enabled: false, reason: 'none' }
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return { enabled: false, reason: 'invalid' }
    return { enabled: true, baseUrl: url.href.replace(/\/+$/, '') }
  } catch {
    return { enabled: false, reason: 'invalid' }
  }
}

const extraSchema = z.object({ apiUrl: z.string().default('none') }).loose()

function readExtra(): z.infer<typeof extraSchema> {
  const parsed = extraSchema.safeParse(Constants.expoConfig?.extra ?? {})
  return parsed.success ? parsed.data : { apiUrl: 'none' }
}

/** Uygulamanın kullandığı API ayarı (derleme anında sabitlenir). */
export const API_CONFIG: ApiConfig = parseApiUrl(readExtra().apiUrl)

/** Uygulama sürümü (app.config.ts → version). */
export const APP_VERSION: string = Constants.expoConfig?.version ?? '0.0.0'
