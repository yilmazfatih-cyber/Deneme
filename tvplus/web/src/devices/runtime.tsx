/**
 * Cihaz arayüzünün çalışma zamanı (web ve mobil kabuk; TV'de kurulmaz):
 *   - yansıtma köprüsüne işleyici (bridge.setCastHandler) ve "yansıtılabilir" bilgisi (setCastAvailable)
 *   - başka cihazdan gelen CAST komutu (TV'den "Bu cihazda devam et" / TRANSFER) → burada oynat
 *   - cihaz seçicinin yuvası: kabuktan bağımsız ayrı bir React kökü (oynatıcı sayfası kabuksuzdur)
 * `installDeviceUi()` birden çok kez çağrılabilir; features/remote modülü yüklenince çağrılır.
 */
import { useSyncExternalStore, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { DeviceInfo } from '../../../shared/devices'
import { devbus } from '../lib/devbus'
import { detectFormFactor, isTv } from '../lib/formFactor'
import { playerRemote } from '../player'
import { toast } from '../ui'
import { setCastAvailable, setCastHandler, type CastRequest } from './bridge'
import { createCastController, watchHref, type CastController } from './cast'
import { deviceClient } from './client'
import { castTargets } from './progress'

/* ───────────── yönlendirme (React dışı) ───────────── */

/** HashRouter yolu: aynı yola tekrar gitmek geçmişe kayıt eklemez. */
export function navigateTo(to: string): void {
  const next = `#${to}`
  if (window.location.hash !== next) window.location.hash = next
}

/**
 * Yerel oynatıcıyı bırakır: duraklatır (oynatıcı yer imini kaydeder) ve izleme sayfasının geçmiş girdisini `to`
 * ile değiştirir; oynatıcı ayrılınca (en çok 1.5 sn) çözülür. Geçmişte geri gidilmez (bkz. cast.ts).
 */
function leaveLocalPlayer(to: string): Promise<void> {
  return new Promise((resolve) => {
    if (!playerRemote.getState()) return resolve()
    let done = false
    const finish = () => {
      if (done) return
      done = true
      off()
      window.clearTimeout(timer)
      resolve()
    }
    const off = playerRemote.subscribe(() => {
      if (!playerRemote.getState()) finish()
    })
    const timer = window.setTimeout(finish, 1500)
    playerRemote.dispatch({ type: 'PAUSE' })
    const url = new URL(window.location.href)
    url.hash = `#${to}`
    window.location.replace(url.toString())
  })
}

/* ───────────── seçici durumu ───────────── */

interface PickerState {
  open: boolean
  /** Yansıtılacak içerik; null → yalnız kumanda hedefi seçilir */
  req: CastRequest | null
}

let picker: PickerState = { open: false, req: null }
const pickerListeners = new Set<() => void>()
const setPicker = (p: PickerState) => {
  picker = p
  for (const l of pickerListeners) l()
}
const subscribePicker = (fn: () => void) => {
  pickerListeners.add(fn)
  return () => {
    pickerListeners.delete(fn)
  }
}

export function usePicker(): PickerState {
  return useSyncExternalStore(subscribePicker, () => picker)
}

export function openCastPicker(req: CastRequest | null): void {
  ensureHost()
  setPicker({ open: true, req })
}

export function closeCastPicker(): void {
  setPicker({ ...picker, open: false })
}

/* ───────────── denetleyici ───────────── */

export const castController: CastController = createCastController({
  getState: () => deviceClient.getState(),
  setTarget: (id) => deviceClient.setTarget(id),
  sendCommand: (id, cmd) => deviceClient.sendCommand(id, cmd),
  hasLocalPlayer: () => playerRemote.getState() !== null,
  leaveLocalPlayer,
  formFactor: () => detectFormFactor(),
  navigate: navigateTo,
  toast: (m, kind) => toast(m, { kind }),
  openPicker: (req) => openCastPicker(req),
  now: () => Date.now(),
})

/** Seçicide bir TV seçildi: içerik varsa yansıt, yoksa hedef yap ve kumandayı aç. */
export async function choosePickerDevice(device: DeviceInfo): Promise<void> {
  const req = picker.req
  closeCastPicker()
  if (req) {
    await castController.castTo(device, req)
    return
  }
  deviceClient.setTarget(device.deviceId)
  navigateTo('/kumanda')
}

/* ───────────── yuva (ayrı kök) ───────────── */

let root: Root | null = null
let hostComponent: (() => ReactElement) | null = null

/** Seçici bileşenini kaydeder (castUi.tsx); döngüsel içe aktarımı önler. */
export function registerPickerHost(c: () => ReactElement): void {
  hostComponent = c
}

function ensureHost(): void {
  if (root || !hostComponent) return
  const el = document.createElement('div')
  el.id = 'tvp-cast-host'
  document.body.appendChild(el)
  root = createRoot(el)
  const Host = hostComponent
  root.render(<Host />)
}

/* ───────────── kurulum ───────────── */

let installed = false

export function installDeviceUi(): void {
  if (installed || isTv()) return
  installed = true

  setCastHandler((req) => {
    devbus.emit('device', 'yansıtma isteği', { viewableId: req.viewableId, positionSec: req.positionSec ?? null })
    castController.request(req)
  })

  const sync = () => setCastAvailable(castTargets(deviceClient.getState().devices).length > 0)
  sync()
  deviceClient.subscribe(sync)

  // TV'den aktarılan oynatma (TRANSFER → bu cihaza CAST): burada, kaldığı yerden aç.
  deviceClient.onCommand((env) => {
    const cmd = env.command
    if (cmd.type === 'CAST') {
      navigateTo(watchHref(cmd.viewableId, cmd.positionSec ?? null))
      toast(`${env.from.name} gönderdi`, { kind: 'info' })
      return true
    }
    if (cmd.type === 'STOP' && playerRemote.getState()) {
      playerRemote.dispatch({ type: 'STOP' })
      return true
    }
    return false
  })
}
