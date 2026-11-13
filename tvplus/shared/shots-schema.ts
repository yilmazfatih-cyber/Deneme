/**
 * Çekim çözümlemesi dosyalarının şeması (content/shots/*.json) — bkz. docs/ICERIK_ZEKASI.md §8.
 *
 * Üretici: `npm run analyze:shots` (scripts/analyze-shots.ts; geliştirme aracı, ffmpeg yalnız orada kullanılır).
 * Tüketici: gömme servisi (server/src/services/embeddings) — sunucu bu dosyalardan çevrimdışı vektör kurar.
 *
 * İki yöntem:
 *   SCENE_DETECT  medyası çözülebilen yapımlar: sahne algılamayla gerçek çekim sınırları; her çekim için görüntü,
 *                 ses ve altyazı metni. Dosya: content/shots/<videoId>.json (+ <videoId>.jpg anahtar kare paftası).
 *   KEYFRAMES     gömme (YouTube) yapımlar: medya çözülmez; hazır birkaç kareden sözde çekimler (yalnız görüntü).
 *                 Hiç görseli olmayan yapımlar yalnız metinle temsil edilir (`flags: ['NO_IMAGE']`).
 *                 Tüm bu yapımlar tek dosyada: content/shots/keyframes.json (+ keyframes.jpg).
 *
 * Sayılar dosyayı küçük tutmak için yuvarlanır (çoğu 3 anlamlı basamak). Alan adları kısadır; anlamları aşağıdadır.
 */
import { z } from 'zod'

export const SHOTS_SCHEMA_VERSION = 1
export const SHOTS_DIR = 'shots'
export const KEYFRAMES_FILE = 'keyframes.json'

/**
 * Renk histogramı kutu sayıları: 12 ton kutusu (her piksel renk yoğunluğuyla — chroma = max − min — ağırlıklı;
 * toplamları ortalama chroma'ya eşittir, gri ya da siyah bir karede hepsi 0'dır) + 4 açıklık kutusu (toplamları 1).
 */
export const HIST_HUE_BINS = 12
export const HIST_LIGHT_BINS = 4
export const HIST_BINS = HIST_HUE_BINS + HIST_LIGHT_BINS

const unit = z.number().min(0).max(1)

/** Bir çekimin görüntü özellikleri (orta kare(ler)in ortalaması; `motion` ilk ve son kare arasından). */
export const zVisualFeatures = z.object({
  /** 16 kutu: 12 ton (chroma ağırlıklı, toplamı = ortalama chroma) + 4 açıklık (karanlıktan aydınlığa, toplamı 1) */
  hist: z.array(unit).length(HIST_BINS),
  /** Ortalama parlaklık (Rec. 709 luma, 0–1) */
  bright: unit,
  /** Karşıtlık: luma standart sapması (0–0.5) */
  contrast: unit,
  /** Ortalama doygunluk (HSV, 0–1; çok karanlık pikseller 0 sayılır) */
  sat: unit,
  /** Renklilik (Hasler–Süsstrunk 2003), 0–1'e ölçeklenmiş (ham değer / 150) */
  colorful: unit,
  /** Kenar yoğunluğu: Sobel büyüklüğü eşiği aşan piksel oranı (0–1) */
  edges: unit,
  /** Hareket kestirimi: ilk ve son karenin luma farkının ortalaması (0–1); tek kare varsa null */
  motion: unit.nullable(),
})
export type VisualFeatures = z.infer<typeof zVisualFeatures>

/** Bir çekimin ses özellikleri (mono 16 kHz PCM üzerinden, 512 örneklik = 32 ms pencerelerle). */
export const zAudioFeatures = z.object({
  /** Ortalama ses yüksekliği: RMS, dBFS (−90…0) */
  loud: z.number().min(-90).max(0),
  /** Sessiz pencere oranı (RMS < −45 dBFS) */
  silence: unit,
  /** Sıfır geçiş oranı (örnek başına, 0–1) */
  zcr: unit,
  /** Spektral ağırlık merkezi, Hz (sessiz pencereler hariç ortalama; tümü sessizse 0) */
  centroid: z.number().min(0).max(8000),
})
export type AudioFeatures = z.infer<typeof zAudioFeatures>

/** KEYFRAMES kareleri: 'hq' kapak küçük resmi · '1' '2' '3' videonun ¼ ½ ¾ noktasından otomatik kareler. */
export const STILL_NAMES = ['hq', '1', '2', '3'] as const
export type StillName = (typeof STILL_NAMES)[number]

/**
 * Sözde çekim aralıkları (sürenin oranı): her otomatik kare kendi noktasını ortalayan dilimi temsil eder; kapak
 * küçük resmi (hq, videonun neresinden olduğu bilinmez) baştaki dilime konur. Yaklaşıktır.
 */
export const STILL_SPANS: Record<StillName, [number, number]> = {
  hq: [0, 0.125],
  '1': [0.125, 0.375],
  '2': [0.375, 0.625],
  '3': [0.625, 1],
}

/** Tek çekim (ya da sözde çekim). */
export const zShot = z.object({
  /** Sıra (0'dan) */
  i: z.number().int().min(0),
  /** Başlangıç / bitiş, sn. Süresi bilinmeyen sözde çekimlerde null (sunucu katalog süresiyle doldurur). */
  s: z.number().min(0).nullable(),
  e: z.number().min(0).nullable(),
  v: zVisualFeatures.nullable(),
  a: zAudioFeatures.nullable(),
  /** Çekim sırasında söylenenler (altyazıdan); yoksa boş */
  t: z.string().default(''),
  /** Anahtar karenin paftadaki hücre sırası; yoksa null */
  k: z.number().int().min(0).nullable(),
  /** KEYFRAMES: karenin kaynağı ('hq' kapak küçük resmi · '1' '2' '3' videonun ¼ ½ ¾ noktası) */
  src: z.enum(STILL_NAMES).optional(),
})
export type ShotRecord = z.infer<typeof zShot>

/** Anahtar kare paftası: sabit boyutlu hücrelerden oluşan tek JPEG (satır satır, soldan sağa). */
export const zSprite = z.object({
  /** content/shots altındaki dosya adı */
  file: z.string().regex(/^[\w.-]+\.jpg$/),
  cols: z.number().int().positive(),
  cellW: z.number().int().positive(),
  cellH: z.number().int().positive(),
  count: z.number().int().min(0),
})
export type SpriteInfo = z.infer<typeof zSprite>

export const SHOT_FLAGS = [
  /** Hiç görsel bulunamadı → yalnız metin (özet + bağlam) */
  'NO_IMAGE',
  /** Süre bilinmiyor → sözde çekimlerin s/e alanları null */
  'NO_RUNTIME',
  /** Altyazı alınamadı → çekim metinleri boş */
  'NO_TEXT',
  /** Ses parçası çözülemedi */
  'NO_AUDIO',
  /** Bazı kareler indirilemedi */
  'PARTIAL_STILLS',
  /** Çekim üst sınırına ulaşıldı; kısa çekimler birleştirildi */
  'CAPPED',
] as const
export type ShotFlag = (typeof SHOT_FLAGS)[number]

/** SCENE_DETECT dosyası: content/shots/<videoId>.json */
export const zSceneDetectFile = z.object({
  version: z.literal(SHOTS_SCHEMA_VERSION),
  method: z.literal('SCENE_DETECT'),
  videoId: z.number().int().positive(),
  titleId: z.number().int().positive(),
  durationSec: z.number().positive(),
  generatedAt: z.string(),
  /** Çözümleme parametreleri (yeniden üretilebilirlik için) */
  params: z.object({
    ffmpeg: z.string(),
    threshold: z.number(),
    minShotSec: z.number(),
    maxShots: z.number().int(),
    frameWidth: z.number().int(),
    fps: z.number(),
  }),
  /** Hangi medya çözüldü (dosya adları; uzak adresler değil) */
  media: z.object({
    video: z.string(),
    audio: z.string().nullable(),
    /** Çekim metinlerinin dili ve kaynağı */
    textLang: z.string().nullable(),
  }),
  sprite: zSprite.nullable(),
  flags: z.array(z.enum(SHOT_FLAGS)).default([]),
  shots: z.array(zShot).min(1),
})
export type SceneDetectFile = z.infer<typeof zSceneDetectFile>

/** KEYFRAMES dosyasındaki tek yaprak (film / bölüm). Metin dosyada tutulmaz: sunucu yaprağın özetini kullanır. */
export const zKeyframesVideo = z.object({
  videoId: z.number().int().positive(),
  titleId: z.number().int().positive(),
  /** YouTube video kimliği (yoksa null: ör. tek dosyalık arşiv filmleri) */
  youtubeId: z.string().nullable(),
  durationSec: z.number().positive().nullable(),
  /** Denenen / alınan kare sayısı */
  tried: z.number().int().min(0),
  fetched: z.number().int().min(0),
  flags: z.array(z.enum(SHOT_FLAGS)).default([]),
  shots: z.array(zShot).min(1),
})
export type KeyframesVideo = z.infer<typeof zKeyframesVideo>

/** KEYFRAMES dosyası: content/shots/keyframes.json */
export const zKeyframesFile = z.object({
  version: z.literal(SHOTS_SCHEMA_VERSION),
  method: z.literal('KEYFRAMES'),
  generatedAt: z.string(),
  /** Metin kaynağı: sözde çekimlerin metni yaprağın özetinden gelir (dosyada yer almaz) */
  textSource: z.literal('SYNOPSIS'),
  sprite: zSprite.nullable(),
  videos: z.array(zKeyframesVideo),
})
export type KeyframesFile = z.infer<typeof zKeyframesFile>
