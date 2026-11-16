import { describe, expect, it } from 'vitest'
import {
  article,
  breadcrumbList,
  faqPage,
  organization,
  serializeJsonLd,
  website,
} from '../../src/lib/structured-data.ts'

describe('JSON-LD üreticileri', () => {
  it('kırıntı yolu sıralı ve tam adresli', () => {
    const data = breadcrumbList([
      { label: 'Sedir', url: 'https://sedir.example/' },
      { label: 'Blog', url: 'https://sedir.example/blog/' },
    ])
    expect(data).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { position: 1, name: 'Sedir', item: 'https://sedir.example/' },
        { position: 2, name: 'Blog', item: 'https://sedir.example/blog/' },
      ],
    })
  })

  it('SSS soru ve yanıtları taşır', () => {
    expect(faqPage([{ question: 'Ne?', answer: 'Bu.' }])).toMatchObject({
      '@type': 'FAQPage',
      mainEntity: [{ '@type': 'Question', name: 'Ne?', acceptedAnswer: { '@type': 'Answer', text: 'Bu.' } }],
    })
  })

  it('yazar yoksa kurumu yazar sayar; güncelleme yoksa yayın tarihini kullanır', () => {
    const data = article({
      url: 'https://sedir.example/blog/x/',
      headline: 'Başlık',
      description: 'Açıklama',
      image: 'https://sedir.example/og/blog/x.png',
      datePublished: new Date('2026-11-02'),
      lang: 'tr',
      keywords: ['SEO'],
      organizationUrl: 'https://sedir.example/',
      organizationName: 'Sedir',
    })
    expect(data.author).toEqual({ '@type': 'Organization', name: 'Sedir', url: 'https://sedir.example/' })
    expect(data.dateModified).toBe('2026-11-02T00:00:00.000Z')
    expect(data.keywords).toBe('SEO')
  })

  it('kurum ve site verisi boş alanları yazmaz', () => {
    const data = organization({
      name: 'Sedir',
      legalName: 'Sedir A.Ş.',
      url: 'https://sedir.example/',
      logo: 'https://sedir.example/apple-touch-icon.png',
      email: 'a@b.co',
      sameAs: [],
    })
    expect(data).not.toHaveProperty('sameAs')
    expect(data).not.toHaveProperty('telephone')
    expect(website({ name: 'S', url: 'u', description: 'd', lang: 'tr', organizationUrl: 'o' })).toMatchObject({
      inLanguage: 'tr',
    })
  })

  it('<script> içine güvenle yazılır: </script> ve satır ayırıcıları kaçışlanır', () => {
    const text = serializeJsonLd({ name: '</script><script>alert(1)</script>', other: 'a\u2028b' })
    expect(text).not.toContain('</script>')
    expect(text).toContain('\\u003c/script>')
    expect(text).toContain('\\u2028')
    expect(JSON.parse(text)).toEqual({ name: '</script><script>alert(1)</script>', other: 'a\u2028b' })
  })
})
