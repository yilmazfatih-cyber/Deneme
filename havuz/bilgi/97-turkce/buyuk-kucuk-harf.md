---
baslik: Türkçe büyük/küçük harf dönüşümü
ozet: i/İ ve ı/I harflerinin neden bozulduğu, her dilde doğru dönüşüm ve arama için katlama.
etiketler: [turkce, metin, unicode, yerellestirme]
duzey: temel
guncellik: 2026-11
---

# Türkçe büyük/küçük harf dönüşümü

> Bu notu ne zaman okumalı: kodda `upper`, `lower`, `toUpperCase`, `toLowerCase`, büyük-küçük harf duyarsız
> karşılaştırma, arama ya da sıralama gördüğünüzde; ya da ekranda "ISTANBUL", "İSTANBUL" yerine "iSTANBUL" gibi
> tuhaf bir yazı çıktığında.

## Temel fikir

Türkçede **dört ayrı i harfi** vardır ve ikişer ikişer eşleşirler:

| Küçük | Büyük | Unicode           |
| ----- | ----- | ----------------- |
| `i`   | `İ`   | U+0069 ↔ U+0130   |
| `ı`   | `I`   | U+0131 ↔ U+0049   |

Programlama dillerinin varsayılan dönüşümü İngilizce kuralı uygular: `i ↔ I`. Sonuç: "istanbul" büyütülünce
"ISTANBUL" olur (doğrusu "İSTANBUL"), "ISPARTA" küçültülünce "isparta" olur (doğrusu "ısparta"). Hata sessizdir:
program çökmez, yalnız yazı yanlış çıkar ya da arama sonuç bulamaz.

İkinci tuzak: `İ` harfi yerel kural **olmadan** küçültülürse bazı ortamlarda iki karaktere dönüşür: `i` + birleşik
nokta (U+0307). Göze "i̇" gibi görünür ama `"i"` ile eşit değildir; uzunluğu da 2'dir.

## Karar tablosu

| Ne yapıyorsunuz                                   | Ne kullanılır                                              |
| ------------------------------------------------- | ---------------------------------------------------------- |
| Kullanıcıya gösterilecek Türkçe metni büyüt/küçült | Türkçe kurallı dönüşüm (aşağıda)                           |
| Arama, süzme, "aynı mı" karşılaştırması            | **Katlama**: iki tarafı da ortak bir anahtara indirgeme    |
| Alfabetik sıralama                                 | Türkçe harmanlama (collation); kod noktasına göre değil    |
| E-posta, kullanıcı adı, URL, dosya uzantısı, kod   | **İngilizce** kural (ASCII); Türkçe kural burada bozar     |
| Protokol/anahtar sözcük karşılaştırması (`GET`)    | İngilizce kural ya da hiç dönüştürmeden tam eşleşme        |

Son iki satır en çok unutulandır: `"INFO@ORNEK.COM"` Türkçe kuralla küçültülürse `"ınfo@ornek.com"` olur ve adres
bozulur. Kural şudur: **insan diliyse Türkçe kural, makine diliyse İngilizce kural.**

## Nasıl yapılır

### JavaScript / TypeScript

`toLocaleUpperCase('tr-TR')` ve `toLocaleLowerCase('tr-TR')` doğru çalışır.

```js calistir
import assert from 'node:assert/strict'

// YANLIŞ: yerel kural yok
assert.equal('istanbul'.toUpperCase(), 'ISTANBUL')
assert.equal('ISPARTA'.toLowerCase(), 'isparta')

// DOĞRU
assert.equal('istanbul'.toLocaleUpperCase('tr-TR'), 'İSTANBUL')
assert.equal('ISPARTA'.toLocaleLowerCase('tr-TR'), 'ısparta')
assert.equal('İstanbul'.toLocaleLowerCase('tr-TR'), 'istanbul')

// Yerel kuralsız küçültme İ harfini iki karaktere çevirir
assert.equal('İ'.toLowerCase().length, 2)
console.log('tamam')
```

Sıralama için `Intl.Collator`:

```js calistir
import assert from 'node:assert/strict'

const words = ['zil', 'çay', 'cam', 'ılık', 'iğne', 'şal', 'su']
const wrong = words.toSorted() // kod noktasına göre: ç, ı, ş en sona gider
const right = words.toSorted(new Intl.Collator('tr-TR').compare)
assert.deepEqual(wrong, ['cam', 'iğne', 'su', 'zil', 'çay', 'ılık', 'şal'])
assert.deepEqual(right, ['cam', 'çay', 'ılık', 'iğne', 'su', 'şal', 'zil'])
console.log('tamam')
```

### Python

Python'un `str.upper()` ve `str.lower()` işlevleri yerel kural bilmez; `locale` modülü de bunları değiştirmez.
Dönüşümden önce dört harfi elle çevirmek gerekir:

```python calistir
def upper_tr(text: str) -> str:
    return text.replace("i", "İ").replace("ı", "I").upper()


def lower_tr(text: str) -> str:
    return text.replace("İ", "i").replace("I", "ı").lower()


# YANLIŞ: yerleşik işlevler
assert "istanbul".upper() == "ISTANBUL"
assert "ISPARTA".lower() == "isparta"
assert len("İ".lower()) == 2  # i + birleşik nokta

# DOĞRU
assert upper_tr("istanbul ılık") == "İSTANBUL ILIK"
assert lower_tr("İSTANBUL ILIK") == "istanbul ılık"
assert lower_tr(upper_tr("çığ gibi iş")) == "çığ gibi iş"
print("tamam")
```

### Arama için katlama

"Çığ", "ÇIĞ", "cig" yazan herkes aynı kaydı bulmalıdır. İki tarafı da aynı anahtara indirin: Türkçe kuralla küçült,
sonra Türkçe işaretleri at.

```python calistir
FOLD = str.maketrans({"ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u", "â": "a", "î": "i", "û": "u"})


def fold_tr(text: str) -> str:
    lowered = text.replace("İ", "i").replace("I", "ı").lower()
    return lowered.translate(FOLD)


assert fold_tr("ÇIĞ") == fold_tr("çığ") == fold_tr("cig") == "cig"
assert fold_tr("İstanbul") == fold_tr("ISTANBUL") == "istanbul"
assert fold_tr("Kâğıt") == "kagit"
print("tamam")
```

Katlama yalnız **karşılaştırma anahtarıdır**; ekranda özgün metin gösterilir, veritabanına özgün metin yazılır.

### Veritabanı

- SQLite'ın `LOWER`, `UPPER` ve `LIKE` işlemleri yalnız ASCII harflerde büyük-küçük duyarsızdır; Türkçe harfleri
  hiç dönüştürmez.
- Güvenilir yol: katlanmış anahtarı **uygulamada üretip ayrı bir sütunda saklamak** ve aramayı o sütunda yapmak.

```sql calistir
CREATE TABLE sehir (ad TEXT, ad_arama TEXT);
INSERT INTO sehir VALUES ('Iğdır', 'igdir'), ('İstanbul', 'istanbul'), ('Çorum', 'corum');
SELECT ad FROM sehir WHERE LOWER(ad) = 'ığdır';          -- sonuç yok: LOWER, I harfini ı yapmaz
SELECT ad FROM sehir WHERE ad_arama LIKE 'ig%';          -- katlanmış sütun bulur
```

```cikti
Iğdır
```

### CSS

`text-transform: uppercase` tarayıcıda sayfanın diline bakar. `<html lang="tr">` yazılmışsa "i" doğru büyür;
yazılmamışsa "I" olur. Çözüm kod değil, tek satır HTML'dir.

## Tuzaklar

| Belirti                                                  | Neden                                                    | Çözüm                                                      |
| -------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| Başlıkta "ISTANBUL", "BILGI", "GIRIŞ" görünüyor          | Yerel kuralsız büyütme                                   | Türkçe kurallı dönüşüm; CSS için `lang="tr"`                |
| "ısparta" araması "Isparta"yı bulmuyor                   | İki taraf farklı kuralla küçültülmüş                     | İki tarafı da aynı katlama işlevinden geçirin               |
| Aynı görünen iki "i" eşit çıkmıyor, uzunluk 1 fazla       | `İ` yerel kuralsız küçültülmüş: `i` + U+0307             | Türkçe kuralla küçültün ya da U+0307'yi silin               |
| Giriş yapılamıyor: e-posta "ınfo@…" olarak kaydedilmiş    | E-postaya Türkçe kural uygulanmış                        | Makine dili alanlarında İngilizce kural                     |
| Sunucunun dili Türkçe olunca program bozuluyor            | Kod, işletim sisteminin yerel ayarına bağlı dönüşüm yapıyor | Yerel ayarı koda açıkça yazın; ortama bırakmayın         |
| Liste "z"den sonra "ç", "ş" ile devam ediyor              | Kod noktasına göre sıralama                              | Türkçe harmanlama (`Intl.Collator('tr-TR')`)                |
| `LIKE '%şe%'` büyük "Ş"li kayıtları getirmiyor            | Veritabanı Türkçe harfleri katlamıyor                    | Katlanmış arama sütunu                                      |
| Testler geliştirici makinesinde geçiyor, sunucuda kalıyor | Makinelerin varsayılan dili farklı                       | Testte ve kodda dili açıkça verin                           |

## Denetim listesi

- [ ] Kodda düz `toUpperCase()`, `toLowerCase()`, `.upper()`, `.lower()` çağrısı kalmadı; kalanların yanında neden
      İngilizce kural gerektiği yazıyor.
- [ ] Dönüşümler tek bir yardımcı dosyada toplanmış; başka yerde yeniden yazılmamış.
- [ ] E-posta, kullanıcı adı, URL, anahtar sözcük gibi makine dili alanları İngilizce kuralla işleniyor.
- [ ] Arama ve karşılaştırma iki tarafı da aynı katlama işlevinden geçiriyor.
- [ ] Sıralama Türkçe harmanlama kullanıyor.
- [ ] `<html lang="tr">` var.
- [ ] Testlerde şu sözcükler geçiyor: "istanbul", "ISPARTA", "İstanbul", "ılık", "ÇIĞ".
- [ ] Mümkünse bir lint kuralı düz çağrıları yasaklıyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Büyük/küçük harf dönüşümünde yerleşik `upper/lower` kullanma; projedeki `upperTr / lowerTr /
  foldTr` yardımcılarını kullan. E-posta ve URL bunun dışında: onlarda düz ASCII dönüşümü."
- **Modelin tipik hatası:** Yardımcı var olduğu hâlde alışkanlıkla `.toLowerCase()` yazar; ya da tersine, her şeye
  Türkçe kural uygulayıp e-postayı bozar. İki yönü de denetleyin.
- **Çıktıda denetleyin:** değişiklikte `toUpperCase(`, `toLowerCase(`, `.upper(`, `.lower(` arayın. Her eşleşme ya
  yardımcıya çevrilmeli ya da yanında gerekçesi olmalı.
- **Test isteyin:** "istanbul → İSTANBUL" ve "ISPARTA → ısparta" örneklerini içeren bir test yazdırın; model bu
  testle kendi hatasını görür.
- Lint kuralı varsa işi ona bırakın: kural, modelin unuttuğunu yakalar (örnek: `../../uygulama/eslint.config.js`).

## İlgili

- Çalışan gerçekleme (TypeScript): `../../uygulama/shared/src/text.ts`
- İki dilde, ortak sınama vektörleriyle tam kütüphane: `../../kutuphane/`
