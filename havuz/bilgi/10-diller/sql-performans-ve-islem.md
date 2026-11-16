---
baslik: SQL performans ve işlem
ozet: Dizinin çalışma biçimi ve kullanılmadığı durumlar, bileşik dizin sırası, sorgu planı okuma, N+1, ofset ve imleç sayfalama, işlem ve yalıtım, kayıp güncelleme, SQLite ile PostgreSQL farkları.
etiketler: [sql, sqlite, postgresql, dizin, islem, performans]
duzey: ileri
guncellik: 2026-11
---

# SQL performans ve işlem

> Bu notu ne zaman okumalı: bir sorgu ya da sayfa yavaşladığında; dizin (index) eklerken; liste sayfalarken; para,
> stok, sayaç gibi aynı kaydı birden çok isteğin değiştirdiği durumlarda; SQLite'tan PostgreSQL'e geçerken.

## Temel fikir

- **Dizin**, bir ya da birkaç sütunun **sıralı kopyasıdır** (B-ağacı) ve her girdinin yanında satırın yeri durur.
  Sıralı olduğu için eşitlik ve aralık araması logaritmik sürer; sütunu değiştiren (işlev, baştan joker) aramada
  sıra işe yaramaz ve veritabanı tabloyu baştan sona tarar.
- Dizin okumayı hızlandırır, **yazmayı yavaşlatır** ve yer kaplar. Her dizin bir sorguya hizmet etmelidir.
- Tahmin etmeyin, **plana bakın**: SQLite'ta `EXPLAIN QUERY PLAN`, PostgreSQL'de `EXPLAIN ANALYZE`.
- **İşlem** (transaction) birden çok değişikliği "ya hepsi ya hiçbiri" yapar. Ama işlem tek başına eşzamanlı iki
  isteğin birbirinin yazdığını ezmesini (kayıp güncelleme) her zaman önlemez.
- Örnekler SQLite 3.53 ile, Python'un `sqlite3` modülüyle çalıştırıldı.

## Dizin ne zaman kullanılır, ne zaman kullanılmaz

```python calistir
import sqlite3

db = sqlite3.connect(":memory:")
db.execute("CREATE TABLE kullanici (id INTEGER PRIMARY KEY, eposta TEXT, ad TEXT)")
db.executemany("INSERT INTO kullanici (eposta, ad) VALUES (?, ?)", [(f"k{i}@ornek.com", f"Ad{i}") for i in range(5000)])


def plan(sql: str) -> str:
    return " / ".join(satir[3] for satir in db.execute("EXPLAIN QUERY PLAN " + sql, ()))


assert plan("SELECT * FROM kullanici WHERE eposta = 'x'").startswith("SCAN")  # dizin yok: tam tarama
db.execute("CREATE INDEX ix_kullanici_eposta ON kullanici(eposta)")
assert "USING INDEX ix_kullanici_eposta (eposta=?)" in plan("SELECT * FROM kullanici WHERE eposta = 'x'")

# Sütunu işleve sokmak dizini devre dışı bırakır
assert plan("SELECT * FROM kullanici WHERE lower(eposta) = 'x'").startswith("SCAN")
# Baştaki joker taranamaz; SQLite'ta LIKE büyük/küçük harf duyarsız olduğu için 'k1%' bile düz dizini kullanmaz
assert plan("SELECT * FROM kullanici WHERE eposta LIKE '%ornek.com'").startswith("SCAN")
assert plan("SELECT * FROM kullanici WHERE eposta LIKE 'k1%'").startswith("SCAN")
# Önek araması için aralık yazın (ya da GLOB 'k1*')
assert "USING INDEX" in plan("SELECT * FROM kullanici WHERE eposta >= 'k1' AND eposta < 'k2'")

# İşlevli arama gerekiyorsa ifade dizini
db.execute("CREATE INDEX ix_kullanici_eposta_kucuk ON kullanici(lower(eposta))")
assert "USING INDEX ix_kullanici_eposta_kucuk" in plan("SELECT * FROM kullanici WHERE lower(eposta) = 'x'")
print("tamam")
```

| Durum                                             | Dizin işe yarar mı | Ne yapmalı                                                 |
| ------------------------------------------------- | ------------------ | ---------------------------------------------------------- |
| `WHERE sutun = ?`, `IN (…)`, aralık (`>`, `<`)      | Evet               |                                                            |
| `WHERE islev(sutun) = ?` (`lower`, `date`, `substr`) | Hayır              | İfade dizini ya da katlanmış ayrı sütun                    |
| `LIKE '%kelime%'`                                  | Hayır              | Tam metin arama (SQLite FTS5, PostgreSQL `tsvector`/trigram) |
| Seçiciliği düşük sütun (`aktif` 0/1, cinsiyet)     | Çoğu zaman hayır   | Bileşik dizinin ikinci sütunu yapın ya da kısmi dizin      |
| Çok küçük tablo (birkaç yüz satır)                 | Fark etmez         | Eklemeyin                                                  |
| Yabancı anahtar sütunu (`siparis.musteri_id`)       | Evet, hemen hep    | Her yabancı anahtara dizin; PostgreSQL bunu kendiliğinden **yapmaz** |
| `ORDER BY … LIMIT` sık kullanılıyor                 | Evet               | Süzgeç + sıralama sütunlarında bileşik dizin               |

## Bileşik dizin sırası

Bileşik dizin `(a, b)` telefon rehberi gibidir: önce soyada, sonra ada göre sıralı. Yalnız ada göre arama
rehberin tamamını okumayı gerektirir. Kural: **eşitlik sütunları önce, aralık ya da sıralama sütunu sonra.**

```python calistir
import sqlite3

db = sqlite3.connect(":memory:")
db.execute("CREATE TABLE siparis (id INTEGER PRIMARY KEY, musteri_id INTEGER, tarih TEXT, tutar INTEGER)")
db.executemany(
    "INSERT INTO siparis (musteri_id, tarih, tutar) VALUES (?, ?, ?)",
    [(i % 500, f"2026-{1 + i % 12:02d}-{1 + i % 28:02d}", i) for i in range(5000)],
)


def plan(sql: str) -> str:
    return " / ".join(satir[3] for satir in db.execute("EXPLAIN QUERY PLAN " + sql, ()))


db.execute("CREATE INDEX ix_siparis_musteri_tarih ON siparis(musteri_id, tarih)")
assert "(musteri_id=?)" in plan("SELECT * FROM siparis WHERE musteri_id = 1")
assert "(musteri_id=? AND tarih>?)" in plan("SELECT * FROM siparis WHERE musteri_id = 1 AND tarih >= '2026-06'")
assert plan("SELECT * FROM siparis WHERE tarih >= '2026-06'").startswith("SCAN")  # baştaki sütun yok
# Dizin sırası ORDER BY'ı da karşılar: ayrı sıralama adımı yok
assert "TEMP B-TREE" not in plan("SELECT * FROM siparis WHERE musteri_id = 1 ORDER BY tarih DESC LIMIT 5")
assert "USE TEMP B-TREE FOR ORDER BY" in plan("SELECT * FROM siparis WHERE musteri_id = 1 ORDER BY tutar DESC")
# Kapsayan dizin: istenen bütün sütunlar dizinde, tabloya hiç gidilmez
assert "COVERING INDEX" in plan("SELECT musteri_id, tarih FROM siparis WHERE musteri_id = 1")

# Ters sıra (aralık önce): dizinin yalnız ilk sütunu kullanılır
db.execute("DROP INDEX ix_siparis_musteri_tarih")
db.execute("CREATE INDEX ix_siparis_tarih_musteri ON siparis(tarih, musteri_id)")
assert "(tarih>?)" in plan("SELECT * FROM siparis WHERE musteri_id = 1 AND tarih >= '2026-06'")
print("tamam")
```

## Sorgu planı okuma

| Planda gördüğünüz (SQLite)              | Anlamı                                        | PostgreSQL karşılığı              |
| --------------------------------------- | --------------------------------------------- | --------------------------------- |
| `SCAN tablo`                            | Tablonun tamamı okunuyor                      | `Seq Scan`                        |
| `SEARCH tablo USING INDEX ix (a=?)`      | Dizinle arama; ayraçta kullanılan sütunlar    | `Index Scan`                      |
| `USING COVERING INDEX`                  | Yalnız dizin okunuyor                         | `Index Only Scan`                 |
| `USE TEMP B-TREE FOR ORDER BY`           | Sonuç ayrıca sıralanıyor                      | `Sort`                            |
| `USING AUTOMATIC COVERING INDEX`         | SQLite geçici dizin kurdu: kalıcı dizin eksik | —                                 |
| `CORRELATED SCALAR SUBQUERY`             | Alt sorgu her satır için yeniden çalışıyor    | `SubPlan`                         |

Plan küçük test verisinde farklı, gerçek veride farklı olabilir: planlayıcı istatistiğe bakar. Planı gerçek
boyutlu veride alın; SQLite'ta istatistik için `ANALYZE` (ya da `PRAGMA optimize`) çalıştırın.

## N+1 sorgu

Listedeki her öğe için ayrı sorgu atmak (1 liste sorgusu + N ayrıntı sorgusu) küçük veride görünmez, gerçek veride
sayfayı kilitler. ORM'lerde "tembel yükleme" (lazy loading) en sık nedendir. Sorguları sayarak yakalayın:

```python calistir
import sqlite3

db = sqlite3.connect(":memory:")
db.execute("CREATE TABLE musteri (id INTEGER PRIMARY KEY, ad TEXT)")
db.execute("CREATE TABLE siparis (id INTEGER PRIMARY KEY, musteri_id INTEGER, tutar INTEGER)")
db.executemany("INSERT INTO musteri (ad) VALUES (?)", [(f"Müşteri {i}",) for i in range(50)])
db.executemany("INSERT INTO siparis (musteri_id, tutar) VALUES (?, ?)", [(1 + i % 50, i) for i in range(200)])
sorgular: list[str] = []
db.set_trace_callback(sorgular.append)  # çalışan her ifadeyi kaydeder

# YANLIŞ: N+1
for musteri_id, _ad in db.execute("SELECT id, ad FROM musteri").fetchall():
    db.execute("SELECT SUM(tutar) FROM siparis WHERE musteri_id = ?", (musteri_id,)).fetchone()
assert len(sorgular) == 51

# DOĞRU: tek sorgu (ya da iki sorgu: liste + WHERE musteri_id IN (…))
sorgular.clear()
toplamlar = db.execute(
    "SELECT m.id, m.ad, COALESCE(SUM(s.tutar), 0) FROM musteri m "
    "LEFT JOIN siparis s ON s.musteri_id = m.id GROUP BY m.id"
).fetchall()
assert len(sorgular) == 1 and len(toplamlar) == 50
print("tamam")
```

Testte sorgu sayısını sınırlayan bir doğrulama (`assert len(sorgular) <= 3`) N+1'in geri dönmesini önler.

## Sayfalama: ofset ve imleç

`LIMIT 20 OFFSET 49000` veritabanına 49 000 satırı okuyup atmasını söyler; sayfa ilerledikçe yavaşlar. Ayrıca iki
sayfa arasında yeni kayıt eklenirse kayıtlar **tekrar eder ya da atlanır**. İmleç (keyset) sayfalama son görülen
satırdan devam eder:

```python calistir
import sqlite3

db = sqlite3.connect(":memory:")
db.execute("CREATE TABLE ileti (id INTEGER PRIMARY KEY, zaman TEXT)")
db.execute("CREATE INDEX ix_ileti_zaman ON ileti(zaman, id)")
db.executemany("INSERT INTO ileti (zaman) VALUES (?)", [(f"2026-11-{1 + i // 5000:02d} {i % 5000:05d}",) for i in range(50_000)])
SIRA = "ORDER BY zaman DESC, id DESC"  # eşsiz bir sütunla biter


def adim_say(sql: str, p: tuple = ()) -> tuple[int, list]:
    sayac = [0]

    def say() -> int:
        sayac[0] += 1
        return 0

    db.set_progress_handler(say, 100)  # her 100 sanal makine adımında bir çağrılır: belirlenimci iş ölçüsü
    satirlar = db.execute(sql, p).fetchall()
    db.set_progress_handler(None, 0)
    return sayac[0] * 100, satirlar


ofset_is, sayfa1 = adim_say(f"SELECT id FROM ileti {SIRA} LIMIT 20 OFFSET 49000")
son = db.execute(f"SELECT zaman, id FROM ileti {SIRA} LIMIT 1 OFFSET 48999").fetchone()
imlec_is, sayfa2 = adim_say(f"SELECT id FROM ileti WHERE (zaman, id) < (?, ?) {SIRA} LIMIT 20", son)
assert sayfa1 == sayfa2
assert ofset_is > 100 * imlec_is  # aynı sayfa için yüzlerce kat iş (denemede ~98 000'e 200)

# Sayfalar arasında yeni kayıt gelince ofset sayfalama aynı kaydı İKİ KEZ gösterir
ilk = [r[0] for r in db.execute(f"SELECT id FROM ileti {SIRA} LIMIT 3")]
db.execute("INSERT INTO ileti (zaman) VALUES ('2026-11-30 99999')")
ikinci_ofset = [r[0] for r in db.execute(f"SELECT id FROM ileti {SIRA} LIMIT 3 OFFSET 3")]
assert ikinci_ofset[0] == ilk[-1]  # tekrar
son_gorulen = db.execute("SELECT zaman, id FROM ileti WHERE id = ?", (ilk[-1],)).fetchone()
ikinci_imlec = [r[0] for r in db.execute(f"SELECT id FROM ileti WHERE (zaman, id) < (?, ?) {SIRA} LIMIT 3", son_gorulen)]
assert not set(ikinci_imlec) & set(ilk)  # tekrar yok
print("tamam")
```

| Yöntem             | Artısı                                    | Eksisi                                                  |
| ------------------ | ----------------------------------------- | ------------------------------------------------------- |
| Ofset (`OFFSET n`) | "5. sayfaya git" kolay; toplam sayfa sayısı | Derin sayfada yavaş; ekleme/silmede tekrar ve atlama     |
| İmleç (keyset)     | Her sayfa aynı hızda; tutarlı             | Rastgele sayfaya atlanmaz; imleç = son satırın sıralama sütunları |

Sonsuz kaydırma ve API'ler için imleç; küçük yönetim tablolarında ofset yeterlidir. Havuzdaki gerçekleme:
[`kutuphane/py/kutuphane/sayfalama.py`](../../kutuphane/py/kutuphane/sayfalama.py).

## İşlem: ya hepsi ya hiçbiri

```python calistir
import sqlite3

db = sqlite3.connect(":memory:")
db.execute("CREATE TABLE hesap (ad TEXT PRIMARY KEY, bakiye INTEGER CHECK (bakiye >= 0))")
db.execute("INSERT INTO hesap VALUES ('ayse', 100), ('can', 0)")
db.commit()

# with bağlantı: başarıda COMMIT, istisnada ROLLBACK (bağlantıyı kapatmaz)
try:
    with db:
        db.execute("UPDATE hesap SET bakiye = bakiye + 150 WHERE ad = 'can'")
        db.execute("UPDATE hesap SET bakiye = bakiye - 150 WHERE ad = 'ayse'")  # CHECK ihlali
except sqlite3.IntegrityError:
    pass
assert db.execute("SELECT * FROM hesap ORDER BY ad").fetchall() == [("ayse", 100), ("can", 0)]  # yarım iş yok
print("tamam")
```

Toplu ekleme de tek işlemde yapılmalıdır: her `INSERT` kendi işlemiyle yazılırsa her satır ayrı bir diske yazma
(`fsync`) bekler ve toplu ekleme kat kat yavaşlar; fark diskin hızına bağlıdır, kendi ortamınızda ölçün.

## Kayıp güncelleme

İki istek aynı satırı okur, ikisi de kendi hesapladığı değeri yazar; ilk yazılan kaybolur. Okuma ile yazma
arasında işlem olsa bile ayrı okuma + yazma kalıbı tehlikelidir.

```python calistir
import sqlite3

yol = "stok.db"  # çalışma klasöründe geçici dosya
a = sqlite3.connect(yol, isolation_level=None)  # iki ayrı istek gibi iki bağlantı
b = sqlite3.connect(yol, isolation_level=None)
a.execute("CREATE TABLE stok (id INTEGER PRIMARY KEY, adet INTEGER, surum INTEGER DEFAULT 0)")
a.execute("INSERT INTO stok (id, adet) VALUES (1, 10)")

# YANLIŞ: oku → uygulamada hesapla → yaz
adet_a = a.execute("SELECT adet FROM stok WHERE id = 1").fetchone()[0]
adet_b = b.execute("SELECT adet FROM stok WHERE id = 1").fetchone()[0]
a.execute("UPDATE stok SET adet = ? WHERE id = 1", (adet_a - 3,))
b.execute("UPDATE stok SET adet = ? WHERE id = 1", (adet_b - 2,))
assert a.execute("SELECT adet FROM stok").fetchone()[0] == 8  # 5 olmalıydı

# DOĞRU 1: atomik güncelleme; koşul da aynı ifadede (stok eksiye düşmez)
a.execute("UPDATE stok SET adet = 10")
for istek, miktar in ((a, 3), (b, 2), (a, 9)):
    sonuc = istek.execute("UPDATE stok SET adet = adet - ? WHERE id = 1 AND adet >= ?", (miktar, miktar))
    if sonuc.rowcount == 0:
        pass  # yetersiz stok: kullanıcıya bildir
assert a.execute("SELECT adet FROM stok").fetchone()[0] == 5

# DOĞRU 2: iyimser kilit (sürüm sütunu); okuma ile yazma arasında başkası yazdıysa 0 satır değişir
adet, surum = a.execute("SELECT adet, surum FROM stok WHERE id = 1").fetchone()
b.execute("UPDATE stok SET adet = adet - 1, surum = surum + 1 WHERE id = 1")  # araya giren istek
degisen = a.execute(
    "UPDATE stok SET adet = ?, surum = surum + 1 WHERE id = 1 AND surum = ?", (adet - 2, surum)
).rowcount
assert degisen == 0  # çakışma algılandı: yeniden okuyup tekrar deneyin ya da kullanıcıya sorun
print("tamam")
```

## Yalıtım ve kilitler

| Veritabanı  | Varsayılan                                        | Bilinmesi gereken                                               |
| ----------- | ------------------------------------------------- | --------------------------------------------------------------- |
| SQLite      | Tek yazar; işlemler sıralı (serializable)          | Okuyup sonra yazan işlemi `BEGIN IMMEDIATE` ile başlatın        |
| PostgreSQL  | `READ COMMITTED`: her ifade o anki kaydedilmiş veriyi görür | Oku-yaz kalıbında `SELECT … FOR UPDATE` ya da atomik `UPDATE` |
| PostgreSQL `SERIALIZABLE` | Çakışan işlem hata alır (SQLSTATE 40001) | Uygulama işlemi baştan **yeniden denemeli**                     |

SQLite'ta iki işlem önce okuyup sonra yazmaya kalkarsa biri hemen "database is locked" alır (bekleme süresi 0 iken):

```python calistir
import sqlite3

yol = "kilit.db"
a = sqlite3.connect(yol, timeout=0, isolation_level=None)
b = sqlite3.connect(yol, timeout=0, isolation_level=None)
a.execute("CREATE TABLE sayac (n INTEGER)")
a.execute("INSERT INTO sayac VALUES (0)")

# YANLIŞ: ertelenmiş (deferred) BEGIN; ikisi de okur, sonra ikisi de yazmaya çalışır
a.execute("BEGIN")
a.execute("SELECT n FROM sayac").fetchone()
b.execute("BEGIN")
b.execute("SELECT n FROM sayac").fetchone()
a.execute("UPDATE sayac SET n = n + 1")
try:
    b.execute("UPDATE sayac SET n = n + 1")
    raise AssertionError("kilit hatası bekleniyordu")
except sqlite3.OperationalError as hata:
    assert "database is locked" in str(hata)  # b yaptığı işi çöpe atmak zorunda
b.execute("ROLLBACK")
a.execute("COMMIT")

# DOĞRU: yazacak işlem baştan yazma kilidini ister; ikinci işlem İŞE BAŞLAMADAN bekler ya da hata alır
a.execute("BEGIN IMMEDIATE")
try:
    b.execute("BEGIN IMMEDIATE")
    raise AssertionError("kilit hatası bekleniyordu")
except sqlite3.OperationalError:
    pass
a.execute("ROLLBACK")
print("tamam")
```

Üretimde SQLite için: `PRAGMA journal_mode = WAL` (okurlar yazarı beklemez), `PRAGMA busy_timeout = 5000` (kilitte
hemen hata yerine bekle), `PRAGMA foreign_keys = ON` (her bağlantıda) ve yazan işlemler `BEGIN IMMEDIATE`.

## SQLite ile PostgreSQL farkları

| Konu                     | SQLite                                                   | PostgreSQL                                      |
| ------------------------ | -------------------------------------------------------- | ----------------------------------------------- |
| Tip denetimi             | Esnek (tür yakınlığı); `STRICT` tablo ile katı            | Katı                                            |
| Yabancı anahtar          | Varsayılan **kapalı**; her bağlantıda `PRAGMA foreign_keys = ON` | Her zaman açık                         |
| Çift tırnak `"Ali"`      | Sütun bulunamazsa **metin** sayılır (sessiz hata)          | Her zaman tanımlayıcı (sütun adı)               |
| `LIKE`                   | ASCII'de büyük/küçük harf duyarsız                        | Duyarlı; duyarsız için `ILIKE`                  |
| Mantıksal değer          | 0/1 tamsayı                                              | `boolean`                                       |
| Otomatik kimlik          | `INTEGER PRIMARY KEY`                                    | `GENERATED ALWAYS AS IDENTITY`                  |
| Tarih/zaman              | Metin ya da sayı + tarih işlevleri                        | `date`, `timestamptz` (saat dilimli)            |
| Eşzamanlı yazma          | Tek yazar                                                | Çok yazar (MVCC)                                |
| Şema değişikliği         | `ALTER TABLE` sınırlı; çoğu zaman tabloyu yeniden kur     | Zengin `ALTER TABLE`, işlem içinde              |
| Ortak olanlar            | `ON CONFLICT … DO UPDATE`, `RETURNING`, pencere işlevleri, CTE, tamsayı bölme | aynı              |

```python calistir
import sqlite3

db = sqlite3.connect(":memory:")
db.execute("CREATE TABLE musteri (id INTEGER PRIMARY KEY, ad TEXT)")
db.execute("CREATE TABLE siparis (id INTEGER PRIMARY KEY, musteri_id INTEGER REFERENCES musteri(id))")
db.execute("INSERT INTO siparis VALUES (1, 99)")  # YANLIŞ: olmayan müşteriye sipariş KABUL edildi
assert db.execute("PRAGMA foreign_keys").fetchone() == (0,)

db2 = sqlite3.connect(":memory:")
db2.execute("PRAGMA foreign_keys = ON")  # bağlantı açılır açılmaz, işlem başlamadan
db2.execute("CREATE TABLE musteri (id INTEGER PRIMARY KEY, ad TEXT)")
db2.execute("CREATE TABLE siparis (id INTEGER PRIMARY KEY, musteri_id INTEGER REFERENCES musteri(id))")
try:
    db2.execute("INSERT INTO siparis VALUES (1, 99)")
    raise AssertionError("hata bekleniyordu")
except sqlite3.IntegrityError as hata:
    assert "FOREIGN KEY constraint failed" in str(hata)

# Çift tırnaklı "Ali" sütun değil metin sayıldı: SQLite'ta çalışır, PostgreSQL'de hata verir
db2.execute("INSERT INTO musteri (ad) VALUES ('Ali')")
assert db2.execute('SELECT ad FROM musteri WHERE ad = "Ali"').fetchall() == [("Ali",)]
print("tamam")
```

## Tuzaklar

| Belirti                                                      | Neden                                                   | Çözüm                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------ |
| Dizin eklendi ama sorgu hâlâ yavaş                            | Sorgu sütunu işleve sokuyor ya da `LIKE '%…'`            | Plana bakın; ifade dizini, aralık sorgusu ya da tam metin arama |
| Bileşik dizin kullanılmıyor                                   | Sorgu dizinin ilk sütununu kullanmıyor                   | Sütun sırasını sorguya göre kurun: eşitlik önce, aralık sonra  |
| Yazma işlemleri yavaşladı                                     | Gereksiz, kullanılmayan dizinler                         | Her dizini bir sorguya bağlayın; kullanılmayanı silin           |
| Liste sayfası öğe sayısıyla orantılı yavaş                    | N+1 sorgu                                                | `JOIN` ya da `IN (…)`; testte sorgu sayısı sınırı               |
| Son sayfalar çok yavaş; kayıt iki kez görünüyor               | Ofset sayfalama                                          | İmleç (keyset) sayfalama, eşsiz sütunla biten sıralama          |
| Hata sonrası yarım kalmış veri                                 | Değişiklikler tek işlemde değil                          | `with db:` / `BEGIN … COMMIT`                                 |
| Stok/bakiye ara sıra yanlış                                   | Kayıp güncelleme                                         | Atomik `UPDATE … SET x = x - ? WHERE … AND x >= ?` ya da sürüm sütunu |
| SQLite'ta ara sıra "database is locked"                       | Ertelenmiş işlem okuyup sonra yazmaya çalıştı; bekleme süresi yok | `BEGIN IMMEDIATE`, `busy_timeout`, WAL                   |
| SQLite'ta yetim kayıtlar (silinmiş müşterinin siparişi)        | Yabancı anahtar denetimi kapalı                          | Her bağlantıda `PRAGMA foreign_keys = ON`                      |
| SQLite'ta çalışan sorgu PostgreSQL'de "column does not exist"   | Çift tırnaklı metin                                      | Metinde tek tırnak; parametre kullanın                          |
| PostgreSQL'de ara sıra "could not serialize access"            | `SERIALIZABLE` çakışması                                 | İşlemi baştan yeniden deneyen döngü                             |
| Küçük veride hızlı, canlıda yavaş                              | Plan veri boyutuna göre değişir                          | Gerçekçi boyutta veriyle ölçün; `ANALYZE`                      |

## Denetim listesi

- [ ] Yavaş sorgunun planı alındı; `SCAN` görülen büyük tablo için gerekçe var ya da dizin eklendi.
- [ ] Her yabancı anahtar sütununun dizini var; her dizin en az bir sorguya hizmet ediyor.
- [ ] Bileşik dizinlerde eşitlik sütunları önce, aralık/sıralama sütunu sonda.
- [ ] Listeleme ekranlarında sorgu sayısı sabit (N+1 yok); testte sorgu sayısı denetleniyor.
- [ ] Büyüyebilen listeler imleç sayfalamalı; sıralama eşsiz bir sütunla bitiyor.
- [ ] Birlikte olması gereken değişiklikler tek işlemde; toplu eklemeler tek işlemde.
- [ ] Sayaç, stok, bakiye güncellemeleri atomik ya da sürüm denetimli; eşzamanlı iki isteği deneyen test var.
- [ ] SQLite bağlantısı açılırken `foreign_keys = ON`, `busy_timeout`, `journal_mode = WAL` ayarlanıyor.
- [ ] Hedef PostgreSQL ise sorgular PostgreSQL'de de denendi (çift tırnak, `LIKE`, tarih işlevleri).

## Küçük modele yaptırırken

- **İsteme yazın:** "Sorguyu yazdıktan sonra `EXPLAIN QUERY PLAN` çıktısını göster; `SCAN` varsa nedenini açıkla.
  Stok/bakiye güncellemesini tek bir koşullu `UPDATE` ile yap ve `rowcount`'u denetle. Listeyi imleçle sayfala."
- **Modelin tipik hatası:** Her sütuna dizin ekler; `lower(sutun)` ile arayıp dizinin çalıştığını sanır; döngü içinde
  sorgu atar (N+1); `SELECT` ile okuyup Python'da hesaplayıp `UPDATE` ile yazar (kayıp güncelleme); SQLite'ta
  `PRAGMA foreign_keys`'i unutur; `OFFSET` ile sonsuz kaydırma yapar.
- **Çıktıda arayın:** döngü içindeki `execute(`, `SELECT` ardından aynı satıra `UPDATE`, `OFFSET`, `LIKE '%`, yeni
  `CREATE INDEX` satırlarının hangi sorguya hizmet ettiği.
- **Kanıt isteyin:** önce/sonra planı ve iş ölçüsünü (süre ya da `set_progress_handler` adım sayısı) isteyin.

## İlgili

- [SQL sorgu yazımı](sql-sorgu.md): birleştirme, NULL, pencere işlevleri
- [Python eşzamanlılık](python-eszamanlilik.md): yarış durumu ve kilit
- [JavaScript async kalıpları](javascript-async.md): istemci tarafındaki yarış
- Sayfalama gerçeklemesi: [`kutuphane/ts/src/sayfalama.ts`](../../kutuphane/ts/src/sayfalama.ts)
- [İşlemler ve eşzamanlılık (arka uç)](../30-arkauc/islemler-ve-eszamanlilik.md): uygulama katmanında kilit ve yarış
- [Veritabanı tasarımı](../30-arkauc/veritabani-tasarimi.md) ve [migrasyonlar](../30-arkauc/migrasyonlar.md)
