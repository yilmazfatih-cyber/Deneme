/**
 * `npm run migrate -w @uygulama/api` — bekleyen migrasyonları uygular ve durumu yazar.
 * Sunucu açılırken de aynı işi kendiliğinden yapar; bu betik yayın öncesi denetim ve yedekten dönüş içindir.
 *
 * Genişletme: yeni migrasyon dosyası için TARIFLER.md → "Yeni tablo / migrasyon ekle".
 */
import { openDatabase } from '../src/db/database.ts'
import { loadMigrations, runMigrations } from '../src/db/migrate.ts'
import { loadScriptConfig, print, runScript } from './lib.ts'

runScript(() => {
  const config = loadScriptConfig()
  const db = openDatabase(config.databasePath)
  try {
    const result = runMigrations(db)
    print(`Veritabanı: ${config.databasePath}`)
    if (result.applied.length === 0) print('Bekleyen migrasyon yok; veritabanı güncel.')
    for (const file of result.applied) print(`  uygulandı: ${file}`)
    print(`Son migrasyon: ${String(result.version).padStart(4, '0')} (toplam ${loadMigrations().length} dosya)`)
  } finally {
    db.close()
  }
})
