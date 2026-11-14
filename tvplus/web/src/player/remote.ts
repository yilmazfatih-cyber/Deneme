/**
 * Oynatıcının dış denetim ve durum yüzeyi (`playerRemote`). Kumanda (telefon), TV kabuğu ve cihaz istemcisi
 * oynatıcıyı yalnız buradan sürer ve izler; arayüz bileşenlerine doğrudan dokunmaz.
 *
 * - Takılı tam oynatıcı (WatchPage) kendini `attachPlayer` ile kaydeder; yoksa `dispatch` false döner.
 * - Anlık görüntü (`PlayerSnapshot`) değişmedikçe AYNI nesnedir (useSyncExternalStore ile güvenle okunur);
 *   konum tam saniyeye yuvarlanır, böylece en çok saniyede bir değişir.
 *
 * Bu dosya ana paketle gelir (index.ts dışa aktarır): React ve oynatıcı motoru içe aktarılmaz.
 */
import type { RemoteKey } from '../../../shared/devices'
import { devbus } from '../lib/devbus'

export type PlayerChrome = 'desktop' | 'mobile' | 'tv'
export type PlayerSourceKind = 'OWN_CDN' | 'PROGRESSIVE' | 'YOUTUBE'
export type PlayerSnapshotState = 'loading' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error'

export interface PlayerSnapshot {
  viewableId: string
  title: string
  subtitle: string | null
  artUrl: string | null
  live: boolean
  /** tam saniye */
  positionSec: number
  /** bilinmiyorsa (canlı) null */
  durationSec: number | null
  paused: boolean
  /** 0–100 */
  volume: number
  muted: boolean
  state: PlayerSnapshotState
  sourceKind: PlayerSourceKind | null
  chrome: PlayerChrome
}

export type PlayerCommand =
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'TOGGLE' }
  | { type: 'SEEK'; positionSec: number }
  | { type: 'SEEK_BY'; deltaSec: number }
  /** 0–100 */
  | { type: 'VOLUME'; volume: number }
  /** 0–100 ölçeğinde fark */
  | { type: 'VOLUME_BY'; delta: number }
  | { type: 'MUTE_TOGGLE' }
  /** Yer imini kaydeder ve izleme sayfasından çıkar */
  | { type: 'STOP' }
  | { type: 'KEY'; key: RemoteKey }
  | { type: 'SUBTITLES_TOGGLE' }
  /** Sonraki bölüm; canlıda sonraki kanal */
  | { type: 'NEXT' }

/** Takılı oynatıcının komut işleyicisi. */
export interface PlayerController {
  dispatch(cmd: PlayerCommand): boolean
}

/* ───────────── anlık görüntü ───────────── */

export interface SnapshotInput {
  viewableId: string
  title: string
  subtitle: string | null
  artUrl: string | null
  live: boolean
  positionSec: number
  durationSec: number | null
  state: PlayerSnapshotState
  /** 0–1 */
  volume: number
  muted: boolean
  sourceKind: PlayerSourceKind | null
  chrome: PlayerChrome
}

/** Ham oynatıcı değerlerinden kararlı (yuvarlanmış) bir anlık görüntü üretir. */
export function makeSnapshot(i: SnapshotInput): PlayerSnapshot {
  const pos = Number.isFinite(i.positionSec) ? Math.max(0, Math.floor(i.positionSec)) : 0
  const dur =
    i.durationSec !== null && Number.isFinite(i.durationSec) && i.durationSec > 0 ? Math.round(i.durationSec) : null
  const vol = Number.isFinite(i.volume) ? Math.round(Math.max(0, Math.min(1, i.volume)) * 100) : 100
  return {
    viewableId: i.viewableId,
    title: i.title,
    subtitle: i.subtitle,
    artUrl: i.artUrl,
    live: i.live,
    positionSec: pos,
    durationSec: dur,
    paused: i.state !== 'playing' && i.state !== 'buffering',
    volume: vol,
    muted: i.muted,
    state: i.state,
    sourceKind: i.sourceKind,
    chrome: i.chrome,
  }
}

const KEYS: (keyof PlayerSnapshot)[] = [
  'viewableId',
  'title',
  'subtitle',
  'artUrl',
  'live',
  'positionSec',
  'durationSec',
  'paused',
  'volume',
  'muted',
  'state',
  'sourceKind',
  'chrome',
]

export function sameSnapshot(a: PlayerSnapshot | null, b: PlayerSnapshot | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return KEYS.every((k) => a[k] === b[k])
}

/* ───────────── kayıt defteri ───────────── */

/** Bir oynatıcı kaydı; testte bağımsız örnek kurmak için dışa açıktır. */
export class PlayerRegistry {
  private controller: PlayerController | null = null
  private snapshot: PlayerSnapshot | null = null
  private readonly listeners = new Set<() => void>()

  /** Oynatıcıyı kaydeder; dönen işlev yalnız hâlâ kayıtlı olan AYNI denetleyiciyi siler. */
  attach(c: PlayerController): () => void {
    this.controller = c
    return () => {
      if (this.controller !== c) return
      this.controller = null
      this.publish(null)
    }
  }

  /** Yeni anlık görüntü; içerik aynıysa eski nesne korunur ve dinleyiciler uyarılmaz. */
  publish(next: PlayerSnapshot | null): void {
    if (sameSnapshot(this.snapshot, next)) return
    this.snapshot = next
    for (const l of this.listeners) {
      try {
        l()
      } catch {
        /* dinleyici hatası yayını durdurmaz */
      }
    }
  }

  getState(): PlayerSnapshot | null {
    return this.snapshot
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  dispatch(cmd: PlayerCommand): boolean {
    const c = this.controller
    if (!c) return false
    let ok = false
    try {
      ok = c.dispatch(cmd)
    } catch {
      ok = false
    }
    devbus.emit(
      'player',
      `komut: ${cmd.type === 'KEY' ? `KEY ${cmd.key}` : cmd.type}`,
      {
        viewableId: this.snapshot?.viewableId ?? null,
        state: this.snapshot?.state ?? null,
        positionSec: this.snapshot?.positionSec ?? null,
        command: cmd,
        handled: ok,
      },
      { ok },
    )
    return ok
  }
}

export const registry = new PlayerRegistry()

export const attachPlayer = (c: PlayerController): (() => void) => registry.attach(c)
export const publishSnapshot = (s: PlayerSnapshot | null): void => registry.publish(s)

/** Dış denetim: getState → anlık görüntü (yoksa null), subscribe → değişim bildirimi, dispatch → komut. */
export const playerRemote: {
  getState(): PlayerSnapshot | null
  subscribe(fn: () => void): () => void
  dispatch(cmd: PlayerCommand): boolean
} = {
  getState: () => registry.getState(),
  subscribe: (fn) => registry.subscribe(fn),
  dispatch: (cmd) => registry.dispatch(cmd),
}
