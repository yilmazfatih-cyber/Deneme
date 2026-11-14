/**
 * MSL istemcisi (Netflix MSL / ALE karşılığı). Anahtar sağlama (aleProvision) → oturum anahtarları →
 * her iletide şifreli + imzalı zarf. Ayrıntılı biçim: shared/playback.ts §2, kriptografi: ./mslCrypto.ts.
 *
 * - İletiler sıraya konur (messageid sunucuya artan sırada varsın diye; aksi hâlde REPLAYED).
 * - Yenileme penceresi geçtiyse ya da sunucu `renewable: true` dediyse önce yeniden sağlanır.
 * - TOKEN_* / REPLAYED / DECRYPT_FAILED hatasında oturum atılır, bir kez yeniden denenir.
 * - Eşzamanlı sağlama istekleri tek isteğe indirgenir.
 */
import { CLIENT, HEADERS, ROUTES } from '../../../../shared/constants'
import type {
  MslEnvelope,
  MslErrorBody,
  MslHeader,
  MslMasterToken,
  MslProvisionRequest,
  MslProvisionResponse,
  MslScheme,
  MslTokenData,
} from '../../../../shared/playback'
import { loadBoot, peekBoot, sessionHeaders } from '../../api/session'
import { isStaticHost } from '../../lib/assetBase'
import { devbus } from '../../lib/devbus'
import { parseB64json } from './bytes'
import {
  deriveSessionKeys,
  exportPublicKey,
  generateEcdhKeyPair,
  openEnvelope,
  sealEnvelope,
  MslCryptoError,
  type MslSessionKeys,
} from './mslCrypto'

interface MslSession {
  scheme: MslScheme
  esn: string
  keys: MslSessionKeys | null
  mastertoken: MslMasterToken
  tokendata: MslTokenData
  messageid: number
  mustRenew: boolean
}

/** Sunucunun MSL katmanında döndürdüğü hata (HTTP gövdesi ya da şifreli yük). */
export class MslError extends Error {
  readonly code: string
  readonly status: number
  readonly body: unknown
  constructor(code: string, message: string, status: number, body: unknown) {
    super(message)
    this.name = 'MslError'
    this.code = code
    this.status = status
    this.body = body
  }
}

const RETRYABLE = new Set(['TOKEN_EXPIRED', 'TOKEN_INVALID', 'REPLAYED', 'DECRYPT_FAILED'])

function subtleOrNull(): SubtleCrypto | null {
  const c = globalThis.crypto as Crypto | undefined
  // Güvensiz bağlamda (http://192.168.x.x gibi) crypto.subtle tanımsızdır → PLAINTEXT_DEV
  return c && typeof c.subtle === 'object' && c.subtle ? c.subtle : null
}

async function esnNow(): Promise<string> {
  const b = peekBoot() ?? (await loadBoot())
  return b.esn
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000)
}

/** Hata gövdesinden kod çıkarır: { errorcode } (MSL) ya da { error: { code } } (REST). */
function errorCodeOf(body: unknown): { code: string; message: string } | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Partial<MslErrorBody> & { error?: { code?: string; message?: string } }
  if (typeof b.errorcode === 'string') return { code: b.errorcode, message: b.message ?? b.errorcode }
  if (b.error && typeof b.error.code === 'string')
    return { code: b.error.code, message: b.error.message ?? b.error.code }
  return null
}

function isEnvelope(v: unknown): v is MslEnvelope {
  return !!v && typeof v === 'object' && 'mastertoken' in v && 'headerdata' in v && 'payload' in v
}

export class MslClient {
  private session: MslSession | null = null
  private provisioning: Promise<MslSession> | null = null
  private chain: Promise<unknown> = Promise.resolve()

  /** Oturumun özeti (Kaputun altı paneli ve testler için). */
  describe(): {
    scheme: MslScheme
    serialnumber: number
    renewalwindow: number
    expiration: number
    messageid: number
  } | null {
    const s = this.session
    if (!s) return null
    return {
      scheme: s.scheme,
      serialnumber: s.tokendata.serialnumber,
      renewalwindow: s.tokendata.renewalwindow,
      expiration: s.tokendata.expiration,
      messageid: s.messageid,
    }
  }

  /** Sonraki iletiden önce yeniden sağlamayı zorlar. */
  invalidate(): void {
    this.session = null
  }

  private async provision(previous: MslSession | null = null): Promise<MslSession> {
    if (this.provisioning) return this.provisioning
    const p = this.doProvision(previous).finally(() => {
      this.provisioning = null
    })
    this.provisioning = p
    return p
  }

  private async doProvision(previous: MslSession | null): Promise<MslSession> {
    const t0 = performance.now()
    const esn = await esnNow()
    // Durağan kipte "sunucu" aynı tarayıcıdadır: zarfı şifrelemek bir şey korumaz, şifresiz geliştirme şeması kullanılır
    const subtle = isStaticHost() ? null : subtleOrNull()
    const scheme: MslScheme = subtle ? 'ECDH_P256_AESGCM' : 'PLAINTEXT_DEV'
    let pair: CryptoKeyPair | null = null
    const req: MslProvisionRequest = {
      entityauthdata: { scheme: 'NONE', authdata: { identity: esn } },
      keyrequestdata: { scheme, keydata: {} },
    }
    // Yenilemede eski belirteç gönderilir: sunucu serialnumber'ı korur, sequencenumber'ı artırır
    if (previous && previous.esn === esn) req.mastertoken = previous.mastertoken
    if (subtle) {
      pair = await generateEcdhKeyPair(subtle)
      req.keyrequestdata.keydata.publickey = await exportPublicKey(subtle, pair.publicKey)
    }
    const body = JSON.stringify(req)
    const res = await fetch(`${ROUTES.MSL_PROVISION}?reqName=aleProvision`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        [HEADERS.MSL]: 'v1',
        ...sessionHeaders(),
      },
      body,
    })
    const text = await res.text()
    let json: unknown = null
    try {
      json = JSON.parse(text)
    } catch {
      /* gövde JSON değil */
    }
    if (!res.ok) {
      const e = errorCodeOf(json)
      devbus.emit(
        'msl',
        'aleProvision',
        { scheme, status: res.status, error: e?.code ?? text.slice(0, 200) },
        { ms: performance.now() - t0, ok: false },
      )
      throw new MslError(
        e?.code ?? 'PROVISION_FAILED',
        e?.message ?? `Anahtar sağlanamadı (${res.status})`,
        res.status,
        json,
      )
    }
    const resp = json as MslProvisionResponse
    const tokendata = parseB64json<MslTokenData>(resp.mastertoken.tokendata)
    let keys: MslSessionKeys | null = null
    const serverScheme = resp.keyresponsedata?.scheme ?? tokendata.scheme
    if (subtle && pair && serverScheme === 'ECDH_P256_AESGCM') {
      const peer = resp.keyresponsedata.keydata.publickey
      if (!peer) throw new MslError('BAD_REQUEST', 'Sunucu açık anahtarı eksik', res.status, json)
      keys = await deriveSessionKeys(subtle, pair.privateKey, peer, esn)
    }
    const session: MslSession = {
      scheme: keys ? 'ECDH_P256_AESGCM' : 'PLAINTEXT_DEV',
      esn,
      keys,
      mastertoken: resp.mastertoken,
      tokendata,
      // Aynı seri sürüyorsa messageid artmaya devam eder (sunucu eski kimliği reddeder)
      messageid: previous && previous.tokendata.serialnumber === tokendata.serialnumber ? previous.messageid : 0,
      mustRenew: false,
    }
    this.session = session
    devbus.emit(
      'msl',
      'aleProvision',
      {
        scheme: session.scheme,
        serialnumber: tokendata.serialnumber,
        sequencenumber: tokendata.sequencenumber,
        renewalwindow: tokendata.renewalwindow,
        expiration: tokendata.expiration,
        renewed: !!req.mastertoken,
        esn,
        bytes: text.length,
      },
      { ms: performance.now() - t0 },
    )
    return session
  }

  private async ensureSession(): Promise<MslSession> {
    const s = this.session
    const esn = peekBoot()?.esn
    if (s && esn && s.esn !== esn) {
      // Cihaz kimliği değişti (çıkış/giriş): eski oturum kullanılamaz
      this.session = null
      return this.provision(null)
    }
    if (s && !s.mustRenew && nowSec() <= s.tokendata.renewalwindow) return s
    if (s) {
      devbus.emit('msl', 'yenileme', {
        reason: s.mustRenew ? 'sunucu yenileme istedi' : 'yenileme penceresi geçti',
        serialnumber: s.tokendata.serialnumber,
        renewalwindow: s.tokendata.renewalwindow,
        expiration: s.tokendata.expiration,
      })
    }
    this.session = null
    return this.provision(s)
  }

  /**
   * Şifreli istek gönderir ve çözülmüş yükü döndürür. `path` köke göreli uç, `query` sorgu dizgesi.
   * İletiler sıraya alınır; messageid her iletide artar.
   */
  send<T>(
    path: string,
    query: Record<string, string>,
    payload: unknown,
    label: string,
    signal?: AbortSignal,
  ): Promise<T> {
    const run = this.chain.then(
      () => this.sendWithRetry<T>(path, query, payload, label, signal),
      () => this.sendWithRetry<T>(path, query, payload, label, signal),
    )
    this.chain = run.catch(() => undefined)
    return run
  }

  private async sendWithRetry<T>(
    path: string,
    query: Record<string, string>,
    payload: unknown,
    label: string,
    signal?: AbortSignal,
  ): Promise<T> {
    try {
      return await this.sendOnce<T>(path, query, payload, label, signal)
    } catch (err) {
      const code = err instanceof MslError || err instanceof MslCryptoError ? err.code : null
      if (code && RETRYABLE.has(code)) {
        devbus.emit('msl', 'yeniden sağlama', { reason: code })
        this.session = null
        return this.sendOnce<T>(path, query, payload, label, signal)
      }
      throw err
    }
  }

  private async sendOnce<T>(
    path: string,
    query: Record<string, string>,
    payload: unknown,
    label: string,
    signal?: AbortSignal,
  ): Promise<T> {
    const s = await this.ensureSession()
    const subtle = s.keys ? subtleOrNull() : null
    s.messageid += 1
    const header: MslHeader = { messageid: s.messageid, sender: s.esn, timestamp: nowSec() }
    const t0 = performance.now()
    const env = await sealEnvelope(subtle, s.keys, s.mastertoken, header, payload)
    const body = JSON.stringify(env)
    const qs = new URLSearchParams(query).toString()
    const res = await fetch(qs ? `${path}?${qs}` : path, {
      method: 'POST',
      credentials: 'same-origin',
      signal,
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        [HEADERS.MSL]: 'v1',
        ...sessionHeaders(),
      },
      body,
    })
    const text = await res.text()
    let json: unknown = null
    try {
      json = JSON.parse(text)
    } catch {
      /* JSON değil */
    }
    if (!res.ok || !isEnvelope(json)) {
      const e = errorCodeOf(json)
      devbus.emit(
        'msl',
        'zarf',
        {
          scheme: s.scheme,
          messageid: s.messageid,
          status: res.status,
          error: e?.code ?? 'BAD_RESPONSE',
          bytes: body.length,
        },
        { ms: performance.now() - t0, ok: false },
      )
      throw new MslError(
        e?.code ?? 'BAD_RESPONSE',
        e?.message ?? `MSL yanıtı geçersiz (${res.status})`,
        res.status,
        json,
      )
    }
    const opened = await openEnvelope<T>(subtle, s.keys, json)
    // Yanıt kimliği = istek + 1; sonraki istek ondan büyük olmalı
    if (opened.header.messageid > s.messageid) s.messageid = opened.header.messageid
    if (opened.header.renewable) s.mustRenew = true
    devbus.emit(
      'msl',
      'zarf',
      {
        scheme: s.scheme,
        reqName: label,
        serialnumber: s.tokendata.serialnumber,
        renewalwindow: s.tokendata.renewalwindow,
        expiration: s.tokendata.expiration,
        messageid: s.messageid,
        responseMessageid: opened.header.messageid,
        renewable: opened.header.renewable ?? false,
        bytes: body.length,
        responseBytes: text.length,
        sender: CLIENT.PLAYER,
      },
      { ms: performance.now() - t0 },
    )
    // Yük içinde MSL hatası dönebilir
    const inner = errorCodeOf(opened.payload)
    if (inner && RETRYABLE.has(inner.code)) throw new MslError(inner.code, inner.message, res.status, opened.payload)
    return opened.payload
  }
}

/** Uygulama genelinde tek MSL oturumu. */
export const msl = new MslClient()
