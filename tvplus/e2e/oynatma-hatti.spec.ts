import { expect, test } from '@playwright/test'
import { offline, signIn, videoState } from './helpers'

/**
 * Oynatma hattının tamamı gerçek tarayıcıda: ağ yoklaması → anahtar sağlama → lisanslı manifest →
 * imzalı bayt aralıkları (ayrı ses/video) → TTML altyazı. Açık lisanslı Sintel kullanılır.
 */
test.describe('oynatma hattı', () => {
  test.skip(offline, 'ağ gerekir (TVP_E2E_OFFLINE=1)')

  test('Sintel hattın tamamından geçerek oynar', async ({ page }) => {
    const seen = { ftl: 0, provision: 0, manifest: 0, range: 0, timedtext: 0, nodes: new Set<string>() }
    page.on('response', (res) => {
      const u = new URL(res.url())
      if (u.pathname === '/api/ftl/probe') seen.ftl++
      else if (u.pathname === '/msl/v1/provision') seen.provision++
      else if (u.pathname === '/msl/v1/playapi/licensedManifest') seen.manifest++
      else if (/^\/oca\/[^/]+\/range\//.test(u.pathname)) {
        seen.range++
        seen.nodes.add(u.pathname.split('/')[2]!)
        // İmzalı adres: nesne, sürüm, bitiş ve imza parametreleri
        expect(u.searchParams.get('o') && u.searchParams.get('e') && u.searchParams.get('t')).toBeTruthy()
        expect([200, 206]).toContain(res.status())
      } else if (/^\/oca\/[^/]+\/timedtext\//.test(u.pathname)) seen.timedtext++
    })

    await signIn(page)
    await page.goto('/#/izle/Video:80010001')
    await expect.poll(async () => (await videoState(page))?.currentTime ?? 0, { timeout: 60_000 }).toBeGreaterThan(4)

    const v = await videoState(page)
    expect(v?.error).toBeNull()
    expect(v?.width).toBeGreaterThan(0)
    expect(v?.bufferedEnd).toBeGreaterThan(v!.currentTime)

    expect(seen.ftl, 'FTL yoklaması').toBeGreaterThan(0)
    expect(seen.provision, 'MSL anahtar sağlama').toBeGreaterThan(0)
    expect(seen.manifest, 'lisanslı manifest').toBeGreaterThan(0)
    expect(seen.range, 'bayt-aralığı istekleri').toBeGreaterThan(4)
    expect(seen.timedtext, 'TTML altyazı').toBeGreaterThan(0)
  })

  test('doğrusal kanal yayına duvar saatindeki konumdan katılır', async ({ page }) => {
    await signIn(page)
    await page.goto('/#/izle/Channel:1')
    await expect
      .poll(async () => (await videoState(page))?.readyState ?? 0, { timeout: 60_000 })
      .toBeGreaterThanOrEqual(3)
    const t1 = (await videoState(page))!.currentTime
    await expect.poll(async () => (await videoState(page))!.currentTime, { timeout: 30_000 }).toBeGreaterThan(t1 + 2)
    await expect(page.getByText('CANLI').first()).toBeVisible()
  })
})

test.describe('API sözleşmesi', () => {
  test('ham sorgu reddedilir, kalıcı sorgu çalışır; hata ayıklama uçları oturum ister', async ({ page, request }) => {
    const raw = await request.post('/graphql', { data: { query: '{ membershipStatus { status } }' } })
    expect(raw.status()).toBe(400)
    expect((await raw.json()).errors[0].extensions.code).toBe('RAW_QUERY_NOT_ALLOWED')

    expect((await request.get('/api/debug/oca')).status()).toBe(401)

    await signIn(page)
    const viaPage = await page.evaluate(async () => {
      const r = await fetch('/api/debug/oca')
      return { status: r.status, trace: r.headers.get('x-b3-traceid'), nodes: ((await r.json()) as unknown[]).length }
    })
    expect(viaPage.status).toBe(200)
    expect(viaPage.trace).toMatch(/^[0-9a-f]{32}$/)
    expect(viaPage.nodes).toBe(4)
  })
})
