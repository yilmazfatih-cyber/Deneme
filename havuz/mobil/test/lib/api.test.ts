/**
 * API istemcisi: belirteç kipi başlıkları, hata gövdesi → AppError, ağ hatası ayrımı, zaman aşımı, şema denetimi.
 * Gerçek ağ yok: `fetch` sahte bir işlevle değiştirilir.
 */
import { API_PATHS, AppError, PROTOCOL_VERSION } from '@uygulama/shared'
import { parseApiUrl } from '../../src/config.ts'
import { ApiClient } from '../../src/lib/api/client.ts'
import { NetworkError } from '../../src/lib/errors.ts'

interface Seen {
  url: string
  init: RequestInit | undefined
}

function client(respond: (init: RequestInit | undefined) => Response | Promise<Response>, token: string | null = null) {
  const seen: Seen[] = []
  const api = new ApiClient({
    baseUrl: 'https://api.ornek.com/',
    getToken: () => token,
    clientName: 'mobil/0.1.0',
    timeoutMs: 50,
    fetch: async (input, init) => {
      seen.push({ url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, init })
      return respond(init)
    },
  })
  return { api, seen }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const user = {
  id: 'u1',
  email: 'ayse@ornek.com',
  name: 'Ayşe',
  role: 'user',
  emailVerified: true,
  createdAt: '2026-11-16T09:00:00.000Z',
}

const headersOf = (seen: Seen | undefined) => (seen?.init?.headers ?? {}) as Record<string, string>

describe('API istemcisi', () => {
  it('giriş belirteç kipinde yapılır; sonraki istekler Bearer taşır; çerez gönderilmez', async () => {
    const login = client(() => json({ user, token: 'gizli-belirtec' }))
    const response = await login.api.login({ email: 'ayse@ornek.com', password: 'uzun-bir-sifre-42' })
    expect(response.token).toBe('gizli-belirtec')
    expect(login.seen[0]?.url).toBe(`https://api.ornek.com${API_PATHS.login}`)
    expect(headersOf(login.seen[0])).toMatchObject({ 'X-Auth-Mode': 'token', 'Content-Type': 'application/json' })
    expect(login.seen[0]?.init?.credentials).toBe('omit')

    const me = client(() => json({ user }), 'gizli-belirtec')
    await me.api.me()
    expect(headersOf(me.seen[0])).toMatchObject({ Authorization: 'Bearer gizli-belirtec', 'X-Client': 'mobil/0.1.0' })
    expect(headersOf(me.seen[0])['X-Auth-Mode']).toBeUndefined()
  })

  it("hata gövdesini AppError'a çevirir (kod, Türkçe ileti, alan ayrıntısı)", async () => {
    const details = [{ path: 'password', message: 'Şifre yanlış.' }]
    const { api } = client(() => json({ error: { code: 'invalid_credentials', message: 'Hatalı.', details } }, 401))
    const error = await api.deleteAccount('x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({ code: 'invalid_credentials', message: 'Hatalı.', details })
  })

  it('gövdesiz hata durum koduna göre sınıflanır; ağ geçidi hatası ve ağ kopukluğu NetworkError olur', async () => {
    expect(
      await client(() => new Response('', { status: 403 }))
        .api.me()
        .catch((e: unknown) => e),
    ).toMatchObject({
      code: 'forbidden',
    })
    expect(
      await client(() => new Response('', { status: 503 }))
        .api.me()
        .catch((e: unknown) => e),
    ).toBeInstanceOf(NetworkError)
    const offline = client(() => {
      throw new TypeError('Network request failed')
    })
    expect(await offline.api.me().catch((e: unknown) => e)).toBeInstanceOf(NetworkError)
  })

  it('yanıt gelmezse zaman aşımı NetworkError verir', async () => {
    const { api } = client(
      (init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )
    const error = await api.me().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(NetworkError)
    expect((error as Error).message).toContain('zaman aşımı')
  })

  it('beklenmeyen biçimdeki yanıt internal hatası verir (sessizce bozuk veri geçmez)', async () => {
    const errorLog = console.error
    console.error = () => {}
    try {
      const error = await client(() => json({ user: { id: 1 } }))
        .api.me()
        .catch((e: unknown) => e)
      expect(error).toMatchObject({ code: 'internal' })
    } finally {
      console.error = errorLog
    }
  })

  it('eşitleme isteğini gövdeyle gönderir ve yanıtı doğrular', async () => {
    const response = { lastMutationId: 0, rejected: [], touched: [], workspaces: [], changes: {} }
    const { api, seen } = client(() => json(response), 'b')
    const request = { protocolVersion: PROTOCOL_VERSION, clientId: 'c1', cursors: {}, mutations: [] }
    expect(await api.sync(request)).toEqual(response)
    expect(JSON.parse(seen[0]?.init?.body as string)).toEqual(request)
    expect(seen[0]?.init?.method).toBe('POST')
  })
})

describe('API adresi ayarı', () => {
  it('boş ya da none → hesapsız; http(s) → adres; bozuk → geçersiz', () => {
    expect(parseApiUrl(undefined)).toEqual({ enabled: false, reason: 'none' })
    expect(parseApiUrl(' none ')).toEqual({ enabled: false, reason: 'none' })
    expect(parseApiUrl('https://api.ornek.com/')).toEqual({ enabled: true, baseUrl: 'https://api.ornek.com' })
    expect(parseApiUrl('http://192.168.1.20:8310')).toEqual({ enabled: true, baseUrl: 'http://192.168.1.20:8310' })
    expect(parseApiUrl('ftp://ornek.com')).toEqual({ enabled: false, reason: 'invalid' })
    expect(parseApiUrl('adres değil')).toEqual({ enabled: false, reason: 'invalid' })
  })
})
