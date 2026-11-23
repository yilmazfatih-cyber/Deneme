/**
 * Gerçek API ile bütünleşme (npm run e2e:api; API'yi ve web derlemesini betik hazırlar): iki "cihaz" (iki ayrı
 * tarayıcı bağlamı = iki ayrı yerel veritabanı). Telefon A kayıt olur, görev ekler, eşitler; telefon B aynı hesapla
 * girer, görevi görür ve tamamlar; A yeniden eşitleyince tamamlanmış görür. Giriş ekranının görüntüsü de alınır.
 */
import { expect, test, type Browser, type Page } from '@playwright/test'
import { join } from 'node:path'
import { addTask, expectAccessible, webUrl } from './support/helpers.ts'

const EMAIL = `mobil-${Date.now()}@ornek.com`
const PASSWORD = 'yesil-orman-yolu-17-deniz'

async function device(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: 'tr-TR',
  })
  const page = await context.newPage()
  await page.goto(webUrl('/'))
  await expect(page.getByRole('button', { name: 'Hesapsız devam et' })).toBeVisible()
  return page
}

async function syncNow(page: Page): Promise<void> {
  await page.getByRole('tab', { name: /^Ayarlar sekmesi/ }).click()
  await page.getByRole('button', { name: 'Şimdi eşitle' }).click()
  await expect(page.getByText('Eşitlendi', { exact: true })).toBeVisible()
}

test('iki cihaz: kayıt → ekle → eşitle → giriş → gör → tamamla → eşitle', async ({ browser }) => {
  const phone = await device(browser)
  await phone.getByRole('button', { name: 'Hesap oluştur' }).click()
  await phone.getByLabel('Adınız').fill('Ayşe Yılmaz')
  await phone.getByLabel('E-posta').fill(EMAIL)
  await phone.getByLabel('Şifre', { exact: true }).fill(PASSWORD)
  await phone.getByRole('button', { name: 'Hesap oluştur' }).click()
  await expect(phone.getByLabel('Yeni görev')).toBeVisible()
  await addTask(phone, 'Telefondan eklendi')
  await syncNow(phone)
  await expect(phone.getByText(EMAIL, { exact: true })).toBeVisible()

  const tablet = await device(browser)
  await tablet.getByRole('button', { name: 'Giriş yap' }).click()
  await expect(tablet.getByLabel('E-posta')).toBeVisible()
  await expectAccessible(tablet)
  await tablet.screenshot({ path: join(__dirname, '..', 'docs', 'ekran', 'giris-acik.png') })
  await tablet.getByLabel('E-posta').fill(EMAIL)
  await tablet.getByLabel('Şifre', { exact: true }).fill('yanlis-sifre-12345')
  await tablet.getByRole('button', { name: 'Giriş yap' }).click()
  await expect(tablet.getByText('E-posta ya da şifre eşleşmedi. Yeniden deneyin.')).toBeVisible()
  await tablet.getByLabel('Şifre', { exact: true }).fill(PASSWORD)
  await tablet.getByRole('button', { name: 'Giriş yap' }).click()
  const box = tablet.getByRole('checkbox', { name: '“Telefondan eklendi” tamamlandı olarak işaretle' })
  await expect(box).toBeVisible()
  await box.click()
  await syncNow(tablet)

  await syncNow(phone)
  await phone.getByRole('tab', { name: /^Görevler sekmesi/ }).click()
  await phone.getByRole('radio', { name: /^Biten/ }).click()
  await expect(phone.getByRole('checkbox', { name: '“Telefondan eklendi” yeniden aç' })).toBeChecked()
})
