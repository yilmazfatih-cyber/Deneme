/**
 * Lab eşlemesi: sizin Mixpanel olay ve özellik adlarınız → lab'ın kanonik olayları (bkz. events.ts).
 * Dosya `lab klasörü/esleme.json` içinde durur ve depoya GİRMEZ (olay adlarınız size özeldir).
 * `lab kesif` verinizi tarayıp bir taslak önerir; elle düzeltilip `lab esleme` ile doğrulanır.
 *
 * Var olan `shared/mixpanel-mapping.ts` yalnız izleme olaylarını (katalogla eşleşen) taşır; bu şema onun üst kümesidir:
 * açılış, ekran, hata, takılma, arama, abonelik, deney maruziyeti ve kullanıcı boyutları da eşlenir. Eşlemede adı
 * geçmeyen HİÇBİR özellik okunmaz ve saklanmaz.
 */
import { z } from 'zod'
import { KINDS, type Kind } from './events'

const zKind = z.enum(KINDS)

/** Tek özellik adı ya da sırayla denenen adlar (ilk dolu olan kullanılır). */
const zNames = z.union([z.string().min(1).max(200), z.array(z.string().min(1).max(200)).min(1).max(12)])

/** Eşlenebilen alanlar */
export const PROP_FIELDS = [
  'contentId',
  'contentTitle',
  'contentType',
  'genre',
  'seriesId',
  'season',
  'episode',
  'duration',
  'position',
  'watched',
  'completed',
  'live',
  'device',
  'errorCode',
  'bufferDuration',
  'resultCount',
  'rank',
  'row',
  'screen',
  'experiment',
  'variant',
  'amount',
  'rating',
] as const
export type PropField = (typeof PROP_FIELDS)[number]

const zProps = z
  .object({
    /** İçerik kimliği (film, bölüm, kanal) */
    contentId: zNames.optional(),
    /** İçerik adı (isteğe bağlı; yalnız içerik sözlüğünde durur) */
    contentTitle: zNames.optional(),
    /** İçerik türü; değer `typeMap` ile FILM / BOLUM / CANLI / SPOR / KLIP / DIGER'e çevrilir */
    contentType: zNames.optional(),
    /** Tür (tek değer, virgüllü metin ya da dizi) */
    genre: zNames.optional(),
    /** Bölümün bağlı olduğu dizi kimliği */
    seriesId: zNames.optional(),
    season: zNames.optional(),
    episode: zNames.optional(),
    /** İçeriğin süresi (`durationUnit`) */
    duration: zNames.optional(),
    /** Oynatma konumu (`durationUnit`) */
    position: zNames.optional(),
    /** İzlenen süre (`durationUnit`); anlamı `watched` ayarına bağlı */
    watched: zNames.optional(),
    completed: zNames.optional(),
    /** Canlı yayın mı (true/1/'true') */
    live: zNames.optional(),
    /** Cihaz / platform; değer `deviceMap` ile TV / MOBIL / WEB / DIGER'e çevrilir */
    device: zNames.optional(),
    errorCode: zNames.optional(),
    /** Takılma süresi (`durationUnit`) */
    bufferDuration: zNames.optional(),
    /** Arama sonuç sayısı (0 → sonuçsuz arama) */
    resultCount: zNames.optional(),
    /** Satır içi sıra (gösterim / tıklama) */
    rank: zNames.optional(),
    /** Satır dizini */
    row: zNames.optional(),
    /** Ekran / sayfa adı */
    screen: zNames.optional(),
    /** Deney ve kol adı (maruziyet olayı) */
    experiment: zNames.optional(),
    variant: zNames.optional(),
    /** Tutar (abonelik olayları) */
    amount: zNames.optional(),
    rating: zNames.optional(),
  })
  .strict()
export type PropMap = z.infer<typeof zProps>

const zScalar = z.union([z.string(), z.number(), z.boolean()])

/**
 * Olay kuralı: yalnız tür ya da koşullu kural. `when`: özellik → beklenen değer(ler); hepsi tutarsa kural geçerlidir
 * (tek olay adı birden çok türe ayrılıyorsa — ör. "Player Event" + action — kural dizisi yazılır, ilk tutan kullanılır).
 */
const zRuleObject = z
  .object({
    kind: zKind,
    when: z.record(z.string(), z.union([zScalar, z.array(zScalar).min(1)])).optional(),
    /** Bu olaya özgü özellik adları (genel `props`'un önüne geçer) */
    props: zProps.optional(),
    /** Bu olay her zaman canlı yayın sayılır */
    live: z.boolean().optional(),
    /** SEARCH: bu olay sonuçsuz arama demektir */
    empty: z.boolean().optional(),
    /** PLAY_END: bu olay tamamlanma demektir */
    completed: z.boolean().optional(),
  })
  .strict()
const zRule = z.union([zKind, zRuleObject])
export type EventRule = z.infer<typeof zRule>
export type EventRuleObject = z.infer<typeof zRuleObject>

export const zLabMapping = z
  .object({
    $comment: z.string().max(2000).optional(),
    version: z.literal(1),
    /** Olay adını taşıyan alan(lar) — Mixpanel ham dışa aktarımında `event` */
    eventKey: zNames.default(['event', 'event_name', 'mp_event_name', 'name']),
    /** Özelliklerin bulunduğu alt nesne; null → özellikler satırın en üst düzeyinde (düz JSONL / CSV) */
    propertiesKey: z.string().min(1).max(100).nullable().default('properties'),
    user: z
      .object({
        /** Kullanıcı kimliği özelliği; sırayla denenir. Değer içe alınırken takma kimliğe çevrilir. */
        property: zNames.default(['distinct_id', '$user_id', 'user_id']),
      })
      .strict()
      .prefault({}),
    time: z
      .object({
        property: zNames.default(['time', 'mp_processing_time_ms', 'timestamp']),
        /** 'auto': 10¹¹'den büyük değer milisaniye, değilse saniye; ISO metni de okunur */
        unit: z.enum(['auto', 's', 'ms']).default('auto'),
        /** Değer UTC değil proje saat dilimindeyse o dilimin UTC farkı (dakika) */
        offsetMinutes: z.number().int().min(-840).max(840).default(0),
      })
      .strict()
      .prefault({}),
    /** Mixpanel olay adı → kural(lar) */
    events: z.record(z.string().min(1).max(255), z.union([zRule, z.array(zRule).min(1).max(12)])),
    /** Tüm olaylar için özellik adları */
    props: zProps.prefault({}),
    /** duration / position / watched / bufferDuration birimi */
    durationUnit: z.enum(['s', 'ms', 'min']).default('s'),
    /**
     * `watched` özelliğinin anlamı:
     *   delta       her olay kendi eklediği süreyi taşır (toplanır)
     *   cumulative  o oynatmada o ana dek izlenen toplam (en büyüğü alınır)
     *   position    yalnız konum var: konum farkından türetilir
     *   timestamps  süre bilgisi yok: başlangıç–bitiş anlarından türetilir (içerik süresiyle sınırlanır)
     *   auto        watched varsa delta, yoksa konum, o da yoksa zaman damgaları
     */
    watched: z.enum(['auto', 'delta', 'cumulative', 'position', 'timestamps']).default('auto'),
    completionThreshold: z.number().min(0.5).max(1).default(0.9),
    /** Cihaz değeri (küçük harf) → sınıf */
    deviceMap: z.record(z.string().min(1).max(100), z.enum(['TV', 'MOBIL', 'WEB', 'DIGER'])).default({}),
    /** İçerik türü değeri (küçük harf) → sınıf */
    typeMap: z
      .record(z.string().min(1).max(100), z.enum(['FILM', 'BOLUM', 'CANLI', 'SPOR', 'KLIP', 'DIGER']))
      .default({}),
    /** Beğeni değeri (küçük harf metin) → −1 / 0 / 1 / 2 */
    ratingMap: z.record(z.string().min(1).max(100), z.number().int().min(-1).max(2)).default({}),
    /**
     * Kullanıcı boyutları: ad → özellik. Churn kırılımları bunlardan yapılır (plan, ülke, uygulama sürümü, kaynak…).
     * 'cihaz' boyutu `props.device` + `deviceMap`'ten kendiliğinden gelir. Kimlik benzeri yüksek çeşitlilikli
     * özellikler (e-posta, telefon, kullanıcı adı) BURAYA YAZILMAZ; değer sayısı sınırı aşılırsa 'diğer' olur.
     */
    dims: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,23}$/), zNames).default({}),
    /** Yeni oturum sayılan olaysız süre (dakika). Oynatma sürerken boşluk oturumu bölmez. */
    sessionGapMin: z.number().int().min(1).max(720).default(30),
    /** Churn tanımında "etkinlik" sayılan türler (varsayılan: izleme) */
    activity: z.array(zKind).min(1).default(['PLAY_START', 'PLAY_PROGRESS', 'PLAY_END']),
    /** Tümüyle yok sayılan olay adları (sayılmaz, saklanmaz) */
    ignore: z.array(z.string().min(1).max(255)).default([]),
    /** Eşlenmemiş olaylar 'diğer' etkinlik olarak saklansın mı (uygulamada geçirilen zamanı görmek için) */
    keepUnmapped: z.boolean().default(true),
    /** İçerik adları içerik sözlüğünde saklansın mı */
    storeTitles: z.boolean().default(true),
  })
  .strict()

export type LabMapping = z.infer<typeof zLabMapping>
export type LabMappingInput = z.input<typeof zLabMapping>

export const namesOf = (n: string | string[] | undefined): string[] =>
  n === undefined ? [] : Array.isArray(n) ? n : [n]

/* ───────────── Değer okuma (JSON ve CSV: sayılar metin gelebilir) ───────────── */

export function numOf(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.length > 0 && v.length < 40) {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  if (typeof v === 'boolean') return v ? 1 : 0
  return null
}
export function boolOf(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (s === 'true' || s === '1' || s === 'yes' || s === 'evet') return true
    if (s === 'false' || s === '0' || s === 'no' || s === 'hayır' || s === 'hayir' || s === '') return false
  }
  return null
}
export function strOf(v: unknown): string | null {
  if (typeof v === 'string') return v.length ? v : null
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return null
}

/** Sırayla denenen adlardan ilk dolu değer. */
export function pick(props: Record<string, unknown>, names: readonly string[]): unknown {
  for (const n of names) {
    const v = props[n]
    if (v !== undefined && v !== null && v !== '') return v
  }
  return undefined
}

/* ───────────── Derlenmiş eşleme (içe alma döngüsü için hızlı erişim) ───────────── */

export interface CompiledRule {
  kind: Kind
  when: [string, (string | number | boolean)[]][]
  props: Record<PropField, string[]>
  live: boolean
  empty: boolean
  completed: boolean
}
export interface CompiledMapping {
  raw: LabMapping
  eventKeys: string[]
  userKeys: string[]
  timeKeys: string[]
  rules: Map<string, CompiledRule[]>
  ignore: Set<string>
  dimNames: string[]
  dimKeys: string[][]
  durationScale: number
  deviceMap: Map<string, number>
  typeMap: Map<string, number>
  ratingMap: Map<string, number>
}

const DEVICE_CODE: Record<string, number> = { TV: 1, MOBIL: 2, WEB: 3, DIGER: 4 }
const TYPE_CODE: Record<string, number> = { FILM: 1, BOLUM: 2, CANLI: 3, SPOR: 4, KLIP: 5, DIGER: 6 }

export function compileMapping(input: LabMappingInput | LabMapping): CompiledMapping {
  const raw = zLabMapping.parse(input)
  const base = raw.props
  const merge = (over: PropMap | undefined): Record<PropField, string[]> => {
    const out = {} as Record<PropField, string[]>
    for (const f of PROP_FIELDS) out[f] = namesOf(over?.[f] ?? base[f])
    return out
  }
  const rules = new Map<string, CompiledRule[]>()
  for (const [name, r] of Object.entries(raw.events)) {
    const list = Array.isArray(r) ? r : [r]
    rules.set(
      name,
      list.map((x): CompiledRule => {
        if (typeof x === 'string')
          return { kind: x, when: [], props: merge(undefined), live: false, empty: false, completed: false }
        return {
          kind: x.kind,
          when: Object.entries(x.when ?? {}).map(([k, v]) => [k, Array.isArray(v) ? v : [v]]),
          props: merge(x.props),
          live: x.live ?? false,
          empty: x.empty ?? false,
          completed: x.completed ?? false,
        }
      }),
    )
  }
  const lower = <T>(m: Record<string, T>, f: (v: T) => number): Map<string, number> =>
    new Map(Object.entries(m).map(([k, v]) => [k.toLowerCase(), f(v)]))
  return {
    raw,
    eventKeys: namesOf(raw.eventKey),
    userKeys: namesOf(raw.user.property),
    timeKeys: namesOf(raw.time.property),
    rules,
    ignore: new Set(raw.ignore),
    dimNames: Object.keys(raw.dims),
    dimKeys: Object.values(raw.dims).map(namesOf),
    durationScale: raw.durationUnit === 'ms' ? 0.001 : raw.durationUnit === 'min' ? 60 : 1,
    deviceMap: lower(raw.deviceMap, (v) => DEVICE_CODE[v] ?? 4),
    typeMap: lower(raw.typeMap, (v) => TYPE_CODE[v] ?? 6),
    ratingMap: lower(raw.ratingMap, (v) => v),
  }
}

/** Olayın özelliklerine göre geçerli kural (yoksa null). */
export function matchRule(rules: readonly CompiledRule[], props: Record<string, unknown>): CompiledRule | null {
  outer: for (const r of rules) {
    for (const [key, allowed] of r.when) {
      const v = props[key]
      let ok = false
      for (const a of allowed) {
        // CSV'de sayılar ve mantıksal değerler metin gelebilir: gevşek karşılaştırma
        if (v === a || (v !== undefined && v !== null && String(v) === String(a))) {
          ok = true
          break
        }
      }
      if (!ok) continue outer
    }
    return r
  }
  return null
}

/** Olay anı (epoch saniye, UTC) ya da null. */
/**
 * Zaman metni → ms. Saat dilimi yazılmamış biçimler ('2026-10-01', '2026-10-01 08:00:00', '2026-10-01T08:00:00.5')
 * UTC sayılır — `Date.parse` onları makinenin yerel saatine göre okur ve aynı dosya her makinede başka sonuç verirdi.
 * Proje saat dilimi eşlemedeki `time.offsetMinutes` ile verilir. Dilimli metin (Z, +03:00) olduğu gibi okunur.
 */
export function parseTimeText(text: string): number | null {
  const s = text.trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?)?$/.exec(s)
  if (m) {
    const [y, mo, d, h, mi, se] = [m[1], m[2], m[3], m[4] ?? '0', m[5] ?? '0', m[6] ?? '0'].map(Number)
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 60) return null
    const frac = m[7] ? Number(`0.${m[7]}`) * 1000 : 0
    const t = Date.UTC(y, mo - 1, d, h, mi, se) + frac
    // 31 Şubat gibi taşan tarihler reddedilir
    return new Date(t).getUTCDate() === d ? t : null
  }
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : null
}

export function timeOf(
  m: CompiledMapping,
  props: Record<string, unknown>,
  top: Record<string, unknown>,
): number | null {
  let v: unknown
  for (const k of m.timeKeys) {
    v = props[k] ?? top[k]
    if (v !== undefined && v !== null && v !== '') break
  }
  let sec: number | null = null
  const n = numOf(v)
  if (n !== null) {
    const unit = m.raw.time.unit
    sec = unit === 'ms' || (unit === 'auto' && Math.abs(n) > 1e11) ? n / 1000 : n
  } else if (typeof v === 'string') {
    const t = parseTimeText(v)
    if (t !== null) sec = t / 1000
  }
  if (sec === null) return null
  sec -= m.raw.time.offsetMinutes * 60
  // 2005 öncesi ve 2100 sonrası: bozuk değer
  return sec > 1.1e9 && sec < 4.1e9 ? Math.floor(sec) : null
}
