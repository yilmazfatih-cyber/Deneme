/**
 * Üretecin modeli: adlar (koleksiyon → bileşen adı, yol) ve varlık şemasının alanları (shared/ kopyasından okunur).
 * Alan türleri: metin → metin kutusu, evet/hayır → onay kutusu, seçenek (enum) → seçim grubu; öteki türler (sayı,
 * tarih, başka kayda bağ) iskelete girmez, üretilen dosyanın başlığında "elle eklenecek" diye listelenir.
 *
 * Genişletme: yeni bir alan türüne denetim üretmek için `classify` ve templates.ts → `fieldControl`.
 */
import { join } from 'node:path'

export type FieldKind =
  | { readonly kind: 'text'; readonly required: boolean }
  | { readonly kind: 'boolean' }
  | { readonly kind: 'enum'; readonly options: readonly string[] }
  | { readonly kind: 'other'; readonly description: string }

export interface Field {
  readonly name: string
  readonly type: FieldKind
}

export interface Names {
  /** Koleksiyon / klasör adı: `notes`. */
  readonly key: string
  /** Bileşen adı öneki: `Notes`. */
  readonly pascal: string
}

/** `notes` → `Notes`, `shopping_items` → `ShoppingItems`. */
export function namesOf(key: string): Names {
  if (!/^[a-z][a-z0-9_]{0,31}$/.test(key)) {
    throw new Error(`Geçersiz ad "${key}": küçük harfle başlayan İngilizce ad yazın (ör. notes, shopping_items).`)
  }
  // Kod adı ASCII'dir: burada İngilizce kural doğrudur (Türkçe kural "i"yi "İ" yapardı).
  const pascal = key
    .split('_')
    .map((part) => part.charAt(0).toLocaleUpperCase('en-US') + part.slice(1))
    .join('')
  return { key, pascal }
}

interface ZodLike {
  readonly _zod: { readonly def: { readonly type: string; readonly innerType?: ZodLike; readonly in?: ZodLike } }
  readonly options?: readonly string[]
}

/** Zod alanını üretecin anlayacağı türe çevirir (sarmalayıcılar: default, nullable, optional, pipe). */
export function classify(schema: ZodLike): FieldKind {
  let current = schema
  const wrappers = new Set<string>()
  for (;;) {
    const def = current._zod.def
    if (def.type === 'default' || def.type === 'nullable' || def.type === 'optional') {
      wrappers.add(def.type)
      current = def.innerType ?? current
    } else if (def.type === 'pipe' && def.in) current = def.in
    else break
  }
  const base = current._zod.def.type
  if (base === 'string' && !wrappers.has('nullable')) return { kind: 'text', required: !wrappers.has('default') }
  if (base === 'boolean') return { kind: 'boolean' }
  if (base === 'enum' && current.options) return { kind: 'enum', options: current.options }
  return { kind: 'other', description: wrappers.has('nullable') ? `${base} | null` : base }
}

/** Varlığın alanlarını shared/ kopyasından okur; varlık yoksa yol gösteren hata. */
export async function loadFields(root: string, key: string): Promise<Field[]> {
  const shared = (await import(join(root, 'shared', 'index.ts'))) as {
    ENTITIES: Record<string, { schema: { shape: Record<string, ZodLike> } }>
  }
  const entity = Object.hasOwn(shared.ENTITIES, key) ? shared.ENTITIES[key] : undefined
  if (!entity) {
    throw new Error(
      [
        `"${key}" varlığı ortak sözleşmede yok (shared/entities).`,
        'Varlık şeması sunucuyla ortaktır; önce havuz/uygulama içinde tanımlanır:',
        `  1) cd ../uygulama && npm run gen -- entity ${key} --etiket Tekil,Çoğul`,
        '  2) cd ../mobil && npm run shared:sync',
        `  3) npm run gen -- entity ${key}`,
      ].join('\n'),
    )
  }
  return Object.entries(entity.schema.shape).map(([name, schema]) => ({ name, type: classify(schema) }))
}

/** Hızlı eklemede yazılacak alan: verilmezse ilk ZORUNLU metin alanı. */
export function pickDisplayField(fields: readonly Field[], wanted: string | undefined): string {
  if (wanted) {
    const field = fields.find((item) => item.name === wanted)
    if (field?.type.kind !== 'text') throw new Error(`--alan ${wanted}: varlıkta böyle bir METİN alanı yok.`)
    return wanted
  }
  const required = fields.filter((item) => item.type.kind === 'text' && item.type.required)
  if (required.length !== 1) {
    throw new Error(
      `Hızlı ekleme için tek bir zorunlu metin alanı gerekir (bulunan: ${required.map((f) => f.name).join(', ') || 'yok'}). ` +
        '--alan <ad> ile seçin; öteki alanlara şemada .default(...) verin.',
    )
  }
  return required[0]!.name
}
