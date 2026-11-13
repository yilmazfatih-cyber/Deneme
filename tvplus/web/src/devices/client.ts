/**
 * Cihaz istemcisi — İSKELET (cihazlar ajanı dolduracak). Dışa aktarılan adlar ve imzalar SABİTTİR; TV uygulaması,
 * kumanda ve yansıtma arayüzleri bunlara göre yazılır. Tel sözleşmesi: shared/devices.ts.
 */
import type {
  DeviceInfo,
  DeviceKind,
  DeviceScreen,
  ManagedProfile,
  NowPlaying,
  ProfilesResponse,
  RemoteCommand,
  RemoteCommandEnvelope,
  TvLoginLookup,
  TvLoginPoll,
  TvLoginStart,
} from '../../../shared/devices'
import type { BootContext } from '../../../shared/types'

export interface DeviceClientState {
  /** 'idle' → start() çağrılmadı · 'connecting' · 'online' (SSE açık) · 'offline' (yeniden deniyor) */
  connection: 'idle' | 'connecting' | 'online' | 'offline'
  thisDevice: DeviceInfo | null
  /** Hesaptaki tüm cihazlar (bu cihaz dahil), TV'ler önce */
  devices: DeviceInfo[]
  /** Kullanıcının kumanda etmek için seçtiği cihaz (deviceId) */
  targetDeviceId: string | null
}

const notReady = (): never => {
  throw new Error('Cihaz istemcisi henüz yazılmadı')
}

export const deviceClient = {
  /** Bu uygulama örneğini cihaz olarak kaydeder ve komut akışına bağlanır (üye + profil varken; tekrar çağrılabilir). */
  start(_opts: { kind: DeviceKind; name?: string }): void {},
  /** Akışı kapatır (çıkışta). */
  stop(): void {},
  getState(): DeviceClientState {
    return { connection: 'idle', thisDevice: null, devices: [], targetDeviceId: null }
  },
  /** Durum değişince çağrılır; abonelikten çıkma işlevini döndürür. */
  subscribe(_listener: () => void): () => void {
    return () => {}
  },
  setTarget(_deviceId: string | null): void {},
  /** Hedef cihaza komut yollar; teslim edildiyse true. */
  async sendCommand(_deviceId: string, _command: RemoteCommand): Promise<boolean> {
    return notReady()
  },
  /** Bu cihaza gelen komutlar için işleyici ekler (TV odak motoru, oynatıcı, yönlendirici). İşleyici true dönerse komut tüketilmiştir. */
  onCommand(_handler: (envelope: RemoteCommandEnvelope) => boolean | void): () => void {
    return () => {}
  },
  /** Bu cihazın ekranını / oynatma durumunu bildirir (istemci saniyede en çok bir kez yollar). */
  reportState(_state: { screen?: DeviceScreen; nowPlaying?: NowPlaying | null }): void {},
  async rename(_deviceId: string, _name: string): Promise<void> {
    return notReady()
  },
  /** O cihazın oturumunu kapatır. */
  async remove(_deviceId: string): Promise<void> {
    return notReady()
  },

  /* TV'de kodla giriş */
  async startTvLogin(_name?: string): Promise<TvLoginStart> {
    return notReady()
  },
  async pollTvLogin(_deviceCode: string): Promise<TvLoginPoll> {
    return notReady()
  },
  async lookupTvLogin(_userCode: string): Promise<TvLoginLookup> {
    return notReady()
  },
  async approveTvLogin(_userCode: string, _profileGuid?: string): Promise<{ deviceId: string }> {
    return notReady()
  },
  async denyTvLogin(_userCode: string): Promise<void> {
    return notReady()
  },

  /* Profil yönetimi */
  async listProfiles(): Promise<ProfilesResponse> {
    return notReady()
  },
  async createProfile(_input: { name: string; avatarKey: string; isKids: boolean }): Promise<ManagedProfile> {
    return notReady()
  },
  async updateProfile(
    _guid: string,
    _input: { name?: string; avatarKey?: string; isKids?: boolean; pin?: string | null },
  ): Promise<ManagedProfile> {
    return notReady()
  },
  async deleteProfile(_guid: string): Promise<void> {
    return notReady()
  },
  /** Profil değiştirir; kilitliyse PIN ister. Hata kodları: 'PIN_REQUIRED' | 'PIN_INVALID' (Error.message). */
  async switchProfile(_guid: string, _pin?: string): Promise<BootContext> {
    return notReady()
  },
}

/** React için: `useSyncExternalStore(deviceClient.subscribe, deviceClient.getState)` ile kullanılır. */
export type DeviceClient = typeof deviceClient
