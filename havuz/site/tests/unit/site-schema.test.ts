import { describe, expect, it } from 'vitest'
import { defineSiteConfig, type SiteConfigInput } from '../../src/lib/site-schema.ts'
import { siteConfig } from '../../src/site.config.ts'

const valid = structuredClone(siteConfig) as unknown as SiteConfigInput

describe('site.config.ts şeması', () => {
  it('örnek ayar geçerlidir', () => {
    expect(() => defineSiteConfig(valid)).not.toThrow()
  })

  it('hatalı alanı Türkçe ve yol gösteren bir iletiyle bildirir', () => {
    const broken = structuredClone(valid) as unknown as Record<string, unknown>
    broken.brand = { primary: 'yeşil', accent: '#b4532a' }
    broken.contact = { email: 'eposta-degil' }
    const run = () => defineSiteConfig(broken as unknown as SiteConfigInput)
    expect(run).toThrow(/^src\/site\.config\.ts hatalı:/u)
    expect(run).toThrow(/- brand\.primary: Renk "#1f5f4a" gibi 6 haneli yazılmalı\./u)
    expect(run).toThrow(/- contact\.email: Geçerli bir e-posta adresi yazın/u)
  })

  it('varsayılan dil tanımlı değilse durur', () => {
    const broken = { ...valid, defaultLocale: 'de' }
    expect(() => defineSiteConfig(broken)).toThrow(/"de" dili "locales" içinde tanımlı değil/u)
  })

  it('bilinmeyen alanı (yazım hatası) yakalar', () => {
    const broken = { ...valid, nmae: 'Yanlış' } as SiteConfigInput
    expect(() => defineSiteConfig(broken)).toThrow(/nmae/u)
  })
})
