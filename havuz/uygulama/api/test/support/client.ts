/**
 * Test istemcisi: bir tarayıcı gibi davranır (çerezi saklar ve geri gönderir, kendi kökeninden `Origin` yollar)
 * ya da `X-Auth-Mode: token` ile belirteç kipine geçer. İstekler ağsız: `app.request(...)`.
 *
 * Genişletme: yeni bir başlık davranışı gerekiyorsa `send` içine ekleyin; testler başlıkları `headers` ile de verebilir.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- test istemcisi gevşek JSON döndürür; testler alanlara doğrudan bakar */
import { AppError, API_PATHS, errorBodySchema, type User } from '@uygulama/shared'
import type { TestServer } from './harness.ts'
import { TEST_APP_URL } from './harness.ts'

export interface Reply<T = any> {
  readonly status: number
  readonly body: T
  readonly headers: Headers
}

export interface ClientOptions {
  /** Tarayıcı kökeni (`Origin` başlığı). `null` → başlık hiç gönderilmez (curl gibi). */
  readonly origin?: string | null
  /** X-Forwarded-For (TRUST_PROXY açıkken IP'yi belirler). */
  readonly ip?: string
}

function parseBody(text: string): unknown {
  if (text === '') return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

let counter = 0

/** Benzersiz deneme e-postası. */
export function uniqueEmail(prefix = 'kisi'): string {
  counter += 1
  return `${prefix}${counter}@ornek.com`
}

export const GOOD_PASSWORD = 'mavi-deniz-kenari-42'

export class TestClient {
  cookie: string | null = null
  token: string | null = null
  readonly t: TestServer
  readonly options: ClientOptions

  constructor(t: TestServer, options: ClientOptions = {}) {
    this.t = t
    this.options = options
  }

  async send<T = any>(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<Reply<T>> {
    const all: Record<string, string> = {}
    const origin = this.options.origin === undefined ? TEST_APP_URL : this.options.origin
    if (origin !== null) all.Origin = origin
    if (this.options.ip) all['X-Forwarded-For'] = this.options.ip
    if (this.cookie) all.Cookie = this.cookie
    if (this.token) all.Authorization = `Bearer ${this.token}`
    if (body !== undefined) all['Content-Type'] = 'application/json'
    Object.assign(all, headers)
    const response = await this.t.server.app.request(path, {
      method,
      headers: all,
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    })
    this.storeCookie(response.headers)
    const text = await response.text()
    return { status: response.status, body: parseBody(text) as T, headers: response.headers }
  }

  get<T = any>(path: string, headers?: Record<string, string>) {
    return this.send<T>('GET', path, undefined, headers)
  }

  post<T = any>(path: string, body: unknown = {}, headers?: Record<string, string>) {
    return this.send<T>('POST', path, body, headers)
  }

  patch<T = any>(path: string, body: unknown, headers?: Record<string, string>) {
    return this.send<T>('PATCH', path, body, headers)
  }

  delete<T = any>(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.send<T>('DELETE', path, body, headers)
  }

  private storeCookie(headers: Headers): void {
    for (const line of headers.getSetCookie()) {
      const [pair] = line.split(';')
      if (!pair) continue
      const [name, value] = pair.split('=')
      if (!name?.endsWith('sid')) continue
      this.cookie = value ? `${name}=${value}` : null
    }
  }
}

/** Hata yanıtını AppError'a çevirir (uygunluk bağdaştırıcısı ve testler için). */
export function toAppError(reply: Reply): AppError {
  const parsed = errorBodySchema.safeParse(reply.body)
  if (!parsed.success) return new AppError('internal', `Beklenmeyen yanıt (${reply.status})`)
  return new AppError(parsed.data.error.code, parsed.data.error.message, parsed.data.error.details)
}

export interface SignedUpUser {
  readonly client: TestClient
  readonly user: User
  readonly email: string
  readonly password: string
  readonly personalWorkspaceId: string
}

/** Kayıt olur (tarayıcı kipinde, çerezle) ve kişisel alanın kimliğini bulur. */
export async function signUp(
  t: TestServer,
  input: { name?: string; email?: string; password?: string; options?: ClientOptions } = {},
): Promise<SignedUpUser> {
  const client = new TestClient(t, input.options)
  const email = input.email ?? uniqueEmail()
  const password = input.password ?? GOOD_PASSWORD
  const reply = await client.post(API_PATHS.register, { email, password, name: input.name ?? 'Deneme Kişi' })
  if (reply.status !== 201) throw toAppError(reply)
  const workspaces = await client.get(API_PATHS.workspaces)
  const personal = (workspaces.body as { workspaces: { id: string; kind: string }[] }).workspaces.find(
    (workspace) => workspace.kind === 'personal',
  )
  if (!personal) throw new Error('Kişisel alan bulunamadı')
  return { client, user: (reply.body as { user: User }).user, email, password, personalWorkspaceId: personal.id }
}
