import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, ApiError, onUnauthorized, setCsrfToken } from './api'
import { ROLE_SCOPES, type Role, type Scope, type Session, type User } from './types'

export interface AuthState {
  /** true until the initial /auth/me finished. */
  loading: boolean
  user: User | null
  scopes: Scope[]
  /** Set when the session ended on its own (401 from the API). */
  expired: boolean
  login: (email: string, password: string) => Promise<User>
  logout: () => Promise<void>
  has: (scope: Scope) => boolean
  isOperator: boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function isOperatorRole(role?: Role): boolean {
  return role === 'operator_admin' || role === 'operator_analyst'
}

export function homePath(user: User | null): string {
  if (!user) return '/giris'
  return isOperatorRole(user.role) ? '/operator' : '/kurum'
}

function scopesOf(s: Session): Scope[] {
  return s.scopes && s.scopes.length > 0 ? s.scopes : (ROLE_SCOPES[s.user.role] ?? [])
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [scopes, setScopes] = useState<Scope[]>([])
  const [expired, setExpired] = useState(false)

  const apply = useCallback((s: Session | null) => {
    setCsrfToken(s?.csrf_token ?? '')
    setUser(s?.user ?? null)
    setScopes(s ? scopesOf(s) : [])
  }, [])

  useEffect(() => {
    let alive = true
    api
      .me()
      .then((s) => alive && apply(s))
      .catch(() => alive && apply(null))
      .finally(() => alive && setLoading(false))
    onUnauthorized(() => {
      apply(null)
      setExpired(true)
    })
    return () => {
      alive = false
      onUnauthorized(null)
    }
  }, [apply])

  const login = useCallback(
    async (email: string, password: string) => {
      const s = await api.login(email, password)
      apply(s)
      setExpired(false)
      // Prefer the server's scope list when /auth/me answers; the role mapping is the fallback.
      try {
        const me = await api.me()
        apply(me)
      } catch (err) {
        if (!(err instanceof ApiError)) throw err
      }
      return s.user
    },
    [apply],
  )

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } catch {
      // The local session is cleared regardless of the server answer.
    } finally {
      apply(null)
      setExpired(false)
    }
  }, [apply])

  const value = useMemo<AuthState>(() => {
    const has = (scope: Scope) => scopes.includes(scope) || (scope === 'admin:read' && scopes.includes('admin'))
    return { loading, user, scopes, expired, login, logout, has, isOperator: isOperatorRole(user?.role) }
  }, [loading, user, scopes, expired, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
