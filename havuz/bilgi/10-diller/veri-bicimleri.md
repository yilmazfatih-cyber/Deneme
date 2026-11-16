---
baslik: Veri biçimleri
ozet: JSON (sayı duyarlığı, tarih yok, yinelenen anahtar), YAML'ın örtük tip dönüşümü, TOML, CSV ve Türkçe Excel (noktalı virgül, ondalık virgül, BOM), ISO 8601 ve saat dilimi, ikili ile metin; hangi biçim ne zaman.
etiketler: [json, yaml, csv, toml, tarih, excel]
duzey: orta
guncellik: 2026-11
---

# Veri biçimleri

> Bu notu ne zaman okumalı: bir API gövdesi, ayar dosyası, dışa aktarım (CSV/Excel) ya da veri dosyası tasarlarken
> veya okurken; "Excel'de Türkçe harfler bozuk", "telefon numarası sayıya döndü", "tarih bir gün kaydı", "büyük
> kimlik numarası değişti" gibi sorunlarda.

## Temel fikir

- Her biçim bir **tip sistemi** taşır ve okuyan kütüphane bu tipleri **tahmin eder**. Tahminin yanlış olduğu yerler
  bu notun konusudur: JSON'da tarih yoktur, YAML `no`'yu `false` yapar, Excel `0532…`'yi sayıya çevirir.
- Kural: dışarıdan okunan veriyi okuduktan **sonra** şemayla doğrulayın; biçimin kendi tahminine güvenmeyin.
- Zamanı her biçimde aynı yazın: **ISO 8601** (`2026-11-16T07:00:00Z`). Saatsiz tarih `2026-11-16`.
- Metin dosyaları her zaman **UTF-8**. Tek istisna: Türkçe Excel'in açacağı CSV'ye BOM eklenir.

## Hangi biçim ne zaman

| İhtiyaç                                              | Biçim                                     | Neden                                          |
| ---------------------------------------------------- | ----------------------------------------- | ---------------------------------------------- |
| API gövdesi, programlar arası alışveriş               | JSON                                      | Her dilde var, tipleri az ve net               |
| Satır satır büyüyen kayıt (günlük, veri kümesi)        | JSON Lines (`.jsonl`: her satır bir JSON) | Sona eklenir, akışla okunur, bozuk satır tektir |
| İnsanın elle düzenlediği ayar                          | TOML                                      | Yorum, tarih, net tipler; Python'da yerleşik okuyucu |
| Ekosistemin dayattığı ayar (CI, Docker Compose)         | YAML                                      | Seçim sizin değil; tuzaklarını bilin           |
| Excel kullanan birine tablo                            | XLSX (en güvenlisi) ya da CSV (`;` + BOM)  | Excel CSV'yi yerel ayara göre yorumlar         |
| Büyük analitik tablo                                   | Parquet                                   | Sütunlu, tipli, sıkıştırılmış                  |
| Görsel, ses, model ağırlığı                            | Kendi ikili dosyası                       | JSON'a base64 gömmek %33 büyütür               |

## JSON

```python calistir
import json
from datetime import datetime
from decimal import Decimal

# Yinelenen anahtar hata değildir: sonuncu kazanır (JavaScript'te de)
assert json.loads('{"rol": "admin", "rol": "misafir"}') == {"rol": "misafir"}

# Python NaN'ı JSON dışı bir metinle yazar; başka diller bunu okuyamaz
assert json.dumps(float("nan")) == "NaN"
try:
    json.dumps(float("nan"), allow_nan=False)  # DOĞRU: geçersiz değeri yazma anında yakala
    raise AssertionError("hata bekleniyordu")
except ValueError:
    pass

# Varsayılan ensure_ascii=True Türkçe harfleri kaçışlar
assert json.dumps("İstanbul") == '"\\u0130stanbul"'
assert json.dumps("İstanbul", ensure_ascii=False) == '"İstanbul"'

# JSON'da tarih tipi yoktur; açıkça ISO metnine çevirin
try:
    json.dumps({"zaman": datetime(2026, 11, 16, 7)})
    raise AssertionError("hata bekleniyordu")
except TypeError:
    pass
assert json.dumps({"zaman": "2026-11-16T07:00:00Z"}) == '{"zaman": "2026-11-16T07:00:00Z"}'

# Python büyük tamsayıyı kesin okur; ondalığı float yapar (para için parse_float)
assert json.loads("12345678901234567890") == 12345678901234567890
assert json.loads('{"tutar": 0.1}', parse_float=Decimal)["tutar"] == Decimal("0.1")

# Sondaki virgül ve yorum JSON'da yasaktır (tsconfig.json gibi dosyalar JSONC'dir)
try:
    json.loads('{"a": 1,}')
    raise AssertionError("hata bekleniyordu")
except json.JSONDecodeError:
    pass
print("tamam")
```

JavaScript tarafı: `JSON.parse('{"id": 9007199254740993}').id` → `9007199254740992` (sessizce değişir; ayrıntı
[JavaScript çalışma zamanı](javascript-calisma-zamani.md)). Bu yüzden 64 bit kimlikler, sipariş ve kart numaraları
JSON'da **metin** taşınır: `{"id": "9007199254740993"}`. `JSON.stringify` `NaN`'ı `null` yapar, `undefined` alanı
atar, `Date`'i UTC ISO metnine çevirir; okurken metin olarak geri gelir.

## YAML'ın örtük tip dönüşümü

YAML tırnaksız değeri tahmin eder ve iki yaygın kütüphane **farklı** tahmin eder. Aynı dosya, denendi:

| YAML satırı              | PyYAML 6.0.3 (YAML 1.1)     | js-yaml 4.3.2 (YAML 1.2)       |
| ------------------------ | --------------------------- | ------------------------------ |
| `ulke: NO`               | `False`                     | `'NO'`                         |
| `acik: on`               | `True`                      | `'on'`                         |
| `surum: 1.10`            | `1.1` (sayı)                | `1.1`                          |
| `telefon: 05321234567`   | `725956983` (sekizlik sayı!) | `5321234567` (baştaki 0 gitti) |
| `telefon: 05391234567`   | `'05391234567'` (9 içerdiği için metin) | `5391234567`      |
| `sure: 1:30`             | `90` (altmışlık)            | `'1:30'`                       |
| `kod: 010`               | `8`                         | `10`                           |
| `bilimsel: 1e3`          | `'1e3'` (metin)             | `1000`                         |
| `tarih: 2026-11-16`      | `date` nesnesi              | UTC gece yarısı `Date`         |
| Aynı anahtar iki kez     | sonuncu, sessizce           | hata                           |
| Girintide sekme          | hata                        | hata                           |

Kurallar:

- Metin olan her değeri **tırnaklayın**: sürüm (`"1.10"`), telefon, posta kodu, ülke kodu, saat, evet/hayır kelimeleri.
- Python'da yalnız `yaml.safe_load` kullanın; tam yükleyiciler dosyadaki etiketlerle nesne kurabilir (güvenlik açığı).
- Yükledikten sonra şemayla doğrulayın; YAML girintisi kayınca anahtar başka bir nesnenin altına geçer ve hata
  vermez.
- Seçim sizdeyse ayar dosyası için TOML'u tercih edin.

## TOML

```python calistir
import tomllib
from datetime import date

ayar = tomllib.loads("""
baslik = "Köprü"
surum = "1.10"            # metin olduğu tırnaktan belli
yayin = 2026-11-16        # yerleşik tarih tipi
acilis = 2026-11-16T10:00:00+03:00
en_cok_kayit = 1_000

[[urun]]
ad = "çay"

[[urun]]
ad = "simit"
""")
assert ayar["surum"] == "1.10" and ayar["yayin"] == date(2026, 11, 16)
assert ayar["acilis"].utcoffset().total_seconds() == 3 * 3600
assert [u["ad"] for u in ayar["urun"]] == ["çay", "simit"]

for bozuk in ("a = 1\na = 2", "a = null"):  # yinelenen anahtar hata; null diye bir değer yok
    try:
        tomllib.loads(bozuk)
        raise AssertionError(bozuk)
    except tomllib.TOMLDecodeError:
        pass
print("tamam")
```

`tomllib` yalnız okur; yazmak için ayrı paket (`tomli-w`) gerekir. Ayar dosyasını programla yazıyorsanız JSON daha
kolaydır.

## CSV ve Türkçe Excel

Türkçe yerel ayarlı Excel CSV'yi **noktalı virgülle** ayrılmış ve **ondalık virgüllü** bekler; BOM'suz UTF-8 dosyayı
eski kod sayfasıyla açar ve "Ã§", "ÅŸ" gösterir. (Yaygın bilinen Excel davranışı; Excel bu ortamda denenmedi.
Python tarafındaki baytlar aşağıda denendi.)

```python calistir
import csv
from decimal import Decimal
from pathlib import Path

satirlar = [("Çay, demlik", Decimal("40.50")), ('Simit "susamlı"', Decimal("15"))]


def tl(tutar: Decimal) -> str:
    return f"{tutar:.2f}".replace(".", ",")


# YANLIŞ: elle birleştirme; alandaki virgül sütunu böler
yanlis = ",".join([satirlar[0][0], str(satirlar[0][1])])
assert len(yanlis.split(",")) == 3  # 2 alan 3 oldu

# DOĞRU: csv modülü + Türkçe Excel ayarları
with open("rapor.csv", "w", encoding="utf-8-sig", newline="") as f:  # utf-8-sig = BOM'lu UTF-8
    yazici = csv.writer(f, delimiter=";")
    yazici.writerow(["Ürün", "Fiyat (TL)"])
    yazici.writerows([ad, tl(fiyat)] for ad, fiyat in satirlar)

ham = Path("rapor.csv").read_bytes()
assert ham.startswith(b"\xef\xbb\xbf")  # Excel UTF-8 olduğunu BOM'dan anlar
assert ham.decode("utf-8-sig").splitlines() == ["Ürün;Fiyat (TL)", "Çay, demlik;40,50", '"Simit ""susamlı""";15,00']

# Geri okuma: utf-8-sig BOM'u atar; newline="" alan içindeki satır sonlarını korur
with open("rapor.csv", encoding="utf-8-sig", newline="") as f:
    okunan = list(csv.reader(f, delimiter=";"))
assert okunan[2] == ['Simit "susamlı"', "15,00"]
assert Decimal(okunan[1][1].replace(".", "").replace(",", ".")) == Decimal("40.50")
print("tamam")
```

Dışarıdan gelen CSV için okuma sırası: önce `utf-8-sig` deneyin, `UnicodeDecodeError` alırsanız `cp1254` (eski
Excel'in "CSV (virgülle ayrılmış)" kaydının Türkçe Windows'taki kodlaması; doğrulanmadı); ayırıcıyı ilk satırdan bulun (`csv.Sniffer().sniff(ilk_satir,
delimiters=";,\t")`).

Excel'e giden CSV'nin iki tuzağı daha:

- `=`, `+`, `-`, `@` ile başlayan hücreyi Excel **formül** olarak çalıştırır (CSV enjeksiyonu). Kullanıcının yazdığı
  serbest metin alanlarının başına `'` ekleyin.
- `0532…`, `06100` gibi değerler sayıya çevrilir ve baştaki 0 düşer. Bunun CSV'de temiz bir çözümü yoktur; bu tür
  veride XLSX üretin (hücre tipi metin) ya da kullanıcıyı uyarın.

Havuzdaki gerçekleme: [`kutuphane/py/kutuphane/csv.py`](../../kutuphane/py/kutuphane/csv.py),
[`kutuphane/ts/src/csv.ts`](../../kutuphane/ts/src/csv.ts).

## Tarih ve saat biçimi

```python calistir
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

ist = ZoneInfo("Europe/Istanbul")
an = datetime.fromisoformat("2026-11-16T07:00:00Z")  # Python 3.11+ "Z"yi okur
assert an == datetime.fromisoformat("2026-11-16T10:00:00+03:00")  # aynı an, farklı yazım
assert an.astimezone(ist).isoformat() == "2026-11-16T10:00:00+03:00"

# Saat dilimsiz (naive) ile dilimli (aware) karşılaştırılamaz
try:
    _ = datetime(2026, 11, 16, 10) < an
    raise AssertionError("hata bekleniyordu")
except TypeError:
    pass

# Unix zamanı: Python SANİYE, JavaScript MİLİSANİYE kullanır; karıştırınca yıl 57846 olur
saniye = int(an.timestamp())
assert datetime.fromtimestamp(saniye, tz=timezone.utc) == an
try:
    datetime.fromtimestamp(saniye * 1000, tz=timezone.utc)
    raise AssertionError("hata bekleniyordu")
except ValueError:
    pass
print("tamam")
```

| Değer türü                                    | Saklama biçimi                                              |
| --------------------------------------------- | ----------------------------------------------------------- |
| Olmuş bir an (kayıt zamanı, ödeme anı)         | UTC ISO 8601: `2026-11-16T07:00:00Z`                        |
| Saatsiz tarih (doğum günü, fatura günü)        | `2026-11-16` metni; saat dilimine çevirmeyin                 |
| Gelecekteki yerel olay (randevu 10:00, İstanbul) | Yerel saat + IANA bölge adı: `2026-12-01T10:00` + `Europe/Istanbul` |
| Süre                                          | Saniye (tamsayı) ya da ISO süre `PT1H30M`                   |

Gelecekteki randevuyu UTC'ye çevirip saklamak, ülkenin saat kuralı değişirse randevuyu kaydırır (Türkiye 2016'da
kalıcı yaz saatine geçti). Windows'ta `zoneinfo` için `tzdata` paketi gerekebilir (bu ortamda denenmedi).

## İkili ve metin

```python calistir
import base64
import hashlib
import json

veri = bytes(300)
assert len(base64.b64encode(veri)) == 400  # base64 %33 büyütür

# İmza ya da özet için JSON'u kanonik yazın: anahtar sırası ve boşluklar sabit olsun
a = {"tutar": 100, "alici": "Ayşe"}
b = {"alici": "Ayşe", "tutar": 100}
assert json.dumps(a) != json.dumps(b)  # aynı veri, farklı metin → farklı özet


def kanonik(nesne: object) -> bytes:
    return json.dumps(nesne, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


assert hashlib.sha256(kanonik(a)).hexdigest() == hashlib.sha256(kanonik(b)).hexdigest()
print("tamam")
```

## Tuzaklar

| Belirti                                                    | Neden                                                  | Çözüm                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------- |
| Büyük kimlik numarasının son haneleri değişti               | JSON sayısı JavaScript'te 2^53 üstünde bozulur          | Kimliği metin taşıyın                                    |
| Başka dil Python'un yazdığı JSON'u okuyamıyor                | `NaN`/`Infinity` yazıldı                                | `allow_nan=False`; geçersiz değeri `null` yapın            |
| JSON'da `İ` gibi kaçışlar                               | `ensure_ascii=True` varsayılanı                         | `ensure_ascii=False` + UTF-8 dosya                       |
| Rol alanı iki kez yazılmış, sonuncusu geçerli oldu            | Yinelenen anahtar sessizce kabul edilir                 | Şema doğrulama; Python'da `object_pairs_hook` ile denetim |
| YAML'da ülke kodu `NO` false oldu, sürüm `1.10` 1.1 oldu      | Örtük tip dönüşümü                                      | Tırnaklayın; yükledikten sonra şema                       |
| YAML'da telefon numarası sayıya döndü                        | Sekizlik/ondalık sayı sanıldı                           | Tırnaklayın                                              |
| Excel'de "Ã§", "ÅŸ" görünüyor                                 | BOM'suz UTF-8 CSV                                        | `encoding="utf-8-sig"`                                   |
| Excel bütün satırı tek hücrede gösteriyor                     | Türkçe Excel `;` bekliyor                               | `delimiter=";"`                                          |
| Excel'de fiyatlar sayı sayılmıyor (metin ya da tarih görünüyor) | Ondalık nokta; Türkçe Excel virgül bekler              | Ondalık virgül (`40,50`)                                 |
| CSV açılınca hücre formül çalıştırdı                          | `=` ile başlayan kullanıcı metni                         | Başına `'` ekleyin                                        |
| Tarih bir gün kaydı                                          | Saatsiz tarih UTC'ye çevrildi                            | Saatsiz tarihi metin tutun                               |
| Tarih 1970 ya da 57846 yılı çıktı                             | Saniye/milisaniye karışıklığı                            | Alan adında birimi yazın (`zaman_ms`)                    |
| `can't compare offset-naive and offset-aware datetimes`      | Saat dilimsiz zaman                                      | Her zaman dilimli zaman (`timezone.utc`)                 |
| Aynı veri için imza doğrulanmıyor                             | JSON anahtar sırası/boşluklar farklı                     | Kanonik yazım                                            |

## Denetim listesi

- [ ] Dışarıdan okunan her JSON/YAML/TOML/CSV verisi yüklendikten sonra şemayla doğrulanıyor.
- [ ] Kimlik, telefon, posta kodu, sürüm gibi "rakamlı metinler" her biçimde metin olarak yazılıyor.
- [ ] Zamanlar UTC ISO 8601; saatsiz tarihler `YYYY-AA-GG`; gelecekteki yerel olaylar bölge adıyla.
- [ ] JSON yazarken `ensure_ascii=False` ve (Python) `allow_nan=False`.
- [ ] YAML yalnız `safe_load` ile okunuyor; metin değerler tırnaklı.
- [ ] Excel'e giden CSV: `utf-8-sig`, `;`, ondalık virgül, formül önlemi; testte Türkçe harfli satır var.
- [ ] CSV `csv` modülüyle yazılıp okunuyor (`newline=""`); elle `split(",")` yok.
- [ ] İmzalanan/özetlenen JSON kanonik yazılıyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Zamanları UTC ISO 8601 yaz; kimlik ve telefonları metin olarak taşı; JSON'u
  `ensure_ascii=False` ile yaz; Excel için CSV'yi `utf-8-sig`, `;` ve ondalık virgülle `csv` modülüyle üret;
  okunan veriyi şemayla doğrula."
- **Modelin tipik hatası:** CSV'yi `",".join(...)` ile yazar; BOM'u ve `;`'yü unutur; `datetime.now()` (dilimsiz)
  kullanır; YAML'da sürüm ve telefonu tırnaksız yazar; tarihi `toISOString().slice(0, 10)` ile keser; büyük kimliği
  sayı olarak JSON'a koyar.
- **Çıktıda arayın:** `.join(` ile kurulan CSV satırı, `split(",")`, `datetime.now()` (dilimsiz), `utcnow`,
  `yaml.load(`, `json.dumps(` (`ensure_ascii` var mı), `encoding="utf-8"` (Excel'e giden dosyada `-sig` olmalı).
- **Doğrulama:** üretilen CSV'yi Türkçe Excel'de açtırın ya da en azından baytlarını (`BOM`, `;`, `,`) test ettirin.

## İlgili

- [Unicode ve kodlama](unicode-ve-kodlama.md): UTF-8, BOM, bozuk kodlama onarımı
- [JavaScript çalışma zamanı](javascript-calisma-zamani.md): `Date` ve büyük sayı tuzakları
- [Python tipleme ve proje düzeni](python-tipleme-ve-proje.md): okunan veriyi Pydantic ile doğrulamak
- [Düzenli ifadeler](duzenli-ifadeler.md): biçim denetimi ve sınırları
- [Zaman ve saat dilimi](../30-arkauc/zaman-ve-saat-dilimi.md): an, duvar saati, yaz saati
- [İçe ve dışa aktarım](../30-arkauc/ice-ve-disa-aktarim.md): CSV/Excel yükleme uçları, satır satır doğrulama
- Tarih yardımcıları: [`kutuphane/py/kutuphane/tarih.py`](../../kutuphane/py/kutuphane/tarih.py)
