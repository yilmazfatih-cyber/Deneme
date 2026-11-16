/**
 * KURAL TESTLERİ: temelin kendi kurallarını korur. Bir kural kırılınca ileti ne yapılacağını söyler.
 *
 *  1. API_PATHS'teki her adresin sunucuda kalıbı (ROUTES) var ve bağlı.
 *  2. Oturumsuz çağrılabilen uçlar yalnız PUBLIC_ROUTES'takiler; öteki her uç oturumsuz isteğe 401 verir.
 *  3. Migrasyon dosyaları kesintisiz numaralı ve doğru adlı.
 *  4. Her modül klasörünün test dosyası var.
 *  5. Her kaynak dosya Türkçe başlık yorumu ve "Genişletme:" satırıyla açılır.
 *  6. docs/API.md her ucu (ve yalnız onları) belgeler; belgedeki JSON örnekleri adlandırılan şemaya uyar.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as shared from '@uygulama/shared'
import { API_PATHS } from '@uygulama/shared'
import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { MIGRATIONS_DIR, loadMigrations } from '../src/db/migrate.ts'
import { okResponseSchema } from '../src/http/responses.ts'
import { ROUTES } from '../src/http/routes.ts'
import { accountExportSchema } from '../src/modules/account/service.ts'
import { createTestServer } from './support/harness.ts'

const API_DIR = fileURLToPath(new URL('../', import.meta.url))
const API_DOC = join(API_DIR, '../docs/API.md')

/** Oturum İSTEMEYEN uçlar. Yeni bir herkese açık uç eklerken buraya da yazın (bilinçli karar olsun diye). */
const PUBLIC_ROUTES = new Set([
  'GET /api/health',
  'POST /api/auth/register',
  'POST /api/auth/login',
  'POST /api/auth/logout',
  'POST /api/auth/password/forgot',
  'POST /api/auth/password/reset',
  'GET /api/invites/:token',
])

function registeredRoutes(): Set<string> {
  const t = createTestServer()
  const routes = new Set(
    t.server.app.routes
      .filter((route) => route.method !== 'ALL' && route.path.startsWith('/api/'))
      .map((route) => `${route.method} ${route.path}`),
  )
  void t.close()
  return routes
}

function patternToRegex(pattern: string): RegExp {
  const body = pattern
    .split('/')
    .map((part) => (part.startsWith(':') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/')
  return new RegExp(`^${body}$`)
}

function concrete(pattern: string): string {
  return pattern.replace(/:token/g, 'x'.repeat(43)).replace(/:(\w+)/g, (_match, name: string) => `ornek-${name}`)
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

describe('kural: adresler', () => {
  it("API_PATHS'teki her adres ROUTES kalıbıyla eşleşir ve sunucuda en az bir yöntemle bağlıdır", () => {
    const routes = registeredRoutes()
    const boundPatterns = new Set([...routes].map((route) => route.split(' ')[1]))
    for (const [name, value] of Object.entries(API_PATHS)) {
      const pattern = ROUTES[name as keyof typeof ROUTES]
      expect(pattern, `API_PATHS.${name} için src/http/routes.ts → ROUTES'a kalıp ekleyin`).toBeDefined()
      const sample = typeof value === 'function' ? value('ornek-1', 'ornek-2') : value
      expect(sample, `API_PATHS.${name} ile ROUTES.${name} uyuşmuyor`).toMatch(patternToRegex(pattern))
      expect(
        boundPatterns.has(pattern),
        `${pattern} sunucuda bağlı değil: modülün routes.ts'ine işleyici ekleyin`,
      ).toBe(true)
    }
    for (const route of routes) {
      const pattern = route.split(' ')[1] ?? ''
      expect(Object.values(ROUTES), `${route} ROUTES'ta yok: önce shared → API_PATHS'e adres ekleyin`).toContain(
        pattern,
      )
    }
  })

  it('PUBLIC_ROUTES dışındaki her uç oturumsuz isteğe 401 unauthorized verir', async () => {
    const t = createTestServer()
    const routes = [...registeredRoutes()]
    for (const publicRoute of PUBLIC_ROUTES)
      expect(routes, `${publicRoute} artık yok: PUBLIC_ROUTES'tan silin`).toContain(publicRoute)
    for (const route of routes.filter((item) => !PUBLIC_ROUTES.has(item))) {
      const [method = 'GET', pattern = ''] = route.split(' ')
      const response = await t.server.app.request(concrete(pattern), {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(method === 'GET' ? {} : { body: '{}' }),
      })
      const body = (await response.json()) as { error?: { code?: string } }
      expect(
        [response.status, body.error?.code],
        `${route} oturumsuz çağrılabiliyor! İşleyicinin ilk satırı requireUser(c) olmalı (ya da bilerek PUBLIC_ROUTES'a ekleyin)`,
      ).toEqual([401, 'unauthorized'])
    }
    await t.close()
  })
})

describe('kural: migrasyonlar', () => {
  it("numaralar 0001'den başlar ve kesintisizdir; her dosya açıklama yorumuyla başlar", () => {
    const migrations = loadMigrations()
    expect(migrations.length).toBeGreaterThan(0)
    migrations.forEach((migration, index) => {
      expect(migration.version, `${migration.file}: numara ${index + 1} olmalı`).toBe(index + 1)
      expect(
        migration.sql.startsWith(`-- ${migration.file.slice(0, 4)}`),
        `${migration.file} "-- NNNN — açıklama" satırıyla başlamalı`,
      ).toBe(true)
    })
    expect(readdirSync(MIGRATIONS_DIR).every((name) => name.endsWith('.sql'))).toBe(true)
  })
})

describe('kural: dosya düzeni', () => {
  it('her modül klasörünün test/modules/<ad>.test.ts dosyası vardır', () => {
    for (const name of readdirSync(join(API_DIR, 'src/modules'))) {
      expect(
        existsSync(join(API_DIR, 'test/modules', `${name}.test.ts`)),
        `src/modules/${name} için test/modules/${name}.test.ts yazın`,
      ).toBe(true)
    }
  })

  it('her kaynak dosya Türkçe başlık yorumuyla ve "Genişletme:" satırıyla açılır', () => {
    const files = [
      ...walk(join(API_DIR, 'src')),
      ...walk(join(API_DIR, 'scripts')),
      ...walk(join(API_DIR, 'test/support')),
    ].filter((path) => path.endsWith('.ts'))
    for (const path of files) {
      const head = readFileSync(path, 'utf8').split('\n').slice(0, 20).join('\n')
      const name = relative(API_DIR, path)
      expect(head.startsWith('/**'), `${name}: dosya /** … */ başlık yorumuyla başlamalı`).toBe(true)
      expect(head, `${name}: başlık yorumuna "Genişletme:" satırı ekleyin`).toContain('Genişletme:')
    }
  })
})

describe('kural: docs/API.md', () => {
  const doc = readFileSync(API_DOC, 'utf8')

  it('her uç belgelenmiştir ve belgede olmayan uç yoktur (başlık: "### YÖNTEM /api/…")', () => {
    const documented = new Set(
      [...doc.matchAll(/^### (GET|POST|PATCH|PUT|DELETE) (\/api\/\S+)$/gm)].map((match) => `${match[1]} ${match[2]}`),
    )
    const routes = registeredRoutes()
    for (const route of routes) expect(documented.has(route), `${route} docs/API.md'de belgelenmemiş`).toBe(true)
    for (const route of documented) expect(routes.has(route), `docs/API.md'deki ${route} sunucuda yok`).toBe(true)
  })

  it('belgedeki her JSON örneği adını taşıdığı şemaya uyar', () => {
    const schemas: Record<string, z.ZodType> = { okResponseSchema, accountExportSchema }
    for (const [name, value] of Object.entries(shared)) {
      if (name.endsWith('Schema') && typeof value === 'object' && value !== null && 'safeParse' in value) {
        schemas[name] = value as z.ZodType
      }
    }
    const examples = [...doc.matchAll(/```json (\w+)\n([\s\S]*?)```/g)]
    expect(examples.length).toBeGreaterThan(20)
    for (const [, name = '', body = ''] of examples) {
      const schema = schemas[name]
      expect(schema, `docs/API.md: "${name}" diye bir şema yok`).toBeDefined()
      const parsed = schema?.safeParse(JSON.parse(body))
      expect(
        parsed?.success,
        `docs/API.md: ${name} örneği şemaya uymuyor: ${JSON.stringify(parsed?.error?.issues)}`,
      ).toBe(true)
    }
  })
})
