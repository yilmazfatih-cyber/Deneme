/**
 * Erişilebilirlik ve yerleşim: başlıca ekranlarda axe taraması (ciddi/kritik bulgu yok) açık ve koyu temada;
 * hiçbir ekranda yatay kaydırma yok (360 px dahil, her proje kendi genişliğinde koşar).
 */
import { expect, test, type Page } from '@playwright/test'
import {
  addTask,
  expectAccessible,
  expectNoHorizontalScroll,
  expectTasksPage,
  newDevice,
  register,
  uniqueEmail,
} from './support/helpers.ts'

async function check(page: Page, path: string, label: string): Promise<void> {
  await page.goto(`./#${path}`)
  await expect(page.locator('h1')).toBeVisible()
  await page.waitForTimeout(150) // canlandırmalar bitsin
  for (const scheme of ['light', 'dark'] as const) {
    // Hareket azaltılınca renk geçişleri anında biter; tarama ara renklere denk gelmez.
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await page.waitForTimeout(100)
    await expectAccessible(page, `${label} (${scheme})`)
    await expectNoHorizontalScroll(page)
  }
  await page.emulateMedia({ colorScheme: 'light' })
}

test('oturum ekranları', async ({ page }) => {
  await check(page, '/hos-geldiniz', 'karşılama')
  await check(page, '/giris', 'giriş')
  await check(page, '/kayit', 'kayıt')
  await check(page, '/sifremi-unuttum', 'şifremi unuttum')
})

test('uygulama ekranları', async ({ page, browser }, testInfo) => {
  await register(page, { name: 'Ayşe', email: uniqueEmail('a11y') })
  await expectTasksPage(page)
  await page.goto('./#/listeler')
  await page.getByRole('button', { name: 'Yeni liste' }).click()
  await page.getByRole('dialog').getByRole('textbox', { name: 'Liste adı' }).fill('Ev')
  await page.getByRole('dialog').getByRole('button', { name: 'Ekle' }).click()
  await page.goto('./#/gorevler')
  await addTask(page, 'Uzun bir görev başlığı: banka randevusu ve vergi belgeleri')
  await page.getByRole('link', { name: /banka randevusu/ }).click()
  await page.getByRole('button', { name: 'Bugün' }).click()
  await page.getByRole('combobox', { name: 'Öncelik' }).selectOption('high')
  await page.getByRole('button', { name: 'Kaydet' }).click()
  await expectTasksPage(page)

  await check(page, '/gorevler', 'görevler')
  await check(page, '/listeler', 'listeler')
  await check(page, '/silinenler', 'son silinenler')
  await check(page, '/alanlar', 'alanlar')
  await check(page, '/hesap', 'hesap')
  await check(page, '/ayarlar', 'ayarlar')

  // Menü ve pencere açıkken de.
  await page.goto('./#/gorevler')
  await page
    .getByRole('button', { name: /seçenekleri$/ })
    .first()
    .click()
  await expect(page.getByRole('menu')).toBeVisible()
  await expectAccessible(page, 'açık menü')
  await page.keyboard.press('Escape')

  const visitor = await newDevice(browser, testInfo)
  await check(visitor, '/hos-geldiniz', 'ilk açılış')
  await visitor.context().close()
})
