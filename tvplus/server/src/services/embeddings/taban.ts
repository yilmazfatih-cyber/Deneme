/**
 * `taban` — yerleşik temel sağlayıcı. EĞİTİLMEMİŞ, deterministik, elle kurulmuş bir kodlayıcıdır: çekim düzeyi çok
 * kipli bir modelin VERİ AKIŞINI ve ARAYÜZÜNÜ korur (kip kodlayıcıları → ortak uzay → kip birleştirme → genel bağlam →
 * komşu çekimlerle bağlamlama → havuzlama), ama hiçbir şey öğrenmemiştir; benzerlikleri yalnız yüzeysel özelliklerin
 * (renk, ışık, ses düzeyi, ortak sözcükler, ortak etiketler) örtüşmesinden gelir. Eğitilmiş bir modelin yerini tutmaz;
 * gerçek model `http` ya da `dosya` sağlayıcısıyla takılır.
 *
 * Ortak uzay (192 boyut) kip bloklarına bölünmüştür: [görüntü 24 | ses 8 | metin 64 | bağlam 96]. Her kip kendi
 * bloğuna tohumlu bir izdüşümle taşınır ve blok içinde birim uzunluğa getirilir; çekim vektörü blokların ağırlıklı
 * birleşimidir (kip vektörlerinin yan yana konup birim uzunluğa getirilmesi). Bloklar ayrık olduğundan iki vektörün
 * kosinüsü, kip benzerliklerinin FUSION ağırlıklı toplamıdır — rastgele izdüşümlerin kipler arası sahte iç çarpımı
 * olmaz ve ağırlıklar doğrudan "bu kipin benzerliğe payı" olarak okunur.
 *
 * Akış (her sabit aşağıda adlandırılmış ve belgelenmiştir):
 *   1. Metin kipi: Türkçe katlanmış sözcükler + karakter 3-gramları → işaretli özellik karması (TEXT_BUCKETS kova,
 *      √tf alt-doğrusal ağırlık) → tohumlu seyrek izdüşüm. Bölüm/ek video özeti (videoText) çekim metnine
 *      VIDEO_TEXT_SHARE payıyla eklenir; çekim metni yoksa metin kipi yalnız ondan gelir.
 *   2. Görüntü kipi: 22 özellik (16 kutulu histogram + parlaklık, karşıtlık, doygunluk, renklilik, kenar, hareket) sabit
 *      başvuru ortalaması/sapmasıyla standartlaştırılır (±Z_CLIP) → tohumlu izdüşüm.
 *   3. Ses kipi: 4 özellik (yükseklik, sessizlik, sıfır geçiş, spektral merkez) aynı biçimde.
 *   4. Genel bağlam: başlık + özet sözcükleri, tür / ruh hâli / anahtar sözcük belirteçleri, geçerli etiketler (ölçekler
 *      termometre kodlamasıyla: 3 ile 4 birbirine 1 ile 5'ten yakındır; yüzler ve niteleyiciler belirteç olarak) →
 *      karma + izdüşüm. HER ÇEKİME aynı bağlam bloğu eklenir (etiketler modelin girdisidir, sonucu değil).
 *   5. Çekim = √FUSION ağırlıklı bloklar, birim uzunlukta. Eksik kipin bloğu sıfırdır; birim uzunluğa getirmek payını
 *      kalan kiplere orantılı dağıtır.
 *   6. Bağlamlama: her çekim, ±2 komşusunun NEIGHBOR_KERNEL ağırlıklı toplamıyla yumuşatılır (birim uzunlukta).
 *   7. Havuz (yaprak vektörü): her blok ayrı ayrı çekim süresiyle ağırlıklı ortalanır, blok birim uzunluğa getirilir
 *      ve √POOL_FUSION ile ağırlıklanır; böylece başlık vektöründe her kipin payı POOL_FUSION'dur (düz ortalamada
 *      çekimden çekime değişen kipler birbirini götürür, başlık vektörü neredeyse yalnız bağlam kalırdı).
 *
 * Başvuru istatistikleri katalogdan değil sabitlerden gelir: başka bir başlığın eklenmesi bu başlığın vektörünü
 * değiştirmez (önbellek yalnız değişen başlıkta geçersizleşir). Değerler bir kez ölçülüp yuvarlanmıştır; yeni içerik
 * türlerinde yeniden ölçülmesi önerilir.
 */
import { createHash } from 'node:crypto'
import type { EmbeddingModality } from '../../../../shared/intelligence'
import { HIST_BINS, type AudioFeatures, type VisualFeatures } from '../../../../shared/shots-schema'
import {
  addHashed,
  charGrams,
  foldTr,
  projectDense,
  projectionMatrix,
  projectSparse,
  sparseNorm,
  wordsOf,
  type Sparse,
} from './hashing'
import { inputModalities, type EmbeddingInput, type EmbeddingOutput, type EmbeddingProvider } from './provider'
import { addScaled, normalize } from './vectors'

/** Taban kodlayıcının tüm sabitleri. Biri değişirse sürüm kimliği (ve önbellek) kendiliğinden değişir. */
export const TABAN_PARAMS = {
  /**
   * Kip blokları (boyut); toplamları ortak uzay boyutudur (192). Sıra: görüntü, ses, metin, bağlam. Görüntü (22
   * özellik) ve ses (4 özellik) küçük bloklara neredeyse kayıpsız sığar. Metin ve bağlam binlerce kovadan izdüşürülür:
   * k boyutlu blokta ilgisiz iki metnin kosinüsü ≈ ±1/√k gürültü taşır (40 boyutta Sintel altyazısı ile ortak sözcüğü
   * olmayan bir belgesel özeti arasında 0.38 ölçüldü); bu yüzden büyük tutulur.
   */
  BLOCKS: { VISUAL: 24, AUDIO: 8, TEXT: 64, CONTEXT: 96 },
  /**
   * Kip birleştirme ağırlıkları = dört kip de varken her kipin kosinüse payı (toplam 1). Bağlam, çekim düzeyinde en
   * büyük paydır: dört karelik YouTube temsillerinde görüntü kipi aksi hâlde benzerliği ele geçiriyordu (bkz. rapor).
   */
  FUSION: { VISUAL: 0.25, AUDIO: 0.15, TEXT: 0.25, CONTEXT: 0.35 },
  /**
   * Havuz (yaprak/başlık vektörü) düzeyindeki kip payları. Görüntü ve ses burada daha az ağırlık alır: başlıkların
   * ortalama renk/ışık/ses istatistikleri birçok başlıkta birbirine benzer (görüntü bloğunun kosinüsü örnek katalogda
   * çoğu çiftte 0.5–0.8) ve "benzer yapım" için zayıf kanıttır; FUSION ile bırakıldığında komşuları renk paleti
   * belirliyordu (ör. Sintel → Osmanlı müziği belgeseli). Çekim komşularında FUSION geçerlidir.
   */
  POOL_FUSION: { VISUAL: 0.12, AUDIO: 0.08, TEXT: 0.3, CONTEXT: 0.5 },
  /** Metin karması kova sayısı */
  TEXT_BUCKETS: 2048,
  /** Tohumlar: her kip kendi izdüşüm matrisini kullanır */
  SEED_TEXT: 0x7e47,
  SEED_CONTEXT: 0xc0e7,
  SEED_VISUAL: 0x51a1,
  SEED_AUDIO: 0xa0d1,
  /** Metin özellik ağırlıkları: tam sözcük, karakter 3-gramı (sözcük başına 3-gram katkısı sözcüğünkünden az olsun) */
  WORD_WEIGHT: 1,
  GRAM_WEIGHT: 0.08,
  /** Bağlam bileşenleri (her biri birim; ağırlıklı toplanır): başlık+özet metni, tür/ruh hâli/anahtar sözcük, etiketler */
  CONTEXT_PARTS: { TEXT: 1, META: 1, TAGS: 1.2 },
  /** Bölüm/ek video özetinin, çekim metniyle birleşirken payı */
  VIDEO_TEXT_SHARE: 0.5,
  /** Standartlaştırılmış özelliklerin kırpılması (aykırı değerler vektörü ele geçirmesin) */
  Z_CLIP: 3,
  /** Görüntü kipinde 16 histogram kutusunun toplu normu, 6 sayısal özelliğinkinin bu katı olsun */
  HIST_BLOCK_WEIGHT: 0.5,
  /** Komşu çekim çekirdeği: kendisi, ±1, ±2 */
  NEIGHBOR_KERNEL: [1, 0.5, 0.25],
  /** Süre ağırlığının alt sınırı (sn): çok kısa çekimler havuzda yok sayılmasın */
  MIN_POOL_WEIGHT_SEC: 0.5,
  /**
   * Görüntü başvuru istatistikleri (ortalama, sapma): sırasıyla 16 histogram kutusu, parlaklık, karşıtlık, doygunluk,
   * renklilik, kenar, hareket. Ölçüm: content/shots altındaki 777 çekim/kare (2026-11-13).
   */
  VISUAL_REF: {
    mean: [
      0.051, 0.029, 0.008, 0.002, 0.002, 0.004, 0.015, 0.009, 0.002, 0.003, 0.003, 0.011, 0.431, 0.286, 0.191, 0.092,
      0.348, 0.191, 0.327, 0.253, 0.33, 0.148,
    ],
    // Ton kutularında sapma en az 0.015 alınır: nadir tonlar gürültüyü büyütmesin.
    sd: [
      0.053, 0.047, 0.018, 0.015, 0.015, 0.015, 0.032, 0.022, 0.015, 0.015, 0.015, 0.019, 0.282, 0.16, 0.15, 0.14,
      0.163, 0.059, 0.157, 0.14, 0.143, 0.101,
    ],
  },
  /** Ses başvuru istatistikleri: yükseklik (dBFS), sessizlik oranı, sıfır geçiş, spektral merkez (Hz); 301 çekim */
  AUDIO_REF: { mean: [-22, 0.1, 0.097, 1465], sd: [11, 0.23, 0.046, 503] },
} as const

const P = TABAN_PARAMS
const B = P.BLOCKS
/** Ortak uzay boyutu */
export const TABAN_DIMS = B.VISUAL + B.AUDIO + B.TEXT + B.CONTEXT
/** Blokların başlangıç sütunları */
export const BLOCK_OFFSETS = {
  VISUAL: 0,
  AUDIO: B.VISUAL,
  TEXT: B.VISUAL + B.AUDIO,
  CONTEXT: B.VISUAL + B.AUDIO + B.TEXT,
} as const
const VISUAL_FEATURES = HIST_BINS + 6
const AUDIO_FEATURES = 4

export const TABAN_VERSION = `taban-2.${createHash('sha256').update(JSON.stringify(P)).digest('hex').slice(0, 8)}`

interface Matrices {
  text: Float32Array
  context: Float32Array
  visual: Float32Array
  audio: Float32Array
}
let cached: Matrices | null = null
const matrices = (): Matrices =>
  (cached ??= {
    text: projectionMatrix(P.TEXT_BUCKETS, B.TEXT, P.SEED_TEXT),
    context: projectionMatrix(P.TEXT_BUCKETS, B.CONTEXT, P.SEED_CONTEXT),
    visual: projectionMatrix(VISUAL_FEATURES, B.VISUAL, P.SEED_VISUAL),
    audio: projectionMatrix(AUDIO_FEATURES, B.AUDIO, P.SEED_AUDIO),
  })

/* ───────────── Kip kodlayıcıları ───────────── */

/** Metnin seyrek karması: "w:" sözcük, "c:" karakter 3-gramı belirteçleri; √tf ağırlık. */
export function textSparse(text: string, into: Sparse = new Map()): Sparse {
  const counts = new Map<string, number>()
  for (const w of wordsOf(text)) {
    counts.set(`w:${w}`, (counts.get(`w:${w}`) ?? 0) + P.WORD_WEIGHT)
    for (const g of charGrams(w)) counts.set(`c:${g}`, (counts.get(`c:${g}`) ?? 0) + P.GRAM_WEIGHT)
  }
  for (const [k, c] of counts) addHashed(into, k, Math.sqrt(c), P.TEXT_BUCKETS)
  return into
}

/** Seyrek karmayı birim uzunluğa getirip bloğa taşır (boşsa null). */
function embedSparse(v: Sparse, m: Float32Array, cols: number): Float64Array | null {
  const n = sparseNorm(v)
  if (n === 0) return null
  const scaled: Sparse = new Map()
  for (const [k, x] of v) scaled.set(k, x / n)
  return normalize(projectSparse(scaled, m, cols))
}

/** Metin bloğu (birim; metin yoksa null) — testler ve tanı için. */
export function textVector(text: string): Float64Array | null {
  return embedSparse(textSparse(text), matrices().text, B.TEXT)
}

const zscore = (x: number, mean: number, sd: number) => {
  const z = (x - mean) / sd
  return z > P.Z_CLIP ? P.Z_CLIP : z < -P.Z_CLIP ? -P.Z_CLIP : z
}

/** Görüntü özellik vektörü (standartlaştırılmış, 22 boyut). Hareket bilinmiyorsa başvuru ortalaması (z = 0). */
export function visualVector(v: VisualFeatures): Float64Array {
  const raw = [...v.hist, v.bright, v.contrast, v.sat, v.colorful, v.edges, v.motion ?? P.VISUAL_REF.mean[21]!]
  const out = new Float64Array(VISUAL_FEATURES)
  // 16 kutunun toplu normu ≈ 6 sayısal özelliğinkinin HIST_BLOCK_WEIGHT katı olsun diye kutu başına √(6/16) ölçek
  const histScale = P.HIST_BLOCK_WEIGHT * Math.sqrt(6 / HIST_BINS)
  for (let i = 0; i < VISUAL_FEATURES; i++) {
    const z = zscore(raw[i] ?? 0, P.VISUAL_REF.mean[i]!, P.VISUAL_REF.sd[i]!)
    out[i] = i < HIST_BINS ? z * histScale : z
  }
  return out
}

export function audioVector(a: AudioFeatures): Float64Array {
  const raw = [a.loud, a.silence, a.zcr, a.centroid]
  const out = new Float64Array(AUDIO_FEATURES)
  for (let i = 0; i < AUDIO_FEATURES; i++) out[i] = zscore(raw[i]!, P.AUDIO_REF.mean[i]!, P.AUDIO_REF.sd[i]!)
  return out
}

/** Görüntü bloğu (birim). */
export function visualBlock(v: VisualFeatures): Float64Array {
  return normalize(projectDense(visualVector(v), matrices().visual, B.VISUAL))
}

/** Ses bloğu (birim). */
export function audioBlock(a: AudioFeatures): Float64Array {
  return normalize(projectDense(audioVector(a), matrices().audio, B.AUDIO))
}

/** Genel bağlam bloğu (birim; hiçbir bileşen yoksa sıfır). */
export function contextVector(ctx: EmbeddingInput['context']): Float64Array {
  const m = matrices().context
  const out = new Float64Array(B.CONTEXT)
  const text = embedSparse(textSparse(`${ctx.title} ${ctx.synopsis}`), m, B.CONTEXT)
  const meta: Sparse = new Map()
  for (const g of ctx.genres) addHashed(meta, `g:${g}`, 1, P.TEXT_BUCKETS)
  for (const md of ctx.moods) addHashed(meta, `m:${md}`, 1, P.TEXT_BUCKETS)
  addHashed(meta, `type:${ctx.type}`, 0.5, P.TEXT_BUCKETS)
  for (const k of ctx.keywords) for (const w of wordsOf(k)) addHashed(meta, `k:${w}`, 1, P.TEXT_BUCKETS)
  const tags: Sparse = new Map()
  for (const [scale, value] of Object.entries(ctx.tags.scales)) {
    // Termometre kodlaması: değer v ise 1..5 basamaklarından ilk v tanesi yanar (kesirli değerde sonuncusu kısmen).
    for (let k = 1; k <= 5; k++) {
      const on = Math.min(1, Math.max(0, value - k + 1))
      if (on > 0) addHashed(tags, `s:${scale}:${k}`, on, P.TEXT_BUCKETS)
    }
    // Ölçeğin 0 olması da bilgi taşır ("hiç yok" ile "değerlendirilmedi" farklıdır).
    if (value <= 0) addHashed(tags, `s:${scale}:0`, 1, P.TEXT_BUCKETS)
  }
  for (const [facet, values] of Object.entries(ctx.tags.facets))
    for (const v of values) addHashed(tags, `f:${facet}:${foldTr(v)}`, 1, P.TEXT_BUCKETS)
  for (const d of ctx.tags.descriptors) addHashed(tags, `d:${d}`, 1, P.TEXT_BUCKETS)
  const parts: [Float64Array | null, number][] = [
    [text, P.CONTEXT_PARTS.TEXT],
    [embedSparse(meta, m, B.CONTEXT), P.CONTEXT_PARTS.META],
    [embedSparse(tags, m, B.CONTEXT), P.CONTEXT_PARTS.TAGS],
  ]
  for (const [v, w] of parts) if (v) addScaled(out, v, w)
  return normalize(out)
}

/* ───────────── Sağlayıcı ───────────── */

/** Saf kodlama işlevi (testler doğrudan çağırır). */
export function tabanEmbed(input: EmbeddingInput): EmbeddingOutput {
  const D = TABAN_DIMS
  const ctx = contextVector(input.context)
  const videoText = input.videoText ? textVector(input.videoText) : null
  const n = input.shots.length
  const wV = Math.sqrt(P.FUSION.VISUAL)
  const wA = Math.sqrt(P.FUSION.AUDIO)
  const wT = Math.sqrt(P.FUSION.TEXT)
  const wC = Math.sqrt(P.FUSION.CONTEXT)
  const put = (h: Float64Array, offset: number, v: ArrayLike<number>, w: number) => {
    for (let i = 0; i < v.length; i++) h[offset + i] = w * v[i]!
  }
  const fused: Float64Array[] = []
  for (const shot of input.shots) {
    const h = new Float64Array(D)
    if (shot.visual) put(h, BLOCK_OFFSETS.VISUAL, visualBlock(shot.visual), wV)
    if (shot.audio) put(h, BLOCK_OFFSETS.AUDIO, audioBlock(shot.audio), wA)
    const own = shot.text ? textVector(shot.text) : null
    if (own || videoText) {
      const t = new Float64Array(B.TEXT)
      if (own) addScaled(t, own, 1)
      if (videoText) addScaled(t, videoText, own ? P.VIDEO_TEXT_SHARE : 1)
      put(h, BLOCK_OFFSETS.TEXT, normalize(t), wT)
    }
    put(h, BLOCK_OFFSETS.CONTEXT, ctx, wC)
    fused.push(normalize(h))
  }
  // Komşu çekimlerle bağlamlama
  const shots = new Float32Array(n * D)
  const kernel = P.NEIGHBOR_KERNEL
  for (let i = 0; i < n; i++) {
    const c = new Float64Array(D)
    for (let off = -(kernel.length - 1); off <= kernel.length - 1; off++) {
      const j = i + off
      if (j < 0 || j >= n) continue
      addScaled(c, fused[j]!, kernel[Math.abs(off)]!)
    }
    shots.set(normalize(c), i * D)
  }
  // Havuz: blok blok süre ağırlıklı ortalama → her blok birim uzunluğa → √FUSION ağırlık → birim uzunluk.
  // Düz ortalama, sıfır merkezli kip özelliklerini (standartlaştırılmış görüntü/ses, işaretli metin karması) yüzlerce
  // çekimde birbirine götürür ve başlık vektörü neredeyse yalnız bağlamdan ibaret kalırdı (Sintel'de %92).
  const pooled = new Float64Array(D)
  if (n === 0) put(pooled, BLOCK_OFFSETS.CONTEXT, ctx, 1)
  const blocks: [number, number, number][] = [
    [BLOCK_OFFSETS.VISUAL, B.VISUAL, Math.sqrt(P.POOL_FUSION.VISUAL)],
    [BLOCK_OFFSETS.AUDIO, B.AUDIO, Math.sqrt(P.POOL_FUSION.AUDIO)],
    [BLOCK_OFFSETS.TEXT, B.TEXT, Math.sqrt(P.POOL_FUSION.TEXT)],
    [BLOCK_OFFSETS.CONTEXT, B.CONTEXT, Math.sqrt(P.POOL_FUSION.CONTEXT)],
  ]
  for (const [offset, size, w] of blocks) {
    const mean = new Float64Array(size)
    input.shots.forEach((s, i) => {
      const sw = Math.max(P.MIN_POOL_WEIGHT_SEC, s.endSec - s.startSec)
      for (let d = 0; d < size; d++) mean[d]! += sw * shots[i * D + offset + d]!
    })
    if (n > 0) put(pooled, offset, normalize(mean), w)
  }
  normalize(pooled)
  return { dims: D, shots, pooled: Float32Array.from(pooled) }
}

export function createTabanProvider(): EmbeddingProvider {
  return {
    id: 'taban',
    version: TABAN_VERSION,
    dims: TABAN_DIMS,
    modalities: (inputs): EmbeddingModality[] => inputModalities(inputs),
    init: async () => {
      matrices()
    },
    embed: async (input) => tabanEmbed(input),
  }
}
