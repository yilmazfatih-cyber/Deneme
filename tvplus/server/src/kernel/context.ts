/**
 * İstek bağlamı: iz (B3), pasaport (çerezden çözülen kimlik) ve servis kayıt defteri.
 * Fastify örneği ve isteği bu alanlarla genişletilir; her eklenti bunlara tipli erişir.
 */
import type { FastifyRequest } from 'fastify'
import type { FalcorKey, JsonGraphLeaf, MembershipStatus } from '../../../shared/types'
import type { AppConfig } from './config'
import type { Services } from './services'

export interface Trace {
  traceId: string
  spanId: string
  parentSpanId: string | null
}

export interface ProfileRecord {
  guid: string
  accountId: string
  name: string
  /** web/public/brand/ altındaki dosya adı */
  avatar: string
  isKids: boolean
  /** Bu profilin görebileceği en yüksek olgunluk seviyesi (bkz. shared/taxonomy MATURITY) */
  maturityLevel: number
  language: string
}
export interface AccountRecord {
  accountId: string
  planName: string
  /** Sahip olunan ürün anahtarları (shared/taxonomy PRODUCTS) */
  products: string[]
}

/** Çerez zincirinden çözülen kimlik (Netflix "Passport"). Anonim ziyaretçide account/profile null. */
export interface Passport {
  membershipStatus: MembershipStatus
  account: AccountRecord | null
  /** Etkin profil; profil kapısı geçilmediyse null */
  profile: ProfileRecord | null
  /** Cihaz seri numarası (x-tvplus-esn başlığı ya da çerezden türetilen) */
  esn: string
  /** tvpvdid çerezi */
  deviceId: string
  /** İstek geçerli bir authURL taşıyor mu (Falcor gövdesi / x-tvplus-authurl) */
  authURLVerified: boolean
}

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig
    services: Services
  }
  interface FastifyRequest {
    trace: Trace
    passport: Passport
  }
}

/** GraphQL çözümleyicilerinin bağlamı. */
export interface GqlContext {
  req: FastifyRequest
  passport: Passport
  trace: Trace
  services: Services
  config: AppConfig
  /** İstek ömürlü önbellek (çözümleyiciler arası paylaşım) */
  cache: Map<string, unknown>
}

/**
 * Çözümleyici haritası: { TipAdı: { alan: (parent, args, ctx) => değer } }.
 * Birlik/arayüz tipleri için { __resolveType }: motor bunu `fn(değer, {}, ctx)` olarak çağırır ve tip adını (dizge)
 * bekler; tanımlı değilse graphql-js `değer.__typename` alanına bakar.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ResolverFn = (parent: any, args: any, ctx: GqlContext) => unknown
export type ResolverMap = Record<string, Record<string, ResolverFn>>

/* ───────────── Falcor yönlendirici sözleşmesi ───────────── */

/** Yol kalıbı parçası: sabit anahtar ya da eşleştirici. */
export type FalcorMatcher = 'KEYS' | 'INTEGERS'
export type FalcorPattern = (string | FalcorMatcher)[]
/** Eşleşen yol: kalıptaki her parça için istenen anahtarlar (aralıklar tamsayı dizisine açılmış). */
export type FalcorMatch = FalcorKey[][]
export interface PathValue {
  path: FalcorKey[]
  /** Yaprak (atom/ref/error) ya da ilkel değer (motor atom'a sarar). undefined → boş atom. */
  value: JsonGraphLeaf | string | number | boolean | null | undefined | Record<string, unknown> | unknown[]
}
export interface FalcorRouteContext {
  req: FastifyRequest
  passport: Passport
  services: Services
  config: AppConfig
  /** Sorgu dizgesindeki yetenek bayrakları (webp, isTop10Supported, hasVideoMerchInBob, …) */
  flags: Record<string, string>
}
export interface FalcorRoute {
  /** ör. ['videos', 'INTEGERS', 'KEYS'] ya da ['lists', 'KEYS', 'INTEGERS'] */
  route: FalcorPattern
  get(ctx: FalcorRouteContext, match: FalcorMatch): PathValue[] | Promise<PathValue[]>
}
export const ref = (path: FalcorKey[]): JsonGraphLeaf => ({ $type: 'ref', value: path })
export const atom = <T>(value: T, expiresMs?: number): JsonGraphLeaf =>
  expiresMs ? { $type: 'atom', value, $expires: -Math.abs(expiresMs) } : { $type: 'atom', value }
export const falcorError = (message: string, code?: string): JsonGraphLeaf => ({
  $type: 'error',
  value: { message, code },
})
