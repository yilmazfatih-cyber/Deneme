// Her gösterim: açılır, başlığı görünür, temel etkileşimi çalışır, sayfa hatası yoktur, telefon genişliğinde
// yatay kaydırma yoktur ve axe taramasında ciddi/kritik ihlal yoktur. Dizin sayfası da aynı denetimden geçer.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { etkilesimler } from './etkilesimler.ts'

const gosterimler = JSON.parse(readFileSync(new URL('../demo/gosterimler.json', import.meta.url), 'utf8')) as {
  ad: string
  baslik: string
}[]

async function checkPage(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'yatay kaydırma olmamalı').toBeLessThanOrEqual(0)
  const results = await new AxeBuilder({ page }).analyze()
  const serious = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
  expect(serious, 'axe ciddi/kritik ihlal').toEqual([])
}

test('dizin sayfası tüm gösterimlere bağlantı verir', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  for (const g of gosterimler) await expect(page.getByRole('link', { name: new RegExp(`^${g.baslik}`) })).toBeVisible()
  await checkPage(page)
})

for (const g of gosterimler) {
  test(`${g.ad}: açılır, çalışır, erişilebilir`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`./demo/${g.ad}/`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const act = etkilesimler[g.ad]
    expect(act, `e2e/etkilesimler.ts içinde "${g.ad}" etkileşimi tanımlı olmalı`).toBeDefined()
    await act!(page)
    await checkPage(page)
    expect(errors, 'sayfa hatası olmamalı').toEqual([])
  })
}
