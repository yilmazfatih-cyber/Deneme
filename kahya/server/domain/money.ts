// Para: tüm tutarlar kuruş cinsinden tamsayıdır (1 TL = 100 kuruş). Kayan nokta yalnız gösterimde kullanılır.

const tl = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' })

export function formatTL(kurus: number): string {
  return tl.format(kurus / 100)
}

/**
 * "1.234,56" · "1234,56" · "1234.56" · "₺1.234,56" · "-1.234,56 TL" · 1234.56 → kuruş.
 * Ayırt edilemeyen girdide null döner.
 */
export function parseAmount(input: string | number): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input * 100) : null
  let s = input.replace(/\s|₺|TL|TRY/gi, '').trim()
  if (!s) return null
  let sign = 1
  if (s.startsWith('-') || s.startsWith('(')) sign = -1
  s = s.replace(/^[-+(]|\)$/g, '')
  if (!/^[\d.,]+$/.test(s)) return null
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  let intPart: string
  let frac = ''
  if (lastComma > -1 && lastDot > -1) {
    // İki ayraç da var: sondaki ondalık ayraçtır.
    const dec = lastComma > lastDot ? ',' : '.'
    const idx = Math.max(lastComma, lastDot)
    intPart = s.slice(0, idx).replace(/[.,]/g, '')
    frac = s.slice(idx + 1)
    if (dec === ',' && frac.includes('.')) return null
  } else if (lastComma > -1) {
    // Yalnız virgül: Türkçe ondalık (1234,5). Birden çok virgül ya da tam 3 hane (1,234) binlik ayraçtır.
    const parts = s.split(',')
    if (parts.length > 2 || parts[1]!.length === 3) {
      intPart = parts.join('')
    } else {
      intPart = parts[0]!
      frac = parts[1] ?? ''
    }
  } else if (lastDot > -1) {
    const parts = s.split('.')
    // "1.234" ve "1.234.567" Türkçe binlik; "12.5" ondalık.
    if (parts.length > 2 || parts[parts.length - 1]!.length === 3) {
      intPart = parts.join('')
    } else {
      intPart = parts[0]!
      frac = parts[1] ?? ''
    }
  } else {
    intPart = s
  }
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(frac) || frac.length > 2) {
    if (frac.length > 2 && /^\d+$/.test(frac)) {
      // 3+ ondalık hane: kuruşa yuvarla.
      const v = Number(`${intPart || '0'}.${frac}`)
      return sign * Math.round(v * 100)
    }
    return null
  }
  const kurus = Number(intPart || '0') * 100 + Number((frac + '00').slice(0, 2))
  return sign * kurus
}

/**
 * Toplamı ağırlıklara göre kuruşu kuruşuna böler (en büyük kalan yöntemi). Parçaların toplamı her zaman `total`'dir.
 * Ağırlıklar ondalıklı olabilir (m²); tamamı sıfırsa eşit bölünür.
 */
export function splitByWeights(total: number, weights: number[]): number[] {
  if (!Number.isInteger(total)) throw new Error('Tutar kuruş cinsinden tamsayı olmalı')
  const n = weights.length
  if (n === 0) return []
  const scaled = weights.map((w) => {
    if (!(w >= 0)) throw new Error('Ağırlık negatif olamaz')
    return BigInt(Math.round(w * 1000))
  })
  let sum = scaled.reduce((a, b) => a + b, 0n)
  const w = sum === 0n ? scaled.map(() => 1n) : scaled
  if (sum === 0n) sum = BigInt(n)
  const sign = total < 0 ? -1n : 1n
  const T = BigInt(Math.abs(total))
  const base = w.map((wi) => (T * wi) / sum)
  const rem = w.map((wi, i) => ({ i, r: (T * wi) % sum }))
  let left = T - base.reduce((a, b) => a + b, 0n)
  rem.sort((a, b) => (b.r > a.r ? 1 : b.r < a.r ? -1 : a.i - b.i))
  for (const { i } of rem) {
    if (left <= 0n) break
    base[i] = base[i]! + 1n
    left -= 1n
  }
  return base.map((b) => Number(b * sign))
}

/** Kuruşu `step` katına yuvarlar (100 → tam lira). */
export function roundTo(kurus: number, step: number): number {
  if (step <= 1) return Math.round(kurus)
  return Math.round(kurus / step) * step
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0)
}
