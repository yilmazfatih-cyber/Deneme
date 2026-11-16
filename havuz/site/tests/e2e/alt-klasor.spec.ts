import { expect, test } from '@playwright/test'
import { expectNoSeriousA11yIssues } from './helpers.ts'

/** Bu dosya yalnız "alt-klasor" projesinde koşar: site /alt/klasor/ altında yayınlanmış gibi (dist-alt/). */
test.describe('alt klasörde yayın', () => {
  test('stil ve yazı tipi yüklenir, iç bağlantılar alt klasörde kalır', async ({ page }) => {
    const failed: string[] = []
    page.on('response', (response) => {
      if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`)
    })
    await page.goto('./')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain('Figtree')
    await page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: 'Blog' }).click()
    await expect(page).toHaveURL(/\/alt\/klasor\/blog\/$/u)
    await page
      .getByRole('link', { name: /SEO temel denetim listesi/u })
      .first()
      .click()
    await expect(page).toHaveURL(/\/alt\/klasor\/blog\/seo-temel-denetim-listesi\/$/u)
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      /\/alt\/klasor\/og\/blog\/seo-temel-denetim-listesi\.png$/u,
    )
    expect(failed).toEqual([])
  })

  test('arama dizini alt klasörden yüklenir', async ({ page }) => {
    await page.goto('./belgeler/')
    await page.getByRole('button', { name: 'Ara' }).click()
    const dialog = page.getByRole('dialog', { name: 'Sitede ara' })
    await dialog.getByRole('searchbox').fill('yayınlama')
    const result = dialog.getByRole('link', { name: /Yayınlama/u }).first()
    await expect(result).toHaveAttribute('href', /^\/alt\/klasor\/belgeler\/yayinlama\/$/u)
  })

  test('form uç noktası tanımlıyken iletiyi JSON olarak gönderir; hata olursa e-posta yolunu gösterir', async ({
    page,
  }) => {
    const bodies: unknown[] = []
    let fail = false
    await page.route('https://form.example/gonder', async (route) => {
      bodies.push(route.request().postDataJSON())
      await route.fulfill(
        fail ? { status: 500, body: 'hata' } : { status: 200, contentType: 'application/json', body: '{"ok":true}' },
      )
    })
    await page.clock.install()
    await page.goto('./iletisim/')
    await page.getByLabel('Adınız').fill('Ayşe Kaya')
    await page.getByLabel('E-posta adresiniz').fill('ayse@ornek.com')
    await page.getByLabel('İletiniz').fill('Deneme sürümü hakkında bilgi almak istiyorum.')
    await page.clock.fastForward(4000)
    await page.getByRole('button', { name: 'Gönder' }).click()
    await expect(page.getByRole('status')).toHaveText(
      'Teşekkürler, iletiniz bize ulaştı. En kısa sürede yanıtlayacağız.',
    )
    expect(bodies[0]).toMatchObject({ name: 'Ayşe Kaya', email: 'ayse@ornek.com', lang: 'tr' })
    await expect(page.getByLabel('Adınız')).toHaveValue('')

    fail = true
    await page.getByLabel('Adınız').fill('Ayşe Kaya')
    await page.getByLabel('E-posta adresiniz').fill('ayse@ornek.com')
    await page.getByLabel('İletiniz').fill('İkinci deneme, bu kez sunucu hata verecek.')
    await page.getByRole('button', { name: 'Gönder' }).click()
    await expect(page.getByRole('status')).toContainText('İleti gönderilemedi')
    await expect(page.getByRole('status').getByRole('link')).toHaveAttribute('href', 'mailto:merhaba@sedir.example')
  })

  test('bülten kaydı: geçersiz adresi açıklar, geçerliyi gönderir', async ({ page }) => {
    const bodies: unknown[] = []
    await page.route('https://bulten.example/abone', async (route) => {
      bodies.push(route.request().postDataJSON())
      await route.fulfill({ status: 200, body: '{}' })
    })
    await page.goto('./blog/')
    const form = page.locator('[data-newsletter-form]')
    const email = form.getByLabel('E-posta adresiniz')
    await email.fill('yanlis')
    await form.getByRole('button', { name: 'Abone ol' }).click()
    await expect(email).toHaveAttribute('aria-invalid', 'true')
    await expect(email).toHaveAccessibleDescription('Geçerli bir e-posta adresi yazın.')
    await email.fill('okur@ornek.com')
    await form.getByRole('button', { name: 'Abone ol' }).click()
    await expect(form.getByRole('status')).toHaveText('Kaydınız alındı, teşekkürler.')
    expect(bodies).toEqual([{ email: 'okur@ornek.com', lang: 'tr' }])
    await expectNoSeriousA11yIssues(page, 'alt klasör blog (bülten açık)')
  })
})
