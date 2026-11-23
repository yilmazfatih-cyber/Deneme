/**
 * KURAL: shared/ klasörü havuz/uygulama/shared/src'nin DEĞİŞTİRİLMEMİŞ kopyasıdır.
 *  - Her dosyanın ilk satırı kaynağı ve kopyalanma tarihini söyler.
 *  - İçerik, shared/KAYNAK.json'daki özetle aynıdır (kopya elle değiştirilmemiş).
 *  - Havuz içindeyken (../uygulama/shared/src varsa) içerik kaynakla birebir aynıdır.
 * Kaynak değiştiyse: `npm run shared:sync` → `npm run check` (ayrıntı: AGENTS.md → "Ortak sözleşmeyi güncelle").
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expectNone, listFiles, ROOT } from './source.ts'

const SHARED = join(ROOT, 'shared')
const SOURCE = join(ROOT, '..', 'uygulama', 'shared', 'src')
const HEADER =
  /^\/\/ KOPYA — elle değiştirmeyin\. Kaynak: havuz\/uygulama\/shared\/src\/(\S+) · Kopyalanma: (\d{4}-\d{2}-\d{2}) · Yenile: npm run shared:sync$/

const manifest = JSON.parse(readFileSync(join(SHARED, 'KAYNAK.json'), 'utf8')) as {
  kaynak: string
  kopyalanma: string
  dosyalar: Record<string, string>
}

function relOf(dir: string, file: string): string {
  return file
    .slice(dir.length + 1)
    .split('\\')
    .join('/')
}

function body(file: string): { header: string; content: string } {
  const text = readFileSync(file, 'utf8')
  const newline = text.indexOf('\n')
  return { header: text.slice(0, newline), content: text.slice(newline + 1) }
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')
const FIX = 'Kopya kaynaktan ayrılmış. Çözüm: `npm run shared:sync`, sonra `npm run check`.'

describe('ortak sözleşme kopyası (kural testi)', () => {
  const copied = listFiles(SHARED, ['.ts']).map((file) => relOf(SHARED, file))

  it('her dosya başlık satırıyla açılır (kaynak + kopyalanma tarihi)', () => {
    const problems = copied.filter((rel) => {
      const match = HEADER.exec(body(join(SHARED, rel)).header)
      return match?.[1] !== rel
    })
    expectNone(problems, `İlk satır kaynak başlığı değil. ${FIX}`)
  })

  it('içerik KAYNAK.json özetiyle aynı (kopya elle değiştirilmemiş)', () => {
    expect(Object.keys(manifest.dosyalar).toSorted()).toEqual(copied)
    const changed = copied.filter((rel) => sha256(body(join(SHARED, rel)).content) !== manifest.dosyalar[rel])
    expectNone(changed, `Elle değiştirilmiş kopya dosyaları. Değişikliği havuz/uygulama/shared/src'de yapın. ${FIX}`)
  })

  const inPool = existsSync(SOURCE)
  ;(inPool ? it : it.skip)('havuz içindeyken kaynakla birebir aynı', () => {
    const source = listFiles(SOURCE, ['.ts']).map((file) => relOf(SOURCE, file))
    const missing = source.filter((rel) => !copied.includes(rel)).map((rel) => `eksik: ${rel}`)
    const extra = copied.filter((rel) => !source.includes(rel)).map((rel) => `fazla: ${rel}`)
    const differ = copied
      .filter((rel) => source.includes(rel))
      .filter((rel) => body(join(SHARED, rel)).content !== readFileSync(join(SOURCE, rel), 'utf8'))
      .map((rel) => `farklı: ${rel}`)
    expectNone([...missing, ...extra, ...differ], FIX)
  })
})
