// cografya modülünün testi: ortak vektörler (hoşgörülü) + kosinüs yasasıyla karşılaştırma, gidiş-dönüş, kutu kapsamı.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as cografya from '../src/cografya.ts'
import {
  boundingBox,
  destinationPoint,
  EARTH_RADIUS_M,
  GeoError,
  haversineDistance,
  initialBearing,
  isInBoundingBox,
  nearest,
} from '../src/cografya.ts'

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

function expectClose(actual: unknown, expected: unknown, path = '$'): void {
  if (typeof expected === 'number') expect(Math.abs((actual as number) - expected), path).toBeLessThan(1e-6)
  else if (expected !== null && typeof expected === 'object') {
    for (const [key, value] of Object.entries(expected))
      expectClose((actual as Record<string, unknown>)[key], value, `${path}.${key}`)
  } else expect(actual, path).toEqual(expected)
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
  for (const [name, cases] of Object.entries(loadVectors('cografya'))) {
    const fn = (cografya as Record<string, unknown>)[name] as (...args: unknown[]) => unknown
    cases.forEach((testCase, index) => {
      it(`${name} #${index + 1}`, () => {
        const args = testCase.secenek ? [...testCase.girdi, testCase.secenek] : testCase.girdi
        if (testCase.hata) expect(() => fn(...args)).toThrow(GeoError)
        else expectClose(fn(...args), testCase.cikti)
      })
    })
  }
})

describe('özellikler', () => {
  const random = seededRandom(81)
  const point = () => ({ lat: (random() - 0.5) * 170, lon: (random() - 0.5) * 358 })

  it('haversine, küresel kosinüs yasasıyla aynı uzaklığı verir', () => {
    for (let i = 0; i < 500; i++) {
      const a = point()
      const b = point()
      const rad = Math.PI / 180
      const cosine =
        Math.acos(
          Math.min(
            1,
            Math.sin(a.lat * rad) * Math.sin(b.lat * rad) +
              Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lon - a.lon) * rad),
          ),
        ) * EARTH_RADIUS_M
      expect(Math.abs(haversineDistance(a, b) - cosine)).toBeLessThan(1)
    }
  })

  it('verilen yön ve uzaklıkta gidilen noktanın uzaklığı ve yönü geri bulunur; kutu çemberi kapsar', () => {
    for (let i = 0; i < 300; i++) {
      const start = { lat: (random() - 0.5) * 140, lon: (random() - 0.5) * 358 }
      const bearing = random() * 360
      const distance = 1 + random() * 50_000
      const end = destinationPoint(start, bearing, distance)
      expect(Math.abs(haversineDistance(start, end) - distance)).toBeLessThan(1e-3)
      const back = initialBearing(start, end)
      expect(Math.min(Math.abs(back - bearing), 360 - Math.abs(back - bearing))).toBeLessThan(1e-6)
      expect(isInBoundingBox(end, boundingBox(start, distance * 1.000001))).toBe(true)
    }
  })

  it('en yakın noktalar sıralı döner', () => {
    const subeler = [
      { ad: 'Kadıköy', konum: { lat: 40.99, lon: 29.03 } },
      { ad: 'Beşiktaş', konum: { lat: 41.04, lon: 29.0 } },
      { ad: 'Ankara', konum: { lat: 39.93, lon: 32.86 } },
    ]
    const result = nearest({ lat: 41.03, lon: 29.0 }, subeler, { key: (s) => s.konum, limit: 2 })
    expect(result.map((r) => r.item.ad)).toEqual(['Beşiktaş', 'Kadıköy'])
  })
})
