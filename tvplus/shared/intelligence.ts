/**
 * İçerik zekâsı katmanının tel sözleşmesi — bkz. docs/ICERIK_ZEKASI.md.
 *
 * Zincir:  etiket fişleri → mikro türler → (izleme verisi: uygulama + Mixpanel) → zevk toplulukları
 *          → içgörüler ve planlayıcı ;  çekim çözümlemesi + etiketler → gömme vektörleri → benzerlik.
 *
 * Tüm uçlar /api/studio altındadır ve arka ofis içindir (izleyiciye açık değildir):
 *   erişim  — üye oturumu (geliştirme) ya da `x-tvplus-studio-key` başlığı (betikler, zamanlanmış işler)
 *   yazma   — oturumla geliyorsa authURL (CSRF) ister; anahtarla geliyorsa istemez
 *   hata    — standart ApiError gövdesi
 *
 * Kişisel veri: izleyici kimlikleri sunucuya girerken tek yönlü takma kimliğe çevrilir (bkz. ViewingEvent.viewerId);
 * ham Mixpanel satırı, e-posta, ad, IP hiçbir yerde saklanmaz ve günlüğe yazılmaz.
 */
import type { MicrogenreSlot, TagSheet, TagSheetSource, TagVocabulary } from './tagging-schema'

/* ═════════════ Etiketleme ═════════════
 * GET    /api/studio/tagging/vocabulary                          → TagVocabulary
 * GET    /api/studio/tagging/queue                               → TaggingQueueItem[]   (etiketsizler ve yalnız örnek fişi olanlar önce)
 * GET    /api/studio/tagging/titles/:titleId                     → TitleTagging
 * PUT    /api/studio/tagging/titles/:titleId/sheets/:tagger      gövde: TagSheetInput → TagSheet   (source: 'TAGGER')
 * POST   /api/studio/tagging/titles/:titleId/sheets/:tagger/approve                    → TagSheet   (status: 'APPROVED')
 * DELETE /api/studio/tagging/titles/:titleId/sheets/:tagger                            → 204
 */

/** Bir başlığın o an geçerli etiketleri (mikro tür ve gömme bunu kullanır). */
export interface EffectiveTags {
  titleId: number
  rubricVersion: string
  /**
   * Neye dayanıyor: CONSENSUS onaylı insan fişlerinin uzlaşısı · SAMPLE depodaki örnek fiş ·
   * MODEL künyeden otomatik öneri · NONE hiçbiri (boş)
   */
  basis: 'CONSENSUS' | 'SAMPLE' | 'MODEL' | 'NONE'
  /** Uzlaşıya giren onaylı insan fişi sayısı */
  sheetCount: number
  /** 0–1 etiketleyiciler arası uyum (tek fişte null) */
  agreement: number | null
  /** Ölçek anahtarı → 0–5 (uzlaşı: ortanca; değerlendirilmemiş ölçek yer almaz) */
  scales: Record<string, number>
  /** Yüz anahtarı → değer anahtarları (uzlaşı: fişlerin yarıdan fazlasında geçenler) */
  facets: Record<string, string[]>
  /** Ölçeklerden türeyen niteleyici anahtarları (zScaleDescriptor.key) */
  descriptors: string[]
}

export interface TagSheetInput {
  watched: boolean
  scales: Record<string, number | null>
  facets: Record<string, string[]>
  notes?: string
  /** 'SUBMITTED' gönderildi (onay bekler) · 'DRAFT' taslak */
  status?: 'DRAFT' | 'SUBMITTED'
}

export interface TaggingQueueItem {
  titleId: number
  title: string
  type: 'MOVIE' | 'SHOW'
  basis: EffectiveTags['basis']
  humanSheets: number
  /** Gönderilmiş ama onaylanmamış fiş var mı */
  pendingReview: boolean
}

export interface TitleTagging {
  titleId: number
  title: string
  effective: EffectiveTags
  /** Tüm fişler: insan fişleri, örnek fiş, model önerisi (kaynağı `source` alanında) */
  sheets: TagSheet[]
  /** Fişin önerdiği RTÜK işareti başlıktakinden yüksekse uyarı metinleri */
  advisoryWarnings: string[]
}

export type { TagSheet, TagSheetSource, TagVocabulary }

/* ═════════════ Mikro türler ═════════════
 * GET /api/studio/microgenres?core=&slot=&q=&layer=&minSize=&first=&offset=  → MicrogenreList
 * GET /api/studio/microgenres/:id                                            → Microgenre
 * GET /api/studio/microgenres/by-title/:titleId                              → Microgenre[]
 */

export interface MicrogenreDefinition {
  /** Çekirdek tür: shared/taxonomy GENRES anahtarı */
  core: string
  /** Yalnız film / yalnız dizi; null → ikisi birden */
  type: 'MOVIE' | 'SHOW' | null
  /** Daraltan yuvalar (sözlükteki `naming.order` sırasıyla) */
  slots: { slot: MicrogenreSlot; key: string }[]
}

export interface Microgenre {
  /** Tanımın kararlı özeti, ör. 'mg_3fa92c1b' — aynı tanım her üretimde aynı kimliği alır */
  id: string
  /** Türkçe ad, ör. "Uzay Keşfi Hakkında Düşündürücü Belgeseller" */
  name: string
  definition: MicrogenreDefinition
  titleIds: number[]
  size: number
  /** Yuva sayısı: 0 = çıplak tür, büyüdükçe daralır */
  specificity: number
  /**
   * VISIBLE görünen katman — ana sayfada satır olabilecek kadar geniş ve okunur ·
   * HIDDEN görünmeyen katman — yalnız benzerlik ve "Çünkü … izledin" için
   */
  layer: 'VISIBLE' | 'HIDDEN'
}

export interface MicrogenreStats {
  rubricVersion: string
  generatedAt: string
  total: number
  visible: number
  hidden: number
  bySpecificity: Record<string, number>
  /** En az bir mikro türe giren başlık sayısı */
  coveredTitles: number
  /** Sözlüğün tanımlayabildiği kuramsal birleşim sayısı (dolu olsun olmasın) */
  possibleDefinitions: number
}

export interface MicrogenreList {
  stats: MicrogenreStats
  total: number
  items: Microgenre[]
}

/* ═════════════ İzleme verisi ve kaynaklar ═════════════
 * GET    /api/studio/sources                         → SourcesResponse
 * POST   /api/studio/sources/mixpanel/import         gövde: Mixpanel ham dışa aktarımı (JSONL; gzip olabilir) → ImportReport
 * POST   /api/studio/sources/mixpanel/pull           gövde: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } → ImportReport
 *                                                    (kimlik bilgileri yalnız sunucu ortam değişkenlerinden okunur)
 * GET    /api/studio/sources/mixpanel/mapping        → eşleme dosyası (shared/mixpanel-mapping.ts)
 * PUT    /api/studio/sources/mixpanel/mapping        → eşleme (sunucu deposunda; depodaki dosyanın önüne geçer)
 * POST   /api/studio/sources/synthetic/generate      gövde: { viewers?, days?, seed? } → ImportReport
 * DELETE /api/studio/sources/:source                 → 204   (o kaynağın tüm olaylarını siler)
 */

export type ViewingSource = 'TVPLUS' | 'MIXPANEL' | 'SYNTHETIC'

export const VIEWING_EVENT_TYPES = [
  'IMPRESSION',
  'CLICK',
  'PLAY_START',
  'PLAY_PROGRESS',
  'PLAY_END',
  'ADD_TO_LIST',
  'REMOVE_FROM_LIST',
  'RATING',
  'SEARCH',
] as const
export type ViewingEventType = (typeof VIEWING_EVENT_TYPES)[number]

export type ViewingDevice = 'TV' | 'MOBILE' | 'WEB' | 'OTHER'

/** Kaynaktan bağımsız, sadeleştirilmiş izleme olayı. Her kaynak (uygulama, Mixpanel, sentetik) buna çevrilir. */
export interface ViewingEvent {
  /** Yinelenmeyi önleyen anahtar (Mixpanel `$insert_id`; yoksa satırın özeti) */
  id: string
  source: ViewingSource
  type: ViewingEventType
  /** epoch ms (UTC) */
  ts: number
  /** Takma kimlik: 'v_' + HMAC(sunucu anahtarı, kaynak kimliği). Geri çevrilemez. */
  viewerId: string
  /** Üst başlık (film/dizi); katalogda eşleşmediyse null */
  titleId: number | null
  /** Oynatılan yaprak (film/bölüm); bilinmiyorsa null */
  videoId: number | null
  /** Bu olayın eklediği izleme süresi (sn) — PLAY_PROGRESS / PLAY_END */
  watchedSec?: number
  positionSec?: number
  durationSec?: number
  completed?: boolean
  /** −1 beğenmedi · 1 beğendi · 2 çok beğendi */
  rating?: -1 | 1 | 2
  device?: ViewingDevice
  /** ISO 3166-1 alpha-2 */
  country?: string
  /** SEARCH olaylarında sorgu metni (en çok 80 karakter) */
  query?: string
}

/** İzleyici × başlık özeti (kümeleme ve içgörülerin girdisi). */
export interface ViewingFact {
  viewerId: string
  titleId: number
  source: ViewingSource
  plays: number
  watchedSec: number
  completions: number
  firstTs: number
  lastTs: number
  inList: boolean
  rating: -1 | 1 | 2 | null
  /** 0–1 ilgi puanı: izlenen oran + tamamlamaya, listeye ve beğeniye ek pay */
  engagement: number
}

export interface TitleTotals {
  titleId: number
  viewers: number
  plays: number
  hours: number
  completions: number
}

export interface ImportReport {
  source: ViewingSource
  startedAt: string
  finishedAt: string
  /** Okunan satır / olay */
  lines: number
  accepted: number
  duplicates: number
  /** Biçimi bozuk ya da zorunlu alanı eksik */
  rejected: number
  /** Eşlemede karşılığı olmayan Mixpanel olay adları → adet */
  unmappedEvents: Record<string, number>
  /** Katalogda bulunamayan içerik kimlikleri (en sık 50) */
  unknownTitles: { externalId: string; count: number }[]
  from: string | null
  to: string | null
}

export interface DataSourceStatus {
  source: ViewingSource
  events: number
  viewers: number
  titles: number
  firstTs: number | null
  lastTs: number | null
  /** Analizlerde kullanılıyor mu (gerçek veri varken SYNTHETIC dışarıda kalır) */
  active: boolean
  lastImport: ImportReport | null
}

export interface SourcesResponse {
  sources: DataSourceStatus[]
  mixpanel: {
    /** Sunucuda servis hesabı tanımlı mı (değerler asla dönmez) */
    configured: boolean
    region: 'us' | 'eu' | 'in'
    /** Eşlemede tanımlı olay adları */
    mappedEvents: string[]
  }
}

/* ═════════════ Zevk toplulukları ═════════════
 * GET  /api/studio/communities                → CommunitiesResponse
 * GET  /api/studio/communities/:id            → TasteCommunity
 * POST /api/studio/communities/recompute      gövde: { k?: number; seed?: number } → ClusteringRun
 */

export interface CommunityFeature {
  kind: 'GENRE' | 'MICROGENRE' | 'DESCRIPTOR' | 'FACET'
  key: string
  name: string
  /** Topluluktaki ağırlığın genel ortalamaya oranı (>1 → bu topluluğu ayıran özellik) */
  lift: number
}

export interface TasteCommunity {
  /** 'tc_01' … ; aynı veri ve tohumla aynı kalır */
  id: string
  /** Ayırt edici özelliklerden kurulan ad, ör. "Bilim ve Uzay Belgeselleri · Düşündürücü" */
  name: string
  size: number
  /** İzleyicilerdeki payı (0–1) */
  share: number
  /** Toplam izleme saatindeki payı (0–1) */
  hoursShare: number
  topFeatures: CommunityFeature[]
  topTitles: { titleId: number; lift: number; reach: number }[]
  devices: Partial<Record<ViewingDevice, number>>
  countries: Record<string, number>
  /** 0–1 küme sıkılığı (üyelerin merkeze ortalama benzerliği) */
  cohesion: number
}

export interface ClusteringRun {
  runId: string
  computedAt: string
  viewers: number
  k: number
  iterations: number
  seed: number
  featureCount: number
  /** −1…1 ortalama siluet (örneklemle); hesaplanamadıysa null */
  silhouette: number | null
  sources: ViewingSource[]
}

export interface CommunitiesResponse {
  run: ClusteringRun | null
  items: TasteCommunity[]
}

/* ═════════════ İçgörüler ve planlayıcı ═════════════
 * GET  /api/studio/overview                                   → StudioOverview
 * GET  /api/studio/insights/mix?type=MOVIE|SHOW&from=&to=     → CatalogMix     (from/to: 'YYYY-MM-DD', izleme penceresi)
 * GET  /api/studio/insights/timeline?dimension=genre|acquisition|origin&months=12 → Timeline
 * POST /api/studio/plan                                       gövde: PlanInput → PlanResult
 */

/** Bir kırılımın satırı. Bir yapım birden çok tür etiketi taşıdığından tür payları üst üste biner (toplam > 1). */
export interface MixRow {
  key: string
  name: string
  titles: number
  /** Katalogdaki pay (başlık sayısına göre) */
  catalogShare: number
  hours: number
  /** İzlenme saatindeki pay */
  viewShare: number
  /** viewShare / catalogShare — 1'in üstü: talep arzın önünde; veri yoksa null */
  efficiency: number | null
}

export type Acquisition = 'ORIGINAL' | 'LICENSED' | 'OPEN' | 'EMBED'

export interface CatalogMix {
  scope: 'ALL' | 'MOVIE' | 'SHOW'
  window: { from: string | null; to: string | null }
  sources: ViewingSource[]
  totalTitles: number
  totalHours: number
  byGenre: MixRow[]
  byType: MixRow[]
  /** Yapım ülkesi (ilk sıradaki ana ülke); bilinmeyenler 'ZZ' */
  byCountry: MixRow[]
  byLanguage: MixRow[]
  /** ORIGINAL kendi yapımı · LICENSED lisanslı kütüphane · OPEN açık lisans/kamu malı · EMBED üçüncü taraf gömme */
  byAcquisition: MixRow[]
  byMaturity: MixRow[]
  /** Yerli (TR) içeriğin katalog ve izlenme payı */
  local: { catalogShare: number; viewShare: number }
}

export interface Timeline {
  dimension: 'genre' | 'acquisition' | 'origin'
  /** 'YYYY-MM' sıralı */
  months: string[]
  series: {
    key: string
    name: string
    /** O ayın sonundaki katalog payı (eklenme tarihine göre birikimli) */
    catalogShare: number[]
    /** O aydaki izlenme payı */
    viewShare: number[]
  }[]
}

export interface PlanInput {
  /** Eklenecek başlık sayısı */
  slots: number
  scope?: 'ALL' | 'MOVIE' | 'SHOW'
  /** Verinin ağırlığı (0–1); kalanı editör yargısına aittir. Varsayılan 0.7. */
  dataWeight?: number
  /** Editör yargısı: tür anahtarı → −1 (azalt) … +1 (artır) */
  judgment?: Record<string, number>
  /** Tür başına ortalama başlık maliyeti (birim serbest); verilirse saat/maliyet verimi hesaba girer */
  costPerTitle?: Record<string, number>
  budget?: number
}

export interface PlanRow {
  key: string
  name: string
  catalogShare: number
  viewShare: number
  efficiency: number | null
  /** 0–1: izlenme payı, verim ve son dönem eğiliminden */
  demandScore: number
  /** 0–1: editör yargısının ölçeklenmiş hâli (0.5 = yansız) */
  judgmentScore: number
  /** İzlenen saat / maliyet birimi; maliyet verilmediyse null */
  costEfficiency: number | null
  targetShare: number
  slots: number
  /** Kararın okunur gerekçeleri (Türkçe, kısa) */
  reasons: string[]
}

export interface PlanResult {
  generatedAt: string
  input: Required<Pick<PlanInput, 'slots' | 'scope' | 'dataWeight'>> & PlanInput
  rows: PlanRow[]
  /** Talebi yüksek ama başlığı az mikro türler */
  gaps: { microgenreId: string; name: string; size: number; demandLift: number }[]
  /** İzlenme payı, kendilerine uygun katalog payından belirgin büyük topluluklar */
  underserved: { communityId: string; name: string; demandShare: number; supplyShare: number }[]
  /** Planlayıcı karar vermez; öneri üretir. Bu not çıktıyla birlikte taşınır. */
  note: string
}

/* ═════════════ Gömme (çekim düzeyi) ═════════════
 * GET  /api/studio/embeddings                                        → EmbeddingInfo
 * GET  /api/studio/embeddings/titles/:titleId/neighbors?first=12     → NeighborTitle[]
 * GET  /api/studio/embeddings/videos/:videoId/shots                  → ShotSummary[]
 * GET  /api/studio/embeddings/videos/:videoId/shots/:index/neighbors → NeighborShot[]
 * GET  /api/studio/embeddings/projection                             → ProjectionPoint[]   (başlık vektörlerinin 2B izdüşümü)
 * POST /api/studio/embeddings/rebuild                                → EmbeddingInfo
 */

export type EmbeddingModality = 'VISUAL' | 'AUDIO' | 'TEXT' | 'CONTEXT'

export interface EmbeddingInfo {
  /** 'taban' yerleşik temel sağlayıcı · 'http' dış model sunucusu · 'dosya' çevrimdışı üretilmiş vektörler */
  provider: string
  modelVersion: string
  dims: number
  titles: number
  shots: number
  modalities: EmbeddingModality[]
  builtAt: string | null
  /** Çekim sınırı gerçekten çözümlenmiş (sahne algılama) yaprak sayısı; kalanlar birkaç anahtar kareyle temsil edilir */
  sceneDetected: number
}

export interface ShotSummary {
  videoId: number
  index: number
  startSec: number
  endSec: number
  /** Çekim sırasında söylenenler (altyazıdan); yoksa boş */
  text: string
  hasAudio: boolean
  keyframeUrl: string | null
}

export interface NeighborTitle {
  titleId: number
  /** Kosinüs benzerliği (−1…1) */
  score: number
}

export interface NeighborShot {
  videoId: number
  titleId: number
  index: number
  startSec: number
  endSec: number
  score: number
  keyframeUrl: string | null
}

export interface ProjectionPoint {
  titleId: number
  x: number
  y: number
}

/* ═════════════ Genel bakış ═════════════ */

export interface StudioOverview {
  catalog: { titles: number; movies: number; shows: number }
  tagging: {
    rubricVersion: string
    consensus: number
    sampleOnly: number
    modelOnly: number
    untagged: number
    humanSheets: number
  }
  microgenres: MicrogenreStats | null
  sources: DataSourceStatus[]
  audience: ClusteringRun | null
  embeddings: EmbeddingInfo | null
}
