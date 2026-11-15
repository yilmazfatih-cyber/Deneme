import { describe, expect, it } from 'vitest'
import { adminCodeHash, codeProblem, MIN_CODE_LENGTH, rewriteHash } from './admin-code'

describe('yönetici kodu betiği', () => {
  it('özet: boşluk, tire ve harf büyüklüğü fark etmez; 64 onaltılık hane', () => {
    const h = adminCodeHash('TVP-ABCD-EFGH')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(adminCodeHash('tvp abcd efgh')).toBe(h)
    expect(adminCodeHash('tvpabcdefgh')).toBe(h)
    expect(adminCodeHash('TVP-ABCD-EFGX')).not.toBe(h)
  })

  it('codeProblem: kısa ya da harf/rakam dışı kodu reddeder', () => {
    expect(codeProblem('a-b c')).toContain(String(MIN_CODE_LENGTH))
    expect(codeProblem('abcd!efgh')).toContain('harf ve rakam')
    expect(codeProblem('Gizli Kod 2026')).toBeNull()
    expect(codeProblem('çğış-öüşı-1234')).toBeNull()
  })

  it('rewriteHash: yalnız sabitin değerini değiştirir; sabit yoksa null', () => {
    const src = `// üst\nexport const DEFAULT_ADMIN_CODE_HASH = '${'a'.repeat(64)}'\nexport const X = 1\n`
    const out = rewriteHash(src, 'b'.repeat(64))
    expect(out).toBe(`// üst\nexport const DEFAULT_ADMIN_CODE_HASH = '${'b'.repeat(64)}'\nexport const X = 1\n`)
    expect(rewriteHash('export const X = 1\n', 'b'.repeat(64))).toBeNull()
  })
})
