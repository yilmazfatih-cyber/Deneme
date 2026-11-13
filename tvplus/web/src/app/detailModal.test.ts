import { describe, expect, it } from 'vitest'
import { switchTitleHref } from './detailModal'

describe('pencerede başlık değiştirme adresi', () => {
  it('aynı sayfada jbv değişir, yeni tctx gelir ya da eskisi düşer', () => {
    expect(switchTitleHref({ pathname: '/goz-at', search: '?jbv=1&tctx=a' }, 2, 'b')).toBe('/goz-at?jbv=2&tctx=b')
    expect(switchTitleHref({ pathname: '/listem', search: '?jbv=1&tctx=a' }, 3)).toBe('/listem?jbv=3')
    expect(switchTitleHref({ pathname: '/ara', search: '?q=sin&jbv=1' }, 4)).toBe('/ara?q=sin&jbv=4')
  })
  it('mobilde tam sayfa', () => {
    expect(switchTitleHref({ pathname: '/baslik/1', search: '' }, 5, null, 'mobile')).toBe('/baslik/5')
  })
})
