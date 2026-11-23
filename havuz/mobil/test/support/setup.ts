/**
 * Her test dosyasından önce çalışır: veritabanı sürücüsünü node:sqlite'a çevirir (test/support/db.ts) ve açık
 * veritabanlarını test dosyası bitince kapatır.
 */
import { closeAllDbs } from '../../src/lib/store/databases.ts'
import './db.ts'

afterAll(async () => {
  await closeAllDbs()
})
