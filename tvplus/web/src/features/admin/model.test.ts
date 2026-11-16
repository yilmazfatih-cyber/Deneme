import { describe, expect, it } from 'vitest'
import type { ViewerInsight, ViewerSegment } from '../../../../shared/intelligence'
import { retryAfterOf, unlockFailure } from '../../app/admin'
import {
  artworkMode,
  barWidth,
  candidateStats,
  decisionMargin,
  decisionSteps,
  pct,
  personalRowCount,
  runLine,
  searchFeatureLabel,
  shareOf,
  shortDateTime,
  statusCopy,
  watchTime,
} from './model'
import { safeNext } from './Unlock'

const HISTORY: ViewerInsight['history'] = {
  titles: 6,
  engagedTitles: 4,
  hours: 2.5,
  plays: 9,
  firstTs: 1,
  lastTs: 2,
  top: [],
}

const SEGMENT: ViewerSegment = {
  communityId: 'tc_03',
  name: 'Doğa ve Bilim Belgeselleri',
  similarity: 0.72,
  inRun: false,
  size: 140,
  share: 0.12,
  traits: [],
  why: [],
  drivers: [],
  alternatives: [
    { communityId: 'tc_01', name: 'Kısa Animasyonlar', similarity: 0.58 },
    { communityId: 'tc_05', name: 'Klasikler', similarity: 0.31 },
  ],
  picks: [],
}

const INSIGHT = {
  history: HISTORY,
  run: {
    runId: 'cr_1',
    computedAt: '2026-11-15T09:40:00.000Z',
    viewers: 1200,
    k: 8,
    iterations: 12,
    seed: 1,
    featureCount: 96,
    silhouette: 0.314,
    sources: ['SYNTHETIC', 'TVPLUS'],
  },
} as unknown as ViewerInsight

describe('yüzde ve çubuk ölçüleri', () => {
  it('pct: yuvarlar, sınırlar, çok küçük payı "<%1" yazar', () => {
    expect(pct(0.724)).toBe('%72')
    expect(pct(0)).toBe('%0')
    expect(pct(0.004)).toBe('<%1')
    expect(pct(1.4)).toBe('%100')
    expect(pct(Number.NaN)).toBe('%0')
  })

  it('shareOf: katkının benzerlikteki payı; benzerlik ya da katkı yoksa 0', () => {
    expect(shareOf(0.18, 0.72)).toBeCloseTo(0.25)
    expect(shareOf(0.9, 0.72)).toBe(1)
    expect(shareOf(0.2, 0)).toBe(0)
    expect(shareOf(-0.1, 0.72)).toBe(0)
  })

  it('barWidth: en büyüğe göre; görünür en küçük genişlik %4', () => {
    expect(barWidth(0.5, 1)).toBe(50)
    expect(barWidth(1, 1)).toBe(100)
    expect(barWidth(0.001, 1)).toBe(4)
    expect(barWidth(0, 1)).toBe(0)
    expect(barWidth(1, 0)).toBe(0)
  })
})

describe('süre, tarih ve adlar', () => {
  it('watchTime: bir saatin altı dakika, üstü saat ve dakika', () => {
    expect(watchTime(0)).toBe('0 dk')
    expect(watchTime(0.005)).toBe('<1 dk')
    expect(watchTime(1 / 3)).toBe('20 dk')
    expect(watchTime(1)).toBe('1 sa')
    expect(watchTime(3.08)).toBe('3 sa 5 dk')
    expect(watchTime(Number.NaN)).toBe('0 dk')
  })

  it('shortDateTime: gün, ay, saat; yıl yalnız farklıysa', () => {
    const now = new Date(2026, 10, 15, 14, 0).getTime()
    expect(shortDateTime(new Date(2026, 10, 15, 13, 5).getTime(), now)).toBe('15 Kas 13:05')
    expect(shortDateTime(new Date(2025, 0, 2, 9, 30).getTime(), now)).toBe('2 Oca 2025 09:30')
    expect(shortDateTime('bozuk', now)).toBe('—')
  })

  it('searchFeatureLabel: bilinen anahtarlar okunur ada çevrilir, bilinmeyen olduğu gibi kalır', () => {
    expect(searchFeatureLabel('begeni')).toBe('Zevkine benzerlik')
    expect(searchFeatureLabel('tiklanma')).toBe('Bu aramada tıklanma')
    expect(searchFeatureLabel('yeni-ozellik')).toBe('yeni-ozellik')
  })
})

describe('segment metinleri', () => {
  it('statusCopy: atanmışsa yok; diğer durumlarda başlık ve açıklama', () => {
    expect(statusCopy('ASSIGNED', HISTORY)).toBeNull()
    expect(statusCopy('NO_HISTORY', HISTORY)?.title).toBe('Henüz bir segmentin yok')
    expect(statusCopy('THIN_HISTORY', HISTORY)?.body).toContain('6 başlık')
    expect(statusCopy('THIN_HISTORY', HISTORY)?.body).toContain('yalnız 4 tanesi')
    expect(statusCopy('THIN_HISTORY', { ...HISTORY, engagedTitles: 0 })?.body).toContain('hiçbiri')
    expect(statusCopy('NO_MODEL', HISTORY)?.title).toBe('Topluluklar henüz hesaplanmadı')
  })

  it('decisionSteps: izlenen başlık, topluluk sayısı, benzerlik ve üyelik durumu', () => {
    const steps = decisionSteps(INSIGHT, SEGMENT)
    expect(steps).toHaveLength(4)
    expect(steps[0]).toContain('4 başlıktan')
    expect(steps[0]).toContain('96 özellik')
    expect(steps[1]).toContain('8 topluluğun')
    expect(steps[2]).toContain('%72')
    expect(steps[2]).toContain('%58')
    expect(steps[3]).toContain('sonra izlediklerine göre')
    expect(decisionSteps(INSIGHT, { ...SEGMENT, inRun: true })[3]).toContain('üyesiydin')
  })

  it('decisionMargin: fark 0,10 ve üstüyse net; adayı yoksa yok', () => {
    expect(decisionMargin(SEGMENT)).toEqual({ label: 'Net karar', tone: 'clear' })
    expect(decisionMargin({ ...SEGMENT, alternatives: [{ communityId: 'x', name: 'x', similarity: 0.69 }] })).toEqual({
      label: 'Sıradaki adaya yakın',
      tone: 'close',
    })
    expect(decisionMargin({ ...SEGMENT, alternatives: [] })).toBeNull()
  })

  it('runLine: tarih, izleyici, topluluk, siluet ve kaynaklar; hesap yoksa null', () => {
    const line = runLine(INSIGHT.run, () => '15 Kas 12:40')
    expect(line).toBe(
      '15 Kas 12:40 · 1.200 izleyici · 8 topluluk · siluet 0,31 · kaynak: örnek veri, uygulama içi izleme',
    )
    expect(runLine(null, () => '')).toBeNull()
  })

  it('personalRowCount', () => {
    const rows = [
      { context: 'gems', title: 'a', basis: '', personal: true, size: 3 },
      { context: 'top10', title: 'b', basis: '', personal: false, size: 10 },
    ]
    expect(personalRowCount(rows)).toEqual({ personal: 1, total: 2 })
  })
})

describe('yönetici girişi', () => {
  it('unlockFailure: sunucu kodlarını arayüz sonucuna çevirir', () => {
    expect(unlockFailure('ADMIN_CODE_INVALID', '')).toMatchObject({ ok: false, code: 'INVALID' })
    expect(unlockFailure('ADMIN_LOCKED', 'Çok fazla deneme. 41 sn sonra yeniden dene.')).toMatchObject({
      code: 'LOCKED',
      retryAfterSec: 41,
    })
    expect(unlockFailure('HTTP_429', '')).toMatchObject({ code: 'LOCKED', retryAfterSec: 60 })
    expect(unlockFailure('ADMIN_DISABLED', '')).toMatchObject({ code: 'DISABLED' })
    expect(unlockFailure(null, '')).toMatchObject({ code: 'ERROR' })
    expect(retryAfterOf('12 sn')).toBe(12)
  })

  it('safeNext: yalnız uygulama içi yol; yönetici sayfasına döngü yok', () => {
    expect(safeNext('/studyo/topluluklar')).toBe('/studyo/topluluklar')
    expect(safeNext('//kotu.example')).toBeNull()
    expect(safeNext('https://kotu.example')).toBeNull()
    expect(safeNext('/yonetici')).toBeNull()
    expect(safeNext(null)).toBeNull()
  })
})

describe('afiş seçimi', () => {
  it('artworkMode: kipin okunur adı ve tonu', () => {
    expect(artworkMode('PERSONAL')).toEqual({ label: 'Zevkine göre', tone: 'personal' })
    expect(artworkMode('EXPLORE')).toEqual({ label: 'Keşif denemesi', tone: 'close' })
    expect(artworkMode('DEFAULT')).toEqual({ label: 'Varsayılan', tone: 'common' })
  })

  it('candidateStats: gösterim, tıklama ve oran; gösterim yoksa söyler', () => {
    expect(candidateStats(0, 0)).toBe('henüz gösterilmedi')
    expect(candidateStats(12, 3)).toBe('12 gösterim · 3 tıklama (%25)')
    expect(candidateStats(1200, 30)).toBe('1.200 gösterim · 30 tıklama (%3)')
    expect(candidateStats(2, 5)).toBe('2 gösterim · 5 tıklama (%100)')
  })
})
