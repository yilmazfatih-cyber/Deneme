/**
 * Özellik bayrakları ve deney ataması — saf ve bağımlılıksız (zod YOK): sunucu, simülasyon ve İSTEMCİ paketi aynı
 * dosyayı kullanır. Deney tanımı şemaları ve doğrulama `shared/experiments.ts` içindedir; o dosya buradaki her şeyi
 * yeniden dışa açar. İstemci kodu yalnız bu dosyayı içe aktarır (paketine şema kitaplığı girmesin diye).
 *
 * Kurallar
 *   - Bayrağın İLK değeri varsayılandır ve bugünkü davranıştır: hiçbir deney çalışmıyorsa uygulama aynen eskisi gibidir.
 *   - Atama durumsuz ve belirleyicidir: birim kimliği + deney tuzu → kol. Hiçbir yerde atama tablosu tutulmaz.
 *   - Trafik payı ile kol seçimi ayrı özetlerden gelir: trafik %10'dan %50'ye çıkarılınca ilk %10'un kolu değişmez.
 */

/* ───────────── Bayraklar ───────────── */

/**
 * Bayrak sözlüğü. `side`: 'server' bayrağı sunucu yanıtı kurarken okur (keşif, arama); 'client' bayrağı istemci okur
 * (açılış bağlamındaki `flags`). `values[0]` varsayılandır.
 */
export const FLAGS = {
  /**
   * Satır İÇİ sıralama (tür, mikro tür, yeni gelenler, zevk topluluğu satırları).
   * 'model' tahmin modelinin puanına göre · 'popularity' kişiselleştirme yok (satırın kendi sırası).
   */
  'home.rowRanker': { values: ['model', 'popularity'], side: 'server' },
  /**
   * SAYFA düzeyi sıralama (satırların yeri). 'editorial' bugünkü sabit sıra ·
   * 'personal' vitrin, İzlemeye Devam Et, Top 10 ve Canlı TV köprüsü yerinde kalır; kalan satırlar profilin tahmin
   * puanına göre dizilir (satır puanı = ilk 10 öğenin en iyi 5 puanının ortalaması). Model hazır değilse ya da
   * profilin geçmişi yoksa editoryal sıra.
   */
  'home.pageRanker': { values: ['editorial', 'personal'], side: 'server' },
  /** Top 10 satır(lar)ı: 'top' bugünkü yerinde · 'low' kişisel satırlardan sonra (Canlı TV köprüsünden hemen önce) · 'off' yok. */
  'home.top10': { values: ['top', 'low', 'off'], side: 'server' },
  /** "… adlı içeriği izlediğin için" satır sayısı: son izlenen 1 başlık (bugünkü) ya da son 3 farklı başlık. */
  'home.becauseRows': { values: ['1', '3'], side: 'server' },
  /** "‹Ad› için En İyi Seçimler" satırının yeri: 'afterEditorial' ilk editoryal satırdan sonra (bugünkü) · 'top' İzlemeye Devam Et'in hemen ardından. */
  'home.picksPosition': { values: ['afterEditorial', 'top'], side: 'server' },
  /** Dizi bölümü bitince sıradaki bölüm geri sayımla kendiliğinden başlasın mı (istemci). */
  'player.autoplayNext': { values: ['off', 'on'], side: 'client' },
  /** Kart üzerinde beklenince sessiz önizleme oynasın mı (istemci). */
  'preview.autoplay': { values: ['on', 'off'], side: 'client' },
} as const satisfies Record<string, { values: readonly [string, ...string[]]; side: 'server' | 'client' }>

export type FlagKey = keyof typeof FLAGS
export type FlagValue<K extends FlagKey = FlagKey> = (typeof FLAGS)[K]['values'][number]
export type Flags = { [K in FlagKey]: FlagValue<K> }

export const FLAG_KEYS = Object.keys(FLAGS) as FlagKey[]

export const DEFAULT_FLAGS: Flags = Object.fromEntries(FLAG_KEYS.map((k) => [k, FLAGS[k].values[0]])) as Flags

export const isFlagKey = (k: string): k is FlagKey => Object.prototype.hasOwnProperty.call(FLAGS, k)
export const isFlagValue = (k: FlagKey, v: unknown): boolean =>
  typeof v === 'string' && (FLAGS[k].values as readonly string[]).includes(v)

/** Geçerli (anahtar, değer) çiftlerini varsayılanların üstüne yazar; tanınmayanları atlar. */
export function withFlags(base: Flags, patch: Readonly<Record<string, string>> | null | undefined): Flags {
  if (!patch) return base
  const out: Record<string, string> = { ...base }
  for (const [k, v] of Object.entries(patch)) if (isFlagKey(k) && isFlagValue(k, v)) out[k] = v
  return out as Flags
}

/** Varsayılandan farklı bayrakların kararlı özeti ('' → hepsi varsayılan). Önbellek anahtarlarında kullanılır. */
export function flagsKey(flags: Readonly<Partial<Flags>> | null | undefined): string {
  if (!flags) return ''
  const parts: string[] = []
  for (const k of FLAG_KEYS) {
    const v = flags[k]
    if (v !== undefined && v !== DEFAULT_FLAGS[k]) parts.push(`${k}=${v}`)
  }
  return parts.join(';')
}

/* ───────────── Atama (saf, belirleyici; tarayıcıda da çalışır) ───────────── */

/**
 * Dizgeden [0, 1) aralığında kararlı sayı (cyrb53: 53 bit). Kriptografik değildir; yalnız eşit dağılım için.
 * Birim kimlikleri zaten tahmin edilemez (GUID / takma kimlik) olduğundan atama dışarıdan kestirilemez.
 */
export function hash01(s: string): number {
  let h1 = 0xdeadbeef ^ 0x9e3779b9
  let h2 = 0x41c6ce57 ^ 0x85ebca6b
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)) / 9007199254740992
}

/** Atama için gereken en küçük deney biçimi (zod şemasından bağımsız). */
export interface AssignableExperiment {
  key: string
  salt?: string
  traffic: number
  variants: readonly { key: string; weight: number }[]
}

export interface Assignment {
  experiment: string
  variant: string
}

/**
 * Birimin bu deneydeki kolu; deneye girmiyorsa (trafik payının dışında) null. Deneyin durumuna BAKMAZ:
 * hangi durumların atama yaptığına çağıran karar verir (canlıda RUNNING; simülasyonda DRAFT da olur).
 */
export function assignVariant(e: AssignableExperiment, unitId: string): string | null {
  const salt = e.salt ?? e.key
  if (e.traffic < 1 && hash01(`${salt}|trafik|${unitId}`) >= e.traffic) return null
  const total = e.variants.reduce((s, v) => s + v.weight, 0)
  let r = hash01(`${salt}|kol|${unitId}`) * total
  for (const v of e.variants) {
    r -= v.weight
    if (r < 0) return v.key
  }
  return e.variants[e.variants.length - 1]!.key
}

/* ───────────── Olay ve analitik adları ───────────── */

/** Uygulamanın olay günlüğündeki maruziyet olayı (shared/types ClientEventName). data: { experiment, variant } */
export const EXPOSURE_EVENT = 'experiment.exposure'
/** Mixpanel'in deney raporlarının beklediği olay ve özellik adları (gerçek uygulama bunu göndermelidir). */
export const MIXPANEL_EXPOSURE = {
  event: '$experiment_started',
  experimentProperty: 'Experiment name',
  variantProperty: 'Variant name',
} as const
