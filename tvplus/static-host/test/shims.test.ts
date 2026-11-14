/**
 * Tarayıcı karşılıkları Node'un kendisiyle aynı sonucu vermeli: kripto (MSL el sıkışması, çerez MAC'leri, PIN),
 * yol işlemleri, bellek içi dosya sistemi.
 */
import * as nodeCrypto from 'node:crypto'
import * as nodePath from 'node:path'
import { describe, expect, it } from 'vitest'
import * as shimCrypto from '../node/crypto'
import * as fs from '../node/fs'
import * as shimPath from '../node/path'

describe('crypto karşılığı', () => {
  it('özet ve HMAC Node ile aynı', () => {
    for (const alg of ['sha1', 'sha256', 'sha512', 'md5']) {
      expect(shimCrypto.createHash(alg).update('Türkçe ğüşiöç').digest('hex')).toBe(
        nodeCrypto.createHash(alg).update('Türkçe ğüşiöç').digest('hex'),
      )
    }
    const key = nodeCrypto.randomBytes(32)
    expect(shimCrypto.createHmac('sha256', key).update('a').update('b').digest('base64url')).toBe(
      nodeCrypto.createHmac('sha256', key).update('ab').digest('base64url'),
    )
    expect(shimCrypto.hash('sha256', 'x')).toBe(nodeCrypto.createHash('sha256').update('x').digest('hex'))
  })

  it('HKDF ve scrypt Node ile aynı', async () => {
    const ikm = nodeCrypto.randomBytes(32)
    const a = Buffer.from(shimCrypto.hkdfSync('sha256', ikm, Buffer.from('tuz'), Buffer.from('bilgi'), 64))
    const b = Buffer.from(nodeCrypto.hkdfSync('sha256', ikm, Buffer.from('tuz'), Buffer.from('bilgi'), 64))
    expect(a.equals(b)).toBe(true)
    const salt = nodeCrypto.randomBytes(16)
    const want = nodeCrypto.scryptSync('1234', salt, 32, { N: 1 << 10, r: 8, p: 1 })
    const got = await new Promise<Buffer>((res, rej) =>
      shimCrypto.scrypt('1234', salt, 32, { N: 1 << 10, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))),
    )
    expect(Buffer.from(got).equals(want)).toBe(true)
  })

  it('AES-256-GCM her iki yönde Node ile uyumlu', () => {
    const key = nodeCrypto.randomBytes(32)
    const iv = nodeCrypto.randomBytes(12)
    const aad = Buffer.from('ek veri')
    const plain = Buffer.from('gizli künye')
    const c = shimCrypto.createCipheriv('aes-256-gcm', key, iv).setAAD(aad)
    const ct = Buffer.concat([c.update(plain) as Buffer, c.final() as Buffer])
    const d = nodeCrypto.createDecipheriv('aes-256-gcm', key, iv)
    d.setAAD(aad)
    d.setAuthTag(c.getAuthTag())
    expect(Buffer.concat([d.update(ct), d.final()]).toString()).toBe('gizli künye')

    const n = nodeCrypto.createCipheriv('aes-256-gcm', key, iv)
    n.setAAD(aad)
    const ct2 = Buffer.concat([n.update(plain), n.final()])
    const sd = shimCrypto.createDecipheriv('aes-256-gcm', key, iv).setAAD(aad).setAuthTag(n.getAuthTag())
    expect(Buffer.concat([sd.update(ct2) as Buffer, sd.final() as Buffer]).toString()).toBe('gizli künye')
    const bad = shimCrypto.createDecipheriv('aes-256-gcm', key, iv).setAAD(aad).setAuthTag(Buffer.alloc(16))
    bad.update(ct2)
    expect(() => bad.final()).toThrow()
  })

  it('P-256 ECDH ortak sırrı Node ile aynı', () => {
    const node = nodeCrypto.createECDH('prime256v1')
    node.generateKeys()
    const shim = shimCrypto.createECDH('prime256v1')
    const pub = shim.generateKeys() as Buffer
    expect(pub.length).toBe(65)
    const s1 = Buffer.from(shim.computeSecret(node.getPublicKey()) as Buffer)
    const s2 = node.computeSecret(pub)
    expect(s1.equals(s2)).toBe(true)
  })

  it('randomInt aralıkta, timingSafeEqual doğru', () => {
    for (let i = 0; i < 200; i++) {
      const v = shimCrypto.randomInt(1, 7)
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThan(7)
    }
    expect(shimCrypto.timingSafeEqual(Buffer.from('ab'), Buffer.from('ab'))).toBe(true)
    expect(shimCrypto.timingSafeEqual(Buffer.from('ab'), Buffer.from('ac'))).toBe(false)
  })
})

describe('path karşılığı', () => {
  it('Node posix ile aynı', () => {
    const cases: [string, ...string[]][] = [
      ['join', '/a/b', '../c', './d'],
      ['join', 'a', '', 'b/'],
      ['resolve', '/x', 'y', '../z'],
      ['resolve', 'a/b'],
      ['relative', '/a/b/c', '/a/d'],
      ['dirname', '/a/b/'],
      ['basename', '/a/b.json', '.json'],
      ['extname', '/a/.gizli'],
      ['normalize', '/a//b/../c/.'],
    ]
    for (const [fn, ...args] of cases) {
      const s = (shimPath as unknown as Record<string, (...a: string[]) => string>)[fn]!(...args)
      const n = (nodePath.posix as unknown as Record<string, (...a: string[]) => string>)[fn]!(...args)
      // resolve: Node çalışma klasörünü kullanır; karşılıkta çalışma klasörü `/`.
      if (fn === 'resolve' && !args[0]!.startsWith('/')) expect(s).toBe(nodePath.posix.resolve('/', ...args))
      else expect(s, `${fn}(${args.join(', ')})`).toBe(n)
    }
  })
})

describe('bellek içi dosya sistemi', () => {
  it('yaz, ekle, oku, yeniden adlandır, sil; değişiklikleri bildirir', () => {
    const changes: string[] = []
    const off = fs.onChange((p, k) => changes.push(`${k} ${p}`))
    fs.mkdirSync('/data/a', { recursive: true })
    fs.writeFileSync('/data/a/x.json.1.tmp', '{"n":1}')
    fs.renameSync('/data/a/x.json.1.tmp', '/data/a/x.json')
    fs.appendFileSync('/data/a/log.ndjson', 'bir\n')
    fs.appendFileSync('/data/a/log.ndjson', 'iki\n')
    expect(fs.readFileSync('/data/a/x.json', 'utf8')).toBe('{"n":1}')
    expect(fs.readFileSync('/data/a/log.ndjson', 'utf8')).toBe('bir\niki\n')
    expect(fs.statSync('/data/a/log.ndjson').size).toBe(8)
    expect(fs.readdirSync('/data/a')).toEqual(['log.ndjson', 'x.json'])
    expect(() => fs.readFileSync('/data/yok')).toThrow(/ENOENT/)
    const fd = fs.openSync('/data/a/log.ndjson', 'r')
    const b = Buffer.alloc(3)
    expect(fs.readSync(fd, b, 0, 3, 4)).toBe(3)
    expect(b.toString()).toBe('iki')
    fs.closeSync(fd)
    fs.rmSync('/data/a', { recursive: true })
    expect(fs.existsSync('/data/a/x.json')).toBe(false)
    off()
    expect(changes).toContain('write /data/a/x.json')
    expect(changes).toContain('delete /data/a/x.json.1.tmp')
    expect(changes).toContain('delete /data/a/log.ndjson')
  })
})
