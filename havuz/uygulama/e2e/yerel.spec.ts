/**
 * Hesapsız derleme (VITE_API_URL=none; GitHub Pages gibi durağan yayın): karşılama ve hesap ekranları yoktur;
 * görevler yalnız bu tarayıcıda saklanır ve yenilemede korunur; silme geri alınabilir.
 */
import { expect, test } from '@playwright/test'
import { addTask, expectAccessible, expectNoHorizontalScroll, expectTasksPage } from './support/helpers.ts'

test('hesapsız kip: görev ekle, tamamla, sil + geri al, yenilemede korunur', async ({ page }) => {
  await page.goto('./')
  await expectTasksPage(page)
  await expect(page.getByRole('link', { name: 'Giriş' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Alanlar' })).toHaveCount(0)

  await addTask(page, 'İlaçları al')
  await addTask(page, 'Su faturası')
  await page.getByRole('checkbox', { name: '“İlaçları al” tamamlandı olarak işaretle' }).click()
  await expect(page.getByRole('link', { name: 'İlaçları al', exact: true })).toBeHidden()
  await page.getByRole('tab', { name: /Biten/ }).click()
  await expect(page.getByRole('link', { name: 'İlaçları al', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: /Açık/ }).click()

  await page.getByRole('button', { name: '“Su faturası” seçenekleri' }).click()
  await page.getByRole('menuitem', { name: 'Sil' }).click()
  await expect(page.getByRole('link', { name: 'Su faturası', exact: true })).toBeHidden()
  await page.getByRole('button', { name: 'Geri al' }).click()
  await expect(page.getByRole('link', { name: 'Su faturası', exact: true })).toBeVisible()

  await page.reload()
  await expectTasksPage(page)
  await expect(page.getByRole('link', { name: 'Su faturası', exact: true })).toBeVisible()

  await page.goto('./#/ayarlar')
  await expect(page.getByText('Sunucusuz: veriler yalnız bu cihazda')).toBeVisible()
  await expectAccessible(page, 'hesapsız ayarlar')
  await expectNoHorizontalScroll(page)
  await page.goto('./#/giris')
  await expect(page.getByRole('heading', { name: 'Sayfa bulunamadı' }).first()).toBeVisible()
})
