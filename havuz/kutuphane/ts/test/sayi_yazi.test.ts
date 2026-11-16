// sayi_yazi modülünün testi: ortak vektörler + yazıdan geri okuma ve gidiş-dönüş özellik testleri.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as sayiYazi from '../src/sayi_yazi.ts'
import { formatNumberTr, NumberFormatError, numberToWords, parseNumberTr } from '../src/sayi_yazi.ts'

interface VectorCase {
  girdi: unknown[]
  secenek?: Record<string, unknown>
  cikti?: unknown
  hata?: boolean
}

function loadVectors(name: string): Record<string, VectorCase[]> {
  for (const relative of [`./vektorler/${name}.json`, `../../vektorler/${name}.json`]) {
    const url = new URL(relative, import.meta.url)
    if (existsSync(url)) return JSON.parse(readFileSync(url, 'utf8')).islevler
  }
  throw new Error(`vektorler/${name}.json bulunamadı (testin yanında ya da kutuphane/vektorler altında olmalı)`)
}

/** Tohumlu sözde rastgele üreteç (mulberry32). */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('ortak vektörler', () => {
  for (const [name, cases] of Object.entries(loadVectors('sayi_yazi'))) {
    const fn = (sayiYazi as Record<string, unknown>)[name] as (...args: unknown[]) => unknown
    cases.forEach((testCase, index) => {
      it(`${name} #${index + 1}: ${JSON.stringify(testCase.girdi)}`, () => {
        const args = testCase.secenek ? [...testCase.girdi, testCase.secenek] : testCase.girdi
        if (testCase.hata) expect(() => fn(...args)).toThrow(NumberFormatError)
        else expect(fn(...args)).toEqual(testCase.cikti)
      })
    })
  }
})

/** Bağımsız geri okuyucu: "bin iki yüz otuz dört" → 1234n. Yazıya çevirmeyi tersinden doğrular. */
function wordsToNumber(text: string): bigint {
  const small: Record<string, bigint> = {
    bir: 1n, iki: 2n, üç: 3n, dört: 4n, beş: 5n, altı: 6n, yedi: 7n, sekiz: 8n, dokuz: 9n, on: 10n, yirmi: 20n,
    otuz: 30n, kırk: 40n, elli: 50n, altmış: 60n, yetmiş: 70n, seksen: 80n, doksan: 90n,
  } // prettier-ignore
  const scales: Record<string, bigint> = {
    bin: 10n ** 3n, milyon: 10n ** 6n, milyar: 10n ** 9n, trilyon: 10n ** 12n, katrilyon: 10n ** 15n,
    kentilyon: 10n ** 18n,
  } // prettier-ignore
  let total = 0n
  let group = 0n
  for (const word of text.split(' ')) {
    if (word === 'sıfır') continue
    if (word === 'yüz') group = (group === 0n ? 1n : group) * 100n
    else if (scales[word] !== undefined) {
      total += (group === 0n ? 1n : group) * scales[word]
      group = 0n
    } else group += small[word] ?? 0n
  }
  return total + group
}

describe('özellikler', () => {
  it('yazıya çevrilen sayı geri okununca aynı sayı çıkar', () => {
    const random = seededRandom(11)
    for (let i = 0; i < 3000; i++) {
      const digits = 1 + Math.floor(random() * 21)
      let text = ''
      for (let d = 0; d < digits; d++) text += String(Math.floor(random() * 10))
      const value = BigInt(text)
      expect(wordsToNumber(numberToWords(value)), text).toBe(value)
      expect(numberToWords(value)).not.toMatch(/(^|yon |yar )bir bin| {2}|^ | $/) // "bir bin" değil "bin"
    }
  })

  it('biçimlenen sayı ayrıştırılınca aynı sayı çıkar', () => {
    const random = seededRandom(12)
    for (let i = 0; i < 3000; i++) {
      const value = (random() - 0.5) * 10 ** Math.floor(random() * 12)
      expect(parseNumberTr(formatNumberTr(value))).toBe(value)
    }
  })

  it('iki ondalıklı sayılarda Intl tr-TR biçimiyle aynıdır', () => {
    const intl = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    if (intl.format(1234.5) !== '1.234,50') return // ICU verisi eksikse çapraz denetim atlanır
    const random = seededRandom(13)
    for (let i = 0; i < 2000; i++) {
      const value = Math.round((random() - 0.5) * 10 ** 9) / 100
      expect(formatNumberTr(value, { decimals: 2 })).toBe(intl.format(value).replace('−', '-'))
    }
  })

  it('NaN ve sonsuz biçimlenmez', () => {
    expect(() => formatNumberTr(Number.NaN)).toThrow(NumberFormatError)
    expect(() => formatNumberTr(Number.POSITIVE_INFINITY)).toThrow(NumberFormatError)
  })
})
