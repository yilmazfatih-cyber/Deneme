/**
 * Sitenin iletişim formu GERÇEK uygulama API'sine gönderir (iki ayrı süreç, iki köken). Senaryolar: JavaScript
 * açık (JSON + CORS) ve kapalı (düz form → API'nin teşekkür sayfası) gönderim, bal küpü (istek hiç gitmez).
 * Posta kutusu (mail_outbox) ve kötüye kullanım (köken, ön istek, hız sınırı) denetimleri dogrula.py'dedir.
 * Hız sınırı bütçesi: bu dosya API'ye 2 ileti gönderir.
 */
import { expect, test } from '@playwright/test'

const API_URL = process.env.API_URL ?? ''

test.beforeAll(() => {
  expect(API_URL, 'API_URL ortam değişkenini verin (dogrula.py verir)').not.toBe('')
})

test('JavaScript açık: ileti API’ye JSON gider, sayfadan ayrılmadan teşekkür görünür', async ({ page }) => {
  await page.clock.install()
  await page.goto('./iletisim/')
  await page.getByLabel('Adınız').fill('Ayşe Kaya')
  await page.getByLabel('E-posta adresiniz').fill('ayse@ornek.com')
  await page.getByLabel('İletiniz').fill('Fiyatlar hakkında bilgi almak istiyorum (JS açık).')
  await page.clock.fastForward(4000)
  const response = page.waitForResponse((r) => r.url() === `${API_URL}/api/iletisim` && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Gönder' }).click()
  expect((await response).status()).toBe(200)
  await expect(page.getByRole('status')).toHaveText('Teşekkürler, iletiniz bize ulaştı. En kısa sürede yanıtlayacağız.')
  await expect(page).toHaveURL(/\/iletisim\/$/u)
})

test('JavaScript kapalı: düz form API’ye gider, teşekkür sayfası siteye geri bağlar', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, locale: 'tr-TR' })
  const page = await context.newPage()
  await page.goto(new URL('./iletisim/', `${process.env.SITE_URL}/`).href)
  await page.getByLabel('Adınız').fill('Ali Yılmaz')
  await page.getByLabel('E-posta adresiniz').fill('ali@ornek.com')
  await page.getByLabel('İletiniz').fill('JavaScript kapalı tarayıcıdan bir ileti.')
  await page.getByRole('button', { name: 'Gönder' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'İletiniz alındı' })).toBeVisible()
  expect(page.url()).toBe(`${API_URL}/api/iletisim`)
  await page.getByRole('link', { name: 'Siteye dönün' }).click()
  await expect(page).toHaveURL(new RegExp(`^${process.env.SITE_URL ?? ''}`, 'u'))
  await context.close()
})

test('bal küpü doluysa başarılı görünür ama API’ye hiç istek gitmez', async ({ page }) => {
  const toApi: string[] = []
  page.on('request', (request) => {
    if (request.url().startsWith(API_URL)) toApi.push(request.url())
  })
  await page.clock.install()
  await page.goto('./iletisim/')
  await page.getByLabel('Adınız').fill('Bot')
  await page.getByLabel('E-posta adresiniz').fill('bot@ornek.com')
  await page.getByLabel('İletiniz').fill('Bu ileti bir bot tarafından yazıldı.')
  await page.locator('[data-honeypot]').fill('https://spam.example')
  await page.clock.fastForward(4000)
  await page.getByRole('button', { name: 'Gönder' }).click()
  await expect(page.getByRole('status')).toHaveText('Teşekkürler, iletiniz bize ulaştı. En kısa sürede yanıtlayacağız.')
  expect(toApi).toEqual([])
})
