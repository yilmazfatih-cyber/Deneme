import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createContent, localDate, parseArgs } from '../../scripts/new.ts'

let root = ''
const now = new Date(2026, 10, 16, 23, 30)

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'site-uretec-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('parseArgs', () => {
  it('türü, başlığı ve seçenekleri çözer', () => {
    expect(parseArgs(['blog', 'Kış', 'kampanyası', '--dil', 'en', '--mdx'], '/proje')).toMatchObject({
      kind: 'blog',
      title: 'Kış kampanyası',
      locale: 'en',
      mdx: true,
      root: '/proje',
    })
  })

  it('hatalı kullanımı açıklar', () => {
    expect(() => parseArgs(['haber', 'x'], '/')).toThrow(/"blog", "belge" ya da "sayfa"/u)
    expect(() => parseArgs(['blog'], '/')).toThrow(/Başlık eksik/u)
    expect(() => parseArgs(['blog', 'x', '--dil', 'de'], '/')).toThrow(/Bilinmeyen dil: "de"/u)
  })
})

describe('createContent', () => {
  it('Türkçe başlıktan ASCII dosya adı üretir ve doğru klasöre yazar', () => {
    const created = createContent({ kind: 'blog', title: 'Çığ gibi büyüyen İş', locale: 'tr', mdx: false, root }, now)
    expect(created).toEqual({ file: 'src/content/blog/tr/cig-gibi-buyuyen-is.md', url: '/blog/cig-gibi-buyuyen-is/' })
    const text = readFileSync(path.join(root, created.file), 'utf8')
    expect(text).toContain("title: 'Çığ gibi büyüyen İş'")
    expect(text).toContain('date: 2026-11-16')
    expect(text).toContain('draft: true')
  })

  it('belgeyi son belgenin grubuna, 10 fazla sırayla ekler', () => {
    const folder = path.join(root, 'src/content/belgeler/tr')
    mkdirSync(folder, { recursive: true })
    writeFileSync(path.join(folder, 'a.md'), '---\ntitle: A\ngroup: Başlangıç\norder: 10\n---\n')
    writeFileSync(path.join(folder, 'b.md'), '---\ntitle: B\ngroup: Yayın\norder: 40\n---\n')
    const created = createContent({ kind: 'belge', title: 'Randevu kuralları', locale: 'tr', mdx: false, root }, now)
    const text = readFileSync(path.join(root, created.file), 'utf8')
    expect(text).toContain("group: 'Yayın'")
    expect(text).toContain('order: 50')
    expect(created.url).toBe('/belgeler/randevu-kurallari/')
  })

  it('sayfa adresini ve İngilizce klasörü doğru verir', () => {
    expect(createContent({ kind: 'sayfa', title: 'Careers', locale: 'en', mdx: true, root }, now)).toEqual({
      file: 'src/content/sayfalar/en/careers.mdx',
      url: '/en/careers/',
    })
  })

  it('ayrılmış adı, var olan dosyayı, sayı adını ve uygunsuz başlık uzunluğunu reddeder', () => {
    expect(() => createContent({ kind: 'sayfa', title: 'Blog', locale: 'tr', mdx: false, root }, now)).toThrow(
      /ayrılmış/u,
    )
    createContent({ kind: 'blog', title: 'Aynı başlıklı yazı', locale: 'tr', mdx: false, root }, now)
    expect(() =>
      createContent({ kind: 'blog', title: 'Aynı başlıklı yazı', locale: 'tr', mdx: true, root }, now),
    ).toThrow(/zaten var/u)
    expect(() => createContent({ kind: 'blog', title: '20262027282', locale: 'tr', mdx: false, root }, now)).toThrow(
      /rakamdan/u,
    )
    expect(() => createContent({ kind: 'blog', title: 'Kısa', locale: 'tr', mdx: false, root }, now)).toThrow(
      /10–70 karakter/u,
    )
  })
})

describe('localDate', () => {
  it('yerel saate göre gün verir', () => {
    expect(localDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
