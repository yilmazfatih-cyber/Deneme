/**
 * İçerik zekâsı servislerinin sözleşmesi (bkz. docs/ICERIK_ZEKASI.md, shared/intelligence.ts).
 * Kural diğer servislerle aynı: bir servise yalnız bu arayüzlerden ve yalnız İSTEK ANINDA erişilir.
 * Her servisin `revision()` sayacı, verisi değiştikçe artar; ona dayanan servisler önbelleklerini bununla tazeler.
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import type { FastifyRequest } from 'fastify'
import type {
  CatalogMix,
  ClusteringRun,
  DataSourceStatus,
  EffectiveTags,
  EmbeddingInfo,
  Microgenre,
  MicrogenreStats,
  NeighborTitle,
  PlanInput,
  PlanResult,
  PredictionExplanation,
  PredictionModelInfo,
  TasteCommunity,
  Timeline,
  TitleTotals,
  ViewingEvent,
  ViewingFact,
  ViewingSource,
} from '../../../shared/intelligence'
import type { TagSheet, TagVocabulary } from '../../../shared/tagging-schema'
import { ApiHttpError } from '../gateway/errors'
import type { AppConfig } from './config'

declare module 'fastify' {
  interface FastifyRequest {
    /** İstek `x-tvplus-studio-key` ile yetkilendirildi (oturumsuz betik/zamanlanmış iş) */
    studioKeyAuth: boolean
  }
}

/* ───────────── Etiketleme ───────────── */
export interface TaggingService {
  vocabulary(): TagVocabulary
  /** Geçerli etiketler: onaylı insan fişlerinin uzlaşısı → depodaki örnek fiş → künyeden model önerisi → boş */
  effective(titleId: number): EffectiveTags
  /** Başlığın tüm fişleri (insan, örnek, model önerisi) */
  sheets(titleId: number): TagSheet[]
  revision(): number
}

/* ───────────── Mikro türler ───────────── */
export interface MicrogenreService {
  all(): Microgenre[]
  get(id: string): Microgenre | null
  /** Başlığın girdiği mikro türler, en dar olan önce */
  ofTitle(titleId: number): Microgenre[]
  /**
   * Görünmeyen katman benzerliği: ortak mikro türlere göre (nadir olan daha ağır sayılır).
   * `shared` ortak mikro tür kimlikleridir (en ağır önce) — "Çünkü … izledin" gerekçesi için.
   */
  similarTitles(titleId: number, limit: number): { titleId: number; score: number; shared: string[] }[]
  stats(): MicrogenreStats
  revision(): number
}

/* ───────────── İzleme verisi ───────────── */
export interface ViewingQuery {
  /** epoch ms, dahil */
  from?: number
  /** epoch ms, hariç */
  to?: number
  /** Verilmezse `activeSources()` */
  sources?: ViewingSource[]
}
export interface ViewingService {
  /** Olayları ekler; kimliği (id) daha önce görülmüş olanları atlar. */
  append(events: ViewingEvent[]): { accepted: number; duplicates: number; rejected: number }
  /** İzleyici × başlık özetleri (yalnız katalogla eşleşmiş başlıklar) */
  facts(q?: Pick<ViewingQuery, 'sources'>): ViewingFact[]
  factsOfViewer(viewerId: string): ViewingFact[]
  titleTotals(q?: ViewingQuery): Map<number, TitleTotals>
  /** Ay ('YYYY-MM', İstanbul saatine göre) → başlık → izlenen saat */
  monthlyTitleHours(q?: ViewingQuery): Map<string, Map<number, number>>
  /** İzleyicinin en çok kullandığı cihaz ve ülke (bilinmiyorsa null) */
  viewerTraits(viewerId: string): { device: ViewingEvent['device'] | null; country: string | null }
  /** Uygulama profilinin takma izleyici kimliği (kaynak TVPLUS) */
  viewerIdOfProfile(profileGuid: string): string
  sources(): DataSourceStatus[]
  /**
   * Analizde kullanılan kaynaklar. Gerçek veri (MIXPANEL + TVPLUS) `config.realDataMinViewers` izleyiciye ulaşınca
   * SYNTHETIC dışarıda kalır; o eşiğin altında sentetik örnek gerçek kaynaklarla BİRLİKTE etkindir.
   */
  activeSources(): ViewingSource[]
  clear(source: ViewingSource): void
  revision(): number
}

/* ───────────── Zevk toplulukları ───────────── */
export interface AudienceService {
  run(): ClusteringRun | null
  communities(): TasteCommunity[]
  get(id: string): TasteCommunity | null
  ofViewer(viewerId: string): { communityId: string; similarity: number } | null
  /** Uygulama profilinin en yakın topluluğu (kendi izleme geçmişinden); geçmişi yoksa null */
  ofProfile(profileGuid: string): { communityId: string; similarity: number } | null
  /** Toplulukta genele göre öne çıkan başlıklar */
  topTitles(communityId: string, limit: number): { titleId: number; lift: number; reach: number }[]
  recompute(opts?: { k?: number; seed?: number }): ClusteringRun
}

/* ───────────── İçgörüler ve planlayıcı ───────────── */
export interface InsightsService {
  mix(opts?: { scope?: 'ALL' | 'MOVIE' | 'SHOW'; from?: number; to?: number }): CatalogMix
  timeline(opts: { dimension: Timeline['dimension']; months: number }): Timeline
  plan(input: PlanInput): PlanResult
}

/* ───────────── Gömme ───────────── */
export interface EmbeddingService {
  info(): EmbeddingInfo
  /** Vektörler hazır mı (ilk kurulum arka planda sürerken false) */
  ready(): boolean
  titleVector(titleId: number): Float32Array | null
  similarTitles(titleId: number, limit: number): NeighborTitle[]
  revision(): number
}

/* ───────────── Tahmin modeli ───────────── */
export interface PredictionService {
  /** Eğitilmiş bir model yüklü mü */
  ready(): boolean
  info(): PredictionModelInfo
  /** Profil için eşleşme yüzdesi (0–100); model hazır değilse ya da profil hakkında hiçbir işaret yoksa null */
  match(profileGuid: string, titleId: number): number | null
  /** Sıralama için ham puanlar (büyük daha iyi); puanlanamayan başlık haritada yer almaz */
  scores(profileGuid: string, titleIds: number[]): Map<number, number>
  /** Profil için en yüksek tahminli başlıklar; model hazır değilse [] */
  topPicks(
    profileGuid: string,
    limit: number,
    opts?: { type?: 'MOVIE' | 'SHOW'; excludeWatched?: boolean },
  ): { titleId: number; score: number; match: number }[]
  explain(profileGuid: string, titleId: number): PredictionExplanation | null
  revision(): number
}

/* ───────────── Erişim ───────────── */

/** Sabit süreli dize karşılaştırması (anahtar denetimi). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

/**
 * Stüdyo yazma uçlarının başında çağrılır: anahtarla gelen istek geçer; oturumla gelen istek authURL (CSRF) taşımalıdır.
 * (Okuma uçlarının erişimi app.ts'teki kancada denetlenir.)
 */
export function assertStudioWrite(req: FastifyRequest, config: AppConfig): void {
  if (config.studioAccess === 'open' || req.studioKeyAuth) return
  if (!req.passport?.authURLVerified) throw new ApiHttpError(403, 'CSRF', 'Bu işlem için geçerli bir authURL gerekir.')
}
