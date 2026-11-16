import { describe, expect, it } from 'vitest'
import { DEFAULT_PASSWORD_HASH } from '../src/config.ts'
import { createPasswordHasher, parsePasswordHash } from '../src/lib/password.ts'
import { checkPassword, commonPasswordCount } from '../src/lib/passwordPolicy.ts'
import { cryptoRandom } from '../src/lib/random.ts'
import { CHEAP_HASH } from './support/harness.ts'

describe('parola özeti (scrypt)', () => {
  it('özet dizgisi parametreleri taşır; doğru parola doğrulanır, yanlışı reddedilir; aynı parola farklı tuzla özetlenir', async () => {
    const hasher = createPasswordHasher(CHEAP_HASH, cryptoRandom)
    const first = await hasher.hash('mavi-deniz-kenari-42')
    const second = await hasher.hash('mavi-deniz-kenari-42')
    expect(first).toMatch(/^scrypt\$16\$1\$1\$[\w-]{22}\$[\w-]{43}$/)
    expect(first).not.toBe(second)
    expect(await hasher.verify('mavi-deniz-kenari-42', first)).toBe(true)
    expect(await hasher.verify('mavi-deniz-kenari-43', first)).toBe(false)
  })

  it('Unicode NFC: "ş" bileşik ya da ayrık yazılsa da aynı parola sayılır', async () => {
    const hasher = createPasswordHasher(CHEAP_HASH, cryptoRandom)
    const composed = 'kış-güneşi-çok-güzel'.normalize('NFC')
    const decomposed = composed.normalize('NFD')
    expect(composed).not.toBe(decomposed)
    expect(await hasher.verify(decomposed, await hasher.hash(composed))).toBe(true)
  })

  it('bozuk özet dizgisi doğrulanmaz ve yeniden özetlenmeli sayılır; parametre farkı yeniden özetleme ister', async () => {
    const hasher = createPasswordHasher(CHEAP_HASH, cryptoRandom)
    for (const broken of ['', 'scrypt$', 'bcrypt$2$x$y$z$w', 'scrypt$15$1$1$AAAAAAAAAAA$AAAA', 'düz-parola']) {
      expect(parsePasswordHash(broken)).toBeNull()
      expect(await hasher.verify('x', broken)).toBe(false)
      expect(hasher.needsRehash(broken)).toBe(true)
    }
    const stored = await hasher.hash('mavi-deniz-kenari-42')
    expect(hasher.needsRehash(stored)).toBe(false)
    expect(createPasswordHasher({ N: 32, r: 1, p: 1 }, cryptoRandom).needsRehash(stored)).toBe(true)
  })

  it('gerçek varsayılan parametreler (N=2^14, r=8, p=5) çalışır', async () => {
    expect(DEFAULT_PASSWORD_HASH).toEqual({ N: 16384, r: 8, p: 5 })
    const hasher = createPasswordHasher(DEFAULT_PASSWORD_HASH, cryptoRandom)
    const stored = await hasher.hash('mavi-deniz-kenari-42')
    expect(stored.startsWith('scrypt$16384$8$5$')).toBe(true)
    expect(await hasher.verify('mavi-deniz-kenari-42', stored)).toBe(true)
  })

  it('sahte doğrulama (burn) hata vermez ve bir kez hesaplanan sahte özeti yeniden kullanır', async () => {
    const hasher = createPasswordHasher(CHEAP_HASH, cryptoRandom)
    await hasher.burn('herhangi')
    await hasher.burn('baska')
  })
})

describe('şifre kuralları', () => {
  it('liste en az 400 yaygın parola içerir', () => {
    expect(commonPasswordCount()).toBeGreaterThanOrEqual(400)
  })

  it.each([
    ['1234567890', 'liste / yalnız rakam'],
    ['qwertyuiop', 'liste'],
    ['Password123', 'liste (büyük harf fark etmez)'],
    ['QWERTYUIOPĞÜ', 'Türkçe klavye satırı'],
    ['Galatasaray1905!', 'sözcük + yıl'],
    ['1905galatasaray', 'yıl + sözcük'],
    ['ŞİFRE2026', 'Türkçe harfli sözcük + yıl'],
    ['Parola.123456', 'sözcük + rakam'],
    ['aaaaaaaaaaaa', 'tek harf'],
    ['abababababab', 'iki harfin yinelenmesi'],
    ['abcdefghijkl', 'düz dizi'],
    ['5321234567', 'telefon numarası (harf yok)'],
    ['!!!???...###', 'harf yok'],
  ])('reddedilir: %s (%s)', (password) => {
    expect(checkPassword(password).ok).toBe(false)
  })

  it('kişisel bilgiyi içeren şifre reddedilir', () => {
    expect(checkPassword('zeynep-kara-1990', { email: 'zeynep.kara@ornek.com' })).toMatchObject({ ok: false })
    expect(checkPassword('ILIKSU-sevgiyle-7', { name: 'Ilıksu Demir' })).toMatchObject({ ok: false })
    expect(checkPassword('ali-veli-49-elli', { name: 'Ali' }).ok).toBe(true) // 4 harften kısa ad parçası sayılmaz
  })

  it.each(['mavi-deniz-kenari-42', 'kış güneşi çok güzel', 'Ankara’da bir sabah 7', 'balkondaki-sardunya'])(
    'kabul edilir: %s',
    (password) => {
      expect(checkPassword(password, { email: 'kisi@ornek.com', name: 'Deneme' })).toEqual({ ok: true })
    },
  )
})
