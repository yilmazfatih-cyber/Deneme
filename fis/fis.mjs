// Fiş — masada hesap bölüşme çekirdeği (saf fonksiyonlar, DOM yok; tarayıcı ve Node'da aynı çalışır).
// Tüm tutarlar kuruş cinsinden tam sayıdır. Kalem kimliği = items dizisindeki sıra.
// Çözücüler ve normalize ediciler güvenilmeyen girdide asla throw etmez; null / [] döner.

import { deflateSync, inflateSync } from './vendor/fflate.mjs'

/**
 * @typedef {{ name: string, qty: number, unit: number }} Item
 * @typedef {{ id: string, title: string, meta: string, people: number, total: number, note: string, items: Item[] }} Bill
 * @typedef {{ name: string, picks: Record<number, number> }} Resp
 */

export const MAX_ITEMS = 99
export const MAX_QTY = 99
export const MAX_PEOPLE = 99
export const MAX_RESPS = 99
export const MAX_ITEM_NAME = 60
export const MAX_TITLE = 80
export const MAX_META = 80
export const MAX_NOTE = 200
export const MAX_PERSON_NAME = 24
/** Tek birim fiyat üst sınırı: 1.000.000,00 ₺ (taşmaya karşı). */
export const MAX_UNIT = 100_000_000

const VERSION = 1
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/
const MAX_CODE_LEN = 64_000 // tek fiş / tek yanıt için base64url karakter sınırı
const MAX_ALL_LEN = 256_000
/** Sıkıştırılmış kodun açılmış hâli için bayt sınırı (açılınca büyüyen "bomba" bağlantılara karşı). */
const MAX_PLAIN_BYTES = 300_000
/** Sıkıştırılmış kodların ön eki. Düz kodlar hep 'W' ile başlar ('[1,' → 'WzEs'), karışmaz. */
const Z = 'z'
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

// ---------- küçük yardımcılar ----------

/** Metni temizler: kontrol karakterlerini atar, boşlukları sadeleştirir, kod noktası sayısına göre kırpar. */
function cleanText(x, max) {
  if (typeof x !== 'string') return ''
  let s = x.length > max * 8 ? x.slice(0, max * 8) : x
  // Eşleşmemiş vekil (surrogate) yarımları UTF-8'e çevrilemez; at. (u bayrağıyla yalnızca tek kalanlar eşleşir;
  // lookbehind kullanma: Safari 16.0-16.3 desteklemez.)
  s = s
    .replace(/[\uD800-\uDFFF]/gu, '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    // Yön değiştiren ve görünmez biçim karakterleri: adın yanındaki tutarı ters çevirip yanıltmasın.
    .replace(/[\u061c\u200b\u200e\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  try {
    s = s.normalize('NFC')
  } catch {
    // normalize yoksa olduğu gibi kalsın
  }
  const cps = Array.from(s)
  return cps.length > max ? cps.slice(0, max).join('').trim() : s
}

function isObj(x) {
  return x !== null && typeof x === 'object'
}

function intIn(x, min, max) {
  return typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max
}

function bytesToB64(bytes) {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]
    out += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63]
  }
  if (i + 1 === bytes.length) {
    const n = bytes[i] << 16
    out += B64[n >> 18] + B64[(n >> 12) & 63]
  } else if (i + 2 === bytes.length) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8)
    out += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63]
  }
  return out
}

/** base64url (ya da standart base64) -> Uint8Array | null */
function b64ToBytes(str) {
  const s = str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return null
  const out = new Uint8Array(Math.floor((s.length * 3) / 4))
  let o = 0
  let acc = 0
  let bits = 0
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    // A-Z 65..90, a-z 97..122, 0-9 48..57, '-' 45, '_' 95
    const v = c >= 97 ? c - 71 : c === 95 ? 63 : c >= 65 ? c - 65 : c >= 48 ? c + 4 : 62
    acc = ((acc << 6) | v) & 0xffffff
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[o++] = (acc >> bits) & 255
    }
  }
  return out
}

/**
 * JSON dizisi -> kod. Bağlantı kısa olsun diye (QR daha seyrek, mesaj daha kısa) önce sıkıştırmayı dener:
 * 'z' + base64url(deflate). Sıkıştırma kazandırmıyorsa ya da çalışmıyorsa düz base64url(JSON) döner.
 */
function encodeJson(value) {
  const plain = new TextEncoder().encode(JSON.stringify(value))
  const flat = bytesToB64(plain)
  try {
    const packed = Z + bytesToB64(deflateSync(plain, { level: 9 }))
    if (packed.length < flat.length) return packed
  } catch {
    // sıkıştırılamadıysa düz kod yeter
  }
  return flat
}

/** Sıkıştırılmış baytlar -> düz baytlar | null. Çıktı sabit boyutlu tampona yazılır; taşan girdi reddedilir. */
function inflateCapped(bytes) {
  if (!bytes.length) return null
  const out = inflateSync(bytes, { out: new Uint8Array(MAX_PLAIN_BYTES) })
  return out.length >= MAX_PLAIN_BYTES ? null : out
}

/** kod (düz ya da 'z' ön ekli sıkıştırılmış base64url) -> sürümü doğru JSON dizisi | null */
function decodeJson(str, maxLen) {
  try {
    if (typeof str !== 'string') return null
    const s = str.trim()
    if (!s || s.length > maxLen) return null
    const packed = s[0] === Z
    let bytes = b64ToBytes(packed ? s.slice(1) : s)
    if (bytes && packed) bytes = inflateCapped(bytes)
    if (!bytes) return null
    const arr = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (!Array.isArray(arr) || arr[0] !== VERSION) return null
    return arr
  } catch {
    return null
  }
}

/** Resp.picks -> sıralı [[sıra, adet], …] */
function pickPairs(picks) {
  return Object.keys(picks)
    .map((k) => [Number(k), picks[k]])
    .sort((a, b) => a[0] - b[0])
}

// ---------- kimlik, toplam, normalize ----------

/** 8 karakterlik base36 kimlik. */
export function newId() {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz'
  let out = ''
  try {
    const buf = new Uint8Array(16)
    globalThis.crypto.getRandomValues(buf)
    // 252 = 36*7: üstünü atarak yanlılığı önle
    for (let i = 0; i < buf.length && out.length < 8; i++) if (buf[i] < 252) out += chars[buf[i] % 36]
  } catch {
    // crypto yoksa Math.random'a düş
  }
  while (out.length < 8) out += chars[Math.floor(Math.random() * 36)]
  return out
}

/** Ara toplam: Σ qty*unit (kuruş). Geçersiz kalemler 0 sayılır. */
export function subtotal(bill) {
  const items = isObj(bill) && Array.isArray(bill.items) ? bill.items : []
  let sum = 0
  for (const it of items) {
    if (isObj(it) && intIn(it.qty, 1, MAX_QTY) && intIn(it.unit, 1, MAX_UNIT)) sum += it.qty * it.unit
  }
  return sum
}

function normalizeBillWith(x, strictId) {
  try {
    if (!isObj(x) || Array.isArray(x) || !Array.isArray(x.items)) return null
    let id = typeof x.id === 'string' ? x.id.trim() : ''
    if (!ID_RE.test(id)) {
      if (strictId) return null
      id = newId()
    }
    const items = []
    const scan = Math.min(x.items.length, 1000)
    for (let i = 0; i < scan && items.length < MAX_ITEMS; i++) {
      const it = x.items[i]
      if (!isObj(it) || !intIn(it.qty, 1, MAX_QTY) || !intIn(it.unit, 1, MAX_UNIT)) continue
      items.push({ name: cleanText(it.name, MAX_ITEM_NAME) || 'Kalem', qty: it.qty, unit: it.unit })
    }
    if (items.length === 0) return null
    const sub = subtotal({ items })
    return {
      id,
      title: cleanText(x.title, MAX_TITLE),
      meta: cleanText(x.meta, MAX_META),
      people: intIn(x.people, 0, MAX_PEOPLE) ? x.people : 0,
      total: intIn(x.total, 1, sub) ? x.total : sub,
      note: cleanText(x.note, MAX_NOTE),
      items,
    }
  } catch {
    return null
  }
}

/**
 * Güvenilmeyen girdiden Bill üretir; olmuyorsa null. Alanlar kırpılır ve sınırlanır; geçersiz kalemler
 * (adet 1..99 tam sayı değil, birim fiyat > 0 kuruş tam sayı değil) atılır; kalem kalmazsa null.
 * total geçersizse ya da ara toplamdan büyükse ara toplam olur. id yoksa/geçersizse yeni id verilir.
 * @returns {Bill | null}
 */
export function normalizeBill(x) {
  return normalizeBillWith(x, false)
}

/**
 * Güvenilmeyen girdiden Resp üretir; ad boşsa null. picks fişe göre kırpılır: olmayan kalemler ve
 * geçersiz adetler atılır, adet kalemin adedini aşarsa adede indirilir. picks nesne ya da [[sıra, adet], …] olabilir.
 * @returns {Resp | null}
 */
export function normalizeResp(bill, x) {
  try {
    if (!isObj(x) || Array.isArray(x)) return null
    const name = cleanText(x.name, MAX_PERSON_NAME)
    if (!name) return null
    const items = isObj(bill) && Array.isArray(bill.items) ? bill.items : []
    const picks = {}
    const put = (k, v) => {
      const i = typeof k === 'number' ? k : typeof k === 'string' && /^\d{1,3}$/.test(k) ? Number(k) : -1
      if (!Number.isInteger(i) || i < 0 || i >= items.length) return
      const qty = isObj(items[i]) && intIn(items[i].qty, 1, MAX_QTY) ? items[i].qty : 0
      if (!qty || typeof v !== 'number' || !Number.isInteger(v) || v < 1) return
      picks[i] = Math.min(v, qty)
    }
    const src = x.picks
    if (Array.isArray(src)) {
      for (const p of src.slice(0, 1000)) if (Array.isArray(p)) put(p[0], p[1])
    } else if (isObj(src)) {
      for (const k of Object.keys(src).slice(0, 1000)) put(k, src[k])
    }
    return { name, picks }
  } catch {
    return null
  }
}

// ---------- kodlama ----------

/** Bill -> base64url. Fiş geçersizse '' döner. */
export function encodeBill(bill) {
  const b = normalizeBillWith(bill, true)
  if (!b) return ''
  return encodeJson([
    VERSION,
    b.id,
    b.title,
    b.meta,
    b.people,
    b.total,
    b.note,
    b.items.map((it) => [it.name, it.qty, it.unit]),
  ])
}

/** base64url -> Bill | null (asla throw etmez). */
export function decodeBill(str) {
  try {
    const a = decodeJson(str, MAX_CODE_LEN)
    if (!a || !Array.isArray(a[7])) return null
    const items = a[7].slice(0, 1000).map((r) => (Array.isArray(r) ? { name: r[0], qty: r[1], unit: r[2] } : null))
    return normalizeBillWith({ id: a[1], title: a[2], meta: a[3], people: a[4], total: a[5], note: a[6], items }, true)
  } catch {
    return null
  }
}

/** Resp -> base64url (içinde bill.id var). Yanıt geçersizse '' döner. */
export function encodeResp(bill, resp) {
  const r = normalizeResp(bill, resp)
  if (!r || !isObj(bill) || typeof bill.id !== 'string') return ''
  return encodeJson([VERSION, bill.id, r.name, pickPairs(r.picks)])
}

/** base64url -> Resp | null (bill.id uyuşmazsa null). */
export function decodeResp(bill, str) {
  try {
    const a = decodeJson(str, MAX_CODE_LEN)
    if (!a || !isObj(bill) || typeof a[1] !== 'string' || a[1] !== bill.id || !Array.isArray(a[3])) return null
    return normalizeResp(bill, { name: a[2], picks: a[3] })
  } catch {
    return null
  }
}

/** Tüm yanıtlar -> base64url (en çok 99 yanıt; geçersizler atlanır). */
export function encodeAll(bill, resps) {
  const list = []
  for (const x of Array.isArray(resps) ? resps : []) {
    if (list.length >= MAX_RESPS) break
    const r = normalizeResp(bill, x)
    if (r) list.push([r.name, pickPairs(r.picks)])
  }
  return encodeJson([VERSION, isObj(bill) && typeof bill.id === 'string' ? bill.id : '', list])
}

/** base64url -> Resp[] (geçersizler atılır, aynı ad tekilleştirilir; id uyuşmazsa []). */
export function decodeAll(bill, str) {
  try {
    const a = decodeJson(str, MAX_ALL_LEN)
    if (!a || !isObj(bill) || typeof a[1] !== 'string' || a[1] !== bill.id || !Array.isArray(a[2])) return []
    let out = []
    for (const row of a[2].slice(0, 1000)) {
      if (!Array.isArray(row)) continue
      const r = normalizeResp(bill, { name: row[0], picks: row[1] })
      if (r) out = upsertResp(out, r)
      if (out.length >= MAX_RESPS) break
    }
    return out
  } catch {
    return []
  }
}

// ---------- bağlantı ----------

/** '#b=..&r=..' -> { b?, r?, s? }. Bilinmeyen anahtarlar yok sayılır. */
export function parseHash(hash) {
  const out = {}
  if (typeof hash !== 'string') return out
  let h = hash.length > MAX_ALL_LEN * 2 ? '' : hash.trim()
  const at = h.indexOf('#')
  if (at >= 0) h = h.slice(at + 1)
  for (const part of h.split('&')) {
    const eq = part.indexOf('=')
    if (eq < 1) continue
    const key = part.slice(0, eq)
    let val = part.slice(eq + 1)
    if (key !== 'b' && key !== 'r' && key !== 's') continue
    if (val.includes('%')) {
      try {
        val = decodeURIComponent(val)
      } catch {
        continue
      }
    }
    if (val && !(key in out)) out[key] = val
  }
  return out
}

/** base (hash'siz URL) + { b, r?, s? } -> tam URL. */
export function buildUrl(base, parts) {
  let url = typeof base === 'string' ? base : ''
  const at = url.indexOf('#')
  if (at >= 0) url = url.slice(0, at)
  const p = isObj(parts) ? parts : {}
  const segs = []
  for (const key of ['b', 'r', 's']) {
    if (typeof p[key] === 'string' && p[key]) segs.push(`${key}=${p[key]}`)
  }
  return segs.length ? `${url}#${segs.join('&')}` : url
}

// ---------- adlar ----------

/** Karşılaştırma anahtarı: trim, boşluk sadeleştir, Türkçe küçük harf (İ→i, I→ı). */
export function nameKey(name) {
  const s = cleanText(typeof name === 'string' ? name : '', 200)
  try {
    return s.toLocaleLowerCase('tr-TR')
  } catch {
    return s.replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase()
  }
}

/** Aynı nameKey varsa yerine yazar, yoksa sona ekler; yeni dizi döner (girdi değişmez). */
export function upsertResp(resps, resp) {
  const list = Array.isArray(resps) ? resps.slice() : []
  if (!isObj(resp) || typeof resp.name !== 'string' || !nameKey(resp.name)) return list
  const key = nameKey(resp.name)
  const at = list.findIndex((r) => isObj(r) && nameKey(r.name) === key)
  if (at >= 0) list[at] = resp
  else list.push(resp)
  return list
}

// ---------- hesap ----------

function gcd(a, b) {
  while (b) [a, b] = [b, a % b]
  return a
}

/** Fişten ve yanıtlardan güvenli sayılar çıkarır (calc ve report ortak kullanır). */
function tally(bill, resps) {
  const src = isObj(bill) && Array.isArray(bill.items) ? bill.items.slice(0, MAX_ITEMS) : []
  const items = src.map((it) => {
    const ok = isObj(it) && intIn(it.qty, 1, MAX_QTY) && intIn(it.unit, 1, MAX_UNIT)
    return {
      name: isObj(it) && typeof it.name === 'string' ? it.name : '',
      qty: ok ? it.qty : 0,
      unit: ok ? it.unit : 0,
    }
  })
  const sub = items.reduce((a, it) => a + it.qty * it.unit, 0)
  const total = isObj(bill) && intIn(bill.total, 0, Number.MAX_SAFE_INTEGER) ? bill.total : sub
  const units = items.map(() => 0)
  const rows = []
  for (const r of Array.isArray(resps) ? resps : []) {
    const picks = []
    const p = isObj(r) && isObj(r.picks) ? r.picks : {}
    for (const k of Object.keys(p)) {
      const i = /^\d{1,3}$/.test(k) ? Number(k) : -1
      if (i < 0 || i >= items.length || !items[i].qty) continue
      if (typeof p[k] !== 'number' || !Number.isInteger(p[k]) || p[k] < 1) continue
      const n = Math.min(p[k], items[i].qty)
      picks.push([i, n])
      units[i] += n
    }
    picks.sort((a, b) => a[0] - b[0])
    rows.push({ name: isObj(r) && typeof r.name === 'string' ? r.name : '', picks })
  }
  return { items, sub, total, units, rows }
}

/**
 * Herkesin payını hesaplar.
 * Kalem satır tutarı L = qty*unit; payda D = max(units[i], qty); kişinin ham payı L*adet/D; hepsi
 * f = total/subtotal ile çarpılır. Kuruşlar en büyük kalan yöntemiyle dağıtılır (tam sayı aritmetiği, BigInt):
 * Σ due + left === bill.total her zaman tutar; sahipsiz kalem yoksa left === 0.
 * @returns {{ people: { name: string, due: number, items: { index: number, units: number, amount: number }[] }[], units: number[], left: number }}
 */
export function calc(bill, resps) {
  const { items, sub, total, units, rows } = tally(bill, resps)
  const people = rows.map((r) => ({
    name: r.name,
    due: 0,
    items: r.picks.map(([i, n]) => {
      const L = items[i].qty * items[i].unit
      const D = Math.max(units[i], items[i].qty)
      return { index: i, units: n, amount: sub > 0 ? Math.round((L * n * total) / (D * sub)) : 0 }
    }),
  }))
  if (sub <= 0 || total <= 0) return { people, units, left: Math.max(0, total) }

  // Ortak payda: sub * EKOK(D_i). Her kişinin payı tam kesir olarak tutulur.
  let M = 1n
  const Ds = items.map((it, i) => BigInt(Math.max(units[i], it.qty, 1)))
  for (let i = 0; i < items.length; i++) if (units[i] > 0) M = (M / gcd(M, Ds[i])) * Ds[i]
  const den = BigInt(sub) * M
  const T = BigInt(total)
  let used = 0n
  const buckets = rows.map((r, k) => {
    let num = 0n
    for (const [i, n] of r.picks) num += BigInt(items[i].qty * items[i].unit) * BigInt(n) * T * (M / Ds[i])
    used += num
    return { k, floor: num / den, rem: num % den }
  })
  // Sahipsiz kısım da bir "kova"dır; tam olarak 0 ise hiç kuruş almaz.
  const leftNum = T * den - used
  const leftBucket = { k: rows.length, floor: leftNum / den, rem: leftNum % den }
  buckets.push(leftBucket)
  let extra = Number(T - buckets.reduce((a, b) => a + b.floor, 0n))
  const order = buckets.filter((b) => b.rem > 0n).sort((a, b) => (a.rem < b.rem ? 1 : a.rem > b.rem ? -1 : a.k - b.k))
  for (const b of order) {
    if (extra <= 0) break
    b.floor += 1n
    extra--
  }
  for (let k = 0; k < people.length; k++) people[k].due = Number(buckets[k].floor)
  return { people, units, left: Number(leftBucket.floor) }
}

/**
 * Toplayıcı ekranı için durum özeti.
 * @returns {{ answered: number, expected: number, waiting: number,
 *   unclaimed: { index: number, name: string, missing: number, amount: number }[],
 *   shared: { index: number, name: string, units: number, qty: number }[], left: number, complete: boolean }}
 */
export function report(bill, resps) {
  const { items, sub, total, units, rows } = tally(bill, resps)
  const { left } = calc(bill, resps)
  const unclaimed = []
  const shared = []
  items.forEach((it, i) => {
    if (!it.qty) return
    if (units[i] < it.qty) {
      const missing = it.qty - units[i]
      unclaimed.push({ index: i, name: it.name, missing, amount: Math.round((it.unit * missing * total) / sub) })
    } else if (units[i] > it.qty) {
      shared.push({ index: i, name: it.name, units: units[i], qty: it.qty })
    }
  })
  const answered = rows.length
  const expected = isObj(bill) && intIn(bill.people, 0, MAX_PEOPLE) ? bill.people : 0
  return {
    answered,
    expected,
    waiting: Math.max(0, expected - answered),
    unclaimed,
    shared,
    left,
    complete: left === 0 && unclaimed.length === 0,
  }
}

// ---------- para ----------

/** 977075 -> '9.770,75 ₺' (tr-TR, her zaman 2 hane). Elle biçimlenir; her ortamda aynı çıktı. */
export function formatMoney(kurus) {
  const n = typeof kurus === 'number' && Number.isFinite(kurus) ? Math.round(kurus) : 0
  const abs = Math.abs(n)
  const lira = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const kr = String(abs % 100).padStart(2, '0')
  return `${n < 0 ? '-' : ''}${lira},${kr} ₺`
}

/**
 * '1.570,00' | '1570.00' | '1570' | '9 770,75 ₺' -> kuruş; geçersiz ya da negatifse null.
 * Sondaki ayraçtan sonra 1-2 hane varsa ondalıktır; tam 3'lü gruplar ('1.570', '1,570') binliktir.
 * Sayı verilirse lira sayılır (12.5 -> 1250).
 */
export function parseMoney(str) {
  if (typeof str === 'number') {
    if (!Number.isFinite(str) || str < 0) return null
    const v = Math.round(str * 100)
    return Number.isSafeInteger(v) ? v : null
  }
  if (typeof str !== 'string' || str.length > 40) return null
  const s = str
    .replace(/\s/g, '')
    .replace(/₺|TL|TRY/gi, '')
    .replace(/^\+/, '')
  if (!/^\d[\d.,]*$/.test(s)) return null
  let whole = s
  let frac = ''
  let dec = ''
  const m = /^(.*\d)([.,])(\d{1,2})$/.exec(s)
  if (m) {
    whole = m[1]
    dec = m[2]
    frac = m[3]
  }
  // Tam kısım: düz rakamlar ya da 3'lü binlik grupları (hep aynı ayraç; ondalık ayraçtan farklı)
  const g = /^[1-9]\d{0,2}([.,])\d{3}(?:\1\d{3})*$/.exec(whole)
  if (g) {
    if (g[1] === dec) return null
    whole = whole.replace(/[.,]/g, '')
  } else if (!/^\d+$/.test(whole)) return null
  if (whole.length > 12) return null
  return Number(whole) * 100 + Number(frac.padEnd(2, '0') || 0)
}

// ---------- fiş metni ----------

/** Türkçe harfleri ASCII'ye indirip büyük harfe çevirir (anahtar sözcük eşleştirmek için). */
function fold(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').toUpperCase()
}

const MONEY_TOKEN = /^-?(?:\d{1,3}(?:[.,]\d{3})+|\d{1,7})(?:[.,]\d{1,2})?$/
const HAS_DECIMALS = /[.,]\d{1,2}$/
const SKIP_START =
  /^(GARSON|KASIYER|MASA|KISI|SERVIS TIPI|CEK|ADISYON|ACILIS|KAPANIS|TARIH|SAAT|FIS|URUN ADI|YIYECEK|ICECEK|NAKIT|KREDI|KART|PARA USTU|ODEME|ODENEN|TEL|VERGI|VKN|MERSIS|Z NO|EKU|TESEKKUR|AFIYET)\b/
const SKIP_ANY = /\b(KDV|INDIRIM|ISKONTO|TOPKDV|MALI DEGERI|BAHSIS|YUVARLAMA)\b/
const TOTAL_START = /^(GENEL TOPLAM|ODENECEK( TUTAR)?|TOPLAM( TUTAR)?|TUTAR|NET TUTAR)\b/
const SUBTOTAL_START = /^ARA ?TOP/

/** Fiş satırındaki para belirtecini kuruşa çevirir (₺/TL eki olabilir); değilse null. */
function tokenMoney(tok) {
  const t = tok.replace(/(₺|TL)$/i, '').replace(/^₺/, '')
  if (!MONEY_TOKEN.test(t) || t.startsWith('-')) return null
  return parseMoney(t)
}

function hasLetters(s) {
  return /\p{L}{2}/u.test(s)
}

/**
 * iPhone'da "Metni Kopyala" ile alınan fiş metninden kalemleri çıkarır (en iyi çaba, satır başına bir kalem).
 * Biçimler: `AD ADET BİRİM TUTAR`, `AD TUTAR` (adet 1, tutar ondalıklı olmalı), `2 x AD 240,00`.
 * @returns {{ items: Item[], total: number | null, subtotal: number | null }}
 */
export function parseReceiptText(text) {
  const out = { items: [], total: null, subtotal: null }
  try {
    if (typeof text !== 'string') return out
    const lines = text
      .slice(0, 20000)
      .split(/\r?\n|\r/)
      .slice(0, 500)
    let totalRank = -1
    for (const raw of lines) {
      const line = raw.replace(/\s+/g, ' ').trim()
      if (!line || line.length > 160 || line.startsWith('*')) continue
      const up = fold(line)
      const toks = line.split(' ')
      while (toks.length > 1 && /^(₺|TL|TRY)$/i.test(toks[toks.length - 1])) toks.pop() // ayrı yazılmış para birimi
      const last = tokenMoney(toks[toks.length - 1])

      if (SUBTOTAL_START.test(up)) {
        if (last !== null && last > 0) out.subtotal = last
        continue
      }
      if (SKIP_ANY.test(up)) continue
      if (TOTAL_START.test(up)) {
        // GENEL TOPLAM / ODENECEK her zaman kazanır; yoksa son görülen TUTAR / TOPLAM
        const rank = /^(GENEL|ODENECEK|NET)/.test(up) ? 2 : 1
        if (last !== null && last > 0 && toks.length <= 4 && rank >= totalRank) {
          out.total = last
          totalRank = rank
        }
        continue
      }
      if (SKIP_START.test(up)) continue
      if (/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\b\d{1,2}:\d{2}\b/.test(line)) continue // tarih, saat
      if (last === null || out.items.length >= MAX_ITEMS) continue

      const item = parseItemLine(toks, last)
      if (item && item.unit > 0 && item.unit <= MAX_UNIT) {
        out.items.push({ name: cleanText(item.name, MAX_ITEM_NAME), qty: item.qty, unit: item.unit })
      }
    }
  } catch {
    // en iyi çaba: o ana kadar bulunanlar döner
  }
  return out
}

/** Tek satırı kaleme çevirir; tutar 0 ise ya da kalem değilse null. */
function parseItemLine(toks, lineTotal) {
  const n = toks.length
  // 1) AD ADET BİRİM TUTAR — ad içinde sayı olabilir; sondaki üç sayıya bakılır.
  if (n >= 4 && /^\d{1,2}$/.test(toks[n - 3])) {
    const qty = Number(toks[n - 3])
    const unit = tokenMoney(toks[n - 2])
    const name = toks.slice(0, n - 3).join(' ')
    if (qty >= 1 && unit !== null && hasLetters(name)) {
      if (lineTotal === 0) return null
      if (Math.abs(qty * unit - lineTotal) <= qty) return { name, qty, unit }
      // Birim fiyat yanlış okunmuş olabilir: satır tutarına güven.
      if (lineTotal % qty === 0) return { name, qty, unit: lineTotal / qty }
      return { name, qty: 1, unit: lineTotal }
    }
  }
  if (lineTotal === 0) return null
  // 2) "2 x AD 240,00" (tutar satır toplamıdır)
  const lead = /^(\d{1,2})[xX×]?$/.exec(toks[0])
  if (lead && n >= 3) {
    const sepInFirst = /[xX×]$/.test(toks[0])
    const sepNext = /^[xX×*]$/.test(toks[1])
    if (sepInFirst || sepNext) {
      const qty = Number(lead[1])
      const name = toks.slice(sepInFirst ? 1 : 2, n - 1).join(' ')
      if (qty >= 1 && hasLetters(name) && lineTotal % qty === 0) return { name, qty, unit: lineTotal / qty }
    }
  }
  // 3) AD BİRİM TUTAR (adet yazılmamış, iki tutar aynı)
  if (n >= 3 && HAS_DECIMALS.test(toks[n - 2]) && tokenMoney(toks[n - 2]) === lineTotal) {
    const name = toks.slice(0, n - 2).join(' ')
    if (hasLetters(name)) return { name, qty: 1, unit: lineTotal }
  }
  // 4) AD TUTAR — adres, telefon gibi satırları kalem sanmamak için tutar ondalıklı olmalı.
  const name = toks.slice(0, n - 1).join(' ')
  if (n >= 2 && HAS_DECIMALS.test(toks[n - 1].replace(/(₺|TL)$/i, '')) && hasLetters(name) && !/[:#]/.test(name)) {
    return { name, qty: 1, unit: lineTotal }
  }
  return null
}
