/**
 * Hesaplı kullanım: kayıt → görev → ikinci cihazda görünür; çevrimdışı düzenleme bağlantı gelince öteki cihaza
 * ulaşır; hesapsız yazılan kayıtlar kayıt olunca hesaba taşınır.
 */
import { expect, test } from '@playwright/test'
import { addTask, expectSynced, expectTasksPage, login, newDevice, register, uniqueEmail } from './support/helpers.ts'

test('kayıt → görev ekle → ikinci cihazda giriş → görev görünür', async ({ page, browser }, testInfo) => {
  const email = uniqueEmail('kayit')
  await register(page, { name: 'Ayşe', email })
  await expectTasksPage(page)
  await addTask(page, 'Süt al')
  await expectSynced(page)

  const other = await newDevice(browser, testInfo)
  await login(other, email)
  await expectTasksPage(other)
  await expect(other.getByRole('link', { name: 'Süt al', exact: true })).toBeVisible()
  await other.context().close()
})

test('çevrimdışı düzenleme, bağlantı gelince öteki cihazda görünür', async ({ page, browser }, testInfo) => {
  const email = uniqueEmail('cevrimdisi')
  await register(page, { name: 'Ayşe', email })
  await expectTasksPage(page)
  await addTask(page, 'Faturayı öde')
  await expectSynced(page)

  const other = await newDevice(browser, testInfo)
  await login(other, email)
  await expect(other.getByRole('link', { name: 'Faturayı öde', exact: true })).toBeVisible()

  await page.context().setOffline(true)
  await page.getByRole('checkbox', { name: '“Faturayı öde” tamamlandı olarak işaretle' }).click()
  await expect(page.getByRole('button', { name: /^Çevrimdışı/ }).first()).toBeAttached()
  await page.waitForTimeout(1000) // çevrimdışıyken gönderim denenir ve başarısız olur; veri kaybolmamalı
  await page.context().setOffline(false)

  await expect(other.getByRole('link', { name: 'Faturayı öde', exact: true })).toBeHidden({ timeout: 45_000 })
  await other.getByRole('tab', { name: /Biten/ }).click()
  await expect(other.getByRole('link', { name: 'Faturayı öde', exact: true })).toBeVisible()
  await other.context().close()
})

test('hesapsız kullanım → kayıt → kayıtlar hesaba taşınır', async ({ page, browser }, testInfo) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Hesapsız devam et' }).click()
  await expectTasksPage(page)
  await addTask(page, 'Hesapsız yazdım')

  const email = uniqueEmail('tasima')
  await register(page, { name: 'Ayşe', email })
  await expect(page.getByRole('heading', { name: 'Kayıtlarınızı hesaba taşıyalım mı?' })).toBeVisible()
  await expect(page.getByText('1 görev')).toBeVisible()
  await page.getByRole('button', { name: 'Hesabıma taşı' }).click()
  await expectTasksPage(page)
  await expect(page.getByRole('link', { name: 'Hesapsız yazdım', exact: true })).toBeVisible()
  await expectSynced(page)

  const other = await newDevice(browser, testInfo)
  await login(other, email)
  await expect(other.getByRole('link', { name: 'Hesapsız yazdım', exact: true })).toBeVisible()
  await other.context().close()
})
