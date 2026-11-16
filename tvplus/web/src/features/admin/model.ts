/**
 * Yönetici Paneli'nin saf yardımcıları: içgörü yanıtını (shared/intelligence.ts → ViewerInsight) okunur metne ve
 * çubuk ölçülerine çevirir. Arayüz bileşenleri yalnız çizer; kararlar burada ve birim testlidir.
 */
import type {
  ArtworkInsight,
  ClusteringRun,
  CommunityFeature,
  SegmentStatus,
  ViewerInsight,
  ViewerSegment,
  ViewingSource,
} from '../../../../shared/intelligence'

export const KIND_LABEL: Record<CommunityFeature['kind'], string> = {
  GENRE: 'Tür',
  MICROGENRE: 'Alt tür',
  DESCRIPTOR: 'Niteleyici',
  FACET: 'Etiket',
}

const SOURCE_LABEL: Record<ViewingSource, string> = {
  SYNTHETIC: 'örnek veri',
  MIXPANEL: 'Mixpanel',
  TVPLUS: 'uygulama içi izleme',
}

/** Arama sıralama modelinin özellik adları (sunucudaki anahtar → okunur ad) */
const SEARCH_FEATURE_LABEL: Record<string, string> = {
  metin: 'Metin eşleşmesi',
  begeni: 'Zevkine benzerlik',
  populerlik: 'Popülerlik',
  tiklanma: 'Bu aramada tıklanma',
  yenilik: 'Yenilik',
  devam: 'Yarım kalmış olması',
}
export const searchFeatureLabel = (name: string): string => SEARCH_FEATURE_LABEL[name] ?? name

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'] as const

/** İzleme süresi: bir saatin altı dakika olarak ("20 dk"), üstü saat ve dakika ("3 sa 5 dk"). */
export function watchTime(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return '0 dk'
  const minutes = Math.round(hours * 60)
  if (minutes < 1) return '<1 dk'
  if (minutes < 60) return `${minutes} dk`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h.toLocaleString('tr-TR')} sa ${m} dk` : `${h.toLocaleString('tr-TR')} sa`
}

/** Kısa tarih ve saat: "15 Kas 13:35"; yıl bugünkünden farklıysa eklenir (tarayıcı saatine göre). */
export function shortDateTime(v: string | number, now: number = Date.now()): string {
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  const year = d.getFullYear() === new Date(now).getFullYear() ? '' : ` ${d.getFullYear()}`
  const clock = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year} ${clock}`
}

const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0)

/** 0–1 oranı "%72" yapar (yuvarlanmış; 0'dan büyük ama 1'in altındaysa "<%1"). */
export function pct(share: number): string {
  const v = clamp01(share) * 100
  if (v > 0 && v < 1) return '<%1'
  return `%${Math.round(v)}`
}

/** Bir katkının kararın tamamındaki payı (0–1). Benzerlik 0 ise 0. */
export function shareOf(contribution: number, similarity: number): number {
  if (!(similarity > 0) || !(contribution > 0)) return 0
  return clamp01(contribution / similarity)
}

/** Çubuk genişliği: listedeki en büyük değere göre (en büyük = %100); görünür olsun diye en az %4. */
export function barWidth(value: number, max: number): number {
  if (!(max > 0) || !(value > 0)) return 0
  return Math.max(4, Math.round(clamp01(value / max) * 100))
}

/** Segment yokken gösterilen başlık ve açıklama. */
export function statusCopy(
  status: SegmentStatus,
  history: ViewerInsight['history'],
): { title: string; body: string } | null {
  switch (status) {
    case 'ASSIGNED':
      return null
    case 'NO_HISTORY':
      return {
        title: 'Henüz bir segmentin yok',
        body: 'Bu profilin izleme kaydı yok. Bir şeyler izleyince sistem seni izlediklerine en yakın topluluğa yerleştirir; o zamana dek öneriler popülerliğe ve genel kurallara dayanır.',
      }
    case 'THIN_HISTORY':
      return {
        title: 'Karar için henüz yeterli izleme yok',
        body: `Bu profilde ${history.titles} başlık için kayıt var ama ${history.engagedTitles === 0 ? 'hiçbiri' : `yalnız ${history.engagedTitles} tanesi`} ilgi eşiğini geçiyor. Biraz daha izleyince segment belirlenir.`,
      }
    case 'NO_MODEL':
      return {
        title: 'Topluluklar henüz hesaplanmadı',
        body: 'İzleme verisinden topluluk hesabı arka planda yapılır. İlk açılışta bu yaklaşık yarım dakika sürer; sonra bu sayfayı yenile.',
      }
  }
}

/** "Sistem nasıl karar verdi?" adımları (kısa, sırayla). */
export function decisionSteps(insight: ViewerInsight, segment: ViewerSegment): string[] {
  const h = insight.history
  const k = insight.run?.k ?? 0
  const features = insight.run?.featureCount ?? 0
  return [
    `İzlediğin ${h.engagedTitles} başlıktan bir zevk profili çıkarıldı${features ? ` (${features} özellik: tür, alt tür, niteleyici, etiket)` : ''}.`,
    k > 0
      ? `Profilin ${k} topluluğun merkeziyle karşılaştırıldı.`
      : 'Profilin toplulukların merkezleriyle karşılaştırıldı.',
    `En yakın topluluk seçildi: benzerlik ${pct(segment.similarity)}${
      segment.alternatives[0] ? `, sıradaki aday ${pct(segment.alternatives[0].similarity)}` : ''
    }.`,
    segment.inRun
      ? 'Son topluluk hesabında bu topluluğun üyesiydin.'
      : 'Son topluluk hesabından sonra izlediklerine göre en yakın topluluğa yerleştin; bir sonraki hesapta üyeliğin kesinleşir.',
  ]
}

/** Kararın ne kadar net olduğu: seçilen ile sıradaki aday arasındaki fark. */
export function decisionMargin(segment: ViewerSegment): { label: string; tone: 'clear' | 'close' } | null {
  const next = segment.alternatives[0]
  if (!next) return null
  const gap = segment.similarity - next.similarity
  if (gap >= 0.1) return { label: 'Net karar', tone: 'clear' }
  return { label: 'Sıradaki adaya yakın', tone: 'close' }
}

/** Hesabın künyesi: "15 Kas 12:40 · 1.200 izleyici · 8 topluluk · siluet 0,31 · kaynak: örnek veri" */
export function runLine(run: ClusteringRun | null, fmtDateTime: (v: string) => string): string | null {
  if (!run) return null
  const parts = [
    fmtDateTime(run.computedAt),
    `${run.viewers.toLocaleString('tr-TR')} izleyici`,
    `${run.k} topluluk`,
    run.silhouette !== null ? `siluet ${run.silhouette.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}` : null,
    run.sources.length ? `kaynak: ${run.sources.map((s) => SOURCE_LABEL[s] ?? s).join(', ')}` : null,
  ]
  return parts.filter(Boolean).join(' · ')
}

/** Kişisel satır sayısı / toplam (özet cümlesi için). */
export function personalRowCount(rows: ViewerInsight['rows']): { personal: number; total: number } {
  return { personal: rows.filter((r) => r.personal).length, total: rows.length }
}

/** Afiş seçimi kipinin okunur adı ve etiket tonu. */
export function artworkMode(mode: ArtworkInsight['mode']): { label: string; tone: 'personal' | 'close' | 'common' } {
  if (mode === 'PERSONAL') return { label: 'Zevkine göre', tone: 'personal' }
  if (mode === 'EXPLORE') return { label: 'Keşif denemesi', tone: 'close' }
  return { label: 'Varsayılan', tone: 'common' }
}

/** Adayın ilgi özeti: "12 gösterim · 3 tıklama (%25)"; gösterim yoksa "henüz gösterilmedi". */
export function candidateStats(impressions: number, clicks: number): string {
  if (!(impressions > 0)) return 'henüz gösterilmedi'
  const rate = Math.round((Math.min(clicks, impressions) / impressions) * 100)
  return `${impressions.toLocaleString('tr-TR')} gösterim · ${clicks.toLocaleString('tr-TR')} tıklama (%${rate})`
}
