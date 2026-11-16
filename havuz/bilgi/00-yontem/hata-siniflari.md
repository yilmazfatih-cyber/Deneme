---
baslik: Hata sınıfları ve imzaları
ozet: Sık hata sınıflarının ekrandaki imzası ve ilk bakılacak yer; bir eksik/fazla, bayat durum, yarış, kodlama, saat dilimi, kayan nokta, önbellek ve JavaScript tuzakları çalışan örneklerle.
etiketler: [yontem, hata-ayiklama, hata-siniflari, kodlama, saat-dilimi, yaris]
duzey: orta
guncellik: 2026-11
---

# Hata sınıfları ve imzaları

> Bu notu ne zaman okumalı: bir belirti gördünüz ve nereden başlayacağınızı bilmiyorsanız. Önce imza tablosunda
> belirtiyi bulun, sonra ilgili bölümdeki örnekle karşılaştırın. Yöntemin kendisi: [Hata ayıklama](hata-ayiklama.md).

## Temel fikir

Hataların büyük çoğunluğu az sayıda sınıfa düşer ve her sınıfın tanınabilir bir **imzası** vardır: "Ã§" görmek
kodlamayı, "gece yarısından sonra yanlış gün" saat dilimini, "günlük ekleyince kayboluyor" yarışı düşündürür.
İmzayı tanımak, arama alanını saatlerden dakikalara indirir. Ama imza bir **hipotezdir**, kanıt değil: tablodaki
"ilk bakılacak yer"i sınayın, doğrulamadan düzeltmeyin.

## İmza tablosu

| Ne görüyorsunuz                                                         | Olası sınıf                               | İlk bakılacak yer                                                |
| ----------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| Son sayfa eksik, son öğe yok, bir öğe iki kez                           | Bir eksik / bir fazla                     | `<` mı `<=` mı; sayfa sayısı yukarı yuvarlanıyor mu              |
| İkinci çağrıda eski değer, birikmiş liste                               | Bayat durum                               | Paylaşılan değiştirilebilir nesne, kapanış (closure), önbellek   |
| Bazen oluyor; günlük ekleyince kayboluyor; yük altında artıyor          | Yarış (race condition)                    | Oku → denetle → yaz arası; çift tıklama; iki sekme               |
| `Ã§`, `ÅŸ`, `Ä±`, `Ã¼` gibi harfler                                     | UTF-8 metin Windows-1252 sanılıp okunmuş  | Dosya/HTTP/veritabanı bağlantısının kodlama ayarı                |
| `�` (U+FFFD) Türkçe harflerin yerinde                                   | Windows-1254 bayt UTF-8 sanılıp okunmuş   | Kaynağın gerçek kodlaması (Excel'den CSV sık neden)              |
| Gece 00:00–03:00 arası yanlış gün; tam 3 saat kayma; ay sonu raporu eksik | Saat dilimi                             | Sunucu UTC mi; dilimsiz tarih-saat; `date.today()`               |
| Kaydedildi ama ekranda eski; yenileyince düzeliyor ya da düzelmiyor     | Önbellek                                  | Tarayıcı, CDN, servis çalışanı (service worker), uygulama önbelleği |
| `0.30000000000000004`; toplam 1 kuruş tutmuyor                          | Kayan nokta (float)                       | Para `float` mı; yuvarlama nerede ve kaç kez                     |
| Büyük kimliklerin son haneleri değişiyor                                | JavaScript sayı duyarlılığı (2⁵³)         | JSON'da 64 bitlik tam sayı                                       |
| 0 girilince varsayılan değer geliyor                                    | Yanlışımsı değer (`0 \|\| x`)             | `\|\|` yerine `??`                                               |
| Liste `1, 10, 2` diye sıralı                                            | Sayılar metin gibi sıralanmış             | Karşılaştırma işlevi                                             |
| Tarih bir ay kayık                                                      | JavaScript'te aylar 0'dan başlar          | `new Date(yıl, ay, gün)` çağrıları                               |
| "ISTANBUL", "ınfo@ornek.com"                                            | Yerel ayarsız büyük/küçük harf            | [Türkçe büyük/küçük harf](../97-turkce/buyuk-kucuk-harf.md)      |
| Negatif tutarlar ötekilerden farklı yuvarlanıyor; negatif kalan         | İşaretli sayıda yuvarlama ve `%`          | `Math.round`, `%` kullanılan yerler                              |
| Çift kayıt, çift ödeme, çift e-posta                                    | Yeniden deneme var, idempotentlik yok     | [Güvenilirlik düşüncesi](guvenilirlik-dusuncesi.md)               |
| Bellek saatler içinde sürekli artıyor                                   | Sızıntı                                   | Sınırsız önbellek, kaldırılmayan olay dinleyicisi, global liste  |
| İlk açılış sağlam, güncellemeden sonra bozuk                            | Kalıcı durum ile yeni kod uyuşmuyor       | localStorage/IndexedDB biçimi, veritabanı göçü                   |
| Yalnız üretimde, yalnız bir kullanıcıda                                 | Ortam ya da veri farkı                    | Sürüm, ayar, dil, saat dilimi, o kullanıcının verisi             |

## Bir eksik / bir fazla

Sınırlarda yaşar: döngü bitişi, sayfa sayısı, dilim (slice) bitişi, "son gün dahil mi".

```python calistir
import math

total, size = 25, 10
assert total // size == 2  # YANLIŞ: son 5 kayıt hiçbir sayfada görünmez
assert math.ceil(total / size) == 3
assert -(-total // size) == 3  # yalnız tam sayıyla yukarı yuvarlama
assert list(range(1, 5)) == [1, 2, 3, 4]  # bitiş dahil değildir

items = list(range(total))
pages = [items[i * size : (i + 1) * size] for i in range(math.ceil(total / size))]
assert sum(len(page) for page in pages) == total
print("tamam")
```

```cikti
tamam
```

Sınama kuralı: sayı alan her işlevi **0, 1, sınır − 1, sınır, sınır + 1** ve tam katlarla deneyin.

## Bayat durum

Değer, artık geçerli olmayan bir önceki duruma bakıyor. Python'daki iki klasik:

```python calistir
# 1) Değiştirilebilir varsayılan argüman: liste bir kez oluşur, çağrılar arasında paylaşılır
def add_tag(tag: str, tags: list[str] = []) -> list[str]:  # YANLIŞ
    tags.append(tag)
    return tags


assert add_tag("a") == ["a"]
assert add_tag("b") == ["a", "b"]  # önceki çağrının etiketi sızdı


def add_tag_ok(tag: str, tags: list[str] | None = None) -> list[str]:
    tags = [] if tags is None else tags
    tags.append(tag)
    return tags


assert add_tag_ok("b") == ["b"]

# 2) Geç bağlama: döngüde kurulan işlevler değişkenin SON değerini görür
callbacks = [lambda: i for i in range(3)]
assert [f() for f in callbacks] == [2, 2, 2]  # YANLIŞ
callbacks = [lambda i=i: i for i in range(3)]
assert [f() for f in callbacks] == [0, 1, 2]
print("tamam")
```

```cikti
tamam
```

Arayüzde aynı sınıf: React'te bir efektin ya da zamanlayıcının içindeki eski `state`; bir isteğin yanıtı geç
gelip yeni yanıtın üstüne yazması (eski isteği iptal etmek ya da yanıtın hangi isteğe ait olduğunu denetlemek).

## Yarış

İki işlem aynı veriyi okur, ikisi de kendi hesabıyla yazar; biri ötekini siler. Zamanlamaya bağlı olduğu için
"bazen" olur. Aşağıda iki para çekme işlemi sırayla değil iç içe ilerliyor:

```python calistir
balance = {"value": 100}


def withdraw(amount: int):
    current = balance["value"]  # oku
    yield  # burada öteki işlem araya girer
    if current >= amount:  # denetle (bayat değerle!)
        yield
        balance["value"] = current - amount  # yaz


first, second = withdraw(80), withdraw(80)
for step in [first, second, first, second, first, second]:
    next(step, None)
assert balance["value"] == 20  # 160 TL çekildi, bakiye yine 20: biri kayboldu
print("iki çekim de geçti, bakiye:", balance["value"])
```

```cikti
iki çekim de geçti, bakiye: 20
```

Çözüm, oku-denetle-yaz aralığını kapatmaktır: koşulu **yazma işleminin içine** koyun ve kaç satır değiştiğine
bakın. Veritabanı bunu tek işlemde yapar:

```sql calistir
CREATE TABLE hesap (id INTEGER PRIMARY KEY, bakiye INTEGER NOT NULL);
INSERT INTO hesap VALUES (1, 100);
UPDATE hesap SET bakiye = bakiye - 80 WHERE id = 1 AND bakiye >= 80;
UPDATE hesap SET bakiye = bakiye - 80 WHERE id = 1 AND bakiye >= 80;
SELECT changes();
SELECT bakiye FROM hesap;
```

```cikti
0
20
```

İkinci çekim hiçbir satırı değiştirmedi (`changes()` = 0); uygulama bunu "yetersiz bakiye" diye bildirir. Aynı
sınıftan: aynı kullanıcı adının iki kez alınması (çözüm: benzersizlik kısıtı), çift tıklamayla iki sipariş
(çözüm: idempotentlik anahtarı), sayaç artırma (çözüm: `SET n = n + 1`, okuyup yazmak değil).

## Kodlama

Bayt dizisi yanlış kodlamayla çözülünce Türkçe harfler tanınır biçimde bozulur. İmzayı tanırsanız kaynağı
bilirsiniz:

```python calistir
signatures = {ch: ch.encode("utf-8").decode("cp1252") for ch in "çğıöşüİ"}
assert signatures == {"ç": "Ã§", "ğ": "ÄŸ", "ı": "Ä±", "ö": "Ã¶", "ş": "ÅŸ", "ü": "Ã¼", "İ": "Ä°"}

# Tersine çevrilebilir: bozulma tek katsa düzeltilebilir (ama asıl çözüm kaynağı düzeltmektir)
assert "ÅŸeker".encode("cp1252").decode("utf-8") == "şeker"

# Öteki yön: Windows-1254 (Türkçe) bayt UTF-8 sanılırsa harf kaybolur, geri getirilemez
assert "şeker".encode("cp1254").decode("utf-8", errors="replace") == "\N{REPLACEMENT CHARACTER}eker"
print("imzalar doğrulandı")
```

```cikti
imzalar doğrulandı
```

Kural: metin sisteme girerken **bir kez** çözülür (kodlaması bilinerek), içeride hep Unicode dolaşır, çıkarken
UTF-8 yazılır. `replace("Ã§", "ç")` zinciri yazmak belirtiyi tedavi eder; bir sonraki harfte yine bozulur.

## Saat dilimi

Sunucu UTC'de çalışır, kullanıcı Türkiye'dedir (UTC+3). Türkiye saatiyle gece 01:30'da UTC'de hâlâ dündür:

```python calistir
from datetime import datetime, timedelta, timezone

TR = timezone(timedelta(hours=3))
moment = datetime(2026, 11, 16, 22, 30, tzinfo=timezone.utc)  # Türkiye'de 17 Kasım 01:30

assert str(moment.date()) == "2026-11-16"  # YANLIŞ gün: sunucunun günü
assert str(moment.astimezone(TR).date()) == "2026-11-17"  # kullanıcının günü
print("tamam")
```

```cikti
tamam
```

Kural: anları UTC saklayın, "hangi gün" sorusunu kullanıcının saat diliminde yanıtlayın, dilimsiz tarih-saat
(`datetime.now()`) kullanmayın. Ayrıntı: [Yerelleştirme denetimi](../97-turkce/yerellestirme-denetimi.md).

## Kayan nokta

`float` ikili kesirdir; 0,1'i tam tutamaz. Para, puan toplamı ve eşitlik denetimi bu yüzden bozulur. Üstelik
sonuç toplama biçimine göre değişir:

```python calistir
from decimal import Decimal

assert 0.1 + 0.2 != 0.3
total = 0.0
for _ in range(10):
    total += 0.1
assert total == 0.9999999999999999  # döngüyle toplam
assert sum([0.1] * 10) == 1.0  # Python 3.12+ sum() dengeli toplar: aynı veri, başka sonuç
assert Decimal("0.1") + Decimal("0.2") == Decimal("0.3")
assert 10 + 20 == 30  # parayı kuruş cinsinden tam sayı tutun
print("tamam")
```

```cikti
tamam
```

Kural: para tam sayı kuruştur ([Türkçe sayı ve para](../97-turkce/turkce-sayi-ve-para.md)); ölçüm değerleri
`abs(a - b) < tolerans` ile karşılaştırılır, `==` ile değil.

## JavaScript'e özgü

```js calistir
import assert from 'node:assert/strict'

assert.equal(JSON.parse('{"id": 9007199254740993}').id, 9007199254740992) // kimlik sessizce değişti
assert.deepEqual([10, 9, 1].sort(), [1, 10, 9]) // varsayılan sıralama metin sıralamasıdır
assert.deepEqual([10, 9, 1].sort((a, b) => a - b), [1, 9, 10])
assert.equal(0 || 10, 10) // 0 geçerli bir değerdi, kayboldu
assert.equal(0 ?? 10, 0)
assert.equal(new Date(2026, 10, 16).getMonth(), 10) // 10 = Kasım: aylar 0'dan başlar
assert.equal(Math.round(2.5), 3)
assert.equal(Math.round(-2.5), -2) // yarım +∞ yönüne: iade tutarları farklı yuvarlanır
assert.equal(-7 % 10, -7) // kalan işaretlidir; sağlama hanesi hesabında ((x % n) + n) % n
console.log('tamam')
```

```cikti
tamam
```

Büyük kimlikleri JSON'da **metin** olarak taşıyın (`"id": "9007199254740993"`).

## Önbellek

"Yeniledim, düzelmedi" ile "gizli pencerede düzgün" farklı katmanları gösterir. Katmanları içten dışa sayın:
uygulama içi bellek önbelleği → servis çalışanı (PWA'larda en sık suçlu) → tarayıcı HTTP önbelleği → CDN →
sunucudaki sorgu önbelleği. Her katman için iki soru: **ne zaman geçersiz kılınıyor** ve **anahtarı neye göre**
(kullanıcıya göre değilse bir kullanıcının verisi ötekine görünür). Önbelleği kapatarak "düzeltmek" tanıdır,
tedavi değil.

## Tuzaklar

| Belirti                                                     | Neden                                         | Çözüm                                                         |
| ----------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------- |
| Kodda `replace("Ã§", "ç")` zinciri büyüyor                   | Belirti düzeltiliyor, kaynak kodlaması değil  | Girişte doğru kodlamayla bir kez çözün                        |
| Yarış `sleep` ile "çözüldü", yük altında geri geldi         | Zamanlama değişti, aralık kapanmadı           | Koşullu yazma, kilit ya da benzersizlik kısıtı                |
| Tarihe elle `+3 saat` eklendi, bazı yerlerde 6 saat kaydı   | Dönüşüm iki katmanda birden yapıldı           | Tek kural: UTC sakla, gösterirken bir kez çevir               |
| Her hesaba `round()` serpiştirildi, toplam yine tutmuyor    | Yuvarlama çok yerde ve farklı yönlerde        | Tam sayı kuruş; yuvarlama tek yerde, bölüştürme en büyük kalanla |
| Önbellek kapatıldı, site yavaşladı                          | Geçersiz kılma yerine önbelleği yok etmek     | Doğru anahtar ve geçersiz kılma zamanı                        |
| İmza tablosundan sınıf seçildi, düzeltme işe yaramadı       | İmza kanıt sanıldı                            | İmza hipotezdir: önce ilk bakılacak yeri sınayın              |

## Denetim listesi

- [ ] Sınır değerleri test edildi: 0, 1, sınır − 1, sınır, sınır + 1, tam kat.
- [ ] Türkçe harfler (çğıöşüİ) girişten çıkışa gidip gelince aynı kalıyor.
- [ ] Türkiye saatiyle 00:30'da oluşan kayıt doğru güne yazılıyor.
- [ ] Para hesapları tam sayı kuruşla; negatif tutar da denendi.
- [ ] Büyük kimlikler JSON'da metin.
- [ ] Çift tıklama ve iki sekmeden aynı işlem denendi; çift kayıt oluşmuyor.
- [ ] Varsayılan argümanlarda değiştirilebilir nesne yok (`[]`, `{}`).
- [ ] Önbelleğin her katmanı için geçersiz kılma zamanı biliniyor.

## Küçük modele yaptırırken

- **İsteme yazın:** belirtiyi olduğu gibi verin ve "Düzeltmeden önce belirtiyi bu tablodaki bir sınıfa bağla,
  gerekçeni yaz ve sınıfı doğrulayacak tek bir sınama öner" deyin; ilgili satırları isteme ekleyin.
- **Modelin tipik hatası:** belirtiyi yamar (bozuk harfleri `replace` ile düzeltir, saate elle 3 ekler, toplama
  `round` koyar, yarışa `sleep` ekler); parayı `float` ile hesaplar; JavaScript'te sayıları karşılaştırma işlevsiz
  sıralar.
- **Çıktıda denetleyin:** `replace(` ile harf düzeltme, `sleep`/`setTimeout` ile bekleme, `+ 3` / `+3 hours`,
  `parseFloat` ile para, karşılaştırma işlevsiz `.sort()`, `|| 0` gibi kalıplar.

## İlgili

- [Hata ayıklama](hata-ayiklama.md): yöntem ve ikili arama.
- [Güvenilirlik düşüncesi](guvenilirlik-dusuncesi.md): yeniden deneme ve idempotentlik.
- [Yerelleştirme denetimi](../97-turkce/yerellestirme-denetimi.md): saat dilimi ve biçimler.
- [Türkçe metin işleme](../97-turkce/turkce-metin-isleme.md): normalleştirme ve görünmez karakterler.
- Diğer kümelerden: [Unicode ve kodlama](../10-diller/unicode-ve-kodlama.md), [Zaman ve saat dilimi](../30-arkauc/zaman-ve-saat-dilimi.md), [Sayılar ve kayan nokta](../92-matematik/sayilar-ve-kayan-nokta.md), [Python tuzakları](../10-diller/python-tuzaklar.md), [İşlemler ve eşzamanlılık](../30-arkauc/islemler-ve-eszamanlilik.md), [Önbellek katmanları](../40-sistem-tasarimi/onbellek-katmanlari.md).
