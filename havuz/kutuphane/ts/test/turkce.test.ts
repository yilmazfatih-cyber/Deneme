// turkce modülünün testi: ortak vektörler (vektorler/turkce.json) + özellik testleri + Intl ile çapraz denetim.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as turkce from '../src/turkce.ts'
import { compareTr, lowerTr, sortKeyTr, sortTr, syllabify, upperTr, isVowel } from '../src/turkce.ts'

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

/** Tohumlu sözde rastgele üreteç (mulberry32): testler her koşuda aynı girdileri üretir. */
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

function randomWord(random: () => number, alphabet: string, maxLength = 8): string {
  const letters = Array.from(alphabet)
  const length = 1 + Math.floor(random() * maxLength)
  let word = ''
  for (let i = 0; i < length; i++) word += letters[Math.floor(random() * letters.length)] ?? ''
  return word
}

const LOWER = 'abcçdefgğhıijklmnoöprsştuüvyz'
const MIXED = LOWER + 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ'

describe('ortak vektörler', () => {
  const vectors = loadVectors('turkce')
  for (const [name, cases] of Object.entries(vectors)) {
    const fn = (turkce as Record<string, unknown>)[name]
    it(`${name} dışa açılmış bir işlev`, () => {
      expect(typeof fn, `vektör dosyasındaki "${name}" işlevi src/turkce.ts içinde yok`).toBe('function')
    })
    cases.forEach((testCase, index) => {
      it(`${name} #${index + 1}: ${JSON.stringify(testCase.girdi)}`, () => {
        const args = testCase.secenek ? [...testCase.girdi, testCase.secenek] : testCase.girdi
        const call = () => (fn as (...a: unknown[]) => unknown)(...args)
        if (testCase.hata) expect(call).toThrow()
        else expect(call()).toEqual(testCase.cikti)
      })
    })
  }
})

describe('büyük/küçük harf özellikleri', () => {
  it('yerleşik işlevlerin Türkçe tuzağına düşmez', () => {
    expect('i'.toUpperCase()).toBe('I') // tuzak: yerleşik işlev
    expect(upperTr('i')).toBe('İ')
    expect('İ'.toLowerCase()).toHaveLength(2) // tuzak: i + birleşik nokta
    expect(lowerTr('İ')).toBe('i')
  })

  it('rastgele metinde tr-TR yerel işleviyle aynı sonucu verir', () => {
    const random = seededRandom(1)
    for (let i = 0; i < 500; i++) {
      const word = randomWord(random, MIXED + ' 0123456789', 12)
      expect(upperTr(word)).toBe(word.toLocaleUpperCase('tr-TR'))
      expect(lowerTr(word)).toBe(word.toLocaleLowerCase('tr-TR'))
    }
  })

  it('gidiş-dönüş tutarlı ve tekrar uygulanınca değişmez', () => {
    const random = seededRandom(2)
    for (let i = 0; i < 300; i++) {
      const word = randomWord(random, MIXED)
      expect(lowerTr(upperTr(word))).toBe(lowerTr(word))
      expect(upperTr(upperTr(word))).toBe(upperTr(word))
      expect(lowerTr(lowerTr(word))).toBe(lowerTr(word))
    }
  })
})

describe('sıralama özellikleri', () => {
  it('compareTr ters simetrik ve geçişli', () => {
    const random = seededRandom(3)
    const words = Array.from({ length: 60 }, () => randomWord(random, MIXED + ' -1', 5))
    for (const a of words) {
      for (const b of words) {
        expect(compareTr(a, b)).toBe(-compareTr(b, a) || 0)
        for (const c of words.slice(0, 12)) {
          if (compareTr(a, b) <= 0 && compareTr(b, c) <= 0) expect(compareTr(a, c)).toBeLessThanOrEqual(0)
        }
      }
    }
  })

  it('sortTr sonucu compareTr ile sıralıdır ve girdiyi değiştirmez', () => {
    const random = seededRandom(4)
    const words = Array.from({ length: 200 }, () => randomWord(random, MIXED))
    const copy = [...words]
    const sorted = sortTr(words)
    expect(words).toEqual(copy)
    expect(sorted).toEqual([...words].sort(compareTr))
    for (let i = 1; i < sorted.length; i++)
      expect(compareTr(sorted[i - 1] ?? '', sorted[i] ?? '')).toBeLessThanOrEqual(0)
  })

  it('nesne dizisini alanla sıralar', () => {
    const people = [{ ad: 'Şule' }, { ad: 'Selin' }, { ad: 'Çağla' }]
    expect(sortTr(people, { by: (p) => p.ad }).map((p) => p.ad)).toEqual(['Çağla', 'Selin', 'Şule'])
  })

  it('küçük harfli sözcüklerde Intl.Collator("tr") ile aynı sırayı verir', () => {
    if (Intl.Collator.supportedLocalesOf(['tr']).length === 0) return // ICU verisi yoksa çapraz denetim atlanır
    const collator = new Intl.Collator('tr')
    const random = seededRandom(5)
    for (let i = 0; i < 2000; i++) {
      const a = randomWord(random, LOWER + 'qwx', 6)
      const b = randomWord(random, LOWER + 'qwx', 6)
      expect(Math.sign(compareTr(a, b)), `${a} ~ ${b}`).toBe(Math.sign(collator.compare(a, b)))
    }
  })

  it('anahtar, kod noktası sırasıyla karşılaştırılınca compareTr ile uyumludur', () => {
    const random = seededRandom(6)
    for (let i = 0; i < 500; i++) {
      const a = randomWord(random, MIXED + ' 12', 6)
      const b = randomWord(random, MIXED + ' 12', 6)
      const ka = sortKeyTr(a)
      const kb = sortKeyTr(b)
      if (ka !== kb) expect(compareTr(a, b)).toBe(ka < kb ? -1 : 1) // anahtarlar BMP içinde: `<` güvenli
    }
  })
})

describe('heceleme özellikleri', () => {
  it('heceler birleşince sözcüğü verir ve her hecede tam bir ünlü vardır', () => {
    const random = seededRandom(7)
    for (let i = 0; i < 500; i++) {
      const word = randomWord(random, LOWER, 12)
      const syllables = syllabify(word)
      expect(syllables.join('')).toBe(word)
      const vowelCount = Array.from(word).filter(isVowel).length
      if (vowelCount > 0) {
        expect(syllables).toHaveLength(vowelCount)
        for (const syllable of syllables) expect(Array.from(syllable).filter(isVowel)).toHaveLength(1)
      }
    }
  })
})
