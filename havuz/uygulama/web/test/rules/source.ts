/**
 * Kural testlerinin ortak yardımcıları: kaynak dosyaları listeler ve TypeScript ayrıştırıcısıyla gezer.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'

export const WEB_ROOT = join(import.meta.dirname, '..', '..')
export const SRC = join(WEB_ROOT, 'src')

/** Klasördeki bütün dosyalar (alt klasörler dahil), `web/`e göre yolla. */
export function listFiles(dir: string, extensions: readonly string[]): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...listFiles(full, extensions))
    else if (extensions.some((extension) => entry.endsWith(extension))) out.push(full)
  }
  return out.toSorted()
}

export function rel(file: string): string {
  return relative(WEB_ROOT, file)
}

export function read(file: string): string {
  return readFileSync(file, 'utf8')
}

export function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    read(file),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
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
