/**
 * `npm run backup -w @uygulama/api -- [hedef.db]` — veritabanının TUTARLI bir kopyasını alır (`VACUUM INTO`).
 * Sunucu çalışırken de güvenlidir (SQLite kopyayı tek bir okuma anının görüntüsünden üretir). Hedef verilmezse
 * veritabanının yanındaki `yedek/` klasörüne zaman damgalı bir dosya yazılır. Kopya açılıp bütünlüğü denetlenir.
 *
 * Geri yükleme: sunucuyu durdurun, yedek dosyayı DATABASE_PATH'e kopyalayın, yanındaki `-wal` ve `-shm`
 * dosyalarını silin, sunucuyu başlatın (ayrıntı: docs/YAYINLAMA.md → "Yedekleme ve geri yükleme").
 *
 * Genişletme: yedeği başka bir yere (S3 vb.) göndermek için bu betiğin sonuna yükleme adımı eklenebilir.
 */
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { openDatabase } from '../src/db/database.ts'
import { loadScriptConfig, print, runScript, ScriptError } from './lib.ts'

function stamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
}

runScript(() => {
  const { positionals } = parseArgs({ allowPositionals: true })
  const config = loadScriptConfig()
  if (config.databasePath === ':memory:') throw new ScriptError('Bellek içi veritabanı yedeklenemez.')
  if (!existsSync(config.databasePath)) throw new ScriptError(`Veritabanı bulunamadı: ${config.databasePath}`)
  const target = resolve(
    positionals[0] ?? join(dirname(config.databasePath), 'yedek', `uygulama-${stamp(new Date())}.db`),
  )
  if (existsSync(target)) throw new ScriptError(`Hedef dosya zaten var: ${target}. Başka bir ad verin.`)
  mkdirSync(dirname(target), { recursive: true })

  const db = openDatabase(config.databasePath)
  try {
    db.run('VACUUM INTO ?', target)
  } finally {
    db.close()
  }

  const copy = openDatabase(target)
  try {
    const check = copy.get<{ integrity_check: string }>('PRAGMA integrity_check')
    if (check?.integrity_check !== 'ok')
      throw new ScriptError(`Yedek bütünlük denetiminden geçmedi: ${check?.integrity_check}`)
    const migrations = copy.get<{ total: number }>('SELECT count(*) AS total FROM _migrations')?.total ?? 0
    print(`Yedek alındı: ${target}`)
    print(`Boyut: ${(statSync(target).size / 1024).toFixed(1)} KiB · migrasyon: ${migrations} · bütünlük: ok`)
  } finally {
    copy.close()
  }
})
