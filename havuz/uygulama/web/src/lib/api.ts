/**
 * API istemcisi: `shared`daki adresler (API_PATHS) ve şemalarla tipli `fetch`.
 *  - Başarılı yanıt şemayla doğrulanır; uymazsa `AppError('internal')`.
 *  - Hata gövdesi `{ error: { code, message } }` → `AppError` (kod, Türkçe ileti, ayrıntı).
 *  - Sunucuya ulaşılamazsa (çevrimdışı, zaman aşımı, ağ geçidi hatası) → `NetworkError`.
 *  - Kimlik: çerez kipinde tarayıcı çerezi taşır; belirteç kipinde `Authorization: Bearer` eklenir.
 *
 * Genişletme (yeni uç): şemayı ve adresi shared/src/api.ts'e, çağrıyı aşağıya bir yöntem olarak ekleyin.
 * Yöntem adları uç adlarıyla aynıdır (API_PATHS.login → api.login).
 */
import {
  adminMetricsResponseSchema,
  adminUserResponseSchema,
  adminUsersResponseSchema,
  API_PATHS,
  AppError,
  authResponseSchema,
  errorBodySchema,
  HEADERS,
  inviteResponseSchema,
  invitePreviewSchema,
  memberResponseSchema,
  membersResponseSchema,
  meResponseSchema,
  syncResponseSchema,
  workspaceResponseSchema,
  workspacesResponseSchema,
  type AdminUpdateUserRequest,
  type ChangePasswordRequest,
  type CreateInviteRequest,
  type ErrorCode,
  type LoginRequest,
  type RegisterRequest,
  type SyncRequest,
  type UpdateMemberRequest,
} from '@uygulama/shared'
import { z } from 'zod'
import { APP_VERSION, type AuthMode } from './env.ts'
import { NetworkError } from './errors.ts'

export interface ApiClientOptions {
  /** API kökü; aynı kökende boş dizgi. */
  readonly baseUrl: string
  readonly authMode: AuthMode
  /** Belirteç kipinde geçerli belirteci verir. */
  readonly getToken?: () => string | null
  readonly fetch?: typeof fetch
  readonly timeoutMs?: number
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

interface RequestOptions<S extends z.ZodType | undefined> {
  readonly body?: unknown
  readonly schema?: S
  readonly signal?: AbortSignal
  /** Giriş/kayıt gibi uçlarda belirteç kipini sunucuya bildir. */
  readonly wantToken?: boolean
}

type Parsed<S> = S extends z.ZodType ? z.output<S> : undefined

const STATUS_CODES: Record<number, ErrorCode> = {
  400: 'validation',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'payload_too_large',
  426: 'upgrade_required',
  429: 'rate_limited',
}

/** Davet önizlemesi `{ invite: … }` ya da doğrudan önizleme olarak gelebilir; ikisi de kabul edilir. */
const invitePreviewResponseSchema = z.union([
  z.object({ invite: invitePreviewSchema }).transform((value) => value.invite),
  invitePreviewSchema,
])

/** Davet kabulü: yanıtta alan bilgisi varsa kimliği alınır (yoksa eşitleme sonrası bulunur). */
const acceptInviteResponseSchema = z
  .object({ workspace: z.object({ id: z.string() }).optional(), workspaceId: z.string().optional() })
  .transform((value) => value.workspace?.id ?? value.workspaceId ?? null)

export class ApiClient {
  readonly authMode: AuthMode
  private readonly baseUrl: string
  private readonly getToken: () => string | null
  private readonly fetchFn: typeof fetch
  private readonly timeoutMs: number

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl
    this.authMode = options.authMode
    this.getToken = options.getToken ?? (() => null)
    this.fetchFn = options.fetch ?? ((input, init) => globalThis.fetch(input, init))
    this.timeoutMs = options.timeoutMs ?? 30_000
  }

  url(path: string): string {
    return `${this.baseUrl}${path}`
  }

  /** İsteğe eklenecek başlıklar (SSE gibi kendi isteğini kuran yerler de kullanır). */
  headers(options: { json?: boolean; wantToken?: boolean } = {}): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json', [HEADERS.client]: `web/${APP_VERSION}` }
    if (options.json) headers['Content-Type'] = 'application/json'
    if (this.authMode === 'token') {
      if (options.wantToken) headers[HEADERS.authMode] = 'token'
      const token = this.getToken()
      if (token) headers.Authorization = `Bearer ${token}`
    }
    return headers
  }

  get credentials(): RequestCredentials {
    return this.authMode === 'cookie' ? 'same-origin' : 'omit'
  }

  /**
   * Ham istek: ağ hatalarını `NetworkError`'a çevirir; HTTP hata durumlarını DEĞERLENDİRMEZ.
   * `timeoutMs: null` uzun soluklu akışlar (SSE) içindir.
   */
  async raw(
    method: Method,
    path: string,
    init: {
      body?: unknown
      signal?: AbortSignal
      wantToken?: boolean
      timeoutMs?: number | null
      accept?: string
    } = {},
  ): Promise<Response> {
    const timeout = init.timeoutMs === null ? null : AbortSignal.timeout(init.timeoutMs ?? this.timeoutMs)
    const signals = [init.signal, timeout].filter((item): item is AbortSignal => item != null)
    const json = init.body !== undefined
    const headers = this.headers({ json, wantToken: init.wantToken === true })
    if (init.accept) headers.Accept = init.accept
    try {
      return await this.fetchFn(this.url(path), {
        method,
        headers,
        body: json ? JSON.stringify(init.body) : undefined,
        credentials: this.credentials,
        signal: signals.length > 0 ? AbortSignal.any(signals) : null,
      })
    } catch (error) {
      if (init.signal?.aborted) throw error // çağıran vazgeçti: olduğu gibi ilet
      throw new NetworkError(timeout?.aborted ? 'İstek zaman aşımına uğradı.' : 'Sunucuya ulaşılamadı.', {
        cause: error,
      })
    }
  }

  async request<S extends z.ZodType | undefined = undefined>(
    method: Method,
    path: string,
    options: RequestOptions<S> = {},
  ): Promise<Parsed<S>> {
    const response = await this.raw(method, path, options)
    if (!response.ok) throw await toError(response)
    if (!options.schema) return undefined as Parsed<S>
    const body: unknown = response.status === 204 ? null : await response.json().catch(() => null)
    const parsed = options.schema.safeParse(body)
    if (!parsed.success) {
      console.error(`${method} ${path}: yanıt beklenen biçimde değil`, parsed.error.issues)
      throw new AppError('internal', 'Sunucu yanıtı beklenen biçimde değil. Uygulamayı güncelleyin.')
    }
    return parsed.data as Parsed<S>
  }

  // ── Kimlik ───────────────────────────────────────────────────────────────────────────────────
  register = (body: RegisterRequest) =>
    this.request('POST', API_PATHS.register, { body, schema: authResponseSchema, wantToken: true })
  login = (body: LoginRequest) =>
    this.request('POST', API_PATHS.login, { body, schema: authResponseSchema, wantToken: true })
  logout = () => this.request('POST', API_PATHS.logout)
  logoutAll = () => this.request('POST', API_PATHS.logoutAll)
  me = () => this.request('GET', API_PATHS.me, { schema: meResponseSchema })
  changePassword = (body: ChangePasswordRequest) => this.request('POST', API_PATHS.changePassword, { body })
  forgotPassword = (email: string) => this.request('POST', API_PATHS.forgotPassword, { body: { email } })
  resetPassword = (token: string, newPassword: string) =>
    this.request('POST', API_PATHS.resetPassword, { body: { token, newPassword } })

  // ── Hesap ────────────────────────────────────────────────────────────────────────────────────
  updateProfile = (name: string) =>
    this.request('PATCH', API_PATHS.account, { body: { name }, schema: meResponseSchema })
  deleteAccount = (password: string) => this.request('DELETE', API_PATHS.account, { body: { password } })
  exportAccount = () => this.request('GET', API_PATHS.accountExport, { schema: z.unknown() })

  // ── Çalışma alanları ─────────────────────────────────────────────────────────────────────────
  workspaces = () => this.request('GET', API_PATHS.workspaces, { schema: workspacesResponseSchema })
  createWorkspace = (name: string) =>
    this.request('POST', API_PATHS.workspaces, { body: { name }, schema: workspaceResponseSchema })
  renameWorkspace = (id: string, name: string) =>
    this.request('PATCH', API_PATHS.workspace(id), { body: { name }, schema: workspaceResponseSchema })
  deleteWorkspace = (id: string) => this.request('DELETE', API_PATHS.workspace(id))
  members = (workspaceId: string) =>
    this.request('GET', API_PATHS.members(workspaceId), { schema: membersResponseSchema })
  updateMember = (workspaceId: string, userId: string, body: UpdateMemberRequest) =>
    this.request('PATCH', API_PATHS.member(workspaceId, userId), { body, schema: memberResponseSchema })
  /** Üyeyi çıkarır; kendi kimliğinizle çağrılırsa alandan ayrılırsınız. */
  removeMember = (workspaceId: string, userId: string) => this.request('DELETE', API_PATHS.member(workspaceId, userId))
  createInvite = (workspaceId: string, body: CreateInviteRequest) =>
    this.request('POST', API_PATHS.invites(workspaceId), { body, schema: inviteResponseSchema })
  invitePreview = (token: string) =>
    this.request('GET', API_PATHS.invitePreview(token), { schema: invitePreviewResponseSchema })
  acceptInvite = (token: string) =>
    this.request('POST', API_PATHS.acceptInvite, { body: { token }, schema: acceptInviteResponseSchema })

  // ── Eşitleme ve yönetim ──────────────────────────────────────────────────────────────────────
  sync = (body: SyncRequest, signal?: AbortSignal) =>
    this.request('POST', API_PATHS.sync, { body, schema: syncResponseSchema, ...(signal ? { signal } : {}) })
  adminUsers = (cursor: string | null) =>
    this.request('GET', `${API_PATHS.adminUsers}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, {
      schema: adminUsersResponseSchema,
    })
  adminUpdateUser = (id: string, body: AdminUpdateUserRequest) =>
    this.request('PATCH', API_PATHS.adminUser(id), { body, schema: adminUserResponseSchema })
  adminMetrics = () => this.request('GET', API_PATHS.adminMetrics, { schema: adminMetricsResponseSchema })
  // YENİ UÇ BURAYA
}

/** Hata yanıtını `AppError`'a (ağ geçidi hatalarını `NetworkError`'a) çevirir. */
export async function toError(response: Response): Promise<Error> {
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    return new NetworkError(`Sunucu şu an yanıt vermiyor (${response.status}).`)
  }
  const body: unknown = await response.json().catch(() => null)
  const parsed = errorBodySchema.safeParse(body)
  if (parsed.success) {
    const { code, message, details } = parsed.data.error
    return new AppError(code, message, details)
  }
  return new AppError(STATUS_CODES[response.status] ?? 'internal')
}
