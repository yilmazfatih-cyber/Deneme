import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { OCA_URL_TTL_SEC } from '../../shared/constants'
import { deriveKey, loadConfig } from '../src/kernel/config'
import { createSigner } from '../src/services/oca/signing'

const config = loadConfig({ dataDir: '/tmp', secret: 'imza-testi', isTest: true })
const signer = createSigner(config)
const NODE = 'c101-ist001-ix'
const asQuery = (q: string) => Object.fromEntries(new URLSearchParams(q))

describe('OCA adres imzası', () => {
  it('sözleşmedeki formül: base64url(HMAC(urlKey, node|o|v|e))', () => {
    const e = 1_900_000_000
    const expected = createHmac('sha256', deriveKey(config, 'oca-url'))
      .update(`${NODE}|abc123|3|${e}`)
      .digest('base64url')
    expect(signer.sign(NODE, 'abc123', 3, e)).toBe(expected)
    expect(signer.query(NODE, 'abc123', 3, e)).toBe(`o=abc123&v=3&e=${e}&t=${expected}`)
  })

  it('geçerli adres kabul edilir; varsayılan ömür ≈ 12 saat', () => {
    const now = 1_800_000_000
    const e = signer.expiry(now)
    expect(e - now).toBe(OCA_URL_TTL_SEC)
    const r = signer.verify(NODE, asQuery(signer.query(NODE, 'o1', 1, e)), now)
    expect(r).toEqual({ ok: true, o: 'o1', v: 1, e })
  })

  it('süresi dolmuş → URL_EXPIRED', () => {
    const r = signer.verify(NODE, asQuery(signer.query(NODE, 'o1', 1, 1000)), 1001)
    expect(r.ok).toBe(false)
    if (!r.ok) expect([r.status, r.code]).toEqual([403, 'URL_EXPIRED'])
  })

  it('kurcalanmış o / v / e / t → SIGNATURE_INVALID', () => {
    const now = 1_800_000_000
    const q = asQuery(signer.query(NODE, 'o1', 1, now + 100))
    for (const patch of [{ o: 'o2' }, { v: '2' }, { e: String(now + 99999) }, { t: q.t!.slice(0, -2) + 'AA' }]) {
      const r = signer.verify(NODE, { ...q, ...patch }, now)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.code).toBe('SIGNATURE_INVALID')
    }
  })

  it('başka düğümün imzası geçmez', () => {
    const now = 1_800_000_000
    const q = asQuery(signer.query('c102-ist001-ix', 'o1', 1, now + 100))
    const r = signer.verify(NODE, q, now)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('SIGNATURE_INVALID')
  })

  it('eksik parametre → 400', () => {
    const r = signer.verify(NODE, { o: 'x' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
  })

  it('farklı gizli anahtar farklı imza üretir', () => {
    const other = createSigner(loadConfig({ dataDir: '/tmp', secret: 'baska', isTest: true }))
    expect(other.sign(NODE, 'o', 1, 5)).not.toBe(signer.sign(NODE, 'o', 1, 5))
  })
})
