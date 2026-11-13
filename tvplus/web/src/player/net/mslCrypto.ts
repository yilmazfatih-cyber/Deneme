/**
 * MSL kriptografisi (shared/playback.ts §2) — saf işlevler; SubtleCrypto dışarıdan verilir, böylece
 * aynı kod tarayıcıda (window.crypto.subtle) ve testte (Node globalThis.crypto.subtle) çalışır.
 *
 *   shared = ECDH(istemciÖzel, sunucuAçık)                         32 bayt
 *   okm    = HKDF-SHA256(shared, salt=MSL_HKDF_SALT, info=MSL_HKDF_INFO_PREFIX+esn, 64 bayt)
 *   encKey = okm[0..32] (AES-256-GCM) · hmacKey = okm[32..64] (HMAC-SHA256)
 *   değer  = base64(iv(12) || şifreli || etiket(16)),  aad = utf8(mastertoken.tokendata)
 *   imza   = base64(HMAC(hmacKey, utf8(headerdata + '.' + payload)))
 */
import { MSL_HKDF_INFO_PREFIX, MSL_HKDF_SALT, type MslEnvelope, type MslHeader, type MslMasterToken } from '../../../../shared/playback'
import { b64decode, b64encode, b64json, concatBytes, fromUtf8, parseB64json, utf8 } from './bytes'

export interface MslSessionKeys {
  encKey: CryptoKey
  hmacKey: CryptoKey
}

const EC = { name: 'ECDH', namedCurve: 'P-256' } as const

export async function generateEcdhKeyPair(subtle: SubtleCrypto): Promise<CryptoKeyPair> {
  return subtle.generateKey(EC, false, ['deriveBits'])
}

/** Ham sıkıştırılmamış nokta (65 bayt), standart base64. */
export async function exportPublicKey(subtle: SubtleCrypto, key: CryptoKey): Promise<string> {
  const raw = new Uint8Array(await subtle.exportKey('raw', key))
  return b64encode(raw)
}

export async function importPublicKey(subtle: SubtleCrypto, b64: string): Promise<CryptoKey> {
  return subtle.importKey('raw', b64decode(b64), EC, false, [])
}

/** ECDH + HKDF → oturum anahtarları. Karşı tarafın açık anahtarı base64 olarak verilir. */
export async function deriveSessionKeys(
  subtle: SubtleCrypto,
  privateKey: CryptoKey,
  peerPublicKeyB64: string,
  esn: string,
): Promise<MslSessionKeys> {
  const peer = await importPublicKey(subtle, peerPublicKeyB64)
  const shared = await subtle.deriveBits({ name: 'ECDH', public: peer }, privateKey, 256)
  const hkdfKey = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits'])
  const okm = new Uint8Array(
    await subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: utf8(MSL_HKDF_SALT), info: utf8(MSL_HKDF_INFO_PREFIX + esn) },
      hkdfKey,
      512,
    ),
  )
  const encKey = await subtle.importKey('raw', okm.slice(0, 32), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  const hmacKey = await subtle.importKey('raw', okm.slice(32, 64), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
  return { encKey, hmacKey }
}

/** JSON değerini şifreler: base64(iv || ct || tag), aad = utf8(tokendata). */
export async function sealValue(subtle: SubtleCrypto, keys: MslSessionKeys, value: unknown, aad: string): Promise<string> {
  const iv = new Uint8Array(12)
  globalThis.crypto.getRandomValues(iv)
  const ct = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: utf8(aad), tagLength: 128 }, keys.encKey, utf8(JSON.stringify(value))),
  )
  return b64encode(concatBytes(iv, ct))
}

export async function openValue<T>(subtle: SubtleCrypto, keys: MslSessionKeys, sealed: string, aad: string): Promise<T> {
  const all = b64decode(sealed)
  if (all.length < 12 + 16) throw new MslCryptoError('DECRYPT_FAILED', 'Şifreli değer çok kısa')
  const iv = all.slice(0, 12)
  const body = all.slice(12)
  let plain: ArrayBuffer
  try {
    plain = await subtle.decrypt({ name: 'AES-GCM', iv, additionalData: utf8(aad), tagLength: 128 }, keys.encKey, body)
  } catch {
    throw new MslCryptoError('DECRYPT_FAILED', 'Zarf çözülemedi (anahtar ya da AAD uyuşmuyor)')
  }
  return JSON.parse(fromUtf8(new Uint8Array(plain))) as T
}

export async function signEnvelope(subtle: SubtleCrypto, keys: MslSessionKeys, headerdata: string, payload: string): Promise<string> {
  const sig = new Uint8Array(await subtle.sign('HMAC', keys.hmacKey, utf8(`${headerdata}.${payload}`)))
  return b64encode(sig)
}

export async function verifyEnvelope(
  subtle: SubtleCrypto,
  keys: MslSessionKeys,
  headerdata: string,
  payload: string,
  signature: string,
): Promise<boolean> {
  try {
    return await subtle.verify('HMAC', keys.hmacKey, b64decode(signature), utf8(`${headerdata}.${payload}`))
  } catch {
    return false
  }
}

export class MslCryptoError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'MslCryptoError'
    this.code = code
  }
}

/**
 * Zarfı kurar. `keys` null ise PLAINTEXT_DEV: headerdata/payload = base64(utf8(JSON)), imza boş.
 */
export async function sealEnvelope(
  subtle: SubtleCrypto | null,
  keys: MslSessionKeys | null,
  mastertoken: MslMasterToken,
  header: MslHeader,
  payload: unknown,
): Promise<MslEnvelope> {
  if (!subtle || !keys) {
    return { mastertoken, headerdata: b64json(header), payload: b64json(payload), signature: '' }
  }
  const aad = mastertoken.tokendata
  const headerdata = await sealValue(subtle, keys, header, aad)
  const body = await sealValue(subtle, keys, payload, aad)
  const signature = await signEnvelope(subtle, keys, headerdata, body)
  return { mastertoken, headerdata, payload: body, signature }
}

export async function openEnvelope<T>(
  subtle: SubtleCrypto | null,
  keys: MslSessionKeys | null,
  env: MslEnvelope,
): Promise<{ header: MslHeader; payload: T }> {
  if (!subtle || !keys) {
    return { header: parseB64json<MslHeader>(env.headerdata), payload: parseB64json<T>(env.payload) }
  }
  const ok = await verifyEnvelope(subtle, keys, env.headerdata, env.payload, env.signature)
  if (!ok) throw new MslCryptoError('DECRYPT_FAILED', 'Zarf imzası doğrulanamadı')
  const aad = env.mastertoken.tokendata
  const header = await openValue<MslHeader>(subtle, keys, env.headerdata, aad)
  const payload = await openValue<T>(subtle, keys, env.payload, aad)
  return { header, payload }
}
