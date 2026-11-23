/**
 * Ekran görüntüleri (docs/ekran/): 390×844, açık ve koyu tema, deviceScaleFactor 2. Hesapsız kip web derlemesi.
 * Yenilemek için: npm run shots. Örnek veriler arayüzden girilir (gerçek akış).
 */
import { expect, test, type Page } from '@playwright/test'
import { join } from 'node:path'
import { addTask, openLocal, webUrl } from './support/helpers.ts'

const OUT = join(__dirname, '..', 'docs', 'ekran')

async function shot(page: Page, name: string, theme: string): Promise<void> {
  await expect(page.getByTestId('toast')).toBeHidden({ timeout: 12_000 })
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(OUT, `${name}-${theme}.png`) })
}

async function seed(page: Page): Promise<void> {
  await page.getByRole('tab', { name: /^Listeler sekmesi/ }).click()
  for (const [name, color] of [
    ['Ev', 'Yeşil'],
    ['İş', 'Mavi'],
  ] as const) {
    await page.getByLabel('Liste adı').fill(name)
    await page.getByRole('radio', { name: color }).click()
    await page.getByRole('button', { name: 'Listeyi ekle' }).click()
    await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible()
  }
  await page.getByRole('button', { name: /^Ev/ }).click()
  await addTask(page, 'Faturayı öde')
  await addTask(page, 'Süt ve ekmek al')
  await page.getByRole('button', { name: 'Liste: Ev · Kaldır' }).click()
  await addTask(page, 'İlaç saatini ayarla')
  await addTask(page, 'Rapor taslağını bitir')
  await page.getByRole('button', { name: /^Faturayı öde/ }).click()
  await page.getByRole('radio', { name: 'Bugün' }).click()
  await page.getByRole('radio', { name: 'Yüksek' }).click()
  await page.getByRole('button', { name: 'Kaydet' }).click()
  await page.getByRole('button', { name: /^Rapor taslağını bitir/ }).click()
  await page.getByRole('radio', { name: 'Yarın' }).click()
  await page.getByRole('radio', { name: 'İş' }).click()
  await page.getByRole('button', { name: 'Kaydet' }).click()
  await page.getByRole('checkbox', { name: '“Süt ve ekmek al” tamamlandı olarak işaretle' }).click()
}

for (const theme of ['acik', 'koyu'] as const) {
  test.describe(`${theme} tema`, () => {
    test.use({ colorScheme: theme === 'koyu' ? 'dark' : 'light' })

    test(`ekranlar (${theme})`, async ({ page }) => {
      await page.goto(webUrl('/'))
      await expect(page.getByRole('button', { name: /^(Başla|Hesapsız devam et)$/ })).toBeVisible()
      await shot(page, 'karsilama', theme)
      await openLocal(page)
      await seed(page)
      await page.getByRole('radio', { name: /^Tümü/ }).click()
      await shot(page, 'gorevler', theme)
      await page.getByRole('button', { name: /^Faturayı öde/ }).click()
      await expect(page.getByLabel('Başlık')).toBeVisible()
      await shot(page, 'gorev', theme)
      await page.goBack()
      await page.getByRole('tab', { name: /^Listeler sekmesi/ }).click()
      await expect(page.getByRole('button', { name: /^Ev/ })).toBeVisible()
      await shot(page, 'listeler', theme)
      await page.getByRole('tab', { name: /^Ayarlar sekmesi/ }).click()
      await expect(page.getByRole('radio', { name: 'Sistem' })).toBeVisible()
      await shot(page, 'ayarlar', theme)
    })
  })
}
