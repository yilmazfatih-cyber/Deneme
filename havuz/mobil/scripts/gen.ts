/**
 * Üreteç: sık yinelenen işi dosya dosya kurar; sonra boşlukları siz doldurursunuz.
 *
 *   npm run gen -- entity <koleksiyon> [--etiket Tekil,Çoğul] [--alan <görünen alan>] [--simge <Ionicons adı>]
 *       Ortak sözleşmede (shared/) TANIMLI bir varlık için mobil özellik iskeleti: liste ekranı (sekme), ayrıntı
 *       ekranı, etiketler, rotalar, sözlük satırları, test. Şemanın kendisi havuz/uygulama'da tanımlanır
 *       (bkz. AGENTS.md → "Yeni veri türü"); buradaki kopya `npm run shared:sync` ile gelir.
 *   npm run gen -- screen <ad> --baslik "Başlık" [--sekme]
 *       Düz ekran: src/features/<ad>/<Ad>Screen.tsx + rota (+ sekme) + sözlük + test.
 *
 * Var olan dosyanın ÜZERİNE YAZMAZ (durur ve söyler). Sonra: npm run check.
 * Genişletme: yeni bir üretim türü → aşağıya bir işlev + `main` içinde dal; şablonlar scripts/gen/ içinde.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { format, resolveConfig } from 'prettier'
import { editScreen } from './gen/editTemplate.ts'
import { entityTest, plainScreen, plainScreenTest, routeFile } from './gen/extraTemplates.ts'
import { loadFields, namesOf, pickDisplayField, type Field, type Names } from './gen/model.ts'
import { labelsFile, listScreen } from './gen/templates.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

/** Yeni dosya yazar (Prettier'dan geçirerek); dosya varsa durur. */
async function write(path: string, content: string): Promise<void> {
  const full = join(ROOT, path)
  if (existsSync(full))
    throw new Error(`${path} zaten var; üzerine yazılmadı. Başka bir ad seçin ya da dosyayı elle düzenleyin.`)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, await format(content, { ...(await resolveConfig(full)), filepath: full }))
  console.log(`  + ${path}`)
}

/** Sözlüğe yeni anahtarları ekler (var olanlara dokunmaz). */
function addMessages(entries: Record<string, string>): void {
  const path = join(ROOT, 'src', 'i18n', 'tr.json')
  const messages = JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>
  for (const [key, value] of Object.entries(entries)) if (!Object.hasOwn(messages, key)) messages[key] = value
  writeFileSync(path, `${JSON.stringify(messages, null, 2)}\n`)
  console.log(`  ~ src/i18n/tr.json (${Object.keys(entries).length} anahtar)`)
}

/** Alt sekmelere satır ekler (src/navigation/TabsLayout.tsx → TABS, işaretli satırın üstüne). */
function addTab(names: Names, icon: string): void {
  const path = join(ROOT, 'src', 'navigation', 'TabsLayout.tsx')
  const marker = '  // YENİ SEKME BURAYA'
  const source = readFileSync(path, 'utf8')
  if (!source.includes(marker)) throw new Error(`${path} içinde "${marker.trim()}" satırı yok; sekmeyi elle ekleyin.`)
  const line = `  { name: '${names.key}', title: '${names.key}.title', icon: '${icon}' },\n`
  writeFileSync(path, source.replace(marker, `${line}${marker}`))
  console.log('  ~ src/navigation/TabsLayout.tsx (sekme)')
}

async function screen(args: string[]): Promise<void> {
  const names = namesOf(args[0] ?? '')
  const title = option(args, '--baslik')
  if (!title) throw new Error('Başlık gerekli: npm run gen -- screen raporlar --baslik "Raporlar"')
  const tab = args.includes('--sekme')
  await write(`src/features/${names.key}/${names.pascal}Screen.tsx`, plainScreen(names))
  const route = tab ? `src/app/(app)/(tabs)/${names.key}.tsx` : `src/app/(app)/${names.key}.tsx`
  const up = tab ? '../../../' : '../../'
  await write(
    route,
    routeFile(
      `/${names.key} → src/features/${names.key}/${names.pascal}Screen.tsx`,
      `${names.pascal}Screen`,
      `${up}features/${names.key}/${names.pascal}Screen.tsx`,
    ),
  )
  await write(`test/features/${names.key}.test.tsx`, plainScreenTest(names, title))
  addMessages({ [`${names.key}.title`]: title, [`${names.key}.description`]: `${title} ekranı.` })
  if (tab) addTab(names, option(args, '--simge') ?? 'list-outline')
}

function entityMessages(names: Names, fields: readonly Field[], singular: string, plural: string) {
  const messages: Record<string, string> = {
    [`${names.key}.title`]: plural,
    [`${names.key}.new`]: `Yeni: ${singular}`,
    [`${names.key}.create`]: 'Ekle',
    [`${names.key}.openHint`]: 'Ayrıntıları açar.',
    [`${names.key}.empty.title`]: 'Henüz kayıt yok',
    [`${names.key}.empty.message`]: 'Yukarıdaki kutuya ilk kaydı yazın.',
    [`${names.key}.edit.title`]: `${singular} ayrıntısı`,
    [`${names.key}.delete`]: '“{name}” kaydını sil',
    [`${names.key}.deleted`]: '“{name}” silindi.',
    [`${names.key}.notFound.title`]: 'Kayıt bulunamadı',
    [`${names.key}.notFound.message`]: 'Kayıt başka bir cihazda silinmiş olabilir.',
    [`${names.key}.back`]: `${plural} listesine dön`,
  }
  for (const field of fields) {
    if (field.type.kind === 'other') continue
    messages[`${names.key}.field.${field.name}`] = field.name
    if (field.type.kind === 'enum') {
      for (const value of field.type.options) messages[`${names.key}.${field.name}.${value}`] = value
    }
  }
  return messages
}

async function entity(args: string[]): Promise<void> {
  const names = namesOf(args[0] ?? '')
  const fields = await loadFields(ROOT, names.key)
  const display = pickDisplayField(fields, option(args, '--alan'))
  const [singular = names.pascal, plural = names.pascal] = (option(args, '--etiket') ?? '').split(',').filter(Boolean)
  const base = `src/features/${names.key}`
  await write(`${base}/labels.ts`, labelsFile(names, fields))
  await write(`${base}/${names.pascal}Screen.tsx`, listScreen(names, display))
  await write(`${base}/${names.pascal}EditScreen.tsx`, editScreen(names, fields, display))
  await write(
    `src/app/(app)/(tabs)/${names.key}.tsx`,
    routeFile(
      `/${names.key} → ${base}/${names.pascal}Screen.tsx`,
      `${names.pascal}Screen`,
      `../../../features/${names.key}/${names.pascal}Screen.tsx`,
    ),
  )
  await write(
    `src/app/(app)/${names.key}/[id].tsx`,
    routeFile(
      `/${names.key}/<kimlik> → ${base}/${names.pascal}EditScreen.tsx`,
      `${names.pascal}EditScreen`,
      `../../../features/${names.key}/${names.pascal}EditScreen.tsx`,
    ),
  )
  await write(`test/features/${names.key}.test.tsx`, entityTest(names, `Örnek ${singular}`))
  addMessages(entityMessages(names, fields, singular, plural))
  addTab(names, option(args, '--simge') ?? 'list-outline')
  console.log(
    '\nSözlükteki alan adlarını (…field.*) ve seçenekleri Türkçeleştirin: src/i18n/tr.json. Sonra: npm run check',
  )
}

async function main(): Promise<void> {
  const [kind, ...rest] = process.argv.slice(2)
  if (kind === 'entity') await entity(rest)
  else if (kind === 'screen') await screen(rest)
  else {
    console.log(
      'Kullanım:\n  npm run gen -- entity <koleksiyon> [--etiket Tekil,Çoğul] [--alan <ad>]\n  npm run gen -- screen <ad> --baslik "Başlık" [--sekme]',
    )
    process.exitCode = kind ? 1 : 0
  }
}

main().catch((error: unknown) => {
  console.error(`\nÜretilemedi: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
