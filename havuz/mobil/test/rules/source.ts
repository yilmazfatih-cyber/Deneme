/**
 * Kural testlerinin ortak yardımcıları: kaynak dosyaları listeler ve TypeScript ayrıştırıcısıyla gezer.
 * Kaynak: uygulama/web/test/rules/source.ts.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'

export const ROOT = join(__dirname, '..', '..')
export const SRC = join(ROOT, 'src')

/** Klasördeki bütün dosyalar (alt klasörler dahil). Klasör yoksa boş liste. */
export function listFiles(dir: string, extensions: readonly string[]): string[] {
  const out: string[] = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...listFiles(full, extensions))
    else if (extensions.some((extension) => entry.endsWith(extension))) out.push(full)
  }
  return out.toSorted()
}

/** Temel köküne göre yol (`src/ui/Button.tsx`), her işletim sisteminde `/` ile. */
export function rel(file: string): string {
  return relative(ROOT, file).split('\\').join('/')
}

export function read(file: string): string {
  return readFileSync(file, 'utf8')
}

export function parseText(name: string, text: string): ts.SourceFile {
  const kind = name.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  return ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, kind)
}

export function parse(file: string): ts.SourceFile {
  return parseText(file, read(file))
}

/** Ağaçtaki her düğüm için `visit` çağrılır. */
export function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node)
  node.forEachChild((child) => walk(child, visit))
}

export function lineOf(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
}

export { ts }

/** Sorun listesi boş değilse düzeltme yolunu söyleyen bir hatayla testi düşürür. */
export function expectNone(problems: readonly string[], fix: string): void {
  if (problems.length > 0) throw new Error(`${fix}\n${problems.map((problem) => `  - ${problem}`).join('\n')}`)
}
