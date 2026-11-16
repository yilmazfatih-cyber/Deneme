// @vitest-environment node
import { AppError, API_PATHS } from '@uygulama/shared'
import { describe, expect, it } from 'vitest'
import { ApiClient } from '../../src/lib/api.ts'
import { parseApiUrl } from '../../src/lib/env.ts'
import { NetworkError } from '../../src/lib/errors.ts'

interface Seen {
  url: string
  init: RequestInit | undefined
}

function client(
  respond: () => Response | Promise<Response>,
  options: { authMode?: 'cookie' | 'token'; token?: string } = {},
) {
  const seen: Seen[] = []
  const api = new ApiClient({
    baseUrl: 'https://api.ornek.com',
    authMode: options.authMode ?? 'cookie',
    getToken: () => options.token ?? null,
    fetch: async (input, init) => {
      seen.push({ url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, init })
      return respond()
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

describe('API istemcisi', () => {
  it('başarılı yanıtı şemayla okur; adres API_PATHS + kökten kurulur', async () => {
    const { api, seen } = client(() => json({ user }))
    const response = await api.me()
    expect(response.user.name).toBe('Ayşe')
    expect(seen[0]?.url).toBe(`https://api.ornek.com${API_PATHS.me}`)
    expect(seen[0]?.init?.credentials).toBe('same-origin')
  })

  it("hata gövdesini AppError'a çevirir (kod, Türkçe ileti, alan ayrıntısı)", async () => {
    const details = [{ path: 'currentPassword', message: 'Şifre yanlış.' }]
    const { api } = client(() => json({ error: { code: 'invalid_credentials', message: 'Hatalı.', details } }, 401))
    const error = await api
      .changePassword({ currentPassword: 'x', newPassword: 'y'.repeat(12) })
      .catch((e: unknown) => e)
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
      throw new TypeError('Failed to fetch')
    })
    expect(await offline.api.me().catch((e: unknown) => e)).toBeInstanceOf(NetworkError)
  })

  it('beklenmeyen biçimdeki yanıt internal hatası verir (sessizce bozuk veri geçmez)', async () => {
    const error = await client(() => json({ user: { id: 1 } }))
      .api.me()
      .catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'internal' })
  })

  it('belirteç kipinde: girişte X-Auth-Mode gönderilir, sonra Authorization: Bearer eklenir, çerez gönderilmez', async () => {
    const { api, seen } = client(() => json({ user, token: 't'.repeat(32) }), { authMode: 'token', token: 'abc' })
    await api.login({ email: 'ayse@ornek.com', password: 'uzun-bir-sifre' })
    const headers = seen[0]?.init?.headers as Record<string, string>
    expect(headers['X-Auth-Mode']).toBe('token')
    expect(headers.Authorization).toBe('Bearer abc')
    expect(headers['Content-Type']).toBe('application/json')
    expect(seen[0]?.init?.credentials).toBe('omit')
  })

  it('davet önizlemesi sarmalı ya da sarmalsız gelebilir; kabul alan kimliğini verir', async () => {
    const preview = { workspaceName: 'Ev', role: 'editor', invitedBy: 'Ayşe', expiresAt: '2026-11-17T09:00:00.000Z' }
    expect(await client(() => json(preview)).api.invitePreview('t'.repeat(20))).toEqual(preview)
    expect(await client(() => json({ invite: preview })).api.invitePreview('t'.repeat(20))).toEqual(preview)
    const workspace = { id: 'ws1', name: 'Ev', kind: 'shared', role: 'editor', rev: 0, memberCount: 2 }
    expect(await client(() => json({ workspace })).api.acceptInvite('t'.repeat(20))).toBe('ws1')
  })
})

describe('VITE_API_URL çözümleme', () => {
  const origin = 'https://ornek.app'
  it('boş → aynı köken, çerez', () => {
    expect(parseApiUrl(undefined, origin)).toEqual({ enabled: true, baseUrl: '', authMode: 'cookie' })
    expect(parseApiUrl('  ', origin)).toEqual({ enabled: true, baseUrl: '', authMode: 'cookie' })
  })
  it('none → hesapsız kip', () => {
    expect(parseApiUrl('none', origin)).toEqual({ enabled: false, reason: 'none' })
  })
  it('başka köken → belirteç; aynı köken → çerez; sondaki / atılır', () => {
    expect(parseApiUrl('https://api.ornek.app/', origin)).toEqual({
      enabled: true,
      baseUrl: 'https://api.ornek.app',
      authMode: 'token',
    })
    expect(parseApiUrl('https://ornek.app/arka', origin)).toMatchObject({ authMode: 'cookie' })
  })
  it('geçersiz adres → API kapalı (konsola ne yapılacağı yazılır)', () => {
    const error = console.error
    console.error = () => {}
    try {
      expect(parseApiUrl('api.ornek', origin)).toEqual({ enabled: false, reason: 'invalid' })
    } finally {
      console.error = error
    }
  })
})
