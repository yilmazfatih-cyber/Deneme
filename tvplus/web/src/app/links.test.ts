import { describe, expect, it } from 'vitest'
import { buildTitleHref, closeTitleHref } from './links'

describe('titleHref', () => {
  it('masaüstünde geçerli sayfanın üstünde pencere açar', () => {
    expect(buildTitleHref('desktop', { pathname: '/goz-at', search: '' }, 80010001)).toBe('/goz-at?jbv=80010001')
    expect(buildTitleHref('desktop', { pathname: '/goz-at/diziler', search: '?tur=83' }, '7', 'a:b')).toBe(
      '/goz-at/diziler?tur=83&jbv=7&tctx=a%3Ab',
    )
    // açık pencereden başka başlığa: jbv değişir, eski tctx düşer
    expect(buildTitleHref('desktop', { pathname: '/listem', search: '?jbv=1&tctx=x' }, 2)).toBe('/listem?jbv=2')
  })

  it('kabuksuz sayfalarda pencere ana sayfanın üstünde açılır', () => {
    expect(buildTitleHref('desktop', { pathname: '/izle/123', search: '?tctx=z' }, 5)).toBe('/goz-at?jbv=5')
    expect(buildTitleHref('desktop', { pathname: '/', search: '' }, 5)).toBe('/goz-at?jbv=5')
    expect(buildTitleHref('desktop', { pathname: '/_ui', search: '' }, 5)).toBe('/goz-at?jbv=5')
    expect(buildTitleHref('desktop', { pathname: '/_ui/kabuk', search: '' }, 5)).toBe('/_ui/kabuk?jbv=5')
  })

  it('mobilde ve TV tarayıcısında tam sayfa', () => {
    expect(buildTitleHref('mobile', { pathname: '/goz-at', search: '' }, 80010001)).toBe('/baslik/80010001')
    expect(buildTitleHref('mobile', { pathname: '/goz-at', search: '' }, 9, 'r:1')).toBe('/baslik/9?tctx=r%3A1')
    expect(buildTitleHref('tv', { pathname: '/', search: '' }, 9)).toBe('/baslik/9')
  })

  it('pencereyi kapatan adres jbv ve tctx taşımaz', () => {
    expect(closeTitleHref({ pathname: '/goz-at', search: '?jbv=1&tctx=x' })).toBe('/goz-at')
    expect(closeTitleHref({ pathname: '/ara', search: '?q=sin&jbv=1' })).toBe('/ara?q=sin')
  })
})
