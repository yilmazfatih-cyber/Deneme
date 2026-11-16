/**
 * Şifre sıfırlama: "şifremi unuttum" → API'nin geliştirme posta kutusundaki bağlantı → yeni şifre → giriş.
 */
import { expect, test } from '@playwright/test'
import { expectTasksPage, login, readMailLink, register, uniqueEmail } from './support/helpers.ts'

test('şifre sıfırlama bağlantısıyla yeni şifre belirlenir', async ({ page }) => {
  const email = uniqueEmail('sifre')
  await register(page, { name: 'Ayşe', email })
  await expectTasksPage(page)
  await page.goto('./#/hesap')
  await page.getByRole('button', { name: 'Çıkış yap' }).click()
  await page.getByRole('dialog', { name: 'Çıkış yapılsın mı?' }).getByRole('button', { name: 'Çıkış yap' }).click()
  await expectTasksPage(page)

  await page.goto('./#/sifremi-unuttum')
  await page.getByRole('textbox', { name: 'E-posta' }).fill(email)
  await page.getByRole('button', { name: 'Bağlantı gönder' }).click()
  await expect(page.getByRole('status')).toContainText('sıfırlama bağlantısı gönderdik')

  const link = await readMailLink(email)
  expect(link).toContain('#/sifre-sifirla?token=')
  await page.goto(link)
  const fresh = 'yepyeni-guclu-parola-77'
  await page.getByLabel('Yeni şifre', { exact: true }).fill(fresh)
  await page.getByLabel('Yeni şifre (yeniden)').fill(fresh)
  await page.getByRole('button', { name: 'Şifreyi değiştir' }).click()
  await expect(page.getByRole('heading', { name: 'Giriş yap' })).toBeVisible()

  await login(page, email, fresh)
  await expectTasksPage(page)
})
