---
baslik: Yerelleştirme denetimi
ozet: Tarih, saat, sayı, para, yüzde, çoğul, sıralama, ad, adres ve telefonun Türkiye biçimleri; Intl ile doğru biçimleme, sabit UTC+3 saat diliminin tarih hesabına etkisi ve denetim listesi.
etiketler: [turkce, yerellestirme, intl, tarih, saat-dilimi, bicimleme]
duzey: orta
guncellik: 2026-11
---

# Yerelleştirme denetimi

> Bu notu ne zaman okumalı: ekranda tarih, saat, para, yüzde ya da "3 dosya" gibi sayılı bir metin gösterirken;
> günlük rapor, "bugün" hesabı ya da zamanlanmış iş yazarken; ad, adres, telefon formu tasarlarken; ya da bir
> ekranı yayına çıkarmadan önce son denetimde.

## Temel fikir

Kural: **evrensel sakla, yerel göster.**

- Anlar UTC ve ISO 8601 (`2026-11-16T21:30:00Z`), takvim günleri `2026-11-16`, para tam sayı kuruş, telefon E.164
  (`+905321234567`) olarak saklanır.
- Biçimleme yalnız ekrana basarken ve **dil ile saat dilimi açıkça verilerek** yapılır: `'tr-TR'`,
  `timeZone: 'Europe/Istanbul'`. Verilmezse sonuç makineye göre değişir: geliştiricinin bilgisayarında Türkçe ve
  doğru, sunucuda İngilizce ve UTC.
- Elle biçimleme (`gün + '.' + ay`) yerine `Intl` kullanılır; ay adları, ayırıcılar ve sıralama orada hazırdır.

Türkiye 2016 sonbaharından beri saati geri almıyor: **yıl boyu UTC+3**. Daha önceki kışlarda UTC+2 idi. Bu
yüzden sabit "+3" yalnız 2016 sonrası anlar için doğrudur.

## Karar tablosu: Türkiye biçimleri

| Veri                                     | Saklama                       | Türkiye'de gösterim                                   | Araç                                            |
| ---------------------------------------- | ----------------------------- | ----------------------------------------------------- | ----------------------------------------------- |
| Takvim günü (doğum günü, son ödeme)      | `"2026-11-16"` metni          | 16.11.2026 · 16 Kasım 2026 Pazartesi                  | `Intl.DateTimeFormat`, `timeZone: 'UTC'` ile    |
| An (sipariş zamanı)                      | UTC: `2026-11-16T21:30:00Z`   | 17 Kasım 2026 00:30                                   | `Intl.DateTimeFormat`, `timeZone: 'Europe/Istanbul'` |
| Saat                                     | an içinde                     | 24 saat: 14:30 (TDK yazımı 14.30; birini seçin)       | `timeStyle: 'short'`                            |
| Sayı                                     | sayı                          | 1.234.567,891 (binlik nokta, ondalık virgül)          | `Intl.NumberFormat('tr-TR')`                    |
| Para                                     | tam sayı kuruş: `123450`      | ₺1.234,50 ya da 1.234,50 TL                           | `style: 'currency', currency: 'TRY'`; "TL" elle |
| Yüzde                                    | oran: `0.25`                  | %25 · %12,5 (işaret önde)                             | `style: 'percent'`                              |
| Sayıyla ad                               | sayı                          | 3 dosya ("3 dosyalar" değil); sıfırda "Dosya yok"     | Basit işlev; çoğul eki yok                      |
| Liste                                    | dizi                          | elma, armut ve ayva                                   | `Intl.ListFormat`                               |
| Göreli zaman                             | an                            | dün · 3 gün önce · 2 saat sonra                       | `Intl.RelativeTimeFormat`, `numeric: 'auto'`    |
| Sıralama                                 | özgün metin                   | cam, çay, ılık, iğne, İnci, şal, zil                  | `Intl.Collator('tr-TR')`                        |
| Haftanın ilk günü                        | —                             | Pazartesi                                             | `Intl.Locale` hafta bilgisi                     |
| Ad soyad                                 | iki alan: ad, soyad           | Ayşe Nur Yılmaz                                       | —                                               |
| Adres                                    | yapılı alanlar                | Cumhuriyet Mah. Atatürk Cad. No: 12 D: 5, 06420 Çankaya/Ankara | —                                      |
| Telefon                                  | E.164: `+905321234567`        | 0532 123 45 67                                        | [Türkiye biçimleri](turkiye-bicimleri.md)       |

## Intl ile doğru biçimleme

Bu makinede (Node 22, ICU 78) doğrulanmış çıktılar:

```js calistir
import assert from 'node:assert/strict'

const at = new Date('2026-11-16T21:30:00Z') // Türkiye'de 17 Kasım 00:30
const date = (opts, timeZone = 'Europe/Istanbul') => new Intl.DateTimeFormat('tr-TR', { timeZone, ...opts }).format(at)

assert.equal(date({ dateStyle: 'short' }), '17.11.2026')
assert.equal(date({ dateStyle: 'full', timeStyle: 'short' }), '17 Kasım 2026 Salı 00:30')
assert.equal(date({ dateStyle: 'short' }, 'UTC'), '16.11.2026') // sunucunun saatiyle: YANLIŞ gün

const number = new Intl.NumberFormat('tr-TR')
assert.equal(number.format(1234567.891), '1.234.567,891')
assert.equal(number.format(1234), '1.234')
assert.equal((1234.5).toLocaleString('tr-TR'), '1.234,5') // dil verilmezse makinenin diline göre değişir

const lira = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' })
assert.equal(lira.format(1234.5), '₺1.234,50')
const code = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', currencyDisplay: 'code' })
assert.equal(code.format(1234.5), 'TRY\xa01.234,50') // "TL" değil ve arada bölünmez boşluk var
assert.equal(new Intl.NumberFormat('tr-TR', { style: 'percent' }).format(0.25), '%25') // işaret önde

assert.equal(new Intl.ListFormat('tr-TR').format(['elma', 'armut', 'ayva']), 'elma, armut ve ayva')
const relative = new Intl.RelativeTimeFormat('tr-TR', { numeric: 'auto' })
assert.equal(relative.format(-1, 'day'), 'dün')
assert.equal(relative.format(-3, 'day'), '3 gün önce')

const words = ['zil', 'şal', 'İnci', 'iğne', 'ılık', 'çay', 'cam']
assert.deepEqual(words.toSorted(new Intl.Collator('tr-TR').compare), ['cam', 'çay', 'ılık', 'iğne', 'İnci', 'şal', 'zil'])

const locale = new Intl.Locale('tr-TR')
const week = locale.getWeekInfo?.() ?? locale.weekInfo // yöntemin adı Node sürümüne göre değişti
assert.equal(week.firstDay, 1) // hafta Pazartesi başlar: takvim bileşeni buna uymalı
console.log('tamam')
```

```cikti
tamam
```

"1.234,50 TL" biçimi isteniyorsa sayıyı `Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2,
maximumFractionDigits: 2 })` ile biçimleyip sonuna `'\xa0TL'` ekleyin; bölünmez boşluk, tutarın satır sonunda
"TL"den kopmasını önler.

## Sayıyla ad: Türkçede çoğul yok

Türkçede sayıdan sonra ad tekil kalır: "3 dosya", "1.500 kullanıcı". `Intl.PluralRules('tr-TR')` yine de `one` ve
`other` diye iki sınıf döndürür; çeviri araçları iki biçim ister ve çevirmen İngilizcedeki gibi `other` için
"dosyalar" yazınca "3 dosyalar" çıkar. Türkçede iki biçim de aynıdır; asıl ayrım **sıfır** içindir:

```js calistir
import assert from 'node:assert/strict'

const number = new Intl.NumberFormat('tr-TR')
const fileCount = (n) => (n === 0 ? 'Dosya yok' : `${number.format(n)} dosya`)
assert.equal(fileCount(0), 'Dosya yok')
assert.equal(fileCount(1), '1 dosya')
assert.equal(fileCount(1500), '1.500 dosya')

const fromEnglish = (n) => (n === 1 ? '1 dosya' : `${n} dosyalar`) // YANLIŞ: İngilizce kalıbın çevirisi
assert.equal(fromEnglish(3), '3 dosyalar')
assert.deepEqual(new Intl.PluralRules('tr-TR').resolvedOptions().pluralCategories, ['one', 'other'])
console.log('tamam')
```

```cikti
tamam
```

## Saat dilimi

Sunucu UTC'de çalışır, kullanıcı UTC+3'tedir. Gece 00:00–03:00 arasında ikisinin "bugün"ü farklıdır. Sonuçları:

1. **"Bugün" hesabı** kullanıcının saat diliminde yapılır; `date.today()`, `new Date().toDateString()` sunucu günüdür.
2. **Günlük rapor** Türkiye gününe göre gruplanır; UTC gününe göre değil.
3. **"Her gün 09:00'da"** çalışan iş, sunucuda UTC 06:00'dır. Yaz saati olmadığı için bu fark yıl boyu sabittir.
4. **2016 öncesi veri** için sabit "+3" yanlıştır; `Europe/Istanbul` saat dilimi adını kullanın.
5. **Takvim günü** (doğum günü, son ödeme tarihi) saat dilimiyle çevrilmez; çevrilirse batıdaki kullanıcıda bir gün
   geri kayar.
6. **Yurt dışındaki kullanıcı:** hangi günün önemli olduğuna karar verin (işletmenin günü mü, kullanıcınınki mi)
   ve yazın.

```js calistir
import assert from 'node:assert/strict'

const due = new Date('2026-11-16') // JS tarih-yalnız metni UTC gece yarısı olarak okur
const show = (timeZone) => new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeZone }).format(due)
assert.equal(show('America/New_York'), '15.11.2026') // YANLIŞ: bir gün geri kaydı
assert.equal(show('UTC'), '16.11.2026') // takvim gününü UTC ile biçimleyin

const offset = (iso) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Istanbul', timeZoneName: 'shortOffset' })
    .formatToParts(new Date(iso))
    .find((part) => part.type === 'timeZoneName').value
assert.equal(offset('2015-01-15T12:00:00Z'), 'GMT+2') // 2016 öncesi kış
assert.equal(offset('2015-07-15T12:00:00Z'), 'GMT+3') // 2016 öncesi yaz
assert.equal(offset('2026-01-15T12:00:00Z'), 'GMT+3') // bugün: yıl boyu
console.log('tamam')
```

```cikti
tamam
```

Türkiye gününe ait kayıtları sorgularken sütuna işlev uygulamak yerine günün UTC sınırlarını hesaplayın; böylece
dizin kullanılır:

```python calistir
from datetime import date, datetime, timedelta, timezone

TR = timezone(timedelta(hours=3))  # 2016 sonrası için doğru; daha eski veride "Europe/Istanbul" kullanın


def tr_day_bounds(day: date) -> tuple[str, str]:
    """Türkiye takvim gününün UTC başı ve sonu: WHERE olusma >= ? AND olusma < ? için."""
    start = datetime(day.year, day.month, day.day, tzinfo=TR).astimezone(timezone.utc)
    end = start + timedelta(days=1)
    return start.strftime("%Y-%m-%dT%H:%M:%SZ"), end.strftime("%Y-%m-%dT%H:%M:%SZ")


assert tr_day_bounds(date(2026, 11, 16)) == ("2026-11-15T21:00:00Z", "2026-11-16T21:00:00Z")

server_now = datetime(2026, 11, 16, 22, 30, tzinfo=timezone.utc)
assert server_now.date() == date(2026, 11, 16)  # sunucunun "bugün"ü
assert server_now.astimezone(TR).date() == date(2026, 11, 17)  # kullanıcının bugünü
print("tamam")
```

```cikti
tamam
```

Aynı veride UTC gününe ve Türkiye gününe göre sayım farklı çıkar:

```sql calistir
CREATE TABLE siparis (id INTEGER PRIMARY KEY, olusma TEXT NOT NULL);
INSERT INTO siparis (olusma) VALUES
  ('2026-11-15T20:30:00Z'), ('2026-11-15T21:30:00Z'), ('2026-11-16T09:00:00Z'),
  ('2026-11-16T22:15:00Z'), ('2026-11-16T22:45:00Z');
SELECT 'UTC', date(olusma), count(*) FROM siparis WHERE date(olusma) = '2026-11-16';
SELECT 'TR', count(*) FROM siparis WHERE olusma >= '2026-11-15T21:00:00Z' AND olusma < '2026-11-16T21:00:00Z';
```

```cikti
UTC|2026-11-16|3
TR|2
```

"16 Kasım'da kaç sipariş geldi?" sorusunun yanıtı 2'dir; UTC gününe göre yazılmış rapor 3 der.

## Ad, adres, telefon

- **Ad soyad:** iki alan kullanın. Ad birden çok sözcük olabilir ("Ayşe Nur"); soyad da ("Yılmaz Demir"). Tam adı
  son boşluktan bölmek bu iki durumda yanlış sonuç verir. Ad alanını `[A-Za-z]` ile doğrulamayın: ç, ğ, ı, İ, ö, ş,
  ü, â ve yabancı adlardaki kesme imi, tire geçerlidir. Hitapta "Sayın Ayşe Yılmaz" yazın; "Bey/Hanım" cinsiyet
  bilgisi ister ve ada eklenir ("Ahmet Bey"), soyada değil.
- **Adres:** il ve ilçe seçmeli (bağımlı liste), mahalle, cadde/sokak, bina (dış kapı) no, daire (iç kapı) no,
  posta kodu (isteğe bağlı, 5 hane). Tek satırlık serbest adres alanı, kargo ve fatura entegrasyonunda sorun çıkarır.
  İl ve ilçe listesi: [`veri/tr/ilceler.csv`](../../veri/tr/ilceler.csv).
- **Telefon:** girişte boşluk, ayraç, tire, baştaki 0 ya da +90 kabul edilir; E.164'e çevrilip saklanır, gösterimde
  "0532 123 45 67". Ayrıntı: [Türkiye biçimleri](turkiye-bicimleri.md).
- **Sayı girişi:** kullanıcı "12,5" yazar. `<input type="number">` virgüllü girişi tarayıcıya ve cihaz diline göre
  farklı işler; metin kutusu + `inputmode="decimal"` + kendi ayrıştırıcınız daha öngörülebilirdir
  ([Türkçe sayı ve para](turkce-sayi-ve-para.md)).

## Python'da

Python'un `locale` modülü işletim sistemindeki yerel ayar paketlerine bağlıdır; çoğu sunucuda `tr_TR.UTF-8` kurulu
değildir (bu makinede `locale.setlocale` "unsupported locale setting" hatası verdi) ve ayar bütün süreci etkiler.
Kendi küçük yardımcılarınızı ya da havuzdaki kütüphaneyi kullanın:
[tarih.py](../../kutuphane/py/kutuphane/tarih.py), [sayi_yazi.py](../../kutuphane/py/kutuphane/sayi_yazi.py).

## Tuzaklar

| Belirti                                                      | Neden                                                     | Çözüm                                                         |
| ------------------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------- |
| Yerelde "16.11.2026", sunucuda "11/16/2026"                  | Dil verilmeden `toLocaleString()`                         | Her çağrıda `'tr-TR'` verin; tek bir biçimleme dosyası        |
| Gece yarısından sonra verilen sipariş dünün raporunda        | Gruplama UTC gününe göre                                  | Türkiye gününün UTC sınırlarıyla sorgulayın                   |
| Doğum günü bir gün önce görünüyor                            | Takvim günü saat dilimiyle çevrildi                       | Takvim gününü metin tutun; `timeZone: 'UTC'` ile biçimleyin   |
| 2015 kayıtlarında saat bir saat kayık                        | Eski veriye sabit +3 uygulandı                            | `Europe/Istanbul` adıyla çevirin                              |
| "3 dosyalar", "1 kullanıcılar"                               | İngilizce çoğul kalıbı çevrildi                           | Sayıdan sonra tekil ad; sıfır için ayrı ileti                  |
| "25%" ya da "% 25"                                           | Elle biçimleme                                            | `style: 'percent'` → "%25"                                    |
| Tutar satır sonunda "1.234,50" / "TL" diye bölündü           | Normal boşluk                                             | Bölünmez boşluk (`\xa0`)                                      |
| Takvim pazardan başlıyor                                     | Varsayılan ABD düzeni                                     | Hafta Pazartesi başlar                                        |
| Testler ICU güncellemesinden sonra kırıldı                   | Biçimlenmiş metnin tamamı karşılaştırılıyor               | Biçimleme testlerini tek yerde toplayın; sürüm notunu okuyun  |
| Python'da `locale.setlocale` sunucuda hata veriyor           | Sunucuda Türkçe yerel ayar paketi yok                     | `locale`a bağlı olmayan yardımcılar                           |

## Denetim listesi

- [ ] Her biçimleme çağrısında dil (`'tr-TR'`) ve anlar için saat dilimi (`'Europe/Istanbul'`) açıkça verilmiş.
- [ ] Anlar UTC saklanıyor; takvim günleri saat diliminden bağımsız metin.
- [ ] "Bugün", gün sınırı ve günlük raporlar Türkiye gününe göre; 00:30'da oluşan kayıtla test edildi.
- [ ] Para tam sayı kuruş; gösterim ₺1.234,50 ya da 1.234,50 TL (projede biri seçili).
- [ ] Yüzde "%25" biçiminde; sayılar "1.234,5" biçiminde.
- [ ] Sayılı metinlerde ad tekil; sıfır için ayrı ileti var.
- [ ] Listeler `Intl.ListFormat`, göreli zaman `Intl.RelativeTimeFormat` ile.
- [ ] Sıralama Türkçe harmanlamayla ([Türkçe büyük/küçük harf](buyuk-kucuk-harf.md)).
- [ ] Takvim bileşenleri Pazartesi'den başlıyor.
- [ ] Ad ve soyad ayrı alan; Türkçe harfler ve çok sözcüklü ad kabul ediliyor.
- [ ] Adres il/ilçe seçmeli ve yapılı alanlarda.
- [ ] Telefon E.164 saklanıyor, "0532 123 45 67" gösteriliyor.
- [ ] Sayı girişi virgülü kabul ediyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Tarih, sayı, para ve yüzdeyi yalnız `Intl` ile ve `'tr-TR'` vererek biçimle; anlarda
  `timeZone: 'Europe/Istanbul'` ver. Elle biçimleme yazma. Para tam sayı kuruştur. Sayıdan sonra ad tekil kalır.
  'Bugün' ve günlük gruplama Türkiye gününe göredir." Projede biçimleme yardımcısı varsa adını ve yerini verin.
- **Modelin tipik hatası:** dil vermeden `toLocaleString()` yazar; `new Date('2026-11-16')` ile takvim gününü saat
  dilimine sokar; tarihe elle "+3 saat" ekler; "%25" yerine "25%" yazar; "3 dosyalar" üretir; Python'da
  `locale.setlocale` kullanır; ay adlarını İngilizce bırakır.
- **Çıktıda denetleyin:** `toLocaleString()`, `toLocaleDateString()` çağrılarında dil var mı; `getDate()`,
  `getMonth()` ile elle biçimleme var mı; `+ 3`, `+3 hours` gibi elle kaydırma; `%` işaretinin yeri; saat diliminin
  verilmediği `Intl.DateTimeFormat`.

## İlgili

- [Türkçe büyük/küçük harf](buyuk-kucuk-harf.md): sıralama ve harf dönüşümü.
- [Türkiye biçimleri](turkiye-bicimleri.md): telefon, posta kodu, TCKN, IBAN.
- [Türkçe sayı ve para](turkce-sayi-ve-para.md): ayrıştırma, yuvarlama, KDV.
- [Hata sınıfları ve imzaları](../00-yontem/hata-siniflari.md): saat dilimi hatalarının imzası.
- Çalışan gerçekleme: [kutuphane/py/kutuphane/tarih.py](../../kutuphane/py/kutuphane/tarih.py) ve TypeScript eşi
  [kutuphane/ts/src/tarih.ts](../../kutuphane/ts/src/tarih.ts); resmî tatil verisi
  [veri/tr/resmi_tatiller.csv](../../veri/tr/resmi_tatiller.csv).
