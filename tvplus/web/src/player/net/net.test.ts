import { describe, expect, it } from 'vitest'
import { MSL_HKDF_INFO_PREFIX, MSL_HKDF_SALT, type LicensedManifest, type MslHeader, type MslMasterToken } from '../../../../shared/playback'
import { b64decode, b64encode, b64json, parseB64json, utf8 } from './bytes'
import { FtlRanking, pulseWinner } from './ftlRanking'
import { canReuseForPlay, EXPIRY_MARGIN_MS, ManifestCache, manifestKey } from './manifestCache'
import {
  deriveSessionKeys,
  exportPublicKey,
  generateEcdhKeyPair,
  MslCryptoError,
  openEnvelope,
  openValue,
  sealEnvelope,
  sealValue,
  signEnvelope,
} from './mslCrypto'

const subtle = globalThis.crypto.subtle
const ESN = 'TVPWCH-MC-TEST-0001'

/** Sunucu tarafını sözleşmeden bağımsız olarak, doğrudan WebCrypto ile kurar (shared/playback.ts §2). */
async function serverKeysFrom(serverPriv: CryptoKey, clientPubB64: string) {
  const clientPub = await subtle.importKey('raw', b64decode(clientPubB64), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = await subtle.deriveBits({ name: 'ECDH', public: clientPub }, serverPriv, 256)
  const ikm = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits'])
  const okm = new Uint8Array(
    await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: utf8(MSL_HKDF_SALT), info: utf8(MSL_HKDF_INFO_PREFIX + ESN) }, ikm, 512),
  )
  return {
    encKey: await subtle.importKey('raw', okm.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']),
    hmacKey: await subtle.importKey('raw', okm.slice(32), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']),
  }
}

function token(): MslMasterToken {
  const now = Math.floor(Date.now() / 1000)
  return {
    tokendata: b64json({ renewalwindow: now + 600, expiration: now + 3600, sequencenumber: 1, serialnumber: 42, esn: ESN, scheme: 'ECDH_P256_AESGCM', sessiondata: 'eA==' }),
    signature: 'c2ln',
  }
}

describe('MSL kriptografisi (iki taraf)', () => {
  it('ECDH + HKDF iki tarafta aynı anahtarları üretir; zarf gidiş-dönüş çalışır', async () => {
    const client = await generateEcdhKeyPair(subtle)
    const server = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
    const clientPub = await exportPublicKey(subtle, client.publicKey)
    expect(b64decode(clientPub).length).toBe(65) // sıkıştırılmamış nokta
    const serverPub = b64encode(new Uint8Array(await subtle.exportKey('raw', server.publicKey)))

    const clientKeys = await deriveSessionKeys(subtle, client.privateKey, serverPub, ESN)
    const serverKeys = await serverKeysFrom(server.privateKey, clientPub)

    const mt = token()
    const header: MslHeader = { messageid: 7, sender: ESN, timestamp: 1 }
    const payload = { viewableId: 'Video:80010001', prefetch: false, profiles: ['vp9-webm'] }
    const env = await sealEnvelope(subtle, clientKeys, mt, header, payload)

    // sunucu: imzayı doğrula, AAD = tokendata ile çöz; biçim base64(iv || ct || tag)
    const sig = await subtle.verify('HMAC', serverKeys.hmacKey, b64decode(env.signature), utf8(`${env.headerdata}.${env.payload}`))
    expect(sig).toBe(true)
    const raw = b64decode(env.payload)
    const plain = await subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12), additionalData: utf8(mt.tokendata) }, serverKeys.encKey, raw.slice(12))
    expect(JSON.parse(new TextDecoder().decode(plain))).toEqual(payload)
    expect(raw.length).toBe(12 + JSON.stringify(payload).length + 16)

    // sunucu yanıtı → istemci açar
    const reply = await sealEnvelope(subtle, serverKeys, mt, { messageid: 7, sender: 'tvplus-playapi', timestamp: 2, renewable: true }, { ok: 1 })
    const opened = await openEnvelope<{ ok: number }>(subtle, clientKeys, reply)
    expect(opened.header.renewable).toBe(true)
    expect(opened.payload).toEqual({ ok: 1 })
  })

  it('AAD ya da imza bozulursa reddeder', async () => {
    const a = await generateEcdhKeyPair(subtle)
    const b = await generateEcdhKeyPair(subtle)
    const keys = await deriveSessionKeys(subtle, a.privateKey, await exportPublicKey(subtle, b.publicKey), ESN)
    const sealed = await sealValue(subtle, keys, { x: 1 }, 'aad-1')
    await expect(openValue(subtle, keys, sealed, 'aad-2')).rejects.toBeInstanceOf(MslCryptoError)
    const env = await sealEnvelope(subtle, keys, token(), { messageid: 1, sender: ESN, timestamp: 0 }, { y: 2 })
    const badSig = await signEnvelope(subtle, keys, env.headerdata, env.payload + 'A')
    await expect(openEnvelope(subtle, keys, { ...env, signature: badSig })).rejects.toThrow(/imza/)
  })

  it('PLAINTEXT_DEV: base64(utf8(JSON)), imza boş', async () => {
    const env = await sealEnvelope(null, null, token(), { messageid: 1, sender: ESN, timestamp: 0 }, { ç: 'ğüşiöı' })
    expect(env.signature).toBe('')
    expect(parseB64json(env.payload)).toEqual({ ç: 'ğüşiöı' })
    const opened = await openEnvelope<{ ç: string }>(null, null, env)
    expect(opened.payload.ç).toBe('ğüşiöı')
  })
})

/* ───────────── manifest önbelleği ───────────── */

function manifest(expiration: number, extra: Partial<LicensedManifest> = {}): LicensedManifest {
  return {
    kind: 'EXTERNAL_EMBED',
    provider: 'YOUTUBE',
    videoId: 'abc',
    liveChannelId: null,
    startSec: 0,
    viewableId: 'Video:1',
    manifestId: 'm1',
    playbackContextId: 'p1',
    expiration,
    isPrefetch: true,
    title: 'Deneme',
    durationMs: null,
    live: null,
    bookmark: null,
    alternatives: [],
    attribution: null,
    ...extra,
  } as LicensedManifest
}

describe('manifest önbelleği', () => {
  it('anahtar seçenekleri ayırt eder', () => {
    expect(manifestKey('Video:1', {})).not.toBe(manifestKey('Video:1', { promo: true }))
    expect(manifestKey('Video:1', { preferredSource: 'YOUTUBE' })).not.toBe(manifestKey('Video:1', { preferredSource: 'OWN_CDN' }))
  })

  it('expiration − güvenlik payı geçince kaydı düşürür', () => {
    const c = new ManifestCache()
    const now = 1_000_000
    c.set('k', manifest(now + EXPIRY_MARGIN_MS + 5000), now)
    expect(c.get('k', now + 1000)?.ageMs).toBe(1000)
    expect(c.get('k', now + 5000)).toBeNull()
    expect(c.size()).toBe(0)
  })

  it('uçuştaki isteği paylaşır ve bitince bırakır', async () => {
    const c = new ManifestCache()
    let resolve!: (m: LicensedManifest) => void
    const p = c.track('k', new Promise<LicensedManifest>((r) => (resolve = r)))
    expect(c.pending('k')).toBe(p)
    resolve(manifest(Date.now() + 3_600_000))
    await p
    await Promise.resolve()
    expect(c.pending('k')).toBeUndefined()
  })

  it('ön hazırlık manifesti yer imi gerekiyorsa yeniden istenir', () => {
    const m = manifest(0)
    expect(canReuseForPlay(m, false)).toBe(true)
    expect(canReuseForPlay(m, true)).toBe(false)
    expect(canReuseForPlay({ ...m, bookmark: { positionMs: 1000 } }, true)).toBe(true)
    expect(canReuseForPlay({ ...m, isPrefetch: false }, true)).toBe(true)
  })
})

/* ───────────── FTL sıralaması ───────────── */

const r = (cdnId: string, ok: boolean, totalMs: number, kbps = 1000) => ({ name: cdnId, cdnId, ok, ttfbMs: totalMs / 2, totalMs, bytes: 5120, kbps })

describe('FTL sıralaması', () => {
  it('en hızlı başta, başarısızlar sonda', () => {
    const f = new FtlRanking()
    f.record([r('c101', true, 80), r('c102', true, 20), r('c103', false, 8000), r('c104', true, 40)])
    expect(f.ranking()).toEqual(['c102', 'c104', 'c101', 'c103'])
    expect(pulseWinner([r('a', true, 50), r('b', false, 1), r('c', true, 30)])?.cdnId).toBe('c')
    expect(pulseWinner([r('a', false, 50)])).toBeNull()
  })

  it('darbeler arasında ortalama alır; düzelen düğüm geri yükselir', () => {
    const f = new FtlRanking()
    f.record([r('a', true, 10), r('b', true, 50)])
    f.record([r('a', true, 200), r('b', true, 50)]) // a: 0.5·200 + 0.5·10 = 105
    expect(f.ranking()).toEqual(['b', 'a'])
    f.record([r('a', false, 0), r('b', true, 50)])
    expect(f.ranking()).toEqual(['b', 'a'])
    f.record([r('a', true, 5), r('b', false, 0)])
    expect(f.ranking()[0]).toBe('a')
    expect(f.bestKbps()).toBe(1000)
  })
})
