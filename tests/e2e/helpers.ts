import { AxeBuilder } from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

/** İlk açılış: kurulum sihirbazını hızlıca geçer. */
export async function completeSetup(page: Page, hand: 'left' | 'right' = 'right') {
  await page.goto('./')
  await page.getByTestId('setup-accept').click()
  await page.getByTestId(hand === 'left' ? 'setup-left' : 'setup-right').click()
  await page.getByTestId('setup-next').click()
  await page.getByTestId('setup-next').click()
  await page.getByTestId('setup-finish').click()
  await expect(page.getByTestId('home-speak')).toBeVisible()
}

/** 360 px genişlikte bile yatay kaydırma olmamalı. */
export async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth)
}

/** Görünür tüm dokunma alanları en az 72 × 72 px. */
export async function expectTouchTargets(page: Page) {
  const small = await page.evaluate(() => {
    const out: string[] = []
    for (const el of document.querySelectorAll<HTMLElement | SVGElement>(
      'button, a[href], input, select, textarea, [role="button"]',
    )) {
      const r = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      if (r.width === 0 || r.height === 0 || style.visibility === 'hidden' || el.closest('[aria-hidden="true"]'))
        continue
      // Dosya seçici görünmez katmandır; dokunma alanı onu saran düğmedir.
      if (el instanceof HTMLInputElement && el.type === 'file') continue
      if (r.width < 71.5 || r.height < 71.5) {
        out.push(
          `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`,
        )
      }
    }
    return out
  })
  expect(small, 'dokunma alanı 72 px altında').toEqual([])
}

/** axe erişilebilirlik taraması: kritik bulgu olmamalı. */
export async function expectNoCriticalA11y(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  const critical = results.violations.filter((v) => v.impact === 'critical')
  expect(critical.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
}
