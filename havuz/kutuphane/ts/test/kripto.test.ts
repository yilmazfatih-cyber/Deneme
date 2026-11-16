// kripto modülünün testi: ortak vektörler (standart SHA-256/HMAC/PBKDF2 değerleri) + gidiş-dönüş ve kurcalama.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as kripto from '../src/kripto.ts'
import { hashPassword, needsRehash, randomToken, signToken, verifyPassword, verifyToken } from '../src/kripto.ts'

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
  for (const [name, cases] of Object.entries(loadVectors('kripto'))) {
    const fn = (kripto as Record<string, unknown>)[name] as (...args: unknown[]) => unknown
    cases.forEach((testCase, index) => {
      it(`${name} #${index + 1}`, async () => {
        const args = testCase.secenek ? [...testCase.girdi, testCase.secenek] : testCase.girdi
        if (testCase.hata) await expect(Promise.resolve().then(() => fn(...args))).rejects.toThrow()
        else expect(await fn(...args)).toEqual(testCase.cikti)
      })
    })
  }
})

describe('belirteç ve parola', () => {
  it('imzalı belirteç gidiş-dönüş; yük ya da imza kurcalanınca reddedilir', async () => {
    const secret = randomToken()
    const token = await signToken({ sub: 'ayşe', roller: ['okur'] }, secret, { expiresInSeconds: 60, nowSeconds: 1000 })
    const result = await verifyToken(token, secret, { nowSeconds: 1030 })
    expect(result).toEqual({ ok: true, payload: { sub: 'ayşe', roller: ['okur'], iat: 1000, exp: 1060 } })
    const [prefix, body = '', signature = ''] = token.split('.')
    const flipped = (text: string) => (text.endsWith('A') ? `${text.slice(0, -1)}B` : `${text.slice(0, -1)}A`)
    expect(await verifyToken(`${prefix}.${flipped(body)}.${signature}`, secret, { nowSeconds: 1030 })).toEqual({
      ok: false,
      reason: 'signature',
    })
    expect(await verifyToken(`${prefix}.${body}.${flipped(signature)}`, secret, { nowSeconds: 1030 })).toEqual({
      ok: false,
      reason: 'signature',
    })
    expect(await verifyToken(token, secret, { nowSeconds: 1060 })).toEqual({ ok: false, reason: 'expired' })
  })

  it('parola özeti: her seferinde farklı tuz, doğrulama, NFC normalleştirme, yeniden özetleme', async () => {
    const a = await hashPassword('Şifre!123', { iterations: 1000 })
    const b = await hashPassword('Şifre!123', { iterations: 1000 })
    expect(a).not.toBe(b)
    expect(await verifyPassword('Şifre!123', a)).toBe(true)
    expect(await verifyPassword('S\u{327}ifre!123', a)).toBe(true) // ayrışık yazılmış Ş aynı parola
    expect(await verifyPassword('şifre!123', a)).toBe(false)
    expect(needsRehash(a)).toBe(true)
    expect(needsRehash(a, 1000)).toBe(false)
    expect(randomToken(16)).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(() => randomToken(8)).toThrow(RangeError)
  })
})
