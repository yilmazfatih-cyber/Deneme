/**
 * Yetenek bildirimi: bu tarayıcı hangi kodek profillerini MSE ile çözebiliyor (tercih sırasıyla).
 * Önce VP9/WebM (Chromium'un her sürümünde var), sonra H.264/MP4; ses için Opus/WebM, sonra AAC/MP4.
 */
import type { CodecProfile, MediaStream as ManifestStream } from '../../../../shared/playback'

const PROBES: [CodecProfile, string][] = [
  ['vp9-webm', 'video/webm; codecs="vp09.00.10.08"'],
  ['h264-mp4', 'video/mp4; codecs="avc1.4d401f"'],
  ['opus-webm', 'audio/webm; codecs="opus"'],
  ['aac-mp4', 'audio/mp4; codecs="mp4a.40.2"'],
]

type ManagedWindow = Window & { ManagedMediaSource?: typeof MediaSource }

/**
 * MSE sınıfı. Klasik `MediaSource` varsa o (Chromium, Firefox, masaüstü Safari — davranış değişmez); yoksa iOS 17.1+
 * Safari'nin `ManagedMediaSource`'u yedek olarak kullanılır (iPhone'da klasik MSE yoktur). `isTypeSupported` de bu
 * sınıftan sorulur.
 */
export function mediaSourceCtor(): typeof MediaSource | null {
  if (typeof window === 'undefined') return null
  return window.MediaSource ?? (window as ManagedWindow).ManagedMediaSource ?? null
}

/** Kullanılan sınıf ManagedMediaSource mı (tarayıcı akışı startstreaming/endstreaming ile yönetir, tamponu kendisi boşaltabilir). */
export function usesManagedMediaSource(): boolean {
  if (typeof window === 'undefined') return false
  const managed = (window as ManagedWindow).ManagedMediaSource
  return !window.MediaSource && !!managed
}

export function supportsMse(): boolean {
  return mediaSourceCtor() !== null
}

let cached: CodecProfile[] | null = null

/** Yalnız testler: profil önbelleğini sıfırlar. */
export function resetCapabilitiesCache(): void {
  cached = null
}

/** Çözülebilen profiller. MSE yoksa <video>.canPlayType ile (tek dosya oynatımı için) bakılır. */
export function supportedProfiles(): CodecProfile[] {
  if (cached) return cached
  const MS = mediaSourceCtor()
  const out: CodecProfile[] = []
  for (const [profile, type] of PROBES) {
    let ok = false
    try {
      if (MS) ok = MS.isTypeSupported(type)
      else if (typeof document !== 'undefined') ok = document.createElement('video').canPlayType(type) !== ''
    } catch {
      ok = false
    }
    if (ok) out.push(profile)
  }
  cached = out
  return out
}

export function streamMime(s: Pick<ManifestStream, 'mimeType' | 'codecs'>): string {
  return `${s.mimeType}; codecs="${s.codecs}"`
}

/** Manifestteki bir akış bu tarayıcıda MSE ile çözülebilir mi? */
export function isStreamPlayable(s: Pick<ManifestStream, 'mimeType' | 'codecs'>): boolean {
  const MS = mediaSourceCtor()
  if (!MS) return false
  try {
    return MS.isTypeSupported(streamMime(s))
  } catch {
    return false
  }
}

/** browsername / browserversion (Netflix sorgu dizgesindeki gibi). */
export function browserInfo(): { name: string; version: string } {
  if (typeof navigator === 'undefined') return { name: 'unknown', version: '0' }
  const ua = navigator.userAgent
  const pick = (re: RegExp) => re.exec(ua)?.[1]
  const edge = pick(/Edg\/([\d.]+)/)
  if (edge) return { name: 'edge', version: edge }
  const ff = pick(/Firefox\/([\d.]+)/)
  if (ff) return { name: 'firefox', version: ff }
  const chrome = pick(/Chrome\/([\d.]+)/)
  if (chrome) return { name: 'chrome', version: chrome }
  const safari = pick(/Version\/([\d.]+).*Safari/)
  if (safari) return { name: 'safari', version: safari }
  return { name: 'unknown', version: '0' }
}
