---
baslik: Veritabanı tasarımı: tablolar, anahtarlar, kısıtlar ve sütun türleri
ozet: İlişkisel şema kurarken birincil anahtar seçimi, kuralı kısıtla veritabanına yazdırma, yumuşak silme, denetim izi, JSON sütunu, para ve zaman türleri ile adlandırma kararları.
etiketler: [veritabani, sql, sema, sqlite, postgres]
duzey: orta
guncellik: 2026-11
---

# Veritabanı tasarımı: tablolar, anahtarlar, kısıtlar ve sütun türleri

> Bu notu ne zaman okumalı: yeni bir tablo ya da ilişki eklerken, bir modelin önerdiği şemayı gözden
> geçirirken, "veride bozuk kayıtlar var", "silinen kullanıcı aynı e-postayla kayıt olamıyor" ya da "tutarlar
> kuruş kuruş tutmuyor" sorunlarında.

## Temel fikir

Kod bir günde değişir, veri yıllarca kalır. Bozuk bir kayıt bir kez yazıldıktan sonra her raporu, her göçü ve her
yeni özelliği bozar. Bu yüzden şemanın görevi **yanlış verinin hiç yazılamamasıdır**: kural yalnız uygulama
kodunda durursa, o kodu atlayan her yol (yönetim paneli, bir betik, yarın yazılacak bir uç, küçük bir modelin
eklediği işlev) kuralı da atlar. Veritabanı kısıtı (constraint) bütün yollarda geçerlidir.

Tasarımın sırası: önce varlıklar ve ilişkiler (normalleştirilmiş), sonra her sütunun türü ve kısıtı, en son
dizinler (gerçek sorgulara göre). Normalleştirmeyi bozmak (aynı bilgiyi iki yerde tutmak) ancak ölçülmüş bir
hız gerekçesiyle yapılır.

## İlişkiler

| İlişki             | Kuruluş                                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| Bire çok           | "Çok" tarafında yabancı anahtar: `siparis.musteri_id → musteri.id`      |
| Çoka çok           | Ara tablo, bileşik birincil anahtar: `uye (alan_id, kullanici_id, rol)` |
| Bire bir           | Çoğu zaman aynı tablo; ayrı gerekiyorsa yabancı anahtar + `UNIQUE`      |
| Liste değerli alan | Virgüllü metin **değil**; ayrı tablo ya da (sorgulanmıyorsa) JSON       |

Silinen üst kaydın altlarına ne olacağını yabancı anahtarda yazın: `ON DELETE CASCADE` (oturumlar kullanıcıyla
gider), `ON DELETE SET NULL` (fatura kalır, "oluşturan" boşalır) ya da varsayılan (silmeyi engeller). Havuzdaki
örnekler: [`0001_identity.sql`](../../uygulama/api/migrations/0001_identity.sql),
[`0002_workspaces.sql`](../../uygulama/api/migrations/0002_workspaces.sql).

## Birincil anahtar seçimi

| Durum                                                                | Seçim                       | Neden                                                         |
| -------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------- |
| Tek veritabanı, kimlik kullanıcıya görünmüyor                        | Otomatik artan tamsayı      | Küçük, hızlı, dizin dostu                                     |
| Kimlik adreste görünüyor                                             | UUIDv7 (ya da rastgele kimlik) | Artan sayı tahmin edilir ve iş hacmini söyler (sipariş 10 482) |
| İstemci çevrimdışı kayıt açar, birden çok kaynak birleşir            | UUIDv7                      | Merkezsiz üretilir, çakışmaz, zaman sıralıdır                 |
| Oluşturma zamanı bile gizli kalmalı                                  | UUIDv4 / rastgele kısa kimlik | v7 zamanı açığa vurur                                       |
| E-posta, TC kimlik no, telefon gibi doğal anahtar                    | Birincil anahtar **yapmayın** | Değişir, kişisel veridir; `UNIQUE` kısıtla tutun             |

UUIDv4 rastgele olduğu için dizinin her yerine yazılır; büyük tabloda ekleme yavaşlar ve dizin şişer. UUIDv7'nin
ilk 48 biti milisaniye cinsinden zamandır:

```python calistir
import os
import uuid


def uuid7(unix_ms: int) -> uuid.UUID:
    """RFC 9562 UUIDv7: ilk 48 bit milisaniye zaman, sonra sürüm, değişke ve rastgele bitler."""
    rastgele = int.from_bytes(os.urandom(10), "big")  # 80 bit
    deger = (unix_ms << 80) | (0x7 << 76) | ((rastgele >> 68) << 64) | (0b10 << 62) | (rastgele & (2**62 - 1))
    return uuid.UUID(int=deger)


basla = 1_800_000_000_000
v7 = [uuid7(basla + i) for i in range(50)]
v4 = [uuid.uuid4() for _ in range(50)]
assert sorted(map(str, v7)) == list(map(str, v7))  # metin sırası = oluşturma sırası → dizin dostu
assert sorted(map(str, v4)) != list(map(str, v4))  # rastgele: dizinin her yerine yazılır
assert v7[0].version == 7 and v7[0].int >> 80 == basla  # oluşturma anı kimlikten OKUNUR
print("tamam")
```

```cikti
tamam
```

Gerçek üreteç aynı milisaniyede sırayı korumak için sayaç da kullanır; hazırını kullanın:
[`kutuphane/py/kutuphane/kimlik.py`](../../kutuphane/py/kutuphane/kimlik.py) (TypeScript eşi aynı kimliği üretir),
havuzdaki API'de [`shared/src/ids.ts`](../../uygulama/shared/src/ids.ts).

## Kısıtlar: kuralı veritabanına yazdırın

| Kural                                  | Kısıt                                                |
| -------------------------------------- | ---------------------------------------------------- |
| Alan boş olamaz                        | `NOT NULL` (varsayılan olarak her sütuna; istisna bilinçli) |
| Tekil olmalı (e-posta, sipariş no)     | `UNIQUE` (gerekirse bileşik: `UNIQUE (kiraci, eposta)`) |
| Var olan kayda bağlı olmalı            | `REFERENCES … ON DELETE …`                           |
| Değer aralığı, durum listesi           | `CHECK (tutar_kurus > 0)`, `CHECK (durum IN (…))`    |
| Mantıksal değer (SQLite)               | `INTEGER CHECK (x IN (0, 1))`                        |

SQLite'a özgü iki tuzak, örnekte birlikte: STRICT olmayan tablo türü denetlemez; yabancı anahtar varsayılan
kapalıdır ve **açık bir işlemin içinde açılmaya çalışılırsa sessizce yok sayılır**.

```python calistir
import sqlite3

db = sqlite3.connect(":memory:", isolation_level=None)  # işlemleri kendimiz yönetiriz
# Tuzak 1: STRICT olmayan tabloda INTEGER sütuna metin girer
db.execute("CREATE TABLE gevsek (tutar_kurus INTEGER)")
db.execute("INSERT INTO gevsek VALUES ('on beş lira')")
assert db.execute("SELECT typeof(tutar_kurus) FROM gevsek").fetchone() == ("text",)
# Tuzak 2: yabancı anahtar KAPALI; işlem içinde açmak etkisiz
db.execute("BEGIN")
db.execute("PRAGMA foreign_keys = ON")
assert db.execute("PRAGMA foreign_keys").fetchone() == (0,)
db.execute("COMMIT")
db.execute("PRAGMA foreign_keys = ON")  # bağlantı açılır açılmaz, işlem dışında
assert db.execute("PRAGMA foreign_keys").fetchone() == (1,)

db.executescript("""
CREATE TABLE musteri (id INTEGER PRIMARY KEY, eposta TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE siparis (
  id INTEGER PRIMARY KEY,
  musteri_id INTEGER NOT NULL REFERENCES musteri (id),
  tutar_kurus INTEGER NOT NULL CHECK (tutar_kurus > 0),
  durum TEXT NOT NULL DEFAULT 'bekliyor' CHECK (durum IN ('bekliyor', 'odendi', 'iptal'))
) STRICT;
INSERT INTO musteri VALUES (1, 'ayse@ornek.com');
""")
reddedilen = 0
for sql in [
    "INSERT INTO siparis (musteri_id, tutar_kurus) VALUES (1, 'on beş lira')",  # tür (STRICT)
    "INSERT INTO siparis (musteri_id, tutar_kurus) VALUES (1, -500)",  # CHECK
    "INSERT INTO siparis (musteri_id, tutar_kurus, durum) VALUES (1, 500, 'ödendi')",  # CHECK: yazım farkı
    "INSERT INTO siparis (musteri_id, tutar_kurus) VALUES (99, 500)",  # FOREIGN KEY
    "INSERT INTO musteri (eposta) VALUES ('ayse@ornek.com')",  # UNIQUE
]:
    try:
        db.execute(sql)
    except sqlite3.IntegrityError:
        reddedilen += 1
assert reddedilen == 5 and db.execute("SELECT count(*) FROM siparis").fetchone() == (0,)
print("5 bozuk kayıt veritabanında reddedildi")
```

```cikti
5 bozuk kayıt veritabanında reddedildi
```

Uygulama yine de doğrular (kullanıcıya düzgün ileti için); kısıt son savunmadır. Kısıt ihlalini yakalayıp doğru
HTTP koduna çevirin (`UNIQUE` → 409), 500'e düşürmeyin. "Önce var mı diye bak, sonra yaz" yarışını da yalnız
benzersizlik kısıtı kapatır: [İşlemler ve eşzamanlılık](islemler-ve-eszamanlilik.md).

## Yumuşak silme ödünleşimi

| Seçenek                                   | Ne zaman                                         | Bedeli                                                   |
| ----------------------------------------- | ------------------------------------------------ | -------------------------------------------------------- |
| Gerçek silme (`DELETE`)                   | Varsayılan; kişisel veri, geri alma gerekmiyor   | Geri alınamaz (yedek dışında)                            |
| `silindi_at` sütunu (yumuşak silme)       | "Çöp kutusu / geri al" ürün gereği               | Her sorgu süzgeç ister; benzersizlik bozulur; KVKK silme talebi karşılanmaz |
| Arşiv tablosuna taşıma                    | Geçmiş saklanmalı ama sorgularda görünmemeli     | Taşıma işlemi; şema değişikliği iki tabloda              |
| Mezar taşı (`deleted = 1`, eşitleme için) | Çevrimdışı cihazlar silmeyi öğrenmeli            | Temizliği protokol ister ([`MEZAR_TASI.md`](../../uygulama/docs/MEZAR_TASI.md)) |

Yumuşak silmenin iki klasik hatası: süzgeci unutan sorgu silineni geri getirir; `UNIQUE (eposta)` silinen
kullanıcının aynı e-postayla yeniden kaydını engeller. Kısmi dizin ve görünüm ikisini de çözer:

```sql calistir
CREATE TABLE kullanici (id INTEGER PRIMARY KEY, eposta TEXT NOT NULL, silindi_at TEXT) STRICT;
-- Benzersizlik yalnız silinmemiş satırlarda: aynı e-postayla yeniden kayıt olunabilir
CREATE UNIQUE INDEX kullanici_eposta_etkin ON kullanici (eposta) WHERE silindi_at IS NULL;
-- Süzgeci her sorguda yazmamak için görünüm; uygulama yalnız bunu okur
CREATE VIEW etkin_kullanici AS SELECT id, eposta FROM kullanici WHERE silindi_at IS NULL;
INSERT INTO kullanici (eposta) VALUES ('ayse@ornek.com');
UPDATE kullanici SET silindi_at = '2026-11-16T09:00:00Z' WHERE eposta = 'ayse@ornek.com';
INSERT INTO kullanici (eposta) VALUES ('ayse@ornek.com');
SELECT (SELECT count(*) FROM kullanici), (SELECT count(*) FROM etkin_kullanici);
```

```cikti
2|1
```

Kişisel veri silme talebinde (KVKK) yumuşak silinen satır **gerçekten** silinir ya da anonimleştirilir; bunun
için ayrı bir iş tanımlayın.

## Denetim izi

"Kim, ne zaman, neyi neyden neye değiştirdi" sorusu için:

- **Uygulamada:** iş kuralıyla aynı işlemde `denetim` tablosuna satır. Kim yaptığını (kullanıcı, IP) bilir.
  Havuzdaki örnek: [`audit/repo.ts`](../../uygulama/api/src/modules/audit/repo.ts) (parola/belirteç yazmaz, 180 gün sonra silinir).
- **Tetikleyiciyle:** hiçbir yol atlayamaz ama "kim" bilgisini bilmez. Fiyat, bakiye, yetki gibi kritik sütunlar
  için iyi bir ikinci katmandır:

```sql calistir
CREATE TABLE fiyat (urun TEXT PRIMARY KEY, tutar_kurus INTEGER NOT NULL) STRICT;
CREATE TABLE denetim (
  id INTEGER PRIMARY KEY, tablo TEXT NOT NULL, kayit TEXT NOT NULL, eski TEXT, yeni TEXT,
  zaman TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE TRIGGER fiyat_denetim AFTER UPDATE OF tutar_kurus ON fiyat
WHEN OLD.tutar_kurus IS NOT NEW.tutar_kurus
BEGIN
  INSERT INTO denetim (tablo, kayit, eski, yeni)
  VALUES ('fiyat', NEW.urun, json_object('tutar_kurus', OLD.tutar_kurus), json_object('tutar_kurus', NEW.tutar_kurus));
END;
INSERT INTO fiyat VALUES ('simit', 1500);
UPDATE fiyat SET tutar_kurus = 1750 WHERE urun = 'simit';
UPDATE fiyat SET tutar_kurus = 1750 WHERE urun = 'simit';
SELECT tablo, kayit, eski, yeni FROM denetim;
```

```cikti
fiyat|simit|{"tutar_kurus":1500}|{"tutar_kurus":1750}
```

Denetim kaydı kişisel veri taşır: saklama süresi koyun, parola ve belirteç asla yazmayın.

## JSON sütunu ne zaman

| Durum                                                                 | Seçim                                           |
| --------------------------------------------------------------------- | ----------------------------------------------- |
| Alan `WHERE`, `JOIN`, `ORDER BY`'da ya da bir kısıtta kullanılıyor    | Gerçek sütun                                    |
| Ürüne göre değişen, sorgulanmayan ek özellikler (ayarlar, meta veri)  | JSON + uygulamada şema doğrulaması              |
| Dış servisten gelen ham yanıtı saklamak (webhook gövdesi)             | JSON (ham hâliyle)                              |
| JSON içindeki tek bir alan sık sorgulanıyor                           | Üretilen sütun + dizin ya da gerçek sütuna taşıma |
| Her varlık aynı eşitleme protokolünden geçiyor                        | Tek tablo + JSON gövde (havuzdaki `records`; [`0003_sync.sql`](../../uygulama/api/migrations/0003_sync.sql)) |

JSON'un bedeli: veritabanı içini doğrulamaz, yabancı anahtar kuramaz, alan adı yazım hatasını yakalamaz. Şemayı
uygulamada (Zod, Pydantic) tek yerde tutun.

## Para, tarih ve saat sütunları

| Veri                                         | Postgres                         | SQLite                         | Neden                                     |
| -------------------------------------------- | -------------------------------- | ------------------------------ | ----------------------------------------- |
| Para                                         | `bigint` kuruş (ya da `numeric`) | `INTEGER` kuruş                | Kayan noktalı sayı yuvarlar               |
| Para birimi                                  | `text` (`TRY`)                   | `TEXT`                         | Tutarın yanında; karışık toplam engellenir |
| An (olay zamanı)                             | `timestamptz`                    | `TEXT` ISO 8601 UTC, `Z` ile   | Metin karşılaştırması zaman sırasıdır     |
| Takvim günü (doğum günü, fatura tarihi)      | `date`                           | `TEXT` `YYYY-AA-GG`            | Saat dilimi yok; çevirince gün kayar      |
| Duvar saati (her gün 09:00, randevu)         | `time`/`timestamp` + dilim adı   | `TEXT` + `TEXT` (`Europe/Istanbul`) | Dilim kuralı değişebilir ([Zaman](zaman-ve-saat-dilimi.md)) |
| Mantıksal                                    | `boolean`                        | `INTEGER CHECK (x IN (0, 1))`  |                                           |
| Durum/tür                                    | `text` + `CHECK`                 | `TEXT` + `CHECK`               | Yeni değer eklemek kolay                  |

```sql calistir
SELECT 0.1 + 0.2, 10 + 20;  -- solda liralar (yanlış), sağda kuruşlar (doğru)
```

```cikti
0.30000000000000004|30
```

Para hesabı (KDV, paylaştırma, yuvarlama): [`kutuphane/py/kutuphane/para.py`](../../kutuphane/py/kutuphane/para.py).

## Adlandırma

- Tablo ve sütun adları küçük harf, `snake_case`, **yalnız ASCII** (`odeme_tutari`, `ödeme` değil). Türkçe harfli
  ad araçlarda, göçlerde ve sürücülerde bozulur.
- Tekil ya da çoğul tablo adı: birini seçin, hep onu kullanın.
- Yabancı anahtar `<tablo>_id`; an `_at` (`created_at`), takvim günü `_on`/`_date`, mantıksal `is_`/`has_`.
- Ayrılmış sözcüklerden kaçının (`order`, `user`, `group`): her sorguda tırnak ister.
- Dizin ve kısıt adları anlamlı: `kullanici_eposta_etkin`. Hata iletisinde bu ad görünür.

## Tuzaklar

| Belirti                                                          | Neden                                                | Çözüm                                                       |
| ---------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| Silinmiş kullanıcının siparişleri "sahipsiz" kaldı               | SQLite'ta `PRAGMA foreign_keys` açılmamış            | Her bağlantı açılışında, işlem dışında açın                 |
| Sayı sütununda metin değerler var                                | SQLite tür yakınlığı; tablo STRICT değil             | `STRICT` tablolar; sınırda şema doğrulaması                 |
| Aynı e-postayla iki hesap                                        | Benzersizlik yalnız uygulamada, yarış oldu           | `UNIQUE` kısıt; ihlalde 409                                 |
| "Ayse@Ornek.com" ile "ayse@ornek.com" iki ayrı hesap             | Karşılaştırma büyük/küçük harf duyarlı               | Yazmadan önce normalleştirin (e-postada ASCII küçültme)     |
| Silinen kullanıcı aynı e-postayla kayıt olamıyor                 | Yumuşak silme + düz `UNIQUE`                         | Kısmi benzersiz dizin (`WHERE silindi_at IS NULL`)          |
| Silinen kayıtlar raporlarda görünüyor                            | Süzgeç bir sorguda unutuldu                          | Görünüm ya da depo katmanında tek süzgeç                    |
| Toplamlar kuruş kuruş tutmuyor                                   | Para `REAL`/`float`                                  | Tamsayı kuruş                                               |
| Doğum günleri bir gün kaymış                                     | Takvim günü UTC ana çevrilip saklanmış               | `date` / `YYYY-AA-GG` metni                                 |
| Durum sütununda "odendi", "ödendi", "Odendi"                     | Serbest metin                                        | `CHECK (durum IN (…))`                                      |
| Kimlik adreste, rakip sipariş hacmini hesaplıyor                 | Artan tamsayı dışarıda görünüyor                     | Dışa UUIDv7/rastgele kimlik                                 |
| Etiketler `"kırmızı,mavi"` metninde; arama ve silme zor          | Liste tek sütunda                                    | Ara tablo                                                   |

## Denetim listesi

- [ ] Her tabloda birincil anahtar; dışarı görünen kimlik tahmin edilemez.
- [ ] Her sütun ya `NOT NULL` ya da boş olabilmesi bilinçli.
- [ ] Benzersizlik, ilişki ve değer kuralları kısıt olarak yazılı (`UNIQUE`, `REFERENCES`, `CHECK`).
- [ ] Her yabancı anahtarın `ON DELETE` davranışı seçilmiş.
- [ ] SQLite: tablolar `STRICT`, `PRAGMA foreign_keys = ON` her bağlantıda.
- [ ] Para tamsayı küçük birim + para birimi; an UTC; takvim günü tarih olarak.
- [ ] Yumuşak silme varsa: kısmi benzersiz dizin, tek süzgeç noktası, KVKK için gerçek silme yolu.
- [ ] Kritik değişiklikler denetim izine yazılıyor; saklama süresi belli.
- [ ] Adlar ASCII `snake_case`, ayrılmış sözcük yok.
- [ ] Sık kullanılan sorguların dizini var (ölçülerek; her sütuna değil).

## Küçük modele yaptırırken

- **İsteme yazın:** "Şemayı önce tablo + sütun + tür + kısıt listesi olarak yaz, sonra SQL'e çevir. Her kuralı
  kısıtla ifade et. Para kuruş tamsayı, zaman ISO UTC metin. Tablolar STRICT. Yeni tablo yeni migrasyon dosyasında."
  Havuzdaki tarif: [`TARIFLER.md`](../../uygulama/api/TARIFLER.md) → "Yeni tablo / migrasyon ekle".
- **Tipik hatalar:** `REAL` ile para; `NOT NULL` ve `CHECK` unutmak; benzersizliği uygulamada "önce sorgula"
  diye yapmak; yabancı anahtarı yazıp `PRAGMA foreign_keys`'i açmamak; e-postayı birincil anahtar yapmak; Türkçe
  harfli sütun adı.
- **Çıktıda arayın:** `REAL`, `FLOAT`, `DOUBLE` (para sütununda), `NOT NULL`'suz sütunlar, `CHECK` olmayan durum
  sütunları, `ON DELETE` olmayan yabancı anahtarlar.
- **Test isteyin:** "yanlış durum değeri, negatif tutar, olmayan müşteri ve aynı e-posta veritabanında reddedilir".

## İlgili

- [Migrasyonlar](migrasyonlar.md) (şemayı güvenle değiştirmek) · [İşlemler ve eşzamanlılık](islemler-ve-eszamanlilik.md) ·
  [Veri erişim katmanı](veri-erisim-katmani.md) · [Zaman ve saat dilimi](zaman-ve-saat-dilimi.md)
- Çalışan şema: [`uygulama/api/migrations/`](../../uygulama/api/migrations/0001_identity.sql) ve
  sarmalayıcı [`database.ts`](../../uygulama/api/src/db/database.ts) (WAL, yabancı anahtar, işlem kuralları).
