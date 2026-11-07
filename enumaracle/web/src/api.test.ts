import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, request, setCsrfToken, withQuery } from './api'
import { mockFetch } from './test-utils'

afterEach(() => {
  vi.unstubAllGlobals()
  setCsrfToken('')
})

describe('api client', () => {
  it('parses RFC 9457 problem+json with field errors', async () => {
    mockFetch({
      'POST /v1/signup': {
        status: 422,
        body: {
          type: 'about:blank',
          title: 'Unprocessable Entity',
          status: 422,
          detail: 'vkn: geçersiz VKN; legal_name: zorunlu alan',
          request_id: 'req-42',
          errors: [
            { field: 'vkn', message: 'geçersiz VKN' },
            { field: 'legal_name', message: 'zorunlu alan' },
          ],
        },
      },
    })
    const err = await api
      .signup({
        legal_name: '',
        trade_name: 'X',
        vkn: '1',
        sector: 's',
        city: 'İstanbul',
        contact_name: 'a',
        contact_email: 'a@b.co',
        contact_phone: '+905321112233',
        password: '0123456789',
      })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    const e = err as ApiError
    expect(e.status).toBe(422)
    expect(e.fields).toEqual({ vkn: 'geçersiz VKN', legal_name: 'zorunlu alan' })
    expect(e.message).toBe('geçersiz VKN; zorunlu alan')
    expect(e.requestId).toBe('req-42')
  })

  it('strips English sentinel prefixes from details', async () => {
    mockFetch({
      'POST /v1/admin/entities/e1/decision': {
        status: 409,
        body: { title: 'Conflict', status: 409, detail: 'illegal state transition: verified durumundan rejected durumuna geçilemez' },
      },
      'GET /v1/admin/entities/x': { status: 404, body: { title: 'Not Found', status: 404, detail: 'not found' } },
    })
    const e1 = (await api.decide('e1', { to_status: 'rejected', note: '' }).catch((x: unknown) => x)) as ApiError
    expect(e1.message).toBe('verified durumundan rejected durumuna geçilemez')
    const e2 = (await api.entity('x').catch((x: unknown) => x)) as ApiError
    expect(e2.message).toBe('Kayıt bulunamadı.')
  })

  it('falls back to a Turkish message for 5xx and non-JSON bodies', async () => {
    mockFetch({ 'GET /v1/admin/stats': { status: 500, body: 'boom', contentType: 'text/plain' } })
    const e = (await api.stats().catch((x: unknown) => x)) as ApiError
    expect(e.status).toBe(500)
    expect(e.message).toBe('Sunucuda beklenmeyen bir hata oluştu.')
    expect(e.fields).toEqual({})
  })

  it('reports network failures as status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const e = (await api.stats().catch((x: unknown) => x)) as ApiError
    expect(e.status).toBe(0)
    expect(e.message).toMatch(/Sunucuya ulaşılamadı/)
  })

  it('sends X-CSRF-Token on unsafe methods only, always with credentials', async () => {
    const calls = mockFetch({
      'GET /v1/admin/users': { body: { items: [] } },
      'POST /v1/admin/users/u1/active': { body: { id: 'u1' } },
      'DELETE /v1/admin/apikeys/k1': { status: 204 },
    })
    setCsrfToken('tok-123')
    await api.users()
    await api.setUserActive('u1', false)
    await api.revokeAdminApiKey('k1')
    expect(calls).toHaveLength(3)
    expect(calls[0]!.headers['X-CSRF-Token']).toBeUndefined()
    expect(calls[1]!.headers['X-CSRF-Token']).toBe('tok-123')
    expect(calls[1]!.headers['Content-Type']).toBe('application/json')
    expect(calls[1]!.body).toEqual({ active: false })
    expect(calls[2]!.method).toBe('DELETE')
    expect(calls[2]!.headers['X-CSRF-Token']).toBe('tok-123')
    for (const c of calls) expect(c.credentials).toBe('include')
  })

  it('encodes phone numbers in paths and drops empty query values', async () => {
    const calls = mockFetch({ 'GET /v1/carrier/lookup/%2B905321234567': { body: { tn: '+905321234567' } } })
    await api.lookup('+905321234567')
    expect(calls[0]!.url).toBe('/v1/carrier/lookup/%2B905321234567')
    expect(withQuery('/v1/admin/entities', { status: '', q: 'abc', limit: 10 })).toBe('/v1/admin/entities?q=abc&limit=10')
  })

  it('returns undefined for 204', async () => {
    mockFetch({ 'DELETE /v1/enterprise/numbers/n1': { status: 204 } })
    await expect(request('DELETE', '/v1/enterprise/numbers/n1')).resolves.toBeUndefined()
  })
})
