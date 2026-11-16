import { expect, test, type Page } from '@playwright/test'
import { PAGES } from './helpers.ts'

const background = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor)

test.describe('tema seçimi', () => {
  test('koyu tema seçilir, sayfa yenilenince ve başka sayfada da korunur', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto(PAGES.home)
    const light = await background(page)

    await page.getByRole('button', { name: 'Tema' }).click()
    await page.getByRole('button', { name: 'Koyu' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.getByRole('button', { name: 'Tema' })).toBeFocused()
    const dark = await background(page)
    expect(dark).not.toBe(light)

    // Yeniden yükleme: tema, sayfanın betikleri çalışmadan önce (ilk boyamada) uygulanmış olmalı.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    expect(await background(page)).toBe(dark)

    await page.goto(PAGES.doc)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  test('"Sistem" seçilince işletim sisteminin temasını izler', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto(PAGES.blog)
    await page.getByRole('button', { name: 'Tema' }).click()
    await page.getByRole('button', { name: 'Açık' }).click()
    const light = await background(page)

    await page.getByRole('button', { name: 'Tema' }).click()
    await page.getByRole('button', { name: 'Sistem' }).click()
    await expect(page.locator('html')).not.toHaveAttribute('data-theme')
    await expect(page.locator('html')).toHaveAttribute('data-theme-choice', 'system')
    const systemDark = await background(page)
    expect(systemDark).not.toBe(light)

    await page.emulateMedia({ colorScheme: 'light' })
    await expect.poll(() => background(page)).toBe(light)
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme-choice', 'system')
  })

  test('tema penceresi Esc ile kapanır', async ({ page }) => {
    await page.goto(PAGES.home)
    const button = page.getByRole('button', { name: 'Tema' })
    await button.click()
    await expect(page.locator('#theme-menu')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('#theme-menu')).toBeHidden()
    await expect(button).toBeFocused()
  })
})
