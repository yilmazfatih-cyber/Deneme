/**
 * Gizli sınav testi (site-kariyer-sayfasi): içerik dosyası, ön bilgi ve menü bağlantısı.
 * Sayfanın derlendiğini ve bağlantının kırık olmadığını temelin kendi denetimi (check-site) sınar.
 */
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { siteConfig } from '../../src/site.config.ts'

const CANDIDATES = ['src/content/sayfalar/tr/kariyer.md', 'src/content/sayfalar/tr/kariyer.mdx']

function page(): { front: string; body: string } {
  const file = CANDIDATES.find((path) => existsSync(path))
  if (!file) throw new Error('src/content/sayfalar/tr/kariyer.md bulunamadı')
  const text = readFileSync(file, 'utf8')
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!match) throw new Error('ön bilgi (---) bulunamadı')
  return { front: match[1] ?? '', body: text.slice(match[0].length) }
}

function field(front: string, name: string): string | undefined {
  const raw = new RegExp(`^${name}:\\s*(.+)$`, 'm').exec(front)?.[1]?.trim()
  return raw?.replace(/^(['"])(.*)\1$/, '$2')
}

describe('gizli: Kariyer sayfası', () => {
  it('başlık Kariyer, açıklama 50–160 karakter, taslak değil', () => {
    const { front } = page()
    expect(field(front, 'title')).toBe('Kariyer')
    const description = field(front, 'description') ?? ''
    expect(description.length).toBeGreaterThanOrEqual(50)
    expect(description.length).toBeLessThanOrEqual(160)
    expect(description).not.toMatch(/YAZIN|AÇIKLAMA/)
    expect(field(front, 'draft') ?? 'false').toBe('false')
  })

  it('giriş paragrafı ve "Açık pozisyonlar" bölümü', () => {
    const { body } = page()
    expect(body).not.toMatch(/YAZIN:/)
    expect(body).toMatch(/^##\s+Açık pozisyonlar\s*$/m)
    expect(body).toContain('Ön yüz geliştirici (İstanbul, uzaktan)')
    expect(body).toContain('Ürün tasarımcısı (Ankara)')
    const intro = body.split(/^##\s/m)[0]?.trim() ?? ''
    expect(intro.length, 'giriş paragrafı yok ya da çok kısa').toBeGreaterThan(40)
  })

  it('üst menünün son öğesi Kariyer → /kariyer/; eski öğeler duruyor', () => {
    const nav = siteConfig.locales.tr.nav
    expect(nav.at(-1)).toEqual({ label: 'Kariyer', href: '/kariyer/' })
    expect(nav.map((item) => item.label)).toEqual(['Özellikler', 'Fiyatlar', 'Blog', 'Belgeler', 'Hakkında', 'Kariyer'])
  })
})
