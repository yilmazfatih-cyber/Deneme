/**
 * @vitest-environment node
 * KURAL: yapı ve düzen.
 *  - her özellik klasörünün (src/features/<ad>) testi var: test/features/<ad>.test.tsx
 *  - her kaynak dosya Türkçe başlık yorumuyla açılır (STANDARTLAR §6.2)
 *  - kaynak dosyalar ~300 satırı aşmaz (yumuşak sınır: 320)
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listFiles, read, rel, SRC, WEB_ROOT } from './source.ts'

describe('yapı (kural testleri)', () => {
  it('her özellik klasörünün testi var', () => {
    const features = readdirSync(join(SRC, 'features')).filter((name) =>
      statSync(join(SRC, 'features', name)).isDirectory(),
    )
    const missing = features.filter(
      (name) =>
        !existsSync(join(WEB_ROOT, 'test', 'features', `${name}.test.tsx`)) &&
        !existsSync(join(WEB_ROOT, 'test', 'features', `${name}.test.ts`)),
    )
    expect(missing, 'Eksik testi yazın: test/features/<ad>.test.tsx (örnek: test/features/tasks.test.tsx)').toEqual([])
  })

  it('her kaynak dosya başlık yorumuyla açılır', () => {
    const missing = listFiles(SRC, ['.ts', '.tsx', '.css'])
      .filter((file) => !/^\s*\/\*/.test(read(file)))
      .map(rel)
    expect(missing, 'Dosyanın başına ne yaptığını anlatan /** … */ yorumu ekleyin').toEqual([])
  })

  it('kaynak dosyalar kısa kalır', () => {
    const long = listFiles(SRC, ['.ts', '.tsx'])
      .map((file) => ({ file: rel(file), lines: read(file).split('\n').length }))
      .filter((item) => item.lines > 320)
      .map((item) => `${item.file} (${item.lines} satır)`)
    expect(long, 'Dosyayı tek işi olan küçük dosyalara bölün').toEqual([])
  })
})
