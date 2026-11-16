/**
 * Uçtan uca testlerin ortak yardımcıları: erişilebilirlik taraması, tema seçimi, yatay kaydırma denetimi.
 */
import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

/** Testlerde gezilen sayfalar (kök adres derlemesi). */
export const PAGES = {
  home: '/',
  blog: '/blog/',
  post: '/blog/erisilebilir-iletisim-formu/',
  mdxPost: '/blog/iyi-bir-ana-sayfa-nasil-yazilir/',
  tag: '/blog/etiket/seo/',
  docs: '/belgeler/',
  doc: '/belgeler/markdown-ve-mdx/',
  contact: '/iletisim/',
  about: '/hakkinda/',
  legal: '/kvkk/',
  enHome: '/en/',
  enPost: '/en/blog/how-to-write-a-good-homepage/',
  notFound: '/olmayan-bir-sayfa/',
} as const

/** axe taraması: ciddi (serious) ya da kritik (critical) bulgu olmamalı. */
export async function expectNoSeriousA11yIssues(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  const serious = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  )
  const report = serious.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.help}\n` +
      violation.nodes
        .slice(0, 3)
        .map((node) => `    ${node.target.join(' ')} — ${node.failureSummary?.split('\n')[1] ?? ''}`)
        .join('\n'),
  )
  expect(serious.length, `${label} sayfasında erişilebilirlik sorunu:\n${report.join('\n')}`).toBe(0)
}

/** Temayı sayfa açılmadan önce seçer (tarayıcı depolamasına yazar). */
export async function presetTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.addInitScript((value) => window.localStorage.setItem('tema', value), theme)
}

/** Sayfa yatayda taşmıyor mu? */
export async function expectNoHorizontalScroll(page: Page, label: string): Promise<void> {
  const [scrollWidth, innerWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
  expect(scrollWidth, `${label}: sayfa ${scrollWidth - innerWidth} px yatay taşıyor`).toBeLessThanOrEqual(innerWidth)
}

export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768
