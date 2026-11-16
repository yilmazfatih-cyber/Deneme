import { expect, test } from '@playwright/test'
import { isPhone, PAGES } from './helpers.ts'

test.describe('üst menü', () => {
  test('ilk Tab "İçeriğe geç" bağlantısına gider ve içeriğe atlar', async ({ page }) => {
    await page.goto(PAGES.blog)
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'İçeriğe geç' })
    await expect(skip).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('main#icerik')).toBeFocused()
  })

  test('bulunulan bölüm menüde işaretli', async ({ page }) => {
    await page.goto(PAGES.post)
    const nav = page.getByRole('navigation', { name: 'Ana menü' })
    if (isPhone(page)) await nav.getByRole('button', { name: 'Menü' }).click()
    await expect(nav.getByRole('link', { name: 'Blog' })).toHaveAttribute('aria-current', 'location')
  })

  test('mobilde menü düğmesi açar, Esc kapatır ve odak düğmeye döner', async ({ page }) => {
    test.skip(!isPhone(page), 'Yalnız telefon boyutunda')
    await page.goto(PAGES.home)
    const toggle = page.getByRole('button', { name: 'Menü' })
    const blogLink = page.locator('#site-menu').getByRole('link', { name: 'Blog' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(blogLink).toBeHidden()

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(blogLink).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(toggle).toBeFocused()

    // Klavyeyle: Enter açar, Tab panelin ilk bağlantısına gider.
    await page.keyboard.press('Enter')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Tab')
    await expect(page.locator('#site-menu a').first()).toBeFocused()

    await blogLink.click()
    await expect(page).toHaveURL(/\/blog\/$/u)
    await expect(page.getByRole('heading', { level: 1, name: 'Blog' })).toBeVisible()
  })

  test('masaüstünde bağlantılar doğrudan görünür, menü düğmesi gizli', async ({ page }) => {
    test.skip(isPhone(page), 'Yalnız masaüstü')
    await page.goto(PAGES.home)
    await expect(page.getByRole('button', { name: 'Menü' })).toBeHidden()
    await page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: 'Belgeler' }).click()
    await expect(page).toHaveURL(/\/belgeler\/$/u)
  })
})
