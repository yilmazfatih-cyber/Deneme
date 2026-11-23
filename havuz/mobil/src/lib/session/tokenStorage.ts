/**
 * Belirtecin telefondaki deposu: expo-secure-store (iOS Keychain, Android Keystore ile şifreli).
 * `WHEN_UNLOCKED_THIS_DEVICE_ONLY`: telefon kilitliyken okunmaz ve yedekle başka telefona TAŞINMAZ.
 * Web derlemesi bunun yerine tokenStorage.web.ts'i kullanır (Metro `.web.ts` uzantısını kendisi seçer).
 *
 * Genişletme: başka bir gizli değer → aynı kalıpla yeni bir anahtar (KEY) ve nesne.
 */
import * as SecureStore from 'expo-secure-store'
import { APP } from '../../config.ts'

export interface TokenStorage {
  get(): Promise<string | null>
  set(token: string): Promise<void>
  remove(): Promise<void>
}

/** Anahtar yalnız harf, rakam, `.`, `-`, `_` içerebilir (expo-secure-store kuralı). */
const KEY = `${APP.id}.oturum`
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }

export const tokenStorage: TokenStorage = {
  get: () => SecureStore.getItemAsync(KEY, OPTIONS),
  set: (token) => SecureStore.setItemAsync(KEY, token, OPTIONS),
  remove: () => SecureStore.deleteItemAsync(KEY, OPTIONS),
}
