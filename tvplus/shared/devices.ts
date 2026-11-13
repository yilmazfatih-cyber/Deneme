/**
 * Cihazlar arası deneyimin tel sözleşmesi: TV'de QR/kod ile giriş, telefonu kumanda olarak kullanma,
 * içeriği TV'ye yansıtma (oturum devri). Sunucu: server/src/services/devices · İstemci: web/src/devices/client.ts.
 *
 * Cihaz = bir tarayıcı (tvpvdid çerezi). Tür, istemcinin ekran biçiminden gelir. Komutlar yalnız AYNI HESABIN
 * cihazları arasında gider; hedef cihaz içeriği kendi oturumuyla, olağan oynatma hattından açar.
 *
 * Sanal cihaz: tek tarayıcıda birden çok bağımsız cihaz denemek için (cihaz vitrini) istek `x-tvplus-vd: <ad>`
 * başlığı ya da `?vd=<ad>` sorgusu taşır; sunucu çerez adlarına `__<ad>` ekler, böylece her çerçevenin oturumu ayrıdır.
 */
import type { BootContext } from './types'

export type DeviceKind = 'TV' | 'MOBILE' | 'WEB'

/** Cihazın o an gösterdiği ekran (kumanda arayüzü buna göre düğme gösterir). */
export type DeviceScreen = 'login' | 'profiles' | 'home' | 'detail' | 'search' | 'live' | 'guide' | 'player' | 'other'

export interface NowPlaying {
  viewableId: string
  title: string
  subtitle: string | null
  artUrl: string | null
  live: boolean
  positionSec: number
  durationSec: number | null
  paused: boolean
  /** 0–100 */
  volume: number
  muted: boolean
  /** ISO; konum bu andan itibaren istemcide ilerletilir */
  updatedAt: string
}

export interface DeviceInfo {
  deviceId: string
  kind: DeviceKind
  /** "Salon TV'si", "Deniz'in telefonu", "Chrome · Mac" */
  name: string
  online: boolean
  isThisDevice: boolean
  lastSeenAt: string
  profileName: string | null
  screen: DeviceScreen | null
  nowPlaying: NowPlaying | null
}

export type RemoteKey =
  | 'UP'
  | 'DOWN'
  | 'LEFT'
  | 'RIGHT'
  | 'OK'
  | 'BACK'
  | 'HOME'
  | 'SEARCH'
  | 'GUIDE'
  | 'PLAY_PAUSE'
  | 'REWIND'
  | 'FORWARD'
  | 'CHANNEL_UP'
  | 'CHANNEL_DOWN'
  | 'VOLUME_UP'
  | 'VOLUME_DOWN'
  | 'MUTE'
  | 'SUBTITLES'
  | 'DIGIT_0'
  | 'DIGIT_1'
  | 'DIGIT_2'
  | 'DIGIT_3'
  | 'DIGIT_4'
  | 'DIGIT_5'
  | 'DIGIT_6'
  | 'DIGIT_7'
  | 'DIGIT_8'
  | 'DIGIT_9'

export type RemoteCommand =
  /** Kumanda tuşu (TV odak motoru ya da oynatıcı işler) */
  | { type: 'KEY'; key: RemoteKey }
  /** Telefon klavyesinden yazı: TV'deki arama kutusunun TAM metni; submit → aramayı çalıştır */
  | { type: 'TEXT'; text: string; submit?: boolean }
  /** Yansıtma / oturum devri: hedef cihaz bu içeriği (verilen konumdan) oynatır */
  | { type: 'CAST'; viewableId: string; positionSec?: number; startOver?: boolean; tctx?: string }
  | { type: 'SEEK'; positionSec: number }
  | { type: 'VOLUME'; volume: number }
  | { type: 'STOP' }
  /** Uygulama içi yol (yalnız '/…' ile başlayan hash yolu kabul edilir) */
  | { type: 'NAVIGATE'; route: string }
  /** Hedef cihaz oynatmayı durdurur ve kaldığı konumla `toDeviceId` cihazına CAST yollar ("Bu cihazda devam et") */
  | { type: 'TRANSFER'; toDeviceId: string }

/** Sunucunun hedef cihaza ilettiği zarf. */
export interface RemoteCommandEnvelope {
  id: string
  at: string
  from: { deviceId: string; name: string; kind: DeviceKind }
  command: RemoteCommand
}

/* ───────────── REST uçları ─────────────
 * POST /api/devices/register   { kind, name? }                       → { device: DeviceInfo }      (üye; her açılışta)
 * GET  /api/devices                                                  → { devices: DeviceInfo[] }
 * GET  /api/devices/stream                                           → text/event-stream (aşağıdaki olaylar; 15 sn'de bir `ping`)
 * POST /api/devices/state      { screen, nowPlaying }                → 204                          (cihaz kendi durumunu bildirir; ≤ 1/sn)
 * POST /api/devices/:deviceId/command   RemoteCommand                → { delivered: boolean }       (üye + authURL)
 * PATCH /api/devices/:deviceId { name }                              → { device }
 * DELETE /api/devices/:deviceId                                      → 204                          (o cihazın oturumunu kapatır)
 *
 * SSE olayları (event: <ad>, data: <JSON>):
 *   hello    { deviceId }
 *   devices  { devices: DeviceInfo[] }          — hesaptaki cihazlardan biri değiştiğinde (çevrimiçi, ekran, oynatma)
 *   command  RemoteCommandEnvelope              — bu cihaza gelen komut
 *   signout  {}                                 — bu cihazın oturumu uzaktan kapatıldı
 */
export interface DeviceRegisterRequest {
  kind: DeviceKind
  name?: string
}
export interface DeviceStateReport {
  screen: DeviceScreen
  nowPlaying: NowPlaying | null
}
export interface DeviceListResponse {
  devices: DeviceInfo[]
}

/* ───────────── TV'de kodla giriş (OAuth "device authorization grant" kalıbı) ─────────────
 * POST /api/tv/login/start    { name? }                  → TvLoginStart        (oturumsuz TV çağırır)
 * GET  /api/tv/login/qr.svg?kod=<userCode>               → image/svg+xml       (verificationUrl'in QR kodu)
 * POST /api/tv/login/poll     { deviceCode }             → TvLoginPoll         (APPROVED yanıtı TV'ye çerez zincirini kurar)
 * GET  /api/tv/login/lookup?kod=<userCode>               → TvLoginLookup       (üye; onay ekranı için)
 * POST /api/tv/login/approve  { userCode, profileGuid? } → { ok: true, deviceId } (üye + authURL)
 * POST /api/tv/login/deny     { userCode }               → { ok: true }
 * Kod 10 dk geçerli ve tek kullanımlıktır; userCode okunaklı 8 karakterdir (karışan harfler yok), deviceCode gizlidir.
 */
export interface TvLoginStart {
  /** Yalnız TV'nin bildiği gizli anahtar (yoklama için) */
  deviceCode: string
  /** Ekranda gösterilen kod, ör. 'KLMN-4821' */
  userCode: string
  /** Telefonun açacağı adres; yerel ağdan erişilebilir kökle kurulur (localhost ise makinenin ağ adresi) */
  verificationUrl: string
  /** QR görselinin köke göreli adresi */
  qrUrl: string
  expiresInSec: number
  intervalSec: number
}
export type TvLoginStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED'
export interface TvLoginPoll {
  status: TvLoginStatus
  /** APPROVED ise yeni açılış bağlamı */
  boot?: BootContext
}
export interface TvLoginLookup {
  userCode: string
  deviceName: string
  deviceKind: DeviceKind
  requestedAt: string
  expiresAt: string
}

/* ───────────── Profil yönetimi (kimlik servisi) ─────────────
 * GET    /api/profiles                 → ProfilesResponse
 * POST   /api/profiles                 { name, avatarKey, isKids }                    → { profile }
 * PATCH  /api/profiles/:guid           { name?, avatarKey?, isKids?, pin?: string|null } → { profile }   (pin: 4 hane; null kilidi kaldırır)
 * DELETE /api/profiles/:guid           → 204   (son profil silinemez)
 * POST   /api/profiles/switch          { guid, pin? } → BootContext | 403 { error: { code: 'PIN_REQUIRED' | 'PIN_INVALID' } }
 */
export interface AvatarOption {
  key: string
  url: string
}
export interface ManagedProfile {
  guid: string
  name: string
  avatarKey: string
  avatarUrl: string
  isKids: boolean
  isLocked: boolean
  maturityLevel: number
}
export interface ProfilesResponse {
  profiles: ManagedProfile[]
  avatars: AvatarOption[]
  maxProfiles: number
}
