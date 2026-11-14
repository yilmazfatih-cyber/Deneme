/**
 * Gömme sağlayıcısı arayüzü — çekim düzeyi çok kipli bir modelin takıldığı kapı (docs/ICERIK_ZEKASI.md §8).
 *
 * Girdi: bir oynatılabilir yaprağın (film / bölüm) çekimleri — her çekimin tek kipli özellikleri (görüntü, ses) ve
 * o sırada söylenenler — artı başlığın GENEL BAĞLAMI (ad, özet, geçerli etiketler, tür, ruh hâli, anahtar sözcük).
 * Bağlam her çekime eklenir: etiketler burada nihai sınıflandırma değil, modelin girdilerinden biridir.
 * Çıktı: çekim başına bir vektör + yaprak için havuzlanmış bir vektör (hepsi aynı boyutta).
 *
 * Sağlayıcılar (config.embedding.provider):
 *   taban — yerleşik, eğitilmemiş, deterministik, elle kurulmuş kodlayıcı (./taban). Bir temel modelin yerini tutmaz.
 *   http  — dış model sunucusu; aynı girdi JSON olarak gönderilir (./http, protokol: ./PROTOKOL.md)
 *   dosya — başka yerde üretilmiş vektörler (dataDir/embeddings/import/*.jsonl; ./dosya)
 */
import type { EmbeddingModality } from '../../../../shared/intelligence'
import type { AudioFeatures, VisualFeatures } from '../../../../shared/shots-schema'

export type ShotMethod = 'SCENE_DETECT' | 'KEYFRAMES'

export interface ShotInput {
  index: number
  startSec: number
  endSec: number
  /** Görüntü özellikleri (yoksa null: ör. yalnız metinle temsil edilen yapım) */
  visual: VisualFeatures | null
  /** Ses özellikleri (yalnız SCENE_DETECT) */
  audio: AudioFeatures | null
  /** Çekim sırasında söylenenler (altyazıdan); yoksa boş */
  text: string
}

/** Başlığın genel bağlamı: her çekime eklenir. */
export interface GlobalContext {
  titleId: number
  type: 'MOVIE' | 'SHOW'
  title: string
  synopsis: string
  /** shared/taxonomy GENRES anahtarları */
  genres: string[]
  /** shared/taxonomy MOODS anahtarları */
  moods: string[]
  keywords: string[]
  /** Geçerli etiketler (TaggingService.effective). Etiket yoksa basis 'NONE' ve alanlar boş. */
  tags: {
    basis: 'CONSENSUS' | 'SAMPLE' | 'MODEL' | 'NONE'
    scales: Record<string, number>
    facets: Record<string, string[]>
    descriptors: string[]
  }
}

export interface EmbeddingInput {
  videoId: number
  titleId: number
  method: ShotMethod
  durationSec: number | null
  /**
   * Yaprağın kendi metni: bölümün / ek videonun özeti (filmde boş — filmin özeti zaten bağlamdadır).
   * KEYFRAMES yapraklarında çekim metni olmadığından metin kipi buradan beslenir.
   */
  videoText: string
  shots: ShotInput[]
  context: GlobalContext
}

export interface EmbeddingOutput {
  dims: number
  /** n × dims, satır düzenli; her satır birim uzunlukta */
  shots: Float32Array
  /** Yaprak vektörü, birim uzunlukta */
  pooled: Float32Array
}

export interface EmbeddingProvider {
  /** 'taban' | 'http' | 'dosya' */
  readonly id: string
  /** Model/sürüm kimliği; önbellek anahtarına girer. http/dosya'da init() sonrası kesinleşir. */
  version: string
  /** EmbeddingInfo.modelVersion olarak gösterilecek ad (verilmezse `version`) */
  modelVersion?: string
  /**
   * Bu yaprağın vektörü sağlayıcının asıl modelinden mi gelir? Yalnız yedekli sağlayıcılarda tanımlıdır (depodaki
   * eğitilmiş vektörler + taban yedeği); servis kapsama sayısını buna göre raporlar.
   */
  covers?(input: EmbeddingInput): boolean
  dims: number
  /** Bu sağlayıcının çıktısına giren kipler (bilgi için) */
  modalities(inputs: EmbeddingInput[]): EmbeddingModality[]
  /** Hazırlık (http: model bilgisini sorar; dosya: içe aktarma dosyalarını okur). Hata fırlatabilir. */
  init(): Promise<void>
  /** Yaprağın vektörleri; sağlayıcıda bu yaprak yoksa (dosya) null. */
  embed(input: EmbeddingInput): Promise<EmbeddingOutput | null>
}

/** Çıktıyı denetler: boyut, sayı, sonlu değerler. Sorun varsa Türkçe açıklama döner; yoksa null. */
export function checkOutput(out: EmbeddingOutput, input: EmbeddingInput, dims: number): string | null {
  if (out.dims !== dims) return `boyut ${out.dims}, beklenen ${dims}`
  if (out.shots.length !== input.shots.length * dims)
    return `çekim vektörü sayısı ${out.shots.length / dims}, beklenen ${input.shots.length}`
  if (out.pooled.length !== dims) return `havuz vektörü boyutu ${out.pooled.length}, beklenen ${dims}`
  for (const x of out.shots) if (!Number.isFinite(x)) return 'çekim vektöründe sonlu olmayan değer'
  for (const x of out.pooled) if (!Number.isFinite(x)) return 'havuz vektöründe sonlu olmayan değer'
  return null
}

/** Girdideki kipler: görüntü/ses/metin özelliği taşıyan en az bir çekim varsa o kip; bağlam her zaman. */
export function inputModalities(inputs: EmbeddingInput[]): EmbeddingModality[] {
  let visual = false
  let audio = false
  let text = false
  for (const inp of inputs) {
    if (inp.videoText) text = true
    for (const s of inp.shots) {
      if (s.visual) visual = true
      if (s.audio) audio = true
      if (s.text) text = true
    }
  }
  const out: EmbeddingModality[] = []
  if (visual) out.push('VISUAL')
  if (audio) out.push('AUDIO')
  if (text) out.push('TEXT')
  if (inputs.length) out.push('CONTEXT')
  return out
}

/** Satırları birim uzunluğa getirir (yerinde). Sıfır satır sıfır kalır. */
export function normalizeRows(m: Float32Array, dims: number): Float32Array {
  for (let off = 0; off < m.length; off += dims) {
    let s = 0
    for (let d = 0; d < dims; d++) s += m[off + d]! * m[off + d]!
    const n = Math.sqrt(s)
    if (n > 0) for (let d = 0; d < dims; d++) m[off + d] = m[off + d]! / n
  }
  return m
}
