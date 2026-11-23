/**
 * expo-sqlite sürücüsü: sql.ts arayüzünün telefondaki (ve web'deki) gerçeklemesi.
 * Telefonda veritabanı uygulamanın kendi klasöründe bir dosyadır; web'de tarayıcının OPFS deposunda durur
 * (web için metro.config.js'te `.wasm` ve sunucuda COOP/COEP başlıkları gerekir: docs/KARARLAR.md).
 *
 * Bu dosya testlerde KULLANILMAZ (orada node:sqlite sürücüsü var); bu yüzden olabildiğince incedir.
 * Genişletme: bağlantı ayarı (PRAGMA) gerekiyorsa `openExpoDriver` içine ekleyin; göç (şema) değişikliği schema.ts'e.
 */
import * as SQLite from 'expo-sqlite'
import { Platform } from 'react-native'
import type { SqlDriver } from './sql.ts'

export async function openExpoDriver(name: string): Promise<SqlDriver> {
  const db = await SQLite.openDatabaseAsync(name)
  // WAL: yazarken okumayı engellemez, çökmeye dayanıklıdır. Web'deki (OPFS) sürücü bunu desteklemez.
  if (Platform.OS !== 'web') await db.execAsync('PRAGMA journal_mode = WAL;')
  // Web: geçici dosyalar bellekte (OPFS dosya havuzu küçüktür: expo-sqlite AccessHandlePoolVFS, 6 dosya).
  else await db.execAsync('PRAGMA temp_store = MEMORY;')
  return {
    exec: (source) => db.execAsync(source),
    run: async (source, params = []) => {
      const result = await db.runAsync(source, [...params])
      return { changes: result.changes, lastInsertRowId: result.lastInsertRowId }
    },
    all: (source, params = []) => db.getAllAsync(source, [...params]),
    get: (source, params = []) => db.getFirstAsync(source, [...params]),
    close: () => db.closeAsync(),
  }
}

/** Veritabanı dosyasını siler (önce bağlantı kapatılmış olmalı). Dosya yoksa sessizce geçer. */
export async function deleteExpoDatabase(name: string): Promise<void> {
  try {
    await SQLite.deleteDatabaseAsync(name)
  } catch (error) {
    console.warn(`Veritabanı silinemedi (${name}):`, error)
  }
}
