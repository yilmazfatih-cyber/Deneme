import { expect, test } from '@playwright/test'
import { expectNoHorizontalScroll, expectNoSeriousA11yIssues, PAGES, presetTheme } from './helpers.ts'

const checked = [
  PAGES.home,
  PAGES.blog,
  PAGES.post,
  PAGES.mdxPost,
  PAGES.tag,
  PAGES.docs,
  PAGES.doc,
  PAGES.contact,
  PAGES.about,
  PAGES.legal,
  PAGES.enHome,
  PAGES.notFound,
]

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme === 'light' ? 'açık' : 'koyu'} tema`, () => {
    for (const path of checked) {
      test(`${path}: erişilebilirlik ve yatay taşma`, async ({ page }) => {
        await presetTheme(page, theme)
        await page.goto(path)
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        await expectNoHorizontalScroll(page, path)
        await expectNoSeriousA11yIssues(page, `${path} (${theme})`)
      })
    }
  })
}

test('404: doğru durum kodu, başlık ve ana sayfaya dönüş', async ({ page }) => {
  const response = await page.goto(PAGES.notFound)
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sayfa bulunamadı')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow')
  await page.getByRole('link', { name: 'Ana sayfaya dön' }).click()
  await expect(page).toHaveURL(/\/$/u)
})

test('dış sunucuya hiçbir istek gitmez (yazı tipi, betik, izleyici yok)', async ({ page }) => {
  const hosts = new Set<string>()
  page.on('request', (request) => hosts.add(new URL(request.url()).host))
  for (const path of [PAGES.home, PAGES.post, PAGES.contact]) await page.goto(path, { waitUntil: 'networkidle' })
  expect([...hosts]).toEqual([new URL(page.url()).host])
})

test('kod bloğu Kopyala düğmesi panoya yazar', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Pano izni yalnız Chromium için ayarlı')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto(PAGES.doc)
  const block = page.locator('.code-block').first()
  await block.getByRole('button', { name: 'Kopyala' }).click()
  await expect(block.getByRole('button', { name: 'Kopyalandı' })).toBeVisible()
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied.length).toBeGreaterThan(5)
})

test('sayfa yüklenirken düzen kaymıyor (CLS < 0.05)', async ({ page }) => {
  for (const path of [PAGES.home, PAGES.mdxPost, PAGES.doc]) {
    await page.goto(path, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    const cls = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let total = 0
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as (PerformanceEntry & {
              value: number
              hadRecentInput: boolean
            })[]) {
              if (!entry.hadRecentInput) total += entry.value
            }
          }).observe({ type: 'layout-shift', buffered: true })
          setTimeout(() => resolve(total), 500)
        }),
    )
    expect(cls, `${path}: toplam düzen kayması ${cls.toFixed(3)}`).toBeLessThan(0.05)
  }
})
