/**
 * @vitest-environment node
 * KURAL: her sayfa rota kaydında (src/app/routes.tsx) ve başlığı sözlükte.
 *  - features altında dışa aktarılan her `…Page` bileşeni routes.tsx'te kullanılıyor
 *  - yollar tekil, küçük harf ve ASCII; başlık anahtarı sözlükte
 *  - e-posta/davet bağlantılarının yolları (shared → WEB_ROUTES) kayıtlı
 *  - yalnız geliştirme sayfaları yayında yok; hesapsız derlemede API isteyen sayfa yok; alt çubukta en çok 5 öğe
 */
import { WEB_ROUTES } from '@uygulama/shared'
import { describe, expect, it } from 'vitest'
import { activeRoutes, ROUTES } from '../../src/app/routes.tsx'
import { MESSAGES } from '../../src/i18n/index.ts'
import { listFiles, parse, read, rel, SRC, ts } from './source.ts'
import { join } from 'node:path'

function exportedPages(): { file: string; name: string }[] {
  const pages: { file: string; name: string }[] = []
  for (const file of listFiles(join(SRC, 'features'), ['.tsx'])) {
    for (const statement of parse(file).statements) {
      const exported = ts.canHaveModifiers(statement)
        ? ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
        : false
      if (exported && ts.isFunctionDeclaration(statement) && statement.name?.text.endsWith('Page')) {
        pages.push({ file: rel(file), name: statement.name.text })
      }
    }
  }
  return pages
}

describe('rota kaydı (kural testleri)', () => {
  it('her sayfa bileşeni rota kaydında kullanılıyor', () => {
    const registry = read(join(SRC, 'app', 'routes.tsx'))
    const missing = exportedPages()
      .filter((page) => !registry.includes(`<${page.name} />`))
      .map((page) => `${page.file} → ${page.name}`)
    expect(missing, 'Sayfayı src/app/routes.tsx içindeki ROUTES listesine ekleyin (npm run gen -- page <ad>)').toEqual(
      [],
    )
  })

  it('yollar tekil ve düzgün; başlıklar sözlükte', () => {
    const paths = ROUTES.map((route) => route.path)
    expect(new Set(paths).size, 'Aynı yol iki kez kayıtlı').toBe(paths.length)
    for (const route of ROUTES) {
      expect(route.path, `${route.path}: yol / ile başlamalı; küçük harf, rakam, - ve :param`).toMatch(
        /^\/[a-z0-9-]+(\/(:[a-zA-Z]+|[a-z0-9-]+))*$/,
      )
      expect(MESSAGES[route.title], `${route.path}: başlık anahtarı "${route.title}" sözlükte yok`).toBeDefined()
    }
  })

  it('e-posta ve davet bağlantılarının yolları kayıtlı', () => {
    for (const path of Object.values(WEB_ROUTES))
      expect(
        ROUTES.some((route) => route.path === path),
        path,
      ).toBe(true)
  })

  it('geliştirme sayfaları yayında yok; hesapsız derlemede API isteyen sayfa yok', () => {
    const production = activeRoutes({ dev: false, apiEnabled: true })
    expect(production.some((route) => route.devOnly)).toBe(false)
    const localOnly = activeRoutes({ dev: false, apiEnabled: false })
    expect(localOnly.some((route) => route.needsApi)).toBe(false)
    expect(localOnly.map((route) => route.path)).toContain('/gorevler')
  })

  it('alt gezinme çubuğunda en çok 5 öğe var (hesaplı kip)', () => {
    const mobile = activeRoutes({ dev: false, apiEnabled: true }).filter((route) => route.nav?.mobile)
    expect(mobile.length).toBeLessThanOrEqual(5)
  })
})
