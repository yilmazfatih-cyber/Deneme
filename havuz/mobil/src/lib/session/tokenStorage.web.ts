/**
 * Belirtecin WEB derlemesindeki deposu: tarayıcının localStorage'ı. Web derlemesi bu temelde yalnız deneme ve
 * otomatik test içindir (telefondaki güvenli depo tarayıcıda yok). localStorage'ı sayfadaki her betik okuyabilir;
 * yayında web için havuz/uygulama'nın PWA'sını (çerezli oturum) kullanın. Ayrıntı: docs/KARARLAR.md → "Belirteç".
 *
 * Genişletme: tokenStorage.ts ile aynı arayüzü korur; ikisi birlikte değişir.
 */
import { APP } from '../../config.ts'
import type { TokenStorage } from './tokenStorage.ts'

const KEY = `${APP.id}.oturum`

export const tokenStorage: TokenStorage = {
  get: async () => globalThis.localStorage?.getItem(KEY) ?? null,
  set: async (token) => globalThis.localStorage?.setItem(KEY, token),
  remove: async () => globalThis.localStorage?.removeItem(KEY),
}
