import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatTaggingReport, runTaggingCheck, validateTagging } from './validate-tagging'

const CONTENT = join(__dirname, '..', 'content')

type Sheet = {
  titleId: number
  rubricVersion: string
  source: string
  watched: boolean
  facets: Record<string, string[]>
} & Record<string, unknown>

/** Gerçek sözlük + örnek fişler + iki başlıklık katalog; `mutate` fiş dizisini ya da sözlüğü bozar. */
function tree(mutate?: (sheets: Sheet[], vocab: Record<string, unknown>) => void): string {
  const dir = mkdtempSync(join(tmpdir(), 'tvplus-etiket-dogrula-'))
  cpSync(join(CONTENT, 'tagging'), join(dir, 'tagging'), { recursive: true })
  mkdirSync(join(dir, 'titles'))
  const sheetsFile = join(dir, 'tagging', 'sheets', 'ornek-temel.json')
  const sheets = (JSON.parse(readFileSync(sheetsFile, 'utf8')) as Sheet[]).slice(0, 2)
  const vocabFile = join(dir, 'tagging', 'vocabulary.json')
  const vocab = JSON.parse(readFileSync(vocabFile, 'utf8')) as Record<string, unknown>
  const titles = sheets.map((s, i) => ({
    videoId: s.titleId,
    slug: `t-${i}`,
    type: 'MOVIE',
    title: `Film ${i}`,
    year: 2010,
    synopsis: 'Yirmi karakterden uzun bir deneme özeti.',
    shortSynopsis: 'Kısa.',
    genres: ['animasyon'],
    maturity: { rating: 'GENEL' },
    sources: [{ type: 'YOUTUBE', videoId: 'aqz-KE-bpKQ' }],
    license: { name: 'CC BY', attribution: 'x' },
  }))
  writeFileSync(join(dir, 'titles', 'a.json'), JSON.stringify(titles))
  mutate?.(sheets, vocab)
  writeFileSync(sheetsFile, JSON.stringify(sheets))
  writeFileSync(vocabFile, JSON.stringify(vocab))
  return dir
}

const errorsOf = (dir: string) =>
  validateTagging(dir)
    .issues.filter((i) => i.level === 'error')
    .map((i) => `${i.file} ${i.path}: ${i.message}`)

describe('validate-tagging', () => {
  it('depodaki içerik geçerli; özet sözlüğü ve fişleri sayar', () => {
    const r = validateTagging(CONTENT)
    expect(r.issues.filter((i) => i.level === 'error')).toEqual([])
    expect(r.stats).toMatchObject({
      version: '2026.11-1',
      scales: 16,
      facets: 8,
      genres: 24,
      sheets: 12,
      sheetFiles: 1,
    })
    const text = formatTaggingReport(r, CONTENT)
    expect(text).toMatch(/Sözlük 2026\.11-1 · ölçek 16/)
    expect(text).toMatch(/Sonuç: geçerli/)
  })

  it('küçük ağaç geçerli', () => {
    expect(errorsOf(tree())).toEqual([])
  })

  it('bilinmeyen ölçek, bilinmeyen değer, max aşımı, katalogda olmayan başlık', () => {
    const errs = errorsOf(
      tree((sheets) => {
        ;(sheets[0]!.scales as Record<string, unknown>)['uydurma'] = 3
        sheets[0]!.facets['mekan'] = ['mars']
        sheets[1]!.facets['ek-sifatlar'] = ['kult', 'odullu', 'absurt', 'nostaljik', 'gercekci']
        sheets[1]!.titleId = 80099999
      }),
    ).join('\n')
    expect(errs).toMatch(/ornek-temel\.json \[0\]\.scales\.uydurma: Bilinmeyen ölçek: "uydurma"/)
    expect(errs).toMatch(/\[0\]\.facets\.mekan\[0\]: "mekan" yüzünde "mars" değeri yok/)
    expect(errs).toMatch(/\[1\]\.facets\.ek-sifatlar: "ek-sifatlar" yüzünde en çok 4 değer/)
    expect(errs).toMatch(/\[1\]\.titleId: 80099999 kimlikli başlık katalogda yok/)
  })

  it('başlık başına tek örnek fiş; sürüm uyumu; kaynak ve izlenme kuralı', () => {
    const errs = errorsOf(
      tree((sheets) => {
        sheets.push({ ...sheets[0]!, rubricVersion: '2026.10-1' })
        sheets.push({ ...sheets[1]!, source: 'TAGGER', watched: true })
      }),
    ).join('\n')
    expect(errs).toMatch(/\[2\]\.titleId: 80010001 için ikinci örnek fiş/)
    expect(errs).toMatch(/\[2\]\.rubricVersion: Fiş 2026\.10-1 sürümüyle doldurulmuş; sözlük 2026\.11-1/)
    expect(errs).toMatch(/\[3\]\.source: Depodaki fişler yalnız SAMPLE/)
    expect(errs).toMatch(/\[3\]\.watched: Örnek fiş izlenmeden doldurulur/)
  })

  it('birden çok fiş dosyası kabul edilir; başlık başına tek örnek fiş tüm dosyalar genelinde aranır', () => {
    const dir = tree()
    const sheetsDir = join(dir, 'tagging', 'sheets')
    const [first, second] = JSON.parse(readFileSync(join(sheetsDir, 'ornek-temel.json'), 'utf8')) as Sheet[]
    writeFileSync(join(sheetsDir, 'ornek-temel.json'), JSON.stringify([first]))
    writeFileSync(join(sheetsDir, 'ornek-ek.json'), JSON.stringify([second]))
    expect(errorsOf(dir)).toEqual([])
    expect(validateTagging(dir).stats).toMatchObject({ sheets: 2, sheetFiles: 2 })
    writeFileSync(join(sheetsDir, 'ornek-zz.json'), JSON.stringify([first]))
    expect(errorsOf(dir).join('\n')).toMatch(
      /ornek-zz\.json \[0\]\.titleId: 80010001 için ikinci örnek fiş \(ilk: tagging\/sheets\/ornek-temel\.json \[0\]\)/,
    )
  })

  it('sözlük şema hatası dosya ve yol adıyla; bozuk JSON', () => {
    const errs = errorsOf(
      tree((_s, vocab) => {
        ;(vocab['scales'] as { levels: unknown[] }[])[4]!.levels.splice(2, 1)
      }),
    ).join('\n')
    expect(errs).toMatch(/tagging\/vocabulary\.json scales\[4\]\.levels/)
    const dir = tree()
    writeFileSync(join(dir, 'tagging', 'sheets', 'bozuk.json'), '{ yarım')
    expect(errorsOf(dir).join('\n')).toMatch(/bozuk\.json : JSON okunamadı/)
  })

  it('komut: hata sayısını döndürür; içerik doğrulamasından çağrılınca klasör yoksa atlar', () => {
    const empty = mkdtempSync(join(tmpdir(), 'tvplus-etiket-yok-'))
    expect(runTaggingCheck(empty, true)).toBe(0)
    expect(runTaggingCheck(empty)).toBeGreaterThan(0)
  })
})
