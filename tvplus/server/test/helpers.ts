import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { adminCodeHashOf, type AppConfig } from '../src/kernel/config'

/** Testlerin yönetici kodu (yalnız testlerde; gerçek kodun özeti kernel/config.ts DEFAULT_ADMIN_CODE_HASH) */
export const TEST_ADMIN_CODE = 'TEST-ADMIN-42'

/**
 * Test uygulaması: geçici veri klasörü, dış ağ kapalı, sabit gizli anahtar.
 * HTTP için `app.inject({ method, url, headers, payload })` kullanın (kapı açılmaz).
 * Afiş seçimi (artworkPersonalization) testlerde varsayılan KAPALIDIR.
 * Yönetici kodu TEST_ADMIN_CODE'dur; `adminCode` ile başka bir düz kod verilebilir (null → yönetici kipi kapalı).
 */
export async function createTestApp(
  overrides: Partial<AppConfig> & { adminCode?: string | null } = {},
): Promise<FastifyInstance> {
  const { adminCode = TEST_ADMIN_CODE, ...rest } = overrides
  const app = await buildApp({
    dataDir: mkdtempSync(join(tmpdir(), 'tvplus-test-')),
    secret: 'test-secret',
    isTest: true,
    offline: true,
    logLevel: 'silent',
    debugAccess: 'open',
    studioAccess: 'open',
    sampleViewing: false,
    adminCodeHash: adminCode === null ? null : adminCodeHashOf(adminCode),
    // Mevcut testler varsayılan görsel adreslerini bekler; afiş seçimi testleri `artworkPersonalization: true` verir
    artworkPersonalization: false,
    ...rest,
  })
  await app.ready()
  return app
}
