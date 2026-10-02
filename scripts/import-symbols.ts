/**
 * İçerik dosyalarında kullanılan Mulberry sembollerini public/symbols/ altına kopyalar.
 *
 * Kullanım:
 *   git clone --depth 1 https://github.com/mulberrysymbols/mulberry-symbols.git /tmp/mulberry
 *   MULBERRY_DIR=/tmp/mulberry npm run symbols
 *
 * Dosya adları sadeleştirilir: "help_,_to.svg" → "help_to.svg".
 * Semboller değiştirilmeden kopyalanır (CC BY-SA 4.0, atıf "Hakkında" ekranında).
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const mulberryDir = process.env.MULBERRY_DIR
if (!mulberryDir) {
  console.error('MULBERRY_DIR ortam değişkenini Mulberry deposunun yoluna ayarlayın.')
  process.exit(1)
}

export function sanitizeSymbolName(file: string): string {
  return file.replace(/,/g, '').replace(/_+/g, '_').replace(/_\./g, '.')
}

function collectSymbolRefs(): Set<string> {
  const refs = new Set<string>()
  const files = [
    join(root, 'content/categories.json'),
    join(root, 'content/templates.json'),
    join(root, 'content/quick.json'),
    join(root, 'content/journey.json'),
    ...readdirSync(join(root, 'content/vocabulary')).map((f) => join(root, 'content/vocabulary', f)),
  ]
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/"symbols\/([^"]+\.svg)"/g)) refs.add(match[1]!)
  }
  return refs
}

const sourceDir = join(mulberryDir, 'EN')
const bySanitized = new Map<string, string>()
for (const file of readdirSync(sourceDir)) bySanitized.set(sanitizeSymbolName(file), file)

const target = join(root, 'public/symbols')
mkdirSync(target, { recursive: true })

const missing: string[] = []
let copied = 0
for (const name of collectSymbolRefs()) {
  const source = bySanitized.get(name)
  if (!source) {
    missing.push(name)
    continue
  }
  if (!existsSync(join(target, name))) copied++
  copyFileSync(join(sourceDir, source), join(target, name))
}

console.log(`${copied} yeni sembol kopyalandı.`)
if (missing.length) {
  console.error(`Bulunamayan semboller: ${missing.join(', ')}`)
  process.exit(1)
}
