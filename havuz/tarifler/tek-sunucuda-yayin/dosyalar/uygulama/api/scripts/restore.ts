/**
 * `npm run restore -w @uygulama/api -- <yedek.db> --onayla` — veritabanını bir yedekten geri yükler.
 * Güvenlik sırası: (1) `--onayla` yoksa yalnız ne yapılacağını yazar; (2) sunucu çalışıyorsa (sağlık ucu yanıt
 * veriyorsa) reddeder: önce `sudo systemctl stop uygulama`; (3) yedeğin bütünlüğü ve migrasyon tablosu
 * denetlenir; (4) şimdiki veritabanı SİLİNMEZ, `-wal`/`-shm` dosyalarıyla `<ad>.onceki-<zaman>` olarak kenara
 * alınır; (5) yedek önce yanına kopyalanır, sonra tek adımda (rename) yerine taşınır.
 * Sonra sunucuyu başlatın; yedekten sonra eklenmiş migrasyonlar açılışta uygulanır.
 *
 * Genişletme: yedeği uzaktan (S3 vb.) almak gerekirse önce dosyayı indirip yolunu bu betiğe verin; burada ağ yok.
 */
import { copyFileSync, existsSync, renameSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { openDatabase } from '../src/db/database.ts'
import { loadScriptConfig, print, runScript, ScriptError } from './lib.ts'

function stamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
}

/** Yedek açılır mı, bütünlüğü sağlam mı, bu uygulamanın veritabanı mı (migrasyon tablosu var mı)? */
function verifyBackup(path: string): number {
  let db: ReturnType<typeof openDatabase> | null = null
  try {
    db = openDatabase(path)
    const check = db.get<{ integrity_check: string }>('PRAGMA integrity_check')
    if (check?.integrity_check !== 'ok') throw new ScriptError(`Yedek bozuk (bütünlük: ${check?.integrity_check}).`)
    return db.get<{ total: number }>('SELECT count(*) AS total FROM _migrations')?.total ?? 0
  } catch (error) {
    if (error instanceof ScriptError) throw error
    throw new ScriptError(`Yedek okunamadı ya da bu uygulamanın veritabanı değil: ${String(error)}`)
  } finally {
    db?.close()
  }
}

async function serverIsUp(host: string, port: number): Promise<boolean> {
  const address = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host
  try {
    const response = await fetch(`http://${address}:${port}/api/health`, { signal: AbortSignal.timeout(1500) })
    return response.ok
  } catch {
    return false
  }
}

runScript(async () => {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { onayla: { type: 'boolean' } } })
  const source = positionals[0]
  if (!source) throw new ScriptError('Kullanım: npm run restore -w @uygulama/api -- <yedek.db> --onayla')
  const backup = resolve(source)
  if (!existsSync(backup)) throw new ScriptError(`Yedek bulunamadı: ${backup}`)
  const config = loadScriptConfig()
  if (config.databasePath === ':memory:') throw new ScriptError('Bellek içi veritabanına geri yükleme yapılamaz.')
  const target = config.databasePath
  if (!values.onayla) {
    print(`Geri yüklenecek: ${backup}\nHedef: ${target}`)
    print('Şimdiki veritabanı silinmez, yanına ".onceki-<zaman>" adıyla taşınır.')
    throw new ScriptError('Önce sunucuyu durdurun (sudo systemctl stop uygulama), sonra --onayla ile çalıştırın.')
  }
  if (await serverIsUp(config.host, config.port)) {
    throw new ScriptError(
      `Sunucu çalışıyor görünüyor (${config.port} kapısındaki /api/health yanıt verdi). Önce durdurun: sudo systemctl stop uygulama`,
    )
  }
  const migrations = verifyBackup(backup)
  const temporary = `${target}.yukleniyor`
  copyFileSync(backup, temporary)
  const aside = `${target}.onceki-${stamp(new Date())}`
  for (const suffix of ['', '-wal', '-shm']) {
    if (existsSync(`${target}${suffix}`)) renameSync(`${target}${suffix}`, `${aside}${suffix}`)
  }
  renameSync(temporary, target)
  print(`Geri yüklendi: ${backup} → ${target} (migrasyon: ${migrations})`)
  print(`Eski veritabanı: ${aside} (her şey yolundaysa sonra silebilirsiniz)`)
  print('Şimdi sunucuyu başlatın: sudo systemctl start uygulama')
})
