import { describe, expect, it } from 'vitest'
import { buildPath, expandPattern, flattenRoutes, matchRoutes, matchSegments } from '../../src/yonlendirici/index.ts'

const match = (pattern: string, path: string) => {
  for (const segments of expandPattern(pattern)) {
    const params = matchSegments(segments, path)
    if (params) return params
  }
  return null
}

describe('desen eşleme', () => {
  it('parametreleri çözer ve yüzde kodlamasını açar', () => {
    expect(match('/kullanici/:id', '/kullanici/42')).toEqual({ id: '42' })
    expect(match('/kullanici/:id', '/kullanici/ay%C5%9Fe/')).toEqual({ id: 'ayşe' })
    expect(match('/kullanici/:id', '/kullanici')).toBeNull()
    expect(match('/kullanici/:id', '/kullanici/1/fazla')).toBeNull()
    expect(match('/a/:x', '/a/%E0%A4%A')).toEqual({ x: '%E0%A4%A' })
  })

  it('isteğe bağlı parça ve joker', () => {
    expect(match('/arama/:sorgu?', '/arama')).toEqual({})
    expect(match('/arama/:sorgu?', '/arama/kitap')).toEqual({ sorgu: 'kitap' })
    expect(match('/dosya/*', '/dosya/belgeler/2026/rapor.pdf')).toEqual({ '*': 'belgeler/2026/rapor.pdf' })
    expect(match('/dosya/*yol', '/dosya')).toEqual({ yol: '' })
    expect(() => expandPattern('/a/*/b')).toThrow(/yalnız desenin sonunda/)
  })

  it('yol üretir: kodlar, isteğe bağlıyı atlar, eksik zorunluyu bildirir', () => {
    expect(buildPath('/kullanici/:id', { id: 'ayşe yılmaz' })).toBe('/kullanici/ay%C5%9Fe%20y%C4%B1lmaz')
    expect(buildPath('/arama/:sorgu?')).toBe('/arama')
    expect(buildPath('/dosya/*', { '*': 'a/b c' })).toBe('/dosya/a/b%20c')
    expect(() => buildPath('/kullanici/:id')).toThrow(/"id" parametresi eksik/)
  })
})

describe('rota sıralama ve iç içe rotalar', () => {
  const routes = [
    { path: '/', name: 'ana' },
    { path: '/kullanici/:id', name: 'kullanici' },
    { path: '/kullanici/yeni', name: 'yeni-kullanici' },
    {
      path: '/ayarlar',
      name: 'ayarlar',
      children: [
        { path: '', name: 'ayarlar-ozet' },
        { path: 'profil', name: 'profil' },
      ],
    },
    { path: '*', name: 'bulunamadi' },
  ]
  const branches = flattenRoutes(routes)
  const names = (path: string) => matchRoutes(branches, path)?.map((m) => m.route.name)

  it('sabit parça parametreden, parametre jokerden önce gelir', () => {
    expect(names('/kullanici/yeni')).toEqual(['yeni-kullanici'])
    expect(names('/kullanici/7')).toEqual(['kullanici'])
    expect(names('/olmayan/yol')).toEqual(['bulunamadi'])
    expect(names('/')).toEqual(['ana'])
  })

  it('iç içe rotada kökten yaprağa zincir döner; boş yol dizin sayfasıdır', () => {
    expect(names('/ayarlar/profil')).toEqual(['ayarlar', 'profil'])
    expect(names('/ayarlar')).toEqual(['ayarlar', 'ayarlar-ozet'])
  })
})
