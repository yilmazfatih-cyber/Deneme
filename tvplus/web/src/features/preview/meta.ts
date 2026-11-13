/**
 * Kart ve önizleme meta satırı için saf yardımcılar: oynatma rozetleri, kaynak adı, kalan süre, yetki metni.
 */
import type { AccessData, BookmarkData, SourceKindName } from './types'

/** Oynatma rozetleri → kısa etiketler (tekrarsız, sabit sıra). */
export function playbackBadgeLabels(badges: readonly string[]): string[] {
  const out: string[] = []
  const has = (b: string) => badges.includes(b)
  if (has('VIDEO_ULTRA_HD')) out.push('4K')
  else if (has('VIDEO_HD')) out.push('HD')
  if (has('AUDIO_FIVE_DOT_ONE')) out.push('5.1')
  if (has('TEXT_SUBTITLES') || has('TEXT_CLOSED_CAPTIONS')) out.push('Altyazı')
  return out
}

const SOURCE_LABELS: Record<SourceKindName, string> = {
  OWN_CDN: "Kendi CDN'imiz",
  YOUTUBE: 'YouTube',
  PROGRESSIVE: 'Tek dosya',
}

/** Kaynak türleri (ya da SOURCE_* rozetleri) → okunur adlar. */
export function sourceLabels(kinds: readonly string[]): string[] {
  const out: string[] = []
  for (const raw of kinds) {
    const k = (raw.startsWith('SOURCE_') ? raw.slice(7) : raw) as SourceKindName
    const label = SOURCE_LABELS[k]
    if (label && !out.includes(label)) out.push(label)
  }
  return out
}

/** Kalan süre: "23 dk kaldı" / "1 sa 5 dk kaldı"; bilinmiyorsa null. */
export function remainingText(positionSec: number | null | undefined, runtimeSec: number | null | undefined): string | null {
  if (!runtimeSec || runtimeSec <= 0 || positionSec == null) return null
  const m = Math.max(1, Math.round((runtimeSec - positionSec) / 60))
  if (runtimeSec - positionSec <= 0) return null
  if (m < 60) return `${m} dk kaldı`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h} sa ${r} dk kaldı` : `${h} sa kaldı`
}

/** Yarım kalmış mı? (başlamış ve bitmemiş) */
export function isInProgress(bookmark: Pick<BookmarkData, 'positionSec' | 'progress'> | null | undefined): boolean {
  return !!bookmark && bookmark.positionSec > 0 && bookmark.progress < 0.95
}

/** Pakette yoksa karttaki tek satır ("Sinema Paketi ile"); oynatılabiliyorsa null. */
export function lockedTextOf(access: Pick<AccessData, 'state' | 'reasonText'> | null | undefined, fallback?: string | null): string | null {
  if (!access || access.state === 'PLAYABLE') return null
  return access.reasonText ?? fallback ?? 'Paketinde yok'
}

/** Kart rozeti: kilitliyse rozet gösterilmez (kart başına tek işaret). LOCKED türü rozet değildir. */
export function badgeTextOf(badge: { kind: string; text: string } | null | undefined, locked: boolean): string | null {
  if (!badge || locked || badge.kind === 'LOCKED' || badge.kind === 'TOP10') return null
  return badge.text
}

/** Ekran okuyucu ve görünür meta için kısa satır: "2024 · 1 sa 28 dk" */
export function joinMeta(parts: (string | number | null | undefined | false)[]): string {
  return parts.filter((p) => p !== null && p !== undefined && p !== false && p !== '').join(' · ')
}
