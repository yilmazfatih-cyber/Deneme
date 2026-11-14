import { describe, expect, it } from 'vitest'
import type { AudioTrack, MediaStream as ManifestStream } from '../../../../shared/playback'
import { audioMime, audioTrackLabel, defaultAudioTrackOf, pickAudioStreamOf, planAudioSwitch } from './audioSelection'

function stream(id: string, profile: 'opus-webm' | 'aac-mp4', kbps: number): ManifestStream {
  const webm = profile === 'opus-webm'
  return {
    streamId: id,
    bitrateKbps: kbps,
    codecs: webm ? 'opus' : 'mp4a.40.2',
    mimeType: webm ? 'audio/webm' : 'audio/mp4',
    container: webm ? 'webm' : 'mp4',
    profile,
    sizeBytes: 1000,
    init: { start: 0, end: 10 },
    index: { start: 11, end: 20 },
    urls: [],
  }
}
const stereo: AudioTrack = {
  trackId: 'A-en-20',
  language: 'en',
  languageDescription: 'İngilizce [Özgün]',
  channels: '2.0',
  isNative: true,
  streams: [stream('a-en-128k-opus', 'opus-webm', 128)],
}
const surround: AudioTrack = {
  trackId: 'A-en-51',
  language: 'en',
  languageDescription: 'İngilizce [Özgün]',
  channels: '5.1',
  isNative: true,
  streams: [stream('a-en-384k-aac', 'aac-mp4', 384)],
}
const all = () => true
const noAac = (s: { mimeType: string }) => s.mimeType !== 'audio/mp4'

describe('ses parçası seçimi', () => {
  it('varsayılan: Türkçe → özgün → ilk; çalınamayan parça atlanır', () => {
    expect(defaultAudioTrackOf([stereo, surround], all)?.trackId).toBe('A-en-20')
    const tr: AudioTrack = { ...stereo, trackId: 'A-tr-20', language: 'tr', isNative: false }
    expect(defaultAudioTrackOf([stereo, tr], all)?.trackId).toBe('A-tr-20')
    expect(defaultAudioTrackOf([surround, stereo], noAac)?.trackId).toBe('A-en-20')
  })

  it('akış parçanın kendi profilinden seçilir (video kabından bağımsız)', () => {
    expect(pickAudioStreamOf(surround, 5000, all)?.profile).toBe('aac-mp4')
    const both: AudioTrack = { ...stereo, streams: [stream('aac', 'aac-mp4', 128), stream('opus', 'opus-webm', 128)] }
    expect(pickAudioStreamOf(both, 5000, all)?.streamId).toBe('opus') // Opus önce
    expect(pickAudioStreamOf(both, 5000, noAac)?.streamId).toBe('opus')
    expect(pickAudioStreamOf(surround, 5000, noAac)).toBeNull()
  })

  it('düşük bant genişliğinde düşük bit hızlı akış', () => {
    const t: AudioTrack = { ...stereo, streams: [stream('lo', 'opus-webm', 64), stream('hi', 'opus-webm', 256)] }
    expect(pickAudioStreamOf(t, 300, all)?.streamId).toBe('lo')
    expect(pickAudioStreamOf(t, 2000, all)?.streamId).toBe('hi')
  })

  it('değişim planı: aynı akış / aynı kodek / changeType / yeniden kur', () => {
    const o = stereo.streams[0]!
    const a = surround.streams[0]!
    expect(planAudioSwitch(audioMime(o), o, o, true)).toBe('same-stream')
    expect(planAudioSwitch(audioMime(o), o, { ...o, streamId: 'x' }, true)).toBe('same-codec')
    expect(planAudioSwitch(audioMime(o), o, a, true)).toBe('change-type')
    expect(planAudioSwitch(audioMime(o), o, a, false)).toBe('rebuild')
    expect(audioMime(a)).toBe('audio/mp4; codecs="mp4a.40.2"')
  })

  it('menü etiketi 5.1 kanalını gösterir', () => {
    expect(audioTrackLabel(surround)).toBe('İngilizce [Özgün] · 5.1')
  })
})
