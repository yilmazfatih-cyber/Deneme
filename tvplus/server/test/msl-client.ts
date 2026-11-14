/**
 * Testler için MSL istemcisi — tarayıcıdaki gibi yalnızca WebCrypto (globalThis.crypto.subtle) kullanır.
 * Sunucunun Node crypto ile yaptığı ECDH/HKDF/AES-GCM/HMAC işlemlerinin tarayıcıyla birlikte çalıştığını kanıtlar.
 */
import type { webcrypto } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import {
  MSL_HKDF_INFO_PREFIX,
  MSL_HKDF_SALT,
  type MslEnvelope,
  type MslHeader,
  type MslProvisionRequest,
  type MslProvisionResponse,
  type MslScheme,
} from '../../shared/playback'

const subtle = globalThis.crypto.subtle
type CryptoKey = webcrypto.CryptoKey
type CryptoKeyPair = webcrypto.CryptoKeyPair
const enc = new TextEncoder()
const dec = new TextDecoder()
const b64 = (u: Uint8Array | ArrayBuffer) =>
  Buffer.from(u instanceof ArrayBuffer ? new Uint8Array(u) : u).toString('base64')
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'))

export interface MslClient {
  esn: string
  scheme: MslScheme
  provision: MslProvisionResponse
  encKey: CryptoKey | null
  hmacKey: CryptoKey | null
  nextMessageId: number
}

/** Sağlama isteğini hazırlar; `complete` sunucu yanıtından oturum anahtarlarını türetir. */
export async function startProvision(
  esn: string,
  scheme: MslScheme = 'ECDH_P256_AESGCM',
): Promise<{ request: MslProvisionRequest; complete(resp: MslProvisionResponse): Promise<MslClient> }> {
  if (scheme === 'PLAINTEXT_DEV') {
    return {
      request: {
        entityauthdata: { scheme: 'NONE', authdata: { identity: esn } },
        keyrequestdata: { scheme, keydata: {} },
      },
      complete: async (provision) => ({ esn, scheme, provision, encKey: null, hmacKey: null, nextMessageId: 1 }),
    }
  }
  const kp = (await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const rawPub = new Uint8Array(await subtle.exportKey('raw', kp.publicKey))
  return {
    request: {
      entityauthdata: { scheme: 'NONE', authdata: { identity: esn } },
      keyrequestdata: { scheme, keydata: { publickey: b64(rawPub) } },
    },
    async complete(provision) {
      const serverPub = await subtle.importKey(
        'raw',
        unb64(provision.keyresponsedata.keydata.publickey!),
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        [],
      )
      const shared = await subtle.deriveBits({ name: 'ECDH', public: serverPub }, kp.privateKey, 256)
      const hkdf = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits'])
      const okm = new Uint8Array(
        await subtle.deriveBits(
          {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: enc.encode(MSL_HKDF_SALT),
            info: enc.encode(MSL_HKDF_INFO_PREFIX + esn),
          },
          hkdf,
          512,
        ),
      )
      const encKey = await subtle.importKey('raw', okm.slice(0, 32), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
      const hmacKey = await subtle.importKey('raw', okm.slice(32, 64), { name: 'HMAC', hash: 'SHA-256' }, false, [
        'sign',
        'verify',
      ])
      return { esn, scheme, provision, encKey, hmacKey, nextMessageId: 1 }
    },
  }
}

export async function provisionClient(
  app: FastifyInstance,
  esn: string,
  scheme: MslScheme = 'ECDH_P256_AESGCM',
): Promise<MslClient> {
  const p = await startProvision(esn, scheme)
  const res = await app.inject({ method: 'POST', url: '/msl/v1/provision?reqName=aleProvision', payload: p.request })
  if (res.statusCode !== 200) throw new Error(`sağlama başarısız: ${res.statusCode} ${res.body}`)
  return p.complete(res.json() as MslProvisionResponse)
}

async function encodeValue(c: MslClient, value: unknown): Promise<string> {
  const json = enc.encode(JSON.stringify(value))
  if (c.scheme === 'PLAINTEXT_DEV') return b64(json)
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(
    await subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: enc.encode(c.provision.mastertoken.tokendata) },
      c.encKey!,
      json,
    ),
  )
  const out = new Uint8Array(12 + ct.length)
  out.set(iv, 0)
  out.set(ct, 12)
  return b64(out)
}
async function decodeValue(c: MslClient, value: string): Promise<unknown> {
  if (c.scheme === 'PLAINTEXT_DEV') return JSON.parse(Buffer.from(value, 'base64').toString('utf8'))
  const raw = unb64(value)
  const plain = await subtle.decrypt(
    { name: 'AES-GCM', iv: raw.slice(0, 12), additionalData: enc.encode(c.provision.mastertoken.tokendata) },
    c.encKey!,
    raw.slice(12),
  )
  return JSON.parse(dec.decode(plain))
}

export async function sealRequest(c: MslClient, payload: unknown, header?: Partial<MslHeader>): Promise<MslEnvelope> {
  const h: MslHeader = {
    messageid: c.nextMessageId++,
    sender: c.esn,
    timestamp: Math.floor(Date.now() / 1000),
    ...header,
  }
  const headerdata = await encodeValue(c, h)
  const body = await encodeValue(c, payload)
  const signature =
    c.scheme === 'PLAINTEXT_DEV' ? '' : b64(await subtle.sign('HMAC', c.hmacKey!, enc.encode(`${headerdata}.${body}`)))
  return { mastertoken: c.provision.mastertoken, headerdata, payload: body, signature }
}

export async function openResponse<T>(c: MslClient, env: MslEnvelope): Promise<{ header: MslHeader; payload: T }> {
  if (c.scheme !== 'PLAINTEXT_DEV') {
    const ok = await subtle.verify(
      'HMAC',
      c.hmacKey!,
      unb64(env.signature),
      enc.encode(`${env.headerdata}.${env.payload}`),
    )
    if (!ok) throw new Error('yanıt imzası doğrulanamadı')
  }
  return {
    header: (await decodeValue(c, env.headerdata)) as MslHeader,
    payload: (await decodeValue(c, env.payload)) as T,
  }
}
