// Sabitlenmiş Apple kökünün ve zincir doğrulamasının Workers çalışma zamanında sınanması.
// Burada Apple'ın GERÇEK ara ve yaprak sertifikaları kullanılır (özel anahtarları olmadığı için işlem imzalanamaz;
// yalnız zincir doğrulanır).

import { describe, expect, it } from 'vitest'
import { DogrulamaHatasi, zinciriDogrula } from '../src/jws'
import { APPLE_KOK_G3_DER, APPLE_KOK_G3_PEM, APPLE_KOK_G3_SHA256, pemdenDer } from '../src/kok'
import { base64Coz, base64UrlCoz, sha256Onaltilik, tuzluOzet } from '../src/yardimci'
import { GERCEK_APPLE_ARA_BASE64, GERCEK_APPLE_GECERLI_AN, GERCEK_APPLE_YAPRAK_BASE64 } from './apple-gercek'
import { zincirUret } from './destek'

const ara = base64Coz(GERCEK_APPLE_ARA_BASE64)!
const yaprak = base64Coz(GERCEK_APPLE_YAPRAK_BASE64)!

describe('sabitlenmiş kök', () => {
  it('PEM metninin SHA-256 parmak izi, kaynakta yazılı parmak iziyle aynıdır', async () => {
    expect(await sha256Onaltilik(pemdenDer(APPLE_KOK_G3_PEM))).toBe(APPLE_KOK_G3_SHA256)
    expect(APPLE_KOK_G3_SHA256).toBe('63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179')
    expect(APPLE_KOK_G3_DER.length).toBe(583)
  })

  it("Apple'ın gerçek ara ve yaprak sertifikasını doğrular", async () => {
    const anahtar = await zinciriDogrula([yaprak, ara, APPLE_KOK_G3_DER], APPLE_KOK_G3_DER, GERCEK_APPLE_GECERLI_AN)
    expect(anahtar.type).toBe('public')
    expect(anahtar.algorithm).toMatchObject({ name: 'ECDSA', namedCurve: 'P-256' })
    // İkinci çağrı önbellekten gelir ve aynı anahtarı verir.
    expect(await zinciriDogrula([yaprak, ara, APPLE_KOK_G3_DER], APPLE_KOK_G3_DER, GERCEK_APPLE_GECERLI_AN)).toBe(anahtar)
  })

  it('gerçek zincir, yaprağın geçerlilik süresi dışında reddedilir', async () => {
    const zincir = [yaprak, ara, APPLE_KOK_G3_DER]
    // Yaprak 2025-09-19'da başlar, 2027-10-13'te biter.
    await expect(zinciriDogrula(zincir, APPLE_KOK_G3_DER, Date.UTC(2025, 5, 1))).rejects.toBeInstanceOf(DogrulamaHatasi)
    await expect(zinciriDogrula(zincir, APPLE_KOK_G3_DER, Date.UTC(2027, 10, 1))).rejects.toBeInstanceOf(DogrulamaHatasi)
  })

  it('gerçek zincir yanlış sırayla ya da eksik verilirse reddedilir', async () => {
    const an = GERCEK_APPLE_GECERLI_AN
    for (const zincir of [
      [ara, yaprak, APPLE_KOK_G3_DER],
      [yaprak, APPLE_KOK_G3_DER, APPLE_KOK_G3_DER],
      [ara, ara, APPLE_KOK_G3_DER],
      [yaprak, ara],
      [yaprak, ara, ara],
    ]) {
      await expect(zinciriDogrula(zincir, APPLE_KOK_G3_DER, an)).rejects.toBeInstanceOf(DogrulamaHatasi)
    }
  })

  it('test kökü Apple köküne göre, Apple zinciri test köküne göre reddedilir', async () => {
    const test = await zincirUret(GERCEK_APPLE_GECERLI_AN)
    await expect(
      zinciriDogrula([test.yaprak.der, test.ara.der, test.kok.der], APPLE_KOK_G3_DER, GERCEK_APPLE_GECERLI_AN),
    ).rejects.toBeInstanceOf(DogrulamaHatasi)
    await expect(
      zinciriDogrula([test.yaprak.der, test.ara.der, APPLE_KOK_G3_DER], APPLE_KOK_G3_DER, GERCEK_APPLE_GECERLI_AN),
    ).rejects.toBeInstanceOf(DogrulamaHatasi)
    await expect(
      zinciriDogrula([yaprak, ara, APPLE_KOK_G3_DER], test.kok.der, GERCEK_APPLE_GECERLI_AN),
    ).rejects.toBeInstanceOf(DogrulamaHatasi)
    // Test zinciri kendi köküne göre geçerlidir (denetimin kendisi çalışıyor).
    await expect(
      zinciriDogrula([test.yaprak.der, test.ara.der, test.kok.der], test.kok.der, GERCEK_APPLE_GECERLI_AN),
    ).resolves.toBeDefined()
  })
})

describe('yardımcılar', () => {
  it('base64 ve base64url çözücüleri bozuk girdiyi reddeder', () => {
    expect(base64Coz('AQID')).toEqual(new Uint8Array([1, 2, 3]))
    expect(base64Coz('AQI=')).toEqual(new Uint8Array([1, 2]))
    expect(base64Coz('AQI')).toBeNull()
    expect(base64Coz('AQ-_')).toBeNull()
    expect(base64Coz('A QID')).toBeNull()
    expect(base64UrlCoz('AQI')).toEqual(new Uint8Array([1, 2]))
    expect(base64UrlCoz('-_-_')).toEqual(new Uint8Array([251, 255, 191]))
    expect(base64UrlCoz('AQI=')).toBeNull()
    expect(base64UrlCoz('A+/A')).toBeNull()
    expect(base64UrlCoz('A')).toBeNull()
    expect(base64UrlCoz('')).toBeNull()
  })

  it('tuzlu özet tuza ve değere bağlıdır', async () => {
    const a = await tuzluOzet('tuz-bir-0123456789', 'deger')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(await tuzluOzet('tuz-bir-0123456789', 'deger')).toBe(a)
    expect(await tuzluOzet('tuz-iki-0123456789', 'deger')).not.toBe(a)
    expect(await tuzluOzet('tuz-bir-0123456789', 'deger2')).not.toBe(a)
  })
})
