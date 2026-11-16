/**
 * Üreteç testi için çalışma alanının geçici bir kopyasını kurar: kaynaklar kopyalanır, node_modules ise
 * asıl kurulumun girdilerine bağlantı (symlink) olarak verilir; yalnız @uygulama/* paketleri KOPYAYI gösterir
 * (yoksa üretilen varlık asıl shared paketinde aranırdı).
 */
import { cpSync, mkdirSync, mkdtempSync, readdirSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const ROOT = join(import.meta.dirname, '..', '..')

const SKIP = new Set(['node_modules', 'dist', 'dist-yerel', 'dev-dist', '.data', 'test-results', 'playwright-report'])

export function makeWorkspaceCopy(): string {
  const target = mkdtempSync(join(tmpdir(), 'uygulama-uretec-'))
  const filter = (source: string) => !SKIP.has(source.split(/[\\/]/).at(-1) ?? '')
  for (const entry of [
    'shared',
    'web',
    'scripts',
    'eslint.config.js',
    'tsconfig.base.json',
    'package.json',
    '.prettierrc.json',
    '.prettierignore',
  ]) {
    cpSync(join(ROOT, entry), join(target, entry), { recursive: true, filter })
  }
  mkdirSync(join(target, 'api', 'migrations'), { recursive: true })
  cpSync(join(ROOT, 'api', 'migrations'), join(target, 'api', 'migrations'), { recursive: true })
  const modules = join(target, 'node_modules')
  mkdirSync(join(modules, '@uygulama'), { recursive: true })
  for (const entry of readdirSync(join(ROOT, 'node_modules'))) {
    if (entry === '@uygulama') continue
    symlinkSync(join(ROOT, 'node_modules', entry), join(modules, entry))
  }
  for (const pkg of ['shared', 'web']) symlinkSync(join(target, pkg), join(modules, '@uygulama', pkg))
  return target
}
