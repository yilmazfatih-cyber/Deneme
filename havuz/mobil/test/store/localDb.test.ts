/**
 * Veritabanı sırası ve işlemleri: yazma ya bütünüyle olur ya hiç; okuma yarım yazmayı görmez; değişiklik
 * bildirimi yalnız COMMIT'ten sonra gelir; okuma işinde yazma engellenir.
 */
import { LocalDb } from '../../src/lib/store/localDb.ts'
import { writtenTable } from '../../src/lib/store/sql.ts'
import { openNodeDriver } from '../support/nodeDriver.ts'

async function table(): Promise<LocalDb> {
  const db = new LocalDb('sira.db', openNodeDriver())
  await db.write((sql) => sql.exec('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT)'))
  return db
}

describe('LocalDb', () => {
  it('hata veren yazma her şeyi geri alır', async () => {
    const db = await table()
    await expect(
      db.write(async (sql) => {
        await sql.run('INSERT INTO t (v) VALUES (?)', ['a'])
        throw new Error('yarıda kaldı')
      }),
    ).rejects.toThrow('yarıda kaldı')
    expect(await db.read((sql) => sql.all('SELECT * FROM t'))).toEqual([])
  })

  it('okuma, sıradaki yazma bitmeden başlamaz (yarım yazmayı görmez)', async () => {
    const db = await table()
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const writing = db.write(async (sql) => {
      await sql.run('INSERT INTO t (v) VALUES (?)', ['bir'])
      await gate
      await sql.run('INSERT INTO t (v) VALUES (?)', ['iki'])
    })
    const reading = db.read((sql) => sql.all<{ v: string }>('SELECT v FROM t ORDER BY id'))
    release()
    await writing
    expect((await reading).map((row) => row.v)).toEqual(['bir', 'iki'])
  })

  it('değişiklik bildirimi COMMIT sonrası ve yalnız değişen tablolarla gelir', async () => {
    const db = await table()
    const seen: string[][] = []
    db.subscribe((tables) => seen.push([...tables]))
    await db.write((sql) => sql.run('INSERT INTO t (v) VALUES (?)', ['x']))
    await db.write((sql) => sql.run('UPDATE t SET v = ? WHERE id = ?', ['y', 999]))
    await db.write((sql) => sql.run('DELETE FROM t WHERE v = ?', ['x']))
    expect(seen).toEqual([['t'], ['t']])
  })

  it('okuma işinde yazma denenirse hata verir', async () => {
    const db = await table()
    await expect(db.read((sql) => sql.run('INSERT INTO t (v) VALUES (?)', ['x']))).rejects.toThrow('db.write')
  })

  it('bir işin hatası sıradaki işleri durdurmaz; kapalı bağlantı yol gösteren hata verir', async () => {
    const db = await table()
    const failed = db.read(async () => {
      throw new Error('bozuk')
    })
    const next = db.read((sql) => sql.get<{ n: number }>('SELECT COUNT(*) AS n FROM t'))
    await expect(failed).rejects.toThrow('bozuk')
    expect(await next).toEqual({ n: 0 })
    await db.close()
    await expect(db.read((sql) => sql.all('SELECT 1'))).rejects.toThrow('Veritabanı kapalı')
  })

  it('writtenTable yazılan tabloyu bulur, okumada null döner', () => {
    expect(writtenTable('INSERT INTO records (a) VALUES (?)')).toBe('records')
    expect(writtenTable('  insert or replace into "records" (a) values (1)')).toBe('records')
    expect(writtenTable('UPDATE meta SET value = ?')).toBe('meta')
    expect(writtenTable('DELETE FROM outbox WHERE mid = ?')).toBe('outbox')
    expect(writtenTable('SELECT * FROM records')).toBeNull()
  })
})
