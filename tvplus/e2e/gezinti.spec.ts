import { expect, test, type Page } from '@playwright/test'
import { offline, signIn } from './helpers'

/** Bir kalıcı sorgunun kaç kez gittiğini sayar (istek gövdesindeki işlem adına bakar). */
function countOperation(page: Page, operationName: string) {
  const state = { count: 0, rawQuerySeen: false }
  page.on('request', (req) => {
    if (!req.url().endsWith('/graphql') || req.method() !== 'POST') return
    const body = req.postDataJSON() as { operationName?: string; query?: string; extensions?: { persistedQuery?: { id?: string } } }
    if (body.query) state.rawQuerySeen = true
    if (body.operationName === operationName && body.extensions?.persistedQuery?.id) state.count++
  })
  return state
}

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

test.describe('Film & Dizi', () => {
  test('ana sayfa satırları eski sistemden (Falcor) gelir; kartlar konum bilgisi taşır', async ({ page }) => {
    const falcor: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/member/pathEvaluator')) falcor.push(req.postData() ?? '')
    })
    await signIn(page)
    await page.goto('/#/film-dizi')
    await expect(page.getByRole('heading', { name: "Bugünün Top 10'u" })).toBeVisible()

    // Kart bağlantıları tctx taşır: satır indeksi, sıra, …, varlık kimliği
    const href = await page.locator('a[href*="/detay/"][href*="tctx="]').first().getAttribute('href')
    expect(decodeURIComponent(href ?? '')).toMatch(/tctx=\d+,\d+,[^,]*,\d+,,,,,,,Video:\d+,/)

    // Aşağı kaydırınca kalan satırlar yol yol istenir; gövde form kodlu `path=` ve `authURL=` taşır
    await page.mouse.wheel(0, 2400)
    await expect.poll(() => falcor.length, { timeout: 15_000 }).toBeGreaterThan(0)
    expect(falcor.at(-1)).toContain('path=')
    expect(falcor.at(-1)).toContain('authURL=')
    expect(await horizontalOverflow(page)).toBe(0)
  })

  test('detay sayfası tek birincil eylemle açılır ve oynatıcıya götürür', async ({ page }) => {
    const detail = countOperation(page, 'DetailModal')
    await signIn(page)
    await page.goto('/#/detay/80010001')
    await expect(page.getByRole('heading', { name: 'Sintel', level: 1 })).toBeVisible()
    await expect(page.getByText(/CC BY 3\.0/).first()).toBeVisible()
    expect(detail.count).toBe(1)
    expect(detail.rawQuerySeen, 'sorgu metni hiç gönderilmez').toBe(false)
    await page
      .getByRole('link', { name: /^(İzle|Devam et)/ })
      .or(page.getByRole('button', { name: /^(İzle|Devam et)/ }))
      .first()
      .click()
    await expect(page).toHaveURL(/#\/izle\/Video:80010001/)
  })

  test('çocuk profili yalnız yaşına uygun içeriği görür', async ({ page }) => {
    await signIn(page, 'Çocuk')
    await page.goto('/#/detay/80010001') // Sintel 13+
    await expect(page.getByText(/bulunamadı/i).first()).toBeVisible()
    await page.goto('/#/canli')
    await expect(page.getByText('TRT Çocuk').first()).toBeVisible()
    await expect(page.getByText('TRT Haber')).toHaveCount(0)
  })
})

test.describe('web önizleme kartı', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 900, 'üzerine gelme yalnız masaüstünde')

  test('bir karta gelince satırın tamamı tek istekte ön yüklenir', async ({ page }) => {
    const mini = countOperation(page, 'MiniModalQuery')
    await signIn(page)
    await page.goto('/#/film-dizi')
    const heading = page.getByRole('heading', { name: "Bugünün Top 10'u" })
    await expect(heading).toBeVisible()
    // Satırı görünür alana getir (sabit üst çubuğun altına)
    await heading.evaluate((el) => {
      el.scrollIntoView({ block: 'start' })
      window.scrollBy(0, -110)
    })
    await page.waitForTimeout(600)
    // Aynı satırdaki kartlar: dikey konumu aynı olan ilk üç detay bağlantısı (DOM yapısından bağımsız)
    const links = page.locator('a[href*="/detay/"]')
    await expect(links.nth(3)).toBeVisible()
    const boxes = await links.evaluateAll((els) =>
      els.map((el, i) => ({ i, y: Math.round(el.getBoundingClientRect().top), x: el.getBoundingClientRect().left, w: el.getBoundingClientRect().width })),
    )
    const viewport = page.viewportSize()!
    const byRow = new Map<number, number[]>()
    for (const b of boxes) {
      if (b.w < 80 || b.y < 80 || b.y > viewport.height - 120 || b.x < 0 || b.x + b.w > viewport.width) continue
      byRow.set(b.y, [...(byRow.get(b.y) ?? []), b.i])
    }
    const rowIndexes = [...byRow.values()].find((r) => r.length >= 4)
    expect(rowIndexes, 'görünür alanda en az 4 kartlı bir satır').toBeTruthy()
    const cards = { nth: (n: number) => links.nth(rowIndexes![n]!) }
    await cards.nth(1).hover()
    await expect.poll(() => mini.count, { timeout: 10_000 }).toBe(1)
    await cards.nth(2).hover()
    await page.waitForTimeout(1500)
    await cards.nth(3).hover()
    await page.waitForTimeout(1500)
    expect(mini.count, 'yandaki karta geçince yeni istek yok').toBe(1)
  })
})

test.describe('Arama', () => {
  test('yazım düzeltmesi, canlı bölüm ve yaşam süresi önbelleği', async ({ page }) => {
    const search = countOperation(page, 'SearchPageQueryResults')
    await signIn(page)

    await page.goto('/#/ara?q=sitnel')
    await expect(page.getByText(/“sintel” için sonuçlar gösteriliyor/)).toBeVisible()
    const afterFirst = search.count

    await page.goto('/#/ara?q=trt')
    await expect.poll(() => search.count, { timeout: 10_000 }).toBeGreaterThan(afterFirst)
    await expect(page.getByRole('heading', { name: 'Şu an canlı' })).toBeVisible()
    await expect(page.getByText('Keşfetmeye devam et')).toBeVisible()
    const afterSecond = search.count

    // Aynı aramaya dönüş: yanıtın `expires` süresi dolmadığı için ağ isteği yok
    await page.goto('/#/ara?q=sitnel')
    await expect(page.getByText(/“sintel” için sonuçlar gösteriliyor/)).toBeVisible()
    await page.waitForTimeout(800)
    expect(search.count).toBe(afterSecond)
    expect(await horizontalOverflow(page)).toBe(0)
  })

  test('istemci çizemediğini bildirdiği türü sunucudan almaz (yetenek pazarlığı)', async ({ page }) => {
    await signIn(page)
    // Arayüz üzerinden: Kanal yeteneği kapatılınca kanal kartları gelmez
    await page.goto('/#/ara?q=trt')
    await expect(page.getByRole('heading', { name: 'Şu an canlı' })).toBeVisible()
    const bodies: string[] = []
    page.on('request', (req) => {
      if (req.url().endsWith('/graphql') && (req.postData() ?? '').includes('SearchPageQueryResults')) bodies.push(req.postData() ?? '')
    })
    await page.getByRole('button', { name: 'Yetenek bildirimi' }).click()
    await page.getByRole('switch', { name: /Kanal/ }).or(page.getByLabel(/Kanal/)).first().click()
    await expect.poll(() => bodies.length, { timeout: 10_000 }).toBeGreaterThan(0)
    expect(bodies.at(-1)).not.toContain('standardChannelTile')
  })
})

test.describe('Canlı TV ve Rehber', () => {
  test('canlı ana sayfa ve rehber gerçek yayın akışını gösterir', async ({ page }) => {
    await signIn(page)
    await page.goto('/#/canli')
    await expect(page.getByRole('heading', { name: 'Kanallarım' })).toBeVisible()
    await expect(page.getByText('TV+ Sinema').first()).toBeVisible()
    await expect(page.getByText('CANLI').first()).toBeVisible()
    expect(await horizontalOverflow(page)).toBe(0)

    await page.goto('/#/rehber')
    await expect(page.getByRole('heading', { name: 'Rehber' })).toBeVisible()
    await expect(page.getByText('TV+ Sinema').first()).toBeVisible()
    expect(await horizontalOverflow(page)).toBe(0)
  })
})

test.describe('Kaputun altı', () => {
  test.skip(offline, 'ağ gerekir (TVP_E2E_OFFLINE=1)')
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 900, 'panel düzeni masaüstünde denenir')

  test('oynatma sırasında hattın adımları panelde görünür', async ({ page }) => {
    await signIn(page)
    await page.goto('/#/izle/Video:80010001')
    await expect.poll(async () => page.evaluate(() => document.querySelector('video')?.currentTime ?? 0), { timeout: 60_000 }).toBeGreaterThan(2)
    await page.keyboard.press('Control+.')
    await page.getByRole('tab', { name: 'Oynatma hattı' }).click()
    for (const step of ['FTL yoklaması', 'MSL anahtar sağlama', 'Lisanslı manifest', 'Bayt-aralığı akışı', 'TTML altyazı']) {
      await expect(page.getByText(step, { exact: false }).first()).toBeVisible()
    }
  })
})
