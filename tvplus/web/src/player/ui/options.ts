/**
 * İzleme sayfasının adres seçenekleri ve başlangıç konumu kararı (saf mantık).
 *   #/izle/:viewableId?tctx=…&baslat=bastan&kaynak=OWN_CDN|YOUTUBE&konum=<sn>
 * `konum`: yansıtma / oturum devri için başlangıç saniyesi; yer iminin önüne geçer (doğrusal kanalda yok sayılır).
 */
import type { LicensedManifest } from '../../../../shared/playback'

export type Source = 'OWN_CDN' | 'YOUTUBE'

export interface WatchOptions {
  tctx: string | null
  fromStart: boolean
  kaynak: Source | null
  /** Başlangıç konumu (sn) ya da null */
  konumSec: number | null
}

export function parseWatchOptions(sp: URLSearchParams): WatchOptions {
  const k = sp.get('kaynak')
  return {
    tctx: sp.get('tctx'),
    fromStart: sp.get('baslat') === 'bastan',
    kaynak: k === 'OWN_CDN' || k === 'YOUTUBE' ? k : null,
    konumSec: parseKonum(sp.get('konum')),
  }
}

/** "120" → 120 · "95.5" → 95.5 · "1:02:05" → 3725 · geçersiz / negatif → null */
export function parseKonum(raw: string | null): number | null {
  if (raw === null) return null
  const v = raw.trim()
  if (!v) return null
  if (/^\d+(\.\d+)?$/.test(v)) {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  if (/^\d+(:\d{1,2}){1,2}$/.test(v)) {
    const parts = v.split(':').map(Number)
    if (parts.slice(1).some((p) => p >= 60)) return null
    return parts.reduce((acc, p) => acc * 60 + p, 0)
  }
  return null
}

/** Başlangıç konumu kararının girdileri (manifest ve PlaybackMetadata'nın ilgili alanları). */
export interface StartInput {
  manifest: Pick<LicensedManifest, 'live' | 'bookmark' | 'durationMs' | 'kind'> & { startSec?: number }
  /** PlaybackMetadata.bookmark.positionSec */
  metaBookmarkSec: number | null
  /** PlaybackMetadata.video.runtimeSec */
  runtimeSec: number | null
  fromStart: boolean
  /** Kaynak değişiminden kalan konum */
  hintSec: number | null
  /** Adresteki konum */
  konumSec: number | null
  /** Doğrusal kanal mı (Channel:*) */
  linearChannel: boolean
}

/**
 * Sıra: kaynak değişimi → adresteki konum → canlıda katılma noktası → baştan → yer imi → gömmenin başlangıcı → 0.
 * `resumed`: yer iminden mi sürüyor ("Baştan başlat" çipi buna göre görünür).
 */
export function startPosition(i: StartInput): { sec: number; resumed: boolean } {
  const m = i.manifest
  if (i.hintSec !== null) return { sec: i.hintSec, resumed: false }
  const dur = m.durationMs ? m.durationMs / 1000 : (i.runtimeSec ?? 0)
  if (i.konumSec !== null && !i.linearChannel && (!m.live || m.live.seekable)) {
    const sec = dur > 0 ? Math.min(i.konumSec, Math.max(0, dur - 1)) : i.konumSec
    return { sec: Math.max(0, sec), resumed: false }
  }
  if (m.live) return { sec: m.live.joinOffsetMs / 1000, resumed: false }
  if (i.fromStart) return { sec: 0, resumed: false }
  // Devam konumu PlaybackMetadata'dan (her istekte taze); manifest.bookmark yalnızca yedek
  const bm = i.metaBookmarkSec ?? (m.bookmark ? m.bookmark.positionMs / 1000 : 0)
  if (bm > 5 && (!dur || bm < dur - 10)) return { sec: bm, resumed: true }
  if (m.kind === 'EXTERNAL_EMBED' && m.startSec) return { sec: m.startSec, resumed: false }
  return { sec: 0, resumed: false }
}
