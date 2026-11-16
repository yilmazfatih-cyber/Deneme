/**
 * HTTP katmanının ortak türleri: Hono ortamı (`AppEnv`) ve oturumu açık kullanıcı.
 * Her modülün routes.ts dosyası `new Hono<AppEnv>()` ile başlar; `c.get('auth')` bu türleri döndürür.
 *
 * Genişletme: isteğe bağlı yeni bir bağlam değeri gerekiyorsa `Variables`'a ekleyin ve app.ts'te ilk ara katmanda
 * varsayılanını verin (`c.set(...)`).
 */
import type { ErrorCode, Role } from '@uygulama/shared'

/** Oturumu açık kullanıcı (veritabanı satırının uygulama içi hâli). */
export interface AuthUser {
  readonly id: string
  readonly email: string
  readonly name: string
  readonly role: Role
  readonly emailVerified: boolean
  readonly disabled: boolean
  readonly createdAt: string
  readonly lastSeenAt: string | null
}

export interface AuthSession {
  readonly id: string
  readonly expiresAt: string
}

export interface AuthState {
  readonly user: AuthUser
  readonly session: AuthSession
  /** Kimlik nereden geldi: çerez (tarayıcı) ya da `Authorization: Bearer` (başka alan adındaki istemci). */
  readonly method: 'cookie' | 'bearer'
}

/** @hono/node-server'ın verdiği bağlam (testlerde `app.request` ile boştur). */
export interface NodeBindings {
  readonly incoming?: { readonly socket?: { readonly remoteAddress?: string } }
}

export interface AppEnv {
  Bindings: NodeBindings
  Variables: {
    requestId: string
    /** İsteği yapanın IP adresi (TRUST_PROXY'ye göre). */
    ip: string
    auth: AuthState | null
    /** Oturum var ama kullanılamıyor (ör. hesap kapatılmış): korumalı uçlar bu kodla yanıt verir. */
    authError: ErrorCode | null
  }
}
