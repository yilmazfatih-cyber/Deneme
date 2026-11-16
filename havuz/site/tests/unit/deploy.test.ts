import { describe, expect, it } from 'vitest'
import { resolveDeployTarget } from '../../src/lib/deploy.ts'

const fallback = 'https://sedir.example'

describe('resolveDeployTarget', () => {
  it('ortam değişkeni yoksa site.config adresini kullanır', () => {
    expect(resolveDeployTarget({}, fallback)).toEqual({ site: 'https://sedir.example', base: '/' })
  })

  it('boş değişkenleri yok sayar', () => {
    expect(resolveDeployTarget({ SITE_URL: '', SITE_BASE: '  ' }, fallback)).toEqual({ site: 'https://sedir.example', base: '/' })
  })

  it('SITE_URL içindeki yoldan alt klasörü çıkarır', () => {
    expect(resolveDeployTarget({ SITE_URL: 'https://kullanici.github.io/depo-adi/' }, fallback)).toEqual({
      site: 'https://kullanici.github.io',
      base: '/depo-adi/',
    })
  })

  it('SITE_BASE verilirse onu kullanır ve biçimini düzeltir', () => {
    expect(resolveDeployTarget({ SITE_URL: 'https://kullanici.github.io', SITE_BASE: 'alt/klasor' }, fallback)).toEqual({
      site: 'https://kullanici.github.io',
      base: '/alt/klasor/',
    })
    expect(resolveDeployTarget({ SITE_BASE: '/depo' }, fallback)).toEqual({ site: 'https://sedir.example', base: '/depo/' })
    expect(resolveDeployTarget({ SITE_BASE: '/' }, fallback)).toEqual({ site: 'https://sedir.example', base: '/' })
  })

  it('hatalı adreste Türkçe ve yol gösteren bir hata verir', () => {
    expect(() => resolveDeployTarget({ SITE_URL: 'ornek.com' }, fallback)).toThrow(/SITE_URL "https:\/\/www\.ornek\.com" gibi/u)
    expect(() => resolveDeployTarget({ SITE_BASE: '/depo adı/' }, fallback)).toThrow(/SITE_BASE "\/depo-adi\/" gibi/u)
  })
})
