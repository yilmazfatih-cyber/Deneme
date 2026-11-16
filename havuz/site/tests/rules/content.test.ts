/**
 * İçerik kuralları: src/content/ altındaki dosyalar yayından önce burada denetlenir.
 * Her başarısız testin iletisi ne yapılacağını söyler.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PLACEHOLDER_DESCRIPTION } from '../../src/lib/content-schemas.ts'
import { RESERVED_SLUGS } from '../../src/lib/routes.ts'
import { locales } from '../../src/site.config.ts'
import { frontmatter, listFiles, read, ROOT } from './helpers.ts'

const MARKDOWN = ['blog', 'belgeler', 'sayfalar'] as const
const DATA = ['anasayfa', 'ozellikler', 'sss', 'fiyatlar', 'referanslar', 'ekip'] as const
const IMAGE = /\.(png|jpe?g|webp|avif|gif|svg)$/iu

const markdownFiles = MARKDOWN.flatMap((collection) =>
  listFiles(`src/content/${collection}`, (file) => /\.mdx?$/u.test(file)).map((file) => ({ collection, file })),
)

describe('içerik dosyaları', () => {
  it.each(markdownFiles)('$file bir dil klasöründe ve ASCII kısa adlı', ({ collection, file }) => {
    const relative = file.slice(`src/content/${collection}/`.length)
    const [locale, name, ...rest] = relative.split('/')
    expect(
      locales as string[],
      `${file}: dosya src/content/${collection}/<dil>/ altında olmalı (diller: ${locales.join(', ')}).`,
    ).toContain(locale)
    expect(rest, `${file}: alt klasör kullanmayın; dosyayı doğrudan dil klasörüne koyun.`).toEqual([])
    expect(
      name,
      `${file}: dosya adı yalnız küçük ASCII harf, rakam ve tire içermeli. Üreteci kullanın: npm run new`,
    ).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*\.mdx?$/u)
  })

  it('içerik klasörlerinde Markdown, JSON ve görsel dışında dosya yok', () => {
    const stray = listFiles('src/content', (file) => !/\.(mdx?|json)$/u.test(file) && !IMAGE.test(file))
    expect(stray, 'Bu dosyalar içerik olarak okunmaz; silin ya da doğru yere taşıyın.').toEqual([])
  })

  it('yayımlanan içerikte üreteç yer tutucusu ve "lorem ipsum" kalmamış', () => {
    const problems: string[] = []
    for (const { file } of markdownFiles) {
      const { data, body } = frontmatter(file)
      const text = read(file)
      if (/lorem ipsum/iu.test(text)) problems.push(`${file}: "lorem ipsum" var; gerçek metin yazın.`)
      if (data.draft === true) continue
      if (data.description === PLACEHOLDER_DESCRIPTION)
        problems.push(`${file}: açıklama (description) hâlâ yer tutucu.`)
      if (body.includes('YAZIN:')) problems.push(`${file}: "YAZIN:" ile başlayan yer tutucu metin kalmış.`)
    }
    expect(problems).toEqual([])
  })

  it('sayfa ve yazı adları sitenin ayrılmış adlarıyla çakışmıyor', () => {
    const clashes = markdownFiles
      .filter(({ collection }) => collection !== 'belgeler')
      .map(({ file }) => path.basename(file).replace(/\.mdx?$/u, ''))
      .filter((slug) => RESERVED_SLUGS.has(slug) || /^\d+$/u.test(slug))
    expect(
      clashes,
      `Bu adlar ayrılmış (src/lib/routes.ts → RESERVED_SLUGS) ya da yalnız rakam; dosyayı yeniden adlandırın.`,
    ).toEqual([])
  })

  it.each(MARKDOWN)('%s: her translationKey bir dilde en fazla bir kez kullanılmış', (collection) => {
    const seen = new Map<string, string>()
    const duplicates: string[] = []
    for (const { file } of markdownFiles.filter((entry) => entry.collection === collection)) {
      const key = frontmatter(file).data.translationKey
      if (typeof key !== 'string') continue
      const locale = file.split('/')[3] ?? ''
      const id = `${locale}:${key}`
      if (seen.has(id)) duplicates.push(`${file} ve ${seen.get(id)} aynı translationKey'i ("${key}") taşıyor.`)
      seen.set(id, file)
    }
    expect(duplicates).toEqual([])
  })

  it('yazıların yazarları ekip dosyasında tanımlı', () => {
    const problems: string[] = []
    for (const { file } of markdownFiles.filter((entry) => entry.collection === 'blog')) {
      const author = frontmatter(file).data.author
      if (typeof author !== 'string') continue
      const locale = file.split('/')[3] ?? ''
      const team = JSON.parse(read(`src/content/ekip/${locale}.json`)) as { items: { id: string }[] }
      if (!team.items.some((person) => person.id === author)) {
        problems.push(`${file}: author "${author}" src/content/ekip/${locale}.json içinde yok.`)
      }
    }
    expect(problems).toEqual([])
  })

  it.each(DATA)('%s: her dil için bir JSON dosyası var', (collection) => {
    const missing = locales.filter((locale) => !existsSync(path.join(ROOT, `src/content/${collection}/${locale}.json`)))
    expect(missing, `src/content/${collection}/<dil>.json eksik; var olan bir dili kopyalayıp çevirin.`).toEqual([])
  })

  it.each(locales)('"%s" dilinde en az bir blog yazısı ve bir belge var', (locale) => {
    expect(markdownFiles.some(({ collection, file }) => collection === 'blog' && file.includes(`/${locale}/`))).toBe(
      true,
    )
    expect(
      markdownFiles.some(({ collection, file }) => collection === 'belgeler' && file.includes(`/${locale}/`)),
    ).toBe(true)
  })
})
