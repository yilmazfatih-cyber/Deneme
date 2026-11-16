/**
 * Çevrimdışı açılış: servis çalışanı uygulama kabuğunu önbelleğe alır; internet yokken sayfa yenilenince
 * uygulama açılır ve yerel veritabanındaki kayıtlar görünür.
 */
import { expect, test } from '@playwright/test'
import { addTask, expectSynced, expectTasksPage, register, uniqueEmail } from './support/helpers.ts'

test.use({ serviceWorkers: 'allow' })

test('internet yokken uygulama açılır, kayıtlar yerinde', async ({ page }) => {
  await register(page, { name: 'Ayşe', email: uniqueEmail('pwa') })
  await expectTasksPage(page)
  await addTask(page, 'Çevrimdışı görev')
  await expectSynced(page)
  // Servis çalışanı etkinleşene (önbellek dolana) dek bekle.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })

  await page.context().setOffline(true)
  await page.reload()
  await expectTasksPage(page)
  await expect(page.getByRole('link', { name: 'Çevrimdışı görev', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Çevrimdışı/ }).first()).toBeAttached()
  await page.context().setOffline(false)
})
