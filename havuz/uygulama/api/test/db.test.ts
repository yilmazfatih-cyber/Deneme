import { afterEach, describe, expect, it } from 'vitest'
import { fromBool, openDatabase, toBool, type Db } from '../src/db/database.ts'

let db: Db
afterEach(() => {
  db.close()
})

function setup(): Db {
  db = openDatabase(':memory:')
  db.exec('CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER NOT NULL) STRICT')
  return db
}

const ids = () => db.all<{ id: string }>('SELECT id FROM t ORDER BY id').map((row) => row.id)

describe('veritabanı sarmalayıcısı', () => {
  it('işlem başarılıysa kaydeder, hata fırlatırsa HEPSİNİ geri alır', () => {
    setup()
    db.transaction(() => {
      db.run('INSERT INTO t VALUES (?, ?)', 'a', 1)
      db.run('INSERT INTO t VALUES (?, ?)', 'b', 2)
    })
    expect(() =>
      db.transaction(() => {
        db.run('INSERT INTO t VALUES (?, ?)', 'c', 3)
        db.run('INSERT INTO t VALUES (?, ?)', 'a', 4) // birincil anahtar çakışması
      }),
    ).toThrow()
    expect(ids()).toEqual(['a', 'b'])
    expect(db.inTransaction).toBe(false)
  })

  it('iç içe işlem SAVEPOINT kullanır: iç hata yakalanırsa yalnız iç kısım geri alınır', () => {
    setup()
    db.transaction(() => {
      db.run('INSERT INTO t VALUES (?, ?)', 'dis', 1)
      try {
        db.transaction(() => {
          db.run('INSERT INTO t VALUES (?, ?)', 'ic', 2)
          throw new Error('iç hata')
        })
      } catch {
        // iç hata bilerek yutuldu
      }
      db.run('INSERT INTO t VALUES (?, ?)', 'son', 3)
    })
    expect(ids()).toEqual(['dis', 'son'])
  })

  it('işlem içinde Promise döndürmek (await) yakalanır ve geri alınır', () => {
    setup()
    expect(() =>
      db.transaction(() => {
        db.run('INSERT INTO t VALUES (?, ?)', 'x', 1)
        return Promise.resolve()
      }),
    ).toThrow(/await\/Promise kullanılamaz/)
    expect(ids()).toEqual([])
  })

  it('parametreler bağlanır (SQL enjeksiyonu metin olarak saklanır); STRICT tür denetimi çalışır', () => {
    setup()
    const evil = "x'); DROP TABLE t; --"
    db.run('INSERT INTO t VALUES (?, ?)', evil, 1)
    expect(ids()).toEqual([evil])
    expect(() => db.run('INSERT INTO t VALUES (?, ?)', 'y', 'sayı değil')).toThrow()
    expect(db.run('UPDATE t SET n = n + 1 WHERE id = ?', evil)).toEqual({ changes: 1, lastInsertRowid: 1 })
  })

  it('mantıksal değer dönüşümleri', () => {
    setup()
    expect([fromBool(true), fromBool(false), toBool(1), toBool(0), toBool(1n)]).toEqual([1, 0, true, false, true])
  })
})
