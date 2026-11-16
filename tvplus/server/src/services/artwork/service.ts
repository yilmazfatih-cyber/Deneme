/**
 * Afiş seçimi (Netflix "artwork personalization" karşılığı): aynı başlık, içerikteki adaylar arasından (varsayılan
 * görsel + `artwork.alternates`) profile göre seçilen görselle gösterilir. Çalışma anı yalnız sayısaldır (sharp ya da
 * ffmpeg yok; tarayıcıdaki sunucu da çalıştırır): görüntü özellikleri yazım anında hesaplanmıştır
 * (scripts/build-artwork-alternates.ts).
 *
 * Puan (aday başına; yönetici paneli bileşenleri gösterir):
 *   puan = üslup yakınlığı + öğrenilmiş tıklanma
 *   üslup yakınlığı    = 1 − |v_aday − v_profil| / 2   (v: parlaklık, doygunluk, renklilik, kenar; 0–1 aralığında 4 boyut,
 *                        en büyük uzaklık 2). v_profil profilin ilgilendiği başlıklarda GÖRDÜĞÜ görsellerin ortalaması
 *                        (tıkladığı çeşitler iki kat ağırlıklı); yoksa zevk topluluğunun öne çıkan başlıklarının
 *                        varsayılan görselleri; o da yoksa nötr 0.5. Adayın özellikleri yoksa da 0.5.
 *   öğrenilmiş tıklanma = Beta(1 + tıklama, 1 + gösterim − tıklama) sonsal ortalaması = (1 + t) / (2 + g),
 *                        kesim (profilin topluluğu ya da 'all') × başlık × aday sayaçlarından.
 * ε olasılıkla (profil + başlık + gün karmasından deterministik) rastgele bir aday denenir → EXPLORE; yoksa en yüksek
 * puan → PERSONAL. Hiç veri yoksa (nötr üslup, sıfır gösterim) varsayılan görsel → DEFAULT.
 * Seçim profil × başlık için 7 gün yapışkandır (görsel adresi istekler ve yeniden başlatmalar arasında sabit kalsın).
 * Çocuk profilleri ve profilsiz istekler kişiselleştirilmez.
 */
import type { ContentTitle } from '../../../../shared/content-schema'
import type { ArtworkCandidateInsight, ArtworkInsight } from '../../../../shared/intelligence'
import type { AppConfig } from '../../kernel/config'
import { buildArtwork } from '../../kernel/imageUrls'
import type { ArtworkPick, ArtworkPickMode, ArtworkService, Services } from '../../kernel/services'
import { createStore } from '../../kernel/store'
import { artworkEntityId, ARTWORK_KEY_RE } from './ids'

/** Atamanın ömrü */
export const STICKY_MS = 7 * 86_400_000
/** Aynı profil + başlık + aday için gösterim (ve tıklama) bu süre içinde bir kez sayılır */
export const EVENT_WINDOW_MS = 3_600_000
const DAY_MS = 86_400_000
/** Profil üslubu için en çok bu kadar ilgilenilen başlık; topluluk yedeği için bu kadar öne çıkan başlık */
export const STYLE_TITLES = 40
export const COMMUNITY_TITLES = 20
/** Tıklanan çeşidin üsluba katkı ağırlığı (diğer ilgilenilen başlıklar 1) */
export const CLICK_STYLE_WEIGHT = 2
/** Profil başına hatırlanan tıklanmış başlık sayısı */
const CLICKED_PER_PROFILE = 20
/** Profil üslubu / kesimi önbelleği */
const STYLE_TTL_MS = 30_000
const STYLE_CACHE_MAX = 1000
/** Yönetici panelindeki önizleme genişliği */
export const INSIGHT_THUMB_WIDTH = 480

export const DEFAULT_LIMITS = { assignments: 50_000, counters: 100_000, seen: 20_000 }
export type ArtworkLimits = typeof DEFAULT_LIMITS

/** Puan bileşenlerinin adları (yönetici panelinde görünür) */
export const PART_STYLE = 'Görsel üslup yakınlığı'
export const PART_CLICKS = 'Öğrenilmiş tıklanma'

export interface Visual {
  bright: number
  sat: number
  colorful: number
  edges: number
}
export interface Candidate {
  key: string
  label: string
  visual: Visual | null
}
export type StyleSource = 'PROFILE' | 'COMMUNITY' | 'NEUTRAL'

/* ───────────── Saf yardımcılar ───────────── */

/** Başlığın adayları: önce varsayılan (anahtar ''), sonra içerikteki adaylar (yinelenen anahtar atlanır). */
export function candidatesOf(t: ContentTitle): Candidate[] {
  const out: Candidate[] = [{ key: '', label: 'Varsayılan', visual: t.artwork.visual }]
  for (const a of t.artwork.alternates) {
    if (!ARTWORK_KEY_RE.test(a.key) || out.some((c) => c.key === a.key)) continue
    out.push({ key: a.key, label: a.label, visual: a.visual })
  }
  return out
}

/** Üslup yakınlığı (0–1): 1 − öklid uzaklığı / 2. Profil üslubu ya da aday özellikleri yoksa nötr 0.5. */
export function styleAffinity(style: Visual | null, v: Visual | null): number {
  if (!style || !v) return 0.5
  const d = Math.hypot(v.bright - style.bright, v.sat - style.sat, v.colorful - style.colorful, v.edges - style.edges)
  return Math.max(0, Math.min(1, 1 - d / 2))
}

/** Beta(1 + t, 1 + g − t) sonsal ortalaması; tıklama gösterimi aşamaz. */
export function clickRate(impressions: number, clicks: number): number {
  const g = Math.max(0, impressions)
  const t = Math.max(0, Math.min(clicks, g))
  return (1 + t) / (2 + g)
}

/** FNV-1a 32 bit (deterministik keşif kararı için) */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Keşif: profil + başlık + gün karmasıyla ε olasılıkla rastgele aday dizini; keşif yoksa null. */
export function exploreDraw(guid: string, videoId: number, now: number, epsilon: number, n: number): number | null {
  if (n <= 0 || epsilon <= 0) return null
  const day = Math.floor(now / DAY_MS)
  if (fnv1a(`${guid}|${videoId}|${day}`) / 2 ** 32 >= epsilon) return null
  return fnv1a(`${guid}|${videoId}|${day}|aday`) % n
}

function meanVisual(items: { v: Visual; w: number }[]): Visual | null {
  const total = items.reduce((s, x) => s + x.w, 0)
  if (total <= 0) return null
  const m = (f: keyof Visual) => items.reduce((s, x) => s + x.v[f] * x.w, 0) / total
  return { bright: m('bright'), sat: m('sat'), colorful: m('colorful'), edges: m('edges') }
}

const r4 = (x: number) => Math.round(x * 1e4) / 1e4
const dec = (x: number) => x.toFixed(2).replace('.', ',')
const STYLE_TEXT: Record<StyleSource, string> = {
  PROFILE: 'izlediklerine göre',
  COMMUNITY: 'topluluğuna göre',
  NEUTRAL: 'nötr',
}

/* ───────────── Kalıcı durum ───────────── */

/** Atama: k anahtar · m kip · r gerekçe · t atandığı an · c bu çeşide tıklandı */
interface Assignment {
  k: string
  m: ArtworkPickMode
  r: string
  t: number
  c?: 1
}
interface AssignState {
  v: 1
  /** `${guid}|${videoId}` → atama */
  a: Record<string, Assignment>
  /** guid → son tıklanan başlıklar (en yeni sonda) */
  p: Record<string, number[]>
}
/** `${kesim}|${videoId}|${anahtar}` → [gösterim, tıklama, son dokunulan an] */
interface StatState {
  v: 1
  s: Record<string, [number, number, number]>
}

export interface ArtworkDeps {
  config: AppConfig
  /** İstek anında diğer servisler (katalog, kimlik, ilerleme, topluluk) */
  services: () => Partial<Services>
  now?: () => number
  limits?: Partial<ArtworkLimits>
}

export interface ScoredCandidate extends Candidate {
  affinity: number
  rate: number
  score: number
  impressions: number
  clicks: number
}

export function createArtworkService(deps: ArtworkDeps): ArtworkService & {
  /** Sınamalar ve panel için: adayların puanları (atama yapmaz) */
  score(profileGuid: string, videoId: number): { style: StyleSource; segment: string; candidates: ScoredCandidate[] }
  sizes(): { assignments: number; counters: number; seen: number }
} {
  const { config } = deps
  const clock = deps.now ?? (() => Date.now())
  const limits: ArtworkLimits = { ...DEFAULT_LIMITS, ...deps.limits }
  const assign = createStore<AssignState>(config, 'artwork-assignments', () => ({ v: 1, a: {}, p: {} }))
  const stats = createStore<StatState>(config, 'artwork-stats', () => ({ v: 1, s: {} }))
  // Bozuk ya da eski dosyaya karşı
  if (!assign.get().a || !assign.get().p) assign.update((s) => Object.assign(s, { v: 1, a: s.a ?? {}, p: s.p ?? {} }))
  if (!stats.get().s) stats.update((s) => Object.assign(s, { v: 1, s: {} }))
  /** `${olay}|${guid}|${videoId}|${anahtar}` → son sayıldığı an (bellekte; ekleme sırası en eskiden) */
  const seen = new Map<string, number>()
  const styleCache = new Map<string, { at: number; style: Visual | null; source: StyleSource; segment: string }>()

  const titleOf = (videoId: number): ContentTitle | null => deps.services().catalog?.getTitle(videoId) ?? null
  const def = (reason: string): ArtworkPick => ({ key: '', mode: 'DEFAULT', reason })

  /** null → kişiselleştirilebilir; dize → neden kişiselleştirilmediği */
  function blocked(guid: string | null): string | null {
    if (!guid) return 'Profil yok: herkese varsayılan görsel'
    const identity = deps.services().identity
    if (!identity) return null
    const p = identity.getProfile(guid)
    if (!p) return 'Profil bulunamadı: varsayılan görsel'
    return p.isKids ? 'Çocuk profili: görsel kişiselleştirilmez' : null
  }

  /** Bu profilin bu başlıkta gördüğü görselin özellikleri (atama varsa o aday, yoksa varsayılan) */
  function seenVisual(guid: string, t: ContentTitle): Visual | null {
    const a = assign.get().a[`${guid}|${t.videoId}`]
    if (a?.k) {
      const alt = t.artwork.alternates.find((x) => x.key === a.k)
      if (alt?.visual) return alt.visual
    }
    return t.artwork.visual
  }

  function profileState(guid: string): { style: Visual | null; source: StyleSource; segment: string } {
    const now = clock()
    const hit = styleCache.get(guid)
    if (hit && now - hit.at < STYLE_TTL_MS && now >= hit.at) return hit
    const s = deps.services()
    const safe = <T>(fn: () => T, fallback: T): T => {
      try {
        return fn()
      } catch {
        return fallback
      }
    }
    const segment = safe(() => s.audience?.ofProfile(guid)?.communityId, undefined) ?? 'all'
    // 1) Profilin ilgilendiği başlıklar: tıkladığı çeşitler (×2), izledikleri, beğendikleri, listesi; beğenmedikleri hariç
    const disliked = new Set(safe(() => s.progress?.disliked(guid) ?? [], []))
    const clicked = new Set(assign.get().p[guid] ?? [])
    const engaged: number[] = []
    const add = (ids: number[]) => {
      for (const id of ids) if (!disliked.has(id) && !engaged.includes(id)) engaged.push(id)
    }
    add([...clicked].reverse())
    add(safe(() => s.progress?.recentTitles(guid) ?? [], []))
    add(safe(() => s.progress?.liked(guid) ?? [], []))
    add(safe(() => s.progress?.myList(guid) ?? [], []))
    const own: { v: Visual; w: number }[] = []
    for (const id of engaged.slice(0, STYLE_TITLES)) {
      const t = titleOf(id)
      const v = t ? seenVisual(guid, t) : null
      if (v) own.push({ v, w: clicked.has(id) ? CLICK_STYLE_WEIGHT : 1 })
    }
    let style = meanVisual(own)
    let source: StyleSource = style ? 'PROFILE' : 'NEUTRAL'
    // 2) Topluluğun öne çıkan başlıklarının varsayılan görselleri
    if (!style && segment !== 'all') {
      const top = safe(() => s.audience?.topTitles(segment, COMMUNITY_TITLES) ?? [], [])
      style = meanVisual(
        top.flatMap((x) =>
          titleOf(x.titleId)?.artwork.visual ? [{ v: titleOf(x.titleId)!.artwork.visual!, w: 1 }] : [],
        ),
      )
      if (style) source = 'COMMUNITY'
    }
    const out = { at: now, style, source, segment }
    if (styleCache.size >= STYLE_CACHE_MAX) styleCache.delete(styleCache.keys().next().value!)
    styleCache.set(guid, out)
    return out
  }

  function scoreTitle(guid: string, t: ContentTitle) {
    const ps = profileState(guid)
    const counters = stats.get().s
    const candidates: ScoredCandidate[] = candidatesOf(t).map((c) => {
      const e = counters[`${ps.segment}|${t.videoId}|${c.key}`]
      const impressions = e?.[0] ?? 0
      const clicks = e?.[1] ?? 0
      const affinity = styleAffinity(ps.style, c.visual)
      const rate = clickRate(impressions, clicks)
      return { ...c, affinity, rate, score: affinity + rate, impressions, clicks }
    })
    return { style: ps.source, segment: ps.segment, candidates }
  }

  function prune(state: AssignState, now: number): void {
    const keys = Object.keys(state.a)
    if (keys.length <= limits.assignments) return
    for (const k of keys) if (now - state.a[k]!.t >= STICKY_MS) delete state.a[k]
    const left = Object.entries(state.a)
    if (left.length > limits.assignments) {
      left.sort((x, y) => x[1].t - y[1].t)
      const target = Math.floor(limits.assignments * 0.9)
      for (const [k] of left.slice(0, left.length - target)) delete state.a[k]
    }
    const profiles = Object.keys(state.p)
    const maxProfiles = Math.max(1, Math.floor(limits.assignments / 10))
    for (const g of profiles.slice(0, Math.max(0, profiles.length - maxProfiles))) delete state.p[g]
  }

  function pick(guid: string | null, videoId: number): ArtworkPick {
    if (!config.artworkPersonalization) return def('Afiş seçimi kapalı')
    const t = titleOf(videoId)
    if (!t) return def('Film ya da dizi değil: varsayılan görsel')
    const cands = candidatesOf(t)
    if (cands.length < 2) return def('Bu başlığın tek görseli var')
    const why = blocked(guid)
    if (why || !guid) return def(why ?? '')
    const now = clock()
    const id = `${guid}|${videoId}`
    const cur = assign.get().a[id]
    if (cur && now - cur.t < STICKY_MS && cands.some((c) => c.key === cur.k))
      return { key: cur.k, mode: cur.m, reason: cur.r }

    const scored = scoreTitle(guid, t)
    const list = scored.candidates
    let chosen: ArtworkPick
    const explore = exploreDraw(guid, videoId, now, config.artworkEpsilon, list.length)
    if (explore !== null) {
      const c = list[explore]!
      chosen = {
        key: c.key,
        mode: 'EXPLORE',
        reason: `Keşif: ${c.label} deneniyor (%${Math.round(config.artworkEpsilon * 100)} olasılıkla rastgele aday)`,
      }
    } else if (scored.style === 'NEUTRAL' && list.every((c) => c.impressions === 0)) {
      chosen = def('Henüz veri yok: varsayılan görsel')
    } else {
      let best = list[0]!
      for (const c of list) if (c.score > best.score + 1e-9) best = c
      chosen = {
        key: best.key,
        mode: 'PERSONAL',
        reason: `${best.label} en yüksek puanda: üslup ${dec(best.affinity)} (${STYLE_TEXT[scored.style]}) + tıklanma ${dec(best.rate)}`,
      }
    }
    assign.update((s) => {
      s.a[id] = { k: chosen.key, m: chosen.mode, r: chosen.reason, t: now }
      prune(s, now)
    })
    return chosen
  }

  function record(guid: string, videoId: number, event: 'impression' | 'click', key?: string | null): void {
    if (!config.artworkPersonalization || !guid) return
    const t = titleOf(videoId)
    if (!t || candidatesOf(t).length < 2 || blocked(guid)) return
    // Olay hangi çeşidi gösterdiğini bildirdiyse o, yoksa profilin o anki ataması
    const k =
      key !== undefined && key !== null && candidatesOf(t).some((c) => c.key === key) ? key : pick(guid, videoId).key
    const now = clock()
    const seenKey = `${event}|${guid}|${videoId}|${k}`
    const last = seen.get(seenKey)
    if (last !== undefined && now - last < EVENT_WINDOW_MS && now >= last) return
    seen.delete(seenKey)
    seen.set(seenKey, now)
    while (seen.size > limits.seen) seen.delete(seen.keys().next().value!)

    const segment = profileState(guid).segment
    stats.update((s) => {
      const id = `${segment}|${videoId}|${k}`
      const e = (s.s[id] ??= [0, 0, now])
      if (event === 'impression') e[0]++
      else {
        e[1]++
        // Gösterimi kaçırılmış tıklama: Beta(1 + t, 1 + g − t) için g ≥ t kalsın
        if (e[1] > e[0]) e[0] = e[1]
      }
      e[2] = now
      const keys = Object.keys(s.s)
      if (keys.length > limits.counters) {
        const target = Math.floor(limits.counters * 0.9)
        const old = keys.map((x) => [x, s.s[x]![2]] as const).sort((a, b) => a[1] - b[1])
        for (const [x] of old.slice(0, keys.length - target)) delete s.s[x]
      }
    })
    if (event === 'click') {
      assign.update((s) => {
        const a = s.a[`${guid}|${videoId}`]
        if (a && a.k === k) a.c = 1
        const list = (s.p[guid] ?? []).filter((v) => v !== videoId)
        list.push(videoId)
        s.p[guid] = list.slice(-CLICKED_PER_PROFILE)
        prune(s, now)
      })
      styleCache.delete(guid)
    }
  }

  function explain(guid: string, videoId: number): ArtworkInsight | null {
    const t = titleOf(videoId)
    if (!t) return null
    const chosen = pick(guid, videoId)
    const scored = scoreTitle(guid, t)
    const candidates: ArtworkCandidateInsight[] = scored.candidates.map((c) => ({
      key: c.key,
      label: c.label,
      url: buildArtwork(config, 'STORY_ART', artworkEntityId(videoId, c.key), { width: INSIGHT_THUMB_WIDTH }).url,
      score: r4(c.score),
      parts: [
        { name: PART_STYLE, value: r4(c.affinity) },
        { name: PART_CLICKS, value: r4(c.rate) },
      ],
      impressions: c.impressions,
      clicks: c.clicks,
      chosen: c.key === chosen.key,
    }))
    return { titleId: videoId, title: t.title, type: t.type, mode: chosen.mode, reason: chosen.reason, candidates }
  }

  function summary(guid: string) {
    const segment = profileState(guid).segment
    let impressions = 0
    let clicks = 0
    const prefix = `${segment}|`
    for (const [k, e] of Object.entries(stats.get().s)) {
      if (!k.startsWith(prefix)) continue
      impressions += e[0]
      clicks += e[1]
    }
    return { segment, impressions, clicks }
  }

  return {
    enabled: () => config.artworkPersonalization,
    pick,
    record,
    explain,
    summary,
    flush() {
      assign.flush()
      stats.flush()
    },
    score(guid, videoId) {
      const t = titleOf(videoId)
      return t ? scoreTitle(guid, t) : { style: 'NEUTRAL', segment: 'all', candidates: [] }
    },
    sizes: () => ({
      assignments: Object.keys(assign.get().a).length,
      counters: Object.keys(stats.get().s).length,
      seen: seen.size,
    }),
  }
}
