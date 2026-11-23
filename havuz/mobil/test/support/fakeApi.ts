/**
 * Sahte API: gerçek sunucunun KÜÇÜK bir taklidi (kimlik, belirteç kipi, eşitleme). Eşitleme mantığı shared'daki
 * başvuru sunucusu MemoryServer'dan gelir; geri kalanı ekran testlerine yetecek kadar basittir.
 * Gerçek API ile birebir aynı değildir (ör. şifre kuralları basit); gerçek davranış bütünleşme testinde denenir
 * (test/integration ve e2e/api.spec.ts). Kaynak: uygulama/web/test/helpers/fakeApi.ts (çerez yerine belirteç).
 */
import { API_PATHS, AppError, ERROR_STATUS, uuidv7, type User } from '@uygulama/shared'
import { MemoryServer } from '@uygulama/shared/testing'
import { ApiClient } from '../../src/lib/api/client.ts'

interface Account {
  user: User
  password: string
  personalWorkspaceId: string
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

export class FakeBackend {
  readonly server = new MemoryServer()
  readonly accounts = new Map<string, Account>()
  /** Belirteç → e-posta. */
  readonly tokens = new Map<string, string>()
  /** true iken her istek ağ hatasıyla düşer (çevrimdışı). */
  offline = false
  /** Eşitleme isteği sayısı. */
  syncCalls = 0
  /** Sıradaki eşitleme isteği bu hatayla düşer (bir kez). */
  failNextSync: AppError | null = null
  readonly forgotten: string[] = []

  createAccount(email: string, password: string, name = 'Ayşe'): Account {
    const { userId, personalWorkspaceId } = this.server.createUser(name)
    const user: User = {
      id: userId,
      email,
      name,
      role: 'user',
      emailVerified: true,
      createdAt: new Date().toISOString(),
    }
    const account = { user, password, personalWorkspaceId }
    this.accounts.set(email, account)
    return account
  }

  /** Doğrudan oturum açar (giriş ekranından geçmeden); belirteci döndürür. */
  issueToken(email: string): string {
    const token = `belirtec-${uuidv7()}`
    this.tokens.set(token, email)
    return token
  }

  private handle(method: string, path: string, body: Record<string, unknown>, token: string | null): Response {
    const authed = () => {
      const email = token ? this.tokens.get(token) : undefined
      const account = email ? this.accounts.get(email) : undefined
      if (!account) throw new AppError('unauthorized')
      return account
    }
    if (method === 'POST' && path === API_PATHS.register) {
      const email = String(body.email)
      if (this.accounts.has(email)) throw new AppError('email_taken')
      const account = this.createAccount(email, String(body.password), String(body.name))
      return json({ user: account.user, token: this.issueToken(email) }, 201)
    }
    if (method === 'POST' && path === API_PATHS.login) {
      const account = this.accounts.get(String(body.email))
      if (!account || account.password !== body.password) throw new AppError('invalid_credentials')
      return json({ user: account.user, token: this.issueToken(account.user.email) })
    }
    if (method === 'POST' && path === API_PATHS.logout) {
      if (token) this.tokens.delete(token)
      return json({ ok: true })
    }
    if (method === 'GET' && path === API_PATHS.me) return json({ user: authed().user })
    if (method === 'POST' && path === API_PATHS.forgotPassword) {
      this.forgotten.push(String(body.email))
      return json({ ok: true })
    }
    if (method === 'DELETE' && path === API_PATHS.account) {
      const account = authed()
      if (body.password !== account.password)
        throw new AppError('invalid_credentials', undefined, [{ path: 'password', message: 'Şifre yanlış.' }])
      this.accounts.delete(account.user.email)
      return json({ ok: true })
    }
    if (method === 'POST' && path === API_PATHS.sync) {
      this.syncCalls += 1
      const account = authed()
      if (this.failNextSync) {
        const error = this.failNextSync
        this.failNextSync = null
        throw error
      }
      return json(this.server.sync(account.user.id, body))
    }
    throw new AppError('not_found')
  }

  /** Belirteç kipinde çalışan API istemcisi (uygulamanın kullandığıyla aynı sınıf). */
  client(getToken?: () => string | null): ApiClient {
    const fetchFn: typeof fetch = async (input, init) => {
      if (this.offline) throw new TypeError('Network request failed')
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      const headers = (init?.headers ?? {}) as Record<string, string>
      const token = headers.Authorization?.replace(/^Bearer /, '') ?? null
      const raw = typeof init?.body === 'string' ? init.body : null
      try {
        return this.handle(
          init?.method ?? 'GET',
          url.pathname,
          (raw ? JSON.parse(raw) : {}) as Record<string, unknown>,
          token,
        )
      } catch (error) {
        if (error instanceof AppError) return json(error.toBody(), ERROR_STATUS[error.code])
        throw error
      }
    }
    return new ApiClient({ baseUrl: 'https://api.ornek.test', fetch: fetchFn, ...(getToken ? { getToken } : {}) })
  }
}
