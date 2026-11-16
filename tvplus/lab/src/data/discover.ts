/**
 * Şema keşfi: kullanıcının Mixpanel dışa aktarımını tarar, olay ve özellik özetini çıkarır ve bir lab eşlemesi
 * (`zLabMapping`) önerir.
 *
 * Gizlilik: rapor yalnız YAPILANDIRMA bilgisi taşır (olay adları, özellik adları, doluluk, tür, çeşitlilik). Özellik
 * DEĞERLERİ yalnız az çeşitli, kısa ve kişisel veri şüphesi olmayan metin/mantıksal özelliklerde ve en az birkaç kez
 * görülmüşse gösterilir. Kullanıcı kimliği, e-posta, telefon, IP, ad, serbest metin hiçbir zaman rapora girmez; kullanıcı
 * sayımı yalnız kimliklerin 53 bitlik özetiyle yapılır ve özetler de rapora yazılmaz.
 *
 * Bellek sınırlıdır: özellik başına en çok 200 farklı değer (sonrası KMV özetiyle tahmin), olay başına en çok 150
 * özellik, en çok 2.000 olay adı, kullanıcı özet kümesi en çok 2 milyon.
 */
import { basename } from 'node:path'
import { clip, dayStr, num, pct, table, type Col } from '../core/format'
import type { Kind } from './events'
import {
  BUILTIN_DEVICE,
  BUILTIN_TYPE,
  expandInputs,
  readEvents,
  readLines,
  type InputFormat,
  type RawEvent,
} from './ingest'
import { PROP_FIELDS, numOf, strOf, zLabMapping, type LabMappingInput, type PropField } from './mapping'

/* ───────────── Dışa açık tipler ───────────── */

export interface PropertyStat {
  name: string
  /** Özelliğin dolu olduğu olay payı (0–1), o olay türü içinde */
  fill: number
  type: 'sayı' | 'metin' | 'mantıksal' | 'nesne' | 'karışık'
  /** Farklı değer sayısı (üst sınırlı tahmin; sınır aşıldıysa `distinctCapped: true`) */
  distinct: number
  distinctCapped: boolean
  numeric?: { min: number; p50: number; max: number }
  /** Yalnız az çeşitli ve kişisel veri OLMAYAN metin/mantıksal özelliklerde: en sık değerler ve payları */
  values?: { value: string; share: number }[]
  /** Kişisel veri şüphesi: neden (ör. 'e-posta', 'telefon', 'IP', 'ad', 'kimlik benzeri'); yoksa null. Şüpheliyse `values` ASLA doldurulmaz. */
  pii: string | null
}
export interface EventStat {
  name: string
  count: number
  share: number
  /** Bu olayı en az bir kez yapan (yaklaşık) farklı kullanıcı sayısı */
  users: number
  props: PropertyStat[]
  suggested: { kind: Kind; confidence: number; why: string } | null
}
export interface DiscoveryReport {
  files: string[]
  format: 'jsonl' | 'json' | 'csv'
  /** Özellikler iç içe `properties` nesnesinde mi (Mixpanel ham dışa aktarımı) yoksa satırın en üst düzeyinde mi */
  propertiesKey: string | null
  lines: number
  bad: number
  /** Taranan olay sayısı (maxLines ile sınırlı; dosyalar arasında dengeli) */
  scanned: number
  firstTs: number | null
  lastTs: number | null
  users: number
  /** Sayıya göre azalan */
  events: EventStat[]
  /** Olayların ≥ %80'inde bulunan özellikler ("süper özellikler"): kullanıcı boyutu adayları */
  common: PropertyStat[]
  /** Kullanıcı kimliği adayı (distinct_id, $user_id, user_id, …) */
  userProperty: string | null
  timeProperty: string | null
  timeUnit: 's' | 'ms' | 'iso' | null
  warnings: string[]
  /** zLabMapping.parse'dan geçer */
  suggestion: LabMappingInput
  /** Öneriyle ilgili insan-okur notlar (emin olunmayan eşlemeler, eksik roller) */
  notes: string[]
}

/* ───────────── Sınırlar ───────────── */

const DEFAULT_MAX_LINES = 400_000
const VALUE_CAP = 200
const PROPS_PER_EVENT = 150
const GLOBAL_PROPS = 600
const MAX_EVENT_NAMES = 2_000
const USER_SET_CAP = 2_000_000
const RESERVOIR = 255
const KMV_PROP = 64
const KMV_USERS = 256
/** Değer gösterimi: en çok bu kadar farklı değer, bu uzunluk, bu kadar en sık değer, değer başına en az görülme */
const SHOW_DISTINCT = 24
const SHOW_LEN = 40
const SHOW_TOP = 12
const SHOW_MIN_COUNT = 3
const CONFIDENT = 0.5
const COMMON_FILL = 0.8
const DIM_MAX_DISTINCT = 400
const MAX_DIMS = 8

const EVENT_KEYS = ['event', 'event_name', 'mp_event_name', 'olay', 'olay_adi', 'event_type', 'name'] as const
const USER_KEYS = [
  'distinct_id',
  '$user_id',
  'user_id',
  'userId',
  'userid',
  'uid',
  'customer_id',
  'account_id',
  'member_id',
  'subscriber_id',
  'kullanici_id',
  'musteri_id',
  'abone_id',
  '$distinct_id',
] as const
const TIME_KEYS = [
  'time',
  'timestamp',
  'event_time',
  '$time',
  'ts',
  'created_at',
  'datetime',
  'date',
  'zaman',
  'tarih',
  'olay_zamani',
  'mp_processing_time_ms',
] as const
const IDENTITY_EVENTS = new Set(['$identify', '$create_alias', '$merge', '$identify_merge', '$alias'])

/* ───────────── Yardımcılar: özet, KMV, ad normalleştirme ───────────── */

/** 53 bitlik hızlı özet (cyrb53) */
function h53(str: string): number {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}
const H_MAX = 2 ** 53

/** K-en-küçük-değer özeti: farklı değer sayısı tahmini (k'nın altındaysa kesin). */
class Kmv {
  private readonly k: number
  private readonly v: number[] = []
  constructor(k: number) {
    this.k = k
  }
  add(h: number): void {
    const a = this.v
    if (a.length === this.k && h >= a[a.length - 1]) return
    let lo = 0
    let hi = a.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (a[mid] < h) lo = mid + 1
      else hi = mid
    }
    if (a[lo] === h) return
    a.splice(lo, 0, h)
    if (a.length > this.k) a.pop()
  }
  estimate(): number {
    const a = this.v
    if (a.length < this.k) return a.length
    return Math.round((this.k - 1) / (a[this.k - 1] / H_MAX))
  }
}

const FOLD: Record<string, string> = { ı: 'i', â: 'a', î: 'i', û: 'u' }
/** Ad → küçük harfli ASCII sözcükler (camelCase, `_`, `-`, boşluk, `$`, nokta ayrılır; Türkçe harfler katlanır). */
export function nameWords(s: string): string[] {
  const spaced = s.replace(/([a-z0-9ğüşöçı])([A-ZĞÜŞÖÇİ])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
  const low = spaced
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ıâîû]/g, (c) => FOLD[c] ?? c)
  return low.split(/[^a-z0-9]+/).filter(Boolean)
}
const snakeOf = (s: string): string => nameWords(s).join('_')

/* ───────────── Kişisel veri sezgileri ───────────── */

const NAME_PII: [RegExp, string][] = [
  [/(^|_)(e_?mail|e_?posta|mail|mail_?address)(_|$)/, 'e-posta'],
  [/(^|_)(phone|telefon|tel|gsm|msisdn|mobile_?number|cep_?(tel|no|numarasi)?)(_|$)/, 'telefon'],
  [/(^|_)(ip|ip_?address|ipv4|ipv6)(_|$)/, 'IP'],
  [/(^|_)(address|adres|street|sokak|postal_?code|zip|zip_?code|posta_?kodu)(_|$)/, 'adres'],
  [
    /^(ad|name|isim)$|(^|_)(soyad|soyadi|surname|first_?name|last_?name|full_?name|given_?name|family_?name|user_?name|username|display_?name|nick_?name|nickname|customer_?name|kullanici_?adi|ad_?soyad)(_|$)/,
    'ad',
  ],
  [/(^|_)(tckn|tc_?kimlik(_?no)?|kimlik(_?no)?|national_?id|ssn|passport|pasaport)(_|$)/, 'kimlik numarası'],
  [/(^|_)(birth|birthday|birth_?date|dob|dogum|dogum_?tarihi)(_|$)/, 'doğum tarihi'],
  [/(^|_)(token|password|passwd|sifre|secret|api_?key|auth)(_|$)/, 'gizli bilgi'],
  [/(^|_)(lat|latitude|lon|lng|longitude|geo|geolocation|coordinates?|gps)(_|$)/, 'konum'],
  [/(^|_)(device_?id|idfa|idfv|gaid|imei|advertising_?id|android_?id|mac_?address)(_|$)/, 'cihaz kimliği'],
  [
    /(^|_)(search_?term|search_?query|search_?text|query|sorgu|keyword|term|arama_?(metni|terimi|kelimesi|sorgusu)|comment|yorum|message|mesaj|feedback)(_|$)/,
    'serbest metin',
  ],
  [/(^|_)(url|uri|referrer|referer|referring|href|link)(_|$)/, 'bağlantı'],
  [
    /(^|_)(distinct_?id|user_?id|userid|uid|insert_?id|anon_?id|anonymous_?id|customer_?id|account_?id|member_?id|subscriber_?id|kullanici_?id|musteri_?id|abone_?id|profile_?id|session_?id|uuid|guid)(_|$)/,
    'kimlik benzeri',
  ],
]
/** Özellik adından kişisel veri şüphesi */
export function namePii(name: string): string | null {
  const j = snakeOf(name)
  for (const [re, why] of NAME_PII) if (re.test(j)) return why
  return null
}

const RE_EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i
const RE_IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/
const RE_IPV6 = /^(?=[0-9a-f:]*(::|:[0-9a-f]*:[0-9a-f]*:))[0-9a-f:]{6,39}$/i
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RE_PHONE_TR = /^(\+?90|0)?5\d{9}$/
/** Metin değerinden kişisel veri şüphesi */
export function valuePii(s: string): string | null {
  if (s.length < 6 || s.length > 300) return null
  if (RE_EMAIL.test(s)) return 'e-posta'
  if (RE_IPV4.test(s) || RE_IPV6.test(s)) return 'IP'
  const d = s.replace(/[\s()\-.]/g, '')
  if (RE_PHONE_TR.test(d) || /^\+\d{10,13}$/.test(d)) return 'telefon'
  if (RE_UUID.test(s) || (/^[0-9a-f]{16,}$/i.test(s) && /\d/.test(s) && /[a-f]/i.test(s))) return 'kimlik benzeri'
  if (/^\d{12,}$/.test(d)) {
    const n = Number(d)
    // 13 haneli milisaniye zaman damgası kimlik sayılmaz
    if (!(d.length === 13 && n > 9e11 && n < 5e12)) return 'kimlik benzeri'
  }
  return null
}

/* ───────────── Değer sınıflama ───────────── */

const RE_NUMERIC = /^-?(0|[1-9]\d{0,14})(\.\d+)?$/
type VKind = 'n' | 's' | 'b' | 'o'

/* ───────────── Özellik biriktirici ───────────── */

let seedState = 0x9e3779b9
function rand(): number {
  seedState = (seedState + 0x6d2b79f5) | 0
  let t = seedState
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

class PropAcc {
  filled = 0
  nNum = 0
  nStr = 0
  nBool = 0
  nObj = 0
  min = Infinity
  max = -Infinity
  nonInt = false
  numSeen = 0
  readonly res: number[] = []
  readonly vals = new Map<string, number>()
  capped = false
  readonly kmv = new Kmv(KMV_PROP)
  pii: string | null = null
  longest = 0

  add(kind: VKind, key: string, n: number, h: number): void {
    this.filled++
    if (kind === 'n') {
      this.nNum++
      if (n < this.min) this.min = n
      if (n > this.max) this.max = n
      if (!this.nonInt && !Number.isInteger(n)) this.nonInt = true
      this.numSeen++
      if (this.res.length < RESERVOIR) this.res.push(n)
      else {
        const j = Math.floor(rand() * this.numSeen)
        if (j < RESERVOIR) this.res[j] = n
      }
      if (this.pii === null && Number.isInteger(n) && n > 5e9 && RE_PHONE_TR.test(String(n))) this.pii = 'telefon'
    } else if (kind === 's') this.nStr++
    else if (kind === 'b') this.nBool++
    else this.nObj++
    if (key.length > this.longest) this.longest = key.length
    this.kmv.add(h)
    const c = this.vals.get(key)
    if (c !== undefined) this.vals.set(key, c + 1)
    else if (!this.capped) {
      if (this.vals.size >= VALUE_CAP) this.capped = true
      else {
        this.vals.set(key, 1)
        if (this.pii === null && kind === 's') this.pii = valuePii(key)
      }
    }
    // Sınır aşıldıktan sonra da ara sıra değer denetimi
    if (this.capped && kind === 's' && this.pii === null && (this.filled & 63) === 0) this.pii = valuePii(key)
  }

  distinct(): number {
    return this.capped ? Math.max(VALUE_CAP + 1, this.kmv.estimate()) : this.vals.size
  }
  type(): PropertyStat['type'] {
    const f = this.filled || 1
    const parts: [PropertyStat['type'], number][] = [
      ['sayı', this.nNum],
      ['metin', this.nStr],
      ['mantıksal', this.nBool],
      ['nesne', this.nObj],
    ]
    for (const [t, c] of parts) if (c >= 0.95 * f) return t
    return 'karışık'
  }
  p50(): number {
    if (!this.res.length) return NaN
    const s = [...this.res].sort((a, b) => a - b)
    return s[Math.floor(s.length / 2)]
  }
  /** Yüksek çeşitlilikli metin: dolu değerlerin yarısından fazlası farklı ve sınır aşılmış */
  highCardText(): boolean {
    return this.capped && this.nStr >= 0.5 * this.filled && this.kmv.estimate() > 0.5 * this.filled
  }
}

class EventAcc {
  count = 0
  readonly users = new Kmv(KMV_USERS)
  readonly props = new Map<string, PropAcc>()
  overflow = 0
  readonly name: string
  constructor(name: string) {
    this.name = name
  }
}

/* ───────────── Olay adı → tür ───────────── */

interface Guess {
  kind: Kind
  confidence: number
  why: string
  empty?: boolean
  completed?: boolean
}

const PLAYCTX =
  /\b(play\w*|video\w*|stream\w*|player|watch\w*|izle\w*|oynat\w*|yayin\w*|vod|episode|movie|film|bolum|content|icerik|live|canli)\b/
const ERRCTX = /\b(play\w*|video\w*|stream\w*|player|oynat\w*|izle\w*|yayin\w*|drm|manifest)\b/
const SUBCTX = /\b(subscri\w*|purchas\w*|satin|abone\w*|uyelik\w*|membership|plan|trial)\b/
const FAILWORD = /\b(fail\w*|error\w*|hata\w*|basarisiz\w*)\b/

/** Olay adından kanonik tür tahmini (daha özgül kural önce). */
export function classifyEvent(raw: string): Guess | null {
  const w = nameWords(raw)
  const n = w.join(' ')
  const g = (kind: Kind, confidence: number, why: string, extra: Partial<Guess> = {}): Guess => ({
    kind,
    confidence,
    why,
    ...extra,
  })
  const pick = (): Guess | null => {
    if (raw === '$experiment_started') return g('EXPOSURE', 0.95, 'Mixpanel deney olayı')
    if (/\b(experiment\w*|deney\w*|ab test\w*|abtest\w*)\b/.test(n)) return g('EXPOSURE', 0.7, "ad: 'deney'")
    if (/\b(no results?|zero results?|sonucsuz|bulunamadi|empty search|null search)\b/.test(n))
      return g('SEARCH', 0.8, "ad: 'sonuçsuz arama'", { empty: true })
    if (
      /\b(payment|odeme\w*|billing|charge)\b/.test(n) &&
      /\b(fail\w*|hata\w*|declin\w*|basarisiz\w*|error\w*|reddedildi)\b/.test(n)
    )
      return g('PAYMENT_FAIL', 0.85, "ad: 'ödeme hatası'")
    if (SUBCTX.test(n)) {
      if (/\b(cancel\w*|iptal\w*|churn\w*)\b/.test(n)) return g('CANCEL', 0.85, "ad: 'abonelik iptali'")
      if (/\b(renew\w*|yenile\w*|recurr\w*|rebill\w*)\b/.test(n)) return g('RENEW', 0.85, "ad: 'yenileme'")
      if (/\b(expire\w*|lapse\w*|sona|bitti|ended|end)\b/.test(n)) return g('EXPIRE', 0.75, "ad: 'abonelik sonu'")
      if (
        /\b(start\w*|new|basla\w*|complete\w*|success\w*|tamamla\w*|creat\w*|activat\w*|purchas\w*|satin|aldi|olusturuldu)\b/.test(
          n,
        )
      )
        return g('SUBSCRIBE', 0.8, "ad: 'abonelik başı'")
      return g('SUBSCRIBE', 0.4, 'ad: abonelikle ilgili ama eylem belirsiz')
    }
    if (/\bunsubscri\w*\b/.test(n)) return g('CANCEL', 0.6, "ad: 'unsubscribe'")
    if (/\b(push|notif\w*|bildirim\w*)\b/.test(n)) {
      if (/\b(open\w*|click\w*|tap\w*|tikla\w*|acil\w*|acti|acildi)\b/.test(n))
        return g('NOTIF_OPEN', 0.85, "ad: 'bildirim açma'")
      return null
    }
    if (/\b(error\w*|fail\w*|hata\w*|basarisiz\w*|crash\w*)\b/.test(n) && ERRCTX.test(n))
      return g('PLAY_ERROR', 0.85, 'ad: hata + oynatma bağlamı')
    if (/\b(buffer\w*|rebuffer\w*|stall\w*|takil\w*|donma\w*|dondu)\b/.test(n))
      return g('BUFFER', 0.85, "ad: 'takılma'")
    if (
      /\b(play\w*|video\w*|stream\w*|watch\w*|izle\w*|oynat\w*|content|yayin\w*)\b.*\b(start\w*|begin\w*|basla\w*)\b/.test(
        n,
      )
    )
      return g('PLAY_START', 0.85, "ad: 'oynatma başı'")
    if (/\b(content|video|media) play(ed)?$/.test(n)) return g('PLAY_START', 0.75, "ad: 'içerik oynatıldı'")
    if (/^(play|played|oynat|izle)$/.test(n)) return g('PLAY_START', 0.6, "ad: 'oynat'")
    if (/\b(heartbeat\w*|progress\w*|ilerleme\w*|tick|ping|quartile\w*|milestone\w*)\b/.test(n))
      return g('PLAY_PROGRESS', PLAYCTX.test(n) ? 0.85 : 0.7, "ad: 'ilerleme / nabız'")
    if (/\bwatch\w* time\b/.test(n)) return g('PLAY_PROGRESS', 0.75, "ad: 'izleme süresi'")
    if (
      PLAYCTX.test(n) &&
      /\b(stop\w*|end|ended|complete\w*|finish\w*|exit\w*|close\w*|bitti|durdu\w*|kapandi|kapat\w*|sonlandi|tamamla\w*)\b/.test(
        n,
      )
    ) {
      const done = /\b(complete\w*|finish\w*|tamamla\w*)\b/.test(n) && !/\b(stop\w*|durdu\w*)\b/.test(n)
      return g('PLAY_END', 0.85, "ad: 'oynatma sonu'", done ? { completed: true } : {})
    }
    if (/\b(error\w*|crash\w*|exception\w*|hata\w*|cokme\w*|coktu)\b/.test(n))
      return g('APP_ERROR', 0.7, "ad: 'hata' (oynatma bağlamı yok)")
    if (/\b(sign ?up\w*|register\w*|registration|kayit\w*|uye ol\w*|account creat\w*|hesap olustur\w*)\b/.test(n))
      return g('SIGNUP', 0.85, "ad: 'kayıt'")
    if (/\b(log ?in\w*|sign ?in\w*|signin|giris\w*|oturum ac\w*)\b/.test(n)) return g('LOGIN', 0.85, "ad: 'giriş'")
    if (/\b(app\w*|application|uygulama\w*)\b.*\b(open\w*|launch\w*|start\w*|ac\w*|foreground\w*)\b/.test(n))
      return g('APP_OPEN', 0.85, "ad: 'uygulama açılışı'")
    if (raw === '$ae_session' || /\b(launch\w*|session start\w*|ae session|oturum basla\w*)\b/.test(n))
      return g('APP_OPEN', 0.8, "ad: 'oturum başı'")
    const listy = /\b(list\w*|favori\w*|watchlist|listem\w*|liste\w*|bookmark\w*)\b/.test(n)
    if (listy && /\b(remove\w*|kaldir\w*|cikar\w*|sil\w*|delete\w*|unfavori\w*)\b/.test(n))
      return g('LIST_REMOVE', 0.85, "ad: 'listeden çıkarma'")
    if (listy && /\b(add\w*|ekle\w*|save\w*|kaydet\w*)\b/.test(n)) return g('LIST_ADD', 0.85, "ad: 'listeye ekleme'")
    if (/\b(favori\w*|bookmark\w*|watchlist)\b/.test(n)) return g('LIST_ADD', 0.6, "ad: 'favori'")
    if (/\b(rate|rated|rating\w*|like|liked|dislike\w*|begen\w*|thumbs?\w*|puan\w*)\b/.test(n))
      return g('RATING', 0.8, "ad: 'beğeni / puan'")
    if (
      /\b(impression\w*|gosterim\w*|shown|displayed)\b/.test(n) ||
      /\b(card|tile|poster|rail|row) (view\w*|shown|seen)\b/.test(n) ||
      /\bviewed (card|tile)\b/.test(n)
    )
      return g('IMPRESSION', 0.8, "ad: 'gösterim'")
    if (/\b(click\w*|select\w*|tap|taps|tapped|tikla\w*|secil\w*|secti)\b/.test(n) || /\bdetail\w* open\w*\b/.test(n))
      return g('CLICK', 0.75, "ad: 'tıklama / seçim'")
    const screeny = /\b(screen\w*|page\w*|pageview\w*|sayfa\w*|ekran\w*)\b/.test(n)
    if (!screeny && /\b(search\w*|ara|arama\w*|arandi|aradi)\b/.test(n)) return g('SEARCH', 0.8, "ad: 'arama'")
    if (/\b(screen\w*|page ?view\w*|sayfa\w*|ekran\w*)\b/.test(n) || /\bpage\b/.test(n))
      return g('SCREEN', 0.8, "ad: 'ekran / sayfa'")
    return null
  }
  const r = pick()
  if (r && r.kind !== 'PLAY_ERROR' && r.kind !== 'APP_ERROR' && r.kind !== 'PAYMENT_FAIL' && FAILWORD.test(n))
    return { ...r, confidence: Math.min(r.confidence, 0.45), why: `${r.why}; adda 'hata/başarısız' var` }
  return r
}

/* ───────────── Özellik adı → alan ───────────── */

type FieldHit = { field: PropField; conf: number }
const PLAY_SET = new Set<Kind>(['PLAY_START', 'PLAY_PROGRESS', 'PLAY_END'])
const LIST_SET = new Set<Kind>(['IMPRESSION', 'CLICK'])

function fieldsFor(name: string, st: PropAcc, kinds: Set<Kind>): FieldHit[] {
  const s = snakeOf(name)
  const numeric = st.nNum >= 0.8 * st.filled
  const isPlay = [...kinds].some((k) => PLAY_SET.has(k))
  const isList = [...kinds].some((k) => LIST_SET.has(k))
  const one = (field: PropField, conf: number): FieldHit[] => [{ field, conf }]
  if (numeric && /^(row|rail|shelf|satir|raf)(_(index|idx|no|number|num|position|sira))?$/.test(s))
    return one('row', 0.85)
  if (numeric && /buffer/.test(s) && /(duration|time|sec|seconds|ms|sure|length)/.test(s))
    return one('bufferDuration', 0.85)
  if (
    numeric &&
    /(^|_)(watch(ed)?_?(time|duration|sec|seconds|ms|sure)|play_?time|played_?(time|duration|sec)|izlenen(_sure)?|izleme_?suresi|view_?duration|viewing_?time)/.test(
      s,
    )
  )
    return one('watched', 0.85)
  const posLike = /(^|_)(position|playhead|current_?time|konum|offset|pos)(_|$)/.test(s)
  const rankLike = /(^|_)(rank|ranking|sira|slot|index|idx|pos|position)$/.test(s)
  if (numeric && posLike) {
    const out: FieldHit[] = []
    if (rankLike && isList) out.push({ field: 'rank', conf: 0.8 })
    if (!rankLike || isPlay || !isList) out.push({ field: 'position', conf: isPlay ? 0.85 : 0.6 })
    return out
  }
  if (numeric && rankLike && isList) return one('rank', 0.8)
  if (
    numeric &&
    /(^|_)(duration|runtime|length|sure|uzunluk)(_|$)/.test(s) &&
    !/(session|watch|buffer|play|izlenen|oturum)/.test(s)
  )
    return one(
      'duration',
      /(content|video|asset|program|media|icerik|episode|movie|total|toplam)/.test(s) ||
        /^(duration|runtime|sure)/.test(s)
        ? 0.85
        : 0.6,
    )
  if (/^(content|video|asset|item|program|icerik|media|movie|episode|title|stream|channel)_?id$/.test(s))
    return one('contentId', 0.9)
  if (/^(series|show|dizi|parent|season_?parent)_?id$/.test(s)) return one('seriesId', 0.85)
  if (/^(content|video|program|media|icerik|movie|episode)_?(title|name|adi|basligi)$|^(title|baslik)$/.test(s))
    return one('contentTitle', 0.85)
  if (/^(content|video|asset|program|media|icerik)_?(type|kind|turu|tipi|tur)$|^(type|tur|kind)$/.test(s)) {
    const keys = [...st.vals.keys()]
    const known = keys.filter((k) => BUILTIN_TYPE[k.trim().toLowerCase()] !== undefined).length
    return one('contentType', keys.length && known >= 0.5 * keys.length ? 0.9 : s.includes('_') ? 0.7 : 0.45)
  }
  if (/(^|_)(genre|genres|category|categories|kategori|kategoriler|janr)$/.test(s)) return one('genre', 0.8)
  if (numeric && /^(season|sezon)(_(number|no|num|nr|index))?$/.test(s)) return one('season', 0.85)
  if (numeric && /^(episode|bolum)(_(number|no|num|nr|index))?$/.test(s)) return one('episode', 0.85)
  if (/^(is_)?(complete|completed|finished|tamamlandi|bitti)$/.test(s)) return one('completed', 0.8)
  if (/^(is_)?(live|canli)$|^live_?(stream|tv)$/.test(s)) return one('live', 0.8)
  if (/^platform$/.test(s)) return one('device', 0.9)
  if (/^(device_?(type|category|class|family)|cihaz(_?(turu|tipi|sinifi))?)$/.test(s)) return one('device', 0.85)
  if (/^os$/.test(s)) return one('device', 0.6)
  if (/^(error|err|hata)_?(code|type|id|name|reason|kodu|kod|turu)$|^reason_?code$/.test(s))
    return one('errorCode', 0.85)
  if (numeric && /^(results?_?count|num_?results|result_?total|total_?results|sonuc_?sayisi|hit_?count|hits)$/.test(s))
    return one('resultCount', 0.9)
  if (/^(screen|page|ekran|sayfa)(_?(name|title|adi))?$|^current_?(screen|page)$/.test(s)) return one('screen', 0.85)
  if (/^(experiment|deney|ab_?test)(_?(name|id|adi|key))?$/.test(s)) return one('experiment', 0.9)
  if (/^(variant|varyant|kol|treatment|experiment_?group|ab_?group)(_?(name|id|adi|key))?$/.test(s))
    return one('variant', 0.9)
  if (numeric && /(^|_)(price|amount|revenue|tutar|fiyat|ucret|odeme_?tutari)$/.test(s)) return one('amount', 0.8)
  if (/^(rating|rate|score|puan|stars?|begeni|thumbs?)(_?(value|deger))?$/.test(s)) return one('rating', 0.75)
  return []
}

/* ───────────── Boyut adları ───────────── */

const DIM_NAMES: [RegExp, string][] = [
  [/^platform$/, 'platform'],
  [/(^|_)os_?version$/, 'os_surum'],
  [/(^|_)(app_?)?(version|release|surum|ver)(_?(string|name|code))?$/, 'surum'],
  [/(^|_)(plan|plan_?type|plan_?name|tier|paket|package|subscription_?(type|plan|tier))$/, 'plan'],
  [/(acquisition|utm_?source|utm_?medium|channel|kaynak|source|campaign|kanal)/, 'kaynak'],
  [/(country|ulke)/, 'ulke'],
  [/(^|_)(city|sehir|il)$/, 'sehir'],
  [/(^|_)(region|bolge)$/, 'bolge'],
  [/(^|_)(lang|language|dil|locale)(_|$)/, 'dil'],
  [/^os$/, 'os'],
  [/browser/, 'tarayici'],
  [/(carrier|operator)/, 'operator'],
  [/(manufacturer|brand)/, 'marka'],
  [/(^|_)model$/, 'model'],
]
const DIM_ORDER = ['platform', 'surum', 'plan', 'kaynak', 'ulke', 'sehir', 'dil', 'os']
const NOT_DIM =
  /^(mp_(?!country)|lib|lib_version|mp_api|insert_id|import|synthetic|token|screen_(height|width|dpi)|has_|wifi)/

function dimNameOf(prop: string): string {
  const s = snakeOf(prop)
  for (const [re, n] of DIM_NAMES) if (re.test(s)) return n
  let slug = s
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  if (!/^[a-z]/.test(slug)) slug = `b_${slug}`
  return slug.slice(0, 24)
}

/* ───────────── Değer sözlüğü önerileri ───────────── */

function guessDevice(v: string): 'TV' | 'MOBIL' | 'WEB' | null {
  const s = v.toLowerCase()
  if (/(tv|roku|tizen|webos|stb|chromecast|fire ?stick|set.?top|vizio|hisense|vestel|console|xbox|playstation)/.test(s))
    return 'TV'
  if (/(ios|iphone|ipad|android|mobile|mobil|phone|tablet|huawei|harmony)/.test(s)) return 'MOBIL'
  if (/(web|browser|chrome|safari|firefox|edge|desktop|windows|mac|linux|pc)/.test(s)) return 'WEB'
  return null
}
function guessType(v: string): 'FILM' | 'BOLUM' | 'CANLI' | 'SPOR' | 'KLIP' | null {
  const s = nameWords(v).join(' ')
  if (/(sport|spor|match|mac)/.test(s)) return 'SPOR'
  if (/(live|canli|linear|channel|kanal)/.test(s)) return 'CANLI'
  if (/(trailer|clip|fragman|teaser|preview|klip|short)/.test(s)) return 'KLIP'
  if (/(episode|bolum|series|dizi|show)/.test(s)) return 'BOLUM'
  if (/(film|movie|vod|feature)/.test(s)) return 'FILM'
  return null
}

/* ───────────── Tarama ───────────── */

async function sniffFormat(path: string): Promise<InputFormat> {
  for await (const lines of readLines(path)) {
    for (const line of lines) {
      const t = line.replace(/^﻿/, '').trimStart()
      if (!t) continue
      return t[0] === '{' ? 'jsonl' : t[0] === '[' ? 'json' : 'csv'
    }
  }
  return 'jsonl'
}

interface TimeAcc {
  ok: number
  s: number
  ms: number
  iso: number
  min: number
  max: number
}

function finalizeProp(name: string, a: PropAcc, total: number, extraPii: string | null): PropertyStat {
  const pii = namePii(name) ?? extraPii ?? a.pii ?? (a.highCardText() ? 'kimlik benzeri' : null)
  const type = a.type()
  const st: PropertyStat = {
    name,
    fill: total ? a.filled / total : 0,
    type,
    distinct: a.distinct(),
    distinctCapped: a.capped,
    pii,
  }
  if (pii === null && a.nNum > 0 && a.nNum >= 0.5 * a.filled && Number.isFinite(a.min))
    st.numeric = { min: a.min, p50: a.p50(), max: a.max }
  if (
    pii === null &&
    (type === 'metin' || type === 'mantıksal') &&
    !a.capped &&
    a.vals.size <= SHOW_DISTINCT &&
    a.longest <= SHOW_LEN
  ) {
    const top = [...a.vals]
      .filter(([, c]) => c >= SHOW_MIN_COUNT)
      .sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))
      .slice(0, SHOW_TOP)
    if (top.length) st.values = top.map(([value, c]) => ({ value, share: c / (a.filled || 1) }))
  }
  return st
}

export async function discover(paths: readonly string[], opts: { maxLines?: number } = {}): Promise<DiscoveryReport> {
  const files = expandInputs(paths)
  if (!files.length) throw new Error('Taranacak dosya bulunamadı.')
  const maxLines = Math.max(1, Math.floor(opts.maxLines ?? DEFAULT_MAX_LINES))
  const warnings: string[] = []
  seedState = 0x9e3779b9

  const formats: InputFormat[] = []
  let lines = 0
  let bad = 0
  let scanned = 0
  let noName = 0
  let withUser = 0
  let withTime = 0
  let nestedRows = 0
  let limitHit = false
  const eventKeyHits = new Map<string, number>()
  const userHits = new Map<string, number>()
  const timeAcc = new Map<string, TimeAcc>()
  const userSet = new Set<number>()
  let userSetFull = false
  const events = new Map<string, EventAcc>()
  let otherEvents: EventAcc | null = null
  const global = new Map<string, PropAcc>()
  let globalOverflow = false
  let isCsv = false

  for (let fi = 0; fi < files.length; fi++) {
    const file = files[fi]
    const fmt = await sniffFormat(file)
    formats.push(fmt)
    isCsv = fmt === 'csv'
    const budget = Math.max(1, Math.floor((maxLines - scanned) / (files.length - fi)))
    let taken = 0
    const handle = (ev: RawEvent): void => {
      const top = ev.top
      const props = ev.props
      if (props !== top) nestedRows++
      // Olay adı
      let name: string | null = null
      let usedKey = ''
      for (const k of EVENT_KEYS) {
        const v = top[k] ?? (props !== top ? props[k] : undefined)
        const s = strOf(v)
        if (s) {
          name = s
          usedKey = k
          break
        }
      }
      if (!name) {
        noName++
        bad++
        return
      }
      eventKeyHits.set(usedKey, (eventKeyHits.get(usedKey) ?? 0) + 1)
      // Kullanıcı
      let uid: string | null = null
      for (const k of USER_KEYS) {
        const s = strOf(props[k] ?? top[k])
        if (s) {
          userHits.set(k, (userHits.get(k) ?? 0) + 1)
          if (uid === null) uid = s
        }
      }
      if (uid !== null) withUser++
      const uh = uid === null ? null : h53(uid)
      if (uh !== null) {
        if (userSet.size < USER_SET_CAP) userSet.add(uh)
        else if (!userSet.has(uh)) userSetFull = true
      }
      // Zaman
      let gotTime = false
      for (const k of TIME_KEYS) {
        const v = props[k] ?? top[k]
        if (v === undefined || v === null || v === '') continue
        let sec: number | null = null
        let unit: 's' | 'ms' | 'iso' = 's'
        const n = numOf(v)
        if (n !== null) {
          unit = Math.abs(n) > 1e11 ? 'ms' : 's'
          sec = unit === 'ms' ? n / 1000 : n
        } else if (typeof v === 'string') {
          const t = Date.parse(v)
          if (Number.isFinite(t)) {
            sec = t / 1000
            unit = 'iso'
          }
        }
        if (sec === null || !(sec > 1.1e9 && sec < 4.1e9)) continue
        let ta = timeAcc.get(k)
        if (!ta) timeAcc.set(k, (ta = { ok: 0, s: 0, ms: 0, iso: 0, min: Infinity, max: -Infinity }))
        ta.ok++
        gotTime = true
        ta[unit]++
        if (sec < ta.min) ta.min = sec
        if (sec > ta.max) ta.max = sec
      }
      if (gotTime) withTime++
      // Olay biriktirici
      let acc = events.get(name)
      if (!acc) {
        if (events.size < MAX_EVENT_NAMES) events.set(name, (acc = new EventAcc(name)))
        else acc = otherEvents ??= new EventAcc('(diğer olay adları)')
      }
      acc.count++
      if (uh !== null) acc.users.add(uh)
      // Özellikler
      for (const key in props) {
        if (key === usedKey) continue
        const v = props[key]
        if (v === undefined || v === null || v === '') continue
        let kind: VKind
        let sv: string
        let n = NaN
        if (typeof v === 'number') {
          if (!Number.isFinite(v)) continue
          kind = 'n'
          n = v
          sv = String(v)
        } else if (typeof v === 'boolean') {
          kind = 'b'
          sv = v ? 'true' : 'false'
        } else if (typeof v === 'string') {
          sv = v.length > 100 ? v.slice(0, 100) : v
          if (v.length <= 20 && RE_NUMERIC.test(v)) {
            kind = 'n'
            n = Number(v)
          } else if (isCsv && (v === 'true' || v === 'false')) kind = 'b'
          else kind = 's'
        } else {
          kind = 'o'
          let j = ''
          try {
            j = JSON.stringify(v) ?? ''
          } catch {
            j = '[nesne]'
          }
          sv = j.length > 100 ? j.slice(0, 100) : j
        }
        const h = h53(sv)
        let pa = acc.props.get(key)
        if (!pa) {
          if (acc.props.size < PROPS_PER_EVENT) acc.props.set(key, (pa = new PropAcc()))
          else acc.overflow++
        }
        pa?.add(kind, sv, n, h)
        let ga = global.get(key)
        if (!ga) {
          if (global.size < GLOBAL_PROPS) global.set(key, (ga = new PropAcc()))
          else globalOverflow = true
        }
        ga?.add(kind, sv, n, h)
      }
    }
    outer: for await (const batch of readEvents(file, {
      propertiesKey: 'properties',
      onBad: () => {
        lines++
        bad++
      },
    })) {
      for (const ev of batch) {
        if (taken >= budget) {
          limitHit = true
          break outer
        }
        lines++
        taken++
        scanned++
        handle(ev)
      }
    }
  }

  /* ── Ana roller ── */
  const named = scanned - noName
  const eventKeys = [...eventKeyHits]
    .filter(([, c]) => c >= Math.max(1, 0.01 * named))
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
  const eventKey = eventKeys[0] ?? 'event'
  const isEventKey = (k: string): boolean => eventKeys.includes(k) || k === eventKey
  const propertiesKey = nestedRows > 0.5 * Math.max(1, scanned) ? 'properties' : null
  // Birden çok kaynak (ör. farklı dışa aktarımlar) farklı adlar kullanabilir: %1'den fazla olayda geçen adların hepsi
  const minHits = Math.max(1, 0.01 * named)
  const userKeys = USER_KEYS.filter((k) => (userHits.get(k) ?? 0) >= minHits).sort(
    (a, b) => (userHits.get(b) ?? 0) - (userHits.get(a) ?? 0),
  )
  const userProperty: string | null = userKeys[0] ?? null
  if (userProperty === null)
    warnings.push('Kullanıcı kimliği özelliği bulunamadı (distinct_id, user_id …); eşlemeye elle yazın.')
  else if (withUser < 0.95 * named)
    warnings.push(`Olayların ${pct(1 - withUser / Math.max(1, named))} kadarında kullanıcı kimliği yok.`)
  const timeKeys = TIME_KEYS.filter((k) => (timeAcc.get(k)?.ok ?? 0) >= minHits).sort(
    (a, b) => (timeAcc.get(b)?.ok ?? 0) - (timeAcc.get(a)?.ok ?? 0),
  )
  const timeProperty: string | null = timeKeys[0] ?? null
  let timeUnit: DiscoveryReport['timeUnit'] = null
  let firstTs: number | null = null
  let lastTs: number | null = null
  if (timeProperty !== null) {
    const best = timeAcc.get(timeProperty) as TimeAcc
    timeUnit = best.iso >= best.s && best.iso >= best.ms ? 'iso' : best.ms > best.s ? 'ms' : 's'
    for (const k of timeKeys) {
      const t = timeAcc.get(k) as TimeAcc
      firstTs = Math.floor(firstTs === null ? t.min : Math.min(firstTs, t.min))
      lastTs = Math.floor(lastTs === null ? t.max : Math.max(lastTs, t.max))
    }
    if (withTime < 0.95 * named)
      warnings.push(`Olayların ${pct(1 - withTime / Math.max(1, named))} kadarında zaman okunamadı.`)
    const mixed = Math.min(best.s + best.ms, best.iso) + Math.min(best.s, best.ms)
    if (mixed > 0)
      warnings.push(
        `Zaman birimi karışık (${timeProperty}: s ${num(best.s)}, ms ${num(best.ms)}, ISO ${num(best.iso)}); 'auto' okur.`,
      )
  } else warnings.push('Zaman özelliği bulunamadı (time, timestamp …); eşlemeye elle yazın.')
  const isUserKey = (k: string): boolean => k === userProperty || (USER_KEYS as readonly string[]).includes(k)

  /* ── Olaylar ── */
  const evList = [...events.values()]
  if (otherEvents) evList.push(otherEvents)
  evList.sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1))
  const total = Math.max(1, named)
  const guesses = new Map<string, Guess | null>()
  for (const e of evList)
    guesses.set(e.name, e === otherEvents || IDENTITY_EVENTS.has(e.name) ? null : classifyEvent(e.name))

  const eventStats: EventStat[] = evList.map((e) => {
    const g = guesses.get(e.name) ?? null
    const props = [...e.props]
      .map(([k, a]) => finalizeProp(k, a, e.count, isUserKey(k) ? 'kimlik benzeri' : null))
      .sort((x, y) => y.fill - x.fill || (x.name < y.name ? -1 : 1))
    return {
      name: e.name,
      count: e.count,
      share: e.count / total,
      users: e.users.estimate(),
      props,
      suggested: g ? { kind: g.kind, confidence: g.confidence, why: g.why } : null,
    }
  })

  const common = [...global]
    .filter(([k, a]) => a.filled >= COMMON_FILL * total && !isEventKey(k))
    .map(([k, a]) => finalizeProp(k, a, total, isUserKey(k) ? 'kimlik benzeri' : null))
    .sort((x, y) => y.fill - x.fill || (x.name < y.name ? -1 : 1))

  /* ── Öneri: olaylar ── */
  const notes: string[] = []
  const mappedEvents: Record<string, unknown> = {}
  const ignore: string[] = []
  const kindOf = new Map<string, Kind>()
  const unsure: string[] = []
  const unmapped: string[] = []
  for (const e of evList) {
    if (e === otherEvents) continue
    if (IDENTITY_EVENTS.has(e.name)) {
      ignore.push(e.name)
      continue
    }
    if (valuePii(e.name)) {
      warnings.push('Bir olay adı kişisel veri gibi görünüyor; öneriye alınmadı.')
      continue
    }
    const g = guesses.get(e.name) ?? null
    if (g && g.confidence >= CONFIDENT) {
      kindOf.set(e.name, g.kind)
      const extra: Record<string, unknown> = {}
      if (g.empty) extra.empty = true
      if (g.completed) extra.completed = true
      mappedEvents[e.name] = Object.keys(extra).length ? { kind: g.kind, ...extra } : g.kind
      continue
    }
    // Tek olay adı birden çok türü taşıyor olabilir: eylem benzeri özelliğin değerlerine göre koşullu kural
    const split = splitByAction(e)
    if (split) {
      mappedEvents[e.name] = split.rules
      for (const r of split.rules) if (!kindOf.has(e.name)) kindOf.set(e.name, r.kind)
      notes.push(
        `'${clipName(e.name)}' tek ad, birden çok tür: '${split.prop}' değerine göre ${split.rules.length} kural (gözden geçirin).`,
      )
      continue
    }
    if (g) unsure.push(`${clipName(e.name)} → ${g.kind}? (${g.confidence.toFixed(2)})`)
    else if (e.count >= 0.005 * total) unmapped.push(clipName(e.name))
  }
  if (unsure.length)
    notes.push(`Emin değilim, eşlemeye konmadı: ${unsure.slice(0, 8).join(' · ')}${unsure.length > 8 ? ' …' : ''}`)
  if (unmapped.length)
    notes.push(
      `Eşlenmedi ('diğer' sayılır): ${unmapped.slice(0, 10).join(', ')}${unmapped.length > 10 ? ` … +${unmapped.length - 10}` : ''}`,
    )

  /* ── Öneri: özellikler ── */
  const kindsOfProp = (prop: string): Set<Kind> => {
    const out = new Set<Kind>()
    for (const e of evList) {
      const k = kindOf.get(e.name)
      if (k && e.props.has(prop)) out.add(k)
    }
    return out
  }
  const cands = new Map<PropField, { name: string; conf: number; count: number }[]>()
  for (const [name, a] of global) {
    if (isEventKey(name) || isUserKey(name) || name === timeProperty || (TIME_KEYS as readonly string[]).includes(name))
      continue
    const pii =
      namePii(name) ??
      a.pii ??
      (a.highCardText() && !/(^|_)(id|title|name|adi|baslik)$/.test(snakeOf(name)) ? 'x' : null)
    if (pii) continue
    for (const hit of fieldsFor(name, a, kindsOfProp(name))) {
      const list = cands.get(hit.field) ?? []
      list.push({ name, conf: hit.conf, count: a.filled })
      cands.set(hit.field, list)
    }
  }
  const props: Partial<Record<PropField, string | string[]>> = {}
  for (const f of PROP_FIELDS) {
    const list = (cands.get(f) ?? []).sort((x, y) => y.conf - x.conf || y.count - x.count)
    const good = list.filter((c) => c.conf >= CONFIDENT)
    const weak = list.filter((c) => c.conf < CONFIDENT)
    if (weak.length) notes.push(`Emin değilim (${f}): ${weak.map((c) => c.name).join(', ')}`)
    if (!good.length) continue
    const names = f === 'device' ? [good[0].name] : good.slice(0, 12).map((c) => c.name)
    props[f] = names.length === 1 ? names[0] : names
  }
  const mappedKinds = new Set(kindOf.values())
  const has = (k: Kind): boolean => mappedKinds.has(k)
  if (!has('PLAY_START')) notes.push('Oynatma başı olayı bulunamadı: churn "etkinlik" tanımı için PLAY_START eşleyin.')
  if ([...PLAY_SET].some(has)) {
    if (!props.contentId) notes.push('İçerik kimliği özelliği bulunamadı (content_id …): içerik kırılımları çalışmaz.')
    if (!props.duration) notes.push('İçerik süresi bulunamadı: tamamlanma yalnız açık "completed" bilgisinden okunur.')
    if (!props.watched && !props.position)
      notes.push('İzlenen süre / konum yok: izleme süresi başlangıç–bitiş anlarından türetilir.')
  }
  if (has('SEARCH') && !props.resultCount)
    notes.push('Arama sonuç sayısı yok: sonuçsuz arama yalnız olay adından anlaşılır.')
  if (has('EXPOSURE') && (!props.experiment || !props.variant))
    notes.push('Deney / kol adı özelliği eksik: maruziyet okunmaz.')
  if (!has('SUBSCRIBE') && !has('CANCEL'))
    notes.push('Abonelik olayları yok: churn yalnız etkinlikten (izleme sessizliği) tanımlanır.')

  /* ── Süre birimi ── */
  let durationUnit: 's' | 'ms' | 'min' = 's'
  {
    const first = (f: PropField): PropAcc | undefined => {
      const v = props[f]
      const n = Array.isArray(v) ? v[0] : v
      return n === undefined ? undefined : global.get(n)
    }
    const dur = first('duration')
    const other = first('watched') ?? first('position')
    const p = dur ? dur.p50() : other ? other.p50() : NaN
    if (Number.isFinite(p)) {
      if (p > 100_000) durationUnit = 'ms'
      else if (dur && p < 300 && dur.nonInt) durationUnit = 'min'
      notes.push(`Süre birimi '${durationUnit}' (ortanca ${num(p)}${dur ? ', içerik süresinden' : ''}).`)
    }
  }

  /* ── Boyutlar ── */
  const dims: Record<string, string> = {}
  {
    const used = new Set<string>()
    for (const f of PROP_FIELDS) if (f !== 'device') for (const n of [props[f] ?? []].flat()) used.add(n)
    const devName = typeof props.device === 'string' ? props.device : null
    const pool: { dim: string; prop: string; fill: number }[] = []
    for (const c of common) {
      const a = global.get(c.name)
      if (!a || c.pii || isUserKey(c.name) || c.name === timeProperty || isEventKey(c.name) || used.has(c.name))
        continue
      const s = snakeOf(c.name)
      if (NOT_DIM.test(s) || c.type === 'nesne') continue
      const d = c.distinctCapped ? a.kmv.estimate() : c.distinct
      if (d < 2 || d > DIM_MAX_DISTINCT) continue
      const dim = c.name === devName ? 'platform' : dimNameOf(c.name)
      if (c.type === 'sayı' && !DIM_ORDER.includes(dim)) continue
      pool.push({ dim, prop: c.name, fill: c.fill })
    }
    const rank = (d: string): number => {
      const i = DIM_ORDER.indexOf(d)
      return i < 0 ? 99 : i
    }
    pool.sort((x, y) => rank(x.dim) - rank(y.dim) || y.fill - x.fill)
    for (const p of pool) {
      if (Object.keys(dims).length >= MAX_DIMS) break
      let dim = p.dim
      for (let i = 2; dims[dim] !== undefined && i < 10; i++) dim = `${p.dim.slice(0, 21)}_${i}`
      if (dims[dim] !== undefined || !/^[a-z][a-z0-9_]{0,23}$/.test(dim)) continue
      dims[dim] = p.prop
    }
  }

  /* ── Değer sözlükleri ── */
  const deviceMap: Record<string, 'TV' | 'MOBIL' | 'WEB' | 'DIGER'> = {}
  const typeMap: Record<string, 'FILM' | 'BOLUM' | 'CANLI' | 'SPOR' | 'KLIP' | 'DIGER'> = {}
  {
    const valuesOf = (f: PropField): string[] => {
      const out: string[] = []
      for (const n of [props[f] ?? []].flat()) {
        const a = global.get(n)
        if (!a || a.pii || a.capped) continue
        for (const [v, c] of a.vals) if (c >= SHOW_MIN_COUNT && v.length <= SHOW_LEN && !valuePii(v)) out.push(v)
      }
      return out
    }
    const unknownDev: string[] = []
    for (const v of valuesOf('device')) {
      const key = v.trim().toLowerCase()
      if (!key || BUILTIN_DEVICE[key] !== undefined || deviceMap[key]) continue
      const g = guessDevice(key)
      if (g) deviceMap[key] = g
      else unknownDev.push(v)
    }
    const unknownType: string[] = []
    for (const v of valuesOf('contentType')) {
      const key = v.trim().toLowerCase()
      if (!key || BUILTIN_TYPE[key] !== undefined || typeMap[key]) continue
      const g = guessType(key)
      if (g) typeMap[key] = g
      else unknownType.push(v)
    }
    if (Object.keys(deviceMap).length)
      notes.push(
        `Cihaz sözlüğüne tahmini değerler eklendi: ${Object.entries(deviceMap)
          .map(([k, v]) => `${k}→${v}`)
          .join(', ')}`,
      )
    if (unknownDev.length)
      notes.push(`Cihaz sınıfı bilinmeyen değerler (DIGER sayılır): ${unknownDev.slice(0, 8).join(', ')}`)
    if (Object.keys(typeMap).length)
      notes.push(
        `İçerik türü sözlüğüne tahmini değerler eklendi: ${Object.entries(typeMap)
          .map(([k, v]) => `${k}→${v}`)
          .join(', ')}`,
      )
    if (unknownType.length)
      notes.push(`İçerik sınıfı bilinmeyen değerler (DIGER sayılır): ${unknownType.slice(0, 8).join(', ')}`)
  }

  /* ── Uyarılar ── */
  if (limitHit)
    warnings.push(
      `Yalnız ${num(scanned)} olay tarandı (sınır ${num(maxLines)}${files.length > 1 ? `, dosya başına ~${num(Math.floor(maxLines / files.length))}` : ''}); paylar örnekten.`,
    )
  if (bad) warnings.push(`${num(bad)} satır okunamadı ya da olay adı yok (${pct(bad / Math.max(1, lines))}).`)
  if (otherEvents)
    warnings.push(`${MAX_EVENT_NAMES}'den fazla olay adı var: fazlası '(diğer olay adları)' altında toplandı.`)
  if (globalOverflow || evList.some((e) => e.overflow))
    warnings.push(`Özellik sınırı aşıldı (olay başına ${PROPS_PER_EVENT}); bazı özellikler sayılmadı.`)
  if (userSetFull) warnings.push(`Kullanıcı sayısı ${num(USER_SET_CAP)} üstü: sayı alt sınırdır.`)
  if (new Set(formats).size > 1) warnings.push(`Dosyalar farklı biçimlerde: ${[...new Set(formats)].join(', ')}.`)

  /* ── Eşleme ── */
  const suggestion: LabMappingInput = {
    $comment: 'lab kesif önerisi (otomatik). Gözden geçirip esleme.json olarak kaydedin.',
    version: 1,
    eventKey: eventKeys.length > 1 ? eventKeys : eventKey,
    propertiesKey,
    user: {
      property: userKeys.length > 1 ? userKeys.slice(0, 12) : (userProperty ?? ['distinct_id', '$user_id', 'user_id']),
    },
    time: {
      property:
        timeKeys.length > 1 ? timeKeys.slice(0, 12) : (timeProperty ?? ['time', 'mp_processing_time_ms', 'timestamp']),
      unit: 'auto',
    },
    events: mappedEvents as LabMappingInput['events'],
    props,
    durationUnit,
    dims,
    deviceMap,
    typeMap,
    ignore,
  }
  const check = zLabMapping.safeParse(suggestion)
  if (!check.success) warnings.push(`Öneri şemadan geçmedi: ${check.error.issues[0]?.message ?? 'bilinmeyen hata'}`)

  return {
    files: files.map((f) => basename(f)),
    format: formats[0] ?? 'jsonl',
    propertiesKey,
    lines,
    bad,
    scanned,
    firstTs,
    lastTs,
    users: userSet.size,
    events: eventStats,
    common,
    userProperty,
    timeProperty,
    timeUnit,
    warnings,
    suggestion,
    notes,
  }
}

const ACTION_PROP = /^(action|event_?action|event_?type|type|status|state|durum|islem|eylem|subtype|step|stage)$/

/** Genel olay adı (ör. "Player Event") + eylem özelliği → koşullu kurallar */
function splitByAction(e: EventAcc): {
  prop: string
  rules: { kind: Kind; when: Record<string, string>; empty?: boolean; completed?: boolean }[]
} | null {
  for (const [prop, a] of e.props) {
    if (!ACTION_PROP.test(snakeOf(prop)) || a.capped || a.vals.size > SHOW_DISTINCT || a.longest > SHOW_LEN) continue
    if (namePii(prop) || a.pii || a.nStr < 0.95 * a.filled) continue
    const rules: { kind: Kind; when: Record<string, string>; empty?: boolean; completed?: boolean }[] = []
    for (const [v, c] of [...a.vals].sort((x, y) => y[1] - x[1])) {
      if (c < SHOW_MIN_COUNT || valuePii(v)) continue
      const g = classifyEvent(`${e.name} ${v}`) ?? classifyEvent(v)
      if (!g || g.confidence < CONFIDENT) continue
      rules.push({
        kind: g.kind,
        when: { [prop]: v },
        ...(g.empty ? { empty: true } : {}),
        ...(g.completed ? { completed: true } : {}),
      })
      if (rules.length >= 12) break
    }
    if (rules.length >= 2) return { prop, rules }
  }
  return null
}

const clipName = (s: string, n = 40): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
/** Olay adı kişisel veri gibi görünüyorsa gizlenir */
const safeEventName = (s: string): string => (valuePii(s) ? '[gizlendi: kişisel veri benzeri]' : s)

/* ───────────── Kompakt metin özeti ───────────── */

function propValueCell(p: PropertyStat, timeProp: string | null): string {
  if (p.pii) return `gizlendi: ${p.pii}`
  if (p.name === timeProp) return 'zaman damgası'
  if (p.values?.length) {
    const s = p.values.map((v) => `${v.value} ${pct(v.share, 0)}`).join(' · ')
    return s.length > 72 ? `${s.slice(0, 71)}…` : s
  }
  if (p.numeric) return `${num(p.numeric.min)} / ${num(p.numeric.p50)} / ${num(p.numeric.max)} (min/ort./maks)`
  return p.distinctCapped ? 'çok çeşitli' : '–'
}
const propCols = (timeProp: string | null): Col<PropertyStat>[] => [
  { h: 'özellik', v: 'name', max: 30 },
  { h: 'dolu', v: 'fill', f: 'pct' },
  { h: 'tür', v: 'type', align: 'l' },
  { h: 'çeşit', v: (p) => `${num(p.distinct)}${p.distinctCapped ? '+' : ''}`, align: 'r' },
  { h: 'değerler', v: (p) => propValueCell(p, timeProp), align: 'l' },
]

/** Kompakt metin özeti (varsayılan ≤ ~45 satır). `event` verilirse o olayın özellik dökümü. */
export function formatDiscovery(r: DiscoveryReport, opts: { limit?: number; event?: string } = {}): string {
  const out: string[] = []
  const range =
    r.firstTs !== null && r.lastTs !== null
      ? `${dayStr(Math.floor(r.firstTs / 86_400))} → ${dayStr(Math.floor(r.lastTs / 86_400))}`
      : 'tarih yok'
  const fileStr =
    r.files.length === 1 ? clipName(r.files[0], 40) : `${r.files.length} dosya (${clipName(r.files[0], 30)} …)`
  out.push(
    `Keşif · ${fileStr} · ${r.format}${r.propertiesKey ? ` (${r.propertiesKey})` : ' (düz)'} · ${num(r.scanned)} olay` +
      `${r.bad ? ` (+${num(r.bad)} bozuk)` : ''} · ${num(r.users)} kullanıcı · ${range}`,
  )
  out.push(
    `Kimlik: ${r.userProperty ?? '?'} · zaman: ${r.timeProperty ?? '?'}${r.timeUnit ? ` (${r.timeUnit})` : ''} · ${r.events.length} olay adı`,
  )

  if (opts.event !== undefined) {
    const e =
      r.events.find((x) => x.name === opts.event) ??
      r.events.find((x) => x.name.toLowerCase() === opts.event?.toLowerCase())
    if (!e) {
      out.push(`'${clipName(opts.event)}' adlı olay yok. Olay adları için seçeneksiz çalıştırın.`)
      return out.join('\n')
    }
    out.push(
      `Olay: ${safeEventName(e.name)} · ${num(e.count)} (${pct(e.share)}) · ${num(e.users)} kullanıcı · öneri: ${
        e.suggested ? `${e.suggested.kind} (${e.suggested.confidence.toFixed(2)}; ${e.suggested.why})` : 'yok'
      }`,
    )
    out.push(table(e.props, propCols(r.timeProperty), { limit: opts.limit ?? 60, more: 'limit' }))
    return out.join('\n')
  }

  out.push('', 'Olaylar:')
  out.push(
    table(
      r.events,
      [
        { h: 'olay', v: (e) => safeEventName(e.name), max: 34 },
        { h: 'adet', v: 'count' },
        { h: 'pay', v: 'share', f: 'pct' },
        { h: 'kull.', v: 'users' },
        {
          h: 'öneri',
          v: (e) =>
            e.suggested
              ? `${e.suggested.confidence < CONFIDENT ? '?' : ''}${e.suggested.kind} ${e.suggested.confidence.toFixed(2)}`
              : r.suggestion.ignore?.includes(e.name)
                ? 'yok say'
                : '–',
          align: 'l',
        },
      ],
      { limit: opts.limit ?? 30, more: 'limit' },
    ),
  )
  if (r.common.length) {
    out.push('', `Süper özellikler (olayların ≥${pct(COMMON_FILL, 0)}'inde):`)
    out.push(table(r.common, propCols(r.timeProperty), { limit: 12, more: 'tek olay dökümü için event' }))
  }
  const s = r.suggestion
  const pm = Object.entries(s.props ?? {})
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('|') : v}`)
    .join(', ')
  const nEv = Object.keys(s.events).length
  const kinds = new Set(
    r.events.filter((e) => s.events[e.name] !== undefined && e.suggested).map((e) => e.suggested?.kind),
  )
  out.push(
    '',
    clip(
      `Öneri: ${nEv} olay → ${kinds.size} tür · süre birimi ${s.durationUnit ?? 's'} · boyutlar: ${
        Object.entries(s.dims ?? {})
          .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('|') : v}`)
          .join(', ') || 'yok'
      }`,
      1,
    ),
  )
  if (pm) out.push(`Alanlar: ${pm.length > 700 ? `${pm.slice(0, 699)}…` : pm}`)
  const bullets = [...r.warnings.map((w) => `! ${w}`), ...r.notes.map((n) => `- ${n}`)]
  if (bullets.length) {
    const max = 10
    out.push(...bullets.slice(0, max).map((b) => (b.length > 220 ? `${b.slice(0, 219)}…` : b)))
    if (bullets.length > max) out.push(`… +${bullets.length - max} not daha`)
  }
  out.push(
    "Sonraki adım: öneriyi esleme.json'a yazıp `npm run lab -- esleme` ile gözden geçirin; tek olay için event seçeneği.",
  )
  return out.join('\n')
}
