/**
 * Yerel veritabanı (Dexie). Her kullanıcının AYRI veritabanı vardır; hesapsız kullanımın da ayrı bir veritabanı
 * vardır. Böylece aynı tarayıcıda iki kişi birbirinin verisini görmez ve çıkış yapınca veri karışmaz.
 *
 * Üç tablo: `records` (kayıtlar), `outbox` (giden kutusu), `meta` (üst veri). Şema sürümleri: schema.ts.
 * Bu dosyayı doğrudan kullanmak yerine `records.ts` (yazma/okuma) ve `hooks.ts` (React) katmanını kullanın.
 *
 * Genişletme: yeni tablo → schema.ts'e yeni sürüm + buraya `declare` satırı.
 */
import Dexie, { type Table } from 'dexie'
import { type Doc, type LocalRecord, type Mutation, type RecordKey, type ServerSnapshot } from '@uygulama/shared'
import { APP } from '../../app/config.ts'
import { DB_VERSIONS, type DbVersion } from './schema.ts'

/** `records` tablosundaki bir satır. */
export interface RecordRow {
  readonly workspaceId: string
  readonly collection: string
  readonly id: string
  /** Arayüzün gördüğü hâl (sunucu hâli + bekleyen yerel değişiklikler). */
  readonly view: Doc
  /** Sunucunun son bilinen hâli; kayıt henüz sunucuya ulaşmadıysa `null`. */
  readonly server: ServerSnapshot | null
  /** Kaydın ilk oluşturulduğu an (ISO). */
  readonly createdAt: string
  /** Görünen hâlin en son değiştiği an (ISO). */
  readonly updatedAt: string
}

export type RecordPrimaryKey = [workspaceId: string, collection: string, id: string]

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** Giden kutusuna eklenecek değişiklik (`mid` veritabanınca verilir). */
export type NewMutation = DistributiveOmit<Mutation, 'mid'>

export interface MetaRow {
  readonly key: string
  readonly value: unknown
}

export class AppDb extends Dexie {
  declare records: Table<RecordRow, RecordPrimaryKey>
  declare outbox: Table<Mutation, number, NewMutation>
  declare meta: Table<MetaRow, string>

  private readonly writeListeners = new Set<() => void>()

  constructor(name: string, versions: readonly DbVersion[] = DB_VERSIONS) {
    super(name)
    for (const item of versions) {
      const version = this.version(item.version).stores({ ...item.stores })
      if (item.upgrade) version.upgrade(item.upgrade)
    }
  }

  /** Bu sekmede yapılan her yerel yazmadan sonra çağrılır (eşitleme motoru bununla tetiklenir). */
  onLocalWrite(listener: () => void): () => void {
    this.writeListeners.add(listener)
    return () => this.writeListeners.delete(listener)
  }

  notifyLocalWrite(): void {
    for (const listener of this.writeListeners) listener()
  }
}

export function toPrimaryKey(key: RecordKey): RecordPrimaryKey {
  return [key.workspaceId, key.collection, key.id]
}

export function rowKey(row: Pick<RecordRow, 'workspaceId' | 'collection' | 'id'>): RecordKey {
  return { workspaceId: row.workspaceId, collection: row.collection, id: row.id }
}

/** Satırı ortak eşitleme mantığının beklediği biçime çevirir (shared/src/replica.ts → LocalRecord). */
export function toLocalRecord(row: RecordRow): LocalRecord {
  return { key: rowKey(row), view: row.view, server: row.server }
}

// ── Veritabanı adları ────────────────────────────────────────────────────────────────────────────

/** Hesapsız (yalnız bu cihazda) kullanımın veritabanı. */
export const LOCAL_DB_NAME = `${APP.id}.yerel`

/** Bir kullanıcının veritabanı. Kimlik `ID_PATTERN`'e uyduğu için ad güvenlidir. */
export function userDbName(userId: string): string {
  return `${APP.id}.kullanici.${userId}`
}

const openDbs = new Map<string, AppDb>()

/** Aynı adla tek bir bağlantı açılır (her çağrıda yenisi açılmasın diye). */
export function openDb(name: string): AppDb {
  let db = openDbs.get(name)
  if (!db) {
    db = new AppDb(name)
    openDbs.set(name, db)
  }
  return db
}

/** Veritabanını kapatır ve diskten siler ("bu cihazdaki veriyi de sil"). */
export async function deleteDb(name: string): Promise<void> {
  const db = openDbs.get(name)
  if (db) {
    db.close()
    openDbs.delete(name)
  }
  await Dexie.delete(name)
}

/** Testler için: açık bütün bağlantıları kapatır. */
export function closeAllDbs(): void {
  for (const db of openDbs.values()) db.close()
  openDbs.clear()
}
