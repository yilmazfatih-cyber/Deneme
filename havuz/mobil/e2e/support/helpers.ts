/**
 * Uçtan uca test yardımcıları: uygulamayı aç, karşılamayı geç, görev ekle, erişilebilirlik taraması, yatay taşma.
 */
import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

export function webUrl(path = '/'): string {
  const base = process.env.MOBIL_WEB_URL
  if (!base) throw new Error('MOBIL_WEB_URL yok: testleri `npm run e2e` ile çalıştırın.')
  return `${base}${path}`
}

/** Uygulamayı açar; karşılama ekranı çıkarsa hesapsız devam eder ve görevler ekranını bekler. */
export async function openLocal(page: Page): Promise<void> {
  await page.goto(webUrl('/'))
  const start = page.getByRole('button', { name: /^(Başla|Hesapsız devam et)$/ })
  await expect(start.or(page.getByLabel('Yeni görev'))).toBeVisible()
  if (await start.isVisible()) await start.click()
  await expect(page.getByLabel('Yeni görev')).toBeVisible()
}

export async function addTask(page: Page, title: string): Promise<void> {
  await page.getByLabel('Yeni görev').fill(title)
  await page.getByRole('button', { name: 'Ekle', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: `“${title}” tamamlandı olarak işaretle` })).toBeVisible()
}

/** axe taraması: ciddi ve kritik bulgu yok. */
export async function expectAccessible(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).analyze()
  const serious = result.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical')
  const details = serious.map(
    (item) => `${item.id}: ${item.help} → ${item.nodes.map((node) => node.html.slice(0, 160)).join(' | ')}`,
  )
  expect(details).toEqual([])
}

/** Sayfa yatayda taşmıyor (360 px genişlikte yatay kaydırma yok). */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}
