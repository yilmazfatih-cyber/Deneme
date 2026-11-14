import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type {
  ManifestError,
  MslEnvelope,
  MslErrorBody,
  MslProvisionResponse,
  MslTokenData,
} from '../../shared/playback'
import { loadConfig } from '../src/kernel/config'
import { createMsl, MSL_EXPIRATION_SEC, MSL_RENEWAL_SEC } from '../src/services/playback/msl'
import { createTestApp } from './helpers'
import { openResponse, provisionClient, sealRequest, startProvision } from './msl-client'
import { fakePassport, installFakes, usePassport } from './playback-fakes'

const MANIFEST_URL = '/msl/v1/playapi/licensedManifest?reqName=licensedManifest'
const tokenOf = (t: { tokendata: string }) =>
  JSON.parse(Buffer.from(t.tokendata, 'base64').toString('utf8')) as MslTokenData
const manifestReq = (viewableId = 'Video:404') => ({
  viewableId,
  prefetch: false,
  profiles: ['vp9-webm', 'opus-webm'],
  supportsMse: true,
  uiLanguage: 'tr',
})

let app: FastifyInstance
beforeAll(async () => {
  app = await createTestApp()
  installFakes(app)
  usePassport(app, fakePassport())
})
afterAll(async () => {
  await app.close()
})

describe('MSL sağlama (aleProvision)', () => {
  it('ECDH P-256 ile anahtar verir; belirteç alanları sözleşmeye uyar', async () => {
    const p = await startProvision('TVPWCH-MC-A')
    const res = await app.inject({ method: 'POST', url: '/msl/v1/provision?reqName=aleProvision', payload: p.request })
    expect(res.statusCode).toBe(200)
    expect(res.headers['x-tvplus-msl']).toBe('v1')
    const body = res.json() as MslProvisionResponse
    expect(body.keyresponsedata.scheme).toBe('ECDH_P256_AESGCM')
    const pub = Buffer.from(body.keyresponsedata.keydata.publickey!, 'base64')
    expect(pub.length).toBe(65)
    expect(pub[0]).toBe(4)
    const t = tokenOf(body.mastertoken)
    const now = Math.floor(Date.now() / 1000)
    expect(t.esn).toBe('TVPWCH-MC-A')
    expect(t.scheme).toBe('ECDH_P256_AESGCM')
    expect(t.sequencenumber).toBe(1)
    expect(t.serialnumber).toBeGreaterThan(0)
    expect(Math.abs(t.renewalwindow - (now + MSL_RENEWAL_SEC))).toBeLessThanOrEqual(2)
    expect(Math.abs(t.expiration - (now + MSL_EXPIRATION_SEC))).toBeLessThanOrEqual(2)
    expect(t.sessiondata.length).toBeGreaterThan(20)
    // oturum anahtarları belirteçte açık durmaz
    expect(Buffer.from(t.sessiondata, 'base64').toString('latin1')).not.toMatch(/"e"|"h"/)
  })

  it('bozuk açık anahtar → 400 BAD_REQUEST', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/msl/v1/provision',
      payload: {
        entityauthdata: { scheme: 'NONE', authdata: { identity: 'x' } },
        keyrequestdata: { scheme: 'ECDH_P256_AESGCM', keydata: { publickey: 'AAAA' } },
      },
    })
    expect(res.statusCode).toBe(400)
    expect((res.json() as MslErrorBody).errorcode).toBe('BAD_REQUEST')
  })

  it('eğri dışı nokta → 400', async () => {
    const bogus = Buffer.alloc(65, 1)
    bogus[0] = 4
    const res = await app.inject({
      method: 'POST',
      url: '/msl/v1/provision',
      payload: {
        entityauthdata: { scheme: 'NONE', authdata: { identity: 'x' } },
        keyrequestdata: { scheme: 'ECDH_P256_AESGCM', keydata: { publickey: bogus.toString('base64') } },
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('eski belirteçle yenileme aynı seriyi sürdürür, sequencenumber bir artar', async () => {
    const first = await provisionClient(app, 'TVPWCH-MC-R')
    const p = await startProvision('TVPWCH-MC-R')
    const res = await app.inject({
      method: 'POST',
      url: '/msl/v1/provision',
      payload: { ...p.request, mastertoken: first.provision.mastertoken },
    })
    const t1 = tokenOf(first.provision.mastertoken)
    const t2 = tokenOf((res.json() as MslProvisionResponse).mastertoken)
    expect(t2.serialnumber).toBe(t1.serialnumber)
    expect(t2.sequencenumber).toBe(t1.sequencenumber + 1)
    // başka cihazın belirteci seriyi taşımaz
    const p3 = await startProvision('BASKA-CIHAZ')
    const r3 = await app.inject({
      method: 'POST',
      url: '/msl/v1/provision',
      payload: { ...p3.request, mastertoken: first.provision.mastertoken },
    })
    expect(tokenOf((r3.json() as MslProvisionResponse).mastertoken).serialnumber).not.toBe(t1.serialnumber)
  })
})

describe('MSL zarfı (WebCrypto istemcisi ↔ Node sunucusu)', () => {
  it('şifreli istek → şifreli yanıt; imza ve AAD doğrulanır', async () => {
    const c = await provisionClient(app, 'TVPWCH-MC-B')
    const env = await sealRequest(c, manifestReq('Video:404'))
    const res = await app.inject({ method: 'POST', url: MANIFEST_URL, payload: env })
    expect(res.statusCode).toBe(200)
    expect(res.headers['x-tvplus-msl']).toBe('v1')
    const out = await openResponse<ManifestError>(c, res.json() as MslEnvelope)
    expect(out.header.sender).toBe('tvplus-playapi')
    expect(out.header.messageid).toBe(2)
    expect(out.header.renewable).toBe(false)
    expect(out.payload.error.code).toBe('NOT_FOUND')
    // yanıt düz metin içermez
    expect(res.body).not.toContain('NOT_FOUND')
  })

  it('kurcalanmış yük → 400 DECRYPT_FAILED; kurcalanmış belirteç → 401 TOKEN_INVALID', async () => {
    const c = await provisionClient(app, 'TVPWCH-MC-C')
    const env = await sealRequest(c, manifestReq())
    const raw = Buffer.from(env.payload, 'base64')
    raw[20] = raw[20]! ^ 0xff
    const r1 = await app.inject({
      method: 'POST',
      url: MANIFEST_URL,
      payload: { ...env, payload: raw.toString('base64') },
    })
    expect(r1.statusCode).toBe(400)
    expect((r1.json() as MslErrorBody).errorcode).toBe('DECRYPT_FAILED')

    const env2 = await sealRequest(c, manifestReq())
    const td = tokenOf(env2.mastertoken)
    const forged = Buffer.from(JSON.stringify({ ...td, expiration: td.expiration + 99999 })).toString('base64')
    const r2 = await app.inject({
      method: 'POST',
      url: MANIFEST_URL,
      payload: { ...env2, mastertoken: { ...env2.mastertoken, tokendata: forged } },
    })
    expect(r2.statusCode).toBe(401)
    expect((r2.json() as MslErrorBody).errorcode).toBe('TOKEN_INVALID')

    const env3 = await sealRequest(c, manifestReq())
    const r3 = await app.inject({
      method: 'POST',
      url: MANIFEST_URL,
      payload: { ...env3, mastertoken: { ...env3.mastertoken, signature: Buffer.alloc(32).toString('base64') } },
    })
    expect((r3.json() as MslErrorBody).errorcode).toBe('TOKEN_INVALID')
  })

  it('başka oturumun anahtarıyla şifrelenmiş zarf reddedilir (AAD / anahtar bağlılığı)', async () => {
    const a = await provisionClient(app, 'TVPWCH-MC-D')
    const b = await provisionClient(app, 'TVPWCH-MC-D')
    const env = await sealRequest(b, manifestReq())
    const res = await app.inject({
      method: 'POST',
      url: MANIFEST_URL,
      payload: { ...env, mastertoken: a.provision.mastertoken },
    })
    expect(res.statusCode).toBe(400)
    expect((res.json() as MslErrorBody).errorcode).toBe('DECRYPT_FAILED')
  })

  it('tekrar oynatılan ya da eski messageid → 401 REPLAYED', async () => {
    const c = await provisionClient(app, 'TVPWCH-MC-E')
    const env = await sealRequest(c, manifestReq())
    expect((await app.inject({ method: 'POST', url: MANIFEST_URL, payload: env })).statusCode).toBe(200)
    const again = await app.inject({ method: 'POST', url: MANIFEST_URL, payload: env })
    expect(again.statusCode).toBe(401)
    expect((again.json() as MslErrorBody).errorcode).toBe('REPLAYED')
    c.nextMessageId = 5
    expect(
      (await app.inject({ method: 'POST', url: MANIFEST_URL, payload: await sealRequest(c, manifestReq()) }))
        .statusCode,
    ).toBe(200)
    c.nextMessageId = 3
    const older = await app.inject({ method: 'POST', url: MANIFEST_URL, payload: await sealRequest(c, manifestReq()) })
    expect((older.json() as MslErrorBody).errorcode).toBe('REPLAYED')
  })

  it('gönderen ESN belirteçle eşleşmezse reddedilir', async () => {
    const c = await provisionClient(app, 'TVPWCH-MC-F')
    const env = await sealRequest(c, manifestReq(), { sender: 'BASKASI' })
    const res = await app.inject({ method: 'POST', url: MANIFEST_URL, payload: env })
    expect(res.statusCode).toBe(401)
  })

  it('PLAINTEXT_DEV: base64 JSON, imza boş, yine de belirteç ve tekrar denetimi', async () => {
    const c = await provisionClient(app, 'TVPWCH-MC-DEV', 'PLAINTEXT_DEV')
    expect(c.provision.keyresponsedata.keydata.publickey).toBeUndefined()
    const env = await sealRequest(c, manifestReq())
    expect(env.signature).toBe('')
    expect(JSON.parse(Buffer.from(env.headerdata, 'base64').toString('utf8')).sender).toBe('TVPWCH-MC-DEV')
    const res = await app.inject({ method: 'POST', url: MANIFEST_URL, payload: env })
    expect(res.statusCode).toBe(200)
    const body = res.json() as MslEnvelope
    expect(body.signature).toBe('')
    const out = await openResponse<ManifestError>(c, body)
    expect(out.payload.error.code).toBe('NOT_FOUND')
    expect((await app.inject({ method: 'POST', url: MANIFEST_URL, payload: env })).statusCode).toBe(401)
  })

  it('üye değilse ya da profil seçilmediyse 401 (düz REST hatası)', async () => {
    const c = await provisionClient(app, 'TVPWCH-MC-G')
    usePassport(app, null)
    const r1 = await app.inject({ method: 'POST', url: MANIFEST_URL, payload: await sealRequest(c, manifestReq()) })
    expect(r1.statusCode).toBe(401)
    expect(r1.json().error.code).toBe('UNAUTHENTICATED')
    usePassport(app, fakePassport({ profile: null }))
    const r2 = await app.inject({ method: 'POST', url: MANIFEST_URL, payload: await sealRequest(c, manifestReq()) })
    expect(r2.json().error.code).toBe('PROFILE_REQUIRED')
    usePassport(app, fakePassport())
  })

  it('bozuk zarf → 400 BAD_REQUEST', async () => {
    const res = await app.inject({ method: 'POST', url: MANIFEST_URL, payload: { merhaba: 1 } })
    expect(res.statusCode).toBe(400)
    expect((res.json() as MslErrorBody).errorcode).toBe('BAD_REQUEST')
  })
})

describe('MSL süreleri (saat denetimli)', () => {
  it('yenileme penceresinden sonra renewable: true; bitişten sonra TOKEN_EXPIRED', async () => {
    let now = 1_800_000_000
    const msl = createMsl(loadConfig({ dataDir: '/tmp', secret: 'saat-testi', isTest: true }), () => now)
    const p = await startProvision('TVPWCH-MC-SAAT')
    const prov = msl.provision(p.request)
    if (!prov.ok) throw new Error('sağlama başarısız')
    const c = await p.complete(prov.response)

    const o1 = msl.open(await sealRequest(c, { a: 1 }))
    if (!o1.ok) throw new Error(o1.body.errorcode)
    const r1 = await openResponse<{ ok: boolean }>(c, msl.seal(o1.session, { ok: true }, o1.header))
    expect(r1.header.renewable).toBe(false)
    expect(r1.payload.ok).toBe(true)

    now += MSL_RENEWAL_SEC + 1
    const o2 = msl.open(await sealRequest(c, { a: 2 }))
    if (!o2.ok) throw new Error(o2.body.errorcode)
    expect((await openResponse(c, msl.seal(o2.session, {}, o2.header))).header.renewable).toBe(true)

    now += MSL_EXPIRATION_SEC
    const o3 = msl.open(await sealRequest(c, { a: 3 }))
    expect(o3.ok).toBe(false)
    if (!o3.ok) {
      expect(o3.status).toBe(401)
      expect(o3.body.errorcode).toBe('TOKEN_EXPIRED')
    }
  })
})
