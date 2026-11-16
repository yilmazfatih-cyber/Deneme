/**
 * Üreteç uçtan uca testi (`npm run test:gen`, ~1–2 dk): çalışma alanının geçici bir kopyasında üç üreteci
 * çalıştırır, sonra üretilen kodun DERLENDİĞİNİ (tsc), LİNT ve BİÇİM denetiminden geçtiğini ve İLGİLİ TESTLERİN
 * (shared varlık kuralları, üretilen özelliklerin testleri, web kural testleri) yeşil olduğunu kanıtlar.
 * Kopya en sonda silinir; asıl dosyalara dokunulmaz.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { makeWorkspaceCopy, ROOT } from './copy.ts'

const BIN = join(ROOT, 'node_modules', '.bin')
let dir = ''

function run(command: string, args: readonly string[], cwd: string = dir): string {
  try {
    return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, CI: '1' } })
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string }
    throw new Error(`${command} ${args.join(' ')} başarısız:\n${failure.stdout ?? ''}\n${failure.stderr ?? ''}`, {
      cause: error,
    })
  }
}

describe('üreteç (geçici kopyada)', () => {
  beforeAll(() => {
    dir = makeWorkspaceCopy()
    run(process.execPath, ['scripts/gen.ts', 'entity', 'notes', '--etiket', 'Not,Notlar'])
    run(process.execPath, ['scripts/gen.ts', 'page', 'haftalik-ozet', '--baslik', 'Haftalık özet'])
    run(process.execPath, ['scripts/gen.ts', 'migration', 'ek_tablo'])
  })

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('dosyalar beklenen yerlerde', () => {
    for (const path of [
      'shared/src/entities/notes.ts',
      'web/src/features/notes/NotesPage.tsx',
      'web/src/features/notes/NotesEditPage.tsx',
      'web/test/features/notes.test.tsx',
      'web/src/features/haftalik-ozet/HaftalikOzetPage.tsx',
      'web/test/features/haftalik-ozet.test.tsx',
    ]) {
      expect(existsSync(join(dir, path)), `${path} üretilmedi`).toBe(true)
    }
    expect(readFileSync(join(dir, 'web/src/app/routes.tsx'), 'utf8')).toContain("path: '/notlar'")
    expect(readdirSync(join(dir, 'api', 'migrations')).some((name) => /^\d{4}_ek_tablo\.sql$/.test(name))).toBe(true)
  })

  it('tip denetiminden geçer (shared + web)', () => {
    run(join(BIN, 'tsc'), ['-p', 'shared/tsconfig.json', '--noEmit'])
    run(join(BIN, 'tsc'), ['-p', 'web/tsconfig.json', '--noEmit'])
  })

  it('lint ve biçim denetiminden geçer', () => {
    run(join(BIN, 'eslint'), [
      'shared/src/entities',
      'web/src/features/notes',
      'web/src/features/haftalik-ozet',
      'web/src/app/routes.tsx',
      'web/test/features/notes.test.tsx',
      'web/test/features/haftalik-ozet.test.tsx',
    ])
    run(join(BIN, 'prettier'), ['--check', 'shared/src', 'shared/test', 'web/src', 'web/test/features'])
  })

  it('ilgili testler geçer', () => {
    run(join(BIN, 'vitest'), ['run', 'test/entities.test.ts'], join(dir, 'shared'))
    run(
      join(BIN, 'vitest'),
      ['run', 'test/features/notes.test.tsx', 'test/features/haftalik-ozet.test.tsx', 'test/rules'],
      join(dir, 'web'),
    )
  })
})
