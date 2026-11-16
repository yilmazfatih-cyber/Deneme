import { expect, test } from '@playwright/test'
import { PAGES } from './helpers.ts'

test.describe('site içi arama', () => {
  test('düğmeyle açılır, Türkçe harflerden bağımsız bulur ve sonuca gider', async ({ page }) => {
    await page.goto(PAGES.home)
    const opener = page.getByRole('button', { name: 'Ara' })
    await opener.click()
    const dialog = page.getByRole('dialog', { name: 'Sitede ara' })
    await expect(dialog).toBeVisible()
    const input = dialog.getByRole('searchbox', { name: 'Sitede ara' })
    await expect(input).toBeFocused()

    for (const query of ['erişilebilir', 'ERİŞİLEBİLİR', 'erisilebilir']) {
      await input.fill(query)
      await expect(dialog.getByRole('link', { name: /Erişilebilir bir iletişim formu/u })).toBeVisible()
    }

    await input.fill('qzxvbnm')
    await expect(dialog.getByRole('status')).toHaveText('“qzxvbnm” için sonuç bulunamadı.')

    await input.fill('erisilebilir')
    await dialog.getByRole('link', { name: /Erişilebilir bir iletişim formu/u }).click()
    await expect(page).toHaveURL(/\/blog\/erisilebilir-iletisim-formu\/$/u)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Erişilebilir bir iletişim formu için yedi kural')
  })

  test('"/" kısayoluyla açılır, Esc ile kapanır ve odak geri döner', async ({ page }) => {
    await page.goto(PAGES.blog)
    const opener = page.getByRole('button', { name: 'Ara' })
    await opener.focus()
    await page.keyboard.press('/')
    const dialog = page.getByRole('dialog', { name: 'Sitede ara' })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(opener).toBeFocused()
  })

  test('İngilizce sayfada İngilizce dizinde arar', async ({ page }) => {
    await page.goto(PAGES.enHome)
    await page.getByRole('button', { name: 'Search' }).click()
    const dialog = page.getByRole('dialog', { name: 'Search the site' })
    await dialog.getByRole('searchbox').fill('homepage')
    await expect(dialog.getByRole('link', { name: /How to write a homepage that works/u })).toBeVisible()
    await expect(dialog.getByRole('link', { name: /İyi bir ana sayfa/u })).toHaveCount(0)
  })
})
