// Demo veritabanını (yeniden) oluşturur: npm run seed  ·  sıfırlamak için: npm run seed -- --sifirla
import { existsSync, rmSync } from 'node:fs'
import { loadConfig } from '../server/config.ts'
import { get, openDb } from '../server/db/db.ts'
import { DEMO_PASSWORD, DEMO_RESIDENT_PHONE, DEMO_USERS, seedDemo } from '../server/db/seed.ts'

const config = loadConfig()
if (process.argv.includes('--sifirla') && config.dbPath !== ':memory:') {
  for (const suffix of ['', '-wal', '-shm']) if (existsSync(config.dbPath + suffix)) rmSync(config.dbPath + suffix)
}
const db = openDb(config.dbPath)
if (get(db, 'SELECT id FROM orgs LIMIT 1')) {
  console.log('Veritabanı dolu; yeniden kurmak için: npm run seed -- --sifirla')
} else {
  const r = await seedDemo(db)
  console.log(`Örnek veri yüklendi: ${Object.keys(r.sites).length} site, ${r.units} bağımsız bölüm.`)
  console.log(
    `Personel girişi: ${DEMO_USERS.admin} / ${DEMO_PASSWORD}  (site yöneticisi: ${DEMO_USERS.yonetici}, muhasebe: ${DEMO_USERS.muhasebe})`,
  )
  console.log(`Sakin girişi: ${DEMO_RESIDENT_PHONE} — kod demo modunda ekranda gösterilir`)
}
db.close()
