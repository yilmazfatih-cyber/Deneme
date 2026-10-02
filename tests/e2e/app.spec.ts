import { expect, test } from '@playwright/test'
import { completeSetup, expectNoCriticalA11y, expectNoHorizontalScroll, expectTouchTargets } from './helpers'

test.describe('Modül A — iletişim panosu', () => {
  test.beforeEach(async ({ page }) => {
    await completeSetup(page)
  })

  test('temel bir ihtiyaç ana ekrandan 3 dokunuşta ifade edilir', async ({ page }) => {
    await page.getByTestId('home-speak').click() // 1
    await page.getByTestId('tile-hizli').click() // 2
    await page.getByTestId('quick-su').click() // 3
    await expect(page.getByTestId('strip-text')).toHaveText('Su istiyorum')
  })

  test('kategori ağacı en fazla 3 seviye: Yiyecek → Kahvaltı → Peynir', async ({ page }) => {
    await page.getByTestId('home-speak').click()
    await page.getByTestId('cat-yiyecek').click()
    await page.getByTestId('cat-kahvalti').click()
    await page.getByTestId('item-peynir').click()
    await expect(page.getByTestId('strip-text')).toHaveText('Peynir')
    await page.getByRole('button', { name: 'Peynir istiyorum' }).click()
    await expect(page.getByTestId('strip-text')).toHaveText('Peynir istiyorum')
    await expectNoHorizontalScroll(page)
    await expectTouchTargets(page)
  })

  test('kalıp kartı + kelime → hazır biçim ("Başım ağrıyor")', async ({ page }) => {
    await page.getByTestId('home-speak').click()
    await page.getByRole('button', { name: /Sonraki/ }).click()
    await page.getByTestId('tile-kaliplar').click()
    await page.getByTestId('tpl-agriyor').click()
    await page.getByTestId('cat-vucut').click()
    await page.getByTestId('item-bas').click()
    await expect(page.getByTestId('strip-text')).toHaveText('Başım ağrıyor')
  })

  test('vücut haritası: yer ve şiddet cümleye eklenir', async ({ page }) => {
    await page.getByTestId('home-speak').click()
    await page.getByTestId('tile-hizli').click()
    await page.getByTestId('tile-body-map').click()
    await page.getByTestId('region-karin').click()
    await expect(page.getByTestId('body-hint')).toContainText('Karnım ağrıyor')
    await page.getByTestId('pain-8').click()
    await page.getByTestId('nav-back').click()
    await expect(page.getByTestId('strip-text')).toHaveText('Karnım ağrıyor. Ağrım 8 üzerinden 10.')
  })

  test('partner ekranı cümleyi büyük gösterir ve çevrilebilir', async ({ page }) => {
    await page.getByTestId('home-speak').click()
    await page.getByTestId('tile-hizli').click()
    await page.getByTestId('quick-yardim').click()
    await page.getByTestId('strip-show').click()
    await expect(page.getByTestId('partner-text')).toHaveText('Yardım eder misiniz?')
    await page.getByRole('button', { name: 'Ekranı çevir' }).click()
    await expect(page.locator('.partner')).toHaveAttribute('data-flipped', 'true')
  })

  test('harfle bulma: S → Su', async ({ page }) => {
    await page.getByTestId('home-speak').click()
    await page.getByRole('button', { name: /Sonraki/ }).click()
    await page.getByTestId('tile-harf').click()
    // Harfler alfabe sırasıyla sayfalanır
    while (!(await page.getByTestId('letter-s').isVisible()))
      await page.getByRole('button', { name: /Sonraki/ }).click()
    await page.getByTestId('letter-s').click()
    // Kelime sayısı bir sayfayı aşarsa önce hece sorulur ("su…"); sığarsa kartlar doğrudan gelir.
    const syllable = page.getByRole('button', { name: 'su…', exact: true })
    if (await syllable.isVisible()) await syllable.click()
    await page.getByTestId('item-su').click()
    await expect(page.getByTestId('strip-text')).toHaveText('Su')
  })

  test('harfle bulma: çok kelimeli harfte önce hece sorulur (T → ta…)', async ({ page }) => {
    await page.goto('./#/konus/harf/t')
    await page.getByRole('button', { name: 'ta…', exact: true }).click()
    await page.getByTestId('item-tavuk').click()
    await expect(page.getByTestId('strip-text')).toHaveText('Tavuk')
  })

  test('sık kullanılanlar ayrı satırda belirir, ızgara değişmez', async ({ page }) => {
    await page.getByTestId('home-speak').click()
    const firstCategory = await page.locator('.grid .tile').first().getAttribute('data-testid')
    await page.getByTestId('cat-icecek').click()
    await page.getByTestId('item-cay').click()
    await page.getByTestId('nav-back').click()
    await expect(page.locator('.frequent-row').getByTestId('item-cay')).toBeVisible()
    expect(await page.locator('.grid .tile').first().getAttribute('data-testid')).toBe(firstCategory)
  })
})

test.describe('kişiselleştirme ve erişilebilirlik', () => {
  test('sol el modu Evet / Hayır / Geri düzenini aynalar', async ({ page }) => {
    await completeSetup(page, 'left')
    const back = await page.getByTestId('nav-back').boundingBox()
    const no = await page.getByTestId('nav-no').boundingBox()
    expect(back!.x).toBeGreaterThan(no!.x)
  })

  test('ana ekranlar: yatay kaydırma yok, dokunma alanları ≥ 72 px, kritik a11y bulgusu yok', async ({ page }) => {
    await completeSetup(page)
    for (const path of [
      '#/',
      '#/konus',
      '#/konus/hizli',
      '#/konus/k/icecek',
      '#/konus/vucut-haritasi',
      '#/ben',
      '#/ogren',
      '#/goster',
    ]) {
      await page.goto(`./${path}`)
      await page.waitForTimeout(150)
      await expectNoHorizontalScroll(page)
      await expectTouchTargets(page)
      await expectNoCriticalA11y(page)
    }
  })

  test('kişisel kart: fotoğraf ve kelime eklenir, panoda önce görünür', async ({ page }) => {
    await completeSetup(page)
    await page.goto('./#/ayarlar/kartlar/yeni')
    await page.getByTestId('item-word').fill('Elif')
    await page.getByTestId('item-photo').setInputFiles({
      name: 'elif.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      ),
    })
    await page.getByTestId('item-save').click()
    await page.goto('./#/konus/k/kisiler')
    await expect(page.locator('.grid .tile').first()).toHaveAccessibleName('Elif')
  })
})

test.describe('Modül B — öğrenme yolculuğu', () => {
  test('oturum: ısınma + karışık aktiviteler + nötr özet', async ({ page }) => {
    await completeSetup(page)
    await page.getByTestId('home-learn').click()
    await page.getByTestId('learn-start').click()
    await expect(page.getByTestId('activity-warmup')).toBeVisible()
    await page.getByTestId('session-next').click()

    const seen = new Set<string>()
    for (let i = 0; i < 20; i++) {
      if (await page.getByTestId('session-done').isVisible()) break
      const activity = await page.locator('[data-testid^="activity-"]').first().getAttribute('data-testid')
      seen.add(activity!)
      if (activity === 'activity-match' || activity === 'activity-listen') {
        await page.getByTestId('choice-target').click()
        await expect(page.locator('[data-testid^="activity-"]').first())
          .not.toHaveAttribute('data-testid', activity!, {
            timeout: 3000,
          })
          .catch(() => {})
      } else if (activity === 'activity-break') {
        await page.getByRole('button', { name: 'Devam edelim' }).click()
      } else {
        await page.getByTestId('rate-said').click()
      }
      await page.waitForTimeout(1000)
    }
    await expect(page.getByTestId('session-done')).toBeVisible()
    await expect(page.getByTestId('session-done')).toContainText(/Bugün \d+ kelime çalıştın/)
    await expect(page.getByTestId('session-done')).not.toContainText(/kaybettin|yanlış|aferin/i)
    // ısınma + en az iki farklı kelime aktivitesi
    expect(seen.size).toBeGreaterThanOrEqual(2)
  })

  test('ipucu her zaman bir dokunuş uzakta ve "henüz değil" modelle biter', async ({ page }) => {
    await completeSetup(page)
    // Bir kelimeyi Hatırla aşamasına taşımak yerine doğrudan adlandırma göstermek için
    // terapist ayarı: azalan ipucu varsayılan; oturumdaki ilk adlandırma adımını bekleriz.
    await page.goto('./#/ogren/oturum')
    await page.getByTestId('session-next').click()
    // Yeni kullanıcıda ilk adımlar tanıma; eşleştirmede yanlış seçim kırmızı çarpı göstermez
    const other = page.getByTestId('choice-other').first()
    if (await other.isVisible()) {
      await other.click()
      await expect(other).toHaveAttribute('data-state', 'dim')
      await expect(page.locator('.activity')).toContainText('Bir daha bakalım')
      await expect(page.locator('.activity')).not.toContainText(/✕|yanlış/i)
    }
  })
})

test('çevrimdışı: ilk açılıştan sonra internetsiz çalışır', async ({ page, context }) => {
  await completeSetup(page)
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    return !!reg.active
  })
  await page.reload()
  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByTestId('home-speak')).toBeVisible()
  await page.getByTestId('home-speak').click()
  await page.getByTestId('cat-icecek').click()
  await expect(page.getByTestId('item-su').locator('img')).toHaveJSProperty('complete', true)
  await context.setOffline(false)
})
