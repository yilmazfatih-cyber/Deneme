/**
 * Laboratuvar sonuç sözleşmesi — bkz. docs/LAB.md.
 *
 * Lab (tvplus/lab) analiz sonuçlarını `lab klasörü/sonuc/<ad>.json` altına `LabEnvelope<T>` olarak yazar.
 * Sunucu bunları `/api/studio/lab/*` ile verir, Stüdyo çizer, CLI kompakt metne çevirir. Bu dosyada YALNIZ türler
 * vardır (mantık yok): sunucu ve web lab kodunu içe aktarmaz.
 *
 * Gizlilik: sonuç dosyalarında kullanıcı kimliği (takma kimlik dahil) ve ham olay yoktur; yalnız toplamlar vardır
 * ve `kAnonim` eşiğinin altındaki gruplar yazılmaz.
 *
 * Uçlar (salt okunur):
 *   GET /api/studio/lab                 → LabIndex            (hangi sonuçlar var)
 *   GET /api/studio/lab/sonuc/:ad       → LabEnvelope<…>      (ad: 'durum' | 'churn' | 'sim-kalibrasyon' | 'sim-karne' | 'deney-<anahtar>' …)
 *   GET /api/studio/lab/deneyler        → ExperimentRunSummary[]
 */

export interface LabEnvelope<T> {
  name: string
  /** ISO an */
  at: string
  /** Sonucun dayandığı veri sürümü */
  dataRev: string | null
  params: Record<string, unknown>
  data: T
}

export interface LabIndex {
  /** Lab klasörü kurulmuş ve veri kurulmuş mu */
  ready: boolean
  status: LabDataStatus | null
  results: { name: string; at: string; dataRev: string | null }[]
}

/* ═════════════ Veri durumu ═════════════ */

export interface LabDataStatus {
  /** Tablolar kurulmuş mu */
  ready: boolean
  /** Sentetik demo verisi mi (her yerde öyle etiketlenir) */
  synthetic: boolean
  /** Kullanıcı örnekleme oranı (0–1] */
  sample: number
  users: number
  events: number
  userDays: number
  sessions: number
  titles: number
  /** Veri penceresi, 'YYYY-AA-GG' (yerel gün, dahil) */
  from: string
  to: string
  days: number
  dataRev: string
  builtAt: string
  /** Kullanıcı boyutları (kırılımlar) */
  dims: string[]
  /** Kanonik tür → olay sayısı */
  kinds: Record<string, number>
}

/* ═════════════ Churn ═════════════ */

/** Neden aileleri: özellikler ve tetikleyiciler bunlara gruplanır */
export const REASON_FAMILIES = ['aliskanlik', 'icerik', 'kesif', 'kalite', 'abonelik', 'yasam', 'baglam'] as const
export type ReasonFamily = (typeof REASON_FAMILIES)[number]

export const REASON_LABEL: Record<ReasonFamily, string> = {
  aliskanlik: 'Alışkanlık zayıflığı',
  icerik: 'İçerik (tükenme / uyum)',
  kesif: 'Keşif başarısızlığı',
  kalite: 'Oynatma kalitesi',
  abonelik: 'Abonelik ve fiyat',
  yasam: 'Yaşam döngüsü',
  baglam: 'Cihaz ve bağlam',
}

/** Etkinsizlik boşluğu çözümlemesi: n gün etkin olmayan kullanıcı geri dönüyor mu */
export interface GapRow {
  n: number
  /** Etkin günlerden sonraki boşlukların bu süreyi aşma payı */
  exceedShare: number
  /** n gün etkin olmayanın sonradan geri dönme olasılığı (sansüre göre düzeltilmiş) */
  returnRate: number
}

export interface ChurnDefinition {
  /** Bu kadar gün etkinlik yoksa kullanıcı churn etmiş sayılır */
  n: number
  /** 'izleme': etkinlik = oynatma · 'uygulama': etkinlik = herhangi bir oturum */
  activity: 'izleme' | 'uygulama'
  /** 'veri': boşluk çözümlemesinden seçildi · 'elle': kullanıcı verdi */
  chosenBy: 'veri' | 'elle'
  /** Seçim eşiği: geri dönme olasılığı bunun altına düşen ilk süre */
  threshold: number
  gaps: GapRow[]
}

export interface SurvivalPoint {
  day: number
  /** Hâlâ etkin kalanların payı (Kaplan–Meier) */
  s: number
  lo: number
  hi: number
}

export interface ChurnOverview {
  definition: ChurnDefinition
  users: number
  /** En az bir etkin günü olan */
  everActive: number
  neverActive: number
  /** Pencere sonunda: churn etmiş / hâlâ etkin (son n günde etkinliği var) */
  churned: number
  active: number
  churnedShare: number
  /** n günlük dönemler: dönem başında etkin olanlardan sonraki dönemde hiç etkin olmayanların oranı */
  periods: { from: string; to: string; base: number; churned: number; rate: number }[]
  /** Pencere içinde başlayan (yeni ya da geri dönen) kullanıcılar */
  newUsers: number
  survival: SurvivalPoint[]
  /** Yeni kullanıcıların yarısının bıraktığı gün; ulaşılmadıysa null */
  medianLifetime: number | null
  /** Yeni kullanıcılar: başlangıçtan k hafta sonra o hafta içinde etkin olanların oranı */
  weekly: { week: number; base: number; retained: number; rate: number }[]
  /** Haftalık etkin kullanıcı (hafta başı günü) */
  wau: { week: string; users: number }[]
  /** Ortalama günlük etkin / 28 günlük etkin */
  stickiness: number | null
  /** Kıdeme göre "son gün" riski (etkin gün başına) */
  hazardByTenure: { bucket: string; days: number; terminal: number; rate: number }[]
}

export interface FeatureBin {
  label: string
  n: number
  churned: number
  rate: number
  lo: number
  hi: number
}

export interface DriverRow {
  feature: string
  label: string
  family: ReasonFamily
  kind: 'sayı' | 'kategori'
  /** Bilgi değeri (tek değişkenli ayırma gücü): < 0.02 zayıf · 0.02–0.1 orta · > 0.1 güçlü */
  iv: number
  /** Tek değişkenli AUC (yönden bağımsız, 0.5–1) */
  auc: number
  direction: 'artınca artar' | 'artınca azalır' | 'karışık' | '-'
  bins: FeatureBin[]
  /** En riskli dilim */
  worst: { label: string; rate: number; lift: number; n: number }
  /** Çok değişkenli lojistik model: standartlaştırılmış katsayı, bir standart sapma başına olasılık oranı */
  coef: number | null
  oddsRatio: number | null
  orLo: number | null
  orHi: number | null
  p: number | null
  /** Ağaç modeli permütasyon önemi (AUC düşüşü) */
  importance: number | null
}

export interface ModelQuality {
  auc: number
  /** En riskli %10'daki churn oranının genele oranı */
  lift10: number
  logLoss: number
}

export interface ChurnModel {
  snapshots: { day: string; n: number; churnRate: number; role: 'eğitim' | 'sınama' }[]
  rows: number
  churnRate: number
  /** Özellik penceresi (gün) */
  lookback: number
  logistic: ModelQuality
  gbdt: ModelQuality | null
  calibration: { predicted: number; observed: number; n: number }[]
  /** Önem sırasıyla */
  drivers: DriverRow[]
}

export interface ReasonRow {
  family: ReasonFamily
  label: string
  /** Churn olaylarında birincil nedeni bu aile olanların payı */
  share: number
  churners: number
  /** Churn olaylarının bu aileye atfedilen ortalama payı (kesirli atıf; aileler + taban = 1) */
  fraction: number
  /** Bu ailenin zararlı etkileri hiç olmasaydı beklenen churn'deki azalma payı (modelden; ilişkisel üst sınır) */
  avoidableShare: number
  /** Bu nedenle gidenlerin son gününde en sık görülen deneyimler: onlarda ve tüm günlerde görülme payı */
  signals: { key: string; label: string; share: number; overall: number }[]
}

/**
 * Neden dağılımı: her churn olayı (kullanıcının son uygulama günü) ortak risk modeliyle ayrıştırılır. O gün yaşanan
 * zararlı deneyimler ve durum (düşük etkinlik, yeni kullanıcı, plan …) riski tabanın üstüne ne kadar çıkardıysa o pay
 * ilgili aileye, kalan pay "taban"a yazılır (hiçbir özel işaret yokken de var olan risk).
 */
export interface ChurnReasons {
  /** Sonucu bilinen uygulama günlerinde "son gün" oranı */
  baseRate: number
  /** Çözümlenen churn olayı sayısı */
  churners: number
  rows: ReasonRow[]
  /** Özel bir nedene bağlanamayan (taban risk) pay: birincil nedeni olmayanlar ve ortalama kesir */
  baselineShare: number
  baselineFraction: number
}

export interface TriggerRow {
  key: string
  label: string
  family: ReasonFamily
  /** Uygulama günlerinin kaçında yaşandı */
  prevalence: number
  exposedDays: number
  /** O günün kullanıcının son günü olma oranı: yaşandığında / yaşanmadığında */
  rateWith: number
  rateWithout: number
  /** Eşleştirilmiş risk oranı (kıdem × önceki etkinlik × cihaz katmanlarında Mantel–Haenszel) */
  rr: number
  lo: number
  hi: number
  p: number
  /** Çoklu karşılaştırma düzeltmeli p (Benjamini–Hochberg) */
  pAdj: number
  /** Bu deneyime atfedilebilir "son gün" sayısı ve toplam içindeki payı */
  attributable: number
  attributableShare: number
  /** Ortak risk modelindeki katsayı (diğer deneyimler sabitken; lojit) */
  coef: number | null
}

export interface ChurnTriggers {
  /** Sonucu bilinen uygulama günü sayısı ve bunlardan "son gün" olanlar */
  days: number
  terminal: number
  baseRate: number
  rows: TriggerRow[]
}

export interface DimRow {
  dim: string
  value: string
  n: number
  churnRate: number
  lift: number
  p: number
}

export interface PocketRow {
  /** Cep: boyut değerlerinin birleşimi */
  dims: { dim: string; value: string }[]
  n: number
  churnRate: number
  /** Boyutların tek tek etkisinden beklenen oran */
  expected: number
  lift: number
  /** Beklenenin üstündeki churn sayısı */
  excess: number
  p: number
}

export interface ClusterRow {
  id: string
  name: string
  size: number
  share: number
  family: ReasonFamily
  /** Kümeyi ayıran özellikler: churn edenlerin geneline göre standart sapma farkı */
  traits: { feature: string; label: string; z: number; value: number }[]
}

export interface ChurnSegments {
  baseRate: number
  dims: DimRow[]
  pockets: PocketRow[]
  clusters: ClusterRow[]
}

export interface EarlyLife {
  /** Yeni kullanıcı sayısı ve ilk `window` günden sonra bırakanların oranı */
  users: number
  window: number
  churnRate: number
  /** İlk günlerde yaşanan ve tutunmayı ayıran anlar */
  moments: {
    key: string
    label: string
    share: number
    rateWith: number
    rateWithout: number
    rr: number
    lo: number
    hi: number
  }[]
}

export interface Finding {
  id: string
  /** 3 en önemli */
  severity: 1 | 2 | 3
  family: ReasonFamily | null
  title: string
  /** Sayılarla kanıt (tek cümle) */
  evidence: string
  /** Ayrıntı için komut */
  next?: string
}

export interface ChurnDeep {
  status: LabDataStatus
  overview: ChurnOverview
  model: ChurnModel | null
  reasons: ChurnReasons | null
  triggers: ChurnTriggers | null
  segments: ChurnSegments | null
  early: EarlyLife | null
  findings: Finding[]
  /** Yorum sınırları (ilişki ≠ nedensellik vb.) */
  caveats: string[]
}

/* ═════════════ Simülasyon ═════════════ */

/** Gerçek ↔ simülasyon karşılaştırmasının bir satırı */
export interface FidelityMetric {
  key: string
  label: string
  real: number
  sim: number
  /** sim / gerçek */
  ratio: number
  /** Hoşgörü içinde mi (±%25 ya da oranlarda ±1,5 puan) */
  ok: boolean
  unit: 'oran' | 'sayı' | 'dk'
  /** Bu ölçü kalibrasyonda gerçeğe uyduruldu mu (uydurulanlar karne puanına girmez) */
  calibrated: boolean
}

/** Simülatörün bir parametresi ve nereden geldiği */
export interface SimAssumption {
  name: string
  value: string
  /** 'veriden' kestirildi · 'kalibrasyon' gerçek veriye uydurularak bulundu · 'varsayım' veride karşılığı yok */
  source: 'veriden' | 'kalibrasyon' | 'varsayım'
}

export interface SimKnobValues {
  selectBias: number
  hazardShift: number
  rowContinue: number
  itemContinue: number
  continueBonus: number
  visitScale: number
  completionShift: number
}

/**
 * Gerçeklik karnesi: simülatör, verinin son `horizon` gününün BAŞINDAKİ kullanıcılardan başlatılır ve o günleri
 * yeniden yaşar; sonuç gerçekte olanla karşılaştırılır. Simülatöre ne kadar güvenileceğinin ölçüsüdür.
 */
export interface SimCalibration {
  synthetic: boolean
  /** Sınamanın başladığı gün ('YYYY-AA-GG') ve uzunluğu */
  from: string
  horizon: number
  /** Churn süresi (gün) */
  n: number
  twins: number
  /** Başlangıç gününde etkin olan gerçek kullanıcı sayısı */
  alive: number
  knobs: SimKnobValues
  oracle: { knn: number; genre: number; popularity: number; auc: number | null; rows: number }
  world: { titles: number; viewers: number; facts: number; modelReady: boolean; communities: number }
  metrics: FidelityMetric[]
  /** Veride karşılığı olmayan ölçüler (ör. hata ya da arama olayı eşlenmemiş): karneye girmez */
  absent?: string[]
  /** 0–1: UYDURULMAYAN ölçülerin ortalama uyumu (1 = birebir) */
  score: number
  /** Haftalık etkin ikiz payı: gerçek ↔ simülasyon */
  weekly: { week: number; real: number; sim: number }[]
  assumptions: SimAssumption[]
  seconds: number
}

/* ═════════════ Deneyler (A/B) ═════════════ */

export interface ExperimentMetric {
  key: string
  label: string
  /** birincil: karar ölçüsü · koruma: bozulmaması gereken · ikincil: bilgi için */
  role: 'birincil' | 'koruma' | 'ikincil'
  higherIsBetter: boolean
  unit: 'sayı' | 'oran' | 'dk'
  control: number
  treatment: number
  diff: number
  lo: number
  hi: number
  /** Göreli fark ve aralığı */
  rel: number
  relLo: number
  relHi: number
  p: number
  /** Çoklu karşılaştırma düzeltmeli p (birincil ölçüde p'nin kendisi) */
  pAdj: number
  /** Varyantın ölçüyü İYİ yönde değiştirme olasılığı */
  probBetter: number
  method: string
  /** iyi: anlamlı iyileşme · kötü: anlamlı bozulma · belirsiz: fark gösterilemedi */
  verdict: 'iyi' | 'kötü' | 'belirsiz'
  /**
   * Yalnız gerçek deneyin birincil ölçüsünde: her an geçerli p (karışım ardışık sınaması). Deney sürerken sonuçlara
   * tekrar tekrar bakılacaksa `p` yerine bu okunur; yanlış alarm oranı bakış sayısından etkilenmez.
   */
  pAlways?: number
}

export interface ExperimentArm {
  key: string
  name: string
  n: number
  /** Bu kolun kontrole göre değiştirdikleri (bayraklar, ortam, davranış varsayımı) */
  changes: string[]
  metrics: ExperimentMetric[]
  /** aday: birincil ölçü iyileşti, korumalar bozulmadı · riskli: bir koruma bozuldu · zararlı: birincil bozuldu · etkisiz: fark yok */
  decision: 'aday' | 'riskli' | 'zararlı' | 'etkisiz'
  summary: string
}

export interface ExperimentRun {
  key: string
  name: string
  /** simülasyon: ikizler uygulamanın kodunu sürdü · gerçek: içe alınan maruziyet ve davranış verisi */
  source: 'simülasyon' | 'gerçek'
  /** ikiz evren: aynı kullanıcılar her kolda (eşli) · klasik bölme: kollar farklı kullanıcılar */
  design: 'ikiz evren' | 'klasik bölme'
  synthetic: boolean
  at: string
  /** Ufuk / ölçüm penceresi (gün) */
  days: number
  control: { key: string; name: string; n: number }
  arms: ExperimentArm[]
  /** Simülasyon: gerçeklik karnesi puanı (yoksa null) */
  fidelity: number | null
  /** Gerçek deney: kol büyüklükleri beklenen paylarla uyumlu mu */
  srm: { p: number; ok: boolean } | null
  notes: string[]
  caveats: string[]
  seconds: number
}

/** `deney guc`: deney D gün sürerse (o sürede uygulamaya gelen herkes deneye girer) algılanabilir en küçük etki */
export interface PowerDuration {
  days: number
  /** O sürede uygulamaya gelen kullanıcı (örneklem oranı ve trafik payına göre ölçeklenmiş) */
  users: number
  mean: number
  sd: number
  /** Deney öncesi aynı uzunlukta dönemle korelasyon */
  preCorrelation: number
  mde: number
  mdeCuped: number
}

/** `deney guc`: gerçek veriden güç ve süre hesabı */
export interface PowerTable {
  metric: string
  label: string
  /** Deneye alınan kullanıcı payı (0–1) */
  traffic: number
  /** Ölçüm penceresi (gün) ve o pencerede uygun kullanıcı (örneklem oranı ve trafik payına göre ölçeklenmiş) */
  window: number
  eligible: number
  mean: number
  sd: number
  /** Deney öncesi dönemle korelasyon (CUPED kazancı = 1 − ρ²) */
  preCorrelation: number
  /** Eldeki kullanıcıyla (yarı yarıya) algılanabilir en küçük göreli fark: düz ve CUPED ile */
  mde: number
  mdeCuped: number
  rows: { effect: number; perArm: number; perArmCuped: number; enough: boolean; enoughCuped: boolean }[]
  /** Süreye göre algılanabilir en küçük etki (churn gibi pencere isteyen ölçülerde boş) */
  durations: PowerDuration[]
  notes: string[]
}
