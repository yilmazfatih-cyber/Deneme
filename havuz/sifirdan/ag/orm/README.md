# orm — sqlite3 üstünde mini ORM ve sorgu kurucu

Django ORM / SQLAlchemy içeride ne yapar? Bu klasör, Python sınıflarını SQLite tablolarına bağlayan küçük bir
ORM'dir: alan türleri ve doğrulama, tablo oluşturma ve **basit migrasyon** (şema farkından `ALTER`), zincirlenebilir
sorgu (`filter / exclude / order_by / limit`, `Q` ile VE/VEYA/DEĞİL), bire-çok ilişkiler (tembel yükleme +
N+1'i önleyen ön yükleme), iç içe işlemler ve Türkçe büyük/küçük harf duyarsız arama. Her değer **parametreli**.

## 5 dakikada deneme

```python
from orm import Database, ForeignKey, Model, Q, Reverse, TextField


class Kullanici(Model):
    table = "kullanicilar"
    ad = TextField(unique=True, max_length=32)
    notlar = Reverse("Not", "sahip")  # kullanici.notlar → liste


class Not(Model):
    baslik = TextField(max_length=200)
    sahip = ForeignKey("Kullanici")  # sütun: sahip_id


db = Database("notlar.sqlite3")  # ":memory:" da olur
db.migrate([Kullanici, Not])  # tablo yoksa oluşturur, yeni alanı ekler
ayse = db.save(Kullanici(ad="ayşe"))
db.save(Not(baslik="İstanbul gezisi", sahip=ayse))
db.query(Not).filter(baslik__icontains="istanbul").order_by("-id").all()
db.query(Kullanici).filter(Q(ad="ayşe") | Q(ad__startswith="mehmet")).prefetch("notlar").all()
with db.transaction():  # hata olursa hepsi geri alınır
    ...
```

## Nasıl çalışır

```
class Not(Model): baslik = TextField()      __init_subclass__ → Not.fields = {"id", "baslik", "sahip"}
db.query(Not).filter(baslik__icontains="x") → Q(baslik__icontains="x")
   .compile() → ('tr_lower("baslik") LIKE tr_lower(?) ESCAPE '\'', ["%x%"])   ← değer HİÇ SQL'e yapışmaz
   → SELECT * FROM "not" WHERE (…) ORDER BY … LIMIT ? OFFSET ?   → satırlar → Not.from_row(...)
not.sahip  (ForeignKey tanımlayıcısı) → önbellekte yoksa db.get(Kullanici, not.sahip_id)   [tembel]
prefetch("sahip") → tüm sahip_id'ler → TEK sorgu: WHERE id IN (?, ?, …) → her nesnenin önbelleği
migrate: PRAGMA table_info ↔ model alanları → [CREATE TABLE | ADD COLUMN | DROP INDEX + DROP COLUMN]
```

N+1 sorunu (testte ölçülür: `db.count_queries()`): 5 kullanıcının notlarını tek tek istemek 1 + 5 sorgu,
`prefetch("notlar")` ile 2 sorgu.

## Dosya haritası

| Dosya        | Sorumluluk                                                                     |
| ------------ | ------------------------------------------------------------------------------ |
| `fields.py`  | Alan türleri (`TextField`, `IntegerField`, `RealField`, `BoolField`, `DateTimeField`, `BlobField`, `ForeignKey`), doğrulama |
| `model.py`   | `Model` tabanı, `Reverse` (ters ilişki), model kayıt defteri, `field_for`      |
| `query.py`   | `Query` (zincirlenebilir), `Q`, arama ekleri, LIKE kaçışı                      |
| `db.py`      | `Database`: kaydet/sil/getir, `transaction` (SAVEPOINT), `prefetch`, sorgu sayacı |
| `schema.py`  | `create_table_sql`, `plan_migration`, `migrate`, `MigrationError`              |
| `turkish.py` | `lower_tr` / `upper_tr` (İ↔i, I↔ı)                                             |

## Saldırı yüzeyi ve alınan önlem

| Risk                                                   | Önlem                                                     | Testi (`tests/orm/test_orm.py`)              |
| ------------------------------------------------------ | --------------------------------------------------------- | -------------------------------------------- |
| SQL enjeksiyonu (değer)                                | her değer `?` parametresi                                 | `test_sql_enjeksiyonu_ve_like_kacisi`        |
| SQL enjeksiyonu (alan adı: `order_by`, `filter` anahtarı) | ad modeldeki alanlarla eşleşmeli; tırnaklanır          | aynı                                         |
| LIKE joker karakterleriyle istenmeyen eşleşme (`%`, `_`) | `ESCAPE '\'` ile kaçışlanır                             | aynı                                         |
| Geçersiz veri (tür, uzunluk, boş)                      | alan düzeyinde `ValidationError`                          | `test_alan_dogrulama`                        |
| Yarım kalan çok adımlı yazma                           | `transaction()`; hata → ROLLBACK / ROLLBACK TO            | `test_islem_geri_alma_ve_ic_ice`             |
| Sahipsiz kayıt                                          | `PRAGMA foreign_keys = ON`, ON DELETE kuralı              | `test_iliskiler_ve_silme_zinciri`            |
| Migrasyonla sessiz veri kaybı                          | sütun silme yalnız `allow_drop=True` ile                  | `test_migrasyon_adimlari`                    |
| Türkçe aramada kaçan kayıt ("İSTANBUL" ↔ "istanbul")   | `tr_lower` SQLite işlevi                                  | `test_turkce_buyuk_kucuk_harf_arama`         |

## Sınırlar

- Yalnız SQLite. Çoka-çok ilişki, birleşim (JOIN) sorgusu, toplama (`SUM`/`GROUP BY`), seçili sütun (`values`)
  yok; gerekirse `db.execute("… ?", [değer])` ile parametreli SQL yazın.
- Migrasyon sürüm geçmişi tutmaz; "şimdiki model ile şimdiki tablo farkı"nı uygular. Tür değişimi, sonradan
  UNIQUE ve sütun yeniden adlandırma otomatik değildir (açık hata iletisiyle durur).
- `icontains` her satırda Python işlevi çağırır: büyük tablolarda yavaştır (dizin kullanamaz).
- Kimlik eşlemi (identity map) yok: aynı satırı iki kez okumak iki ayrı nesne verir.
- Tek bağlantı + kilit: çok iş parçacıklı yükte yazmalar sıraya girer (örnek uygulama için yeterli; ölçülmedi).
- `DateTimeField` metin olarak saklar; farklı saat dilimli değerlerin sıralaması doğru olmayabilir (UTC kullanın).

## Buradan nereye

- Yeni alan türü: `fields.py`'de `Field`'dan türetin (`convert`, `from_db`, `sql_type`) + gidiş-dönüş testi.
- Yeni arama eki: `query.py` → `_condition` + test. Gerçek projede SQLAlchemy/Django'ya geçerken kavramlar aynıdır.
- Web örneği bu ORM'i kullanır: `web_catisi/ornek/`.
