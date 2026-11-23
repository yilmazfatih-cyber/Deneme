/**
 * Şema göçleri: sırayla uygulanır, yarıda kalan göç geri alınır, yeni sürüm eski veriyi korur.
 * ÖRNEK: yeni bir göç yazarken aşağıdaki "2. sürüm" testini kopyalayıp uyarlayın.
 */
import { DEVICE_DB_NAME } from '../../src/lib/device/deviceStore.ts'
import { closeLocalDb, LOCAL_DB_NAME, MAX_DB_NAME, openLocalDb, userDbName } from '../../src/lib/store/databases.ts'
import { LocalDb } from '../../src/lib/store/localDb.ts'
import { migrate, MIGRATIONS, SchemaTooNewError, type Migration } from '../../src/lib/store/schema.ts'
import { openNodeDriver } from '../support/nodeDriver.ts'

const version = (db: LocalDb) =>
  db.read(async (sql) => (await sql.get<{ user_version: number }>('PRAGMA user_version'))?.user_version)

describe('şema göçleri (kural testleri)', () => {
  it('sürümler 1den başlar, birer artar, her birinin açıklaması var', () => {
    MIGRATIONS.forEach((migration, index) => {
      expect(migration.version).toBe(index + 1)
      expect(migration.description.trim()).not.toBe('')
    })
  })

  it('boş veritabanını son sürüme getirir; ikinci çalıştırma hiçbir şey yapmaz', async () => {
    const db = new LocalDb('g.db', openNodeDriver())
    expect(await migrate(db)).toBe(MIGRATIONS.length)
    expect(await version(db)).toBe(MIGRATIONS.length)
    expect(await migrate(db)).toBe(MIGRATIONS.length)
    const tables = await db.read((sql) =>
      sql.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"),
    )
    expect(tables.map((table) => table.name)).toEqual(expect.arrayContaining(['meta', 'outbox', 'records']))
  })

  it('örnek: 2. sürüm eski veriyi korur; yarıda hata veren göç sürümü ilerletmez', async () => {
    const db = new LocalDb('g2.db', openNodeDriver())
    await migrate(db)
    await db.write((sql) => sql.run('INSERT INTO meta (key, value) VALUES (?, ?)', ['clientId', '"c1"']))
    const broken: Migration = {
      version: MIGRATIONS.length + 1,
      description: 'bozuk',
      up: async (sql) => {
        await sql.exec('CREATE TABLE notes (id TEXT PRIMARY KEY)')
        throw new Error('göç yarıda kaldı')
      },
    }
    await expect(migrate(db, [...MIGRATIONS, broken])).rejects.toThrow('göç yarıda kaldı')
    expect(await version(db)).toBe(MIGRATIONS.length)
    const fixed: Migration = {
      ...broken,
      description: 'notlar tablosu',
      up: (sql) => sql.exec('CREATE TABLE notes (id TEXT PRIMARY KEY)'),
    }
    expect(await migrate(db, [...MIGRATIONS, fixed])).toBe(MIGRATIONS.length + 1)
    expect(await db.read((sql) => sql.get('SELECT value FROM meta WHERE key = ?', ['clientId']))).toEqual({
      value: '"c1"',
    })
  })

  it('uygulamadan yeni bir şema yol gösteren hatayla durur', async () => {
    const db = new LocalDb('g3.db', openNodeDriver())
    await db.write((sql) => sql.exec('PRAGMA user_version = 99'))
    await expect(migrate(db)).rejects.toBeInstanceOf(SchemaTooNewError)
  })
})

describe('veritabanı kaydı', () => {
  it('aynı ad tek bağlantı verir; kapatılan yeniden açılınca yeni bağlantı olur', async () => {
    const first = await openLocalDb('kayit-deneme.db')
    expect(await openLocalDb('kayit-deneme.db')).toBe(first)
    await closeLocalDb('kayit-deneme.db')
    expect(first.isClosed).toBe(true)
    const second = await openLocalDb('kayit-deneme.db')
    expect(second).not.toBe(first)
    expect(second.isClosed).toBe(false)
  })
})

describe('veritabanı adları (kural testi)', () => {
  it('her ad web sınırına sığar: "/" + ad + "-journal" ≤ 64 karakter (en uzun kimlikte de)', () => {
    const longest = 'x'.repeat(64)
    const names = [
      LOCAL_DB_NAME,
      DEVICE_DB_NAME,
      userDbName('0193a5c8-4f2e-7b1a-9c3d-5e6f7a8b9c0d'),
      userDbName(longest),
    ]
    for (const name of names) expect([name, name.length <= MAX_DB_NAME]).toEqual([name, true])
    expect(userDbName('0193a5c8-4f2e-7b1a-9c3d-5e6f7a8b9c0d')).toBe('kullanici-0193a5c84f2e7b1a9c3d5e6f7a8b9c0d.db')
    expect(userDbName(longest)).toBe(userDbName(longest))
    expect(userDbName(longest)).not.toBe(userDbName('y'.repeat(64)))
  })
})
