import type {
  AdminStats,
  APIKey,
  AuditEvent,
  Branding,
  BrandingStatus,
  Certificate,
  CreatedAPIKey,
  CreatedWebhook,
  Delivery,
  Dispute,
  DisputeComment,
  DisputeStatus,
  DisputeThread,
  Entity,
  EntityDetail,
  EntityDocument,
  EntityInput,
  EntityStatus,
  ListResponse,
  LookupResult,
  NumberStatus,
  OutboxEmail,
  PhoneNumber,
  ReputationDetail,
  ReputationLabel,
  ReputationStats,
  RiskTier,
  Role,
  Scope,
  Score,
  Session,
  SignRequest,
  SignResult,
  SignupRequest,
  UseCase,
  User,
  VerifyRequest,
  VerifyResult,
  Webhook,
} from './types'

export interface FieldError {
  field: string
  message: string
}

/** RFC 9457 problem details as returned by the Enumaracle API. */
export interface Problem {
  type?: string
  title?: string
  status?: number
  detail?: string
  instance?: string
  request_id?: string
  errors?: FieldError[]
}

const STATUS_MESSAGES: Record<number, string> = {
  0: 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.',
  400: 'İstek geçersiz.',
  401: 'Oturum açmanız gerekiyor.',
  403: 'Bu işlem için yetkiniz yok.',
  404: 'Kayıt bulunamadı.',
  409: 'İşlem mevcut durumla çakışıyor.',
  413: 'İstek çok büyük.',
  422: 'Girilen bilgileri kontrol edin.',
  429: 'Çok fazla deneme yapıldı. Lütfen biraz bekleyin.',
  500: 'Sunucuda beklenmeyen bir hata oluştu.',
}

// Go sentinel errors prefix details in English ("conflict: …"); the rest is Turkish.
const SENTINEL_PREFIX = /^(not found|conflict|invalid input|forbidden|unauthorized|illegal state transition|rate limited)(: ?|$)/i

/** Removes English sentinel prefixes from a problem detail; returns '' when nothing Turkish remains. */
export function cleanDetail(detail?: string): string {
  let d = (detail ?? '').trim()
  for (let i = 0; i < 3 && SENTINEL_PREFIX.test(d); i++) d = d.replace(SENTINEL_PREFIX, '').trim()
  return d
}

export class ApiError extends Error {
  readonly status: number
  readonly problem: Problem
  /** Field name → Turkish message, from problem.errors. */
  readonly fields: Record<string, string>

  constructor(status: number, problem: Problem = {}) {
    const fieldMessages = (problem.errors ?? []).map((f) => f?.message).filter(Boolean)
    const detail = status < 500 ? cleanDetail(problem.detail) : ''
    const message =
      (fieldMessages.length > 0 ? fieldMessages.join('; ') : detail) ||
      STATUS_MESSAGES[status] ||
      (status >= 500 ? STATUS_MESSAGES[500]! : `Hata ${status}`)
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.problem = problem
    this.fields = {}
    for (const f of problem.errors ?? []) {
      if (f && typeof f.field === 'string' && !(f.field in this.fields)) this.fields[f.field] = f.message
    }
  }

  get requestId(): string | undefined {
    return this.problem.request_id
  }
}

/** Converts any thrown value to a Turkish user-facing message. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error && err.message) return err.message
  return 'Beklenmeyen bir hata oluştu.'
}

let csrfToken = ''
let unauthorizedHandler: (() => void) | null = null

export function setCsrfToken(token: string): void {
  csrfToken = token
}

export function getCsrfToken(): string {
  return csrfToken
}

/** Called when an authenticated request returns 401 (session expired). */
export function onUnauthorized(handler: (() => void) | null): void {
  unauthorizedHandler = handler
}

type Query = Record<string, string | number | boolean | undefined | null>

export function withQuery(path: string, query?: Query): string {
  if (!query) return path
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue
    params.set(k, String(v))
  }
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

/** Encodes a path segment (phone numbers carry a leading '+'). */
export const seg = (s: string): string => encodeURIComponent(s)

interface RequestOptions {
  body?: unknown
  query?: Query
  /** Do not trigger the global 401 handler (used by /auth/me and /auth/login). */
  silent401?: boolean
}

export async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json, application/problem+json' }
  const safe = method === 'GET' || method === 'HEAD'
  if (!safe && csrfToken) headers['X-CSRF-Token'] = csrfToken
  let body: string | undefined
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  let res: Response
  try {
    res = await fetch(withQuery(path, opts.query), { method, headers, body, credentials: 'include' })
  } catch {
    throw new ApiError(0, { title: STATUS_MESSAGES[0] })
  }
  if (!res.ok) {
    let problem: Problem = {}
    const type = res.headers.get('Content-Type') ?? ''
    if (type.includes('json')) {
      try {
        problem = (await res.json()) as Problem
      } catch {
        problem = {}
      }
    }
    if (res.status === 401 && !opts.silent401) unauthorizedHandler?.()
    throw new ApiError(res.status, problem)
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

const get = <T>(path: string, query?: Query) => request<T>('GET', path, { query })
const post = <T>(path: string, body?: unknown) => request<T>('POST', path, { body: body ?? {} })
const put = <T>(path: string, body: unknown) => request<T>('PUT', path, { body })
const del = (path: string) => request<void>('DELETE', path)

/** Unwraps `{items}` and guarantees an array. */
export const items = <T>(r: ListResponse<T> | undefined): T[] => r?.items ?? []

export const api = {
  // auth
  login: (email: string, password: string) =>
    request<Session>('POST', '/auth/login', { body: { email, password }, silent401: true }),
  logout: () => request<void>('POST', '/auth/logout', { silent401: true }),
  me: () => request<Session>('GET', '/auth/me', { silent401: true }),
  signup: (body: SignupRequest) => request<{ entity: Entity; user: User }>('POST', '/v1/signup', { body }),

  // admin: users, keys, audit
  users: () => get<ListResponse<User>>('/v1/admin/users'),
  createUser: (body: { email: string; name: string; password: string; role: Role; entity_id?: string }) =>
    post<User>('/v1/admin/users', body),
  setUserActive: (id: string, active: boolean) => post<User>(`/v1/admin/users/${seg(id)}/active`, { active }),
  adminApiKeys: () => get<ListResponse<APIKey>>('/v1/admin/apikeys'),
  createAdminApiKey: (body: {
    name: string
    owner_kind: 'operator' | 'entity'
    owner_id?: string
    scopes: Scope[]
    rate_rps?: number
    expires_at?: string
  }) => post<CreatedAPIKey>('/v1/admin/apikeys', body),
  revokeAdminApiKey: (id: string) => del(`/v1/admin/apikeys/${seg(id)}`),
  audit: (q: { target_kind?: string; target_id?: string; limit?: number }) =>
    get<ListResponse<AuditEvent>>('/v1/admin/audit', q),

  // admin: registry
  entities: (q: { status?: EntityStatus | ''; q?: string; limit?: number } = {}) =>
    get<ListResponse<Entity>>('/v1/admin/entities', q),
  entity: (id: string) => get<EntityDetail>(`/v1/admin/entities/${seg(id)}`),
  decide: (id: string, body: { to_status: EntityStatus; note: string; risk_tier?: RiskTier }) =>
    post<Entity>(`/v1/admin/entities/${seg(id)}/decision`, body),
  adminNumbers: (q: { status?: NumberStatus | ''; entity_id?: string; limit?: number } = {}) =>
    get<ListResponse<PhoneNumber>>('/v1/admin/numbers', q),
  setNumberStatus: (id: string, body: { status: 'active' | 'suspended'; reason?: string; carrier_confirmed?: boolean }) =>
    post<PhoneNumber>(`/v1/admin/numbers/${seg(id)}/status`, body),
  adminBranding: (status?: BrandingStatus | '') => get<ListResponse<Branding>>('/v1/admin/branding', { status }),
  reviewBranding: (id: string, body: { status: 'approved' | 'rejected'; note: string }) =>
    post<Branding>(`/v1/admin/branding/${seg(id)}/review`, body),
  stats: () => get<AdminStats>('/v1/admin/stats'),

  // admin: reputation
  reputationList: (q: { label?: ReputationLabel | ''; limit?: number } = {}) =>
    get<ListResponse<Score>>('/v1/admin/reputation', q),
  reputationDetail: (tn: string) => get<ReputationDetail>(`/v1/admin/reputation/${seg(tn)}`),
  setOverride: (tn: string, body: { label: ReputationLabel; reason: string; until: string }) =>
    post<Score>(`/v1/admin/reputation/${seg(tn)}/override`, body),
  clearOverride: (tn: string) => request<Score>('DELETE', `/v1/admin/reputation/${seg(tn)}/override`),
  recompute: () => post<{ scored: number }>('/v1/admin/reputation/recompute'),
  reputationStats: () => get<ReputationStats>('/v1/admin/reputation-stats'),

  // admin: disputes
  adminDisputes: (status?: DisputeStatus | '') => get<ListResponse<Dispute>>('/v1/admin/disputes', { status }),
  adminDispute: (id: string) => get<DisputeThread>(`/v1/admin/disputes/${seg(id)}`),
  setDisputeStatus: (
    id: string,
    body: { status: 'in_review' | 'resolved' | 'rejected'; resolution?: string; clear_label?: boolean },
  ) => post<Dispute>(`/v1/admin/disputes/${seg(id)}/status`, body),
  adminDisputeComment: (id: string, body: { body: string; internal: boolean }) =>
    post<DisputeComment>(`/v1/admin/disputes/${seg(id)}/comments`, body),

  // admin: pki
  adminCertificates: () => get<ListResponse<Certificate>>('/v1/admin/pki/certificates'),
  revokeCertificate: (id: string, reason: string) =>
    post<Certificate>(`/v1/admin/pki/certificates/${seg(id)}/revoke`, { reason }),
  rotateSP: () => post<Certificate>('/v1/admin/pki/rotate-sp'),

  // admin: notify
  adminWebhooks: () => get<ListResponse<Webhook>>('/v1/admin/webhooks'),
  createAdminWebhook: (body: { url: string; events: string[] }) => post<CreatedWebhook>('/v1/admin/webhooks', body),
  deleteAdminWebhook: (id: string) => del(`/v1/admin/webhooks/${seg(id)}`),
  outbox: () => get<ListResponse<OutboxEmail>>('/v1/admin/outbox'),

  // carrier
  lookup: (tn: string) => get<LookupResult>(`/v1/carrier/lookup/${seg(tn)}`),
  sign: (body: SignRequest) => post<SignResult>('/v1/carrier/sign', body),
  verify: (body: VerifyRequest) => post<VerifyResult>('/v1/carrier/verify', body),

  // enterprise
  myEntity: () => get<Entity>('/v1/enterprise/entity'),
  updateMyEntity: (body: EntityInput) => put<Entity>('/v1/enterprise/entity', body),
  submitMyEntity: () => post<Entity>('/v1/enterprise/entity/submit'),
  myDocuments: () => get<ListResponse<EntityDocument>>('/v1/enterprise/entity/documents'),
  addDocument: (body: { kind: string; file_name: string; mime_type: string; sha256: string; size_bytes: number }) =>
    post<EntityDocument>('/v1/enterprise/entity/documents', body),
  myNumbers: () => get<ListResponse<PhoneNumber>>('/v1/enterprise/numbers'),
  addNumber: (body: {
    tn?: string
    range_start?: string
    range_end?: string
    use_case: UseCase
    call_reason: string
    branding_id?: string
  }) => post<PhoneNumber>('/v1/enterprise/numbers', body),
  updateNumber: (id: string, body: { use_case: UseCase; call_reason: string; branding_id?: string }) =>
    put<PhoneNumber>(`/v1/enterprise/numbers/${seg(id)}`, body),
  releaseNumber: (id: string) => del(`/v1/enterprise/numbers/${seg(id)}`),
  myBranding: () => get<ListResponse<Branding>>('/v1/enterprise/branding'),
  createBranding: (body: BrandingInput) => post<Branding>('/v1/enterprise/branding', body),
  updateBranding: (id: string, body: BrandingInput) => put<Branding>(`/v1/enterprise/branding/${seg(id)}`, body),
  myReputation: () => get<ListResponse<Score>>('/v1/enterprise/reputation'),
  myDisputes: () => get<ListResponse<Dispute>>('/v1/enterprise/disputes'),
  createDispute: (body: { tn: string; kind: string; title: string; description: string }) =>
    post<Dispute>('/v1/enterprise/disputes', body),
  myDispute: (id: string) => get<DisputeThread>(`/v1/enterprise/disputes/${seg(id)}`),
  myDisputeComment: (id: string, body: string) =>
    post<DisputeComment>(`/v1/enterprise/disputes/${seg(id)}/comments`, { body }),
  myCertificates: () => get<ListResponse<Certificate>>('/v1/enterprise/certificates'),
  issueCertificate: () => post<Certificate>('/v1/enterprise/certificates'),
  myApiKeys: () => get<ListResponse<APIKey>>('/v1/enterprise/apikeys'),
  createMyApiKey: (body: { name: string; scopes: Scope[] }) => post<CreatedAPIKey>('/v1/enterprise/apikeys', body),
  revokeMyApiKey: (id: string) => del(`/v1/enterprise/apikeys/${seg(id)}`),
  myWebhooks: () => get<ListResponse<Webhook>>('/v1/enterprise/webhooks'),
  createMyWebhook: (body: { url: string; events: string[] }) => post<CreatedWebhook>('/v1/enterprise/webhooks', body),
  deleteMyWebhook: (id: string) => del(`/v1/enterprise/webhooks/${seg(id)}`),
  deliveries: (id: string) => get<ListResponse<Delivery>>(`/v1/enterprise/webhooks/${seg(id)}/deliveries`),
}

export interface BrandingInput {
  display_name: string
  logo_url?: string
  call_reason?: string
  is_default: boolean
}
