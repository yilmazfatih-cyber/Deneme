// maske modülünün testi: ortak vektörler + "gizli kısım sızmaz" özellik testi.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as maske from '../src/maske.ts'
import { maskCardNumber, maskMiddle, maskTckn } from '../src/maske.ts'

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
  for (const [name, cases] of Object.entries(loadVectors('maske'))) {
    const fn = (maske as Record<string, unknown>)[name] as (...args: unknown[]) => unknown
    cases.forEach((testCase, index) => {
      it(`${name} #${index + 1}: ${JSON.stringify(testCase.girdi)}`, () => {
        const args = testCase.secenek ? [...testCase.girdi, testCase.secenek] : testCase.girdi
        expect(fn(...args)).toEqual(testCase.cikti)
      })
    })
  }
})

describe('özellikler', () => {
  it('maskMiddle uzunluğu ve ayırıcıları korur, açık hane sayısını aşmaz', () => {
    for (const text of ['ABC-12345', 'TR33 0006 1005', 'a.b@c.d', 'Çağrı Öztürk', '1-2-3']) {
      for (let start = 0; start < 4; start++) {
        for (let end = 0; end < 4; end++) {
          const masked = maskMiddle(text, { keepStart: start, keepEnd: end })
          expect(Array.from(masked)).toHaveLength(Array.from(text).length)
          const visible = Array.from(masked).filter((ch, i) => ch !== '*' && ch === Array.from(text)[i])
          const separators = Array.from(text).filter((ch) => !/[\p{L}\p{N}]/u.test(ch)).length
          expect(visible.length - separators).toBeLessThanOrEqual(start + end)
        }
      }
    }
  })

  it('TCKN ve kartta ortadaki haneler hiç görünmez', () => {
    expect(maskTckn('98765432109').slice(3, 9)).toBe('******')
    expect(maskCardNumber('4111 2222 3333 4444')).not.toMatch(/2|3/)
  })
})
