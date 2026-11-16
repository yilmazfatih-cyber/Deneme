/**
 * Eşitleme durumu: motorun "şu an ne yapıyorum" bilgisi. Arayüz bunu `useSyncStatus` ile okur
 * (features/sync/SyncIndicator.tsx) ve dört duruma çevirir: çevrimdışı / eşitleniyor / eşitlendi / sorun var.
 *
 * Genişletme: yeni bir durum eklerken `SyncPhase`'e ekleyin; TypeScript onu kullanan `switch`leri gösterir.
 */

/** idle: beklemede · syncing: istek yolda · offline: ağ yok ya da sunucuya ulaşılamıyor · error: sunucu hata döndü */
export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'error'

/** Eşitlemeyi durduran, kullanıcının bir şey yapmasını gerektiren durumlar. */
export type SyncBlock = 'unauthorized' | 'upgrade' | 'reset'

export interface SyncStatus {
  readonly phase: SyncPhase
  readonly blocked: SyncBlock | null
  /** Son hata: kullanıcıya gösterilebilir Türkçe ileti. */
  readonly error: { readonly code: string; readonly message: string } | null
  /** Sıradaki kendiliğinden denemenin zamanı (epoch ms); yoksa `null`. */
  readonly retryAt: number | null
  /** Bu oturumda en az bir tur başarıyla bitti mi. */
  readonly everSynced: boolean
}

export const INITIAL_SYNC_STATUS: SyncStatus = {
  phase: 'idle',
  blocked: null,
  error: null,
  retryAt: null,
  everSynced: false,
}

/** `useSyncExternalStore` ile uyumlu küçük depo. */
export class StatusStore {
  private state: SyncStatus = INITIAL_SYNC_STATUS
  private readonly listeners = new Set<() => void>()

  getState = (): SyncStatus => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  update(patch: Partial<SyncStatus>): void {
    const next = { ...this.state, ...patch }
    const same = (Object.keys(next) as (keyof SyncStatus)[]).every((key) => next[key] === this.state[key])
    if (same) return
    this.state = next
    for (const listener of this.listeners) listener()
  }
}
