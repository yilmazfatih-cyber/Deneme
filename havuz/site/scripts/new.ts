/**
 * İçerik üreteci: doğru klasörde, doğru ön bilgiyle yeni dosya açar. Türkçe başlıktan ASCII dosya adı üretir.
 *
 *   npm run new -- blog "Kış kampanyası için beş fikir"     → src/content/blog/tr/kis-kampanyasi-icin-bes-fikir.md
 *   npm run new -- belge "Randevu kuralları"                 → src/content/belgeler/tr/randevu-kurallari.md
 *   npm run new -- sayfa "Kariyer"                           → src/content/sayfalar/tr/kariyer.md
 *
 * Seçenekler: --dil en (başka dil) · --mdx (MDX dosyası) · --grup "Ad" (belge grubu) · --kok <klasör> (testler için)
 * Yeni dosyalar taslaktır (draft: true): yalnız `npm run dev` sırasında görünür.
 * Genişletme: yeni bir içerik türü → KINDS tablosuna ekleyin ve tests/unit/new.test.ts'e örnek yazın.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'
import { PLACEHOLDER_DESCRIPTION } from '../src/lib/content-schemas.ts'
import { paths, RESERVED_SLUGS } from '../src/lib/routes.ts'
import { slugify } from '../src/lib/slug.ts'
import { defaultLocale, locales, type Locale } from '../src/site.config.ts'

export type Kind = 'blog' | 'belge' | 'sayfa'

/** Başlık uzunluk sınırları içerik şemalarıyla aynıdır (src/lib/content-schemas.ts). */
const KINDS: Record<Kind, { folder: string; label: string; min: number; max: number }> = {
  blog: { folder: 'blog', label: 'Blog yazısı', min: 10, max: 70 },
  belge: { folder: 'belgeler', label: 'Belge', min: 3, max: 70 },
  sayfa: { folder: 'sayfalar', label: 'Sayfa', min: 3, max: 70 },
}

export const USAGE = `Kullanım:
  npm run new -- blog "Yazının başlığı"
  npm run new -- belge "Belgenin başlığı" [--grup "Grup adı"]
  npm run new -- sayfa "Sayfanın adı"
Seçenekler: --dil ${locales.join('|')} (varsayılan ${defaultLocale}) · --mdx`

export interface Request {
  kind: Kind
  title: string
  locale: Locale
  mdx: boolean
  group?: string | undefined
  root: string
}

/** Komut satırı argümanlarını çözer; hatalıysa kullanım bilgisiyle birlikte hata verir. */
export function parseArgs(argv: string[], cwd: string): Request {
  const positional: string[] = []
  const options = new Map<string, string | true>()
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index] ?? ''
    if (arg === '--mdx') options.set('mdx', true)
    else if (arg.startsWith('--')) {
      options.set(arg.slice(2), argv[index + 1] ?? '')
      index++
    } else positional.push(arg)
  }
  const [kind, ...titleParts] = positional
  if (kind !== 'blog' && kind !== 'belge' && kind !== 'sayfa') {
    throw new Error(`İçerik türü "blog", "belge" ya da "sayfa" olmalı (verilen: "${kind ?? ''}").\n${USAGE}`)
  }
  const title = titleParts.join(' ').trim()
  if (title === '') throw new Error(`Başlık eksik.\n${USAGE}`)
  const lang = options.get('dil') ?? defaultLocale
  const locale = locales.find((candidate) => candidate === lang)
  if (locale === undefined)
    throw new Error(`Bilinmeyen dil: "${String(lang)}". Kullanılabilen diller: ${locales.join(', ')}.`)
  const group = options.get('grup')
  const root = options.get('kok')
  return {
    kind,
    title,
    locale,
    mdx: options.get('mdx') === true,
    group: typeof group === 'string' && group !== '' ? group : undefined,
    root: typeof root === 'string' && root !== '' ? path.resolve(cwd, root) : cwd,
  }
}

/** YAML tek tırnaklı metin (iki nokta, # gibi işaretler güvenle yazılır). */
const quote = (value: string) => `'${value.replace(/'/gu, "''")}'`

/** Yerel saate göre YYYY-AA-GG. */
export function localDate(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Klasördeki belgelerin en büyük `order` değeri ve o belgenin grubu. */
export function lastDoc(folder: string): { order: number; group: string } | undefined {
  if (!existsSync(folder)) return undefined
  let last: { order: number; group: string } | undefined
  for (const name of readdirSync(folder)) {
    if (!/\.mdx?$/u.test(name)) continue
    const match = /^---\n([\s\S]*?)\n---/u.exec(readFileSync(path.join(folder, name), 'utf8'))
    const data = match?.[1] ? (parseYaml(match[1]) as { order?: unknown; group?: unknown }) : {}
    if (typeof data.order === 'number' && (last === undefined || data.order > last.order)) {
      last = { order: data.order, group: typeof data.group === 'string' ? data.group : 'Genel' }
    }
  }
  return last
}

/** Dosyanın içeriği (ön bilgi + yer tutucu gövde). */
export function render(request: Request, now: Date, doc?: { order: number; group: string }): string {
  const lines = ['---', `title: ${quote(request.title)}`, `description: ${quote(PLACEHOLDER_DESCRIPTION)}`]
  if (request.kind === 'blog') lines.push(`date: ${localDate(now)}`, 'tags: []')
  if (request.kind === 'belge') lines.push(`group: ${quote(doc?.group ?? 'Genel')}`, `order: ${doc?.order ?? 10}`)
  lines.push('draft: true', '---', '')
  lines.push(
    'YAZIN: Giriş paragrafı. Bu sayfanın ne anlattığını ve okurun ne kazanacağını iki üç cümleyle söyleyin.',
    '',
    '## İlk bölüm',
    '',
    'YAZIN: Bölümün metni. Alt başlıklar için "##" ve "###" kullanın.',
    '',
  )
  return lines.join('\n')
}

export interface Created {
  file: string
  url: string
}

/** Dosyayı oluşturur. Var olan dosyanın üstüne yazmaz; ayrılmış adları reddeder. */
export function createContent(request: Request, now: Date): Created {
  const kind = KINDS[request.kind]
  const titleLength = [...request.title].length
  if (titleLength < kind.min || titleLength > kind.max) {
    throw new Error(`${kind.label} başlığı ${kind.min}–${kind.max} karakter olmalı (şu an ${titleLength}).`)
  }
  const slug = slugify(request.title)
  if (slug === '')
    throw new Error(`"${request.title}" başlığından dosya adı üretilemedi. Başlıkta en az bir harf ya da rakam olsun.`)
  if (RESERVED_SLUGS.has(slug)) {
    throw new Error(
      `"${slug}" adı sitenin kendi bölümlerinden birine ayrılmış. Başlığı değiştirin (ayrılmış adlar: src/lib/routes.ts).`,
    )
  }
  if (request.kind === 'blog' && /^\d+$/u.test(slug)) {
    throw new Error(
      `Yalnız rakamdan oluşan yazı adı ("${slug}") blog sayfa numaralarıyla çakışır. Başlığa bir sözcük ekleyin.`,
    )
  }
  const folder = path.join(request.root, 'src', 'content', kind.folder, request.locale)
  const file = path.join(folder, `${slug}.${request.mdx ? 'mdx' : 'md'}`)
  const sibling = path.join(folder, `${slug}.${request.mdx ? 'md' : 'mdx'}`)
  if (existsSync(file) || existsSync(sibling)) {
    throw new Error(
      `Bu adla bir dosya zaten var: ${path.relative(request.root, existsSync(file) ? file : sibling)}. Başka bir başlık seçin.`,
    )
  }
  const previous = request.kind === 'belge' ? lastDoc(folder) : undefined
  const doc =
    request.kind === 'belge'
      ? { order: (previous?.order ?? 0) + 10, group: request.group ?? previous?.group ?? 'Genel' }
      : undefined
  mkdirSync(folder, { recursive: true })
  writeFileSync(file, render(request, now, doc), 'utf8')
  const url =
    request.kind === 'blog'
      ? paths.post(request.locale, slug)
      : request.kind === 'belge'
        ? paths.doc(request.locale, slug)
        : paths.page(request.locale, slug)
  return { file: path.relative(request.root, file), url }
}

if (import.meta.main) {
  try {
    const request = parseArgs(process.argv.slice(2), process.cwd())
    const created = createContent(request, new Date())
    console.log(`✓ ${KINDS[request.kind].label} oluşturuldu: ${created.file}`)
    console.log(`  Adres: ${created.url} (taslak: yalnız "npm run dev" sırasında görünür)`)
    console.log('  Sonraki adımlar:')
    console.log('   1. Dosyayı açın; açıklamayı (description) ve "YAZIN:" ile başlayan yerleri doldurun.')
    if (request.kind === 'sayfa')
      console.log('   2. Menüde görünmesi için src/site.config.ts → nav ya da footer listesine bağlantı ekleyin.')
    console.log(
      `   ${request.kind === 'sayfa' ? 3 : 2}. Yayına hazır olunca "draft: true" satırını silin, sonra: npm run check`,
    )
  } catch (error) {
    console.error(`✗ ${(error as Error).message}`)
    process.exit(1)
  }
}
