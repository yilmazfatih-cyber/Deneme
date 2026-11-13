/**
 * Komut kuyruğu: kumandadan giden komutlar SIRAYLA yollanır (ok tuşu yinelemesi TV'ye aynı sırayla varır).
 * Henüz yollanmamış SEEK / VOLUME / TEXT komutları yenisiyle değiştirilir (sürgü sürüklerken ya da yazarken araya
 * eski değerler girmez). Saf mantık (birim testi: sender.test.ts).
 */
import type { RemoteCommand } from '../../../shared/devices'

export type SendResult = 'delivered' | 'undelivered' | 'error'

export interface CommandQueueDeps {
  send: (deviceId: string, cmd: RemoteCommand) => Promise<boolean>
  /** Her komutun sonucu (arayüz geri bildirimi için) */
  onResult?: (cmd: RemoteCommand, result: SendResult, error?: unknown) => void
}

interface Pending {
  deviceId: string
  cmd: RemoteCommand
  resolve: (r: SendResult) => void
}

/** Aynı türden bekleyen komutun yerine geçen türler */
const COALESCE: ReadonlySet<RemoteCommand['type']> = new Set(['SEEK', 'VOLUME', 'TEXT'])
/** Kuyrukta bu kadardan fazla tuş birikirse (TV yanıt vermiyor) en eskileri atılır. */
export const MAX_QUEUE = 12

export class CommandQueue {
  private queue: Pending[] = []
  private busy = false
  private readonly deps: CommandQueueDeps

  constructor(deps: CommandQueueDeps) {
    this.deps = deps
  }

  get size(): number {
    return this.queue.length + (this.busy ? 1 : 0)
  }

  enqueue(deviceId: string, cmd: RemoteCommand): Promise<SendResult> {
    return new Promise<SendResult>((resolve) => {
      if (COALESCE.has(cmd.type)) {
        const i = this.queue.findIndex((p) => p.deviceId === deviceId && p.cmd.type === cmd.type)
        if (i >= 0) {
          const old = this.queue[i]!
          // TEXT'te submit kaybolmasın
          const merged =
            cmd.type === 'TEXT' && old.cmd.type === 'TEXT' && old.cmd.submit ? { ...cmd, submit: true } : cmd
          this.queue[i] = { deviceId, cmd: merged, resolve }
          old.resolve('delivered')
          return
        }
      }
      this.queue.push({ deviceId, cmd, resolve })
      while (this.queue.length > MAX_QUEUE) this.queue.shift()?.resolve('undelivered')
      void this.pump()
    })
  }

  /** Bekleyenleri bırakır (hedef değişince). */
  clear(): void {
    const q = this.queue
    this.queue = []
    for (const p of q) p.resolve('undelivered')
  }

  private async pump(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      for (let next = this.queue.shift(); next; next = this.queue.shift()) {
        let result: SendResult
        let error: unknown
        try {
          result = (await this.deps.send(next.deviceId, next.cmd)) ? 'delivered' : 'undelivered'
        } catch (err) {
          result = 'error'
          error = err
        }
        this.deps.onResult?.(next.cmd, result, error)
        next.resolve(result)
      }
    } finally {
      this.busy = false
    }
  }
}
