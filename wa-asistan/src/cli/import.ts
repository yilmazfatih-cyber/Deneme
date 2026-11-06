/**
 * `npm run ice-aktar -- <dosya>`: contacts (.vcf, .csv) or calendar (.ics) → Markdown in data/profil/.
 * Runs locally; the file never goes through WhatsApp or any server.
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseContactsCsv, parseIcs, parseVcf, renderContacts, renderEvents } from '../profile/import.js'
import { EVENTS_FILE } from '../profile/store.js'

function loadEnv(): void {
  try {
    process.loadEnvFile('.env')
  } catch {
    // .env is optional here
  }
}

function backup(file: string): void {
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.eski`)
}

export function runImport(file: string, profileDir: string, now = Date.now()): string {
  const ext = path.extname(file).toLowerCase()
  const text = fs.readFileSync(file, 'utf8')
  fs.mkdirSync(profileDir, { recursive: true })
  if (ext === '.vcf' || ext === '.csv') {
    const r = ext === '.vcf' ? parseVcf(text) : parseContactsCsv(text)
    if (r.contacts.length === 0)
      return 'Dosyada içe aktarılacak kişi bulunamadı. Biçimi kontrol edin (Google Kişiler › Dışa aktar › vCard veya CSV).'
    const target = path.join(profileDir, 'kisiler.md')
    backup(target)
    fs.writeFileSync(target, renderContacts(r.contacts))
    return `${r.contacts.length} kişi içe aktarıldı → ${target}${r.droppedSensitive ? `\n${r.droppedSensitive} alan şifre/kimlik/IBAN/kart gibi göründüğü için atlandı.` : ''}`
  }
  if (ext === '.ics') {
    const r = parseIcs(text, { now })
    if (r.events.length === 0) return 'Önümüzdeki dönem için etkinlik bulunamadı.'
    const md = path.join(profileDir, 'takvim.md')
    backup(md)
    fs.writeFileSync(md, renderEvents(r.events))
    fs.writeFileSync(path.join(profileDir, EVENTS_FILE), JSON.stringify(r.events, null, 1))
    return `${r.events.length} etkinlik içe aktarıldı → ${md}${r.droppedSensitive ? `\n${r.droppedSensitive} kayıt hassas içerik nedeniyle atlandı.` : ''}`
  }
  return `Desteklenmeyen dosya türü: ${ext || '(uzantı yok)'}. .vcf, .csv veya .ics kullanın.`
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadEnv()
  const file = process.argv[2]
  if (!file) {
    console.error('Kullanım: npm run ice-aktar -- <kisiler.vcf | kisiler.csv | takvim.ics>')
    process.exit(1)
  }
  const dataDir = path.resolve(process.env.DATA_DIR?.trim() || 'data')
  try {
    console.log(runImport(path.resolve(file), path.join(dataDir, 'profil')))
    console.log('Bu bilgiler yalnızca bilgisayarında kalır; modele sadece sorulara uygun parçalar gider.')
  } catch (err) {
    console.error(`İçe aktarma başarısız: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}
