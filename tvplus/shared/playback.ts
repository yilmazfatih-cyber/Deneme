/**
 * Oynatma düzleminin tel sözleşmesi: FTL yoklaması → MSL anahtar sağlama (ALE) → lisanslı manifest →
 * imzalı bayt-aralığı adresleri → TTML altyazı. Sunucu (server/src/services/playback, oca, ftl) ve
 * istemci (web/src/player) bu dosyadaki biçimlere birebir uyar.
 */

/* ───────────── 1. FTL: ağ yoklaması (Netflix /api/ftl/probe) ───────────── */

export interface FtlProbeTarget {
  /** 'resolver' | 'oc.anycast.proxy' | 'oc.ix.proxy' | 'cloud' */
  name: string
  /** Köke göreli adres, ör. /oca/c101-ist001-ix/ftl/probe?data=5120 */
  url: string
  /** Bu hedefin temsil ettiği CDN düğümü. */
  cdnId: string
}
export interface FtlProbeResponse {
  urls: FtlProbeTarget[]
  /** [0, 2000, 70000] */
  pulse_delays: number[]
  pulses: number
  ctx: { ip: string; region: string; device: string }
  /** Sonuçların raporlanacağı adres. */
  report: string
}
/** İstemcinin her darbe sonunda yolladığı ölçüm (POST /api/ftl/report). */
export interface FtlReport {
  iter: number
  pulse: number
  results: { name: string; cdnId: string; ok: boolean; ttfbMs: number; totalMs: number; bytes: number; kbps: number }[]
}

/* ───────────── 2. MSL: ileti güvenlik katmanı (Netflix MSL / ALE) ─────────────
 *
 * Anahtar anlaşması: ECDH P-256. Açık anahtarlar ham sıkıştırılmamış nokta (65 bayt), standart base64.
 *   shared  = ECDH(clientPriv, serverPub)                       (32 bayt)
 *   okm     = HKDF-SHA256(ikm=shared, salt=utf8(MSL_HKDF_SALT), info=utf8(MSL_HKDF_INFO_PREFIX + esn), 64 bayt)
 *   encKey  = okm[0..32]  (AES-256-GCM)      hmacKey = okm[32..64] (HMAC-SHA256)
 * Şifreleme (JSON değeri):  iv = 12 rastgele bayt;  ct = AES-GCM(encKey, iv, utf8(JSON), aad = utf8(mastertoken.tokendata))
 *   kodlama = base64(iv || ct || tag)   (tag 16 bayt; WebCrypto ct'nin sonuna ekler)
 * İmza: signature = base64(HMAC-SHA256(hmacKey, utf8(headerdata + '.' + payload)))
 * Tekrar koruması: header.messageid her iletide artar; sunucu aynı mastertoken serisinde eski kimliği reddeder.
 * Yenileme: now > renewalwindow ise istemci yeniden sağlama (provision) yapar; now > expiration ise sunucu reddeder.
 * WebCrypto yoksa (güvensiz bağlam) şema 'PLAINTEXT_DEV' olur: headerdata/payload base64(utf8(JSON)), imza boş.
 *
 * Yanıt başlığı: messageid = istek messageid + 1; `renewable` her zaman boolean.
 * Hataların taşınması:
 *   - MSL katmanı hataları şifresiz MslErrorBody: 400 (BAD_REQUEST, DECRYPT_FAILED) · 401 (TOKEN_*, REPLAYED)
 *   - Oturum/profil yoksa düz REST hatası: 401 UNAUTHENTICATED / PROFILE_REQUIRED
 *   - Manifest hataları (ManifestError) zarfın İÇİNDE, HTTP 200 ile gelir: istemci `'error' in payload` diye bakar
 * Yenileme: sağlama isteğine eski `mastertoken` eklenirse (geçerli ya da 24 saatten kısa süre önce dolmuş, aynı ESN)
 *   sunucu serialnumber'ı korur, sequencenumber'ı 1 artırır; istemci messageid'yi artırmayı sürdürür.
 */
export const MSL_VERSION = 'v1'
export const MSL_HKDF_SALT = 'tvplus-msl-v1'
export const MSL_HKDF_INFO_PREFIX = 'session-keys|'
export type MslScheme = 'ECDH_P256_AESGCM' | 'PLAINTEXT_DEV'

export interface MslMasterToken {
  /** base64(utf8(JSON MslTokenData)) */
  tokendata: string
  /** base64(HMAC-SHA256(sunucu ana anahtarı, tokendata)) */
  signature: string
}
export interface MslTokenData {
  /** epoch saniye: bu andan sonra istemci yenilemeli */
  renewalwindow: number
  /** epoch saniye: bu andan sonra geçersiz */
  expiration: number
  sequencenumber: number
  serialnumber: number
  esn: string
  scheme: MslScheme
  /** base64 — oturum anahtarlarının sunucu ana anahtarıyla şifrelenmiş hali (sunucu durumsuz kalır) */
  sessiondata: string
}
/** POST /msl/v1/provision?reqName=aleProvision */
export interface MslProvisionRequest {
  entityauthdata: { scheme: 'NONE'; authdata: { identity: string /* esn */ } }
  keyrequestdata: { scheme: MslScheme; keydata: { publickey?: string } }
  /** Yenileme için eski belirteç (isteğe bağlı) */
  mastertoken?: MslMasterToken
}
export interface MslProvisionResponse {
  keyresponsedata: { scheme: MslScheme; keydata: { publickey?: string } }
  mastertoken: MslMasterToken
}
/** Sağlamadan sonraki her MSL iletisi (istek ve yanıt aynı zarfı kullanır). */
export interface MslEnvelope {
  mastertoken: MslMasterToken
  /** şifreli MslHeader */
  headerdata: string
  /** şifreli yük (JSON) */
  payload: string
  signature: string
}
export interface MslHeader {
  messageid: number
  sender: string // esn (yanıtta 'tvplus-playapi')
  timestamp: number // epoch saniye
  /** yanıtlarda: istemci yenilemeliyse true */
  renewable?: boolean
}
export interface MslErrorBody {
  errorcode: 'TOKEN_EXPIRED' | 'TOKEN_INVALID' | 'REPLAYED' | 'DECRYPT_FAILED' | 'BAD_REQUEST'
  message: string
}

/* ───────────── 3. Lisanslı manifest (Netflix licensedManifest) ───────────── */

export type CodecProfile = 'vp9-webm' | 'h264-mp4' | 'opus-webm' | 'aac-mp4'

/** POST /msl/v1/playapi/licensedManifest?reqName=[prefetch/]licensedManifest&mainContentViewableId=…&clienttype=anka&browsername=…  (yük MslEnvelope içinde) */
export interface ManifestRequest {
  /** 'Video:80010001' | 'Channel:1' | 'Airing:<id>' */
  viewableId: string
  /** true → vitrin/komşu kanal için ön hazırlık; eşzamanlı izleme sayılmaz, olay üretmez */
  prefetch: boolean
  /** Önizleme kartı için: tanıtım (promo) kaynağını iste */
  promo?: boolean
  /** Airing için: baştan başlat */
  startOver?: boolean
  /** İstemcinin çözebildiği profiller, tercih sırasıyla (MediaSource.isTypeSupported sonucu) */
  profiles: CodecProfile[]
  /** MSE var mı (yoksa sunucu STREAMS yerine gömme/tek dosya kaynağı seçer) */
  supportsMse: boolean
  /** Aynı başlığın birden çok kaynağı varsa tercih: kendi CDN'imiz mi YouTube mu */
  preferredSource?: 'OWN_CDN' | 'YOUTUBE'
  /** FTL ölçümünden gelen CDN sıralama ipucu (en hızlı başta) */
  cdnHints?: string[]
  /** Arayüz dili (altyazı/ses varsayılanı) */
  uiLanguage: string
}

export interface ByteRange {
  start: number
  end: number // dahil
}
export interface CdnInfo {
  id: string // 'c101-ist001-ix'
  name: string
  /** 1 = en çok tercih edilen */
  rank: number
  type: 'IX' | 'ISP' | 'ANYCAST' | 'CLOUD'
  location: string
}
export interface StreamUrl {
  cdnId: string
  /** İçinde `{range}` yer tutucusu bulunan imzalı adres: /oca/<node>/range/{range}?o=…&v=…&e=…&t=… */
  url: string
}
export interface MediaStream {
  streamId: string
  bitrateKbps: number
  /** video için */
  width?: number
  height?: number
  /** MSE'nin kabul ettiği codec dizgesi, ör. 'vp9' | 'vp09.00.10.08' | 'avc1.4d401f' | 'opus' | 'mp4a.40.2' */
  codecs: string
  /** MSE addSourceBuffer için: 'video/webm' | 'video/mp4' | 'audio/webm' | 'audio/mp4' */
  mimeType: string
  container: 'mp4' | 'webm'
  profile: CodecProfile
  sizeBytes: number
  /** Başlatma bölümü (mp4: ftyp+moov · webm: EBML+Info+Tracks) */
  init: ByteRange
  /** Parça dizini (mp4: sidx kutusu · webm: Cues öğesi) */
  index: ByteRange
  urls: StreamUrl[]
}
export interface VideoTrack {
  trackId: string
  streams: MediaStream[] // bit hızına göre artan
}
export interface AudioTrack {
  trackId: string
  language: string // 'en'
  languageDescription: string // 'İngilizce [Özgün]'
  channels: '2.0' | '5.1'
  isNative: boolean
  streams: MediaStream[]
}
export interface TimedTextTrack {
  trackId: string
  language: string
  languageDescription: string
  type: 'SUBTITLES' | 'CC'
  /** Her zaman TTML (tik tabanlı zamanlama); OCA'dan ayrı belge olarak gelir */
  format: 'ttml'
  urls: { cdnId: string; url: string }[]
}
export interface ManifestBase {
  viewableId: string
  manifestId: string
  /** Sunucunun bu oynatma için verdiği oturum kimliği (olaylarda ve imzada kullanılır) */
  playbackContextId: string
  /** epoch ms — manifestin ve imzalı adreslerin geçerlilik sonu */
  expiration: number
  isPrefetch: boolean
  title: string
  durationMs: number | null
  /** Canlı yayın mı; doğrusal kanalda yayına katılma konumu (ms) */
  live: null | { startAt: string; endAt: string | null; joinOffsetMs: number; seekable: boolean }
  bookmark: { positionMs: number } | null
  /** Bu başlığın sunulabildiği diğer kaynak türleri (oynatıcıda "Kaynak" menüsü) */
  alternatives: ('OWN_CDN' | 'YOUTUBE')[]
  attribution: { license: string; text: string; url?: string } | null
}
/** Kendi CDN hattımız: ayrı ses/video akışları, bayt aralığıyla. */
export interface StreamsManifest extends ManifestBase {
  kind: 'STREAMS'
  videoTracks: VideoTrack[]
  audioTracks: AudioTrack[]
  timedTextTracks: TimedTextTrack[]
  cdns: CdnInfo[]
  /** Gerçek DRM yok; gösterim amaçlı erişim izni (EME/Widevine buraya takılır) */
  license: { type: 'ACCESS_GRANT'; grantId: string }
}
/** Tek dosya: tarayıcının kendi Range istekleri, yine imzalı OCA adresi üzerinden. */
export interface ProgressiveManifest extends ManifestBase {
  kind: 'PROGRESSIVE'
  mimeType: string
  sizeBytes: number | null
  /** /oca/<node>/file?o=…&v=…&e=…&t=… */
  urls: { cdnId: string; url: string }[]
  timedTextTracks: TimedTextTrack[]
  cdns: CdnInfo[]
}
/** Dış sağlayıcı gömmesi: akışı sağlayıcının kendi oynatıcısı taşır. */
export interface EmbedManifest extends ManifestBase {
  kind: 'EXTERNAL_EMBED'
  provider: 'YOUTUBE'
  videoId: string | null
  /** Canlı kanal gömmesi için */
  liveChannelId: string | null
  startSec: number
}
export type LicensedManifest = StreamsManifest | ProgressiveManifest | EmbedManifest

export interface ManifestError {
  error: {
    code: 'NOT_FOUND' | 'ACCESS_DENIED' | 'NO_COMPATIBLE_SOURCE' | 'SOURCE_UNAVAILABLE' | 'BAD_REQUEST'
    message: string
    /** ACCESS_DENIED ise yetki ayrıntısı */
    access?: { state: string; reasonText: string; requiredProduct: string | null }
  }
}

/* ───────────── 4. OCA adresleri ─────────────
 *   GET /oca/:node/range/:start-:end?o=<nesne>&v=<sürüm>&e=<epoch sn>&t=<imza>   → 206, gövde = istenen baytlar
 *   GET /oca/:node/file?o=…&v=…&e=…&t=…            (Range başlığıyla; PROGRESSIVE)
 *   GET /oca/:node/timedtext/:trackId?o=…&v=…&e=…&t=…   → application/ttml+xml
 *   GET /oca/:node/ftl/probe?data=5120              → 5120 bayt
 * İmza:  t = base64url(HMAC-SHA256(urlKey, `${node}|${o}|${v}|${e}`))   — aralık imzalanmaz (Netflix'teki gibi yol parçası değişir).
 * Yanıt başlıkları: x-tvplus-oca: <node>, x-tcp-info: addr=…;port=…;rtt=…, server: tvplus-oca.
 * Hata kodları ve oynatıcının tepkisi:
 *   403 SIGNATURE_INVALID | URL_EXPIRED · 410 OBJECT_VERSION_STALE   → manifesti yenile
 *   502 ORIGIN_UNREACHABLE | ORIGIN_ERROR · 503 NODE_DOWN | NODE_ERROR → sıradaki CDN'e geç
 *   400 BAD_SIGNATURE_PARAMS · 404 NODE_NOT_FOUND | OBJECT_NOT_FOUND · 416 (content-range: bytes *\/boyut) → hata
 * Kimlikler: parça `V-main`, `A-<dil>-20|51`, `T-<dil>[-cc]`; akış `v-<yükseklik>p-<kbps>k-<o6>` / `a-<dil>-<kbps>k-<o6>`.
 * FTL hedeflerinden `anycast` bir manifest CDN'i değildir; sıralamaya ve cdnHints'e girmez.
 */
export const RANGE_PLACEHOLDER = '{range}'
export function rangeUrl(template: string, start: number, end: number): string {
  return template.replace(RANGE_PLACEHOLDER, `${start}-${end}`)
}

/* ───────────── 5. TTML altyazı ─────────────
 * Kök: <tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttp="http://www.w3.org/ns/ttml#parameter"
 *          xmlns:tvpm="urn:tvplus:ttml#metadata" ttp:tickRate="10000000" xml:lang="tr">
 * Satırlar: <p begin="14612515t" end="32565033t"><span>Metin</span><br/><span>ikinci satır</span></p>
 * İtalik/kalın: <span tts:fontStyle="italic">, <span tts:fontWeight="bold"> (xmlns:tts="http://www.w3.org/ns/ttml#styling").
 * <head><metadata> içinde <tvpm:source> ve <tvpm:cueCount> bulunur.
 */
export const TTML_TICK_RATE = 10_000_000
