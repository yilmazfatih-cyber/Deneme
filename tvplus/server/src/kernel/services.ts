/**
 * Servisler arası sözleşme. Her eklenti kendi servisini `app.services.<ad>` olarak kaydeder;
 * başka servise yalnızca bu arayüzlerden ve yalnızca İSTEK ANINDA erişilir (kayıt sırasında değil).
 * Bir servis kendi arayüzüne yöntem ekleyebilir; başkasının arayüzünü değiştirmez.
 */
import type {
  ContentChannel,
  ContentCollection,
  ContentEpgTemplate,
  ContentEpisode,
  ContentHomeLayout,
  ContentSource,
  ContentSupplemental,
  ContentTimedText,
  ContentTitle,
} from '../../../shared/content-schema'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { BootContext, EventBatch, OcaNodeState, PushEvent } from '../../../shared/types'
import type { AccountRecord, Passport, ProfileRecord } from './context'
import type { ArtworkTypeName } from './imageUrls'
import type {
  AudienceService,
  EmbeddingService,
  InsightsService,
  MicrogenreService,
  TaggingService,
  ViewingService,
} from './intelligence'

/* ───────────── Kimlik (sahibi: çekirdek API) ───────────── */
export interface IdentityService {
  getAccount(accountId: string): AccountRecord | null
  getProfile(guid: string): ProfileRecord | null
  listProfiles(accountId: string): ProfileRecord[]
  /**
   * İsteği yapan tarayıcıda (çerez zinciri; sanal cihaz adı dahil) verilen hesap adına oturum açar ve yeni açılış
   * bağlamını döndürür. TV'de kodla giriş onaylandığında TV'nin yoklama yanıtında çağrılır.
   */
  loginDevice(
    req: FastifyRequest,
    reply: FastifyReply,
    opts: { accountId: string; profileGuid?: string | null },
  ): Promise<BootContext>
  /** O cihazın (tvpvdid) mevcut oturumlarını geçersiz kılar (cihazı uzaktan çıkış yaptırma). */
  revokeDevice(deviceId: string): void
  /** Profil 4 haneli PIN ile kilitli mi (sunucu ekleri; sahte servislerde olmayabilir → false say) */
  isProfileLocked?(guid: string): boolean
}

/* ───────────── Olaylar (sahibi: çekirdek API) ───────────── */
export interface EventsService {
  /** Son `windowHours` saatteki oynatma başlangıç sayıları (Top 10 için). Anahtar: üst başlığın videoId'si değil, olaydaki videoId. */
  playCounts(windowHours: number): Map<number, number>
  /** Sunucu içinden olay kaydı (ör. manifest verildi). */
  ingest(
    batch: EventBatch,
    profileGuid: string | null,
  ): { accepted: number; dropped: number; rateLimitRemaining: number }
  stats(): { total: number; lastBatchAt: string | null; byName: Record<string, number> }
  /**
   * Kabul edilen her olay paketi için çağrılır (izleme verisi köprüsü). Dinleyici fırlatırsa yutulur.
   * Dönen işlev aboneliği kaldırır. (İzleme verisi ajanı ekler; sahte servislerde olmayabilir.)
   */
  subscribe?(listener: (batch: EventBatch, profileGuid: string | null) => void): () => void
}

/* ───────────── Bildirimler (sahibi: çekirdek API) ───────────── */
export interface NotificationsService {
  /** profileGuid null → tüm profillere */
  push(
    profileGuid: string | null,
    n: { kind: PushEvent['kind']; title: string; body: string; href: string | null },
  ): void
  list(profileGuid: string): PushEvent[]
  markRead(profileGuid: string, ids?: string[] | null): void
}

/* ───────────── Katalog (sahibi: alan servisleri) ───────────── */
export type VideoKind = 'MOVIE' | 'SHOW' | 'EPISODE' | 'SUPPLEMENTAL'
/** Oynatılabilir yaprak: film, bölüm ya da ek video. */
export interface PlayableVideo {
  videoId: number
  kind: Exclude<VideoKind, 'SHOW'>
  /** Oynatıcı başlığı, ör. "Sintel" ya da "Caminandes · S1 B2 · Gran Dillama" */
  displayTitle: string
  /** Üst başlığın (film/dizi) kimliği; film için kendisi */
  titleId: number
  runtimeSec: number | null
  sources: ContentSource[]
  /** Önizleme kaynağı (yalnız üst başlıkta tanımlıysa) */
  promo: { source: ContentSource; offsetSec: number } | null
  license: { name: string; attribution: string; url?: string }
  maturityLevel: number
  kids: boolean
  requiredProduct: string | null
}
export interface ArtworkSource {
  /**
   * Kaynak görsel adresi (uzak) ya da yerel dosya; ikisi de yoksa kapak üretilir.
   * `localFile` web/public klasörüne görelidir, ör. 'brand/channels/trt-haber.png'.
   */
  sourceUrl: string | null
  localFile: string | null
  /** Üretilen kapakta yazılacak metin ve renk tohumu */
  title: string
  subtitle: string | null
  seed: string
  focal: string
  /** Yatay kaynaktan dikey afiş (BOXART) üretim biçimi; verilmezse 'contain' (bkz. content-schema zArtwork.posterFit) */
  posterFit?: 'crop' | 'contain'
}
/** Herhangi bir videoId'nin katalogdaki yeri (alan servisleri ekledi). */
export interface VideoInfo {
  videoId: number
  kind: VideoKind
  /** Üst başlık (film/dizi); film ve dizi için kendisi */
  title: ContentTitle
  /** Bölümse: içerik, sezon numarası ve dizideki sırası (0'dan) */
  episode: { data: ContentEpisode; seasonNumber: number; index: number } | null
  supplemental: ContentSupplemental | null
}
export interface PersonRecord {
  personId: number
  name: string
  videoIds: number[]
}
/** content/interstitials.json kaydı */
export interface InterstitialRecord {
  id: string
  location: 'HOME' | 'LIVE'
  title: string
  body: string
  cta: string
  href: string
}
export interface CatalogService {
  /** Üst başlıklar (film/dizi), içerik dosyalarındaki haliyle */
  allTitles(): ContentTitle[]
  /** videoId → tür + üst başlık + bölüm/ek video bilgisi; bilinmiyorsa null */
  videoInfo(videoId: number): VideoInfo | null
  /** Dizinin bölüm kimlikleri, yayın sırasıyla (film için boş) */
  episodeIds(titleId: number): number[]
  getCollection(collectionId: number): ContentCollection | null
  /** Bu başlığı içeren koleksiyonlar */
  collectionsOf(titleId: number): ContentCollection[]
  getPerson(personId: number): PersonRecord | null
  /** content/home-layout.json (yoksa null) */
  homeLayout(): ContentHomeLayout | null
  epgTemplates(): ContentEpgTemplate[]
  interstitials(): InterstitialRecord[]
  getTitle(titleId: number): ContentTitle | null
  /** Herhangi bir videoId'nin (film/dizi/bölüm/ek video) bağlı olduğu üst başlık */
  titleOf(videoId: number): ContentTitle | null
  allCollections(): ContentCollection[]
  /** Kişi dizini: personId = stableId(norm(ad)); `videoIds` üst başlık (film/dizi) kimlikleridir */
  people(): { personId: number; name: string; videoIds: number[] }[]
  /** Olgunluk seviyesi / çocuk profili süzgeci: bu profil bu başlığı görebilir mi */
  isVisibleTo(profile: ProfileRecord | null, titleId: number): boolean
  getPlayable(videoId: number): PlayableVideo | null
  /** Bir üst başlığın (film/dizi) tüm oynatılabilir yaprakları, sırayla */
  listPlayables(titleId: number): PlayableVideo[]
  getChannel(channelId: number): ContentChannel | null
  listChannels(): ContentChannel[]
  /** Görsel servisi için: varlık + tip → kaynak. Varlık yoksa null. */
  getArtworkSource(entityId: string, type: ArtworkTypeName): ArtworkSource | null
  /** content/subtitles klasörünün mutlak yolu */
  subtitlesDir(): string
  stats(): { titles: number; playables: number; channels: number; bySourceKind: Record<string, number> }
}

/* ───────────── Yetki (sahibi: alan servisleri) ───────────── */
export interface AccessDecision {
  state: 'PLAYABLE' | 'UPSELL' | 'DEVICE_RESTRICTED' | 'OUT_OF_WINDOW' | 'BLOCKED'
  reasonText: string | null
  requiredProduct: string | null
  requiredProductName: string | null
  cta: string | null
}
export interface EntitlementService {
  accessForVideo(passport: Passport, videoId: number): AccessDecision
  accessForChannel(passport: Passport, channelId: number): AccessDecision
}

/* ───────────── Yayın akışı (sahibi: alan servisleri) ───────────── */
export interface AiringRecord {
  airingId: string
  channelId: number
  title: string
  synopsis: string
  kind: string
  startAt: Date
  endAt: Date
  videoId: number | null
  isSample: boolean
}
export interface EpgService {
  getAiring(airingId: string): AiringRecord | null
  currentAiring(channelId: number, at?: Date): AiringRecord | null
  airings(channelId: number, from: Date, to: Date): AiringRecord[]
  /** LINEAR kanal: şu an yayındaki katalog videosu ve içindeki konum. Diğer kanal türlerinde null. */
  linearPosition(channelId: number, at?: Date): { airing: AiringRecord; videoId: number; offsetSec: number } | null
  /** Alan servislerinin ortak saati (testlerde sabitlenebilir). Canlı durumu, vitrin dönüşü, rozetler buna göre hesaplanır. */
  now(): Date
  /** Kanal katalog videolarından döngüyle kurulan doğrusal kanal mı (source.type 'LINEAR') */
  isLinear(channelId: number): boolean
}

/* ───────────── İlerleme / üye durumu (sahibi: alan servisleri) ───────────── */
export interface BookmarkRecord {
  positionSec: number
  runtimeSec: number | null
  lastModified: string
}
export interface ProgressService {
  getBookmark(profileGuid: string, videoId: number): BookmarkRecord | null
  setBookmark(profileGuid: string, videoId: number, positionSec: number, durationSec?: number | null): BookmarkRecord
  /** İçerikte süresi olmayan (YouTube) videolar için oynatıcının bildirdiği süre */
  learnedRuntime(videoId: number): number | null
  recentSearches(profileGuid: string): string[]
  recordSearch(profileGuid: string, term: string): void
  /* Alan servislerinin eklediği üye durumu yöntemleri */
  clearRecentSearches(profileGuid: string): void
  /** Film/bölüm/ek video için yer imine göre; dizi için bölümlerinden türetilir */
  watchStatus(profileGuid: string, videoId: number): WatchStatusValue
  /** Dizide devam edilecek bölüm (son izlenenin ardından ya da yarım kalan; yoksa S1 B1). Dizi değilse null. */
  currentEpisode(profileGuid: string, showId: number): number | null
  /** İzlemeye devam: yarım kalanlar, son değişen önce, dizi başına tek kayıt (titleId + oynatılacak yaprak videoId) */
  continueWatching(profileGuid: string): { titleId: number; videoId: number }[]
  /** Yer imi olan üst başlıklar, en son izlenen önce */
  recentTitles(profileGuid: string): number[]
  /** Listem (üst başlık kimlikleri, en yeni önce) */
  myList(profileGuid: string): number[]
  isInMyList(profileGuid: string, videoId: number): boolean
  addToMyList(profileGuid: string, videoId: number): void
  removeFromMyList(profileGuid: string, videoId: number): void
  thumbRating(profileGuid: string, videoId: number): ThumbRatingValue
  setThumbRating(profileGuid: string, videoId: number, rating: ThumbRatingValue): void
  /** Beğenilen (THUMBS_UP/WAY_UP) üst başlıklar, en yeni önce */
  liked(profileGuid: string): number[]
  /** Beğenilmeyen üst başlıklar */
  disliked(profileGuid: string): number[]
  lastChannel(profileGuid: string): number | null
  setLastChannel(profileGuid: string, channelId: number): void
  /** "Kanallarım": ilk değişikliğe kadar içerikteki favorite:true kanallar */
  favoriteChannels(profileGuid: string): number[]
  /** Yeni durumu döner (true → artık favori) */
  toggleFavoriteChannel(profileGuid: string, channelId: number): boolean
  dismissedInterstitials(profileGuid: string): string[]
  dismissInterstitial(profileGuid: string, id: string): void
  /* Yayın hatırlatmaları (sunucu ekleri) */
  /** Profilin hatırlatma kurduğu yayın kimlikleri (kurulma sırasıyla; bildirilmiş olanlar dahil) */
  reminders(profileGuid: string): string[]
  hasReminder(profileGuid: string, airingId: string): boolean
  setReminder(profileGuid: string, airingId: string, enabled: boolean): void
  /** Tüm profillerde henüz bildirilmemiş hatırlatmalar (zamanlayıcı için) */
  pendingReminders(): { profileGuid: string; airingId: string }[]
  markReminderFired(profileGuid: string, airingId: string): void
  /** Profil silinince o profilin üye durumunu bırakır */
  forgetProfile?(profileGuid: string): void
}
export type WatchStatusValue = 'NEVER_WATCHED' | 'STARTED' | 'WATCHED'
export type ThumbRatingValue = 'THUMBS_UNRATED' | 'THUMBS_DOWN' | 'THUMBS_UP' | 'THUMBS_WAY_UP'

/* ───────────── Oynatma (sahibi: oynatma düzlemi) ───────────── */
export interface StreamInfo {
  maxHeight: number
  has51: boolean
  textLanguages: string[]
  audioLanguages: string[]
  durationSec: number | null
}
export interface PlaybackService {
  /** Akış bilgisi önbellekteyse döner (rozetler için); yoksa null. Asla fırlatmaz, ağa çıkmaz. */
  cachedStreamInfo(videoId: number): StreamInfo | null
  stats(): { activeSessions: number; manifestsIssued: number; prefetchIssued: number }
}

/* ───────────── OCA düğümleri (sahibi: oynatma düzlemi) ───────────── */
export interface OcaService {
  nodes(): OcaNodeState[]
}

/** Altyazı kaynağı çözümü (oynatma düzlemi içi; tür paylaşımı için burada). */
export type TimedTextSource = ContentTimedText

export interface Services {
  identity: IdentityService
  events: EventsService
  notifications: NotificationsService
  catalog: CatalogService
  entitlement: EntitlementService
  epg: EpgService
  progress: ProgressService
  playback: PlaybackService
  oca: OcaService
  /* İçerik zekâsı (sözleşme: ./intelligence.ts) */
  tagging: TaggingService
  microgenres: MicrogenreService
  viewing: ViewingService
  audience: AudienceService
  insights: InsightsService
  embeddings: EmbeddingService
}
