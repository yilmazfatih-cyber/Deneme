/**
 * Üretecin kanıt testi (npm run test:gen): projeyi geçici bir klasöre kopyalar, oraya örnek bir varlık ("notes")
 * ekler, `gen entity notes` ve `gen screen raporlar --sekme` çalıştırır; üretilen kodun tip denetiminden, lint'ten,
 * biçimden, kural testlerinden ve kendi testlerinden geçtiğini doğrular. Asıl klasöre DOKUNMAZ.
 *
 * Süre: ~1-2 dakika (node_modules kopyalanmaz, bağlanır). Genişletme: yeni üretim türü → buraya bir adım.
 */
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SKIP = /[\\/](node_modules|dist|dist-api|\.expo|test-results|playwright-report|coverage)([\\/]|$)/

const NOTES_ENTITY = `// Üreteç testi için örnek varlık (yalnız geçici kopyada).
import { z } from 'zod'
import { defineEntity } from '../entity.ts'

export const noteEntity = defineEntity({
  collection: 'notes',
  label: { singular: 'Not', plural: 'Notlar' },
  schema: z.object({
    title: z.string().trim().min(1, 'Nota bir başlık yazın.').max(200),
    body: z.string().max(5000).default(''),
    pinned: z.boolean().default(false),
    color: z.enum(['yellow', 'blue']).default('yellow'),
    order: z.number().default(0),
  }),
})
`

function run(command: string, args: string[], cwd: string): void {
  console.log(`\n$ ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) throw new Error(`Başarısız: ${command} ${args.join(' ')}`)
}

function main(): void {
  const work = mkdtempSync(join(tmpdir(), 'havuz-mobil-gen-'))
  try {
    cpSync(ROOT, work, { recursive: true, filter: (path) => !SKIP.test(path.slice(ROOT.length)) })
    symlinkSync(join(ROOT, 'node_modules'), join(work, 'node_modules'), 'dir')
    writeFileSync(join(work, 'shared', 'entities', 'notes.ts'), NOTES_ENTITY)
    const index = join(work, 'shared', 'entities', 'index.ts')
    writeFileSync(
      index,
      readFileSync(index, 'utf8')
        .replace(
          "import { taskEntity } from './tasks.ts'",
          "import { noteEntity } from './notes.ts'\nimport { taskEntity } from './tasks.ts'",
        )
        .replace('  // YENİ VARLIK BURAYA', '  notes: noteEntity,\n  // YENİ VARLIK BURAYA'),
    )
    const gen = ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', 'scripts/gen.ts']
    run(process.execPath, [...gen, 'entity', 'notes', '--etiket', 'Not,Notlar'], work)
    run(process.execPath, [...gen, 'screen', 'raporlar', '--baslik', 'Raporlar', '--sekme'], work)
    run('npx', ['tsc', '--noEmit'], work)
    run('npx', ['eslint', 'src', 'test'], work)
    run('npx', ['prettier', '--check', 'src', 'test'], work)
    run(
      'npx',
      [
        'jest',
        'test/features/notes.test.tsx',
        'test/features/raporlar.test.tsx',
        'test/rules',
        '--testPathIgnorePatterns',
        'shared-copy',
      ],
      work,
    )
    console.log('\nÜreteç kanıtı: hepsi yeşil.')
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

main()
