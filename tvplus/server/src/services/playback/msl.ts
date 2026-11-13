/**
 * MSL (Message Security Layer) — Netflix'in ALE anahtar sağlama + şifreli zarf düzeninin TV+ karşılığı.
 * Biçimler birebir shared/playback.ts §2'dedir:
 *   ECDH P-256 (ham 65 baytlık açık anahtarlar) → HKDF-SHA256 (64 bayt) → AES-256-GCM (şifre) + HMAC-SHA256 (imza)
 *   şifreli değer = base64(iv || ct || tag) , AAD = utf8(mastertoken.tokendata)
 *   imza = base64(HMAC(hmacKey, utf8(headerdata + '.' + payload)))
 * Sunucu durumsuzdur: oturum anahtarları sunucu ana anahtarıyla `sessiondata` içine mühürlenir.
 * Tek bellek durumu tekrar korumasıdır (seri numarası başına görülen en büyük messageid).
 */
import { createCipheriv, createDecipheriv, createECDH, createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import {
  MSL_HKDF_INFO_PREFIX,
  MSL_HKDF_SALT,
  type MslEnvelope,
  type MslErrorBody,
  type MslHeader,
  type MslMasterToken,
  type MslProvisionResponse,
  type MslScheme,
  type MslTokenData,
} from '../../../../shared/playback'
import { deriveKey, type AppConfig } from '../../kernel/config'

export const MSL_RENEWAL_SEC = 10 * 60
export const MSL_EXPIRATION_SEC = 60 * 60
/** Süresi dolmuş belirteçle yenileme (aynı seriyi sürdürme) için tanınan en uzun süre. */
export const MSL_RENEW_GRACE_SEC = 24 * 60 * 60
export const MSL_SERVER_SENDER = 'tvplus-playapi'

export interface MslSession {
  tokendata: string
  token: MslTokenData
  encKey: Buffer | null
  hmacKey: Buffer | null
}
export type MslFailure = { ok: false; status: 400 | 401; body: MslErrorBody }
export type MslOpened = { ok: true; session: MslSession; header: MslHeader; payload: unknown }

export interface Msl {
  provision(body: unknown): { ok: true; response: MslProvisionResponse } | MslFailure
  open(body: unknown): MslOpened | MslFailure
  seal(session: MslSession, payload: unknown, inReplyTo: MslHeader): MslEnvelope
}

const fail = (status: 400 | 401, errorcode: MslErrorBody['errorcode'], message: string): MslFailure => ({
  ok: false,
  status,
  body: { errorcode, message },
})

const b64 = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/)
const zMasterToken = z.object({ tokendata: b64.min(1).max(8192), signature: b64.min(1).max(256) })
const zProvision = z.object({
  entityauthdata: z.object({
    scheme: z.literal('NONE'),
    authdata: z.object({ identity: z.string().min(1).max(200) }),
  }),
  keyrequestdata: z.object({
    scheme: z.enum(['ECDH_P256_AESGCM', 'PLAINTEXT_DEV']),
    keydata: z.object({ publickey: b64.optional() }),
  }),
  /** Uzantı: yenilemede eski belirteç gönderilirse aynı seri sürer, sequencenumber bir artar. */
  mastertoken: zMasterToken.optional(),
})
const zEnvelope = z.object({
  mastertoken: zMasterToken,
  headerdata: z.string().min(1).max(64 * 1024),
  payload: z.string().max(2 * 1024 * 1024),
  signature: z.string().max(256),
})
const zHeader = z.object({
  messageid: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  sender: z.string().min(1).max(200),
  timestamp: z.number(),
  renewable: z.boolean().optional(),
})

/** HKDF ile oturum anahtarları (istemcideki WebCrypto deriveBits ile aynı). */
export function deriveSessionKeys(shared: Buffer, esn: string): { encKey: Buffer; hmacKey: Buffer } {
  const okm = Buffer.from(hkdfSync('sha256', shared, Buffer.from(MSL_HKDF_SALT, 'utf8'), Buffer.from(MSL_HKDF_INFO_PREFIX + esn, 'utf8'), 64))
  return { encKey: okm.subarray(0, 32), hmacKey: okm.subarray(32, 64) }
}

export function aesGcmEncrypt(key: Buffer, plain: Buffer, aad: Buffer): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, iv)
  c.setAAD(aad)
  const ct = Buffer.concat([c.update(plain), c.final()])
  return Buffer.concat([iv, ct, c.getAuthTag()]).toString('base64')
}
export function aesGcmDecrypt(key: Buffer, encoded: string, aad: Buffer): Buffer {
  const raw = Buffer.from(encoded, 'base64')
  if (raw.length < 12 + 16) throw new Error('şifreli değer çok kısa')
  const iv = raw.subarray(0, 12)
  const tag = raw.subarray(raw.length - 16)
  const ct = raw.subarray(12, raw.length - 16)
  const d = createDecipheriv('aes-256-gcm', key, iv)
  d.setAAD(aad)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(ct), d.final()])
}
const hmac = (key: Buffer, data: string) => createHmac('sha256', key).update(data, 'utf8').digest()
const safeEqual = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b)

export function createMsl(config: AppConfig, clock: () => number = () => Math.floor(Date.now() / 1000)): Msl {
  const master = deriveKey(config, 'msl-master')
  const sealKey = createHmac('sha256', master).update('sessiondata').digest()
  const signKey = createHmac('sha256', master).update('mastertoken').digest()
  const SESSION_AAD = Buffer.from('tvplus-msl-sessiondata', 'utf8')
  /** seri numarası → { en büyük messageid, belirteç bitişi } */
  const seen = new Map<number, { last: number; expiration: number }>()

  function prune(now: number) {
    if (seen.size < 10_000) return
    for (const [k, v] of seen) if (v.expiration + MSL_RENEW_GRACE_SEC < now) seen.delete(k)
  }

  function issueToken(esn: string, scheme: MslScheme, keys: { encKey: Buffer; hmacKey: Buffer } | null, serial: number, sequence: number): MslMasterToken {
    const now = clock()
    const sessiondata = aesGcmEncrypt(
      sealKey,
      Buffer.from(JSON.stringify(keys ? { e: keys.encKey.toString('base64'), h: keys.hmacKey.toString('base64') } : {}), 'utf8'),
      SESSION_AAD,
    )
    const data: MslTokenData = {
      renewalwindow: now + MSL_RENEWAL_SEC,
      expiration: now + MSL_EXPIRATION_SEC,
      sequencenumber: sequence,
      serialnumber: serial,
      esn,
      scheme,
      sessiondata,
    }
    const tokendata = Buffer.from(JSON.stringify(data), 'utf8').toString('base64')
    return { tokendata, signature: hmac(signKey, tokendata).toString('base64') }
  }

  /** Belirteci doğrular ve oturum anahtarlarını çözer (süre denetimi çağırana kalır). */
  function readToken(mt: MslMasterToken): MslSession | null {
    if (!safeEqual(hmac(signKey, mt.tokendata), Buffer.from(mt.signature, 'base64'))) return null
    let token: MslTokenData
    try {
      token = JSON.parse(Buffer.from(mt.tokendata, 'base64').toString('utf8')) as MslTokenData
    } catch {
      return null
    }
    if (typeof token.expiration !== 'number' || typeof token.serialnumber !== 'number' || typeof token.esn !== 'string') return null
    try {
      const sess = JSON.parse(aesGcmDecrypt(sealKey, token.sessiondata, SESSION_AAD).toString('utf8')) as { e?: string; h?: string }
      const encKey = sess.e ? Buffer.from(sess.e, 'base64') : null
      const hmacKey = sess.h ? Buffer.from(sess.h, 'base64') : null
      if (token.scheme === 'ECDH_P256_AESGCM' && (!encKey || !hmacKey)) return null
      return { tokendata: mt.tokendata, token, encKey, hmacKey }
    } catch {
      return null
    }
  }

  function decodeValue(session: MslSession, value: string): unknown {
    if (session.token.scheme === 'PLAINTEXT_DEV') return JSON.parse(Buffer.from(value, 'base64').toString('utf8'))
    const plain = aesGcmDecrypt(session.encKey!, value, Buffer.from(session.tokendata, 'utf8'))
    return JSON.parse(plain.toString('utf8'))
  }
  function encodeValue(session: MslSession, value: unknown): string {
    const json = Buffer.from(JSON.stringify(value), 'utf8')
    if (session.token.scheme === 'PLAINTEXT_DEV') return json.toString('base64')
    return aesGcmEncrypt(session.encKey!, json, Buffer.from(session.tokendata, 'utf8'))
  }

  return {
    provision(body) {
      const parsed = zProvision.safeParse(body)
      if (!parsed.success) return fail(400, 'BAD_REQUEST', 'Sağlama isteği biçimi hatalı.')
      const req = parsed.data
      const esn = req.entityauthdata.authdata.identity
      const scheme = req.keyrequestdata.scheme
      let keys: { encKey: Buffer; hmacKey: Buffer } | null = null
      let serverPublic: string | undefined
      if (scheme === 'ECDH_P256_AESGCM') {
        const pub = Buffer.from(req.keyrequestdata.keydata.publickey ?? '', 'base64')
        if (pub.length !== 65 || pub[0] !== 0x04) return fail(400, 'BAD_REQUEST', 'Açık anahtar 65 baytlık ham P-256 noktası olmalı.')
        const ecdh = createECDH('prime256v1')
        ecdh.generateKeys()
        let shared: Buffer
        try {
          shared = ecdh.computeSecret(pub)
        } catch {
          return fail(400, 'BAD_REQUEST', 'Açık anahtar eğri üzerinde değil.')
        }
        keys = deriveSessionKeys(shared, esn)
        serverPublic = ecdh.getPublicKey().toString('base64')
      }
      // Yenileme: geçerli (ya da yakın zamanda dolmuş) eski belirteç aynı cihazınsa seri sürer.
      let serial = randomInt(1, 2 ** 31 - 1)
      let sequence = 1
      if (req.mastertoken) {
        const old = readToken(req.mastertoken)
        if (old && old.token.esn === esn && old.token.expiration + MSL_RENEW_GRACE_SEC >= clock()) {
          serial = old.token.serialnumber
          sequence = old.token.sequencenumber + 1
        }
      }
      const mastertoken = issueToken(esn, scheme, keys, serial, sequence)
      return {
        ok: true,
        response: { keyresponsedata: { scheme, keydata: serverPublic ? { publickey: serverPublic } : {} }, mastertoken },
      }
    },

    open(body) {
      let input = body
      if (typeof input === 'string') {
        try {
          input = JSON.parse(input)
        } catch {
          return fail(400, 'BAD_REQUEST', 'Zarf JSON değil.')
        }
      }
      const parsed = zEnvelope.safeParse(input)
      if (!parsed.success) return fail(400, 'BAD_REQUEST', 'Zarf biçimi hatalı.')
      const env = parsed.data
      const session = readToken(env.mastertoken)
      if (!session) return fail(401, 'TOKEN_INVALID', 'Ana belirteç geçersiz.')
      const now = clock()
      if (now > session.token.expiration) return fail(401, 'TOKEN_EXPIRED', 'Ana belirtecin süresi dolmuş; yeniden sağlama yapın.')

      if (session.token.scheme === 'ECDH_P256_AESGCM') {
        const expected = hmac(session.hmacKey!, `${env.headerdata}.${env.payload}`)
        if (!safeEqual(expected, Buffer.from(env.signature, 'base64'))) return fail(400, 'DECRYPT_FAILED', 'Zarf imzası tutmuyor.')
      }
      let header: MslHeader
      let payload: unknown
      try {
        const h = zHeader.safeParse(decodeValue(session, env.headerdata))
        if (!h.success) return fail(400, 'BAD_REQUEST', 'Zarf başlığı biçimi hatalı.')
        header = h.data
        payload = env.payload === '' ? null : decodeValue(session, env.payload)
      } catch {
        return fail(400, 'DECRYPT_FAILED', 'Zarf çözülemedi.')
      }
      if (header.sender !== session.token.esn) return fail(401, 'TOKEN_INVALID', 'Gönderen, belirtecin cihazıyla eşleşmiyor.')

      const serial = session.token.serialnumber
      const prev = seen.get(serial)
      if (prev && header.messageid <= prev.last) return fail(401, 'REPLAYED', 'Bu ileti kimliği daha önce kullanıldı.')
      prune(now)
      seen.set(serial, { last: header.messageid, expiration: session.token.expiration })
      return { ok: true, session, header, payload }
    },

    seal(session, payload, inReplyTo) {
      const now = clock()
      const header: MslHeader = {
        messageid: inReplyTo.messageid + 1,
        sender: MSL_SERVER_SENDER,
        timestamp: now,
        renewable: now > session.token.renewalwindow,
      }
      const headerdata = encodeValue(session, header)
      const body = encodeValue(session, payload)
      const signature = session.token.scheme === 'PLAINTEXT_DEV' ? '' : hmac(session.hmacKey!, `${headerdata}.${body}`).toString('base64')
      return { mastertoken: { tokendata: session.tokendata, signature: hmacTokenSig(session) }, headerdata, payload: body, signature }
    },
  }

  function hmacTokenSig(session: MslSession): string {
    return hmac(signKey, session.tokendata).toString('base64')
  }
}
