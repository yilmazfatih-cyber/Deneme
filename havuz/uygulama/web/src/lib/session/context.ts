/**
 * Oturum bağlamının türleri ve okuma kancaları. Sağlayıcı: SessionProvider.tsx.
 *
 *   const { state, login, logout } = useSession()
 *   state.status: 'loading' | 'guest' | 'account'
 *
 * Genişletme: yeni bir oturum işlemi → `SessionApi`'ye ekleyin, SessionProvider.tsx'te gerçekleyin.
 */
import { createContext, use, useSyncExternalStore } from 'react'
import type { LoginRequest, RegisterRequest, User } from '@uygulama/shared'
import type { ApiClient } from '../api.ts'
import type { AppDb } from '../store/db.ts'
import type { SyncEngine, SyncEvent } from '../sync/engine.ts'
import { INITIAL_SYNC_STATUS, type SyncStatus } from '../sync/status.ts'
import type { StoredSession } from './store.ts'

export type SessionState =
  | { readonly status: 'loading' }
  | { readonly status: 'guest'; readonly db: AppDb }
  | {
      readonly status: 'account'
      readonly db: AppDb
      readonly session: StoredSession
      /** Oturum süresi dolmuşsa `null` (eşitleme yeniden girişe dek durur). */
      readonly engine: SyncEngine | null
    }

export interface LogoutOptions {
  /** Bu cihazdaki hesap verisini de sil. */
  readonly deleteLocalData: boolean
  /** Bütün cihazlardaki oturumları kapat (çevrimiçi olmayı gerektirir). */
  readonly everywhere?: boolean
}

export interface SessionApi {
  readonly state: SessionState
  /** API istemcisi; hesapsız derlemede (`VITE_API_URL=none`) `null`. */
  readonly api: ApiClient | null
  /** Karşılama ekranı geçildi mi (yüklenirken `undefined`). */
  readonly welcomeDone: boolean | undefined
  /** Bu sekmede kullanıcı az önce çıkış yaptı (hesap sayfası girişe değil ana sayfaya yönlensin). */
  readonly loggedOut: boolean
  login(input: LoginRequest): Promise<User>
  register(input: RegisterRequest): Promise<User>
  logout(options: LogoutOptions): Promise<void>
  deleteAccount(password: string): Promise<void>
  updateUser(user: User): Promise<void>
  finishWelcome(): Promise<void>
  /** Eşitleme olaylarını (red, erişim kaybı, reset…) dinler. */
  subscribeSyncEvents(listener: (event: SyncEvent) => void): () => void
}

export const SessionContext = createContext<SessionApi | null>(null)

export function useSession(): SessionApi {
  const value = use(SessionContext)
  if (!value) throw new Error('useSession yalnız <SessionProvider> içinde kullanılabilir.')
  return value
}

const noop = () => () => {}
const initial = () => INITIAL_SYNC_STATUS

/** Eşitleme durumu (hesapsız kipte hep başlangıç durumu). */
export function useSyncStatus(): SyncStatus {
  const { state } = useSession()
  const engine = state.status === 'account' ? state.engine : null
  return useSyncExternalStore(engine?.status.subscribe ?? noop, engine?.status.getState ?? initial, initial)
}
