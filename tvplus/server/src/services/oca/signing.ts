/**
 * İmzalı OCA adresleri (shared/playback.ts §4):
 *   t = base64url(HMAC-SHA256(urlKey, `${node}|${o}|${v}|${e}`))
 * Aralık imzalanmaz: aynı imzalı şablon her bayt aralığı için kullanılır (Netflix'teki gibi yol parçası değişir).
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { OCA_URL_TTL_SEC } from '../../../../shared/constants'
import { deriveKey, type AppConfig } from '../../kernel/config'

export interface SignedParams {
  o: string
  v: number
  e: number
  t: string
}
export type VerifyResult =
  | { ok: true; o: string; v: number; e: number }
  | { ok: false; status: 400 | 403; code: 'BAD_SIGNATURE_PARAMS' | 'SIGNATURE_INVALID' | 'URL_EXPIRED'; message: string }

export interface UrlSigner {
  sign(node: string, o: string, v: number, e: number): string
  /** o/v/e/t sorgu dizgesi; e verilmezse şimdi + OCA_URL_TTL_SEC */
  query(node: string, o: string, v: number, e?: number): string
  verify(node: string, q: Record<string, unknown>, nowSec?: number): VerifyResult
  expiry(nowSec?: number): number
}

export function createSigner(config: AppConfig): UrlSigner {
  const key = deriveKey(config, 'oca-url')
  const sign = (node: string, o: string, v: number, e: number): string =>
    createHmac('sha256', key).update(`${node}|${o}|${v}|${e}`).digest('base64url')
  const expiry = (nowSec = Math.floor(Date.now() / 1000)) => nowSec + OCA_URL_TTL_SEC
  return {
    sign,
    expiry,
    query(node, o, v, e = expiry()) {
      return `o=${encodeURIComponent(o)}&v=${v}&e=${e}&t=${sign(node, o, v, e)}`
    },
    verify(node, q, nowSec = Math.floor(Date.now() / 1000)) {
      const o = typeof q.o === 'string' ? q.o : ''
      const vRaw = typeof q.v === 'string' ? q.v : ''
      const eRaw = typeof q.e === 'string' ? q.e : ''
      const t = typeof q.t === 'string' ? q.t : ''
      if (!o || !/^\d+$/.test(vRaw) || !/^\d+$/.test(eRaw) || !t) {
        return { ok: false, status: 400, code: 'BAD_SIGNATURE_PARAMS', message: 'Adreste o, v, e ve t parametreleri olmalı.' }
      }
      const v = Number(vRaw)
      const e = Number(eRaw)
      const expected = Buffer.from(sign(node, o, v, e))
      const given = Buffer.from(t)
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
        return { ok: false, status: 403, code: 'SIGNATURE_INVALID', message: 'Adresin imzası geçersiz.' }
      }
      if (e < nowSec) return { ok: false, status: 403, code: 'URL_EXPIRED', message: 'Adresin süresi dolmuş.' }
      return { ok: true, o, v, e }
    },
  }
}
