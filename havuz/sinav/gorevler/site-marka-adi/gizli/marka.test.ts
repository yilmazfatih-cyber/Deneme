/**
 * Gizli sınav testi (site-marka-adi): yeni ad her yerde, Türkçe ekler uyumlu, adres ve e-posta değişmemiş.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { siteConfig } from '../../src/site.config.ts'

function contentFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return contentFiles(path)
    return /\.(md|mdx|json)$/.test(name) ? [path] : []
  })
}

describe('gizli: marka adı', () => {
  it('site ayarı yeni adı taşıyor; adres ve e-posta aynı', () => {
    const config = JSON.stringify(siteConfig)
    expect(siteConfig.name).toBe('Çınar')
    expect(config).not.toMatch(/Sedir/)
    expect(config).toContain('Çınar Yazılım A.Ş.')
    expect(siteConfig.url).toBe('https://sedir.example')
    expect(config).toContain('merhaba@sedir.example')
    expect(siteConfig.locales.tr.title.startsWith('Çınar')).toBe(true)
    expect(siteConfig.locales.en.title.startsWith('Çınar')).toBe(true)
  })

  it('içerikte eski ad kalmadı; Türkçe ekler ünlü uyumuna uyuyor', () => {
    const files = contentFiles('src/content')
    expect(files.length).toBeGreaterThan(20)
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      expect(text, file).not.toMatch(/Sedir/)
      expect(text, `${file}: ek ünlü uyumuna uymuyor`).not.toMatch(/Çınar['’](?:in|i|e|de|den|le|dir)(?!\p{L})/u)
    }
    const team = readFileSync('src/content/ekip/tr.json', 'utf8')
    expect(team).toMatch(/Çınar['’]ın(?!\p{L})/u)
    expect(team).toMatch(/Çınar['’]ı(?!\p{L})/u)
    expect(readFileSync('src/content/sayfalar/tr/hakkinda.md', 'utf8')).toMatch(/Çınar['’]ı(?!\p{L})/u)
    expect(readFileSync('src/content/sayfalar/en/about.md', 'utf8')).toContain('Çınar')
  })
})
