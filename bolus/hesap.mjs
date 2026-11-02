// Bölüş — para bölüşme hesapları (saf fonksiyonlar, tarayıcı ve Node'da aynı çalışır).
// Tüm tutarlar kuruş cinsinden tam sayıdır; kayan nokta hatası olmaz.

export const CURRENCIES = ['TRY', 'EUR', 'USD', 'GBP']
export const SPLIT_TYPES = ['equal', 'exact', 'percent', 'shares']
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Kuruşu hata metinleri için "12,50" biçiminde yazar (para birimi olmadan). */
export function formatNumber(cents) {
  try {
    return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100)
  } catch {
    return (cents / 100).toFixed(2).replace('.', ',')
  }
}

/** "12,50" / "12.50" / "1.250,75" gibi girdileri kuruşa çevirir. Geçersizse null döner. */
export function parseAmount(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input * 100) : null
  let s = String(input ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(/[₺$€£]/g, '')
  if (!s) return null
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    // Hangisi sonda ise ondalık ayırıcıdır; diğeri binlik ayırıcı.
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (lastComma >= 0) {
    s = s.replace(',', '.')
  }
  if (!/^-?\d*(\.\d{0,2})?$/.test(s) || s === '-' || s === '.' || s === '-.') return null
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

/** Kuruşu "1.250,75 ₺" biçiminde yazar. */
export function formatAmount(cents, currency = 'TRY', { sign = false } = {}) {
  const value = (cents ?? 0) / 100
  let text
  try {
    text = new Intl.NumberFormat('tr-TR', { style: 'currency', currency, minimumFractionDigits: 2 }).format(
      Math.abs(value),
    )
  } catch {
    text = `${Math.abs(value).toFixed(2)} ${currency}`
  }
  if (cents < 0) return `-${text}`
  if (sign && cents > 0) return `+${text}`
  return text
}

/**
 * En büyük kalan yöntemi: toplamı ağırlıklara göre kuruş kuruş dağıtır; toplam her zaman tam tutar.
 * weights: { id: ağırlık (>0) }
 */
export function distribute(total, weights) {
  if (!Number.isInteger(total)) throw new Error('Tutar kuruş cinsinden tam sayı olmalı')
  const ids = Object.keys(weights).filter((id) => Number.isFinite(weights[id]) && weights[id] > 0)
  if (ids.length === 0) return {}
  const sum = ids.reduce((a, id) => a + weights[id], 0)
  const out = {}
  const remainders = []
  let given = 0
  for (const id of ids) {
    const exact = (total * weights[id]) / sum
    const floor = total >= 0 ? Math.floor(exact) : Math.ceil(exact)
    out[id] = floor
    given += floor
    remainders.push({ id, r: Math.abs(exact - floor) })
  }
  let left = total - given
  if (!Number.isFinite(left)) throw new Error('Tutar çok büyük')
  remainders.sort((a, b) => b.r - a.r || ids.indexOf(a.id) - ids.indexOf(b.id))
  const step = left > 0 ? 1 : -1
  for (let i = 0; left !== 0 && i < remainders.length; i++) {
    out[remainders[i].id] += step
    left -= step
  }
  if (left !== 0) throw new Error('Dağıtım tamamlanamadı')
  return out
}

/** Eşit bölüşme: her seçili kişiye eşit pay, artan kuruşlar ilk kişilere. */
export function splitEqual(total, memberIds) {
  const w = {}
  for (const id of memberIds) w[id] = 1
  return distribute(total, w)
}

/** Tam tutar: girilen kuruşların toplamı tutara eşit olmalı. */
export function splitExact(total, amounts) {
  const out = {}
  let sum = 0
  for (const [id, v] of Object.entries(amounts)) {
    if (!v) continue
    if (v < 0) throw new Error('Pay eksi olamaz')
    out[id] = v
    sum += v
  }
  if (sum !== total) {
    throw new Error(`Payların toplamı (${formatNumber(sum)}) tutara (${formatNumber(total)}) eşit değil`)
  }
  return out
}

/** Yüzde: yüzdelerin toplamı 100 olmalı (iki ondalığa kadar). */
export function splitPercent(total, percents) {
  const w = {}
  let sum = 0
  for (const [id, v] of Object.entries(percents)) {
    const p = Number(v)
    if (!p) continue
    if (p < 0) throw new Error('Yüzde eksi olamaz')
    w[id] = p
    sum += p
  }
  if (Math.abs(sum - 100) > 0.005)
    throw new Error(`Yüzdelerin toplamı ${String(Math.round(sum * 100) / 100).replace('.', ',')}, 100 olmalı`)
  return distribute(total, w)
}

/** Pay (hisse): her kişiye ağırlık; örn. 2 hisse, 1 hisse. */
export function splitShares(total, shares) {
  const w = {}
  let any = false
  for (const [id, v] of Object.entries(shares)) {
    const p = Number(v)
    if (!p) continue
    if (p < 0) throw new Error('Hisse eksi olamaz')
    w[id] = p
    any = true
  }
  if (!any) throw new Error('En az bir kişiye hisse verin')
  return distribute(total, w)
}

/** Harcamanın bölüşme türüne göre kişi paylarını hesaplar. */
export function computeShares(expense) {
  const { amount, splitType, splitInput = {} } = expense
  switch (splitType) {
    case 'equal':
      return splitEqual(
        amount,
        Object.keys(splitInput).filter((id) => splitInput[id]),
      )
    case 'exact':
      return splitExact(amount, splitInput)
    case 'percent':
      return splitPercent(amount, splitInput)
    case 'shares':
      return splitShares(amount, splitInput)
    default:
      throw new Error(`Bilinmeyen bölüşme türü: ${splitType}`)
  }
}

/** Ödeyenler toplamı tutara eşit mi? */
export function validatePayers(amount, payers) {
  const sum = Object.values(payers).reduce((a, v) => a + (v || 0), 0)
  if (sum !== amount)
    throw new Error(`Ödeyenlerin toplamı (${formatNumber(sum)}) tutara (${formatNumber(amount)}) eşit değil`)
  if (Object.values(payers).some((v) => v < 0)) throw new Error('Ödenen tutar eksi olamaz')
  return true
}

/**
 * Net bakiye: ödediği − payı. Artı = alacaklı, eksi = borçlu.
 * Ödeme kayıtlarında (kind: 'payment') payers = veren, shares = alan.
 */
export function netBalances(entries, memberIds = []) {
  const net = {}
  for (const id of memberIds) net[id] = 0
  for (const e of entries) {
    for (const [id, v] of Object.entries(e.payers || {})) net[id] = (net[id] || 0) + v
    for (const [id, v] of Object.entries(e.shares || {})) net[id] = (net[id] || 0) - v
  }
  return net
}

/**
 * Kişi kişiye ham borçlar (sadeleştirilmemiş, Splitwise'ın varsayılan görünümü).
 * Her harcamada, pay sahipleri ödeyenlere ödedikleri oranda borçlanır. Aynı çift arasındaki
 * borçlar netleştirilir. Sonuç: [{ from, to, amount }], amount > 0.
 */
export function pairwiseDebts(entries) {
  const owed = new Map() // "from|to" → kuruş
  const add = (from, to, v) => {
    if (from === to || v === 0) return
    const key = `${from}|${to}`
    owed.set(key, (owed.get(key) || 0) + v)
  }
  for (const e of entries) {
    const payers = Object.entries(e.payers || {}).filter(([, v]) => v > 0)
    if (payers.length === 0) continue
    if (payers.length === 1) {
      for (const [who, share] of Object.entries(e.shares || {})) if (share) add(who, payers[0][0], share)
      continue
    }
    // Birden çok ödeyen: harcama içinde net alacaklılar ve net borçlular belirlenir,
    // her borçlunun borcu alacaklılara alacakları oranında dağıtılır.
    const net = {}
    for (const [p, v] of payers) net[p] = (net[p] || 0) + v
    for (const [who, v] of Object.entries(e.shares || {})) net[who] = (net[who] || 0) - (v || 0)
    const credit = {}
    const debtors = []
    for (const [id, v] of Object.entries(net)) {
      if (v > 0) credit[id] = v
      else if (v < 0) debtors.push([id, -v])
    }
    if (debtors.length === 0) continue
    const rows = debtors.map(([d, amt]) => [d, distribute(amt, credit)])
    // Kuruş yuvarlamaları sütun toplamlarını bozabilir; tek tek düzelt (satır toplamı sabit kalır).
    const column = {}
    for (const [, parts] of rows) for (const [p, v] of Object.entries(parts)) column[p] = (column[p] || 0) + v
    for (let guard = 0; guard < 1000; guard++) {
      const over = Object.keys(credit).find((p) => (column[p] || 0) > credit[p])
      const under = Object.keys(credit).find((p) => (column[p] || 0) < credit[p])
      if (!over || !under) break
      const row = rows.find(([, parts]) => (parts[over] || 0) > 0)
      if (!row) break
      row[1][over] -= 1
      row[1][under] = (row[1][under] || 0) + 1
      column[over] -= 1
      column[under] = (column[under] || 0) + 1
    }
    for (const [d, parts] of rows) for (const [p, v] of Object.entries(parts)) add(d, p, v)
  }
  // Çiftleri netleştir
  const out = []
  const seen = new Set()
  for (const [key, v] of owed) {
    const [a, b] = key.split('|')
    const rev = `${b}|${a}`
    if (seen.has(key) || seen.has(rev)) continue
    seen.add(key)
    seen.add(rev)
    const net = v - (owed.get(rev) || 0)
    if (net > 0) out.push({ from: a, to: b, amount: net })
    else if (net < 0) out.push({ from: b, to: a, amount: -net })
  }
  return out.sort((x, y) => y.amount - x.amount)
}

/**
 * Borçları sadeleştir (en az sayıda ödeme): alacaklı ve borçluları eşleştirir.
 * Girdi: net bakiyeler. Çıktı: [{ from, to, amount }].
 */
export function simplifyDebts(net) {
  const creditors = []
  const debtors = []
  for (const [id, v] of Object.entries(net)) {
    if (v > 0) creditors.push({ id, v })
    else if (v < 0) debtors.push({ id, v: -v })
  }
  creditors.sort((a, b) => b.v - a.v || a.id.localeCompare(b.id))
  debtors.sort((a, b) => b.v - a.v || a.id.localeCompare(b.id))
  const out = []
  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i]
    const c = creditors[j]
    const v = Math.min(d.v, c.v)
    if (v > 0) out.push({ from: d.id, to: c.id, amount: v })
    d.v -= v
    c.v -= v
    if (d.v === 0) i++
    if (c.v === 0) j++
  }
  return out
}

/** Kişi başına toplam harcama (yalnızca gider kayıtları, ödemeler hariç). */
export function totals(entries) {
  let total = 0
  const paid = {}
  const share = {}
  for (const e of entries) {
    if (e.kind === 'payment') continue
    total += e.amount
    for (const [id, v] of Object.entries(e.payers || {})) paid[id] = (paid[id] || 0) + v
    for (const [id, v] of Object.entries(e.shares || {})) share[id] = (share[id] || 0) + v
  }
  return { total, paid, share }
}

/** Yeni kimlik. */
export function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().slice(0, 8)
  return Math.random().toString(36).slice(2, 10)
}

/** Bugünün tarihi YYYY-AA-GG. */
export function today() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** "2026-11-02" → "2 Kas 2026" */
export function formatDate(iso) {
  if (typeof iso !== 'string' || !DATE_RE.test(iso)) return ''
  const [y, m, d] = iso.split('-').map(Number)
  try {
    return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }).format(
      new Date(y, m - 1, d),
    )
  } catch {
    return ''
  }
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)
const isId = (v) => typeof v === 'string' && ID_RE.test(v)
const cleanText = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** Kuruş sözlüğünü temizler: yalnızca geçerli kimlikli, tam sayı ve >= 0 değerler kalır. */
function cleanCents(obj, validIds) {
  const out = {}
  if (!isObj(obj)) return out
  for (const [k, v] of Object.entries(obj)) {
    if (validIds.has(k) && Number.isInteger(v) && v > 0) out[k] = v
  }
  return out
}

/**
 * Dışarıdan gelen (yedek, bağlantı, localStorage) grup verisini doğrular ve temizler.
 * Düzeltilemeyen gruplarda hata fırlatır; bozuk kayıtlar sessizce atılır.
 */
export function normalizeGroup(raw) {
  if (!isObj(raw) || !isId(raw.id)) throw new Error('Grup verisi tanınmadı')
  const members = []
  const memberIds = new Set()
  for (const m of Array.isArray(raw.members) ? raw.members : []) {
    if (!isObj(m) || !isId(m.id) || memberIds.has(m.id)) continue
    const name = cleanText(m.name, 60)
    if (!name) continue
    memberIds.add(m.id)
    members.push({ id: m.id, name })
  }
  const entries = []
  const entryIds = new Set()
  for (const e of Array.isArray(raw.entries) ? raw.entries : []) {
    if (!isObj(e) || !isId(e.id) || entryIds.has(e.id)) continue
    if (!Number.isInteger(e.amount) || e.amount <= 0) continue
    const payers = cleanCents(e.payers, memberIds)
    const shares = cleanCents(e.shares, memberIds)
    const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0)
    if (sum(payers) !== e.amount || sum(shares) !== e.amount) continue
    const kind = e.kind === 'payment' ? 'payment' : 'expense'
    if (kind === 'payment' && (Object.keys(payers).length !== 1 || Object.keys(shares).length !== 1)) continue
    let splitType = SPLIT_TYPES.includes(e.splitType) ? e.splitType : 'exact'
    let splitInput = isObj(e.splitInput) ? {} : null
    if (splitInput) {
      for (const [k, v] of Object.entries(e.splitInput)) {
        if (!memberIds.has(k)) continue
        if (splitType === 'equal') {
          if (v) splitInput[k] = true
        } else if (splitType === 'exact') {
          if (Number.isInteger(v) && v >= 0) splitInput[k] = v
        } else if (Number.isFinite(Number(v)) && Number(v) >= 0) splitInput[k] = Number(v)
      }
      try {
        const check = computeShares({ amount: e.amount, splitType, splitInput })
        if (JSON.stringify(check) !== JSON.stringify(shares)) splitInput = null
      } catch {
        splitInput = null
      }
    }
    if (!splitInput) {
      splitType = 'exact'
      splitInput = { ...shares }
    }
    entryIds.add(e.id)
    entries.push({
      id: e.id,
      kind,
      description: cleanText(e.description, 120) || (kind === 'payment' ? 'Ödeme' : 'Harcama'),
      amount: e.amount,
      date: typeof e.date === 'string' && DATE_RE.test(e.date) ? e.date : today(),
      category: isId(e.category) ? e.category : 'diger',
      note: cleanText(e.note, 500),
      payers,
      splitType,
      splitInput,
      shares,
      createdAt: Number.isFinite(e.createdAt) ? e.createdAt : 0,
      updatedAt: Number.isFinite(e.updatedAt) ? e.updatedAt : 0,
    })
  }
  const deleted = {}
  if (isObj(raw.deleted)) {
    for (const [k, v] of Object.entries(raw.deleted)) if (isId(k) && Number.isFinite(v)) deleted[k] = v
  }
  return {
    id: raw.id,
    name: cleanText(raw.name, 60) || 'Grup',
    currency: CURRENCIES.includes(raw.currency) ? raw.currency : 'TRY',
    members,
    entries,
    meId: isId(raw.meId) && memberIds.has(raw.meId) ? raw.meId : null,
    deleted,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : 0,
  }
}
