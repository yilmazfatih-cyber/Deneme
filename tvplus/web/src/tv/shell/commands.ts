/**
 * Telefondan gelen kumanda komutlarının yönlendirmesi (deviceClient.onCommand → burası). Bağımlılıklar dışarıdan
 * verilir: birim testleri sahte deviceClient / playerRemote / yönlendirici ile çalışır (commands.test.ts).
 *
 *   KEY       → oynatıcı bağlıysa playerRemote.dispatch({ type: 'KEY' }) (false dönerse dispatchKey); değilse
 *               dispatchKey (klavyeyle aynı yol); telefondan ilk tuşta "Telefon kumandası bağlı" ipucu
 *   TEXT      → kayıtlı yazı hedefi (arama ekranı `registerTextTarget` ile kaydolur); yoksa önce /tv/ara açılır,
 *               yazı hedef kaydolunca uygulanır
 *   CAST      → /tv/izle/<id>?konum=…&baslat=bastan + "‹cihaz› gönderdi"
 *   NAVIGATE  → yalnız /tv ile başlayan yollar
 *   SEEK / VOLUME / STOP → oynatıcı bağlıysa playerRemote.dispatch (STOP'ta oynatıcı yer imini kaydedip kendisi çıkar)
 *   TRANSFER  → oynatıcının konumunu oku, yerelde durdur (oynatıcı çıkar), hedef cihaza CAST yolla
 */
import type { NowPlaying, RemoteCommand, RemoteCommandEnvelope, RemoteKey } from '../../../../shared/devices'
import { watchPath } from './routes'

/* ───────────── Yazı hedefi ───────────── */

export interface TextTarget {
  /** Arama kutusunun TAM metni */
  setText: (text: string) => void
  /** Aramayı çalıştır */
  submit: () => void
}

export class TextTargetRegistry {
  private stack: TextTarget[] = []
  private pending: { text: string; submit: boolean } | null = null

  /** Hedef kaydeder (en son kaydolan geçerlidir); bekleyen yazı varsa hemen uygular. Kaldırma işlevi döner. */
  register(target: TextTarget): () => void {
    this.stack.push(target)
    const p = this.pending
    if (p) {
      this.pending = null
      target.setText(p.text)
      if (p.submit) target.submit()
    }
    return () => {
      this.stack = this.stack.filter((t) => t !== target)
    }
  }

  current(): TextTarget | null {
    return this.stack[this.stack.length - 1] ?? null
  }

  /** Hedef yoksa yazıyı bekletir; varsa uygular. Hedef bulunduysa true. */
  deliver(text: string, submit: boolean): boolean {
    const t = this.current()
    if (!t) {
      this.pending = { text, submit: submit || this.pending?.submit === true }
      return false
    }
    t.setText(text)
    if (submit) t.submit()
    return true
  }

  pendingText(): string | null {
    return this.pending?.text ?? null
  }
}

/** Uygulamanın tek yazı hedefi defteri. */
export const textTargets = new TextTargetRegistry()

/** Arama ekranı telefon klavyesinden gelen yazıyı almak için kaydolur. Kaldırma işlevini döndürür. */
export function registerTextTarget(target: TextTarget): () => void {
  return textTargets.register(target)
}

/* ───────────── Yönlendirici ───────────── */

/** Oynatıcıya giden komutlar (web/src/player `PlayerCommand`'ın bize gereken alt kümesi). */
export type PlayerRemoteCommand =
  | { type: 'KEY'; key: RemoteKey }
  | { type: 'SEEK'; positionSec: number }
  | { type: 'VOLUME'; volume: number }
  | { type: 'STOP' }

/** Oynatıcının (web/src/player `playerRemote`) bize gereken yüzü. dispatch: oynatıcı takılı değilse false. */
export interface PlayerRemoteLike {
  dispatch: (cmd: PlayerRemoteCommand) => boolean
  getState: () => unknown
}

export interface CommandDeps {
  dispatchKey: (key: RemoteKey) => boolean
  navigate: (to: string) => void
  /** Geçmişte geri (yoksa /tv) */
  back: () => void
  toast: (text: string, kind: 'info' | 'phone') => void
  /** Bağlı oynatıcı; oynatıcı yoksa null */
  player: () => PlayerRemoteLike | null
  sendCommand: (deviceId: string, cmd: RemoteCommand) => Promise<boolean>
  /** Hesaptaki cihazın adı (bildirim metni için) */
  deviceName: (deviceId: string) => string | null
  now?: () => number
}

/** Oynatıcı durumundan (NowPlaying biçimi beklenir) içerik ve güncel konum. */
export function playbackOf(state: unknown, now: number): { viewableId: string; positionSec: number } | null {
  if (!state || typeof state !== 'object') return null
  const s = state as Partial<NowPlaying>
  if (typeof s.viewableId !== 'string' || !s.viewableId) return null
  let pos = typeof s.positionSec === 'number' && Number.isFinite(s.positionSec) ? s.positionSec : 0
  if (s.paused === false && typeof s.updatedAt === 'string') {
    const at = Date.parse(s.updatedAt)
    if (Number.isFinite(at) && now > at) pos += (now - at) / 1000
  }
  if (typeof s.durationSec === 'number' && s.durationSec > 0) pos = Math.min(pos, s.durationSec)
  return { viewableId: s.viewableId, positionSec: Math.max(0, Math.floor(pos)) }
}

export interface CommandRouter {
  /** Komutu işler; işlendiyse true (deviceClient.onCommand işleyicisi olarak verilir). */
  handle: (envelope: RemoteCommandEnvelope) => boolean
}

export function createCommandRouter(deps: CommandDeps, texts: TextTargetRegistry = textTargets): CommandRouter {
  let hinted = false
  const now = deps.now ?? Date.now

  const handle = (env: RemoteCommandEnvelope): boolean => {
    const cmd = env.command
    switch (cmd.type) {
      case 'KEY': {
        if (!hinted && env.from.kind !== 'TV') {
          hinted = true
          deps.toast('Telefon kumandası bağlı', 'phone')
        }
        const p = deps.player()
        if (!p || !p.dispatch({ type: 'KEY', key: cmd.key })) deps.dispatchKey(cmd.key)
        return true
      }
      case 'TEXT': {
        if (!texts.deliver(cmd.text, cmd.submit === true)) deps.navigate('/tv/ara')
        return true
      }
      case 'CAST': {
        deps.navigate(
          watchPath(cmd.viewableId, { positionSec: cmd.positionSec, startOver: cmd.startOver, tctx: cmd.tctx }),
        )
        deps.toast(`${env.from.name} gönderdi`, 'phone')
        return true
      }
      case 'NAVIGATE': {
        if (!cmd.route.startsWith('/tv')) return false
        deps.navigate(cmd.route)
        return true
      }
      case 'SEEK':
      case 'VOLUME':
      case 'STOP': {
        const p = deps.player()
        return p ? p.dispatch(cmd) : false
      }
      case 'TRANSFER': {
        const p = deps.player()
        const playing = p ? playbackOf(p.getState(), now()) : null
        if (!p || !playing) return false
        p.dispatch({ type: 'STOP' })
        const name = deps.deviceName(cmd.toDeviceId) ?? 'Diğer cihaz'
        void deps
          .sendCommand(cmd.toDeviceId, {
            type: 'CAST',
            viewableId: playing.viewableId,
            positionSec: playing.positionSec,
          })
          .then(
            (ok) => deps.toast(ok ? `Devam ediyor: ${name}` : `Aktarılamadı: ${name}`, 'phone'),
            () => deps.toast(`Aktarılamadı: ${name}`, 'phone'),
          )
        return true
      }
    }
  }

  return { handle }
}
