/**
 * Yansıtma denetleyicisi ("TV'de İzle"). Bağımlılıklar dışarıdan verilir (birim testi: cast.test.ts); uygulamadaki
 * örnek `runtime.ts` içinde kurulur.
 *
 *   Tek çevrimiçi TV → hemen yansıt · birden çok → seçici · hiç yok → sakin bildirim
 *   Yansıt: hedefi seç, CAST yolla; teslim edildiyse yerel oynatıcıyı durdur; telefonda kumandaya geç,
 *   masaüstünde sayfada kal ("Şu an TV'de" kartı görünür). Teslim edilmediyse yerel oynatma sürer.
 *   Bu Cihazda Devam Et: TV'yi durdur, kaldığı konumdan burada aç.
 */
import type { DeviceInfo, NowPlaying, RemoteCommand } from '../../../shared/devices'
import type { CastRequest } from './bridge'
import type { DeviceClientState } from './client-core'
import { castTargets, positionAt } from './progress'

export interface CastDeps {
  getState: () => DeviceClientState
  setTarget: (deviceId: string | null) => void
  sendCommand: (deviceId: string, cmd: RemoteCommand) => Promise<boolean>
  /** Bu cihazda takılı bir oynatıcı var mı */
  hasLocalPlayer: () => boolean
  /**
   * Yerel oynatıcıyı bırakır: duraklatır (yer imi kaydedilir) ve izleme sayfasının geçmiş girdisini `to` ile
   * DEĞİŞTİRİR. Geçmişte geri gidilmez: vitrinde çerçeveler ortak oturum geçmişini paylaşır, geri gitmek TV
   * çerçevesinin az önceki gezinmesini geri alırdı. Çıkış tamamlanınca çözülür.
   */
  leaveLocalPlayer: (to: string) => Promise<void>
  formFactor: () => 'mobile' | 'desktop' | 'tv'
  navigate: (to: string) => void
  toast: (message: string, kind?: 'info' | 'success' | 'error') => void
  openPicker: (req: CastRequest | null) => void
  now: () => number
}

/** Yansıttıktan sonra masaüstünde oynatıcının yerine açılan sayfa: başlığın detayı ya da Canlı TV. */
export function afterCastRoute(viewableId: string): string {
  const video = /^Video:(\d+)$/.exec(viewableId)
  if (video) return `/goz-at?jbv=${video[1]}`
  if (viewableId.startsWith('Channel:') || viewableId.startsWith('Airing:')) return '/canli'
  return '/goz-at'
}

/** "/izle/<id>?konum=<sn>" — canlıda konum yok. */
export function watchHref(viewableId: string, positionSec: number | null): string {
  const id = encodeURIComponent(viewableId).replace(/%3A/gi, ':')
  return `/izle/${id}${positionSec !== null && positionSec > 0 ? `?konum=${Math.floor(positionSec)}` : ''}`
}

export function castCommand(req: CastRequest): RemoteCommand {
  const cmd: RemoteCommand = { type: 'CAST', viewableId: req.viewableId }
  if (req.positionSec !== undefined && Number.isFinite(req.positionSec) && req.positionSec > 0)
    cmd.positionSec = Math.floor(req.positionSec)
  if (req.startOver) cmd.startOver = true
  if (req.tctx) cmd.tctx = req.tctx
  return cmd
}

export interface CastController {
  /** Köprünün işleyicisi (requestCast) */
  request: (req: CastRequest) => void
  /** Seçilen TV'ye yansıtır; teslim edildiyse true */
  castTo: (device: DeviceInfo, req: CastRequest) => Promise<boolean>
  /** TV'de oynatmayı durdurur */
  stopOn: (device: DeviceInfo) => Promise<boolean>
  /** TV'yi durdurup oynatmayı bu cihazda sürdürür */
  continueHere: (device: DeviceInfo, np: NowPlaying) => Promise<void>
}

export function createCastController(deps: CastDeps): CastController {
  let inFlight = false

  const castTo = async (device: DeviceInfo, req: CastRequest): Promise<boolean> => {
    if (inFlight) return false
    inFlight = true
    deps.setTarget(device.deviceId)
    let ok = false
    try {
      ok = await deps.sendCommand(device.deviceId, castCommand(req))
    } catch {
      ok = false
    }
    try {
      if (!ok) {
        deps.toast(`${device.name} yanıt vermedi. Burada izlemeye devam edebilirsin.`, 'info')
        return false
      }
      deps.toast(`${device.name} cihazında açılıyor`, 'success')
      const mobile = deps.formFactor() === 'mobile'
      if (deps.hasLocalPlayer()) await deps.leaveLocalPlayer(mobile ? '/kumanda' : afterCastRoute(req.viewableId))
      else if (mobile) deps.navigate('/kumanda')
      return true
    } finally {
      inFlight = false
    }
  }

  const request = (req: CastRequest): void => {
    const tvs = castTargets(deps.getState().devices)
    if (tvs.length === 0) {
      deps.toast("Yansıtılacak TV bulunamadı. TV'de TV+'ı açıp aynı hesapla giriş yap.", 'info')
      return
    }
    const only = tvs.length === 1 ? tvs[0] : undefined
    if (only) {
      void castTo(only, req)
      return
    }
    deps.openPicker(req)
  }

  const stopOn = async (device: DeviceInfo): Promise<boolean> => {
    try {
      const ok = await deps.sendCommand(device.deviceId, { type: 'STOP' })
      if (!ok) deps.toast(`${device.name} yanıt vermedi.`, 'info')
      return ok
    } catch {
      deps.toast(`${device.name} yanıt vermedi.`, 'info')
      return false
    }
  }

  const continueHere = async (device: DeviceInfo, np: NowPlaying): Promise<void> => {
    const pos = np.live ? null : Math.floor(positionAt(np, deps.now()))
    // TV'ye ulaşılamasa da burada açılır: kullanıcı izlemeye devam edebilsin.
    await stopOn(device).catch(() => false)
    deps.navigate(watchHref(np.viewableId, pos))
  }

  return { request, castTo, stopOn, continueHere }
}
