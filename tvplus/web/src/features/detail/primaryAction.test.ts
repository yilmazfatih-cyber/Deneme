import { describe, expect, it } from 'vitest'
import { primaryActionOf, type DetailActionInput } from './primaryAction'

const PLAYABLE = { state: 'PLAYABLE', reasonText: null }
const base: DetailActionInput = { typename: 'Movie', videoId: 80010001, access: PLAYABLE, bookmark: null, runtimeSec: 888, currentEpisode: null, tctx: 't' }

describe('detay birincil eylemi', () => {
  it('izlenmemiş film → İzle', () => {
    const a = primaryActionOf(base)
    expect(a).toMatchObject({ kind: 'play', label: 'İzle', to: '/izle/Video:80010001?tctx=t', playVideoId: 80010001, restartTo: null })
  })

  it('yarım kalmış film → Devam et (kalan süre) + Baştan başlat', () => {
    const a = primaryActionOf({ ...base, bookmark: { positionSec: 288, runtimeSec: 888, progress: 0.32 } })
    expect(a).toMatchObject({ kind: 'resume', label: 'Devam et', hint: '10 dk kaldı', restartTo: '/izle/Video:80010001?tctx=t&baslat=bastan' })
  })

  it('neredeyse bitmiş film yeniden İzle olur', () => {
    expect(primaryActionOf({ ...base, bookmark: { positionSec: 880, runtimeSec: 888, progress: 0.99 } }).kind).toBe('play')
  })

  it('dizi: sıradaki bölüm oynatılır, ipucu bölüm etiketi', () => {
    const show: DetailActionInput = { ...base, typename: 'Show', videoId: 80047000, currentEpisode: { videoId: 80047102, numberLabel: 'S1 B2', runtimeSec: 4200, bookmark: null } }
    expect(primaryActionOf(show)).toMatchObject({ kind: 'play', playVideoId: 80047102, hint: 'S1 B2', to: '/izle/Video:80047102?tctx=t' })
    const resumed = primaryActionOf({ ...show, currentEpisode: { videoId: 80047102, numberLabel: 'S1 B2', runtimeSec: 4200, bookmark: { positionSec: 2820, progress: 0.67 } } })
    expect(resumed).toMatchObject({ kind: 'resume', hint: 'S1 B2 · 23 dk kaldı' })
    expect(primaryActionOf({ ...show, currentEpisode: null }).kind).toBe('unavailable')
  })

  it('UPSELL → Paketi incele (paket adıyla), oynatma bağlantısı yok', () => {
    const a = primaryActionOf({ ...base, access: { state: 'UPSELL', reasonText: 'Sinema Paketi ile izlenir', requiredProduct: 'sinema-paketi', requiredProductName: 'Sinema Paketi' } })
    expect(a).toEqual({ kind: 'upsell', label: 'Paketi incele', productName: 'Sinema Paketi', reasonText: 'Sinema Paketi ile izlenir' })
  })

  it('diğer yetki durumları → Benzerlerini gör + gerekçe', () => {
    for (const state of ['DEVICE_RESTRICTED', 'OUT_OF_WINDOW', 'BLOCKED']) {
      expect(primaryActionOf({ ...base, access: { state, reasonText: 'Evdeki TV+ kutunda izlenir' } })).toEqual({ kind: 'unavailable', label: 'Benzerlerini gör', reasonText: 'Evdeki TV+ kutunda izlenir' })
    }
  })
})
