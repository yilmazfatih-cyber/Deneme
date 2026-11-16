/**
 * Yerel veritabanının (IndexedDB / Dexie) ŞEMA SÜRÜMLERİ.
 * Kayıtların alanları burada tanımlanmaz (onlar `shared/src/entities` içindedir ve JSON olarak saklanır);
 * burada yalnız tablolar ve dizinler durur. Bu yüzden yeni varlık ya da alan eklemek sürüm GEREKTİRMEZ.
 *
 * Genişletme: yeni tablo ya da dizin gerekiyorsa listenin SONUNA yeni bir sürüm ekleyin.
 *   - Yayınlanmış bir sürümü DEĞİŞTİRMEYİN (kullanıcıların tarayıcısındaki veritabanı o tanımla açılmıştır).
 *   - `stores` içine yalnız değişen tabloları yazın; `null` tabloyu siler.
 *   - Eski veriyi çevirmek gerekiyorsa `upgrade` yazın (örnek ve test: test/store/schema.test.ts).
 */
import type { Transaction } from 'dexie'

export interface DbVersion {
  readonly version: number
  /** Dexie tablo tanımları: "birincil anahtar, dizin, dizin". */
  readonly stores: Readonly<Record<string, string | null>>
  /** Eski veriyi yeni biçime çeviren adım (isteğe bağlı). Yalnız Dexie çağrıları beklenir (ağ isteği yok). */
  readonly upgrade?: (tx: Transaction) => Promise<void>
}

export const DB_VERSIONS: readonly DbVersion[] = [
  {
    version: 1,
    stores: {
      // Kayıtlar: görünen hâl + sunucunun son bilinen hâli. Anahtar: alan + koleksiyon + kimlik.
      records: '[workspaceId+collection+id], [workspaceId+collection]',
      // Giden kutusu: sunucuya gönderilmeyi bekleyen değişiklikler. `mid` kendiliğinden artar, hiç geri gitmez.
      outbox: '++mid, workspaceId',
      // Üst veri: cihaz kimliği, imleçler, alanlar… (anahtar → değer).
      meta: 'key',
    },
  },
  // YENİ SÜRÜM BURAYA: { version: 2, stores: { ... }, upgrade: async (tx) => { ... } }
]
