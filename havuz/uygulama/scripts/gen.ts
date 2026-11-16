/**
 * Üreteç: sık yapılan işin dosyalarını doğru yerlere kurar. Node'un yerel TypeScript desteğiyle çalışır.
 *
 *   npm run gen -- entity notes --etiket Not,Notlar     yeni varlık + web özelliği + rota + sözlük + testler
 *   npm run gen -- page raporlar --baslik Raporlar     yeni sayfa + rota + sözlük + test
 *   npm run gen -- migration ek_tablo                  api/migrations/ altına sıradaki numarayla boş dosya
 *
 * Sonra: `npm run check`. Ne üretildiğini ve sıradaki adımları ekrana yazar.
 * Genişletme: yeni üreteç türü → saf yardımcıyı gen/lib.ts'e, şablonu gen/templates.ts'e, komutu buraya.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import * as prettier from 'prettier'
import { lowerTr, slugifyTr } from '../shared/src/text.ts'
import {
  addMessages,
  addNamedImport,
  camelCase,
  COLLECTION_NAME,
  insertAfterLast,
  insertBeforeMarker,
  MIGRATION_NAME,
  nextMigrationNumber,
  PAGE_NAME,
  pascalCase,
  singularOf,
} from './gen/lib.ts'
import * as templates from './gen/templates.ts'

const ROOT = join(import.meta.dirname, '..')
const written: string[] = []

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`)
  process.exit(1)
}

async function format(file: string, text: string): Promise<string> {
  const options = (await prettier.resolveConfig(file)) ?? {}
  return prettier.format(text, { ...options, filepath: file })
}

async function writeNew(path: string, text: string): Promise<void> {
  const file = join(ROOT, path)
  if (existsSync(file)) fail(`${path} zaten var. Başka bir ad seçin ya da dosyayı silin.`)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, await format(file, text))
  written.push(`+ ${path}`)
}

async function edit(path: string, change: (text: string) => string): Promise<void> {
  const file = join(ROOT, path)
  writeFileSync(file, await format(file, change(readFileSync(file, 'utf8'))))
  written.push(`~ ${path}`)
}

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

async function generateEntity(collection: string, args: readonly string[]): Promise<void> {
  if (!COLLECTION_NAME.test(collection))
    fail(`Geçersiz ad "${collection}". Küçük harfle başlayan, İngilizce, çoğul bir ad verin: notes, contacts.`)
  const registry = readFileSync(join(ROOT, 'shared/src/entities/index.ts'), 'utf8')
  if (registry.includes(`  ${collection}:`)) fail(`"${collection}" zaten kayıtlı (shared/src/entities/index.ts).`)
  const singular = option(args, '--tekil') ?? singularOf(collection)
  const [labelSingular = pascalCase(singular), labelPlural = pascalCase(collection)] = (option(args, '--etiket') ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  const key = camelCase(collection)
  const names: templates.EntityNames = {
    collection,
    key,
    pascal: pascalCase(collection),
    entityVar: `${camelCase(singular)}Entity`,
    typeName: pascalCase(singular),
    path: `/${slugifyTr(labelPlural) || collection}`,
    labelSingular,
    labelPlural,
  }
  const page = `${names.pascal}Page`
  const editPage = `${names.pascal}EditPage`

  await writeNew(`shared/src/entities/${collection}.ts`, templates.entityFile(names))
  await edit('shared/src/entities/index.ts', (text) => {
    let next = insertAfterLast(
      text,
      /^import \{ \w+ \} from '\.\/\w+\.ts'$/,
      `import { ${names.entityVar} } from './${collection}.ts'`,
    )
    next = insertAfterLast(next, /^export \* from '\.\/\w+\.ts'$/, `export * from './${collection}.ts'`)
    return insertBeforeMarker(next, '// YENİ VARLIK BURAYA', [`${collection}: ${names.entityVar},`])
  })
  await edit('shared/test/entities.test.ts', (text) =>
    insertBeforeMarker(text, '// YENİ VARLIK BURAYA', [`${collection}: { title: 'Örnek' },`]),
  )
  await writeNew(`web/src/features/${collection}/${page}.tsx`, templates.listPage(names))
  await writeNew(`web/src/features/${collection}/${editPage}.tsx`, templates.editPage(names))
  await writeNew(`web/test/features/${collection}.test.tsx`, templates.entityTest(names))
  await edit('web/src/app/routes.tsx', (text) => {
    let next = addNamedImport(text, 'lucide-react', 'Blocks')
    next = insertBeforeMarker(next, '// YENİ SAYFA İÇE AKTARMASI BURAYA', [
      `import { ${editPage} } from '../features/${collection}/${editPage}.tsx'`,
      `import { ${page} } from '../features/${collection}/${page}.tsx'`,
    ])
    return insertBeforeMarker(next, '// YENİ ROTA BURAYA', [
      `{ path: '${names.path}', title: '${key}.title', element: <${page} />, nav: { icon: Blocks, order: 45 } },`,
      `{ path: '${names.path}/:id', title: '${key}.item', element: <${editPage} /> },`,
    ])
  })
  await edit('web/src/i18n/tr.json', (text) =>
    addMessages(text, {
      [`${key}.title`]: labelPlural,
      [`${key}.item`]: labelSingular,
      [`${key}.summary`]: '{count} kayıt',
      [`${key}.new`]: `Yeni ${lowerTr(labelSingular)}`,
      [`${key}.placeholder`]: "Başlık yazın ve Enter'a basın",
      [`${key}.search`]: 'Ara',
      [`${key}.empty.title`]: 'Henüz kayıt yok',
      [`${key}.empty.message`]: 'Yukarıdaki kutuya ilk kaydınızı yazın.',
      [`${key}.deleted`]: '“{title}” silindi.',
      [`${key}.menu`]: '“{title}” seçenekleri',
      [`${key}.notFound`]: 'Kayıt bulunamadı',
      [`${key}.form.title`]: 'Başlık',
      [`${key}.form.note`]: 'Not',
    }),
  )
  console.log(`\nSıradaki adımlar:
  1. Alanları düzenleyin: shared/src/entities/${collection}.ts (yeni alana .default(...) verin)
  2. Formu ve listeyi alanlara göre güncelleyin: web/src/features/${collection}/
  3. Metinleri gözden geçirin: web/src/i18n/tr.json (${key}.*)
  4. Denetleyin: npm run check
  Sunucuda tablo/migrasyon GEREKMEZ: varlıklar tek records tablosunda durur.`)
}

async function generatePage(name: string, args: readonly string[]): Promise<void> {
  if (!PAGE_NAME.test(name)) fail(`Geçersiz ad "${name}". Küçük harf, rakam ve tire kullanın: raporlar, haftalik-ozet.`)
  const key = camelCase(name)
  const names: templates.PageNames = {
    name,
    key,
    pascal: pascalCase(name),
    title: option(args, '--baslik') ?? pascalCase(name),
  }
  const page = `${names.pascal}Page`
  await writeNew(`web/src/features/${name}/${page}.tsx`, templates.simplePage(names))
  await writeNew(`web/test/features/${name}.test.tsx`, templates.simplePageTest(names))
  await edit('web/src/app/routes.tsx', (text) => {
    let next = addNamedImport(text, 'lucide-react', 'Blocks')
    next = insertBeforeMarker(next, '// YENİ SAYFA İÇE AKTARMASI BURAYA', [
      `import { ${page} } from '../features/${name}/${page}.tsx'`,
    ])
    return insertBeforeMarker(next, '// YENİ ROTA BURAYA', [
      `{ path: '/${name}', title: '${key}.title', element: <${page} />, nav: { icon: Blocks, order: 55 } },`,
    ])
  })
  await edit('web/src/i18n/tr.json', (text) =>
    addMessages(text, {
      [`${key}.title`]: names.title,
      [`${key}.description`]: 'Bu sayfanın ne işe yaradığını yazın.',
    }),
  )
  console.log(`\nSıradaki adımlar: içeriği web/src/features/${name}/${page}.tsx dosyasına yazın, metinleri tr.json'da
  (${key}.*) düzenleyin, sonra npm run check.`)
}

async function generateMigration(name: string): Promise<void> {
  if (!MIGRATION_NAME.test(name)) fail(`Geçersiz ad "${name}". Küçük harf, rakam ve alt çizgi kullanın: ek_tablo.`)
  const dir = join(ROOT, 'api', 'migrations')
  if (!existsSync(dir)) fail('api/migrations klasörü yok. Bu temel API olmadan kopyalanmış olabilir.')
  const number = nextMigrationNumber(readdirSync(dir))
  const path = `api/migrations/${number}_${name}.sql`
  if (existsSync(join(ROOT, path))) fail(`${path} zaten var.`)
  writeFileSync(join(ROOT, path), templates.migrationFile(number, name))
  written.push(`+ ${path}`)
  console.log(
    '\nSıradaki adım: SQL komutlarını yazın; API açılışta sıradaki migrasyonları kendisi uygular (api/TARIFLER.md).',
  )
}

const USAGE = `Kullanım:
  npm run gen -- entity <koleksiyon> [--etiket Tekil,Çoğul] [--tekil <tekil-ad>]
  npm run gen -- page <ad> [--baslik "Görünen ad"]
  npm run gen -- migration <ad>`

const [kind, name, ...rest] = process.argv.slice(2)
if (!kind || !name) fail(USAGE)
if (kind === 'entity') await generateEntity(name, rest)
else if (kind === 'page') await generatePage(name, rest)
else if (kind === 'migration') await generateMigration(name)
else fail(`Bilinmeyen tür "${kind}".\n${USAGE}`)

console.log(
  `\nÜretilenler (${relative(process.cwd(), ROOT) || '.'}):\n${written.map((line) => `  ${line}`).join('\n')}`,
)
