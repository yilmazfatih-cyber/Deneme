/**
 * Alan servisleri testlerinin ortak düzeneği: örnek içerik, sabit saat, sahte kimlik, pasaportlar.
 * Örnek içerik: server/test/fixtures/content (9 başlık, 5 kanal, şablonlar, 2 koleksiyon, ana sayfa düzeni).
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AccountRecord, GqlContext, Passport, ProfileRecord } from '../../src/kernel/context'
import type { IdentityService } from '../../src/kernel/services'
import type { EpgServiceImpl } from '../../src/services/epg/epg'
import { createTestApp } from '../helpers'

export const FIXTURE_CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'content')
/** 2026-11-13 Cuma 12:00 İstanbul */
export const TEST_NOW = new Date('2026-11-13T09:00:00.000Z')

export const ID = {
  sintel: 80010001,
  sintelTrailer: 81000001,
  bbb: 80010002,
  tears: 80010003,
  cosmos: 80010004,
  spring: 80010005,
  nosferatu: 80020001,
  metropolis: 80020002,
  caminandes: 80030001,
  cam_s1e1: 80030101,
  cam_s1e2: 80030102,
  cam_s2e1: 80030103,
  cam_s2e2: 80030104,
  anadolu: 80040001,
} as const

export const ACCOUNT: AccountRecord = { accountId: 'acc_test', planName: 'TV+ Temel', products: ['tvplus-temel'] }
export const ACCOUNT_SINEMA: AccountRecord = { ...ACCOUNT, products: ['tvplus-temel', 'sinema-paketi'] }

const profile = (guid: string, name: string, maturityLevel: number, isKids = false): ProfileRecord => ({
  guid,
  accountId: ACCOUNT.accountId,
  name,
  avatar: 'avatar-1.png',
  isKids,
  maturityLevel,
  language: 'tr',
})
export const ADULT = profile('PADULT00000000000001', 'Deniz', 110)
export const TEEN = profile('PTEEN000000000000002', 'Ece', 80)
export const KID = profile('PKIDS000000000000003', 'Can', 40, true)

export function passport(p: ProfileRecord | null, account: AccountRecord | null = ACCOUNT): Passport {
  return {
    membershipStatus: account ? 'CURRENT_MEMBER' : 'ANONYMOUS',
    account,
    profile: p,
    esn: 'TVPWCH-MC-TEST',
    deviceId: 'dev-test',
    authURLVerified: true,
  }
}

export const fakeIdentity: IdentityService = {
  getAccount: (id) => (id === ACCOUNT.accountId ? ACCOUNT : null),
  getProfile: (guid) => [ADULT, TEEN, KID].find((p) => p.guid === guid) ?? null,
  listProfiles: (id) => (id === ACCOUNT.accountId ? [ADULT, TEEN, KID] : []),
}

export function setClock(app: FastifyInstance, at: Date): void {
  ;(app.services.epg as EpgServiceImpl).setClock(() => at)
}

/** Örnek içerikle test uygulaması: sabit saat + sahte kimlik */
export async function createAlanApp(opts: { contentDir?: string; now?: Date } = {}): Promise<FastifyInstance> {
  const app = await createTestApp({ contentDir: opts.contentDir ?? FIXTURE_CONTENT_DIR })
  setClock(app, opts.now ?? TEST_NOW)
  app.services.identity = fakeIdentity
  return app
}

/** Çözümleyici bağlamı (sahte istek nesnesi; günlük susturulmuş) */
export function fakeRequest(): FastifyRequest {
  const noop = () => undefined
  return { log: { error: noop, warn: noop, info: noop, debug: noop } } as unknown as FastifyRequest
}

export function gqlContext(app: FastifyInstance, pp: Passport): GqlContext {
  return {
    req: fakeRequest(),
    passport: pp,
    trace: { traceId: 't', spanId: 's', parentSpanId: null },
    services: app.services,
    config: app.config,
    cache: new Map(),
  }
}
