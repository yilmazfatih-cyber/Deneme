// KOPYA — elle değiştirmeyin. Kaynak: havuz/uygulama/shared/src/entity.ts · Kopyalanma: 2026-11-23 · Yenile: npm run shared:sync
/**
 * Varlık tanımı. Bir "varlık" (görev, liste, not…) eşitlenen bir kayıt türüdür.
 * Tanım tek yerde durur; hem sunucu (gelen veriyi doğrular) hem istemci (formu doğrular, yerelde saklar) onu kullanır.
 *
 * Genişletme: yeni varlık için `npm run gen -- entity <ad>` çalıştırın. Elle yapacaksanız:
 *   1) `shared/src/entities/<ad>.ts` dosyasında `defineEntity` ile tanımlayın (örnek: tasks.ts),
 *   2) `shared/src/entities/index.ts` içindeki ENTITIES kaydına ekleyin.
 * Sunucuda ayrıca tablo/migrasyon GEREKMEZ: bütün varlıklar tek `records` tablosunda JSON olarak durur.
 */
import { z } from 'zod'

/** Koleksiyon adı: küçük harf, rakam, alt çizgi; harfle başlar; en çok 32 karakter. Çoğul yazılır: `tasks`. */
export const COLLECTION_PATTERN = /^[a-z][a-z0-9_]{0,31}$/

export const collectionNameSchema = z.string().regex(COLLECTION_PATTERN, 'Geçersiz koleksiyon adı')

export interface EntityDef<S extends z.ZodObject = z.ZodObject> {
  /** Depolama adı (çoğul, İngilizce): `tasks`. Yayına çıktıktan sonra DEĞİŞTİRMEYİN; eski kayıtlar bu adla durur. */
  readonly collection: string
  /** Arayüzde görünen Türkçe ad. */
  readonly label: { readonly singular: string; readonly plural: string }
  /**
   * Kaydın alanları. Kurallar:
   *  - Yeni alan eklerken `.default(...)` verin: eski kayıtlar o alan olmadan durur, okurken varsayılanı alır.
   *  - Alan silmeyin ya da türünü değiştirmeyin; gerekiyorsa yeni adla yeni alan açın.
   *  - "Boş" değer için `null` kullanın (`.nullable().default(null)`); JSON `undefined` taşımaz.
   */
  readonly schema: S
}

export function defineEntity<S extends z.ZodObject>(def: EntityDef<S>): EntityDef<S> {
  if (!COLLECTION_PATTERN.test(def.collection)) {
    throw new Error(
      `Geçersiz koleksiyon adı "${def.collection}": küçük harfle başlamalı; yalnız küçük harf, rakam ve alt çizgi içerebilir.`,
    )
  }
  return Object.freeze(def)
}

/** Doğrulanmış kaydın türü (varsayılanlar uygulanmış). */
export type EntityData<E extends EntityDef> = z.output<E['schema']>

/** Yeni kayıt açarken verilecek alanların türü (varsayılanı olan alanlar isteğe bağlı). */
export type EntityInput<E extends EntityDef> = z.input<E['schema']>
