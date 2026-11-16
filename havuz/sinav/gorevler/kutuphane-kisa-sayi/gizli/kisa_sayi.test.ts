/**
 * Gizli sınav testi (kutuphane-kisa-sayi): formatCompactTr görev metnine uyar (Python ile aynı sonuçlar).
 */
import { describe, expect, it } from 'vitest'
import * as sayiYazi from '../src/sayi_yazi.ts'

const SCALES: [bigint, string][] = [
  [10n ** 12n, 'trilyon'],
  [10n ** 9n, 'milyar'],
  [10n ** 6n, 'milyon'],
  [1000n, 'bin'],
]

function reference(value: number): string {
  const n = BigInt(value)
  const sign = n < 0n ? '-' : ''
  const amount = n < 0n ? -n : n
  if (amount < 1000n) return `${sign}${amount}`
  let index = SCALES.findIndex(([scale]) => amount >= scale)
  let [scale, name] = SCALES[index] as [bigint, string]
  let tenths = (amount * 10n + scale / 2n) / scale
  if (tenths >= 10_000n && index > 0) {
    index -= 1
    ;[scale, name] = SCALES[index] as [bigint, string]
    tenths = (amount * 10n + scale / 2n) / scale
  }
  const whole = (tenths / 10n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const fraction = tenths % 10n
  return `${sign}${whole}${fraction === 0n ? '' : `,${fraction}`} ${name}`
}

const format = (value: number): unknown =>
  ((sayiYazi as Record<string, unknown>).formatCompactTr as (value: number) => unknown)(value)

const CASES: [number, string][] = [
  [0, '0'], [999, '999'], [-45, '-45'], [1000, '1 bin'], [1200, '1,2 bin'], [15000, '15 bin'],
  [2500000, '2,5 milyon'], [7300000000, '7,3 milyar'], [1000000000000, '1 trilyon'], [1250, '1,3 bin'],
  [1249, '1,2 bin'], [-1250, '-1,3 bin'], [1150, '1,2 bin'], [2150000, '2,2 milyon'], [999999, '1 milyon'],
  [999949, '999,9 bin'], [999950000, '1 milyar'], [2500000000000000, '2.500 trilyon'], [-999999, '-1 milyon'],
]

describe('gizli: formatCompactTr', () => {
  it('dışa açılmış', () => {
    expect(typeof (sayiYazi as Record<string, unknown>).formatCompactTr).toBe('function')
  })

  it.each(CASES)('%d → %s', (value, expected) => {
    expect(format(value)).toBe(expected)
  })

  it('tam sayı olmayan girdi NumberFormatError verir', () => {
    expect(() => format(1.5)).toThrow(sayiYazi.NumberFormatError)
  })

  it('kaba kuvvetle karşılaştırma (|n| < 10^14)', () => {
    let state = 77
    const random = () => {
      state = (state * 1103515245 + 12345) % 2147483648
      return state / 2147483648
    }
    for (let i = 0; i < 5000; i++) {
      const digits = 1 + Math.floor(random() * 14)
      const value = Math.floor(random() * 10 ** digits) * (random() < 0.5 ? -1 : 1)
      expect(format(value), String(value)).toBe(reference(value))
    }
  })
})
