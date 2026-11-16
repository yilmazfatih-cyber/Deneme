import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { renderOgCard, sanitize, type OgCard } from '../../src/integrations/og-render.ts'
import { kickerFromJsonLd } from '../../src/integrations/og-images.ts'
import { parseHtml } from '../../src/integrations/html.ts'

const card: OgCard = {
  title: 'Çığ gibi büyüyen İş: IĞDIR’da ışıl ışıl şölen',
  description: 'Türkçe harflerin hepsi: ç ğ ı İ ö ş ü Ç Ğ Ö Ş Ü',
  kicker: 'Blog',
  siteName: 'Sedir',
  host: 'sedir.example',
  colors: {
    page: '#fbfaf7',
    ink: '#101b16',
    muted: '#4e5853',
    brand: '#1f5f4a',
    onBrand: '#ffffff',
    brandSoft: '#e3eee8',
    brandInk: '#1f5f4a',
    line: '#e1e0d8',
  },
}

describe('paylaşım görseli', () => {
  it('1200×630 PNG üretir ve Türkçe harflerin hepsi yazı tipinde bulunur', async () => {
    const missing: string[] = []
    const png = await renderOgCard(card, missing)
    const info = await sharp(png).metadata()
    expect(info.format).toBe('png')
    expect([info.width, info.height]).toEqual([1200, 630])
    expect(missing).toEqual([])
  }, 30_000)

  it('aynı girdiden bayt bayt aynı görsel çıkar (makineden bağımsız)', async () => {
    const [first, second] = await Promise.all([renderOgCard(card), renderOgCard(card)])
    expect(Buffer.compare(first, second)).toBe(0)
  }, 30_000)

  it('yazı tipinde olmayan karakterleri tanımlı karşılıklarıyla değiştirir', () => {
    expect(sanitize('Fiyat ₺349 → hemen ✓')).toBe('Fiyat 349 TL -> hemen')
  })

  it('üst etiketi kırıntı yolundan alır', () => {
    const document = parseHtml(
      '<script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[{"name":"Sedir"},{"name":"Belgeler"},{"name":"X"}]}</script>',
    )
    expect(kickerFromJsonLd(document)).toBe('Belgeler')
    expect(kickerFromJsonLd(parseHtml('<p>yok</p>'))).toBe('')
  })
})
