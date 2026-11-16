import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'
import { z } from '../../src/lib/zod-tr.ts'
import { blogSchema, docSchema, pageSchema, PLACEHOLDER_DESCRIPTION } from '../../src/lib/content-schemas.ts'
import { render } from '../../scripts/new.ts'

/** Testte görsel alanı yerine düz metin kabul eden sahte image() */
const image = () => z.string()
const blog = blogSchema(image)

const messages = (result: { success: boolean; error?: z.ZodError }) =>
  result.success ? [] : (result.error?.issues ?? []).map((issue) => `${issue.path.join('.')}: ${issue.message}`)

describe('blog ön bilgisi', () => {
  const good = {
    title: 'İyi bir ana sayfa nasıl yazılır?',
    description: 'Ziyaretçi ilk beş saniyede üç soruya yanıt arar. Bu yazı o soruları sırayla ele alır.',
    date: '2026-11-02',
    tags: ['SEO'],
  }

  it('geçerli ön bilgiyi kabul eder ve varsayılanları doldurur', () => {
    const parsed = blog.parse(good)
    expect(parsed.draft).toBe(false)
    expect(parsed.date).toBeInstanceOf(Date)
  })

  it('her hata için Türkçe ve ne yapılacağını söyleyen ileti verir', () => {
    const result = blog.safeParse({ baslik: 'x', description: 'kısa', date: 'dün', tags: 'SEO' })
    const lines = messages(result)
    expect(lines).toContain('title: Bu alan zorunlu. Yazının başlığı; arama sonuçlarında görünür.')
    expect(lines).toContain(
      'description: En az 50 karakter olmalı (şu an 4). Arama sonuçlarında ve paylaşım kartında görünen özet.',
    )
    expect(lines.some((line) => line.startsWith('date: Tarih YYYY-AA-GG'))).toBe(true)
    expect(lines).toContain('tags: Etiketler liste olmalı, ör. tags: [SEO, Tasarım]')
    expect(lines.some((line) => line.includes('Bilinmeyen alan: baslik'))).toBe(true)
  })

  it('kapak görseli varsa açıklamasını ister; güncelleme tarihi yayından önce olamaz', () => {
    const lines = messages(blog.safeParse({ ...good, cover: './a.png', updated: '2026-01-01' }))
    expect(lines).toContain('coverAlt: Kapak görseli varsa coverAlt (görselin açıklaması) zorunlu.')
    expect(lines).toContain('updated: Güncelleme tarihi yayın tarihinden önce olamaz.')
  })
})

describe('belge ve sayfa ön bilgisi', () => {
  it('belge order sayısı ister', () => {
    const lines = messages(
      docSchema.safeParse({ title: 'Başlık', description: 'x'.repeat(60), group: 'Başlangıç', order: 'on' }),
    )
    expect(lines[0]).toMatch(/^order: order bir sayı olmalı/u)
  })

  it('sayfa varsayılanları kapalıdır', () => {
    expect(pageSchema.parse({ title: 'Hakkında', description: 'x'.repeat(60) })).toMatchObject({
      legalTemplate: false,
      showTeam: false,
    })
  })
})

describe('üretecin yazdığı taslaklar şemaya uyar', () => {
  const frontmatter = (text: string) =>
    parseYaml(/^---\n([\s\S]*?)\n---/u.exec(text)?.[1] ?? '') as Record<string, unknown>
  const now = new Date(2026, 10, 16)
  const request = { title: 'Çığ gibi büyüyen İş: 2026', locale: 'tr' as const, mdx: false, root: '/', group: undefined }

  it('blog, belge ve sayfa', () => {
    expect(blog.parse(frontmatter(render({ ...request, kind: 'blog' }, now)))).toMatchObject({
      draft: true,
      description: PLACEHOLDER_DESCRIPTION,
    })
    expect(
      docSchema.parse(frontmatter(render({ ...request, kind: 'belge' }, now, { order: 160, group: 'Kullanım' }))),
    ).toMatchObject({ order: 160 })
    expect(pageSchema.parse(frontmatter(render({ ...request, kind: 'sayfa' }, now)))).toMatchObject({ draft: true })
  })
})
