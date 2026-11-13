import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import type { AppConfig } from '../src/kernel/config'

/**
 * Test uygulaması: geçici veri klasörü, dış ağ kapalı, sabit gizli anahtar.
 * HTTP için `app.inject({ method, url, headers, payload })` kullanın (kapı açılmaz).
 */
export async function createTestApp(overrides: Partial<AppConfig> = {}): Promise<FastifyInstance> {
  const app = await buildApp({
    dataDir: mkdtempSync(join(tmpdir(), 'tvplus-test-')),
    secret: 'test-secret',
    isTest: true,
    offline: true,
    logLevel: 'silent',
    ...overrides,
  })
  await app.ready()
  return app
}
