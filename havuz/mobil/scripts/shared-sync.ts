/**
 * Ortak sözleşmeyi (havuz/uygulama/shared/src) bu temelin `shared/` klasörüne KOPYALAR.
 * Kopya elle değiştirilmez; her dosyanın ilk satırı kaynağı ve kopyalanma tarihini söyler.
 * `shared/KAYNAK.json` her dosyanın içerik özetini (sha256) tutar: kural testi (test/rules/shared-copy.test.ts)
 * kopyanın elle değiştirilmediğini ve (havuz içindeyken) kaynakla aynı olduğunu denetler.
 *
 * Kullanım:  npm run shared:sync                      (kaynak: ../uygulama/shared/src)
 *            npm run shared:sync -- --kaynak /yol/shared/src
 * Genişletme: kopyalanmayacak bir dosya gerekirse HARIC listesine ekleyin ve nedenini docs/KARARLAR.md'ye yazın.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEST = join(ROOT, 'shared')
const SOURCE_LABEL = 'havuz/uygulama/shared/src'
const HARIC = new Set<string>()

export const HEADER_PREFIX = '// KOPYA — elle değiştirmeyin.'

export function headerLine(rel: string, date: string): string {
  return `${HEADER_PREFIX} Kaynak: ${SOURCE_LABEL}/${rel} · Kopyalanma: ${date} · Yenile: npm run shared:sync`
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** Klasördeki .ts dosyalarının göreli yolları (alfabetik, `/` ayraçlı). */
export function listTs(dir: string): string[] {
  const out: string[] = []
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.ts')) out.push(relative(dir, full).split('\\').join('/'))
    }
  }
  walk(dir)
  return out.toSorted()
}

function parseArgs(argv: string[]): string {
  const index = argv.indexOf('--kaynak')
  const given = index >= 0 ? argv[index + 1] : undefined
  return given ? resolve(given) : resolve(ROOT, '../uygulama/shared/src')
}

function main(): void {
  const source = parseArgs(process.argv.slice(2))
  if (!existsSync(source)) {
    console.error(
      `Kaynak bulunamadı: ${source}\nHavuz dışındaysanız: npm run shared:sync -- --kaynak <uygulama>/shared/src`,
    )
    process.exit(1)
  }
  const date = new Date().toISOString().slice(0, 10)
  const files = listTs(source).filter((rel) => !HARIC.has(rel))
  const hashes: Record<string, string> = {}
  for (const old of existsSync(DEST) ? listTs(DEST) : []) {
    if (!files.includes(old)) rmSync(join(DEST, old))
  }
  for (const rel of files) {
    const content = readFileSync(join(source, rel), 'utf8')
    hashes[rel] = sha256(content)
    mkdirSync(dirname(join(DEST, rel)), { recursive: true })
    writeFileSync(join(DEST, rel), `${headerLine(rel, date)}\n${content}`)
  }
  const manifest = { kaynak: SOURCE_LABEL, kopyalanma: date, dosyalar: hashes }
  writeFileSync(join(DEST, 'KAYNAK.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`${files.length} dosya kopyalandı → shared/ (${date}). Şimdi: npm run check`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
