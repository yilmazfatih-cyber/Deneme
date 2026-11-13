import type { Page } from '@playwright/test'
import { expect, horizontalOverflow, pageApi, signIn, test, watchGraphql } from './helpers'

/**
 * Web ve mobil yolculukları: karşılama → demo girişi → profil kapısı → ana sayfa (vitrin + sözlükteki satır adları),
 * satırların kaydırdıkça yüklenmesi, sayfalı satır, önizleme kartı, detay penceresi / mobil başlık sayfası,
 * Listem, kategori ve tür sayfaları, eski yolların yönlendirmesi, 390 px'te yatay taşma.
 */

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) < 900

/** Ana sayfadaki satır başlıkları (h2; "Tümünü Gör" eki atılır). */
async function rowTitles(page: Page): Promise<string[]> {
  const raw = await page.locator('main h2').allInnerTexts()
  return raw.map((t) => t.replace(/\s*Tümünü Gör\s*$/, '').trim()).filter(Boolean)
}

test.describe('Ana sayfa', () => {
  test('giriş → profil kapısı → vitrin ve sözlükteki satırlar; Falcor isteği ilk kaydırmaya dek çıkmaz', async ({
    page,
  }) => {
    const falcor: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/member/pathEvaluator')) falcor.push(req.postData() ?? '')
    })

    await page.goto('/')
    await expect(page).toHaveURL(/#\/karsilama/)
    await expect(page.getByRole('heading', { name: 'Filmler, diziler ve canlı TV tek yerde' })).toBeVisible()
    await page.getByRole('button', { name: /Demo hesabıyla devam et/ }).click()
    await expect(page).toHaveURL(/#\/profiller/)
    await expect(page.getByRole('heading', { name: 'Kim izliyor?' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Profilleri Yönet' })).toBeVisible()
    await page.getByRole('button', { name: 'Deniz', exact: true }).click()
    await expect(page).toHaveURL(/#\/goz-at$/)

    // Vitrin: başlık, Oynat ve (masaüstünde) Daha Fazla Bilgi
    const billboard = page.getByRole('region', { name: /^Öne çıkan: / })
    await expect(billboard).toBeVisible()
    await expect(billboard.getByRole('link', { name: /^Oynat/ }).first()).toBeVisible()
    if (!isMobile(page)) await expect(billboard.getByRole('link', { name: 'Daha Fazla Bilgi' })).toBeVisible()

    // Sözlükteki satır adları (UX_SPEC §6)
    await expect(page.getByRole('heading', { name: "Türkiye'de Bugünün Top 10 Dizi Listesi" })).toBeVisible()
    await expect(page.getByRole('heading', { name: /^Yeni Gelenler/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Deniz için En İyi Seçimler' })).toBeAttached()
    if (isMobile(page)) await expect(page.getByRole('heading', { name: 'Deniz için', level: 1 })).toBeVisible()

    // Açılış tohumu ekrandaki satırlara yeter: kaydırmadan Falcor isteği yok
    await page.waitForTimeout(2500)
    expect(falcor, 'ilk kaydırmadan önce pathEvaluator isteği yok').toHaveLength(0)
    const before = (await rowTitles(page)).length

    // Kaydırınca kalan satırlar yol yol istenir ve çizilir
    for (let i = 0; i < 6 && falcor.length === 0; i++) {
      await page.mouse.wheel(0, 1500)
      await page.waitForTimeout(400)
    }
    await expect.poll(() => falcor.length, { message: 'kaydırınca pathEvaluator isteği' }).toBeGreaterThan(0)
    expect(falcor[0]).toContain('path=')
    expect(falcor[0]).toContain('authURL=')
    await expect.poll(async () => (await rowTitles(page)).length).toBeGreaterThan(before)
    expect(await horizontalOverflow(page)).toBe(0)
  })

  test('çocuk profili süzülmüş ana sayfa görür', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Demo hesabıyla devam et/ }).click()
    await page.getByRole('button', { name: 'Çocuk', exact: true }).click()
    await expect(page).toHaveURL(/#\/goz-at$/)
    await expect(page.getByRole('heading', { name: 'Çocuk için En İyi Seçimler' })).toBeAttached()
    await expect(page.getByRole('heading', { name: "Türkiye'de Bugünün Top 10 Dizi Listesi" })).toBeVisible()
    // Sintel 13+: çocuk profilinin hiçbir satırında yok
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, 1500)
      await page.waitForTimeout(300)
    }
    await page.waitForTimeout(1000)
    await expect(page.locator('a[href*="80010001"]')).toHaveCount(0)
    expect(await horizontalOverflow(page)).toBe(0)
  })
})

test.describe('Satırlar ve önizleme (masaüstü)', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 900, 'sayfalı satır ve üzerine gelme yalnız masaüstünde')

  test('satır tutamacıyla sayfa sayfa kayar', async ({ page }) => {
    await signIn(page)
    const row = page.getByRole('region', { name: /^Yeni Gelenler/ })
    await row.scrollIntoViewIfNeeded()
    const slider = row.locator('xpath=ancestor-or-self::section[@data-page]').first()
    await expect(slider).toHaveAttribute('data-page', '0')
    await row.hover()
    await row.getByRole('button', { name: 'Sonraki sayfa' }).click()
    await expect(slider).toHaveAttribute('data-page', '1')
    await expect(row.getByRole('button', { name: 'Önceki sayfa' })).toBeVisible()
    await row.hover()
    await row.getByRole('button', { name: 'Önceki sayfa' }).click()
    await expect(slider).toHaveAttribute('data-page', '0')
  })

  test('önizleme kartı açılır, satır tek MiniModalQuery ile ön yüklenir; ⌄ detay penceresini açar', async ({
    page,
  }) => {
    const gql = watchGraphql(page)
    await signIn(page)
    const row = page.getByRole('region', { name: /^Yeni Gelenler/ })
    await row.evaluate((el) => {
      el.scrollIntoView({ block: 'center' })
    })
    await page.waitForTimeout(600)
    const cards = row.locator('a[href*="jbv="]')
    const first = cards.first()
    const title = (await first.getAttribute('aria-label')) ?? (await first.innerText()).split('\n')[0]!
    await first.hover()
    const preview = page.getByRole('dialog', { name: `${title} önizlemesi` })
    await expect(preview).toBeVisible()
    await expect.poll(() => gql.ops.filter((o) => o === 'MiniModalQuery').length).toBe(1)
    await expect(preview.getByRole('button', { name: /Listeme Ekle|Listemde/ })).toBeVisible()
    await preview.getByRole('button', { name: 'Daha fazla bilgi' }).last().click()
    await expect(page).toHaveURL(/jbv=\d+/)
    const modal = page.getByRole('dialog', { name: title })
    await expect(modal.getByRole('heading', { name: title }).first()).toBeVisible()
    expect(gql.rawQuerySeen, 'sorgu metni hiç gönderilmez').toBe(false)
  })

  test('detay penceresi derin bağlantıyla açılır, Esc ile kapanır ve sayfa yerinde kalır', async ({ page }) => {
    const gql = watchGraphql(page)
    await signIn(page)
    await page.goto('/#/goz-at?jbv=80010001')
    const modal = page.getByRole('dialog', { name: 'Sintel' })
    await expect(modal.getByRole('heading', { name: 'Sintel' })).toBeVisible()
    await expect(modal.getByRole('link', { name: /^Oynat, Sintel/ })).toBeVisible()
    await expect(modal.getByRole('region', { name: 'Benzerleri' })).toBeVisible()
    await expect(modal.getByText(/Ortak: /).first()).toBeVisible()
    expect(gql.ops).toContain('DetailModal')
    await page.keyboard.press('Escape')
    await expect(modal).toBeHidden()
    await expect(page).toHaveURL(/#\/goz-at$/)

    // Kaydırılmış sayfadan karta basıp kapatınca konum korunur
    await page.mouse.wheel(0, 900)
    await page.waitForTimeout(500)
    const y = await page.evaluate(() => window.scrollY)
    expect(y).toBeGreaterThan(300)
    const card = page.locator('main a[href*="jbv="]:visible').first()
    await card.click()
    await expect(page.getByRole('dialog').first()).toBeVisible()
    expect(await page.evaluate(() => window.scrollY), 'pencere açıkken arkadaki sayfa kaymaz').toBeCloseTo(y, -1)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page).toHaveURL(/#\/goz-at$/)
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - y)).toBeLessThan(5)
  })
})

test.describe('Mobil başlık sayfası', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 900, 'detay mobilde tam sayfadır')

  test('/baslik/80010001 sekmeleriyle açılır; ?jbv= mobilde sayfaya çevrilir', async ({ page }) => {
    await signIn(page)
    await page.goto('/#/baslik/80010001')
    const article = page.getByRole('article', { name: 'Sintel' })
    await expect(article.getByRole('heading', { name: 'Sintel', level: 1 })).toBeVisible()
    await expect(article.getByRole('link', { name: /^Oynat, Sintel/ })).toBeVisible()
    const tabs = article.getByRole('tablist', { name: 'Başlık bölümleri' })
    await expect(tabs.getByRole('tab', { name: 'Benzerleri' })).toHaveAttribute('aria-selected', 'true')
    await expect(article.getByRole('tabpanel', { name: 'Benzerleri' }).getByRole('link').first()).toBeVisible()
    await tabs.getByRole('tab', { name: 'Hakkında' }).click()
    await expect(article.getByRole('tabpanel', { name: 'Hakkında' })).toBeVisible()
    expect(await horizontalOverflow(page)).toBe(0)

    await page.goto('/#/goz-at?jbv=80010002')
    await expect(page).toHaveURL(/#\/baslik\/80010002/)
    await expect(page.getByRole('heading', { name: 'Tears of Steel', level: 1 })).toBeVisible()
  })
})

test.describe('Listem', () => {
  test('Listeme ekle → /listem → çıkar', async ({ page }) => {
    // Projeler paralel koştuğu için her biri ayrı başlıkla çalışır (aynı Deniz profili)
    const mobile = isMobile(page)
    const { id, title } = mobile ? { id: 80030010, title: 'Charge' } : { id: 80030007, title: 'Spring' }
    await signIn(page)
    if (mobile) {
      await page.goto(`/#/baslik/${id}`)
      const toggle = page.getByRole('button', { name: 'Listem' })
      await expect(toggle).toHaveAttribute('aria-pressed', 'false')
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    } else {
      await page.goto(`/#/goz-at?jbv=${id}`)
      const modal = page.getByRole('dialog', { name: title })
      await modal.getByRole('button', { name: 'Listeme Ekle' }).first().click()
      await expect(modal.getByRole('button', { name: 'Listemden Çıkar' }).first()).toBeVisible()
    }
    await page.goto('/#/listem')
    const grid = page.getByRole('list', { name: 'Listendeki başlıklar' })
    await expect(grid.getByRole('link', { name: title, exact: true })).toBeVisible()
    await grid.getByRole('button', { name: `${title}, listemden çıkar` }).click()
    await expect(grid.getByRole('link', { name: title, exact: true })).toHaveCount(0)
    await expect(page.getByText(`${title} listenden çıkarıldı`)).toBeVisible()
    // Sunucuda da çıktı: yeniden yükleyince yok
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Listem', level: 1 })).toBeVisible()
    await page.waitForTimeout(1000)
    await expect(page.getByRole('link', { name: title, exact: true })).toHaveCount(0)
  })
})

test.describe('Göz atma sayfaları', () => {
  test('Diziler, Filmler, Yeni ve Popüler satır çizer; tür ve mikro tür sayfası ızgara çizer', async ({ page }) => {
    await signIn(page)
    for (const [path, heading] of [
      ['/goz-at/diziler', "Türkiye'de Bugünün Top 10 Dizi Listesi"],
      ['/goz-at/filmler', "Türkiye'de Bugünün Top 10 Film Listesi"],
      ['/yeni-ve-populer', 'Yeni Gelenler'],
    ] as const) {
      await page.goto(`/#${path}`)
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
      expect(await horizontalOverflow(page), `${path} yatay taşma`).toBe(0)
    }
    await expect(page.getByRole('heading', { name: "Türkiye'de Bugünün Top 10 Film Listesi" })).toBeVisible()

    // Bir satırın "Tümünü Gör" bağlantısından mikro tür sayfası (Diziler sayfasında mikro tür satırı var)
    await page.goto('/#/goz-at/diziler')
    const seeAll = page.locator('main a[href*="/tur/mg_"]').first()
    let mgHref = await seeAll.getAttribute('href', { timeout: 10_000 }).catch(() => null)
    if (!mgHref) {
      // Satırda yoksa stüdyo uçlarından görünen bir mikro tür
      const r = await pageApi<{ items: { id: string }[] }>(page, 'GET', '/api/studio/microgenres?layer=VISIBLE&first=1')
      mgHref = `#/tur/${r.json!.items[0]!.id}`
    }
    await page.goto(`/${mgHref}`)
    await expect(page).toHaveURL(/#\/tur\/mg_/)
    await expect(page.locator('main h1')).not.toHaveText('')
    await expect.poll(() => page.locator('main a[href*="jbv="], main a[href*="/baslik/"]').count()).toBeGreaterThan(1)
    expect(await horizontalOverflow(page)).toBe(0)

    // Tür sayfası: detay penceresinin "Türler" bağlantısından değil, doğrudan tür kimliğiyle
    await page.goto('/#/tur/7424')
    await expect(page.getByRole('heading', { name: 'Animasyon', level: 1 })).toBeVisible()
    await expect.poll(() => page.locator('main a[href*="jbv="], main a[href*="/baslik/"]').count()).toBeGreaterThan(3)
    expect(await horizontalOverflow(page)).toBe(0)
  })

  test('birinci turun yolları yeni yollara yönlenir', async ({ page }) => {
    await signIn(page)
    await page.goto('/#/film-dizi')
    await expect(page).toHaveURL(/#\/goz-at$/)
    await page.goto('/#/kitaplik')
    await expect(page).toHaveURL(/#\/listem$/)
    await page.goto('/#/detay/80010001')
    if (isMobile(page)) await expect(page).toHaveURL(/#\/baslik\/80010001/)
    else await expect(page).toHaveURL(/#\/goz-at\?jbv=80010001/)
    await expect(page.getByRole('heading', { name: 'Sintel' }).first()).toBeVisible()
  })

  test('ana sayfalarda yatay kaydırma yok', async ({ page }) => {
    await signIn(page)
    for (const path of ['/goz-at', '/canli', '/rehber', '/listem', '/ara', '/tvplusim', '/yeni-ve-populer']) {
      await page.goto(`/#${path}`)
      await page.waitForLoadState('networkidle').catch(() => undefined)
      await page.waitForTimeout(500)
      expect(await horizontalOverflow(page), `${path} yatay taşma`).toBe(0)
    }
  })
})
