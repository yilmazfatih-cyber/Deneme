/**
 * Sözlük kuralları: her dilin arayüz sözlüğü aynı anahtarlara ve aynı yer tutuculara sahip olmalı.
 */
import { describe, expect, it } from 'vitest'
import { useTranslations } from '../../src/i18n/index.ts'
import { tr } from '../../src/i18n/tr.ts'
import { defaultLocale, locales, siteConfig } from '../../src/site.config.ts'
import { paths } from '../../src/lib/routes.ts'

type Tree = { [key: string]: string | Tree }

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const result = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    const name = prefix === '' ? key : `${prefix}.${key}`
    if (typeof value === 'string') result.set(name, value)
    else for (const [nested, text] of flatten(value, name)) result.set(nested, text)
  }
  return result
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/gu)].map((match) => match[1]).sort()
const reference = flatten(tr as unknown as Tree)

describe.each(locales)('"%s" sözlüğü', (locale) => {
  const dictionary = flatten(useTranslations(locale) as unknown as Tree)

  it('Türkçe sözlükle aynı anahtarlara sahip', () => {
    expect([...dictionary.keys()].sort()).toEqual([...reference.keys()].sort())
  })

  it('boş metin içermiyor', () => {
    expect([...dictionary.entries()].filter(([, text]) => text.trim() === '').map(([key]) => key)).toEqual([])
  })

  it('yer tutucular ({ad}) Türkçe sözlükle aynı', () => {
    const mismatched = [...reference.entries()]
      .filter(
        ([key, text]) => JSON.stringify(placeholders(text)) !== JSON.stringify(placeholders(dictionary.get(key) ?? '')),
      )
      .map(([key]) => key)
    expect(mismatched).toEqual([])
  })

  it('site.config.ts içinde tanımlı ve adresleri üretilebiliyor', () => {
    expect(siteConfig.locales[locale]).toBeDefined()
    expect(paths.blog(locale)).toMatch(locale === defaultLocale ? /^\/blog\/$/u : new RegExp(`^/${locale}/`, 'u'))
  })
})
