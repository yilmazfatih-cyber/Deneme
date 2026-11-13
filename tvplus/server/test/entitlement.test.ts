import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { ACCOUNT_SINEMA, ADULT, createAlanApp, ID, KID, passport, setClock, TEEN, TEST_NOW } from './fixtures/alan'

describe('yetki kararları', () => {
  let app: FastifyInstance
  beforeAll(async () => {
    app = await createAlanApp()
  })
  afterAll(async () => {
    await app.close()
  })

  it('PLAYABLE: temel pakette, profile uygun', () => {
    expect(app.services.entitlement.accessForVideo(passport(ADULT), ID.sintel)).toEqual({
      state: 'PLAYABLE',
      reasonText: null,
      requiredProduct: null,
      requiredProductName: null,
      cta: null,
    })
    expect(app.services.entitlement.accessForVideo(passport(ADULT), ID.caminandes).state).toBe('PLAYABLE')
    expect(app.services.entitlement.accessForVideo(passport(ADULT), ID.cam_s2e2).state).toBe('PLAYABLE')
  })

  it('UPSELL: paket yoksa (anonim dahil); paket varsa PLAYABLE', () => {
    const up = app.services.entitlement.accessForVideo(passport(ADULT), ID.tears)
    expect(up).toEqual({
      state: 'UPSELL',
      reasonText: 'Sinema Paketi ile izlenir',
      requiredProduct: 'sinema-paketi',
      requiredProductName: 'Sinema Paketi',
      cta: 'Paketi incele',
    })
    expect(app.services.entitlement.accessForVideo(passport(null, null), ID.tears).state).toBe('UPSELL')
    expect(app.services.entitlement.accessForVideo(passport(ADULT, ACCOUNT_SINEMA), ID.tears)).toMatchObject({
      state: 'PLAYABLE',
      requiredProduct: 'sinema-paketi',
      reasonText: null,
    })
  })

  it('BLOCKED: profil için uygun değil (paket kontrolünden sonra)', () => {
    expect(app.services.entitlement.accessForVideo(passport(TEEN), ID.nosferatu)).toMatchObject({
      state: 'BLOCKED',
      reasonText: 'Bu profil için uygun değil',
    })
    expect(app.services.entitlement.accessForVideo(passport(KID), ID.sintel).state).toBe('BLOCKED')
    // paket eksikliği önce gelir
    expect(app.services.entitlement.accessForVideo(passport(KID), ID.tears).state).toBe('UPSELL')
    expect(app.services.entitlement.accessForVideo(passport(ADULT), 42).state).toBe('BLOCKED')
  })

  it('OUT_OF_WINDOW: kalkış tarihi geçince', () => {
    expect(app.services.entitlement.accessForVideo(passport(ADULT), ID.cosmos).state).toBe('PLAYABLE')
    setClock(app, new Date('2026-11-17T21:00:00Z')) // 2026-11-18 00:00 İstanbul
    expect(app.services.entitlement.accessForVideo(passport(ADULT), ID.cosmos)).toMatchObject({
      state: 'OUT_OF_WINDOW',
      reasonText: 'Yayından kalktı',
    })
    setClock(app, TEST_NOW)
  })

  it('kanallar: paket ve çocuk profili', () => {
    expect(app.services.entitlement.accessForChannel(passport(ADULT), 1).state).toBe('PLAYABLE')
    expect(app.services.entitlement.accessForChannel(passport(ADULT), 5)).toMatchObject({
      state: 'UPSELL',
      reasonText: 'Sinema Paketi ile izlenir',
      cta: 'Paketi incele',
    })
    expect(app.services.entitlement.accessForChannel(passport(ADULT, ACCOUNT_SINEMA), 5).state).toBe('PLAYABLE')
    expect(app.services.entitlement.accessForChannel(passport(KID), 1)).toMatchObject({
      state: 'BLOCKED',
      reasonText: 'Bu profil için uygun değil',
    })
    expect(app.services.entitlement.accessForChannel(passport(KID), 4).state).toBe('PLAYABLE')
    expect(app.services.entitlement.accessForChannel(passport(ADULT), 404).state).toBe('BLOCKED')
  })
})
