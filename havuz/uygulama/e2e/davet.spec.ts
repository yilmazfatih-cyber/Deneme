/**
 * Paylaşımlı alan ve davet: sahip alan açar, izleyici davet bağlantısı oluşturur; ikinci kullanıcı bağlantıyla
 * katılır, sahibin görevini görür ama yazamaz.
 */
import { expect, test } from '@playwright/test'
import { addTask, expectSynced, expectTasksPage, newDevice, register, uniqueEmail } from './support/helpers.ts'

test('davet akışı: iki kullanıcı aynı alanda; izleyici yazamaz', async ({ page, browser }, testInfo) => {
  await register(page, { name: 'Ayşe', email: uniqueEmail('sahip') })
  await expectTasksPage(page)

  await page.goto('./#/alanlar')
  await page.getByRole('button', { name: 'Yeni alan' }).click()
  const dialog = page.getByRole('dialog', { name: 'Yeni alan' })
  await dialog.getByRole('textbox', { name: 'Alan adı' }).fill('Aile')
  await dialog.getByRole('button', { name: 'Alanı aç' }).click()
  await page.getByRole('link', { name: /Aile/ }).click()
  await page.getByRole('combobox', { name: 'Davet edilenin rolü' }).selectOption('viewer')
  await page.getByRole('button', { name: 'Bağlantı oluştur' }).click()
  const link = await page.getByRole('textbox', { name: 'Bağlantı' }).inputValue()
  expect(link).toMatch(/#\/davet\?token=/)

  await page.goto('./#/gorevler')
  await expect(page.getByText(/^Aile · /)).toBeVisible()
  await addTask(page, 'Ortak alışveriş')
  await expectSynced(page)

  const guest = await newDevice(browser, testInfo)
  await register(guest, { name: 'Burak', email: uniqueEmail('davetli') })
  await expectTasksPage(guest)
  await guest.goto(link)
  await expect(guest.getByText('Ayşe sizi “Aile” alanına İzleyici olarak davet etti.')).toBeVisible()
  await guest.getByRole('button', { name: 'Daveti kabul et' }).click()

  await expect(guest.getByText('Bu alanı yalnız görüntüleyebilirsiniz.')).toBeVisible()
  await expect(guest.getByRole('link', { name: 'Ortak alışveriş', exact: true })).toBeVisible()
  await expect(guest.getByRole('textbox', { name: 'Yeni görev' })).toHaveCount(0)
  await expect(guest.getByRole('checkbox', { name: /Ortak alışveriş/ })).toBeDisabled()
  await guest.context().close()
})
