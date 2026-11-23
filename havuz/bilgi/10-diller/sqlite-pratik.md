---
baslik: SQLite pratik: bağlantı reçetesi, STRICT tablo, işlem kipleri, WAL ve tam metin
ozet: SQLite'ı üretimde güvenle kullanmak; hangi PRAGMA bağlantıya özel, hangisi kalıcı, STRICT tablo, BEGIN IMMEDIATE, şişen WAL, user_version ile migrasyon, FTS5 tetikleyici tuzağı ve node:sqlite ile Python sqlite3 farkları.
etiketler: [sqlite, veritabani, sql, node, python, pragma]
duzey: orta
guncellik: 2026-11
---

# SQLite pratik: bağlantı reçetesi, STRICT tablo, işlem kipleri, WAL ve tam metin

> Bu notu ne zaman okumalı: SQLite ile bir uygulama, betik ya da içe aktarma aracı yazarken; "database is locked",
> durmadan büyüyen `-wal` dosyası, sayı sütununda metin, Node'da NULL çıkan tarih ya da aynı kodun Node ile
> Python'da farklı davranması gibi durumlarda.

## Temel fikir

SQLite sunucu değil, dosyaya yazan bir kitaplıktır. Üç sonucu vardır:

- Ayarların çoğu **bağlantıya özeldir** ve her açılışta yeniden verilmelidir; yalnız birkaçı dosyaya yazılır.
  Uygulama doğru açar, aceleyle yazılmış bakım betiği aynı dosyayı ayarsız açar ve yetim kayıt yazar.
- Varsayılanlar geriye uyum içindir, üretim için değil: Python'da yabancı anahtar denetimi kapalı, `node:sqlite`'ta
  bekleme süresi sıfır, tür denetimi gevşek, günlük kipi `delete`.
- Aynı anda **tek yazar** vardır. WAL kipinde okurlar yazarı beklemez; ama açık unutulmuş bir okuma işlemi WAL
  dosyasını sınırsız büyütür.

Temeller başka notlarda: WAL/`busy_timeout`/`BEGIN IMMEDIATE` ve SQLite–PostgreSQL farkları
[SQL performans ve işlem](sql-performans-ve-islem.md)'de, ertelenmiş işlemin "database is locked" vermesi
[İşlemler ve eşzamanlılık](../30-arkauc/islemler-ve-eszamanlilik.md)'ta, yedek
[Veritabanı yedekleme](../60-devops/veritabani-yedekleme.md)'de, Türkçe katlamalı FTS5 araması
[Arama](../30-arkauc/arama.md)'da. Bu not bunları bir araya getirip eksik kalanları anlatır.

## Bağlantı reçetesi

| PRAGMA         | Değer                     | Kalıcı mı?                                   | Neden                                                         |
| -------------- | ------------------------- | -------------------------------------------- | ------------------------------------------------------------- |
| `journal_mode` | `WAL`                     | Dosyaya yazılır                              | Okurlar yazarı beklemez                                       |
| `foreign_keys` | `ON`                      | Bağlantıya özel (Python'da varsayılan kapalı, `node:sqlite`'ta açık) | Yetim kayıt olmasın                      |
| `busy_timeout` | `5000`                    | Bağlantıya özel (`node:sqlite`'ta varsayılan 0; Python'un `timeout=5.0`'ı 5000 yapar) | Kilitte hemen hata yerine bekle |
| `synchronous`  | `NORMAL`                  | Bağlantıya özel                              | WAL ile güvenli ve hızlı; elektrik kesintisinde son işlemler kaybolabilir, dosya bozulmaz |
| `user_version` | şema sürümü               | Dosyaya yazılır                              | Küçük projede migrasyon numarası                              |
| `optimize`     | kapanışta                 | —                                            | Sorgu planlayıcının istatistikleri                            |
| `quick_check`  | yedekte, teşhiste         | —                                            | Bozulmayı erken görmek (`integrity_check` daha kapsamlı)      |

```python calistir
import os
import sqlite3
import tempfile


def connect(path: str) -> sqlite3.Connection:
    """Her bağlantıda aynı reçete: bağlantıya özel ayarlar her açılışta yeniden verilir."""
    db = sqlite3.connect(path, timeout=5.0, autocommit=True)  # timeout → busy_timeout (ms)
    db.execute("PRAGMA journal_mode = WAL")  # dosyaya yazılır
    db.execute("PRAGMA foreign_keys = ON")  # bağlantıya özel; Python'da varsayılan KAPALI
    db.execute("PRAGMA synchronous = NORMAL")  # bağlantıya özel
    return db


with tempfile.TemporaryDirectory() as folder:
    path = os.path.join(folder, "uygulama.db")
    first = connect(path)
    first.execute("PRAGMA user_version = 3")  # şema sürümü dosyanın başlığına yazılır
    first.close()

    plain = sqlite3.connect(path)  # reçetesiz açılan bağlantı (ör. aceleyle yazılmış bakım betiği)

    def pragma(name: str) -> object:
        return plain.execute(f"PRAGMA {name}").fetchone()[0]

    assert pragma("journal_mode") == "wal"  # kalıcı
    assert pragma("user_version") == 3  # kalıcı
    assert pragma("foreign_keys") == 0  # KAYBOLDU: bu bağlantı yetim kayıt yazabilir
    assert pragma("synchronous") == 2  # FULL'a döndü
    plain.close()
print("tamam")
```

Kural: veritabanını açan **tek bir yardımcı** olsun; uygulama da betikler de testler de onu kullansın. Havuzdaki
uygulamanın sarmalayıcısı aynı reçeteyi uygular ve işlem içinde `await`'i yakalar:
[`api/src/db/database.ts`](../../uygulama/api/src/db/database.ts).

WAL paylaşımlı bellek dosyası (`-shm`) kullanır; ağ dosya sistemlerinde (NFS, SMB) güvenilir çalışmaz. Veritabanı
dosyası yerel diskte durmalı.

## STRICT tablo ve tür yakınlığı

Sıradan SQLite tablosunda sütun türü bir **öneridir** (tür yakınlığı): `INTEGER` sütuna "on iki" metni sessizce
yazılır. `STRICT` tablo bunu reddeder.

```python calistir
import sqlite3

db = sqlite3.connect(":memory:")
db.execute("CREATE TABLE gevsek (yas INTEGER)")
db.execute("INSERT INTO gevsek VALUES ('12'), ('on iki')")  # ikincisi sessizce METİN olarak saklandı
assert db.execute("SELECT yas, typeof(yas) FROM gevsek").fetchall() == [(12, "integer"), ("on iki", "text")]

db.execute(
    """CREATE TABLE kisi (
         id INTEGER PRIMARY KEY,
         yas INTEGER NOT NULL CHECK (yas BETWEEN 0 AND 130),
         aktif INTEGER NOT NULL DEFAULT 1 CHECK (aktif IN (0, 1)),
         dogum TEXT CHECK (dogum GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')
       ) STRICT"""
)
db.execute("INSERT INTO kisi (yas, dogum) VALUES ('12', '2014-05-01')")  # kayıpsız çevrilen '12' kabul
for bad in [("on iki", None), (12.5, None), (12, "01.05.2014")]:
    try:
        db.execute("INSERT INTO kisi (yas, dogum) VALUES (?, ?)", bad)
        raise AssertionError(f"kabul edilmemeliydi: {bad}")
    except sqlite3.IntegrityError:
        pass
for kind in ("BOOLEAN", "DATE", "VARCHAR(20)"):  # STRICT yalnız INT, INTEGER, REAL, TEXT, BLOB, ANY tanır
    try:
        db.execute(f"CREATE TABLE deneme (x {kind}) STRICT")
        raise AssertionError(kind)
    except sqlite3.OperationalError as error:
        assert "unknown datatype" in str(error)
print("tamam")
```

- Mantıksal değer `INTEGER` + `CHECK (x IN (0, 1))`; tarih ISO 8601 metin (`'2026-11-23'`, anlar için
  `'2026-11-23T10:00:00Z'`) ya da Unix saniyesi `INTEGER`. Para kuruş `INTEGER`
  ([Veritabanı tasarımı](../30-arkauc/veritabani-tasarimi.md)).
- `STRICT` var olan tabloya sonradan eklenemez; yeni tablo kurup veriyi taşımak gerekir
  ([Migrasyonlar](../30-arkauc/migrasyonlar.md)).

## İşlem kipleri: node:sqlite ile Python sqlite3

Aynı iş iki ortamda farklı davranır. Aşağıdakilerin hepsi bu makinede (Node 22.23.4, Python 3.13) denendi:

| Konu                         | `node:sqlite` (`DatabaseSync`)                                    | Python `sqlite3`                                                    |
| ---------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| Varsayılan işlem davranışı   | Her ifade kendi işlemi; `BEGIN`'i siz yazarsınız                  | Eski kip: INSERT/UPDATE/DELETE'ten önce gizli `BEGIN`; `commit()` sizin işiniz; SELECT ve DDL işlem açmaz |
| Önerilen kullanım            | `BEGIN IMMEDIATE` … `COMMIT`, hatada `ROLLBACK`                   | `autocommit=True` ile bağlanıp `BEGIN IMMEDIATE`'i açıkça yazmak     |
| `autocommit=False`           | —                                                                 | Bağlanır bağlanmaz işlem açılır; her `commit()` sonrası yenisi       |
| Bağlam yöneticisi            | Yok: kendi `transaction()` yardımcınızı yazın                     | `with db:` commit/rollback eder ama bağlantıyı **kapatmaz**          |
| Çok ifadeli betik            | `exec(betik)` atomik değil: hatadan öncekiler kalır               | `executescript` önce bekleyen işlemi commit eder                    |
| Yabancı anahtar varsayılanı  | Açık (`enableForeignKeyConstraints`)                              | Kapalı                                                              |
| Bekleme süresi varsayılanı   | 0 (`timeout` seçeneği)                                            | `timeout=5.0` → 5000 ms                                             |
| 2^53'ten büyük tamsayı       | Okurken `RangeError`; `setReadBigInts(true)` ile BigInt           | Sorunsuz (Python tamsayısı)                                         |
| Tarih bağlamak               | Tek parametre olarak `Date` → sessizce NULL                       | `datetime` → `'2026-11-23 10:00:00'` metni + kullanımdan kalkma uyarısı |
| Uyarı                        | Çalışınca "ExperimentalWarning" basar                             | —                                                                   |

```js calistir
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'

const db = new DatabaseSync(':memory:') // Node 22.23: foreign_keys AÇIK, busy_timeout 0 (timeout seçeneğiyle verilir)
db.exec('CREATE TABLE olay (id INTEGER PRIMARY KEY, zaman TEXT)')

// TUZAK 1: Date tek parametre olarak verilince "adlandırılmış parametre nesnesi" sanılır → sessizce NULL
db.prepare('INSERT INTO olay (zaman) VALUES (?)').run(new Date('2026-11-23T10:00:00Z'))
assert.equal(db.prepare('SELECT zaman FROM olay').get().zaman, null)
db.prepare('INSERT INTO olay (zaman) VALUES (?)').run(new Date('2026-11-23T10:00:00Z').toISOString()) // DOĞRU
assert.throws(() => db.prepare('SELECT ?').get(true)) // mantıksal değer bağlanamaz: 1/0 verin

// TUZAK 2: exec ile çok ifadeli betik atomik değildir; hatadan öncekiler kalır
db.exec('CREATE TABLE etiket (ad TEXT PRIMARY KEY)')
assert.throws(() => db.exec("INSERT INTO etiket VALUES ('a'); INSERT INTO etiket VALUES ('a');"))
assert.equal(db.prepare('SELECT count(*) AS n FROM etiket').get().n, 1)

// DOĞRU: yazan iş tek işlemde, BEGIN IMMEDIATE ile; hata olursa geri al. İçinde await YOK.
function transaction(fn) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK')
    throw error
  }
}
assert.throws(() =>
  transaction(() => {
    db.prepare("INSERT INTO etiket VALUES ('b')").run()
    db.prepare("INSERT INTO etiket VALUES ('a')").run() // çakışma → 'b' de geri alınır
  }),
)
assert.equal(db.prepare('SELECT count(*) AS n FROM etiket').get().n, 1)

// TUZAK 3: 2^53 üstü tamsayı okunurken hata verir (Python'da sorun yok)
assert.throws(() => db.prepare('SELECT 9007199254740993 AS x').get(), { code: 'ERR_OUT_OF_RANGE' })
console.log('tamam')
```

`NOT NULL` kısıtı birinci tuzağı yakalar: tarih sütunu zorunluysa sessiz NULL yerine hata alırsınız. Bu yüzden
"zorunlu" alanları şemada da zorunlu yazın.

## WAL'ın büyümesi ve toplu yazma

WAL dosyası, okuyan hiçbir işlem eski sayfalara bakmıyorsa ana dosyaya aktarılıp sıfırlanır (checkpoint). Açık
unutulan tek bir okuma işlemi bunu engeller:

```python calistir
import os
import sqlite3
import tempfile

with tempfile.TemporaryDirectory() as folder:
    path = os.path.join(folder, "kayit.db")
    writer = sqlite3.connect(path, autocommit=True)
    writer.execute("PRAGMA journal_mode = WAL")
    writer.execute("CREATE TABLE kayit (metin TEXT)")

    def wal_frames() -> int:
        return writer.execute("PRAGMA wal_checkpoint(PASSIVE)").fetchone()[1]  # WAL'daki sayfa sayısı

    # Okuma işlemini açık unutan bağlantı: autocommit=False'ta SELECT'ten sonra commit yok
    reader = sqlite3.connect(path, autocommit=False)
    reader.execute("SELECT count(*) FROM kayit").fetchone()

    for _ in range(500):  # YANLIŞ: her satır ayrı işlem; her biri WAL'a en az bir sayfa yazar
        writer.execute("INSERT INTO kayit VALUES (?)", ("x" * 100,))
    one_by_one = wal_frames()
    busy = writer.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()[0]
    assert busy == 1  # açık okuyucu yüzünden WAL sıfırlanamadı: dosya büyümeye devam eder

    reader.commit()  # okuyucu bıraktı
    assert writer.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone() == (0, 0, 0)
    assert os.path.getsize(path + "-wal") == 0

    writer.execute("BEGIN IMMEDIATE")  # DOĞRU: toplu yazma tek işlemde
    writer.executemany("INSERT INTO kayit VALUES (?)", [("x" * 100,)] * 500)
    writer.execute("COMMIT")
    batched = wal_frames()
    assert one_by_one >= 500 and batched < 20, (one_by_one, batched)
    reader.close()
    writer.close()
print("tamam")
```

Aynı deneyde 2.000 tek tek eklemede `-wal` dosyası yaklaşık 9 MB'a çıktı (400 KB'lık veri için). Açık okuma
işleminin olağan kaynakları: Python'da `autocommit=False` ile okuyup commit etmemek, sonuna dek okunmamış imleç,
uzun süren rapor sorgusu, hata ayıklamada açık bırakılmış komut satırı oturumu. WAL boyutunu izleyin; sürekli
büyüyorsa açık okuyucu arayın.

## user_version ile küçük migrasyon

```python calistir
import sqlite3

MIGRATIONS = [
    "CREATE TABLE gorev (id INTEGER PRIMARY KEY, baslik TEXT NOT NULL) STRICT",
    "ALTER TABLE gorev ADD COLUMN bitti INTEGER NOT NULL DEFAULT 0 CHECK (bitti IN (0, 1))",
    "CREATE INDEX gorev_bitti ON gorev (bitti)",
]


def migrate(db: sqlite3.Connection, migrations: list[str]) -> int:
    current = db.execute("PRAGMA user_version").fetchone()[0]
    for number, sql in enumerate(migrations[current:], start=current + 1):
        db.execute("BEGIN IMMEDIATE")
        try:
            db.execute(sql)
            db.execute(f"PRAGMA user_version = {number}")  # sürüm değişiklikle AYNI işlemde
            db.execute("COMMIT")
        except Exception:
            db.execute("ROLLBACK")
            raise
    return db.execute("PRAGMA user_version").fetchone()[0]


db = sqlite3.connect(":memory:", autocommit=True)
assert migrate(db, MIGRATIONS[:2]) == 2
assert migrate(db, MIGRATIONS) == 3  # yalnız eksik olan uygulandı
try:
    migrate(db, [*MIGRATIONS, "ALTER TABLE yok ADD COLUMN x INTEGER"])
    raise AssertionError("hata bekleniyordu")
except sqlite3.OperationalError:
    pass
assert db.execute("PRAGMA user_version").fetchone()[0] == 3  # bozuk migrasyon sürümü ilerletmedi
print("tamam")
```

Bu, tek kişilik betik ve araç için yeter. Ekipli projede uygulanan dosyaların adını ve içerik özetini tutan bir
migrasyon tablosu daha güvenlidir (değiştirilmiş eski dosyayı yakalar): havuzdaki
[`api/src/db/migrate.ts`](../../uygulama/api/src/db/migrate.ts) böyle çalışır.

## FTS5: dizini güncel tutmak ve tetikleyici tuzağı

Türkçe katlama ve kullanıcı metnini güvenle sorguya çevirmek [Arama](../30-arkauc/arama.md) notundadır. Dizini
güncel tutmanın kolay yolu tetikleyicidir; ama tetikleyici uygulamanın kaydettiği bir işlevi (katlama) çağırırsa
aynı dosyaya yazan **her istemci** o işlevi kaydetmek zorunda kalır:

```python calistir
import os
import sqlite3
import tempfile

KATLA = str.maketrans("çğıöşüâîû", "cgiosuaiu")


def katla(metin: str) -> str:
    return metin.replace("İ", "i").replace("I", "ı").lower().translate(KATLA)


with tempfile.TemporaryDirectory() as folder:
    path = os.path.join(folder, "notlar.db")
    app = sqlite3.connect(path, autocommit=True)
    app.create_function("katla", 1, katla, deterministic=True)  # YALNIZ bu bağlantıda tanımlı
    app.executescript("""
    CREATE TABLE notlar (id INTEGER PRIMARY KEY, metin TEXT NOT NULL);
    CREATE VIRTUAL TABLE notlar_fts USING fts5(metin);
    CREATE TRIGGER notlar_ekle AFTER INSERT ON notlar BEGIN
      INSERT INTO notlar_fts (rowid, metin) VALUES (new.id, katla(new.metin));
    END;
    CREATE TRIGGER notlar_sil AFTER DELETE ON notlar BEGIN
      DELETE FROM notlar_fts WHERE rowid = old.id;
    END;
    """)
    app.execute("INSERT INTO notlar (metin) VALUES ('Iğdır kayısısı')")

    def ara(soru: str) -> list[int]:
        return [r[0] for r in app.execute("SELECT rowid FROM notlar_fts WHERE notlar_fts MATCH ?", (katla(soru),))]

    assert ara("IĞDIR") == ara("igdir") == [1]

    # Aynı dosyayı açan başka istemci (bakım betiği, sqlite3 komut satırı) işlevi bilmez: yazma KIRILIR
    tool = sqlite3.connect(path, autocommit=True)
    try:
        tool.execute("INSERT INTO notlar (metin) VALUES ('Çorum leblebisi')")
        raise AssertionError("hata bekleniyordu")
    except sqlite3.OperationalError as error:
        assert "no such function: katla" in str(error)
    tool.close()
    app.close()
print("tamam")
```

Seçenekler: (1) katlanmış metni uygulama hesaplayıp ayrı bir sütuna yazar, tetikleyici yalnız o sütunu kopyalar
(işlev gerekmez; sütun `NOT NULL` olursa unutan istemci gürültüyle hata alır); (2) dizini tetikleyici yerine
uygulamanın tek yazma yolunda, aynı işlemde günceller. Güncelleme (`UPDATE`) tetikleyicisini de unutmayın.
Bu ortamın SQLite derlemesinde `trigram` ayırıcısı da var (sözcük içinden arama için; denendi).

## Küçük ama sık gereken kalıplar

```sql calistir
CREATE TABLE stok (urun TEXT PRIMARY KEY, adet INTEGER NOT NULL CHECK (adet >= 0)) STRICT;
INSERT INTO stok VALUES ('çay', 5), ('şeker', 2), ('süt', 0);
-- UPSERT + RETURNING: tek gidişte "yoksa ekle, varsa artır" ve yeni değeri oku
INSERT INTO stok VALUES ('çay', 3) ON CONFLICT (urun) DO UPDATE SET adet = adet + excluded.adet RETURNING urun, adet;
-- Değişken uzunlukta IN listesi: tek JSON parametresi (uygulamada '?' ile bağlanır; "?, ?, ?" dizesi kurulmaz)
SELECT urun FROM stok WHERE urun IN (SELECT value FROM json_each('["çay","süt","kahve"]')) ORDER BY urun;
```

```cikti
çay|8
süt
çay
```

Son sorgudaki sıra da bir derstir: SQLite metni bayt sırasıyla sıralar ve "ç" "s"den sonra gelir. Türkçe sıralama
uygulamada yapılır ya da önceden hesaplanmış bir sıralama anahtarı sütunuyla
([Büyük/küçük harf](../97-turkce/buyuk-kucuk-harf.md)).

## Tuzaklar

| Belirti                                                        | Neden                                                         | Çözüm                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| Yetim kayıtlar yalnız bakım betiğinden sonra ortaya çıkıyor    | Betik reçetesiz bağlandı: `foreign_keys` kapalı               | Tek `connect()` yardımcısı                                  |
| `node:sqlite`'ta ara sıra hemen "database is locked"           | Varsayılan bekleme süresi 0                                   | `timeout` seçeneği ya da `busy_timeout`                     |
| `busy_timeout` var ama "locked" yine anında                    | Ertelenmiş işlem okuduktan sonra yazmaya kalktı               | Yazacak işlemi `BEGIN IMMEDIATE` ile açın                   |
| `-wal` dosyası gigabaytlarca                                   | Açık unutulmuş okuma işlemi                                   | `commit`/`close`; kısa işlemler; WAL boyutunu izleyin       |
| Toplu içe aktarma dakikalar sürüyor                            | Her satır ayrı işlem                                          | Tek işlem + `executemany`                                   |
| Sayı sütununda metin, sıralama ve toplama tuhaf                | Tür yakınlığı gevşek                                          | `STRICT` + `CHECK`                                          |
| Node'da tarih sütunu NULL                                      | `Date` doğrudan bağlandı                                      | `toISOString()`; sütuna `NOT NULL`                          |
| Node'da büyük kimlik okununca `RangeError`                     | 2^53 üstü tamsayı                                             | `setReadBigInts(true)` ya da kimliği metin saklayın         |
| Migrasyon yarıda kaldı, şema yarım                             | `exec(betik)` atomik değil                                    | `BEGIN IMMEDIATE` … `COMMIT` içinde çalıştırın              |
| `with sqlite3.connect(…) as db:` sonrası dosya hâlâ kilitli    | `with` commit eder, kapatmaz                                  | `close()` ya da `contextlib.closing`                        |
| Komut satırından kayıt eklenince "no such function"            | Tetikleyici uygulamanın kaydettiği işlevi çağırıyor           | Katlanmış sütunu uygulama yazsın                            |
| Liste "ç" ile başlayanları en sona koyuyor                     | Bayt sırasıyla sıralama                                       | Uygulamada Türkçe sıralama ya da sıralama anahtarı          |
| Python 3.12+ "default datetime adapter is deprecated"          | `datetime` doğrudan bağlandı                                  | ISO metin                                                   |
| Ağ diskindeki veritabanında kilit ve bozulma sorunları         | WAL'ın paylaşımlı belleği ağ dosya sisteminde çalışmaz        | Yerel disk                                                  |

## Denetim listesi

- [ ] Veritabanını açan tek yardımcı var (WAL, `foreign_keys`, `busy_timeout`, `synchronous`); betikler ve testler
      de onu kullanıyor.
- [ ] Yeni tablolar `STRICT`; mantıksal ve tarih alanlarında `CHECK`; zorunlu alanlar `NOT NULL`.
- [ ] Yazan işler `BEGIN IMMEDIATE` … `COMMIT`; hatada `ROLLBACK`; işlemin içinde `await` ya da ağ çağrısı yok.
- [ ] Toplu yazma tek işlemde.
- [ ] Uzun süre açık kalan okuma işlemi yok; WAL boyutu izleniyor.
- [ ] Şema sürümü `user_version` ya da migrasyon tablosuyla; migrasyon ve sürüm aynı işlemde.
- [ ] Yedek `VACUUM INTO` ya da yedek API'siyle (`backup`); çalışan dosya kopyalanmıyor.
- [ ] Node'da tarih metin olarak saklanıyor; büyük tamsayı politikası belli.
- [ ] Tam metin dizini yazmayla aynı işlemde güncelleniyor; dizine yazan her istemci aynı katlamayı kullanıyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Veritabanına yalnız projedeki `connect()` ve `transaction()` yardımcılarıyla eriş. Yeni tabloyu
  `STRICT` yaz; mantıksal alan `INTEGER` + `CHECK (x IN (0, 1))`, tarih ISO metin. Yazma işini `BEGIN IMMEDIATE` ile
  tek işlemde yap, içinde `await` olmasın. Toplu eklemeyi tek işlemde `executemany` ile yap."
- **Modelin tipik hatası:** Her betikte yeni bağlantı açıp PRAGMA'ları unutur; `BOOLEAN`, `DATETIME`, `VARCHAR(255)`
  yazar (STRICT'te hata, gevşek tabloda anlamsız); döngüde tek tek INSERT yapar; `node:sqlite`'ta `Date` bağlar;
  `db.exec(migrasyon)`'u atomik sanır; `with sqlite3.connect(...)` bağlantıyı kapatır sanır.
- **Çıktıda arayın:** yardımcı dışında `sqlite3.connect(` / `new DatabaseSync(`; `BOOLEAN`, `DATETIME`,
  `VARCHAR`; döngü içinde `execute("INSERT`; `.run(new Date`; çok ifadeli `exec(`; `with sqlite3.connect`.
- **Test isteyin:** yardımcıyla açılan bağlantıda `PRAGMA foreign_keys` değerinin 1 olduğu; yarıda kalan
  migrasyonun sürümü ilerletmediği; toplu içe aktarmanın tek işlemde yapıldığı testler.

## İlgili

- [SQL performans ve işlem](sql-performans-ve-islem.md) — dizin, sorgu planı, yalıtım, SQLite–PostgreSQL farkları
- [SQL sorgu yazımı](sql-sorgu.md) — NULL, birleştirme, pencere işlevleri
- [İşlemler ve eşzamanlılık](../30-arkauc/islemler-ve-eszamanlilik.md) — kayıp güncelleme, ertelenmiş işlem
- [Arama](../30-arkauc/arama.md) — FTS5, Türkçe katlama, BM25
- [Veritabanı yedekleme](../60-devops/veritabani-yedekleme.md) — `VACUUM INTO`, geri yükleme tatbikatı
- [Arka plan işleri](../30-arkauc/arka-plan-isleri.md) — SQLite üstünde iş kuyruğu
- [Veritabanı ölçekleme](../40-sistem-tasarimi/veritabani-olcekleme.md) — SQLite'ın yettiği ve yetmediği yer
- [Node akışları ve dosya](node-akislar-ve-dosya.md) — dosya kopyalamanın neden yedek olmadığı, atomik yazma
