import type { Page } from '@playwright/test'
import { expect, NET, offline, signIn, test, videoState, waitPlaying } from './helpers'

/**
 * Oynatma hattının tamamı gerçek tarayıcıda, yeni oynatıcı arayüzüyle: ağ yoklaması (FTL) → anahtar sağlama (MSL) →
 * lisanslı manifest → imzalı bayt aralıkları (ayrı ses / video nesneleri) → TTML altyazı. Açık lisanslı Sintel ve
 * Tears of Steel kullanılır; medyaları açık bir kökten ağ üzerinden gelir. Ayrıca: hız denetimi, `?konum=`,
 * yer imi → "İzlemeye Devam Et", doğrusal kanalın canlıya katılması ve "Baştan Başlat".
 * CDN düğümlerini yavaşlatan / kapatan testler sunucu genelini etkilediği için ayrı projededir: oynatma-cdn.spec.ts.
 */

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) < 900

/** Masaüstü oynatıcı denetimlerini görünür kılar (fare kıpırtısı). */
async function wakeChrome(page: Page): Promise<void> {
  const vp = page.viewportSize() ?? { width: 1440, height: 900 }
  await page.mouse.move(vp.width / 2, vp.height / 2)
  await page.mouse.move(vp.width / 2 + 40, vp.height / 2 + 20, { steps: 3 })
}

test.describe('oynatma hattı', () => {
  test.skip(offline, 'ağ gerekir (TVP_E2E_OFFLINE=1)')

  test(`Sintel hattın tamamından geçerek oynar ${NET}`, async ({ page }) => {
    const seen = {
      ftl: 0,
      provision: 0,
      manifest: 0,
      range: 0,
      timedtext: 0,
      objects: new Set<string>(),
      badRange: [] as string[],
    }
    page.on('response', (res) => {
      const u = new URL(res.url())
      if (u.pathname === '/api/ftl/probe') seen.ftl++
      else if (u.pathname === '/msl/v1/provision') seen.provision++
      else if (u.pathname === '/msl/v1/playapi/licensedManifest') seen.manifest++
      else if (/^\/oca\/[^/]+\/range\//.test(u.pathname)) {
        seen.range++
        // İmzalı adres: nesne, sürüm, bitiş ve imza parametreleri
        if (!(u.searchParams.get('o') && u.searchParams.get('e') && u.searchParams.get('t')))
          seen.badRange.push(u.search)
        seen.objects.add(u.searchParams.get('o') ?? '')
        if (![200, 206].includes(res.status())) seen.badRange.push(`${res.status()} ${u.pathname}`)
      } else if (/^\/oca\/[^/]+\/timedtext\//.test(u.pathname)) seen.timedtext++
    })

    await signIn(page)
    // Baştan: Deniz'in yer imi (öteki testler Sintel'i oynatır) başlangıcı değiştirmesin
    await page.goto('/#/izle/Video:80010001?baslat=bastan')
    await expect(page.getByText('Sintel').first()).toBeAttached()
    await waitPlaying(page, 4)

    const v = await videoState(page)
    expect(v?.error).toBeNull()
    expect(v?.width).toBeGreaterThan(0)
    await expect
      .poll(
        async () => {
          const s = await videoState(page)
          return (s?.bufferedEnd ?? 0) - (s?.currentTime ?? 0)
        },
        { message: 'oynatma konumunun ilerisi tamponda' },
      )
      .toBeGreaterThan(0)

    expect(seen.ftl, 'FTL yoklaması').toBeGreaterThan(0)
    expect(seen.provision, 'MSL anahtar sağlama').toBeGreaterThan(0)
    expect(seen.manifest, 'lisanslı manifest').toBeGreaterThan(0)
    expect(seen.range, 'bayt-aralığı istekleri').toBeGreaterThan(4)
    expect(seen.objects.size, 'ses ve video ayrı nesnelerden').toBeGreaterThanOrEqual(2)
    expect(seen.badRange, 'imzasız ya da başarısız aralık isteği yok').toEqual([])
    expect(seen.timedtext, 'TTML altyazı').toBeGreaterThan(0)

    // Masaüstünde "Kaputun altı" paneli hattın adımlarını gösterir
    if (!isMobile(page)) {
      await page.keyboard.press('Control+.')
      await page.getByRole('tab', { name: 'Oynatma hattı' }).click()
      for (const step of [
        'FTL yoklaması',
        'MSL anahtar sağlama',
        'Lisanslı manifest',
        'Bayt-aralığı akışı',
        'TTML altyazı',
      ]) {
        await expect(page.getByText(step, { exact: false }).first()).toBeVisible()
      }
      await page.keyboard.press('Control+.')
    }
  })

  test(`?konum=120 2:00 civarından başlar; hız denetimi playbackRate'i değiştirir ${NET}`, async ({ page }) => {
    test.skip(isMobile(page), 'hız menüsü masaüstü denetim şeridinde')
    await signIn(page)
    await page.goto('/#/izle/Video:80010001?konum=120')
    await expect
      .poll(async () => (await videoState(page))?.readyState ?? 0, { timeout: 60_000 })
      .toBeGreaterThanOrEqual(2)
    await waitPlaying(page, 120.5)
    const start = (await videoState(page))!.currentTime
    expect(start, 'konum 2:00 civarı').toBeLessThan(140)

    await wakeChrome(page)
    await page.getByRole('button', { name: 'Oynatma hızı' }).click()
    const speeds = page.getByRole('radiogroup', { name: 'Oynatma hızı' })
    await expect(speeds.getByRole('radio', { name: '1x (Normal)' })).toHaveAttribute('aria-checked', 'true')
    await speeds.getByRole('radio', { name: '1,5x' }).click()
    await expect(speeds.getByRole('radio', { name: '1,5x' })).toHaveAttribute('aria-checked', 'true')
    await expect.poll(async () => (await videoState(page))?.playbackRate).toBe(1.5)
    await page.keyboard.press('Escape')
  })

  test(`yer imi kaydedilir ve "İzlemeye Devam Et" satırında tek adımla sürer ${NET}`, async ({ page }) => {
    test.skip(isMobile(page), 'aynı profilde paralel koşmasın diye yalnız masaüstünde')
    const bookmarks: { positionSec?: number }[] = []
    page.on('request', (req) => {
      if (!req.url().endsWith('/graphql')) return
      const body = req.postDataJSON() as { operationName?: string; variables?: { positionSec?: number } } | null
      if (body?.operationName === 'SetBookmark') bookmarks.push(body.variables ?? {})
    })
    await signIn(page)
    // Tears of Steel'i yalnız bu dosya oynatır: satırdaki yer imi bu testin. Oynatma detay penceresinden başlar.
    await page.goto('/#/goz-at?jbv=80010002')
    await page
      .getByRole('dialog', { name: 'Tears of Steel' })
      .getByRole('link', { name: /^(Oynat|Devam Et), Tears of Steel/ })
      .click()
    await expect(page).toHaveURL(/#\/izle\/Video:80010002/)
    await waitPlaying(page, 6)
    await wakeChrome(page)
    await page.getByRole('button', { name: 'Geri' }).first().click()
    await expect(page).not.toHaveURL(/#\/izle\//)
    await expect.poll(() => bookmarks.at(-1)?.positionSec ?? 0, { message: 'SetBookmark isteği' }).toBeGreaterThan(5)

    await page.goto('/#/goz-at')
    await page.reload()
    const card = page
      .getByRole('region', { name: 'İzlemeye Devam Et' })
      .getByRole('link', { name: /^Tears of Steel: Devam Et/ })
    await expect(card).toBeVisible()
    await expect(card).toHaveAttribute('aria-label', /dk kaldı/)
    // Tek adım: kart doğrudan oynatıcıyı açar, kaldığı yerden
    await card.click()
    await expect(page).toHaveURL(/#\/izle\/Video:80010002/)
    await expect
      .poll(async () => (await videoState(page))?.readyState ?? 0, { timeout: 60_000 })
      .toBeGreaterThanOrEqual(2)
    expect((await videoState(page))!.currentTime, 'yer iminden sürer').toBeGreaterThan(4)
    await waitPlaying(page, 8)
  })

  // UYGULAMA HATASI: oynatıcı "oynatma niyeti" not edilmeden açılınca (mobil aramadaki "‹Ad› oynat" bağlantısı,
  // "Bu Cihazda Devam Et", gelen yansıtma, paylaşılan /izle bağlantısı) ana sayfaya uygulama içinde dönüldüğünde
  // "İzlemeye Devam Et" bayat kalır; ancak sayfa yenilenince düzelir. Ana sayfa (LolomoPage) yalnız
  // web/src/features/preview/sync.ts `notePlaybackIntent` kaydı varsa Falcor önbelleğini tazeler; detay
  // penceresi de ayrı bir kümeye (web/src/features/detail/sync.ts) yazar. Oynatıcı oynatmayı kendisi not etmeli.
  test.fixme(`aramadan oynatıp dönünce "İzlemeye Devam Et" tazelenir ${NET}`, async ({ page }) => {
    test.skip(!isMobile(page), 'mobil aramanın oynat bağlantısı')
    await signIn(page)
    await page.goto('/#/goz-at')
    await expect(page.getByRole('heading', { name: "Türkiye'de Bugünün Top 10 Dizi Listesi" })).toBeVisible()
    await page.getByRole('banner').getByRole('link', { name: 'Ara', exact: true }).click()
    await page
      .getByRole('region', { name: 'Sana Özel Öneriler' })
      .getByRole('link', { name: 'Tears of Steel oynat' })
      .click()
    await expect(page).toHaveURL(/#\/izle\/Video:80010002/)
    await waitPlaying(page, 6)
    await page.goBack()
    await page.getByRole('link', { name: 'Ana Sayfa' }).click()
    await expect(
      page.getByRole('region', { name: 'İzlemeye Devam Et' }).getByRole('link', { name: /^Tears of Steel/ }),
    ).toBeVisible()
  })
})

test.describe('doğrusal kanal', () => {
  test.skip(offline, 'ağ gerekir (TVP_E2E_OFFLINE=1)')

  test(`kanal 1 yayına duvar saatindeki konumdan katılır; Baştan Başlat başa sarar ${NET}`, async ({ page }) => {
    await signIn(page)
    await page.goto('/#/izle/Channel:1')
    await expect
      .poll(async () => (await videoState(page))?.readyState ?? 0, { timeout: 60_000 })
      .toBeGreaterThanOrEqual(3)
    const t1 = (await videoState(page))!.currentTime
    await expect.poll(async () => (await videoState(page))!.currentTime, { timeout: 30_000 }).toBeGreaterThan(t1 + 2)
    await expect(page.getByText('CANLI').first()).toBeVisible()
    test.skip(isMobile(page), 'Baştan Başlat masaüstü denetim şeridinde denenir')

    // Programın başından en az 20 sn geçtiyse "Baştan Başlat" belirgin biçimde geri sarar
    const joined = (await videoState(page))!.currentTime
    await wakeChrome(page)
    await page.getByRole('button', { name: 'Baştan başlat' }).click()
    await expect
      .poll(async () => (await videoState(page))?.currentTime ?? 999, { timeout: 30_000 })
      .toBeLessThan(Math.max(15, joined - 15))
    await waitPlaying(page, 1)
  })
})
