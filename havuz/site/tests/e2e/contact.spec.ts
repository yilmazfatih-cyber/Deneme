import { expect, test } from '@playwright/test'
import { PAGES } from './helpers.ts'

test.describe('iletişim formu (e-posta yedeği)', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install()
    await page.goto(PAGES.contact)
  })

  test('boş gönderimde özet gösterir, ilk hatalı alana odaklanır ve hataları alana bağlar', async ({ page }) => {
    await page.getByRole('button', { name: 'Gönder' }).click()
    await expect(page.getByRole('alert')).toHaveText('Lütfen işaretli alanları düzeltin.')
    const name = page.getByLabel('Adınız')
    await expect(name).toBeFocused()
    await expect(name).toHaveAttribute('aria-invalid', 'true')
    await expect(name).toHaveAccessibleDescription('Bu alanı doldurun.')
    await expect(page.getByLabel('İletiniz')).toHaveAccessibleDescription(
      /Ne kadar ayrıntı verirseniz.*Bu alanı doldurun\./u,
    )
  })

  test('geçersiz e-postayı ve kısa iletiyi açıklar; düzeltince hata kaybolur', async ({ page }) => {
    await page.getByLabel('Adınız').fill('Ayşe Kaya')
    const email = page.getByLabel('E-posta adresiniz')
    await email.fill('ayse@ornek')
    await page.getByLabel('İletiniz').fill('kısa')
    await page.getByRole('button', { name: 'Gönder' }).click()
    await expect(email).toHaveAccessibleDescription('Geçerli bir e-posta adresi yazın (ornek@alan.com).')
    await expect(page.getByLabel('İletiniz')).toHaveAccessibleDescription(/En az 10 karakter yazın\./u)
    await email.fill('ayse@ornek.com')
    await expect(email).toHaveAttribute('aria-invalid', 'false')
  })

  test('çok hızlı gönderimi reddeder, sonra e-posta uygulamasını hazır iletiyle açar', async ({ page }) => {
    await page.getByLabel('Adınız').fill('Ayşe Kaya')
    await page.getByLabel('E-posta adresiniz').fill('ayse@ornek.com')
    await page.getByLabel('İletiniz').fill('Fiyat & destek hakkında bilgi almak istiyorum.')
    await page.getByRole('button', { name: 'Gönder' }).click()
    await expect(page.getByRole('status')).toHaveText(
      'Form çok hızlı gönderildi. Lütfen birkaç saniye sonra yeniden deneyin.',
    )

    await page.clock.fastForward(4000)
    await page.getByRole('button', { name: 'Gönder' }).click()
    const status = page.getByRole('status')
    await expect(status).toContainText('E-posta uygulamanız açıldı')
    const href = await status.getByRole('link').getAttribute('href')
    expect(href).toMatch(/^mailto:merhaba@sedir\.example\?subject=/u)
    expect(decodeURIComponent(href ?? '')).toContain('Fiyat & destek hakkında bilgi almak istiyorum.')
  })

  test('bal küpü doluysa göndermez ama başarılı görünür', async ({ page }) => {
    let navigatedToMail = false
    page.on('framenavigated', (frame) => {
      if (frame.url().startsWith('mailto:')) navigatedToMail = true
    })
    await page.getByLabel('Adınız').fill('Bot')
    await page.getByLabel('E-posta adresiniz').fill('bot@ornek.com')
    await page.getByLabel('İletiniz').fill('Bu ileti bir bot tarafından yazıldı.')
    await page.locator('[data-honeypot]').fill('https://spam.example')
    await page.clock.fastForward(4000)
    await page.getByRole('button', { name: 'Gönder' }).click()
    await expect(page.getByRole('status')).toHaveText(
      'Teşekkürler, iletiniz bize ulaştı. En kısa sürede yanıtlayacağız.',
    )
    expect(navigatedToMail).toBe(false)
  })
})
