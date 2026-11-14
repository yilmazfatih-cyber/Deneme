/**
 * TV'de kodla giriş akışının durum makinesi (OAuth "device authorization grant"; shared/devices.ts). DOM ve React
 * yok; zamanlayıcı ve ağ dışarıdan verilir (machine.test.ts sahte zamanlayıcıyla sınar).
 *
 *   starting ──start()──▶ pending ──poll: APPROVED──▶ approved (son)
 *                           │  ├─ poll: DENIED ───▶ starting (notice: 'denied')  → yeni kod
 *                           │  ├─ poll: EXPIRED / süre doldu ─▶ starting (notice: 'expired') → yeni kod
 *                           │  └─ poll ağ hatası ─▶ pending (sonraki aralıkta yeniden)
 *   starting ──start() hata──▶ error ──5 sn──▶ starting
 */
import type { TvLoginPoll, TvLoginStart } from '../../../../shared/devices'
import type { BootContext } from '../../../../shared/types'

export type LoginNotice = 'denied' | 'expired'

export type TvLoginView =
  | { phase: 'starting'; notice: LoginNotice | null }
  | { phase: 'pending'; start: TvLoginStart; expiresAt: number; notice: LoginNotice | null }
  | { phase: 'approved'; boot: BootContext | null }
  | { phase: 'error'; message: string; notice: LoginNotice | null }

export interface TvLoginDeps {
  start: () => Promise<TvLoginStart>
  poll: (deviceCode: string) => Promise<TvLoginPoll>
  now: () => number
  setTimer: (fn: () => void, ms: number) => unknown
  clearTimer: (handle: unknown) => void
}

/** Kod alınamazsa yeniden deneme beklemesi */
export const START_RETRY_MS = 5000

export class TvLoginFlow {
  private readonly deps: TvLoginDeps
  private readonly onChange: (view: TvLoginView) => void
  private state: TvLoginView = { phase: 'starting', notice: null }
  /** Her yeni kodda artar; eski isteklerin yanıtları yok sayılır. */
  private generation = 0
  private pollTimer: unknown = null
  private expiryTimer: unknown = null
  private retryTimer: unknown = null
  private disposed = false

  constructor(deps: TvLoginDeps, onChange: (view: TvLoginView) => void) {
    this.deps = deps
    this.onChange = onChange
  }

  view(): TvLoginView {
    return this.state
  }

  /** Akışı başlatır (yeni kod ister). */
  begin(notice: LoginNotice | null = null): void {
    if (this.disposed) return
    this.clearTimers()
    const gen = ++this.generation
    this.set({ phase: 'starting', notice })
    this.deps.start().then(
      (start) => {
        if (!this.live(gen)) return
        const expiresAt = this.deps.now() + start.expiresInSec * 1000
        this.set({ phase: 'pending', start, expiresAt, notice })
        this.expiryTimer = this.deps.setTimer(() => {
          if (this.live(gen)) this.begin('expired')
        }, start.expiresInSec * 1000)
        this.schedulePoll(gen, start)
      },
      (err: unknown) => {
        if (!this.live(gen)) return
        this.set({ phase: 'error', message: err instanceof Error ? err.message : String(err), notice })
        this.retryTimer = this.deps.setTimer(() => {
          if (this.live(gen)) this.begin(notice)
        }, START_RETRY_MS)
      },
    )
  }

  /** Bileşen kalkınca: zamanlayıcıları durdurur, gelen yanıtları yok sayar. */
  dispose(): void {
    this.disposed = true
    this.generation++
    this.clearTimers()
  }

  private live(gen: number): boolean {
    return !this.disposed && gen === this.generation
  }

  private schedulePoll(gen: number, start: TvLoginStart): void {
    const ms = Math.max(1, start.intervalSec) * 1000
    this.pollTimer = this.deps.setTimer(() => this.pollOnce(gen, start), ms)
  }

  private pollOnce(gen: number, start: TvLoginStart): void {
    if (!this.live(gen)) return
    const s = this.state
    if (s.phase === 'pending' && this.deps.now() >= s.expiresAt) {
      this.begin('expired')
      return
    }
    this.deps.poll(start.deviceCode).then(
      (res) => {
        if (!this.live(gen)) return
        switch (res.status) {
          case 'PENDING':
            this.schedulePoll(gen, start)
            return
          case 'APPROVED':
            this.clearTimers()
            this.generation++
            this.set({ phase: 'approved', boot: res.boot ?? null })
            return
          case 'DENIED':
            this.begin('denied')
            return
          case 'EXPIRED':
            this.begin('expired')
            return
        }
      },
      () => {
        // Ağ hatası: kod hâlâ geçerli olabilir, sonraki aralıkta yeniden sor.
        if (this.live(gen)) this.schedulePoll(gen, start)
      },
    )
  }

  private set(view: TvLoginView): void {
    this.state = view
    this.onChange(view)
  }

  private clearTimers(): void {
    for (const t of [this.pollTimer, this.expiryTimer, this.retryTimer]) if (t !== null) this.deps.clearTimer(t)
    this.pollTimer = this.expiryTimer = this.retryTimer = null
  }
}
