/**
 * Üretecin saf yardımcılarının testi (hızlı; `npm run test` içinde koşar).
 * Üretilen kodun derlenip testten geçtiğinin uçtan uca kanıtı: gen.e2e.test.ts (`npm run test:gen`).
 */
import { describe, expect, it } from 'vitest'
import {
  addMessages,
  addNamedImport,
  camelCase,
  COLLECTION_NAME,
  insertAfterLast,
  insertBeforeMarker,
  nextMigrationNumber,
  PAGE_NAME,
  pascalCase,
  singularOf,
} from '../gen/lib.ts'

describe('üreteç yardımcıları', () => {
  it('adlar doğrulanır ve türetilir', () => {
    expect(COLLECTION_NAME.test('notes')).toBe(true)
    expect(COLLECTION_NAME.test('Notlar')).toBe(false)
    expect(COLLECTION_NAME.test('not-lar')).toBe(false)
    expect(PAGE_NAME.test('haftalik-ozet')).toBe(true)
    expect(PAGE_NAME.test('haftalık')).toBe(false)
    expect(camelCase('haftalik-ozet')).toBe('haftalikOzet')
    expect(camelCase('notes_v2')).toBe('notesV2')
    expect(pascalCase('notes')).toBe('Notes')
    expect([singularOf('notes'), singularOf('categories'), singularOf('status'), singularOf('data')]).toEqual([
      'note',
      'category',
      'status',
      'dataItem',
    ])
  })

  it('işaretin önüne aynı girintiyle ekler; işaret yoksa ya da satır varsa durur', () => {
    const text = 'const x = {\n  a: 1,\n  // YENİ BURAYA\n}\n'
    expect(insertBeforeMarker(text, '// YENİ BURAYA', ['b: 2,'])).toBe(
      'const x = {\n  a: 1,\n  b: 2,\n  // YENİ BURAYA\n}\n',
    )
    expect(() => insertBeforeMarker(text, '// YOK', ['b: 2,'])).toThrow(/İşaret bulunamadı/)
    expect(() => insertBeforeMarker(text, '// YENİ BURAYA', ['a: 1,'])).toThrow(/zaten var/)
  })

  it('son eşleşen satırın altına ve içe aktarma listesine ekler', () => {
    const text = "import { a } from './a.ts'\nimport { b } from './b.ts'\n\nconst c = 1\n"
    expect(insertAfterLast(text, /^import \{ \w+ \} from '\.\/\w+\.ts'$/, "import { n } from './n.ts'")).toBe(
      "import { a } from './a.ts'\nimport { b } from './b.ts'\nimport { n } from './n.ts'\n\nconst c = 1\n",
    )
    expect(addNamedImport("import { House, type LucideIcon } from 'lucide-react'", 'lucide-react', 'Blocks')).toBe(
      "import { Blocks, House, type LucideIcon } from 'lucide-react'",
    )
    const same = "import { Blocks } from 'lucide-react'"
    expect(addNamedImport(same, 'lucide-react', 'Blocks')).toBe(same)
  })

  it('sözlüğe anahtar ekler, var olanı ezmez, JSON geçerli kalır', () => {
    const json = '{\n  "a.b": "Bir",\n\n  "c.d": "İki"\n}\n'
    const next = addMessages(json, { 'e.f': 'Üç “tırnak”' })
    expect(JSON.parse(next)).toEqual({ 'a.b': 'Bir', 'c.d': 'İki', 'e.f': 'Üç “tırnak”' })
    expect(next).toContain('\n\n  "e.f"')
    expect(() => addMessages(json, { 'a.b': 'x' })).toThrow(/zaten var/)
  })

  it('sıradaki migrasyon numarası', () => {
    expect(nextMigrationNumber(['0001_identity.sql', '0004_audit.sql', 'README.md'])).toBe('0005')
    expect(nextMigrationNumber([])).toBe('0001')
  })
})
