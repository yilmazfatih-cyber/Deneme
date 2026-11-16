// metin modülünün testi: ortak vektörler + kısaltma/sarma özellikleri.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as metin from '../src/metin.ts'
import { escapeHtml, fillTemplate, TemplateError, truncate, wrap } from '../src/metin.ts'

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

describe('ortak vektörler', () => {
  for (const [name, cases] of Object.entries(loadVectors('metin'))) {
    const fn = (metin as Record<string, unknown>)[name] as (...args: unknown[]) => unknown
    cases.forEach((testCase, index) => {
      it(`${name} #${index + 1}`, () => {
        const args = testCase.secenek ? [...testCase.girdi, testCase.secenek] : testCase.girdi
        if (testCase.hata) expect(() => fn(...args)).toThrow()
        else expect(fn(...args)).toEqual(testCase.cikti)
      })
    })
  }
})

describe('özellikler', () => {
  const sample = 'Türkiye Büyük Millet Meclisi, 23 Nisan 1920 günü Ankara’da açıldı; çağdaş devletin temelidir.'

  it('kısaltma sınırı aşmaz ve orijinalin başıdır', () => {
    for (let max = 0; max <= Array.from(sample).length + 2; max++) {
      const result = truncate(sample, max)
      expect(Array.from(result).length).toBeLessThanOrEqual(max)
      if (result.endsWith('…')) expect(sample.startsWith(result.slice(0, -1))).toBe(true)
    }
  })

  it('sarılan satırlar genişliği aşmaz ve sözcükler kaybolmaz', () => {
    for (let width = 1; width <= 30; width++) {
      const lines = wrap(sample, width)
      for (const line of lines) expect(Array.from(line).length).toBeLessThanOrEqual(width)
      expect(lines.join('').replace(/ /g, '')).toBe(sample.replace(/ /g, ''))
    }
  })

  it('şablona HTML kaçışı uygulanabilir', () => {
    expect(fillTemplate('<b>{ad}</b>', { ad: '<script>' }, { escape: escapeHtml })).toBe('<b>&lt;script&gt;</b>')
    expect(() => fillTemplate('{x}', { x: Number.NaN })).toThrow(TemplateError)
  })
})
