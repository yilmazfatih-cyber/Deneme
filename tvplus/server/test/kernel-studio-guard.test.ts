import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { HEADERS, ROUTES } from '../../shared/constants'
import { createTestApp } from './helpers'

/** Stüdyo (içerik zekâsı arka ofisi) uçlarının erişim koruması ve gövdesiz JSON isteklerinin kabulü. */
describe('çekirdek: stüdyo koruması', () => {
  let app: FastifyInstance | null = null
  afterEach(async () => {
    await app?.close()
    app = null
  })

  // Korumanın geçtiğini göstermek için var olmayan bir stüdyo yolu kullanılır: koruma geçerse yanıt 404 olur.
  const probe = `${ROUTES.STUDIO}/__yok`

  it('üye modunda oturumsuz istek 401 alır', async () => {
    app = await createTestApp({ studioAccess: 'member' })
    const res = await app.inject({ method: 'GET', url: probe })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('UNAUTHENTICATED')
  })

  it('doğru stüdyo anahtarı oturumsuz geçer, yanlış anahtar geçmez', async () => {
    app = await createTestApp({ studioAccess: 'member', studioKey: 'gizli-anahtar' })
    const ok = await app.inject({ method: 'GET', url: probe, headers: { [HEADERS.STUDIO_KEY]: 'gizli-anahtar' } })
    expect(ok.statusCode).toBe(404)
    const bad = await app.inject({ method: 'GET', url: probe, headers: { [HEADERS.STUDIO_KEY]: 'gizli-anahtarr' } })
    expect(bad.statusCode).toBe(401)
  })

  it('anahtar tanımlı değilken başlık hiçbir şey açmaz', async () => {
    app = await createTestApp({ studioAccess: 'member', studioKey: null })
    const res = await app.inject({ method: 'GET', url: probe, headers: { [HEADERS.STUDIO_KEY]: '' } })
    expect(res.statusCode).toBe(401)
  })

  it('kapalı modda uçlar 404 döner (anahtarla bile)', async () => {
    app = await createTestApp({ studioAccess: 'off', studioKey: 'gizli-anahtar' })
    const res = await app.inject({ method: 'GET', url: probe, headers: { [HEADERS.STUDIO_KEY]: 'gizli-anahtar' } })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.message).toContain('kapalı')
  })

  it('açık modda (testler) koruma devre dışıdır', async () => {
    app = await createTestApp()
    const res = await app.inject({ method: 'GET', url: probe })
    expect(res.statusCode).toBe(404)
  })
})

describe('çekirdek: gövdesiz JSON isteği', () => {
  it('içerik türü JSON olup gövdesi olmayan istek "boş gövde" hatasına düşmez', async () => {
    const app = await createTestApp()
    try {
      const res = await app.inject({
        method: 'POST',
        url: ROUTES.LOGOUT,
        headers: { 'content-type': 'application/json' },
      })
      expect(res.statusCode).not.toBe(400)
      expect(res.body).not.toContain('INVALID_BODY')
    } finally {
      await app.close()
    }
  })
})
