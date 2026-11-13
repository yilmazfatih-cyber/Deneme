/**
 * Ses parçası / akış seçimi (saf işlevler). Ses profili parça başına seçilir: aynı manifestte A-en-20 Opus/WebM,
 * A-en-51 AAC/MP4 olabilir; ses SourceBuffer'ı seçilen akışın kendi mimeType/codecs değeriyle kurulur (video kabından bağımsız).
 */
import type { AudioTrack, MediaStream as ManifestStream } from '../../../../shared/playback'

/** Tercih sırası: Opus/WebM, sonra AAC/MP4 */
export const AUDIO_PROFILE_ORDER = ['opus-webm', 'aac-mp4'] as const

export type Playable = (s: Pick<ManifestStream, 'mimeType' | 'codecs'>) => boolean

export function audioMime(s: Pick<ManifestStream, 'mimeType' | 'codecs'>): string {
  return `${s.mimeType}; codecs="${s.codecs}"`
}

/** Varsayılan ses parçası: Türkçe → özgün dil → ilk çalınabilir. */
export function defaultAudioTrackOf(tracks: AudioTrack[], playable: Playable): AudioTrack | null {
  const ok = tracks.filter((t) => t.streams.some(playable))
  return ok.find((t) => t.language.toLowerCase().startsWith('tr')) ?? ok.find((t) => t.isNative) ?? ok[0] ?? null
}

/** Parçanın içinden akış: tercih edilen profil, bant genişliğine göre (en az 160 kbps ya da tahminin %20'si) en yüksek. */
export function pickAudioStreamOf(track: AudioTrack, estimateKbps: number, playable: Playable): ManifestStream | null {
  const ok = track.streams.filter(playable)
  const profile = AUDIO_PROFILE_ORDER.find((p) => ok.some((s) => s.profile === p)) ?? ok[0]?.profile
  const list = ok.filter((s) => s.profile === profile).sort((a, b) => a.bitrateKbps - b.bitrateKbps)
  const budget = Math.max(160, estimateKbps * 0.2)
  let best = list[0] ?? null
  for (const s of list) if (s.bitrateKbps <= budget) best = s
  return best
}

export type AudioSwitchPlan = 'same-stream' | 'same-codec' | 'change-type' | 'rebuild'

/**
 * Parça değişiminde ses tamponuna ne yapılacağı:
 *  same-stream → yalnız etiket değişir (aynı akış) · same-codec → temizle + yeniden doldur ·
 *  change-type → SourceBuffer.changeType(yeniMime) · rebuild → ses SourceBuffer'ını kaldır, yenisini kur
 */
export function planAudioSwitch(currentMime: string | null, current: ManifestStream | null, next: ManifestStream, hasChangeType: boolean): AudioSwitchPlan {
  if (current && current.streamId === next.streamId) return 'same-stream'
  if (currentMime === null || currentMime === audioMime(next)) return 'same-codec'
  return hasChangeType ? 'change-type' : 'rebuild'
}

/** Menü etiketi: "İngilizce [Özgün] · 5.1" */
export function audioTrackLabel(t: Pick<AudioTrack, 'languageDescription' | 'channels'>): string {
  return `${t.languageDescription} · ${t.channels}`
}
