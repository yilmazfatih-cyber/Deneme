/**
 * Web derlemesi duman testi (hesapsız kip, gerçek expo-sqlite/OPFS): görev ekle → tamamla → sil + geri al →
 * yenilemede korunur; liste ve ayarlar ekranı; her ekranda erişilebilirlik taraması ve yatay taşma denetimi.
 */
import { expect, test } from '@playwright/test'
import { addTask, expectAccessible, expectNoHorizontalScroll, openLocal } from './support/helpers.ts'

test('görev ekle → tamamla → sil + geri al → yenilemede korunur', async ({ page }) => {
  await openLocal(page)
  await expectAccessible(page)
  await expectNoHorizontalScroll(page)
  await addTask(page, 'Süt al')
  await addTask(page, 'İlaç al')

  await page.getByRole('checkbox', { name: '“Süt al” tamamlandı olarak işaretle' }).click()
  await expect(page.getByRole('radio', { name: 'Biten (1)' })).toBeVisible()
  await expect(page.getByText('Süt al')).toBeHidden()

  await page.getByRole('button', { name: '“İlaç al” görevini sil' }).click()
  await expect(page.getByText('“İlaç al” silindi.')).toBeVisible()
  await page.getByRole('button', { name: 'Geri al' }).click()
  await expect(page.getByRole('checkbox', { name: '“İlaç al” tamamlandı olarak işaretle' })).toBeVisible()

  await page.reload()
  await expect(page.getByLabel('Yeni görev')).toBeVisible()
  await page.getByRole('radio', { name: 'Tümü (2)' }).click()
  await expect(page.getByRole('checkbox', { name: '“Süt al” yeniden aç' })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: '“İlaç al” tamamlandı olarak işaretle' })).not.toBeChecked()
  await expectAccessible(page)
})

test('Türkçe arama ve görev düzenleme', async ({ page }) => {
  await openLocal(page)
  await addTask(page, 'İğne yaptır')
  await addTask(page, 'Fatura öde')
  await page.getByLabel('Görevlerde ara').fill('IGNE')
  await expect(page.getByRole('radio', { name: 'Açık (1)' })).toBeVisible()
  await page.getByRole('button', { name: /^İğne yaptır/ }).click()
  await expect(page.getByLabel('Başlık')).toHaveValue('İğne yaptır')
  await expectAccessible(page)
  await expectNoHorizontalScroll(page)
  await page.getByLabel('Başlık').fill('İğne yaptır (Salı)')
  await page.getByRole('radio', { name: 'Yarın' }).click()
  await page.getByRole('button', { name: 'Kaydet' }).click()
  await expect(page.getByText('İğne yaptır (Salı)')).toBeVisible()
  await expect(page.getByText('Yarın', { exact: true })).toBeVisible()
})

test('listeler ve ayarlar ekranları erişilebilir; tema değişir', async ({ page }) => {
  await openLocal(page)
  await page.getByRole('tab', { name: /^Listeler sekmesi/ }).click()
  await page.getByLabel('Liste adı').fill('Ev işleri')
  await page.getByRole('button', { name: 'Listeyi ekle' }).click()
  await expect(page.getByRole('button', { name: /^Ev işleri/ })).toBeVisible()
  await expectAccessible(page)
  await expectNoHorizontalScroll(page)
  await page.getByRole('tab', { name: /^Ayarlar sekmesi/ }).click()
  await expect(page.getByText('Sunucusuz: veriler yalnız bu telefonda')).toBeVisible()
  await page.getByRole('radio', { name: 'Koyu' }).click()
  await expect(page.getByRole('radio', { name: 'Koyu' })).toBeChecked()
  await expectAccessible(page)
  await expectNoHorizontalScroll(page)
})
