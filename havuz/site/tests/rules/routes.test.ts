/**
 * Sayfa dosyası kuralları: src/lib/routes.ts'teki adres parçaları ile src/pages/ altındaki dosyalar eşleşmeli.
 * Yeni dil eklerken bu test, eksik sayfa dosyalarını tek tek listeler.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { localePrefix, segments } from '../../src/lib/routes.ts'
import { locales } from '../../src/site.config.ts'
import { ROOT } from './helpers.ts'

describe.each(locales)('"%s" dilinin sayfa dosyaları', (locale) => {
  it('her sayfa türü için dosya var', () => {
    const prefix = `src/pages${localePrefix(locale)}`
    const segment = segments(locale)
    const expected = [
      `${prefix}/index.astro`,
      `${prefix}/[slug].astro`,
      `${prefix}/rss.xml.ts`,
      `${prefix}/${segment.blog}/[...page].astro`,
      `${prefix}/${segment.blog}/[slug].astro`,
      `${prefix}/${segment.blog}/${segment.tag}/[tag].astro`,
      `${prefix}/${segment.docs}/index.astro`,
      `${prefix}/${segment.docs}/[slug].astro`,
      `${prefix}/${segment.contact}.astro`,
    ]
    const missing = expected.filter((file) => !existsSync(path.join(ROOT, file)))
    expect(
      missing,
      `Eksik sayfa dosyaları. src/pages/en/ altındaki karşılığını kopyalayıp dil kodunu değiştirin (AGENTS.md → "Yeni dil").`,
    ).toEqual([])
  })
})
