/**
 * Sahte API: gerçek sunucunun KÜÇÜK bir taklidi (kimlik, alanlar, davetler, eşitleme). Eşitleme mantığı shared'daki
 * başvuru sunucusu MemoryServer'dan gelir; geri kalanı ekran testlerine yetecek kadar basittir.
 * Her "cihaz" kendi çerez kavanozuyla (oturumuyla) `device()` üzerinden kurulur; arka uç ortaktır.
 *
 * Gerçek API ile birebir aynı değildir (ör. şifre kuralları basit); gerçek davranış uçtan uca testlerde denenir.
 */
import { API_PATHS, AppError, ERROR_STATUS, uuidv7, type Invite, type User, type WorkspaceInfo } from '@uygulama/shared'
import { MemoryServer } from '@uygulama/shared/testing'
import { ApiClient } from '../../src/lib/api.ts'

interface Account {
  user: User
  password: string
  personalWorkspaceId: string
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function fail(error: AppError): Response {
  return json(error.toBody(), ERROR_STATUS[error.code])
}

export class FakeBackend {
  readonly server = new MemoryServer()
  readonly accounts = new Map<string, Account>()
  readonly names = new Map<string, string>()
  readonly invites = new Map<string, { workspaceId: string; role: Invite['role']; by: string }>()
  private readonly syncClients = new Map<string, string>()
  /** true iken her istek ağ hatasıyla düşer (çevrimdışı). */
  offline = false

  /** Doğrudan kullanıcı açar (kayıt ekranından geçmeden). */
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
    this.names.set(personalWorkspaceId, 'Kişisel')
    return account
  }

  workspacesOf(userId: string): WorkspaceInfo[] {
    let clientId = this.syncClients.get(userId)
    if (!clientId) {
      clientId = uuidv7()
      this.syncClients.set(userId, clientId)
    }
    const response = this.server.sync(userId, { protocolVersion: 1, clientId, cursors: {}, mutations: [] })
    return response.workspaces.map((workspace) => ({
      ...workspace,
      name: this.names.get(workspace.id) ?? workspace.name,
    }))
  }

  /** Bir cihazın `fetch`i (kendi oturumuyla) ve onu kullanan API istemcisi. */
  device(): { api: ApiClient; fetch: typeof fetch; signedInAs: () => User | null } {
    let current: Account | null = null
    const handle = async (method: string, path: string, body: Record<string, unknown>): Promise<Response> => {
      const authed = () => {
        if (!current) throw new AppError('unauthorized')
        return current
      }
      if (method === 'POST' && path === API_PATHS.register) {
        const email = String(body.email).trim()
        if (this.accounts.has(email)) throw new AppError('email_taken')
        current = this.createAccount(email, String(body.password), String(body.name))
        return json({ user: current.user }, 201)
      }
      if (method === 'POST' && path === API_PATHS.login) {
        const account = this.accounts.get(String(body.email).trim())
        if (!account || account.password !== body.password) throw new AppError('invalid_credentials')
        current = account
        return json({ user: account.user })
      }
      if (method === 'POST' && (path === API_PATHS.logout || path === API_PATHS.logoutAll)) {
        current = null
        return json({ ok: true })
      }
      if (method === 'GET' && path === API_PATHS.me) return json({ user: authed().user })
      if (method === 'POST' && path === API_PATHS.forgotPassword) return json({ ok: true })
      if (method === 'POST' && path === API_PATHS.changePassword) {
        const account = authed()
        if (body.currentPassword !== account.password)
          throw new AppError('invalid_credentials', undefined, [{ path: 'currentPassword', message: 'Şifre yanlış.' }])
        account.password = String(body.newPassword)
        return json({ ok: true })
      }
      if (method === 'PATCH' && path === API_PATHS.account) {
        const account = authed()
        account.user = { ...account.user, name: String(body.name) }
        return json({ user: account.user })
      }
      if (method === 'POST' && path === API_PATHS.sync) return json(this.server.sync(authed().user.id, body))
      if (method === 'GET' && path === API_PATHS.workspaces)
        return json({ workspaces: this.workspacesOf(authed().user.id) })
      if (method === 'POST' && path === API_PATHS.workspaces) {
        const account = authed()
        const id = this.server.createWorkspace(account.user.id, String(body.name))
        this.names.set(id, String(body.name))
        const workspace = this.workspacesOf(account.user.id).find((item) => item.id === id)
        return json({ workspace }, 201)
      }
      const invitesMatch = /^\/api\/workspaces\/([^/]+)\/invites$/.exec(path)
      if (method === 'POST' && invitesMatch?.[1]) {
        const token = `davet-${uuidv7()}`
        this.invites.set(token, {
          workspaceId: invitesMatch[1],
          role: body.role as Invite['role'],
          by: authed().user.name,
        })
        const expiresAt = new Date(Date.now() + 86_400_000).toISOString()
        return json({ invite: { token, role: body.role, expiresAt } }, 201)
      }
      const previewMatch = /^\/api\/invites\/([^/]+)$/.exec(path)
      if (method === 'GET' && previewMatch?.[1] && previewMatch[1] !== 'accept') {
        const invite = this.invites.get(decodeURIComponent(previewMatch[1]))
        if (!invite) throw new AppError('invalid_token')
        const expiresAt = new Date(Date.now() + 86_400_000).toISOString()
        return json({
          workspaceName: this.names.get(invite.workspaceId),
          role: invite.role,
          invitedBy: invite.by,
          expiresAt,
        })
      }
      if (method === 'POST' && path === API_PATHS.acceptInvite) {
        const account = authed()
        const invite = this.invites.get(String(body.token))
        if (!invite) throw new AppError('invalid_token')
        this.invites.delete(String(body.token))
        this.server.setMember(invite.workspaceId, account.user.id, invite.role)
        const workspace = this.workspacesOf(account.user.id).find((item) => item.id === invite.workspaceId)
        return json({ workspace })
      }
      if (path === API_PATHS.events) return json({ error: { code: 'not_found', message: 'yok' } }, 404)
      throw new AppError('not_found')
    }

    const fetchFn: typeof fetch = async (input, init) => {
      if (this.offline) throw new TypeError('Failed to fetch')
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        'http://test',
      )
      const raw = typeof init?.body === 'string' ? init.body : null
      const body = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>
      try {
        return await handle(init?.method ?? 'GET', url.pathname, body)
      } catch (error) {
        if (error instanceof AppError) return fail(error)
        throw error
      }
    }
    const api = new ApiClient({ baseUrl: '', authMode: 'cookie', fetch: fetchFn })
    return { api, fetch: fetchFn, signedInAs: () => current?.user ?? null }
  }
}
