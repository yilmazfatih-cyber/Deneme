/**
 * Üretecin saf yardımcıları: ad doğrulama ve türetme, kayıt dosyalarına işaretin ÖNÜNE satır ekleme,
 * sözlüğe anahtar ekleme, sıradaki migrasyon numarası. Dosya sistemine dokunmaz; testi:
 * scripts/test/gen.unit.test.ts.
 *
 * Genişletme: yeni bir üreteç türü için gereken saf işlevi buraya yazın ve testini ekleyin.
 */

/** Koleksiyon adı: shared/src/entity.ts → COLLECTION_PATTERN ile aynı. */
export const COLLECTION_NAME = /^[a-z][a-z0-9_]{0,31}$/
/** Sayfa adı: küçük harf, rakam ve tire (adres çubuğunda görünür): `raporlar`, `haftalik-ozet`. */
export const PAGE_NAME = /^[a-z][a-z0-9-]{0,40}$/
/** Migrasyon adı: küçük harf, rakam, alt çizgi. */
export const MIGRATION_NAME = /^[a-z][a-z0-9_]{0,60}$/

/** `haftalik-ozet`, `notes_v2` → `haftalikOzet`, `notesV2` */
export function camelCase(name: string): string {
  return name.replace(/[-_]+([a-z0-9])/g, (_match, letter: string) => letter.toLocaleUpperCase('en-US'))
}

/** `haftalik-ozet` → `HaftalikOzet` */
export function pascalCase(name: string): string {
  const camel = camelCase(name)
  return camel.charAt(0).toLocaleUpperCase('en-US') + camel.slice(1)
}

/** İngilizce çoğul koleksiyon adından tekil (kaba kural; `--tekil` ile ezilebilir): notes → note. */
export function singularOf(collection: string): string {
  if (collection.endsWith('ies')) return `${collection.slice(0, -3)}y`
  if (/(ss|us)$/.test(collection)) return collection
  if (collection.endsWith('s')) return collection.slice(0, -1)
  return `${collection}Item`
}

/**
 * `marker` içeren satırın ÖNÜNE `lines` ekler (aynı girintiyle). İşaret yoksa ya da satırlar zaten varsa
 * hata fırlatır ki yanlış yere yazılmasın.
 */
export function insertBeforeMarker(text: string, marker: string, lines: readonly string[]): string {
  const index = text.indexOf(marker)
  if (index < 0) throw new Error(`İşaret bulunamadı: "${marker}". Dosyayı elle düzenleyin ya da işareti geri koyun.`)
  for (const line of lines) {
    if (line.trim() !== '' && text.includes(line.trim())) throw new Error(`Bu satır zaten var: ${line.trim()}`)
  }
  const lineStart = text.lastIndexOf('\n', index) + 1
  const indent = /^\s*/.exec(text.slice(lineStart, index))?.[0] ?? ''
  const block = lines.map((line) => (line === '' ? '' : `${indent}${line}`)).join('\n')
  return `${text.slice(0, lineStart)}${block}\n${text.slice(lineStart)}`
}

/** `pattern`e uyan SON satırdan sonra `line` ekler (ör. son içe aktarmanın altına). */
export function insertAfterLast(text: string, pattern: RegExp, line: string): string {
  const lines = text.split('\n')
  let last = -1
  lines.forEach((value, index) => {
    if (pattern.test(value)) last = index
  })
  if (last < 0) throw new Error(`Satır bulunamadı: ${String(pattern)}`)
  lines.splice(last + 1, 0, line)
  return lines.join('\n')
}

/** Adlandırılmış içe aktarma satırına (`import { A, B } from 'kaynak'`) ad ekler; zaten varsa dokunmaz. */
export function addNamedImport(text: string, from: string, name: string): string {
  const pattern = new RegExp(`import \\{([^}]*)\\} from '${from.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}'`)
  const match = pattern.exec(text)
  if (!match) throw new Error(`İçe aktarma bulunamadı: ${from}`)
  const names = (match[1] ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  if (names.includes(name)) return text
  const types = names.filter((item) => item.startsWith('type '))
  const values = [...names.filter((item) => !item.startsWith('type ')), name].toSorted()
  return text.replace(pattern, `import { ${[...values, ...types].join(', ')} } from '${from}'`)
}

/**
 * Sözlüğe (tr.json) yeni anahtarları sona ekler; biçim (boş satırlı gruplar) korunur.
 * Var olan anahtar varsa hata fırlatır.
 */
export function addMessages(json: string, messages: Readonly<Record<string, string>>): string {
  const existing = JSON.parse(json) as Record<string, string>
  for (const key of Object.keys(messages)) {
    if (Object.hasOwn(existing, key)) throw new Error(`Sözlükte bu anahtar zaten var: ${key}`)
  }
  const end = json.lastIndexOf('}')
  const body = json.slice(0, end).trimEnd()
  const block = Object.entries(messages)
    .map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`)
    .join(',\n')
  const result = `${body},\n\n${block}\n}\n`
  JSON.parse(result) // biçim bozulduysa burada patlar
  return result
}

/** Var olan migrasyon dosya adlarından sıradakinin numarası: 0001_x.sql, 0004_y.sql → "0005". */
export function nextMigrationNumber(fileNames: readonly string[]): string {
  const numbers = fileNames
    .map((name) => /^(\d{4})_.+\.sql$/.exec(name)?.[1])
    .filter((value): value is string => value !== undefined)
    .map(Number)
  const next = (numbers.length > 0 ? Math.max(...numbers) : 0) + 1
  return String(next).padStart(4, '0')
}
