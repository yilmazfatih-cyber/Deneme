// csv modülünün testi: ortak vektörler + yaz/oku gidiş-dönüş + parça sınırından bağımsızlık (akış).
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as csv from '../src/csv.ts'
import { CsvError, CsvParser, parseCsv, parseCsvStream, toCsv, type CsvCell } from '../src/csv.ts'

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
  for (const [name, cases] of Object.entries(loadVectors('csv'))) {
    const fn = (csv as Record<string, unknown>)[name] as (...args: unknown[]) => unknown
    cases.forEach((testCase, index) => {
      it(`${name} #${index + 1}: ${JSON.stringify(testCase.girdi)}`, () => {
        const args = testCase.secenek ? [...testCase.girdi, testCase.secenek] : testCase.girdi
        if (testCase.hata) expect(() => fn(...args)).toThrow(CsvError)
        else expect(fn(...args)).toEqual(testCase.cikti)
      })
    })
  }
})

const ALPHABET = ['a', 'b', 'ç', 'Ş', ',', ';', '"', '\n', '\r', ' ', '=', '1']

function randomTable(random: () => number): string[][] {
  return Array.from({ length: 1 + Math.floor(random() * 5) }, () =>
    Array.from({ length: 1 + Math.floor(random() * 4) }, () =>
      Array.from({ length: Math.floor(random() * 6) }, () => ALPHABET[Math.floor(random() * ALPHABET.length)]).join(''),
    ),
  ).filter((row) => !(row.length === 1 && row[0] === ''))
}

describe('özellikler', () => {
  it('yazılan tablo okununca aynı tablo çıkar (her ayırıcıyla)', () => {
    const random = seededRandom(51)
    for (let i = 0; i < 500; i++) {
      const table = randomTable(random)
      for (const delimiter of [',', ';', '\t']) {
        const text = toCsv(table, { delimiter })
        expect(parseCsv(text, { delimiter, strict: true })).toEqual(table)
      }
    }
  })

  it('parçalara hangi noktadan bölünürse bölünsün aynı sonuç (CRLF ve tırnak ortasında dahil)', async () => {
    const random = seededRandom(52)
    for (let i = 0; i < 200; i++) {
      // Ayırıcı ilk satırdan bulunduğu için ilk satır iki sütunlu bir başlıktır.
      const table = [['ad', 'soyad'], ...randomTable(random)]
      const text = toCsv(table, { delimiter: ';', bom: true })
      const whole = parseCsv(text)
      const parser = new CsvParser()
      const rows: string[][] = []
      let at = 0
      while (at < text.length) {
        const size = 1 + Math.floor(random() * 4)
        rows.push(...parser.push(text.slice(at, at + size)))
        at += size
      }
      rows.push(...parser.end())
      expect(rows).toEqual(whole)
      expect(whole).toEqual(table)
    }
  })

  it('akıştan (ReadableStream ve async iterable) okur', async () => {
    const text = 'ad;not\r\nAli;"çok\r\nsatır"\r\nVeli;5\r\n'
    const stream = new ReadableStream<string>({
      start(controller) {
        for (const piece of text.match(/.{1,3}/gs) ?? []) controller.enqueue(piece)
        controller.close()
      },
    })
    const fromStream: string[][] = []
    for await (const row of parseCsvStream(stream)) fromStream.push(row)
    async function* pieces() {
      yield 'a,b\n'
      yield '1,2'
    }
    const fromIterable: string[][] = []
    for await (const row of parseCsvStream(pieces())) fromIterable.push(row)
    expect(fromStream).toEqual([
      ['ad', 'not'],
      ['Ali', 'çok\r\nsatır'],
      ['Veli', '5'],
    ])
    expect(fromIterable).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('kapanmamış tırnak hatası satırı söyler; sonlu olmayan sayı yazılmaz', () => {
    expect(() => parseCsv('a\nb\n"c,d')).toThrow('Satır 3')
    const bad: CsvCell[][] = [[Number.NaN]]
    expect(() => toCsv(bad)).toThrow(CsvError)
  })
})
