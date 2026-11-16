/**
 * Yönetici paneli: etkin profilin arka plandaki durumu (shared/intelligence.ts "Yönetici paneli").
 *
 *   GET /api/studio/me/insight → ViewerInsight   (stüdyo kapısı: varsayılan yalnız yönetici; profil yoksa 409)
 *
 * "Şu an hangi segmentteyim, sistem buna nasıl karar verdi?" — izleme özeti, zevk topluluğu ve kararın bileşenleri
 * (AudienceService.explainViewer), ana sayfada bu profile kurulan satırlar ve dayanakları (buildLolomo), alt tür
 * motorunun seçtikleri (pickMicrogenreRows puanıyla), tahmin ve arama modellerinin durumu.
 * Her servis çağrısı korumalıdır: servis yoksa, boşsa ya da fırlatırsa ilgili bölüm boş gelir, uç düşmez.
 */
import type { FastifyInstance } from 'fastify'
import { ROUTES } from '../../../../shared/constants'
import type {
  ArtworkInsight,
  ClusteringRun,
  InsightRow,
  InsightSubgenre,
  InsightTitle,
  MicrogenreDefinition,
  SegmentStatus,
  TagVocabulary,
  ViewerInsight,
  ViewerSegment,
  ViewingFact,
} from '../../../../shared/intelligence'
import type { MicrogenreSlot } from '../../../../shared/tagging-schema'
import { GENRES } from '../../../../shared/taxonomy'
import { httpError } from '../../gateway/errors'
import type { AppConfig } from '../../kernel/config'
import type { ProfileRecord } from '../../kernel/context'
import type { AudienceExplanation } from '../../kernel/intelligence'
import type { Services } from '../../kernel/services'
import { MIN_ENGAGEMENT } from '../audience/features'
import { microgenreById, modelReady } from '../discovery/intel'
import { buildLolomo, MODEL_ORDERED, type LolomoList } from '../discovery/lolomo'
import { FEATURE_NAMES } from '../search/model/features'
import { modelVersionOf } from '../search/model/model'
import { searchModel } from '../search/model/runtime'

/** Listelerin üst sınırları (sözleşmedeki "en çok N") */
export const INSIGHT_LIMITS = {
  historyTop: 8,
  traits: 6,
  why: 8,
  drivers: 6,
  alternatives: 3,
  picks: 8,
  modelPicks: 6,
  recentSearches: 5,
  subgenreWatched: 4,
  artworkTitles: 6,
} as const
/** Topluluk seçimleri ve model seçimleri için istenen aday sayısı (süzgeçten sonra kesilir) */
const PICK_FETCH = 60

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

const r4 = (x: number) => Math.round(x * 1e4) / 1e4
const r2 = (x: number) => Math.round(x * 100) / 100

/* ───────────── Satır dayanakları ───────────── */

/** Satır bağlamına göre kısa Türkçe dayanak ve kişisel olup olmadığı. */
export function rowBasis(list: LolomoList, modelOrdered: boolean): { basis: string; personal: boolean } {
  const ordered = modelOrdered && MODEL_ORDERED.includes(list.context) ? ' · sıra: tahmin modeli' : ''
  switch (list.context) {
    case 'continueWatching':
      return { basis: 'Yarım bıraktıkların', personal: true }
    case 'queue':
      return { basis: 'Listene eklediklerin', personal: true }
    case 'top10':
    case 'top10Shows':
    case 'top10Movies':
      return { basis: 'Popülerlik ve son 24 saatin oynatmaları; herkese aynı', personal: false }
    case 'popular':
      return { basis: 'Popülerlik ve son 24 saat; ilk üçler hariç', personal: false }
    case 'becauseYouWatched':
      return {
        basis: list.reason
          ? `Son izlediğine benzeyenler; ortak alt tür: ${list.reason}`
          : 'Son izlediğine benzeyenler (künye, alt tür, gömme)',
        personal: true,
      }
    case 'gems':
      return list.source === 'model'
        ? { basis: 'Tahmin modelinin bu profile en yüksek puanları', personal: true }
        : { basis: 'Kural yedeği: izlediklerin, listen ve beğenilerinden zevk', personal: true }
    case 'tasteCommunity':
      return { basis: `İzleme geçmişine en yakın topluluğun öne çıkardıkları${ordered}`, personal: true }
    case 'microgenre':
      return list.fromSignals
        ? { basis: `Alt tür motoru: izleme işaretlerine en uyumlu alt tür${ordered}`, personal: true }
        : { basis: `Alt tür motoru: izleme işareti yok, en büyük alt türler${ordered}`, personal: false }
    case 'newReleases':
      return { basis: `Kataloğa en son eklenenler${ordered}`, personal: false }
    case 'leaving':
      return { basis: '30 gün içinde katalogdan kalkacaklar', personal: false }
    case 'exclusive':
      return { basis: "Yalnız TV+'ta olanlar, popülerliğe göre", personal: false }
    case 'genre':
      return { basis: `Editör düzeni: tür satırı, popülerliğe göre${ordered}`, personal: false }
    case 'collection':
      return { basis: 'Editörün derlediği koleksiyon', personal: false }
    case 'curated':
      return { basis: 'Editörün seçtiği başlıklar', personal: false }
    case 'bridge':
      return { basis: "Canlı TV'ye geçiş; öğesi yok", personal: false }
    default:
      return { basis: 'Ana sayfa düzeni', personal: false }
  }
}

/* ───────────── Alt tür tanımı ───────────── */

const SLOT_LABEL: Record<MicrogenreSlot, string> = {
  ADJECTIVE: 'Nitelik',
  REGION: 'Köken',
  SOURCE: 'Kaynak',
  SETTING: 'Mekân',
  PERIOD: 'Dönem',
  SUBJECT: 'Konu',
  AGE: 'Yaş',
  LEAD: 'Ana karakter',
  FORMAT: 'Biçim',
  ERA: 'Yapım dönemi',
  PERSON: 'Kişi',
}

/** "buster-keaton" → "Buster Keaton" */
const personName = (key: string) =>
  key
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1))
    .join(' ')

/**
 * Mikro tür tanımının okunur özeti, ör. "Belgesel · Film · Konu: Doğa · Ton: Düşündürücü".
 * Değerler sözlükten okunur (ölçek niteleyicisi, yüz değeri, bölge, dönem); bulunamazsa anahtar olduğu gibi yazılır.
 */
export function describeDefinition(def: MicrogenreDefinition, vocab: TagVocabulary | null): string {
  const parts: string[] = []
  const genre = (GENRES as Record<string, { name: string } | undefined>)[def.core]
  parts.push(genre?.name ?? def.core)
  if (def.type === 'MOVIE') parts.push('Film')
  else if (def.type === 'SHOW') parts.push('Dizi')
  const facetValue = (key: string): { facet: string; value: string } | null => {
    const i = key.indexOf(':')
    if (i <= 0 || !vocab) return null
    const facet = vocab.facets.find((f) => f.key === key.slice(0, i))
    const value = facet?.values.find((v) => v.key === key.slice(i + 1))
    return facet && value ? { facet: facet.name, value: value.name } : null
  }
  for (const { slot, key } of def.slots) {
    let label = SLOT_LABEL[slot] ?? slot
    let value = key
    if (slot === 'ADJECTIVE') {
      const scale = vocab?.scales.find((s) => s.descriptors.some((d) => d.key === key))
      const desc = scale?.descriptors.find((d) => d.key === key)
      const fv = facetValue(key)
      if (scale && desc) {
        label = scale.name
        value = desc.adjective
      } else if (fv) value = fv.value
    } else if (slot === 'REGION') {
      value = vocab?.naming.regions.find((r) => r.key === key)?.adjective ?? key
    } else if (slot === 'ERA') {
      value = vocab?.naming.eras.find((e) => e.key === key)?.phrase ?? key
    } else if (slot === 'PERSON') {
      value = personName(key)
    } else {
      const fv = facetValue(key)
      if (fv) {
        label = fv.facet
        value = fv.value
      }
    }
    parts.push(`${label}: ${value}`)
  }
  return parts.join(' · ')
}

/* ───────────── İzleme özeti ───────────── */

interface TitleHistory {
  titleId: number
  hours: number
  plays: number
  engagement: number
}

/** Olguları başlığa göre toplar (aynı başlık birden çok kaynakta olabilir); ilgi en yükseği, saat toplamı. */
function historyByTitle(facts: ViewingFact[]): TitleHistory[] {
  const by = new Map<number, TitleHistory>()
  for (const f of facts) {
    const h = by.get(f.titleId) ?? { titleId: f.titleId, hours: 0, plays: 0, engagement: 0 }
    h.hours += Math.max(0, f.watchedSec) / 3600
    h.plays += Math.max(0, f.plays)
    h.engagement = Math.max(h.engagement, Math.min(1, Math.max(0, f.engagement)))
    by.set(f.titleId, h)
  }
  return [...by.values()].sort((a, b) => b.engagement - a.engagement || b.hours - a.hours || a.titleId - b.titleId)
}

/* ───────────── Afiş seçimi ───────────── */

/** Öğrenmenin durumu hakkında kısa not (kesimin toplam gösterim/tıklamasına göre) */
export function artworkNote(sum: { segment: string; impressions: number; clicks: number }): string {
  const where = sum.segment === 'all' ? 'genelde' : 'topluluğunda'
  if (sum.impressions === 0) return 'Henüz gösterim yok: seçimler görsel üsluba dayanıyor.'
  if (sum.impressions < 200)
    return `Henüz ${sum.impressions} gösterim (${where}): seçimler ağırlıkla görsel üsluba dayanıyor.`
  return `${sum.impressions} gösterim, ${sum.clicks} tıklama (${where}): tıklanma oranı seçimde belirleyici.`
}

/** Ana sayfa satırlarındaki adayı olan ilk başlıklar ve profil için seçilen görselleri */
function artworkSection(
  services: Partial<Services>,
  guid: string,
  videoIds: number[],
): NonNullable<ViewerInsight['artwork']> | undefined {
  const artwork = services.artwork
  if (!artwork || !safe(() => artwork.enabled(), false)) return undefined
  const titles: ArtworkInsight[] = []
  const done = new Set<number>()
  for (const id of videoIds) {
    if (titles.length >= INSIGHT_LIMITS.artworkTitles) break
    if (done.has(id)) continue
    done.add(id)
    const t = services.catalog ? safe(() => services.catalog!.getTitle(id), null) : null
    if (!t || t.artwork.alternates.length === 0) continue
    const x = safe(() => artwork.explain(guid, id), null)
    if (x) titles.push(x)
  }
  const sum = safe(() => artwork.summary(guid), null)
  return { enabled: true, titles, note: sum ? artworkNote(sum) : null }
}

/* ───────────── Toplama ───────────── */

export function buildViewerInsight(
  services: Partial<Services>,
  profile: ProfileRecord,
  now: Date,
  config?: AppConfig,
): ViewerInsight {
  const catalog = services.catalog
  const guid = profile.guid
  const titleOf = (titleId: number): InsightTitle | null => {
    const t = catalog ? safe(() => catalog.getTitle(titleId), null) : null
    return t ? { titleId, title: t.title, type: t.type } : null
  }
  const visible = (titleId: number) =>
    !!catalog && safe(() => !!catalog.getTitle(titleId) && catalog.isVisibleTo(profile, titleId), false)

  // İzleme geçmişi (takma kimlikle)
  const viewing = services.viewing
  const viewerId = viewing ? safe(() => viewing.viewerIdOfProfile(guid), '') : ''
  const facts: ViewingFact[] = viewing && viewerId ? safe(() => viewing.factsOfViewer(viewerId), []) : []
  const byTitle = historyByTitle(facts)
  const watched = new Set<number>(byTitle.map((h) => h.titleId))
  for (const id of safe(() => services.progress?.recentTitles(guid) ?? [], [])) watched.add(id)

  // Topluluk kararı
  const audience = services.audience
  const run: ClusteringRun | null = audience ? safe(() => audience.run(), null) : null
  const explain = audience?.explainViewer?.bind(audience)
  const explanation: AudienceExplanation | null = explain && viewerId ? safe(() => explain(viewerId), null) : null
  let segmentStatus: SegmentStatus
  let segment: ViewerSegment | null = null
  const hit = explanation
    ? explanation.status === 'ASSIGNED' && explanation.communityId
      ? { communityId: explanation.communityId, similarity: explanation.similarity }
      : null
    : audience
      ? safe(() => audience.ofProfile(guid), null)
      : null
  if (explanation) segmentStatus = explanation.status
  else if (hit) segmentStatus = 'ASSIGNED'
  else if (!run) segmentStatus = 'NO_MODEL'
  else segmentStatus = facts.length === 0 ? 'NO_HISTORY' : 'THIN_HISTORY'
  if (hit && audience) {
    const community = safe(() => audience.get(hit.communityId), null)
    const nameOf = (id: string) => safe(() => audience.get(id)?.name, undefined) ?? id
    const engagementOf = new Map(byTitle.map((h) => [h.titleId, h.engagement]))
    segment = {
      communityId: hit.communityId,
      name: community?.name ?? hit.communityId,
      similarity: hit.similarity,
      inRun: explanation?.inRun ?? false,
      size: community?.size ?? 0,
      share: community?.share ?? 0,
      traits: (community?.topFeatures ?? []).slice(0, INSIGHT_LIMITS.traits),
      why: (explanation?.features ?? []).filter((f) => f.contribution > 0).slice(0, INSIGHT_LIMITS.why),
      drivers: (explanation?.titles ?? [])
        .filter((t) => t.contribution > 0)
        .flatMap((t) => {
          const info = titleOf(t.titleId)
          return info
            ? [{ ...info, contribution: t.contribution, engagement: r4(engagementOf.get(t.titleId) ?? t.engagement) }]
            : []
        })
        .slice(0, INSIGHT_LIMITS.drivers),
      alternatives: (explanation?.similarities ?? [])
        .filter((s) => s.communityId !== hit.communityId)
        .slice(0, INSIGHT_LIMITS.alternatives)
        .map((s) => ({ communityId: s.communityId, name: nameOf(s.communityId), similarity: s.similarity })),
      picks: safe(() => audience.topTitles(hit.communityId, PICK_FETCH), [])
        .filter((x) => visible(x.titleId) && !watched.has(x.titleId))
        .flatMap((x) => {
          const info = titleOf(x.titleId)
          return info ? [{ ...info, lift: x.lift }] : []
        })
        .slice(0, INSIGHT_LIMITS.picks),
    }
  }

  // Ana sayfa satırları
  const lolomo = safe(() => buildLolomo(services, profile, { top10Supported: true, now, category: 'home' }), null)
  const lists = (lolomo?.lists ?? []).filter((l) => l.context !== 'billboard')
  const ready = modelReady(services)
  const rows: InsightRow[] = lists.map((l) => ({
    context: l.context,
    title: l.displayName,
    ...rowBasis(l, ready),
    size: l.videoIds.length,
  }))

  // Alt türler
  const tagging = services.tagging
  const vocab = tagging ? safe(() => tagging.vocabulary(), null) : null
  const subgenres: InsightSubgenre[] = lists
    .filter((l) => l.context === 'microgenre' && l.microgenreId)
    .map((l) => {
      const mg = safe(() => microgenreById(services, l.microgenreId!), null)
      const members = new Set(mg?.titleIds ?? l.videoIds)
      return {
        id: l.microgenreId!,
        name: mg?.name ?? l.displayName,
        size: mg ? [...members].filter(visible).length : l.videoIds.length,
        score: r4(l.score ?? 0),
        definition: mg ? describeDefinition(mg.definition, vocab) : l.displayName,
        watched: byTitle
          .filter((h) => members.has(h.titleId))
          .flatMap((h) => {
            const info = titleOf(h.titleId)
            return info ? [info] : []
          })
          .slice(0, INSIGHT_LIMITS.subgenreWatched),
      }
    })

  // Tahmin modeli
  const predictions = services.predictions
  const info = predictions ? safe(() => predictions.info(), null) : null
  const modelPicks =
    predictions && ready
      ? safe(() => predictions.topPicks(guid, PICK_FETCH, { excludeWatched: true }), [])
          .filter((p) => visible(p.titleId) && !watched.has(p.titleId))
          .slice(0, INSIGHT_LIMITS.modelPicks)
          .flatMap((p) => {
            const t = titleOf(p.titleId)
            if (!t) return []
            const reasons = safe(() => predictions.explain(guid, p.titleId)?.reasons ?? [], [])
            return [{ ...t, match: Math.max(0, Math.min(100, Math.round(p.match))), reasons }]
          })
      : []

  // Arama modeli
  // Çalışma zamanı arama eklentisinin açılışta kurduğu (kalıcı) modeldir; Services nesnesine bağlıdır
  const state = services.catalog ? safe(() => searchModel(services as Services, config).store.get(), null) : null
  const search: ViewerInsight['search'] = {
    modelVersion: state ? modelVersionOf(state) : modelVersionOf({ updates: 0 }),
    recent: safe(() => services.progress?.recentSearches(guid) ?? [], []).slice(0, INSIGHT_LIMITS.recentSearches),
    features: state ? FEATURE_NAMES.map((name) => ({ name, weight: r4(state.weights[name]) })) : [],
  }

  // Afiş seçimi (servis yoksa ya da kapalıysa alan gelmez)
  const artwork = artworkSection(
    services,
    guid,
    lists.flatMap((l) => l.videoIds),
  )

  const hours = byTitle.reduce((s, h) => s + h.hours, 0)
  return {
    generatedAt: now.toISOString(),
    profile: { guid, name: profile.name, isKids: profile.isKids },
    viewerId,
    history: {
      titles: byTitle.length,
      engagedTitles: explanation?.engagedTitles ?? byTitle.filter((h) => h.engagement >= MIN_ENGAGEMENT).length,
      hours: r2(hours),
      plays: byTitle.reduce((s, h) => s + h.plays, 0),
      firstTs: facts.length ? Math.min(...facts.map((f) => f.firstTs)) : null,
      lastTs: facts.length ? Math.max(...facts.map((f) => f.lastTs)) : null,
      top: byTitle
        .flatMap((h) => {
          const t = titleOf(h.titleId)
          return t ? [{ ...t, hours: r2(h.hours), engagement: r4(h.engagement) }] : []
        })
        .slice(0, INSIGHT_LIMITS.historyTop),
    },
    segmentStatus,
    segment,
    run,
    sampleData: !!run && run.sources.includes('SYNTHETIC'),
    rows,
    subgenres,
    model: {
      ready,
      version: info?.version ?? null,
      note: info?.note ?? null,
      picks: modelPicks,
    },
    search,
    ...(artwork ? { artwork } : {}),
  }
}

/** `audienceReady`: ilk topluluk hesabı arka planda sürüyorsa bitmesini bekler (insights eklentisindeki yardımcı). */
export function registerViewerInsight(app: FastifyInstance, audienceReady: () => Promise<void>): void {
  app.get(ROUTES.STUDIO_INSIGHT, async (req, reply): Promise<ViewerInsight> => {
    const profile = req.passport?.profile
    if (!profile) throw httpError(409, 'PROFILE_REQUIRED', 'Önce bir profil seçin.')
    await audienceReady()
    reply.header('cache-control', 'no-store')
    const now = safe(() => app.services.epg?.now() ?? new Date(), new Date())
    return buildViewerInsight(app.services, profile, now, app.config)
  })
}
