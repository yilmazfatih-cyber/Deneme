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
import type { ThemeChoice } from '../../ui/theme.tsx'
import type { StoredSession } from '../device/deviceStore.ts'
import type { LocalDb } from '../store/localDb.ts'
import type { SyncEngine, SyncEvent } from '../sync/engine.ts'
import { INITIAL_SYNC_STATUS, type SyncStatus } from '../sync/status.ts'

export type SessionState =
  | { readonly status: 'loading' }
  | { readonly status: 'guest'; readonly db: LocalDb }
  | {
      readonly status: 'account'
      readonly db: LocalDb
      readonly session: StoredSession
      /** Oturum süresi dolmuşsa `null` (eşitleme yeniden girişe dek durur). */
      readonly engine: SyncEngine | null
    }

export interface LogoutOptions {
  /** Bu cihazdaki hesap verisini de sil. */
  readonly deleteLocalData: boolean
}

export interface SessionApi {
  readonly state: SessionState
  /** API ayarlı mı (değilse hesap ekranları gizlenir). */
  readonly apiEnabled: boolean
  /** Karşılama ekranı geçildi mi. */
  readonly welcomeDone: boolean
  readonly theme: ThemeChoice
  /** Açılışta oluşan, uygulamayı durduran hata (veritabanı açılamadı vb.). */
  readonly fatal: Error | null
  readonly login: (input: LoginRequest) => Promise<User>
  readonly register: (input: RegisterRequest) => Promise<User>
  readonly logout: (options: LogoutOptions) => Promise<void>
  readonly deleteAccount: (password: string) => Promise<void>
  readonly forgotPassword: (email: string) => Promise<void>
  readonly finishWelcome: () => Promise<void>
  readonly setTheme: (choice: ThemeChoice) => Promise<void>
  /** Eşitleme olaylarını (red, erişim kaybı, reset…) dinler. */
  readonly subscribeSyncEvents: (listener: (event: SyncEvent) => void) => () => void
}

export const SessionContext = createContext<SessionApi | null>(null)

export function useSession(): SessionApi {
  const value = use(SessionContext)
  if (!value) throw new Error('useSession yalnız <SessionProvider> içinde kullanılabilir (src/app/_layout.tsx).')
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
