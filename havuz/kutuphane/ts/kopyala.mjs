#!/usr/bin/env node
// kopyala — bir modülü (ve testini, ortak vektör dosyasını, varsa bağımlı olduğu dosyayı) başka bir projeye kopyalar.
//
// Kullanım (ts/ klasöründen):
//   node kopyala.mjs turkce ../../projem/src/lib            # turkce.ts + turkce.test.ts + vektorler/turkce.json
//   node kopyala.mjs para ../../projem/src/lib --uzantisiz  # testte import yolunu ".ts" uzantısız yazar
//   node kopyala.mjs csv ./hedef --test-yok --uzerine-yaz   # yalnız modül; varsa üzerine yazar
//
// Test dosyası vitest ile çalışır ve vektörü yanındaki vektorler/ klasöründen okur.
// Genişletme: Yeni bir seçenek `parseArgs` içine eklenir ve yardım metnine yazılır.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const HELP = `Kullanım: node kopyala.mjs <modul> <hedef-klasor> [--uzantisiz] [--test-yok] [--uzerine-yaz]

  <modul>          src/ altındaki dosya adı (uzantısız), ör. turkce, para, csv
  <hedef-klasor>   kopyanın yazılacağı klasör (yoksa oluşturulur)
  --uzantisiz      testteki import yolunu ".ts" uzantısız yazar (allowImportingTsExtensions kapalı projeler için)
  --test-yok       testi ve vektörü kopyalamaz
  --uzerine-yaz    hedefte aynı adlı dosya varsa üzerine yazar`

function parseArgs(argv) {
  const flags = new Set(argv.filter((arg) => arg.startsWith('--')))
  const positional = argv.filter((arg) => !arg.startsWith('--'))
  const known = new Set(['--uzantisiz', '--test-yok', '--uzerine-yaz', '--yardim', '--help'])
  for (const flag of flags) if (!known.has(flag)) throw new Error(`Bilinmeyen seçenek: ${flag}\n\n${HELP}`)
  if (flags.has('--yardim') || flags.has('--help') || positional.length !== 2) throw new Error(HELP)
  return {
    module: positional[0],
    target: resolve(positional[1]),
    noExtension: flags.has('--uzantisiz'),
    withTest: !flags.has('--test-yok'),
    overwrite: flags.has('--uzerine-yaz'),
  }
}

/** Modülün içe aktardığı yerel dosyalar (./x.ts); kütüphanede normalde hiç yoktur. */
function localDependencies(source) {
  return [...source.matchAll(/from\s+['"]\.\/([\w-]+)\.ts['"]/g)].map((match) => match[1])
}

function write(path, content, overwrite) {
  if (existsSync(path) && !overwrite) {
    throw new Error(`${path} zaten var. Üzerine yazmak için --uzerine-yaz ekleyin.`)
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

export function copyModule({ module, target, noExtension = false, withTest = true, overwrite = false }) {
  const source = join(HERE, 'src', `${module}.ts`)
  if (!/^[a-z_]+$/.test(module) || !existsSync(source)) {
    throw new Error(`"${module}" diye bir modül yok. Var olanlar için: ls ${join(HERE, 'src')}`)
  }
  const copied = []
  const queue = [module]
  const seen = new Set()
  while (queue.length > 0) {
    const name = queue.shift()
    if (seen.has(name)) continue
    seen.add(name)
    const text = readFileSync(join(HERE, 'src', `${name}.ts`), 'utf8')
    write(join(target, `${name}.ts`), text, overwrite)
    copied.push(`${name}.ts`)
    queue.push(...localDependencies(text))
  }
  if (withTest) {
    const testPath = join(HERE, 'test', `${module}.test.ts`)
    const suffix = noExtension ? '' : '.ts'
    const test = readFileSync(testPath, 'utf8').replace(/(['"])\.\.\/src\/([\w-]+)\.ts\1/g, `$1./$2${suffix}$1`)
    write(join(target, `${module}.test.ts`), test, overwrite)
    copied.push(`${module}.test.ts`)
    const vector = join(HERE, '..', 'vektorler', `${module}.json`)
    if (existsSync(vector)) {
      mkdirSync(join(target, 'vektorler'), { recursive: true })
      const destination = join(target, 'vektorler', `${module}.json`)
      if (existsSync(destination) && !overwrite) throw new Error(`${destination} zaten var. --uzerine-yaz ekleyin.`)
      copyFileSync(vector, destination)
      copied.push(`vektorler/${module}.json`)
    }
  }
  return copied
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2))
    const copied = copyModule(options)
    console.log(`Kopyalandı → ${options.target}`)
    for (const file of copied) console.log(`  ${file}`)
    if (options.withTest) console.log('Test için hedef projede vitest gerekir: npx vitest run')
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
