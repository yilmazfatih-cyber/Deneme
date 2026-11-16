// sayfalama modülünün testi: ortak vektörler + imleçle bütün listeyi eksiksiz ve yinelemesiz gezme.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as sayfalama from '../src/sayfalama.ts'
import { CursorError, keysetWhere, paginate } from '../src/sayfalama.ts'

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
  for (const [name, cases] of Object.entries(loadVectors('sayfalama'))) {
    const fn = (sayfalama as Record<string, unknown>)[name] as (...args: unknown[]) => unknown
    cases.forEach((testCase, index) => {
      it(`${name} #${index + 1}`, () => {
        const args = testCase.secenek ? [...testCase.girdi, testCase.secenek] : testCase.girdi
        if (testCase.hata) expect(() => fn(...args)).toThrow(CursorError)
        else expect(fn(...args)).toEqual(testCase.cikti)
      })
    })
  }
})

describe('özellikler', () => {
  it('imleçle gezinti her kaydı tam bir kez verir (eşit tarihler dahil)', () => {
    const items = Array.from({ length: 53 }, (_, id) => ({ tarih: `2026-01-${String(1 + Math.floor(id / 4)).padStart(2, '0')}`, id }))
    for (const limit of [1, 2, 5, 10, 53, 100]) {
      const seen: number[] = []
      let cursor: string | null = null
      for (let guard = 0; guard < 100; guard++) {
        const page: ReturnType<typeof paginate<(typeof items)[number]>> = paginate(items, { limit, cursor, sortKeys: ['tarih', 'id'] })
        seen.push(...page.items.map((item) => item.id))
        cursor = page.nextCursor
        if (!page.hasMore) break
      }
      expect(seen).toEqual(items.map((item) => item.id))
    }
  })

  it('özel yer tutucu (PostgreSQL $1, $2…)', () => {
    const { clause, params } = keysetWhere(['a', 'b'], [1, 2], { placeholder: (i) => `$${i}` })
    expect(clause).toBe('(a > $1) OR (a = $2 AND b > $3)')
    expect(params).toEqual([1, 1, 2])
  })
})
