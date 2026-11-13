/**
 * İstemci ile sunucunun paylaştığı sabitler: başlık adları, çerez adları, yollar.
 * Netflix karşılıkları yorumlarda verilmiştir (bkz. docs/MIMARI.md).
 */

/** İstemci kimliği: Netflix'te `akira` (SPA), `hawkins` (tasarım sistemi), `cadmium` (oynatıcı). */
export const CLIENT = {
  TYPE: 'anka', // SPA kabuğu
  DESIGN_SYSTEM: 'cini',
  DESIGN_VERSION: '1.0.0',
  PLAYER: 'kehribar',
  PLAYER_VERSION: '1.0.0',
} as const

export const HEADERS = {
  /** Netflix: x-netflix.esn */
  ESN: 'x-tvplus-esn',
  /** Netflix: x-netflix.clienttype */
  CLIENT_TYPE: 'x-tvplus-clienttype',
  /** Netflix: x-netflix.context.ui-flavor */
  UI_FLAVOR: 'x-tvplus-ui-flavor',
  /** Netflix: x-netflix.context.hawkins-version */
  DESIGN_VERSION: 'x-tvplus-design-version',
  /** Netflix: x-netflix.request.client.user.guid */
  PROFILE_GUID: 'x-tvplus-profile-guid',
  /** CSRF belirteci; Falcor gövdesinde `authURL=`, GraphQL mutasyonlarında bu başlık. */
  AUTH_URL: 'x-tvplus-authurl',
  /** Zipkin B3 izleme başlıkları — her yanıtta bulunur. */
  TRACE_ID: 'x-b3-traceid',
  SPAN_ID: 'x-b3-spanid',
  PARENT_SPAN_ID: 'x-b3-parentspanid',
  SAMPLED: 'x-b3-sampled',
  /** Netflix: x-netflix-passport.fromorigin.profileguid — kimliğin çerezden çözüldüğünü doğrular. */
  PASSPORT_PROFILE: 'x-tvplus-passport-profileguid',
  REGION: 'x-tvplus-region',
  /** Netflix: x-ichnaea: ~0=true~RL=2212 — olay ucu hız sınırı bilgisi. */
  EVENT_RATE: 'x-tvplus-izci',
  /** Netflix: Content-Encoding: msl_v1 — ileti güvenlik katmanı sürümü. */
  MSL: 'x-tvplus-msl',
  /** OCA düğümünün bağlantı bilgisi (QoS izleme). */
  TCP_INFO: 'x-tcp-info',
  OCA_NODE: 'x-tvplus-oca',
  /** Yanıtta çalıştırılan kalıcı sorgunun adı. */
  GQL_OP: 'x-tvplus-gql-op',
  /** Görsel servisinin hata ayıklama başlığı: `<kaynak>; cache=hit|miss`. */
  IMAGE_DEBUG: 'x-tvplus-img',
  /** Sanal cihaz adı (cihaz vitrini): çerez adlarına `__<ad>` eklenir. Başlık taşıyamayan isteklerde `?vd=<ad>`. */
  VIRTUAL_DEVICE: 'x-tvplus-vd',
} as const

export const COOKIES = {
  /** Netflix: NetflixId — oturum + profil GUID (pg=...). HttpOnly, SameSite=Lax, 1 yıl. */
  SESSION: 'TvpId',
  /** Netflix: SecureNetflixId — oturum çerezinin MAC'i. HttpOnly, SameSite=Strict, 1 yıl. */
  SECURE: 'SecureTvpId',
  /** Netflix: nfvdid — sanal cihaz kimliği. 1 yıl. */
  DEVICE: 'tvpvdid',
  /** Netflix: profilesNewSession — profil seçimi durumu. Oturum çerezi. */
  PROFILE_GATE: 'tvpProfilesNewSession',
} as const

export const ROUTES = {
  GRAPHQL: '/graphql',
  /** Netflix: /nq/website/memberapi/release/pathEvaluator (Shakti / Falcor) */
  PATH_EVALUATOR: '/api/member/pathEvaluator',
  BOOT: '/api/boot',
  LOGIN: '/api/login',
  LOGOUT: '/api/logout',
  PROFILE_SWITCH: '/api/profiles/switch',
  /** Netflix: /api/ftl/probe */
  FTL_PROBE: '/api/ftl/probe',
  FTL_REPORT: '/api/ftl/report',
  /** Netflix: /nq/msl_v1/nrdjs/pbo_tokens/^1.0.0/router?reqName=aleProvision */
  MSL_PROVISION: '/msl/v1/provision',
  /** Netflix: /msl/playapi/cadmium/licensedmanifest/1 */
  MSL_MANIFEST: '/msl/v1/playapi/licensedManifest',
  /** OCA düğümleri: /oca/:node/range/:start-:end , /oca/:node/file , /oca/:node/timedtext/:track , /oca/:node/ftl/probe */
  OCA_PREFIX: '/oca',
  /** Netflix: occ.nflxso.net/dnm/api/v6/... (görsel API) */
  IMAGE_PREFIX: '/img/v1',
  /** Netflix: logs.netflix.com/log/www/cl/2 */
  EVENT_LOG: '/log/web/cl/1',
  /** Netflix: notifications.netflix.com/push (uzun yoklama) */
  PUSH: '/push',
  DEBUG_PREFIX: '/api/debug',
  /** Cihazlar arası deneyim (bkz. shared/devices.ts) */
  DEVICES: '/api/devices',
  DEVICE_STREAM: '/api/devices/stream',
  TV_LOGIN: '/api/tv/login',
  PROFILES: '/api/profiles',
} as const

/** Kalıcı sorgu kayıt defteri sürümü (istemci her istekte yollar). */
export const PERSISTED_QUERY_VERSION = 102

/** FTL yoklama darbeleri: anında, 2 sn sonra, 70 sn sonra. */
export const FTL_PULSE_DELAYS_MS = [0, 2000, 70000] as const
export const FTL_PROBE_BYTES = 5120

/** İmzalı OCA adreslerinin ömrü (~12 saat). */
export const OCA_URL_TTL_SEC = 12 * 60 * 60
/** Arama yanıtı ömrü (~8 saat); canlı bölümler için 60 sn. */
export const SEARCH_TTL_SEC = 8 * 60 * 60
export const LIVE_SECTION_TTL_SEC = 60

export const REGION = 'tr-ist-1'
export const TIME_ZONE = 'Europe/Istanbul'

/** Sanal cihaz sorgu parametresi (bkz. HEADERS.VIRTUAL_DEVICE). Yalnız [a-z0-9]{1,12}. */
export const VIRTUAL_DEVICE_PARAM = 'vd'
/** Ekran biçimini zorlamak için sorgu parametresi: ?cihaz=tv|mobil|web */
export const FORM_FACTOR_PARAM = 'cihaz'
/** TV giriş kodunun ömrü ve yoklama aralığı. */
export const TV_LOGIN_TTL_SEC = 600
export const TV_LOGIN_POLL_SEC = 2
