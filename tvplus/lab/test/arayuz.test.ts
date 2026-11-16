/**
 * Arayüz yardımcıları: sayıya Türkçe ek (ünlü uyumu), ajan kipi çıktı bütçesi, toplu komut ayrıştırma ve
 * ajan kipinin kısıtları (gizlilik ayarı, depo sıfırlama, lab klasörü, büyük JSON).
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { parseArgs, splitBatch } from '../src/cli/args'
import { budget, execute, type ExecuteOptions } from '../src/cli/commands'
import { ek } from '../src/core/format'
import { MIN_K, openLab } from '../src/core/lab'

const dir = mkdtempSync(join(tmpdir(), 'lab-arayuz-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('sayıya Türkçe ek', () => {
  it('iyelik / belirtme: son okunan sözcüğe göre', () => {
    const cases: [string, string][] = [
      ['%15.3', "%15.3'ü"],
      ['%27', "%27'si"],
      ['%19.7', "%19.7'si"],
      ['%11', "%11'i"],
      ['%9', "%9'u"],
      ['%34.1', "%34.1'i"],
      ['318', "318'i"],
      ['%10', "%10'u"],
      ['%30', "%30'u"],
      ['%50', "%50'si"],
      ['%70', "%70'i"],
      ['%100', "%100'ü"],
      ['%6', "%6'sı"],
      ['%0', "%0'ı"],
      ['%25.6', "%25.6'sı"],
      ['%8.8', "%8.8'i"],
      ['1000', "1000'i"],
      ['12.3K', "12.3K'i"],
    ]
    for (const [text, want] of cases) expect(ek(text, 'i')).toBe(want)
  })

  it('bulunma (iyelikle), yönelme ve ayrılma', () => {
    expect(ek('%39.9', 'de')).toBe("%39.9'unda")
    expect(ek('%76.1', 'de')).toBe("%76.1'inde")
    expect(ek('%20', 'de')).toBe("%20'sinde")
    expect(ek('%40', 'de')).toBe("%40'ında")
    expect(ek('%2.4', 'de')).toBe("%2.4'ünde")
    expect(ek('%90', 'e')).toBe("%90'a")
    expect(ek('%73', 'e')).toBe("%73'e")
    expect(ek('%2', 'e')).toBe("%2'ye")
    expect(ek('200', 'den')).toBe("200'den")
    expect(ek('%4', 'den')).toBe("%4'ten")
    expect(ek('%40', 'den')).toBe("%40'tan")
  })
})

describe('çıktı bütçesi ve toplu komut', () => {
  it('bütçe: sınırın altındaki metne dokunmaz, üstündekini satır sonundan keser ve söyler', () => {
    expect(budget('kısa', 100)).toBe('kısa')
    const text = Array.from({ length: 200 }, (_, i) => `satır ${i} ${'x'.repeat(40)}`).join('\n')
    const cut = budget(text, 1000)
    expect(cut.length).toBeLessThan(1200)
    expect(cut).toContain('çıktı bütçesi doldu')
    const head = cut.slice(0, cut.indexOf('\n… çıktı bütçesi'))
    expect(text.startsWith(head)).toBe(true)
    expect(head.endsWith('x')).toBe(true)
  })

  it("toplu komut: ';' ve satır sonu ayırır, tırnak içindeki ';' korunur, boşlar atılır", () => {
    expect(splitBatch('durum; churn neden ;; sozluk')).toEqual(['durum', 'churn neden', 'sozluk'])
    expect(splitBatch('a\nb\n\nc')).toEqual(['a', 'b', 'c'])
    expect(splitBatch('sorgu gun --nerede "x>3 ; y<2"; durum')).toEqual(['sorgu gun --nerede "x>3 ; y<2"', 'durum'])
    expect(splitBatch('  ')).toEqual([])
  })
})

describe('ajan kipi', () => {
  const agent: ExecuteOptions = { agent: true, dir }
  const run = (line: string[], opts = agent): Promise<string> => execute(line, parseArgs, undefined, true, opts)

  it('gizlilik ayarı değiştirilemez; okumak serbesttir', async () => {
    await expect(run(['ayar', '--k', '5'])).rejects.toThrow(/ajan kipinde kapalıdır/)
    await expect(run(['ayar', '--icerik-adlari', 'hayir'])).rejects.toThrow(/ajan kipinde kapalıdır/)
    expect(existsSync(join(dir, 'ayar.json'))).toBe(false)
    expect(await run(['ayar'])).toContain('k-anonimlik eşiği')
  })

  it('lab klasörü değiştirilemez, depo boşaltılamaz', async () => {
    await expect(run(['durum', '--lab', join(dir, 'baska')])).rejects.toThrow(/lab klasörü değiştirilemez/)
    expect(existsSync(join(dir, 'baska'))).toBe(false)
    // Dosya var olsun ki hata sıfırlama kısıtından gelsin
    await expect(run(['al', join(dir, 'anahtar'), '--sifirla'])).rejects.toThrow(/Eşleme yok|ajan kipinde kapalıdır/)
  })

  it('çıktı bütçelenir; bütçeyi aşan JSON kesilmez, metne yönlendirilir', async () => {
    const help = await run(['yardim'], { ...agent, maxChars: 300 })
    expect(help.length).toBeLessThan(500)
    expect(help).toContain('çıktı bütçesi doldu')
    const json = await run(['ayar', '--json'], { ...agent, maxChars: 10 })
    expect(json).toContain('JSON çıktısı')
    expect(json).toContain('--json olmadan')
  })

  it('k-anonimlik eşiği hiçbir yoldan alt sınırın altına inmez', () => {
    const before = process.env.TVP_LAB_K
    process.env.TVP_LAB_K = '1'
    try {
      expect(openLab({ dir: join(dir, 'k'), secret: 'x' }).settings.kAnonim).toBe(MIN_K)
    } finally {
      if (before === undefined) delete process.env.TVP_LAB_K
      else process.env.TVP_LAB_K = before
    }
  })
})
