// Bölüş — para bölüşme hesapları (saf fonksiyonlar, tarayıcı ve Node'da aynı çalışır).
// Tüm tutarlar kuruş cinsinden tam sayıdır; kayan nokta hatası olmaz.

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
  const ids = Object.keys(weights).filter((id) => weights[id] > 0)
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
  remainders.sort((a, b) => b.r - a.r || ids.indexOf(a.id) - ids.indexOf(b.id))
  const step = left > 0 ? 1 : -1
  for (let i = 0; left !== 0; i = (i + 1) % remainders.length) {
    out[remainders[i].id] += step
    left -= step
  }
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
    throw new Error(`Payların toplamı (${sum / 100}) tutara (${total / 100}) eşit değil`)
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
  if (Math.abs(sum - 100) > 0.005) throw new Error(`Yüzdelerin toplamı ${sum}, 100 olmalı`)
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
  if (sum !== amount) throw new Error(`Ödeyenlerin toplamı (${sum / 100}) tutara (${amount / 100}) eşit değil`)
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
    const totalPaid = payers.reduce((a, [, v]) => a + v, 0)
    if (totalPaid === 0) continue
    for (const [who, share] of Object.entries(e.shares || {})) {
      if (!share) continue
      if (payers.length === 1) {
        add(who, payers[0][0], share)
      } else {
        const w = {}
        for (const [p, v] of payers) w[p] = v
        const parts = distribute(share, w)
        for (const [p, v] of Object.entries(parts)) add(who, p, v)
      }
    }
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
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  try {
    return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }).format(
      new Date(y, m - 1, d),
    )
  } catch {
    return iso
  }
}
