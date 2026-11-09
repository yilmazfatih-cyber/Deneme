// İlk kurulum: yönetim şirketini ve ilk şirket yöneticisi hesabını oluşturur.
//   npm run kurulum -- --sirket "Yıldız Yönetim A.Ş." --ad "Elif Aksoy" --eposta elif@ornek.com --parola "en-az-12-karakter"
import { parseArgs } from 'node:util'
import { hashPassword } from '../server/auth/auth.ts'
import { loadConfig } from '../server/config.ts'
import { get, insert, openDb, tx } from '../server/db/db.ts'
import { DEFAULT_SETTINGS } from '../shared/labels.ts'

const { values } = parseArgs({
  options: {
    sirket: { type: 'string' },
    ad: { type: 'string' },
    eposta: { type: 'string' },
    parola: { type: 'string' },
  },
})
const { sirket, ad, eposta, parola } = values
if (!sirket || !ad || !eposta || !parola) {
  console.error(
    'Kullanım: npm run kurulum -- --sirket "Şirket adı" --ad "Ad Soyad" --eposta e@posta.com --parola "güçlü-parola"',
  )
  process.exit(1)
}
if (parola.length < 12) {
  console.error('Parola en az 12 karakter olmalı.')
  process.exit(1)
}
const config = loadConfig()
const db = openDb(config.dbPath)
if (get(db, 'SELECT id FROM users WHERE lower(email) = lower(?)', eposta)) {
  console.error('Bu e-posta zaten kayıtlı.')
  process.exit(1)
}
const hash = await hashPassword(parola)
const orgId = tx(db, () => {
  const existing = get<{ id: number }>(db, 'SELECT id FROM orgs WHERE name = ?', sirket)
  const id = existing?.id ?? insert(db, 'orgs', { name: sirket, settings: JSON.stringify(DEFAULT_SETTINGS) })
  insert(db, 'users', { org_id: id, name: ad, email: eposta.toLowerCase(), password_hash: hash, role: 'admin' })
  return id
})
console.log(
  `Hazır: "${sirket}" (kuruluş #${orgId}) için ${eposta} şirket yöneticisi olarak oluşturuldu. Veritabanı: ${config.dbPath}`,
)
db.close()
