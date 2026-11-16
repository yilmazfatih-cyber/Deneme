import { test } from '@playwright/test'

/** Görüntüsü alınacak sayfalar: [dosya adı, adres]. */
const PAGES = [
  ['ana-sayfa', '/'],
  ['blog', '/blog/'],
  ['blog-yazisi', '/blog/iyi-bir-ana-sayfa-nasil-yazilir/'],
  ['belge', '/belgeler/markdown-ve-mdx/'],
  ['iletisim', '/iletisim/'],
] as const

for (const theme of ['acik', 'koyu'] as const) {
  for (const [name, path] of PAGES) {
    test(`${name} (${theme})`, async ({ page }, testInfo) => {
      await page.addInitScript(
        (value) => window.localStorage.setItem('tema', value),
        theme === 'acik' ? 'light' : 'dark',
      )
      await page.goto(path, { waitUntil: 'networkidle' })
      await page.evaluate(() => document.fonts.ready)
      await page.screenshot({
        path: `docs/ekran/${name}-${testInfo.project.name}-${theme}.jpg`,
        type: 'jpeg',
        quality: 82,
      })
    })
  }
}
