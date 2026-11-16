---
baslik: Veri analizi araç seçimi
ozet: Elektronik tablo, SQL, pandas, polars ve DuckDB arasında veri boyutu, tekrar edilebilirlik ve işbirliğine göre seçim; CSV, Parquet, JSONL ve Excel dosya biçimlerinin karşılaştırması.
etiketler: [veri, arac, sql, duckdb, pandas, dosya-bicimi]
duzey: temel
guncellik: 2026-11
---

# Veri analizi araç seçimi

> Bu notu ne zaman okumalı: bir veri işine başlarken "Excel mi, SQL mi, Python mı?" sorusunda; veriyi hangi dosya
> biçiminde saklayacağınıza karar verirken; bir modele analiz yaptırmadan önce hangi aracı kullanacağını
> söylerken.

## Temel fikir

Araç seçimini dört soru belirler: **veri ne kadar büyük**, iş **bir kez mi yoksa her ay mı** yapılacak, sonucu
**kim okuyacak ya da düzenleyecek**, veri **nerede duruyor**.

Tekrar edilecek her iş kodla (SQL ya da betik) yapılır. Elektronik tabloda elle yapılan adım belgelenmez, gözden
geçirilemez, gelecek ay aynı biçimde yinelenmez. SQL, tablo verisinin ortak dilidir: aynı sorgu küçük farklarla
SQLite'ta, DuckDB'de, PostgreSQL'de çalışır; modeller SQL'i iyi yazar ve sonuç küçük örnekte elle denetlenir.

Dosya biçimi de bir sözleşmedir: CSV tür taşımaz (her şey metindir), Parquet türü ve sütun düzenini taşır, JSONL
iç içe alanı ve satır satır eklemeyi taşır.

Küçük ekip için varsayılan: uygulama verisi SQLite ya da PostgreSQL'de; ham ve ara analiz verisi Parquet ya da
JSONL dosyalarında; analiz DuckDB ile SQL; paylaşılan sonuç CSV ya da Excel.

## Karar tablosu: araç

| Durum | Araç | Neden | Dikkat |
| --- | --- | --- | --- |
| Bir kerelik, küçük tablo (kaba sınır: yüz bin satır), okur programcı değil | Elektronik tablo | Herkes açar, görerek düzeltir | Tekrar edilecekse koda taşıyın |
| Veri uygulamanın veritabanında | O veritabanında SQL, yedek ya da salt-okunur kopya üzerinde | Taşıma yok | Canlı veritabanında ağır sorgu çalıştırmayın |
| Yerel dosyalar (CSV, Parquet, JSONL), milyonlarca satır | DuckDB (SQL) | Kurulumsuz, dosyayı doğrudan okur, bellekten büyük veride de çalışır | Sürüme bağlı işlevleri doğrulayın |
| Python kütüphanesi gerekiyor (model, istatistik, grafik) | pandas | En yaygın; her kütüphane kabul eder | Tür sezme ve eksik değer tuzakları (aşağıda) |
| Büyük veride dataframe, hız önemli | polars | Hızlı, tembel (lazy) çalışma | Sözdizimi pandas'tan farklı; küçük model ikisini karıştırır |
| Tek kullanıcılı kalıcı veri, tek dosya | SQLite | Sunucusuz, sağlam, türlü | Eşzamanlı yazma sınırlı |
| Çok kullanıcılı, paylaşılan | PostgreSQL | Eşzamanlılık, yetki | Yönetim ve yedek gerekir |
| Her ay tekrar eden rapor | SQL dosyası + küçük betik + zamanlanmış çalıştırma | Tekrar edilebilir, gözden geçirilebilir | Girdi ve çıktıyı tarihli saklayın |

Excel bir sayfada en çok 1.048.576 satır gösterir; daha büyük CSV'yi açarken kalan satırları yüklemez ve uyarır,
dosyayı o hâliyle kaydederseniz yüklenmeyen satırlar kaybolur.

## Karar tablosu: dosya biçimi

| Biçim | Güçlü | Zayıf | Ne zaman |
| --- | --- | --- | --- |
| CSV | Her araç açar, insan okur | Tür yok; ayırıcı, kodlama, ondalık belirsiz; boş ile eksik ayırt edilmez | Paylaşım, küçük tablo |
| Excel-TR CSV (`;`, BOM, ondalık virgül) | Türkçe Excel çift tıklamayla doğru açar | Yalnız Excel'e uygun | Programcı olmayana teslim |
| Excel (.xlsx) | Biçimli, çok sayfalı | Tarih, baştaki sıfır, bilimsel gösterim sürprizleri; sürüm denetimine uygun değil | Son kullanıcı raporu |
| JSONL (satır başına bir JSON) | İç içe alanlar; sona ekleme; akışla okuma | Büyük; şema zorlamaz | Olay günlüğü, API çıktısı |
| JSON (tek belge) | Yapılandırma, küçük sözlük | Bütün dosya belleğe; ekleme zor | Ayar dosyası |
| Parquet | Sütunlu, türlü, sıkıştırılmış; yalnız gereken sütun okunur | İnsan okuyamaz; kütüphane gerekir; satır güncellenmez | Analiz için ara ve son tablolar |
| SQLite dosyası | Sorgulanabilir, türlü, güncellenebilir | Büyük taramada sütunlu biçimden yavaş | Uygulama verisi, küçük ambar |

## CSV türü taşımaz

```python calistir
import csv
import io
import json

satir = {"posta_kodu": "06100", "adet": 3, "tutar": 12.5, "not": None, "aciklama": ""}
tampon = io.StringIO()
yazici = csv.DictWriter(tampon, fieldnames=list(satir))
yazici.writeheader()
yazici.writerow(satir)
geri_csv = next(csv.DictReader(io.StringIO(tampon.getvalue())))
geri_jsonl = json.loads(json.dumps(satir, ensure_ascii=False))
print("CSV  :", geri_csv)
print("JSONL:", geri_jsonl)
assert geri_csv["not"] == geri_csv["aciklama"] == ""  # eksik ile boş metin aynı oldu
```

```cikti
CSV  : {'posta_kodu': '06100', 'adet': '3', 'tutar': '12.5', 'not': '', 'aciklama': ''}
JSONL: {'posta_kodu': '06100', 'adet': 3, 'tutar': 12.5, 'not': None, 'aciklama': ''}
```

CSV'den geri okunan her şey metindir; `None` ile boş metin aynı şeye döner ve okuyan araç türü yeniden tahmin eder
(posta kodu 6100 olur). JSONL sayıyı, `null`'u ve metni korur; tarih ve ondalık için yine kural gerekir (ISO
metin, kuruş tam sayı). Parquet türü dosyada saklar; tür tartışması yazarken bir kez yapılır.

## Elektronik tablo yerine tekrar edilebilir SQL

Excel'deki pivot tablonun tekrar edilebilir karşılığı: dosyayı oku, türleri açıkça çevir, SQL ile özetle. Yalnız
standart kütüphane:

```python calistir
import csv
import io
import sqlite3
from decimal import Decimal

dosya = "tarih;kanal;tutar\n2026-11-01;web;120,50\n2026-11-01;mobil;80,00\n2026-11-02;web;99,90\n2026-11-02;mobil;150,25\n"
satirlar = list(csv.DictReader(io.StringIO(dosya), delimiter=";"))
db = sqlite3.connect(":memory:")
db.execute("CREATE TABLE satis (tarih TEXT, kanal TEXT, tutar_kurus INTEGER)")
db.executemany(
    "INSERT INTO satis VALUES (?, ?, ?)",  # parametreli: değer metne gömülmez
    [(s["tarih"], s["kanal"], int(Decimal(s["tutar"].replace(",", ".")) * 100)) for s in satirlar],
)
for kanal, kurus in db.execute("SELECT kanal, SUM(tutar_kurus) FROM satis GROUP BY kanal ORDER BY kanal"):
    print(f"{kanal:6s} {kurus // 100},{kurus % 100:02d} TL")
```

```cikti
mobil  230,25 TL
web    220,40 TL
```

Bu betik gelecek ay yeni dosyayla aynen çalışır, bir hata bulunduğunda hangi adımda olduğu görülür ve bir başkası
satır satır okuyabilir. Elektronik tablodan koda geçme zamanı: iş ikinci kez yapılıyorsa, birden çok dosya
birleştiriliyorsa, elle kopyala-yapıştır adımı varsa, sonuç başka bir kararın girdisiyse.

## SQL lehçe farkları

Kasım 2026'da SQLite 3.53 ve DuckDB 2.0 ile denendi; PostgreSQL sütunu doğrulanmadı.

| İş | SQLite | DuckDB | PostgreSQL |
| --- | --- | --- | --- |
| Ay başı | `date(t, 'start of month')` | `date_trunc('month', t)` | `date_trunc('month', t)` |
| Gün farkı | `julianday(b) - julianday(a)` | `date_diff('day', a, b)` | `b::date - a::date` |
| Tam sayı bölmesi `7 / 2` | 3 | 3,5 (tam sayı için `7 // 2`) | 3 |
| Ortanca | `median(x)` yalnız bazı derlemelerde | `median(x)` | `percentile_cont(0.5) WITHIN GROUP (ORDER BY x)` |
| Yüzdelik (ara değerli / en yakın) | elle, `ROW_NUMBER()` ile | `quantile_cont(x, p)` / `quantile_disc(x, p)` | `percentile_cont` / `percentile_disc` |
| Pencere sonucunu süzme | alt sorgu | `QUALIFY ROW_NUMBER() OVER (…) = 1` | alt sorgu |
| Metin birleştirme | `group_concat(x, ',')` | `string_agg(x, ',')` | `string_agg(x, ',')` |
| Dosyadan okuma | yok (önce içe aktarın) | `read_csv`, `read_parquet`, `read_json` | `COPY … FROM` |

Aynı sorgu iki veritabanında farklı sonuç verebilir (tam sayı bölmesi gibi); modele hangi veritabanı için
yazdığını her istemde söyleyin.

## pandas'ın sessiz varsayılanları

pandas 3.1.1 ile denendi (Kasım 2026):

| Varsayılan davranış | Sonuç | Ne yazılır |
| --- | --- | --- |
| `read_csv` türü sezer | `06100` → `6100` (tam sayı) | `dtype={"posta_kodu": str}` |
| `read_csv` ondalık noktası bekler | `1.250,50` metin kalır | `sep=";", decimal=",", thousands="."` |
| `groupby` eksik anahtarlı satırları atar | Kategori toplamları genel toplamdan az (100 yerine 80) | `groupby(..., dropna=False)` ya da önce "(bilinmiyor)" ile doldurun |
| Kodlama UTF-8 sayılır | BOM'lu dosyada ilk sütun adı görünmez `U+FEFF` ile başlar (`ad` bulunamaz) | `encoding="utf-8-sig"` |

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Geçen ayki rapor bu ay yeniden üretilemiyor | Elle yapılmış tablo adımları | SQL/betik + tarihli girdi ve çıktı |
| Posta kodu, TCKN, IBAN bozuk | CSV/Excel tür sezdi | Kod sütunlarını metin okuyun; Excel'de açıp kaydetmeyin |
| Kategori toplamları genel toplamı tutmuyor | pandas `groupby` eksik anahtarı attı | `dropna=False`; mutabakat denetimi |
| Oran SQLite'ta 0, DuckDB'de doğru | Tam sayı bölmesi lehçeye göre farklı | `100.0 * a / b` her yerde |
| Büyük CSV Excel'de eksik açıldı | Sayfa satır sınırı | DuckDB ya da betik; Excel'e yalnız özet |
| Not defteri (notebook) sonucu yeniden çalıştırınca değişiyor | Hücreler sırasız çalıştırılmış, gizli durum | Baştan sona çalıştırıp doğrulayın; kalıcı işi betiğe taşıyın |
| Model polars kodu isterken pandas yazıyor | İki kütüphanenin sözdizimi karışıyor | İstemde kütüphaneyi ve sürümünü açıkça verin |
| JSONL'de aynı alan bazen sayı bazen metin | Şema yok | Yazarken doğrulayın ([veri kalitesi sözleşmeleri](veri-kalitesi-sozlesmeleri.md)) |
| Analiz canlı uygulamayı yavaşlattı | Ağır sorgu üretim veritabanında | Yedek ya da salt-okunur kopya |

## Denetim listesi

- [ ] Araç seçimi dört soruya (boyut, tekrar, okur, verinin yeri) göre yapıldı ve bir cümleyle yazıldı.
- [ ] Tekrar edilecek iş SQL ya da betik olarak saklanıyor; girdi ve çıktı tarihli.
- [ ] Dosya okurken ayırıcı, kodlama, ondalık işareti ve kod sütunlarının türü açıkça verildi.
- [ ] Ara tablolar türlü bir biçimde (Parquet, SQLite) saklanıyor; CSV yalnız paylaşım için.
- [ ] Her özetten sonra mutabakat: kırılım toplamı = genel toplam.
- [ ] İstemde veritabanı lehçesi ve kütüphane adı belirtildi.
- [ ] Ağır sorgular canlı veritabanında değil kopya üzerinde çalıştı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Analizi DuckDB SQL ile yap (pandas kullanma). Dosyayı `read_csv('x.csv', delim=';',
  decimal_separator=',')` ile oku; kod sütunlarını VARCHAR olarak ver. Sorguyu ayrı bir `.sql` dosyasına yaz;
  sonucu CSV'ye kaydet. Kırılım toplamının genel toplamla tuttuğunu gösteren bir denetim sorgusu ekle."
- **Modelin tipik hatası:** pandas'ı varsayılanlarla kullanır (tür sezme, `groupby` eksik atma); SQLite sorgusunda
  PostgreSQL ya da DuckDB işlevi kullanır; Excel formülü önerir ve tekrar edilebilirliği unutur; büyük dosyayı
  belleğe tümüyle yükler.
- **Çıktıda denetleyin:** okuma satırındaki ayar parametreleri; sorgu lehçesi doğru mu; mutabakat sorgusu var mı;
  sonuç dosyası tarihli mi.
- **Sorun:** "Bu analiz gelecek ay yeni veriyle tek komutla yeniden çalışır mı?"

## İlgili

- [Analitik SQL kalıpları](analitik-sql-kaliplari.md) — kohort, huni, pencere işlevleri
- [Veri temizleme yöntemi](veri-temizleme-yontemi.md) — kodlama, ondalık virgül, Excel dönüşümleri
- [Veri hattı tasarımı](veri-hatti-tasarimi.md) — tekrar eden işi hatta koymak
- DuckDB ile dosyadan okuyan, çıktısı sınanmış 15 sorgu (Excel-TR CSV ve JSONL dahil):
  [`veri/docs/ANALIZ_TARIFLERI.md`](../../veri/docs/ANALIZ_TARIFLERI.md)
- CSV, Excel-TR CSV, JSONL, JSON ve Parquet okuma/yazma: [`veri/verihavuzu/files.py`](../../veri/verihavuzu/files.py)
- Bağımsız Excel-TR CSV okuyucu/yazıcı (formül koruması dahil):
  [`kutuphane/py/kutuphane/csv.py`](../../kutuphane/py/kutuphane/csv.py)
- [Veri biçimleri](../10-diller/veri-bicimleri.md) — JSON, YAML, CSV ayrıntıları
- [SQL sorgu yazımı](../10-diller/sql-sorgu.md) — SQLite örnekleriyle sorgu temelleri
