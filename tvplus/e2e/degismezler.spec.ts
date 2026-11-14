import { HEADERS } from '../shared/constants'
import { expect, pageApi, signIn, test } from './helpers'

/**
 * Kesişen değişmezler (MIMARI §4–5, UX_SPEC §7):
 *   - her API yanıtı izleme başlığı (`x-b3-traceid`) taşır
 *   - ham (kalıcı olmayan) GraphQL sorgusu reddedilir; kalıcı sorgu çalışır
 *   - hata ayıklama ve stüdyo uçları oturum ister
 *   - hiçbir ekranda Netflix adı geçmez
 * Sayfa hataları ve başarısız istekler her testte `issues` fikstürüyle zaten toplanır (helpers.ts).
 */

const API = /^\/(api|graphql|msl|log|push)(\/|$)/

test.describe('değişmezler', () => {
  test('ana yolculukta her API yanıtı izleme başlığı taşır; hiçbir ekranda "Netflix" yok', async ({
    page,
    baseURL,
  }) => {
    const origin = new URL(baseURL!).origin
    const missing: string[] = []
    let apiResponses = 0
    page.on('response', (res) => {
      const u = new URL(res.url())
      if (u.origin !== origin) return
      if (!API.test(u.pathname)) return
      apiResponses++
      const trace = res.headers()[HEADERS.TRACE_ID]
      if (!trace || !/^[0-9a-f]{32}$/.test(trace)) missing.push(`${res.status()} ${u.pathname}`)
    })
    await signIn(page)
    for (const path of [
      '/goz-at',
      '/goz-at?jbv=80010001',
      '/ara?q=sintel',
      '/canli',
      '/rehber',
      '/listem',
      '/tvplusim',
    ]) {
      await page.goto(`/#${path}`)
      await expect(page.locator('main')).toBeVisible()
      await page.waitForTimeout(800)
      const text = await page.locator('body').innerText()
      expect(text, `${path}: Netflix adı geçmez`).not.toMatch(/netflix/i)
    }
    expect(apiResponses, 'API yanıtı gözlendi').toBeGreaterThan(10)
    expect(missing, 'izleme başlığı olmayan API yanıtları').toEqual([])
  })

  test('ham GraphQL sorgusu reddedilir; kalıcı sorgu kimliğiyle çalışır', async ({ request, page, issues }) => {
    issues.allowHttp(/^\/graphql$/, [400]) // sayfanın içinden bilerek yollanan ham sorgu
    const raw = await request.post('/graphql', { data: { query: '{ membershipStatus { status } }' } })
    expect(raw.status()).toBe(400)
    const body = (await raw.json()) as { errors: { extensions: { code: string } }[] }
    expect(body.errors[0]!.extensions.code).toBe('RAW_QUERY_NOT_ALLOWED')
    expect(raw.headers()[HEADERS.TRACE_ID]).toMatch(/^[0-9a-f]{32}$/)

    // Oturumla da ham sorgu yok
    await signIn(page)
    const viaPage = await pageApi<{ errors?: { extensions: { code: string } }[] }>(page, 'POST', '/graphql', {
      query: '{ membershipStatus { status } }',
    })
    expect(viaPage.status).toBe(400)
    expect(viaPage.json?.errors?.[0]?.extensions.code).toBe('RAW_QUERY_NOT_ALLOWED')

    // Uygulamanın kendi isteği: yalnız kimlik + sürüm, yanıt işlem adını taşır
    const persisted = page.waitForResponse(
      (r) => r.url().endsWith('/graphql') && r.headers()[HEADERS.GQL_OP] === 'DetailModal',
    )
    await page.goto('/#/goz-at?jbv=80010002')
    const res = await persisted
    expect(res.status()).toBe(200)
    const sent = res.request().postDataJSON() as { query?: string; extensions?: { persistedQuery?: { id?: string } } }
    expect(sent.query).toBeUndefined()
    expect(sent.extensions?.persistedQuery?.id).toBeTruthy()
  })

  test('hata ayıklama ve stüdyo uçları oturum ister', async ({ playwright, baseURL, page }) => {
    const anon = await playwright.request.newContext({ baseURL })
    try {
      for (const path of ['/api/debug/oca', '/api/debug/state', '/api/debug/events', '/api/studio/overview']) {
        const r = await anon.get(path)
        expect(r.status(), `oturumsuz ${path}`).toBe(401)
        expect(r.headers()[HEADERS.TRACE_ID], `${path} izleme başlığı`).toMatch(/^[0-9a-f]{32}$/)
      }
      expect((await anon.post('/api/debug/oca/reset', { data: {} })).status()).toBe(401)
    } finally {
      await anon.dispose()
    }

    await signIn(page)
    const oca = await pageApi<unknown[]>(page, 'GET', '/api/debug/oca')
    expect(oca.status).toBe(200)
    expect(oca.headers[HEADERS.TRACE_ID]).toMatch(/^[0-9a-f]{32}$/)
    expect(oca.json).toHaveLength(4)
    expect((await pageApi(page, 'GET', '/api/studio/overview')).status).toBe(200)
  })
})
