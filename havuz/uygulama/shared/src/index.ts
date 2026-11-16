/**
 * @uygulama/shared — sunucu ile istemcinin ORTAK sözleşmesi.
 * Buradaki her şey iki tarafta da aynen çalışır: şemalar, türler, eşitleme mantığı, Türkçe metin yardımcıları.
 *
 * Kural: bu pakette ağ, veritabanı, tarayıcıya ya da Node'a özgü kod YOKTUR (yalnız saf işlevler ve şemalar).
 * Test yardımcıları ayrı girişten gelir: `@uygulama/shared/testing`.
 */
import { z } from 'zod'

// Doğrulama iletileri Türkçe olsun (Zod'un yerleşik Türkçe yereli). Bu satır paket yüklenince bir kez çalışır.
z.config(z.locales.tr())

export * from './api.ts'
export * from './entities/index.ts'
export * from './entity.ts'
export * from './errors.ts'
export * from './ids.ts'
export * from './replica.ts'
export * from './sync.ts'
export * from './text.ts'
