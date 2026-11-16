/**
 * Eşitleme motoru: giden kutusunu sunucuya gönderir, sunucudaki değişiklikleri alır, yerel depoyu günceller.
 *
 * Kurallar:
 *  - Tek uçuş: aynı anda tek eşitleme koşar; koşarken gelen istekler işaretlenir ve tur bitince yeniden koşulur.
 *  - Çok sekme: her tur eşitleme kilidi altında koşar (lock.ts).
 *  - Döngü: sunucuda alınacak kayıt (`more`) ya da gönderilecek değişiklik kaldıkça tur yinelenir.
 *  - Hata: ağ/sunucu hatasında üstel geri çekilmeyle (syncBackoffMs) yeniden dener.
 *  - Durdurucular: 401 → oturum düşer; `upgrade_required` → "sayfayı yenileyin"; reset → kullanıcıya sorulur.
 *
 * Motor edilgendir: ne zaman eşitleneceğine `triggers.ts` karar verir (`requestSync` çağırır).
 *
 * Genişletme: yeni bir durdurucu hata kodu → `onFailure`; yeni bir bildirim → `SyncEvent` + `report`.
 */
import { isAppError, SYNC_LIMITS, syncBackoffMs, type SyncRequest, type SyncResponse } from '@uygulama/shared'
import { t } from '../../i18n/index.ts'
import { isNetworkError, NetworkError } from '../errors.ts'
import type { AppDb } from '../store/db.ts'
import { getMeta, type Rejection } from '../store/meta.ts'
import { applySyncResponse, readSyncRequest, resolveReset, type ApplyOutcome } from './apply.ts'
import { withSyncLock, type LockOptions } from './lock.ts'
import { StatusStore, type SyncStatus } from './status.ts'
import { SYNC_TIMING } from './timing.ts'

export type SyncEvent =
  | { readonly type: 'rejected'; readonly rejections: readonly Rejection[] }
  | { readonly type: 'dropped'; readonly workspaces: readonly { readonly id: string; readonly name: string }[] }
  | { readonly type: 'reset'; readonly workspaceIds: readonly string[] }
  | { readonly type: 'unauthorized' }
  | { readonly type: 'upgrade_required' }

/** `POST /api/sync`. Ağ hatasında `NetworkError`, sunucu hatasında `AppError` fırlatmalıdır. */
export type SyncSend = (request: SyncRequest, signal: AbortSignal) => Promise<SyncResponse>

/** Zamanlayıcı (test için dışarıdan verilebilir; sahte zamanlayıcı IndexedDB taklidini bozmasın diye). */
export interface Timers {
  readonly set: (callback: () => void, ms: number) => unknown
  readonly clear: (handle: unknown) => void
}

const realTimers: Timers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export interface SyncEngineOptions {
  readonly db: AppDb
  readonly send: SyncSend
  readonly onEvent?: (event: SyncEvent) => void
  readonly now?: () => Date
  readonly random?: () => number
  readonly isOnline?: () => boolean
  readonly lock?: LockOptions
  readonly timers?: Timers
}

type RoundOutcome = 'paused' | 'nothing' | ApplyOutcome

const browserOnline = () => (globalThis.navigator as Navigator | undefined)?.onLine !== false

export class SyncEngine {
  readonly status = new StatusStore()
  /** Son denemenin zamanı (epoch ms); tetikleyiciler "az önce denendi mi" diye bakar. */
  lastAttemptAt = 0

  private readonly db: AppDb
  private readonly send: SyncSend
  private readonly onEvent: (event: SyncEvent) => void
  private readonly now: () => Date
  private readonly random: () => number
  private readonly isOnline: () => boolean
  private readonly lock: LockOptions
  private readonly timers: Timers

  private running: Promise<void> | null = null
  private wantPull = false
  private wantPush = false
  private failures = 0
  private batchSize: number = SYNC_LIMITS.maxMutationsPerRequest
  private retryTimer: unknown = null
  private abort: AbortController | null = null
  private stopped = false
  private halted = false

  constructor(options: SyncEngineOptions) {
    this.db = options.db
    this.send = options.send
    this.onEvent = options.onEvent ?? (() => {})
    this.now = options.now ?? (() => new Date())
    this.random = options.random ?? Math.random
    this.isOnline = options.isOnline ?? browserOnline
    this.lock = options.lock ?? {}
    this.timers = options.timers ?? realTimers
  }

  /**
   * Eşitleme ister. `push`: gönderilecek yerel değişiklik var; `pull`: sunucuda yenilik olabilir.
   * Geri çekilme (hata sonrası bekleme) sürüyorsa bekleme bozulmaz; istek o denemede karşılanır.
   */
  requestSync(reason: 'push' | 'pull'): void {
    if (this.stopped || this.halted) return
    if (reason === 'pull') this.wantPull = true
    else this.wantPush = true
    if (this.retryTimer === null) void this.ensureRunning()
  }

  /** Hemen eşitler (beklemeyi bozar) ve motor durulunca son durumu döndürür. "Şimdi eşitle" düğmesi bunu çağırır. */
  async syncNow(): Promise<SyncStatus> {
    if (!this.stopped && !this.halted) {
      this.wantPull = true
      this.clearRetry()
      await this.ensureRunning()
    }
    return this.status.getState()
  }

  /** Reset kararını uygular (bkz. apply.ts → resolveReset) ve eşitlemeyi sürdürür. */
  async resolveReset(workspaceId: string, choice: 'push' | 'pull'): Promise<void> {
    await withSyncLock(this.db, () => resolveReset(this.db, workspaceId, choice, this.now()), this.lock)
    this.status.update({ blocked: null })
    this.requestSync('pull')
  }

  /** Motoru durdurur (çıkışta, sayfa kapanırken). Yoldaki istek iptal edilir; `start` ile sürdürülebilir. */
  stop(): void {
    this.stopped = true
    this.clearRetry()
    this.abort?.abort()
  }

  /** Durdurulmuş motoru yeniden çalışır duruma getirir (eşitlemeyi tetikleyiciler başlatır). */
  start(): void {
    this.stopped = false
  }

  private ensureRunning(): Promise<void> {
    this.running ??= this.run()
      .catch((error: unknown) => console.error('Eşitleme döngüsü beklenmedik biçimde durdu:', error))
      .finally(() => {
        this.running = null
        // Döngü çıkarken araya giren istek kaybolmasın.
        const wanted = this.wantPull || this.wantPush
        if (wanted && !this.stopped && !this.halted && this.retryTimer === null) void this.ensureRunning()
      })
    return this.running
  }

  private async run(): Promise<void> {
    for (let round = 0; round < SYNC_TIMING.maxRoundsPerRun; round++) {
      if (this.stopped || this.halted) return
      const pull = this.wantPull
      this.wantPull = false
      this.wantPush = false
      this.lastAttemptAt = this.now().getTime()
      let outcome: RoundOutcome
      try {
        outcome = await withSyncLock(this.db, () => this.round(pull), this.lock)
      } catch (error) {
        if (this.stopped) return
        this.wantPull ||= pull
        if (this.onFailure(error)) continue
        return
      }
      if (this.stopped || outcome === 'paused') return
      this.failures = 0
      this.batchSize = Math.min(SYNC_LIMITS.maxMutationsPerRequest, this.batchSize * 2)
      if (outcome !== 'nothing') {
        this.report(outcome)
        if (outcome.plan.resetWorkspaceIds.length > 0) return
        if (outcome.plan.more) this.wantPull = true
        if (outcome.pending > 0) this.wantPush = true
      }
      if (!this.wantPull && !this.wantPush) {
        this.status.update({ phase: 'idle', blocked: null, error: null, retryAt: null })
        return
      }
    }
    // Sigorta: bu kadar tur olağan değil; kısa bir aradan sonra sürdür.
    this.scheduleRetry(1000)
  }

  /** Tek gidiş-dönüş: isteği kur → gönder → yanıtı tek işlemde uygula. */
  private async round(pull: boolean): Promise<RoundOutcome> {
    if ((await getMeta(this.db, 'resetWorkspaceIds')).length > 0) {
      this.status.update({ phase: 'idle', blocked: 'reset', retryAt: null })
      return 'paused'
    }
    const request = await readSyncRequest(this.db, this.batchSize)
    if (!pull && request.mutations.length === 0) return 'nothing'
    if (!this.isOnline()) throw new NetworkError()
    this.status.update({ phase: 'syncing', retryAt: null })
    this.abort = new AbortController()
    const response = await this.send(request, this.abort.signal)
    const outcome = await applySyncResponse(this.db, response, this.now())
    if (request.mutations.length > 0 && outcome.plan.ackedMids.length === 0) {
      // Protokole göre sunucu, gönderilen her değişikliği (uygulasın ya da reddetsin) onaylar.
      throw new Error('Sunucu gönderilen değişiklikleri onaylamadı.')
    }
    return outcome
  }

  private report(outcome: ApplyOutcome): void {
    this.status.update({ everSynced: true, error: null })
    if (outcome.rejections.length > 0) this.onEvent({ type: 'rejected', rejections: outcome.rejections })
    if (outcome.dropped.length > 0) this.onEvent({ type: 'dropped', workspaces: outcome.dropped })
    if (outcome.plan.resetWorkspaceIds.length > 0) {
      this.status.update({ phase: 'idle', blocked: 'reset', retryAt: null })
      this.onEvent({ type: 'reset', workspaceIds: outcome.plan.resetWorkspaceIds })
    }
  }

  /** Hatayı değerlendirir. `true` dönerse hemen yeniden denenir (istek küçültüldü). */
  private onFailure(error: unknown): boolean {
    if (isAppError(error)) {
      if (error.code === 'unauthorized') return this.halt('unauthorized')
      if (error.code === 'upgrade_required') return this.halt('upgrade')
      if (error.code === 'payload_too_large' && this.batchSize > 1) {
        this.batchSize = Math.ceil(this.batchSize / 2)
        return true
      }
    }
    this.failures += 1
    const delay = syncBackoffMs(this.failures, this.random)
    const retryAt = this.now().getTime() + delay
    if (isNetworkError(error)) {
      this.status.update({ phase: 'offline', error: null, retryAt })
    } else {
      if (!isAppError(error)) console.error('Eşitleme hatası:', error)
      const shown = isAppError(error)
        ? { code: error.code, message: error.message }
        : { code: 'internal', message: t('error.unexpected') }
      this.status.update({ phase: 'error', error: shown, retryAt })
    }
    this.scheduleRetry(delay)
    return false
  }

  private halt(kind: 'unauthorized' | 'upgrade'): false {
    this.halted = true
    this.clearRetry()
    this.status.update({ phase: 'idle', blocked: kind, retryAt: null })
    this.onEvent({ type: kind === 'upgrade' ? 'upgrade_required' : 'unauthorized' })
    return false
  }

  private scheduleRetry(delayMs: number): void {
    this.clearRetry()
    this.retryTimer = this.timers.set(() => {
      this.retryTimer = null
      if (!this.stopped && !this.halted) void this.ensureRunning()
    }, delayMs)
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) this.timers.clear(this.retryTimer)
    this.retryTimer = null
  }
}
