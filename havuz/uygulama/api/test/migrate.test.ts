import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '../src/db/database.ts'
import { loadMigrations, MigrationError, runMigrations } from '../src/db/migrate.ts'

let dir: string
let db: Db | null = null

function folder(files: Record<string, string>): string {
  dir = mkdtempSync(join(tmpdir(), 'uygulama-migrasyon-'))
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql)
  return dir
}

afterEach(() => {
  db?.close()
  db = null
  if (dir) rmSync(dir, { recursive: true, force: true })
})

const tables = (database: Db) =>
  database
    .all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .map((row) => row.name)

describe('migrasyon koşucusu', () => {
  it('dosyaları numara sırasıyla uygular ve kaydeder; ikinci koşuda hiçbir şey yapmaz', () => {
    const path = folder({
      '0002_b.sql': 'CREATE TABLE b (id INTEGER PRIMARY KEY, a_id INTEGER REFERENCES a (id));',
      '0001_a.sql': 'CREATE TABLE a (id INTEGER PRIMARY KEY);',
    })
    db = openDatabase(':memory:')
    const first = runMigrations(db, { migrations: loadMigrations(path) })
    expect(first.applied).toEqual(['0001_a.sql', '0002_b.sql'])
    expect(first.version).toBe(2)
    expect(tables(db)).toEqual(['_migrations', 'a', 'b'])
    const second = runMigrations(db, { migrations: loadMigrations(path) })
    expect(second.applied).toEqual([])
  })

  it('yarıda hata veren migrasyon BÜTÜNÜYLE geri alınır ve kaydedilmez; öncekiler kalır', () => {
    const path = folder({
      '0001_a.sql': 'CREATE TABLE a (id INTEGER PRIMARY KEY);',
      '0002_bozuk.sql': 'CREATE TABLE c (id INTEGER PRIMARY KEY);\nINSERT INTO yok_boyle_tablo VALUES (1);',
    })
    db = openDatabase(':memory:')
    expect(() => runMigrations(db as Db, { migrations: loadMigrations(path) })).toThrow(
      /"0002_bozuk\.sql" uygulanamadı ve geri alındı/,
    )
    expect(tables(db)).toEqual(['_migrations', 'a'])
    expect(db.all('SELECT version FROM _migrations')).toEqual([{ version: 1 }])
  })

  it('uygulanmış dosya değiştirilirse çalışmayı reddeder', () => {
    const path = folder({ '0001_a.sql': 'CREATE TABLE a (id INTEGER PRIMARY KEY);' })
    db = openDatabase(':memory:')
    runMigrations(db, { migrations: loadMigrations(path) })
    writeFileSync(join(path, '0001_a.sql'), 'CREATE TABLE a (id INTEGER PRIMARY KEY, ad TEXT);')
    expect(() => runMigrations(db as Db, { migrations: loadMigrations(path) })).toThrow(
      /uygulandıktan sonra değiştirilmiş/,
    )
  })

  it('veritabanında olup klasörde olmayan migrasyon (eski kod) reddedilir', () => {
    const path = folder({
      '0001_a.sql': 'CREATE TABLE a (id INTEGER PRIMARY KEY);',
      '0002_b.sql': 'CREATE TABLE b (x INTEGER);',
    })
    db = openDatabase(':memory:')
    runMigrations(db, { migrations: loadMigrations(path) })
    rmSync(join(path, '0002_b.sql'))
    expect(() => runMigrations(db as Db, { migrations: loadMigrations(path) })).toThrow(/kod klasöründe yok/)
  })

  it('ad biçimi, numara boşluğu ve BEGIN/COMMIT yasağı denetlenir', () => {
    expect(() => loadMigrations(folder({ '1_a.sql': 'SELECT 1;' }))).toThrow(MigrationError)
    rmSync(dir, { recursive: true, force: true })
    expect(() => loadMigrations(folder({ '0001_Büyük.sql': 'SELECT 1;' }))).toThrow(/dosya adı geçersiz/)
    rmSync(dir, { recursive: true, force: true })
    expect(() => loadMigrations(folder({ '0001_a.sql': 'SELECT 1;', '0003_c.sql': 'SELECT 1;' }))).toThrow(
      /0002 bekleniyordu/,
    )
    rmSync(dir, { recursive: true, force: true })
    expect(() => loadMigrations(folder({ '0001_a.sql': 'BEGIN;\nCREATE TABLE a (id INTEGER);\nCOMMIT;' }))).toThrow(
      /BEGIN\/COMMIT yazmayın/,
    )
  })

  it('gerçek migrasyonlar boş veritabanına uygulanır; yabancı anahtarlar açıktır', () => {
    db = openDatabase(':memory:')
    const result = runMigrations(db)
    expect(result.applied.length).toBeGreaterThanOrEqual(4)
    expect(tables(db)).toEqual(
      expect.arrayContaining([
        'users',
        'sessions',
        'workspaces',
        'members',
        'invites',
        'records',
        'clients',
        'audit_log',
        'mail_outbox',
      ]),
    )
    expect(db.get('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 })
    expect(db.all('PRAGMA foreign_key_check')).toEqual([])
  })
})
