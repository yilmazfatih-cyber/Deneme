// Komut satırı: `node src/paketleyici/cli.ts giris.js -o cikti.js [--format iife|cjs|esm] [--name Ad]
// [--map] [--no-shake]`. Dosyaları node:fs ile okur; sonuçta Türkçe bir özet yazar.
// Genişletme: izleme kipi (--watch) için `fs.watch` ile değişen dosyada paketi yeniden kurun.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bundle } from './bundle.ts'
import type { Format } from './emit.ts'

const USAGE =
  'Kullanım: node src/paketleyici/cli.ts <giris.js> [-o cikti.js] [--format iife|cjs|esm] [--name Ad] [--map] [--no-shake]'

function main(argv: string[]): number {
  const args = [...argv]
  const entry = args.shift()
  if (!entry || entry === '--help') {
    console.log(USAGE)
    return entry ? 0 : 1
  }
  let out: string | undefined
  let format: Format = 'iife'
  let name: string | undefined
  let map = false
  let treeShake = true
  while (args.length > 0) {
    const flag = args.shift()
    if (flag === '-o') out = args.shift()
    else if (flag === '--format') format = args.shift() as Format
    else if (flag === '--name') name = args.shift()
    else if (flag === '--map') map = true
    else if (flag === '--no-shake') treeShake = false
    else {
      console.error(`Bilinmeyen seçenek: ${flag}\n${USAGE}`)
      return 1
    }
  }
  if (!['iife', 'cjs', 'esm'].includes(format)) {
    console.error(`Geçersiz biçim "${format}": iife, cjs ya da esm olmalı.`)
    return 1
  }
  const fs = { readFile: (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : undefined) }
  const result = bundle({ entry: resolve(entry), fs, format, name, treeShake, sourceMap: map, outFile: out })
  if (out) {
    writeFileSync(out, result.code + (map && result.map ? `//# sourceMappingURL=${out.split('/').pop()}.map\n` : ''))
    if (map && result.map) writeFileSync(`${out}.map`, JSON.stringify(result.map))
    console.log(
      `Paket yazıldı: ${out} (${result.included.length} modül, ${result.stats.kept}/${result.stats.statements} deyim tutuldu)`,
    )
  } else process.stdout.write(result.code)
  if (result.removed.length > 0) console.error(`Kullanılmadığı için atılan modüller: ${result.removed.join(', ')}`)
  for (const cycle of result.cycles) console.error(`Uyarı — döngüsel bağımlılık: ${cycle.join(' → ')}`)
  return 0
}

process.exitCode = main(process.argv.slice(2))
