// cron modülünün testi: ortak vektörler + dakika dakika kaba kuvvetle karşılaştırma.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as cron from '../src/cron.ts'
import { CronError, matchesCron, nextRuns, parseCron } from '../src/cron.ts'

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

const utc = (value: unknown): unknown => (value instanceof Date ? value.toISOString().replace('.000Z', 'Z') : value)

describe('ortak vektörler', () => {
  for (const [name, cases] of Object.entries(loadVectors('cron'))) {
    const fn = (cron as Record<string, unknown>)[name] as (...args: unknown[]) => unknown
    cases.forEach((testCase, index) => {
      it(`${name} #${index + 1}: ${JSON.stringify(testCase.girdi)}`, () => {
        const args = testCase.secenek ? [...testCase.girdi, testCase.secenek] : testCase.girdi
        if (testCase.hata) expect(() => fn(...args)).toThrow(CronError)
        else expect(utc(fn(...args))).toEqual(testCase.cikti)
      })
    })
  }
})

describe('kaba kuvvetle karşılaştırma', () => {
  const expressions = ['*/7 * * * *', '0 */5 * * 1-5', '15 3 1,15 * *', '0 0 1 * 1', '30 12 * NOV-DEC SAT,SUN', '*/20 9-17 * * *']

  it('nextRun, dakika dakika ilerleyip matchesCron ile bulunan ilk ana eşittir', () => {
    const start = Date.parse('2026-11-16T10:07:00+03:00')
    for (const expression of expressions) {
      const schedule = parseCron(expression)
      let after = start
      for (const run of nextRuns(schedule, new Date(start), 5)) {
        let minute = Math.floor(after / 60_000) + 1
        while (!matchesCron(schedule, new Date(minute * 60_000))) minute += 1
        expect(run.getTime(), expression).toBe(minute * 60_000)
        after = run.getTime()
      }
    }
  })
})
