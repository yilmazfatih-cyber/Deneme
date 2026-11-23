/**
 * KURAL: yapı ve düzen.
 *  - her özellik klasörünün (src/features/<ad>) testi var: test/features/<ad>.test.tsx
 *  - her kaynak dosya Türkçe başlık yorumuyla açılır (STANDARTLAR §6.2)
 *  - kaynak dosyalar ~300 satırı aşmaz (yumuşak sınır: 320)
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expectNone, listFiles, read, rel, ROOT, SRC } from './source.ts'

const SOURCES = [
  ...listFiles(SRC, ['.ts', '.tsx']),
  ...listFiles(join(ROOT, 'scripts'), ['.ts']),
  ...listFiles(join(ROOT, 'test'), ['.ts', '.tsx']),
  ...listFiles(join(ROOT, 'e2e'), ['.ts']),
]

describe('yapı (kural testleri)', () => {
  it('her özellik klasörünün testi var', () => {
    const features = readdirSync(join(SRC, 'features')).filter((name) =>
      statSync(join(SRC, 'features', name)).isDirectory(),
    )
    const missing = features.filter(
      (name) =>
        !existsSync(join(ROOT, 'test', 'features', `${name}.test.tsx`)) &&
        !existsSync(join(ROOT, 'test', 'features', `${name}.test.ts`)),
    )
    expectNone(missing, 'Eksik testi yazın: test/features/<ad>.test.tsx (örnek: test/features/tasks.test.tsx):')
  })

  it('her kaynak dosya başlık yorumuyla açılır', () => {
    const missing = SOURCES.filter((file) => !/^\s*(\/\*|\/\/)/.test(read(file))).map(rel)
    expectNone(missing, 'Dosyanın başına ne yaptığını anlatan /** … */ yorumu ekleyin:')
  })

  it('kaynak dosyalar kısa kalır', () => {
    const long = SOURCES.map((file) => ({ file: rel(file), lines: read(file).split('\n').length }))
      .filter((item) => item.lines > 320)
      .map((item) => `${item.file} (${item.lines} satır)`)
    expectNone(long, 'Dosyayı tek işi olan küçük dosyalara bölün:')
  })
})
