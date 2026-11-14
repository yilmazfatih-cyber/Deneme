import { describe, expect, it } from 'vitest'
import { createTestApp } from './helpers'

/** Çerez kavanozu: yanıttaki Set-Cookie değerlerini sonraki isteğe taşır. */
function jar() {
  const cookies = new Map<string, string>()
  return {
    take(res: { cookies: { name: string; value: string }[] }) {
      for (const c of res.cookies) {
        if (c.value) cookies.set(c.name, c.value)
        else cookies.delete(c.name)
      }
    },
    header: () => [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
  }
}

describe('hata ayıklama uçlarının korunması', () => {
  it("'member' kipinde oturumsuz istek 401 alır, üye erişir", async () => {
    const app = await createTestApp({ debugAccess: 'member' })
    const anon = await app.inject({ url: '/api/debug/oca' })
    expect(anon.statusCode).toBe(401)
    expect(anon.json().error.code).toBe('UNAUTHENTICATED')
    const anonPost = await app.inject({ method: 'POST', url: '/api/debug/oca/c101-ist001-ix', payload: { down: true } })
    expect(anonPost.statusCode).toBe(401)

    const j = jar()
    j.take(await app.inject({ method: 'POST', url: '/api/login', payload: {} }))
    const member = await app.inject({ url: '/api/debug/oca', headers: { cookie: j.header() } })
    expect(member.statusCode).toBe(200)
    expect(Array.isArray(member.json())).toBe(true)
    const memberPost = await app.inject({
      method: 'POST',
      url: '/api/debug/oca/c101-ist001-ix',
      headers: { cookie: j.header() },
      payload: { latencyMs: 20 },
    })
    expect(memberPost.statusCode).toBe(200)
    await app.close()
  })

  it("'off' kipinde uçlar 404 döner", async () => {
    const app = await createTestApp({ debugAccess: 'off' })
    const j = jar()
    j.take(await app.inject({ method: 'POST', url: '/api/login', payload: {} }))
    for (const url of ['/api/debug/state', '/api/debug/oca', '/api/debug/events']) {
      expect((await app.inject({ url, headers: { cookie: j.header() } })).statusCode).toBe(404)
    }
    await app.close()
  })

  it("'open' kipinde (testler) oturumsuz erişilir", async () => {
    const app = await createTestApp()
    expect((await app.inject({ url: '/api/debug/state' })).statusCode).toBe(200)
    await app.close()
  })
})
