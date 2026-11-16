---
baslik: Migrasyonlar: şemayı yayındaki uygulamayı bozmadan değiştirmek
ozet: Her şema değişikliğinin bir dosya olması, genişlet-geçir-daralt yöntemi, sütun adlandırma ve silmenin güvenli yolu, büyük tabloda partili veri göçü, geri almanın gerçeği ve uygulama sürümüyle sıra.
etiketler: [veritabani, migrasyon, sema, yayin, sqlite]
duzey: orta
guncellik: 2026-11
---

# Migrasyonlar: şemayı yayındaki uygulamayı bozmadan değiştirmek

> Bu notu ne zaman okumalı: bir tabloya sütun eklemeden, bir sütunu yeniden adlandırmadan ya da silmeden önce;
> yayından sonra "no such column" hatası görüldüğünde; büyük bir tabloda veri dönüştürmeniz gerektiğinde.

## Temel fikir

Şema değişikliği (migrasyon) bir **kod değişikliğidir**: dosyaya yazılır, gözden geçirilir, sırayla ve bir kez
uygulanır, uygulandığı kaydedilir. Elle veritabanında komut çalıştırmak, yerelde ve sunucuda farklı şemalar
doğurur.

İkinci gerçek: yayın anında **eski ve yeni kod aynı veritabanına bakar**. Önce göç çalışıp sonra kod değişiyorsa
arada eski kod yeni şemayı görür; birden çok kopya varsa bir süre ikisi birlikte çalışır; yeni sürümü geri
almanız gerekirse eski kod yine yeni şemayı görür. Bu yüzden her göç **bir önceki kod sürümüyle de uyumlu**
olmalıdır. Kırıcı bir değişiklik (yeniden adlandırma, silme, tür değiştirme) birkaç yayına bölünür:
**genişlet → geçir → daralt** (expand → migrate → contract).

## Karar tablosu

| Değişiklik                                   | Tek adımda güvenli mi | Yol                                                                |
| -------------------------------------------- | --------------------- | ------------------------------------------------------------------ |
| Yeni tablo                                   | Evet                  | Doğrudan                                                           |
| Yeni sütun, boş olabilir ya da varsayılanlı  | Evet                  | SQLite'ta `NOT NULL` sütun varsayılansız eklenemez                 |
| Yeni `NOT NULL` sütun, varsayılan anlamsız   | Hayır                 | Boş olabilir ekle → doldur → kısıtı ekle (yeni tabloyla)           |
| Sütunu yeniden adlandırma                    | **Hayır**             | Genişlet → geçir → daralt (aşağıda)                                |
| Sütunu silme                                 | **Hayır**             | Önce kod kullanmayı bıraksın (bir yayın), sonra göçle silin        |
| Sütunun türünü değiştirme                    | **Hayır**             | Yeni sütun + geçir + daralt                                        |
| Var olan veriye yeni kısıt                   | Veri uymazsa kırılır  | Önce veriyi temizleyen göç, sonra kısıt                            |
| Büyük tabloya dizin                          | Kilit riski           | Postgres'te `CREATE INDEX CONCURRENTLY` (işlem dışında koşar)      |
| Tabloyu yeniden adlandırma                   | **Hayır**             | Yeni ad + eski adla görünüm köprüsü, sonra görünümü kaldır         |
| Büyük veri dönüşümü                          | Uzun kilit            | Şema göçünden ayrı, partili iş                                     |

## Göç dosyası ve koşucu

Kurallar (havuzdaki koşucu: [`uygulama/api/src/db/migrate.ts`](../../uygulama/api/src/db/migrate.ts)):

- Ad: `0005_kisa_ad.sql`; numaralar kesintisiz. Dosyanın ilk satırı ne yaptığını ve nedenini söyler.
- Her dosya **kendi işleminde** uygulanır: yarıda hata verirse hiç uygulanmamış sayılır.
- Uygulananlar bir tabloda (numara, ad, içerik özeti) tutulur; ikinci koşu hiçbir şey yapmaz.
- **Uygulanmış dosya değiştirilmez.** Özet tutmazsa koşucu durur; düzeltme yeni dosyadır.
- Veritabanında kodda olmayan bir göç varsa (veritabanı koddan yeni) uygulama başlamaz.

```python calistir
import hashlib
import pathlib
import sqlite3
import tempfile

klasor = pathlib.Path(tempfile.mkdtemp())
(klasor / "0001_musteri.sql").write_text("CREATE TABLE musteri (id INTEGER PRIMARY KEY, ad TEXT NOT NULL) STRICT;")
(klasor / "0002_telefon.sql").write_text("ALTER TABLE musteri ADD COLUMN telefon TEXT;")


def uygula(db: sqlite3.Connection) -> list[str]:
    db.execute("CREATE TABLE IF NOT EXISTS _goc (surum INTEGER PRIMARY KEY, dosya TEXT, ozet TEXT)")
    yapilmis = {s: (d, o) for s, d, o in db.execute("SELECT surum, dosya, ozet FROM _goc")}
    uygulanan = []
    for yol in sorted(klasor.glob("*.sql")):
        surum, sql = int(yol.name[:4]), yol.read_text()
        ozet = hashlib.sha256(sql.encode()).hexdigest()
        if surum in yapilmis:
            if yapilmis[surum][1] != ozet:
                raise RuntimeError(f"{yol.name} uygulandıktan sonra değiştirilmiş: yeni dosya açın")
            continue
        db.execute("BEGIN")  # her dosya kendi işleminde
        try:
            db.execute(sql)  # gerçek koşucu çok deyimli dosyaları da işler
            db.execute("INSERT INTO _goc VALUES (?, ?, ?)", (surum, yol.name, ozet))
            db.execute("COMMIT")
        except Exception:
            db.execute("ROLLBACK")
            raise
        uygulanan.append(yol.name)
    return uygulanan


db = sqlite3.connect(":memory:", isolation_level=None)
assert uygula(db) == ["0001_musteri.sql", "0002_telefon.sql"]
assert uygula(db) == []  # ikinci koşu hiçbir şey yapmaz
(klasor / "0002_telefon.sql").write_text("ALTER TABLE musteri ADD COLUMN cep TEXT;")  # YANLIŞ: eskiyi düzenlemek
try:
    uygula(db)
    raise AssertionError("durmalıydı")
except RuntimeError as hata:
    print(hata)
```

```cikti
0002_telefon.sql uygulandıktan sonra değiştirilmiş: yeni dosya açın
```

SQLite ve Postgres'te şema komutları işlem içinde geri alınabilir; MySQL'de çoğu şema komutu işlemi kendiliğinden
kaydeder, yarıda kalan göç yarım şema bırakır. SQLite'ta `VACUUM` ve `PRAGMA journal_mode` işlem içinde
çalışmaz; göç dosyasına yazılmaz.

## Genişlet → geçir → daralt, adım adım

Örnek: `musteri.ad` sütunu `tam_ad` olacak. Tek komutluk `RENAME COLUMN` yayındaki eski kodu o anda kırar.

| Yayın | Göç                                   | Kod                                                   |
| ----- | ------------------------------------- | ----------------------------------------------------- |
| 1     | `ADD COLUMN tam_ad` (boş olabilir)    | İki sütuna da yazar; `tam_ad`'dan okur, boşsa `ad`'dan |
| (iş)  | Eski satırları partilerle doldur      | —                                                     |
| 2     | —                                     | Yalnız `tam_ad` okur; geri dönüş güvenliği için ikisine yazar |
| 3     | —                                     | Yalnız `tam_ad`'a yazar                               |
| 4     | `DROP COLUMN ad` (+ gerekiyorsa `NOT NULL`) | —                                               |

Her yayının arasında eski sürümün tamamen kapandığından ve geri dönüş ihtiyacının kalmadığından emin olun.
Tek sunuculu küçük bir uygulamada 2. ve 3. yayınlar birleştirilebilir; 1 ile 4'ü aynı yayına koymayın.

```python calistir
import sqlite3

db = sqlite3.connect(":memory:", isolation_level=None)
db.execute("CREATE TABLE musteri (id INTEGER PRIMARY KEY, ad TEXT NOT NULL)")
db.executemany("INSERT INTO musteri (ad) VALUES (?)", [(f"Müşteri {i}",) for i in range(2500)])


def eski_surum_okur():  # yayında hâlâ çalışan eski kod
    return db.execute("SELECT ad FROM musteri WHERE id = 1").fetchone()[0]


# YANLIŞ: tek adımda yeniden adlandırma → eski sürüm o anda kırılır
db.execute("BEGIN")
db.execute("ALTER TABLE musteri RENAME COLUMN ad TO tam_ad")
try:
    eski_surum_okur()
    raise AssertionError("kırılmalıydı")
except sqlite3.OperationalError as hata:
    assert "no such column" in str(hata)
db.execute("ROLLBACK")  # şema değişikliği de geri alındı

# DOĞRU, adım 1 (genişlet): yeni sütun boş olabilir; eski kod etkilenmez
db.execute("ALTER TABLE musteri ADD COLUMN tam_ad TEXT")
assert eski_surum_okur() == "Müşteri 0"
# Adım 2 (geçir): eski satırlar küçük partilerle, her parti kendi kısa işleminde, kaldığı yerden sürer
partiler = 0
while True:
    degisen = db.execute(
        "UPDATE musteri SET tam_ad = ad WHERE id IN (SELECT id FROM musteri WHERE tam_ad IS NULL LIMIT 1000)"
    ).rowcount
    if degisen == 0:
        break
    partiler += 1
assert partiler == 3 and db.execute("SELECT count(*) FROM musteri WHERE tam_ad IS NULL").fetchone() == (0,)
# Adım 3 (daralt): eski sürüm KALMAYINCA eski sütun silinir
db.execute("ALTER TABLE musteri DROP COLUMN ad")
assert db.execute("SELECT tam_ad FROM musteri WHERE id = 1").fetchone() == ("Müşteri 0",)
print(f"{partiler} partide taşındı; hiçbir an kırık sürüm olmadı")
```

```cikti
3 partide taşındı; hiçbir an kırık sürüm olmadı
```

## Büyük tabloda veri göçü

- Şema göçü ile veri göçünü ayırın. Şema göçü kısa sürer; veri göçü ayrı bir iş ya da betiktir.
- **Partiler:** 500–5000 satır; her parti kendi kısa işleminde. Tek dev işlem tabloyu dakikalarca kilitler,
  SQLite'ta bütün yazmaları durdurur.
- **Kaldığı yerden sürer:** koşul "henüz yapılmamış" satırları seçer (`WHERE tam_ad IS NULL`) ya da son kimliği
  saklar. Yarıda kesilirse yeniden başlatmak güvenlidir (idempotent).
- **Nefes payı:** partiler arasında kısa bekleme; canlı trafik aç kalmasın.
- **İlerleme günlüğü:** her N partide bir "x / y satır" yazın.
- **Doğrulama:** bitince sayım sorgusu (`… WHERE tam_ad IS NULL` = 0) ve birkaç satırın elle karşılaştırması.
- Yeni yazmalar bu arada iki sütuna yazıldığı için göç sırasında gelen kayıtlar kaçmaz.

## SQLite'ın `ALTER TABLE` sınırları

SQLite'ta sütun ekleme, adlandırma ve (kısıtsız, dizinsiz sütun için) silme vardır; sütun türünü değiştirmek ya
da var olan sütuna kısıt eklemek yoktur. Bunlar için tablo yeniden kurulur: yeni şemayla `yeni_tablo` oluştur →
`INSERT INTO yeni_tablo SELECT … FROM eski` → eskiyi sil → yeniyi adlandır → dizinleri, tetikleyicileri,
görünümleri yeniden kur → `PRAGMA foreign_key_check` ile bütünlüğü denetle. Yabancı anahtarlar bu sırada
kapatılır ve `PRAGMA foreign_keys` işlem içinde değişmediği için bu ayar göç işleminin **dışında** yapılır; bu
yüzden böyle bir göçü koşucunun normal yolunda değil, ayrı ve yedek alınmış bir adımda çalıştırın.

## Geri alma gerçeği

- "Aşağı" (down) göçler çoğu zaman yazılır ama hiç denenmez; veri silen bir göçün geri alınması veriyi geri
  getirmez. Güvenilir yol **ileri düzeltmedir**: sorunu düzelten yeni bir göç.
- Kodu geri alabilmek için göçler bir önceki kod sürümüyle uyumlu olmalıdır (genişlet/daralt bunu sağlar). Böylece
  kod geri alınır, şema yerinde kalır.
- Yıkıcı göçten (sütun/tablo silme, veri dönüştürme) **önce yedek** alın ve geri yüklemeyi bir kez deneyin.
  Havuzdaki yedek betiği: [`uygulama/api/scripts/backup.ts`](../../uygulama/api/scripts/backup.ts)
  ([`YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md) → "Yedekleme ve geri yükleme").
- Yanlış uygulanmış bir göç dosyasını "düzeltip yeniden koşturmak" yoktur: koşucu buna izin vermemelidir.

## Uygulama sürümüyle sıra

| Ortam                                     | Göç ne zaman koşar                                                   |
| ----------------------------------------- | -------------------------------------------------------------------- |
| Tek sunucu, tek süreç (havuzdaki API)     | Açılışta, sunucu istek almadan önce; hata varsa sunucu başlamaz      |
| Birden çok kopya                          | Yayın hattında ayrı bir adım, tek seferde ve kilitle; sonra kod       |
| Genişletme göçleri                        | Yeni koddan **önce**                                                 |
| Daraltma göçleri                          | Eski kod tamamen kapandıktan **sonra**, ayrı yayında                 |

Birden çok kopya açılışta aynı anda göç koşarsa ikisi aynı dosyayı uygulamaya çalışır. Ya tek bir göç adımı
çalıştırın ya da göç tablosunu kilitleyen bir koşucu kullanın. Testlerde boş veritabanına bütün göçleri sırayla
uygulayan ve "veritabanı koddan yeni" durumunu deneyen testler olsun
([`migrate.test.ts`](../../uygulama/api/test/migrate.test.ts)).

## Tuzaklar

| Belirti                                                        | Neden                                                 | Çözüm                                                          |
| -------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| Yayın sırasında birkaç dakika "no such column" hataları        | Sütun tek adımda adlandırıldı/silindi                 | Genişlet → geçir → daralt                                      |
| Yerelde çalışıyor, sunucuda tablo farklı                       | Biri veritabanında elle komut çalıştırdı              | Her değişiklik göç dosyası; elle değişiklik yasak               |
| Sunucu açılmıyor: "uygulandıktan sonra değiştirilmiş"          | Uygulanmış göç dosyası düzenlendi                     | Dosyayı geri alın; değişikliği yeni dosyaya yazın              |
| Göç yarıda kaldı, tablo yarım                                  | İşlem dışında çalıştı ya da MySQL örtük kaydı         | Dosya başına tek işlem; MySQL'de küçük, tek komutlu göçler     |
| `ADD COLUMN … NOT NULL` hata verdi                             | Varsayılan değer yok (SQLite)                         | Varsayılan verin ya da boş olabilir ekleyip sonra daraltın     |
| Veri göçü sırasında uygulama dakikalarca yanıt vermedi         | Tek dev `UPDATE` tabloyu kilitledi                    | Partiler, kısa işlemler                                        |
| Veri göçünden sonra yeni kayıtlarda alan boş                   | Göç sırasında kod yalnız eski sütuna yazıyordu        | Önce "iki sütuna yaz" kodu, sonra veri göçü                    |
| Geri alma göçü çalıştı ama veri yok                            | Silinen sütunun verisi geri gelmez                    | Yedek; ileri düzeltme; silmeyi en sona bırakın                 |
| İki kopya aynı anda göç koşup birbirini bozdu                  | Açılışta göç, çok kopya                               | Ayrı göç adımı ya da kilit                                     |
| Yeni kısıt eklenirken göç kırıldı                              | Var olan veri kısıta uymuyor                          | Önce veriyi temizleyen göç, sonra kısıt                        |

## Denetim listesi

- [ ] Değişiklik yeni numaralı bir dosyada; eski dosyalara dokunulmadı.
- [ ] Göç bir önceki kod sürümüyle uyumlu (eski kod yeni şemada çalışıyor).
- [ ] Yeniden adlandırma/silme/tür değişikliği genişlet → geçir → daralt ile birden çok yayına bölündü.
- [ ] Veri göçü şema göçünden ayrı, partili, kaldığı yerden sürebilir, ilerleme günlüğü var.
- [ ] Yıkıcı adımdan önce yedek alındı; geri yükleme denendi.
- [ ] Boş veritabanına bütün göçler testte sırayla uygulanıyor.
- [ ] Çok kopyada göç tek yerden ve tek seferde koşuyor.
- [ ] Göçten sonra şema ve veri doğrulandı (sayım sorgusu, `PRAGMA foreign_key_check`).

## Küçük modele yaptırırken

- **İsteme yazın:** "Şema değişikliğini yeni bir göç dosyasına yaz (`NNNN_ad.sql`, sıradaki numara). Uygulanmış
  dosyalara dokunma. Değişiklik bir önceki kodla uyumlu olsun; sütun adlandırma/silme gerekiyorsa genişlet-geçir-
  daralt planını yayın yayın yaz." Havuzdaki tarif: [`TARIFLER.md`](../../uygulama/api/TARIFLER.md) → "Yeni tablo / migrasyon ekle".
- **Tipik hatalar:** var olan göç dosyasını düzenlemek; `RENAME COLUMN` ve `DROP COLUMN`'u kodla aynı yayına
  koymak; `NOT NULL` sütunu varsayılansız eklemek; büyük tabloyu tek `UPDATE` ile dönüştürmek; göç dosyasına
  `BEGIN/COMMIT` yazmak.
- **Çıktıda denetleyin:** değişen dosyalar arasında eski bir göç var mı (`git diff --stat`); `RENAME`, `DROP`
  geçiyor mu ve öncesinde kodun eski adı kullanmayı bıraktığı bir yayın var mı.
- **Test isteyin:** "boş veritabanına bütün göçler uygulanır" ve "eski kodun sorgusu yeni şemada çalışır".

## İlgili

- [Veritabanı tasarımı](veritabani-tasarimi.md) · [İşlemler ve eşzamanlılık](islemler-ve-eszamanlilik.md) ·
  [Yapılandırma ve sırlar](yapilandirma-ve-sirlar.md) (özellik bayrağıyla kod geri alma)
- Çalışan göçler: [`uygulama/api/migrations/`](../../uygulama/api/migrations/0004_audit_and_mail.sql), koşucu
  [`migrate.ts`](../../uygulama/api/src/db/migrate.ts), göç betiği [`scripts/migrate.ts`](../../uygulama/api/scripts/migrate.ts).
- Göçün yayın hattındaki yeri: [CI/CD](../60-devops/ci-cd.md) · [Yayın yolu seçimi](../60-devops/yayin-yolu-secimi.md).
