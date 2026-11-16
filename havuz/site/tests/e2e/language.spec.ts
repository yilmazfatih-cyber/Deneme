import { expect, test, type Page } from '@playwright/test'
import { isPhone, PAGES } from './helpers.ts'

/** Dil bağlantısı: masaüstünde başlıkta, telefonda menünün içinde. */
async function switchLanguage(page: Page, name: RegExp) {
  if (isPhone(page)) {
    await page.getByRole('button', { name: /^(Menü|Menu)$/u }).click()
    await page.locator('#site-menu').getByRole('link', { name }).click()
  } else {
    await page.locator('[data-language-link]').filter({ hasText: name }).click()
  }
}

test.describe('dil değiştirme', () => {
  test('ana sayfadan İngilizce ana sayfaya ve geri', async ({ page }) => {
    await page.goto(PAGES.home)
    await expect(page.locator('html')).toHaveAttribute('lang', 'tr')
    await switchLanguage(page, /English|EN/u)
    await expect(page).toHaveURL(/\/en\/$/u)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fill the calendar, quiet the phone.')
    await switchLanguage(page, /Türkçe|TR/u)
    await expect(page).toHaveURL(/\/$/u)
    await expect(page.locator('html')).toHaveAttribute('lang', 'tr')
  })

  test('çevirisi olan yazı çevirisine, olmayan yazı o dilin ana sayfasına gider', async ({ page }) => {
    await page.goto(PAGES.mdxPost)
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
      'href',
      /\/en\/blog\/how-to-write-a-good-homepage\/$/u,
    )
    await switchLanguage(page, /English|EN/u)
    await expect(page).toHaveURL(/\/en\/blog\/how-to-write-a-good-homepage\/$/u)

    await page.goto(PAGES.post)
    await expect(page.locator('link[hreflang]')).toHaveCount(0)
    await switchLanguage(page, /English|EN/u)
    await expect(page).toHaveURL(/\/en\/$/u)
  })
})
