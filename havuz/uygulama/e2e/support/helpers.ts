/**
 * Uçtan uca test yardımcıları: kayıt/giriş, görev ekleme, erişilebilirlik taraması, yatay kaydırma denetimi,
 * geliştirme posta kutusundan (api: mail_outbox tablosu) bağlantı okuma.
 */
import { AxeBuilder } from '@axe-core/playwright'
import { expect, type Browser, type Page, type TestInfo } from '@playwright/test'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/** API'nin şifre kuralına uyan (uzun, yaygın olmayan, adı/e-postayı içermeyen) deneme şifresi. */
export const PASSWORD = 'mavi-deniz-kenari-42'

/** Her testte ayrı kullanıcı: aynı veritabanını paylaşan paralel testler çakışmasın. */
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}@ornek.com`
}

export async function register(page: Page, options: { name: string; email: string }): Promise<void> {
  await page.goto('./#/kayit')
  await page.getByRole('textbox', { name: 'Adınız' }).fill(options.name)
  await page.getByRole('textbox', { name: 'E-posta' }).fill(options.email)
  await page.getByLabel('Yeni şifre').fill(PASSWORD)
  await page.getByRole('button', { name: 'Hesap oluştur' }).click()
}

export async function login(page: Page, email: string, password: string = PASSWORD): Promise<void> {
  await page.goto('./#/giris')
  await page.getByRole('textbox', { name: 'E-posta' }).fill(email)
  await page.getByLabel('Şifre', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
}

/** Görevler sayfası açıldı ve geçerli alan hazır. */
export async function expectTasksPage(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: 'Görevler' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Yeni görev' })).toBeVisible()
}

export async function addTask(page: Page, title: string): Promise<void> {
  const input = page.getByRole('textbox', { name: 'Yeni görev' })
  await input.fill(title)
  await input.press('Enter')
  await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible()
}

/** Bekleyen değişiklik kalmayana dek bekler (eşitleme göstergesi "Eşitlendi" der). */
export async function expectSynced(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Eşitlendi', exact: true }).first()).toBeAttached({ timeout: 30_000 })
}

/** 360 px'te bile yatay kaydırma olmamalı. */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth, 'sayfa yatay kayıyor').toBeLessThanOrEqual(clientWidth)
}

/** axe taraması: ciddi (serious) ya da kritik (critical) bulgu olmamalı. */
export async function expectAccessible(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze()
  const bad = results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
    )
  expect(bad, `${label}: erişilebilirlik bulguları`).toEqual([])
}

/** Geliştirme posta kutusundaki (api: mail_outbox) son e-postadan bağlantıyı okur. */
export async function readMailLink(email: string): Promise<string> {
  const path = join(import.meta.dirname, '..', '..', 'api', process.env.E2E_DB ?? '')
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const db = new DatabaseSync(path, { readOnly: true })
    try {
      const row = db
        .prepare('SELECT text_body FROM mail_outbox WHERE to_address = ? ORDER BY id DESC LIMIT 1')
        .get(email) as { text_body?: string } | undefined
      const link = /https?:\/\/\S+/.exec(String(row?.text_body ?? ''))?.[0]
      if (link) return link
    } finally {
      db.close()
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(`${email} için e-posta gelmedi`)
}

/** İkinci bir "cihaz": aynı ekran ayarlarıyla ayrı tarayıcı bağlamı (ayrı çerez ve IndexedDB). */
export async function newDevice(browser: Browser, testInfo: TestInfo): Promise<Page> {
  const { viewport, isMobile, hasTouch, locale, timezoneId, deviceScaleFactor } = testInfo.project.use
  const context = await browser.newContext({
    viewport,
    isMobile,
    hasTouch,
    locale,
    timezoneId,
    deviceScaleFactor,
    baseURL: `http://localhost:${process.env.E2E_WEB_PORT}/`,
    serviceWorkers: 'block',
  })
  return context.newPage()
}
