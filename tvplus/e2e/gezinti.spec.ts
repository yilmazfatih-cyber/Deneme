import type { Page } from '@playwright/test'
import { expect, horizontalOverflow, hoverCard, pageApi, signIn, test, waitForModel, watchGraphql } from './helpers'

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
    // "Deniz için En İyi Seçimler" model hazırken modelin seçimleridir (yeni profilde kural sinyali yok): modeli bekle
    // ve ana sayfayı baştan aç — ilk boyama yine açılış tohumundan gelmeli.
    await waitForModel(page)
    await page.reload()
    await expect(page).toHaveURL(/#\/goz-at$/)

    // Vitrin: başlık, Oynat ve (masaüstünde) Daha Fazla Bilgi. Vitrin başlığı günlük döner; o günün başlığı önceki
    // testlerde yarım izlendiyse düğme "Devam Et" yazar.
    const billboard = page.getByRole('region', { name: /^Öne çıkan: / })
    await expect(billboard).toBeVisible()
    await expect(billboard.getByRole('link', { name: /^(Oynat|Devam Et)/ }).first()).toBeVisible()
    if (!isMobile(page)) await expect(billboard.getByRole('link', { name: 'Daha Fazla Bilgi' })).toBeVisible()

    // Sözlükteki satır adları (UX_SPEC §6)
    await expect(page.getByRole('heading', { name: "Türkiye'de Bugünün Top 10 Dizi Listesi" })).toBeVisible()
    await expect(page.getByRole('heading', { name: /^Yeni Gelenler/ })).toBeVisible()
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
    // Kişisel satır sözlükteki adla (yeri izleme durumuna göre değişir)
    for (let i = 0; i < 8 && !(await page.getByRole('heading', { name: 'Deniz için En İyi Seçimler' }).count()); i++) {
      await page.mouse.wheel(0, 1200)
      await page.waitForTimeout(400)
    }
    await expect(page.getByRole('heading', { name: 'Deniz için En İyi Seçimler' })).toBeAttached()
    const titles = await rowTitles(page)
    expect(
      titles.filter((t, i) => titles.indexOf(t) !== i),
      'aynı satır iki kez yok',
    ).toEqual([])
    expect(await horizontalOverflow(page)).toBe(0)
  })

  test('çocuk profili süzülmüş ana sayfa görür', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Demo hesabıyla devam et/ }).click()
    await page.getByRole('button', { name: 'Çocuk', exact: true }).click()
    await expect(page).toHaveURL(/#\/goz-at$/)
    await expect(page.getByRole('heading', { name: "Türkiye'de Bugünün Top 10 Dizi Listesi" })).toBeVisible()
    // Sintel 13+: çocuk profilinin hiçbir satırında yok
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 1500)
      await page.waitForTimeout(300)
    }
    await expect(page.getByRole('heading', { name: 'Çocuk için En İyi Seçimler' })).toBeAttached()
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
    const row = page.getByRole('region', { name: "Türkiye'de Bugünün Top 10 Film Listesi" })
    await row.evaluate((el) => {
      el.scrollIntoView({ block: 'center' })
    })
    const card = row.locator('a[href*="jbv="]').nth(1)
    const title = ((await card.getAttribute('aria-label')) ?? '').replace(/^\d+\.\s*/, '')
    await hoverCard(page, card)
    const preview = page.getByRole('dialog', { name: `${title} önizlemesi` })
    await expect(preview).toBeVisible()
    await expect.poll(() => gql.ops.filter((o) => o === 'MiniModalQuery').length).toBe(1)
    await expect(preview.getByRole('button', { name: /Listeme Ekle|Listemde/ })).toBeVisible()
    await preview.getByRole('button', { name: 'Daha fazla bilgi' }).last().click()
    await expect(page).toHaveURL(/jbv=\d+/)
    const modal = page.getByRole('dialog', { name: title })
    await expect(modal.getByRole('heading', { name: title, exact: true })).toBeVisible()
    expect(gql.rawQuerySeen, 'sorgu metni hiç gönderilmez').toBe(false)
  })

  test('detay penceresi derin bağlantıyla açılır, Esc ile kapanır ve sayfa yerinde kalır', async ({ page }) => {
    const gql = watchGraphql(page)
    await signIn(page)
    await page.goto('/#/goz-at?jbv=80010001')
    const modal = page.getByRole('dialog', { name: 'Sintel' })
    await expect(modal.getByRole('heading', { name: 'Sintel', exact: true })).toBeVisible()
    await expect(modal.getByRole('link', { name: /^(Oynat|Devam Et), Sintel/ })).toBeVisible()
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
    // Görünür alandaki bir kart (Playwright tıklamadan önce kaydırmasın)
    const index = await page.locator('main a[href*="jbv="]').evaluateAll((els) =>
      els.findIndex((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 80 && r.top > 120 && r.bottom < window.innerHeight - 20
      }),
    )
    expect(index).toBeGreaterThanOrEqual(0)
    await page.mouse.move(700, 20)
    await page.locator('main a[href*="jbv="]').nth(index).click()
    await expect(page.getByRole('dialog').first()).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page).toHaveURL(/#\/goz-at$/)
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - y)).toBeLessThan(5)
  })
})

test.describe('Mobil kurgu', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 900, 'mobil alt çubuk ve ana sayfa seçicisi')

  test('alt çubuk dört sekmedir; ana sayfadaki seçici Canlı TV ile dizi/film arasında geçirir', async ({ page }) => {
    await signIn(page)
    const tabs = page.getByRole('navigation', { name: 'Ana gezinme' })
    await expect(tabs.getByRole('link')).toHaveText(['Ana Sayfa', 'Kısa Videolar', 'Ara', "TV+'ım"])
    const mode = page.getByRole('navigation', { name: 'Ne izlemek istersin' })
    await expect(mode.getByRole('link', { name: 'Dizi ve Film' })).toHaveAttribute('aria-current', 'page')
    await mode.getByRole('link', { name: 'Canlı TV' }).click()
    await expect(page).toHaveURL(/#\/canli/)
    await expect(mode.getByRole('link', { name: 'Canlı TV' })).toHaveAttribute('aria-current', 'page')
    // Canlı TV ana sayfanın içindedir: alt çubukta "Ana Sayfa" etkin kalır
    await expect(tabs.getByRole('link', { name: 'Ana Sayfa' })).toHaveAttribute('aria-current', 'page')
    await mode.getByRole('link', { name: 'Dizi ve Film' }).click()
    await expect(page).toHaveURL(/#\/goz-at$/)
    expect(await horizontalOverflow(page)).toBe(0)
  })

  test('Kısa Videolar: akış açılır, etkin öğe kaydırınca değişir, Listem düğmesi çalışır', async ({ page }) => {
    await signIn(page)
    await page.getByRole('navigation', { name: 'Ana gezinme' }).getByRole('link', { name: 'Kısa Videolar' }).click()
    await expect(page).toHaveURL(/#\/kisa/)
    const feed = page.getByRole('feed', { name: 'Kısa videolar' })
    await expect(feed.getByRole('article').first()).toBeVisible()
    expect(await feed.getByRole('article').count()).toBeGreaterThan(3)
    const active = feed.locator('article.is-active')
    await expect(active).toHaveCount(1)
    const first = await active.getAttribute('aria-label')
    await expect(active.getByRole('link', { name: /Oynat|Bölümleri Gör/ })).toBeVisible()
    const list = active.getByRole('button', { name: 'Listem' })
    await list.click()
    await expect(list).toHaveAttribute('aria-pressed', 'true')
    await list.click()
    await expect(list).toHaveAttribute('aria-pressed', 'false')
    await feed.evaluate((el) => el.scrollBy({ top: el.clientHeight }))
    await expect.poll(async () => active.getAttribute('aria-label')).not.toBe(first)
    expect(await horizontalOverflow(page)).toBe(0)
  })
})

test.describe('Mobil Yeni ve Popüler ve kategoriler', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 900, 'mobil akış')

  test('Yeni ve Popüler: bölüm çipleri, büyük kartlar, Top 10 rakamları; çip bölüme götürür', async ({ page }) => {
    await signIn(page)
    await page.goto('/#/yeni-ve-populer')
    const chips = page.getByRole('navigation', { name: 'Bölümler' })
    await expect(chips.getByRole('button', { name: 'Herkes Bunları İzliyor' })).toBeVisible()
    // Çok Yakında: canlı TV'nin sıradaki yayınları; karttan hatırlatma kurulur ve kaldırılır
    await expect(chips.getByRole('button').first()).toHaveText(/Çok Yakında/)
    const soon = page.getByRole('region', { name: 'Çok Yakında' })
    const soonCard = soon.getByRole('article').first()
    await expect(soonCard.getByText(/başlıyor$/)).toBeVisible()
    await soonCard.getByRole('button', { name: 'Bana Hatırlat' }).click()
    const reminded = soonCard.getByRole('button', { name: 'Hatırlatma Kuruldu' })
    await expect(reminded).toHaveAttribute('aria-pressed', 'true')
    await reminded.click()
    await expect(soonCard.getByRole('button', { name: 'Bana Hatırlat' })).toHaveAttribute('aria-pressed', 'false')
    expect(await soon.getByRole('article').count()).toBeLessThanOrEqual(3)
    await expect(page.getByRole('heading', { name: 'Herkes Bunları İzliyor', level: 2 })).toBeVisible()
    const top10 = page.getByRole('region', { name: "Türkiye'de Bugünün Top 10 Dizi Listesi" })
    await expect(top10.getByRole('article').first()).toBeVisible()
    await expect(top10.getByRole('article').first()).toHaveAttribute('aria-label', /^1\. /)
    await expect(top10.getByText('Bugün dizilerde 1 numara')).toBeVisible()
    await chips.getByRole('button', { name: 'Top 10 Film Listesi' }).click()
    await expect(
      page.getByRole('heading', { name: "Türkiye'de Bugünün Top 10 Film Listesi", level: 2 }),
    ).toBeInViewport()
    // Karttan Listem'e ekle / çıkar
    const first = page.getByRole('region', { name: 'Herkes Bunları İzliyor' }).getByRole('article').first()
    const list = first.getByRole('button', { name: 'Listem' })
    await list.click()
    await expect(list).toHaveAttribute('aria-pressed', 'true')
    await list.click()
    await expect(list).toHaveAttribute('aria-pressed', 'false')
    expect(await horizontalOverflow(page)).toBe(0)
  })

  test('Kategoriler: hızlı erişim, sana özel alt türler ve türler grupları', async ({ page }) => {
    await signIn(page)
    await page.getByRole('button', { name: 'Kategoriler' }).click()
    const nav = page.getByRole('navigation', { name: 'Tüm kategoriler' })
    await expect(nav.getByRole('heading', { name: 'Hızlı erişim' })).toBeVisible()
    await expect(nav.getByRole('heading', { name: 'Sana özel alt türler' })).toBeVisible()
    await expect(nav.getByRole('heading', { name: 'Tüm alt türler' })).toBeVisible()
    await expect(nav.getByRole('heading', { name: 'Türler', exact: true })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Kısa Videolar' })).toBeVisible()
    expect(await nav.getByRole('link').count()).toBeGreaterThan(30)
    // Dizindeki bir alt tür kendi sayfasına götürür
    await nav.locator('a[href*="/tur/mg_"]').last().click()
    await expect(page).toHaveURL(/#\/tur\/mg_/)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  })
})

test.describe('Masaüstü Yeni ve Popüler', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 900, 'masaüstü düzeni')

  test('üst menüde Kısa Videolar; satırların altında Çok Yakında ve hatırlatma', async ({ page }) => {
    await signIn(page)
    await page.goto('/#/yeni-ve-populer')
    const menu = page.getByRole('navigation', { name: 'Bölümler' })
    await expect(menu.getByRole('link', { name: 'Kısa Videolar' })).toBeVisible()
    const soon = page.getByRole('region', { name: 'Çok Yakında' })
    await soon.scrollIntoViewIfNeeded()
    const card = soon.getByRole('article').first()
    await card.getByRole('button', { name: 'Bana Hatırlat' }).click()
    await expect(card.getByRole('button', { name: 'Hatırlatma Kuruldu' })).toBeVisible()
    await card.getByRole('button', { name: 'Hatırlatma Kuruldu' }).click()
    await expect(card.getByRole('button', { name: 'Bana Hatırlat' })).toBeVisible()
    expect(await horizontalOverflow(page)).toBe(0)
    await menu.getByRole('link', { name: 'Kısa Videolar' }).click()
    await expect(page.getByRole('feed', { name: 'Kısa videolar' })).toBeVisible()
  })
})

test.describe('Mobil başlık sayfası', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 900, 'detay mobilde tam sayfadır')

  test('/baslik/80010001 sekmeleriyle açılır; ?jbv= mobilde sayfaya çevrilir', async ({ page }) => {
    await signIn(page)
    await page.goto('/#/baslik/80010001')
    const article = page.getByRole('article', { name: 'Sintel' })
    await expect(article.getByRole('heading', { name: 'Sintel', level: 1 })).toBeVisible()
    await expect(article.getByRole('link', { name: /^(Oynat|Devam Et), Sintel/ })).toBeVisible()
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
      const r = await pageApi<{ items: { id: string }[] }>(
        page,
        'GET',
        '/api/studio/microgenres?layer=VISIBLE&first=1',
        undefined,
        { studioKey: true },
      )
      mgHref = `#/tur/${r.json!.items[0]!.id}`
    }
    await page.goto(`/${mgHref}`)
    await expect(page).toHaveURL(/#\/tur\/mg_/)
    await expect(page.locator('main h1')).not.toHaveText('')
    await expect.poll(() => page.locator('main a[href*="jbv="], main a[href*="/baslik/"]').count()).toBeGreaterThan(1)
    expect(await horizontalOverflow(page)).toBe(0)

    // Tür sayfası: detay penceresinin "Türler" bağlantısından değil, doğrudan tür kimliğiyle
    await page.goto('/#/tur/7424')
    await expect(page.locator('main').getByRole('heading', { name: 'Animasyon', level: 1 })).toBeVisible()
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
      await page.waitForTimeout(500)
      expect(await horizontalOverflow(page), `${path} yatay taşma`).toBe(0)
    }
  })
})
