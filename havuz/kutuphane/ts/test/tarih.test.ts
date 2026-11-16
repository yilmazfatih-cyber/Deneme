// tarih modülünün testi: ortak vektörler + Date.UTC ile çapraz denetim + iş günü ters işlem özelliği.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as tarih from '../src/tarih.ts'
import {
  addBusinessDays,
  addDays,
  businessDaysBetween,
  DateError,
  dayOfWeek,
  formatDateTr,
  isBusinessDay,
  isoWeek,
  parseDateTr,
  toIsoDate,
} from '../src/tarih.ts'

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
  for (const [name, cases] of Object.entries(loadVectors('tarih'))) {
    const fn = (tarih as Record<string, unknown>)[name] as (...args: unknown[]) => unknown
    cases.forEach((testCase, index) => {
      it(`${name} #${index + 1}: ${JSON.stringify(testCase.girdi)}`, () => {
        const args = testCase.secenek ? [...testCase.girdi, testCase.secenek] : testCase.girdi
        if (testCase.hata) expect(() => fn(...args)).toThrow(DateError)
        else expect(fn(...args)).toEqual(testCase.cikti)
      })
    })
  }
})

describe('Date.UTC ile çapraz denetim', () => {
  const random = seededRandom(31)
  const samples = Array.from({ length: 3000 }, () => Math.floor((random() - 0.5) * 200_000)) // ±274 yıl
  const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

  it('gün ekleme ve haftanın günü yerleşik takvimle aynı', () => {
    for (const offset of samples) {
      const ms = Date.UTC(2000, 0, 1) + offset * 86_400_000
      expect(addDays('2000-01-01', offset)).toBe(iso(ms))
      expect(dayOfWeek(iso(ms))).toBe(((new Date(ms).getUTCDay() + 6) % 7) + 1)
    }
  })

  it('ISO hafta: perşembe kuralına göre bağımsız hesapla aynı', () => {
    for (const offset of samples.slice(0, 1000)) {
      const ms = Date.UTC(2000, 0, 1) + offset * 86_400_000
      const date = new Date(ms)
      const thursday = new Date(ms + (3 - ((date.getUTCDay() + 6) % 7)) * 86_400_000)
      const year = thursday.getUTCFullYear()
      const week = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / (7 * 86_400_000)) + 1
      expect(isoWeek(iso(ms))).toEqual({ year, week })
    }
  })

  it('biçimlenen tarih geri ayrıştırılınca aynı gün çıkar', () => {
    for (const offset of samples.slice(0, 500)) {
      const day = addDays('2000-01-01', offset)
      for (const pattern of ['kisa', 'orta', 'uzun']) expect(parseDateTr(formatDateTr(day, pattern))).toBe(day)
    }
  })

  it('Date nesnesi Türkiye saatine göre güne çevrilir (UTC 21:00 sonrası ertesi gün)', () => {
    expect(toIsoDate(new Date('2026-11-16T20:59:59Z'))).toBe('2026-11-16')
    expect(toIsoDate(new Date('2026-11-16T21:00:00Z'))).toBe('2026-11-17')
  })
})

describe('iş günü', () => {
  it('addBusinessDays ile businessDaysBetween birbirinin tersidir', () => {
    const random = seededRandom(32)
    const holidays = ['2026-03-20', '2026-05-27', '2026-05-28']
    for (let i = 0; i < 300; i++) {
      const start = addDays('2026-01-01', Math.floor(random() * 365))
      const count = Math.floor((random() - 0.5) * 60)
      const end = addBusinessDays(start, count, { holidays })
      if (count !== 0) expect(isBusinessDay(end, { holidays })).toBe(true)
      expect(businessDaysBetween(start, end, { holidays })).toBe(count)
    }
  })
})
