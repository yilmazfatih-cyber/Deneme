/**
 * Kural testlerinin ortak yardımcıları: dosya listeleme ve ön bilgi okuma.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'

export const ROOT = path.resolve(import.meta.dirname, '..', '..')

/** Klasördeki bütün dosyalar (proje köküne göre göreli, "/" ayraçlı). */
export function listFiles(folder: string, filter: (file: string) => boolean = () => true): string[] {
  const absolute = path.join(ROOT, folder)
  return readdirSync(absolute, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(ROOT, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .filter(filter)
    .sort()
}

export const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8')

/** Markdown dosyasının ön bilgisi ve gövdesi. */
export function frontmatter(file: string): { data: Record<string, unknown>; body: string } {
  const text = read(file)
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/u.exec(text)
  if (!match) throw new Error(`${file}: ön bilgi (--- … ---) bulunamadı.`)
  return { data: (parseYaml(match[1] ?? '') ?? {}) as Record<string, unknown>, body: match[2] ?? '' }
}
