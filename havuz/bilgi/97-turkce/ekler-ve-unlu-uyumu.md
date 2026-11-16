---
baslik: Ekler ve ünlü uyumu
ozet: Özel ada, sayıya ve kısaltmaya kesmeyle ek getirme kuralları, yazılımda okunuşa göre ek seçen çalışan küçük gerçekleme, yabancı ad ve kısaltma sorunları ve cümleyi eksiz kurarak kaçınma stratejisi.
etiketler: [turkce, ekler, unlu-uyumu, kesme-isareti, arayuz-metni]
duzey: orta
guncellik: 2026-11
---

# Ekler ve ünlü uyumu

> Bu notu ne zaman okumalı: arayüz metninde bir değişkenin arkasına ek gelecekse (`{ad}'e`, `{şehir}'de`,
> `{n}'te`); ekranda "İzmir'a", "3'de", "%20'i" gibi bir yanlış gördüyseniz; bildirim, e-posta ya da rapor metni
> üretiyorsanız.

## Temel fikir

Özel ada, rakamla yazılmış sayıya ve kısaltmaya gelen ek **kesme imiyle** ayrılır ve **yazılışa değil okunuşa**
göre seçilir: "3'te" (üç), "6'ya" (altı), "TDK'ye" (te-de-ke), "Bordeaux'ya" (bordo). Ekin biçimini üç şey
belirler: okunuşun **son ünlüsü** (ünlü uyumu), **son sesi** (ünlüyse kaynaştırma ünsüzü; f, s, t, k, ç, ş, h, p
ise d yerine t) ve sözcüğün **istisna** olup olmadığı ("Kemal'e", kalın yazılıp ince okunur).

Yazılım okunuşu her zaman bilemez: kullanıcının girdiği ad yabancı olabilir, takma ad olabilir, emoji içerebilir.
Bu yüzden ilk tercih **kaçınmaktır**: cümleyi, değişken ek almayacak biçimde kurun ("Alıcı: Ahmet"). Ek gerçekten
gerekiyorsa okunuşa göre çalışan bir yardımcı kullanın ve okunuşu bilinmeyen değer için yedek kalıp bulundurun.

## Karar tablosu

| Durum                                                          | Seçim                                                  | Neden                                            |
| -------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------ |
| Arayüz metninde kullanıcı adı, şehir, ürün adı gibi değişken   | Eksiz kalıp: "Alıcı: {ad}", "Sepete eklendi: {ürün}"   | Her değerde doğru; çeviriye de uygun             |
| Ek kalıbın sabit sözcüğüne getirilebiliyorsa                   | "{grup} grubuna", "{tarih} tarihine kadar"             | Ek bilinen sözcükte; uyum sorunu yok             |
| Ek kaçınılmaz ve değer kümesi küçük, sabit (il adları, ürün türleri) | Hazır biçimleri veride saklayın                  | Bir kez doğru yazılır, hiç hesaplanmaz           |
| Ek kaçınılmaz ve değer serbest (kişi adı, sayı)                | Okunuşa göre ek getiren yardımcı + okunuş alanı        | Kuralla çoğu doğru; istisnaya kapı açık          |
| Sayı + ek (3'te, %20'si, 2026'da)                              | Yardımcı (sayıların okunuşu kesin bilinir)             | Kural tamdır, istisna yok                        |
| Kısaltma + ek                                                  | Yardımcı + "harf harf mi sözcük gibi mi" listesi       | ABD harf harf, NATO sözcük gibi okunur           |

Köprü bu tablonun üçüncü satırını seçmiştir: çekim üretmez, kelime kartlarının hazır biçimlerini (`forms`) kalıpla
birleştirir, hazır biçim yoksa kalıbın yedek metnini kullanır.

## Kurallar

| Kural                                      | Ne zaman                                                              | Örnek                                               |
| ------------------------------------------ | --------------------------------------------------------------------- | --------------------------------------------------- |
| Büyük ünlü uyumu (kalın/ince)              | Son ünlü a, ı, o, u → -a, -da, -dan; e, i, ö, ü → -e, -de, -den        | Ankara'da, İzmir'de                                 |
| Küçük ünlü uyumu (dar ek: ı/i/u/ü)         | Son ünlü a, ı → ı; e, i → i; o, u → u; ö, ü → ü                       | Ankara'nın, İzmir'in, Bolu'nun, Gül'ün              |
| Kaynaştırma ünsüzü                         | Ünlüyle bitene: yönelme ve belirtme y, tamlayan n, iyelik s           | Ankara'ya, Ankara'yı, Ankara'nın, %20'si            |
| Ünsüz benzeşmesi (sertleşme)               | Son ses f, s, t, k, ç, ş, h, p ("fıstıkçı şahap") → d yerine t        | Zonguldak'ta, Paris'ten, 3'te, 5'te                 |
| Özel adda yumuşama yazılmaz                | k, p, t, ç ile biten özel ada ünlüyle başlayan ek                      | Zonguldak'a (Zonguldağ'a değil), Ahmet'e            |
| Sayıya okunuşun son sözcüğüne göre         | Okunuşun **son** sözcüğü: 2026 → altı, 1990 → doksan, 1000 → bin       | 2026'da, 1990'larda, 1000'e, 40'ı                   |
| Kısaltmaya okunuşa göre                    | Harf harf okunan: son harfin adı (ke, de, ye); sözcük gibi: sözcük    | TDK'ye, ABD'nin, NATO'ya, ODTÜ'ye                   |
| Okunmayan son harf                         | Yabancı adda okunuşa göre                                             | Bordeaux'ya (bordo), Shakespeare'e (şekspir)        |
| İnce okunan istisnalar                     | Kalın yazılıp ince okunan bazı sözcük ve adlar                        | saate, role, Kemal'e, Celal'in                      |
| Cins ada kesme yok                         | Yalnız özel ad, sayı ve kısaltmada kesme                              | evde, kitaba (ev'de değil)                          |

Ezberden yazdığım, yayımlamadan önce Türk Dil Kurumu kılavuzundan doğrulanması gereken iki kural: özel ada gelen
**çokluk eki** kesmesiz yazılır ("Ahmetler", "Ahmetlere"); kurum ve kuruluş adlarına gelen eklerin kesmeyle
ayrılıp ayrılmayacağı ("… Üniversitesi'ne" mi "… Üniversitesine" mi) konusunda emin değilim. Bunları içeren
metinlerde eksiz kalıp kullanmak sorunu ortadan kaldırır.

## Yazılımda ele alma: küçük gerçekleme

Aşağıdaki işlev okunuşun son ünlüsüne ve son sesine bakar; sayıların okunuşunu kendisi hesaplar, ünlüsüz
kısaltmaları harf harf okur. Okunuşu yazılıştan çıkmayan değer için `pronunciation`, ince okunan istisna için
`front=True` verilir. (Havuzdaki kütüphanenin `ek` modülüyle 1100'den fazla girdide aynı sonucu verdiği ayrıca
denetlendi; kütüphane "Kemal" ve "ABD" gibi istisnaları da kendisi tanır.)

```python calistir
VOWELS, BACK, ROUNDED, HARD = "aeıioöuüâîû", "aıouâû", "oöuüû", "çfhkpsşt"  # HARD: "fıstıkçı şahap"
ONES = ["sıfır", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"]
TENS = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"]
LETTERS = dict(zip("abcçdefgğhıijklmnoöprsştuüvyz", "a be ce çe de e fe ge yumuşakge he ı i je ke le me ne o ö pe re se şe te u ü ve ye ze".split()))
SUFFIXES = {  # {Y}{N}{S}: ünlüden sonra kaynaştırma ünsüzü · {D}: d/t · {A}: a/e · {I}: ı/i/u/ü
    "dative": "{Y}{A}", "locative": "{D}{A}", "ablative": "{D}{A}n", "accusative": "{Y}{I}",
    "genitive": "{N}{I}n", "instrumental": "{Y}l{A}", "possessive": "{S}{I}",
}


def lower_tr(text: str) -> str:
    return text.replace("İ", "i").replace("I", "ı").lower()


def number_reading(digits: str) -> str:
    """Sayının okunuşunun SON sözcüğü: 2026 → altı, 40 → kırk, 1000 → bin."""
    n = int(digits)
    if n == 0:
        return "sıfır"
    if n % 10:
        return ONES[n % 10]
    if n % 100:
        return TENS[n // 10 % 10]
    if n % 1000:
        return "yüz"
    for scale in ["bin", "milyon", "milyar", "trilyon"]:
        n //= 1000
        if n % 1000:
            return scale
    raise ValueError("sayı çok büyük")


def reading(text: str) -> str:
    word = text.split()[-1].lstrip("%")
    if word.isdigit():
        return number_reading(word)
    lower = lower_tr(word)
    if word.isupper() and not any(ch in VOWELS for ch in lower):  # ünlüsüz kısaltma: harf harf (TDK → te-de-ke)
        return "".join(LETTERS[ch] for ch in lower)
    return lower


def add_suffix(text: str, kind: str, pronunciation: str | None = None, front: bool = False) -> str:
    text = text.strip()
    sound = pronunciation or reading(text)
    vowel = next(ch for ch in reversed(sound) if ch in VOWELS)
    back = vowel in BACK and not front
    after_vowel, hard = sound[-1] in VOWELS, sound[-1] in HARD
    four = ("u" if vowel in ROUNDED else "ı") if back else ("ü" if vowel in ROUNDED else "i")
    parts = {"{A}": "a" if back else "e", "{I}": four, "{D}": "t" if hard else "d"}
    parts |= {"{Y}": "y" * after_vowel, "{N}": "n" * after_vowel, "{S}": "s" * after_vowel}
    suffix = SUFFIXES[kind]
    for key, value in parts.items():
        suffix = suffix.replace(key, value)
    return f"{text}'{suffix}"


cases = {
    ("Ankara", "dative"): "Ankara'ya", ("İzmir", "dative"): "İzmir'e", ("3", "locative"): "3'te",
    ("5", "dative"): "5'e", ("6", "dative"): "6'ya", ("Zonguldak", "locative"): "Zonguldak'ta",
    ("Zonguldak", "dative"): "Zonguldak'a", ("İstanbul", "genitive"): "İstanbul'un", ("Ayşe", "genitive"): "Ayşe'nin",
    ("2026", "locative"): "2026'da", ("40", "locative"): "40'ta", ("1000", "dative"): "1000'e",
    ("%20", "possessive"): "%20'si", ("%40", "possessive"): "%40'ı", ("TDK", "dative"): "TDK'ye",
    ("NATO", "dative"): "NATO'ya", ("Iğdır", "genitive"): "Iğdır'ın", ("Ali", "instrumental"): "Ali'yle",
}
for (text, kind), expected in cases.items():
    assert add_suffix(text, kind) == expected, (text, kind, add_suffix(text, kind))

assert add_suffix("Kemal", "dative") == "Kemal'a"  # YANLIŞ: ince okunan istisna
assert add_suffix("Kemal", "dative", front=True) == "Kemal'e"
assert add_suffix("ABD", "dative") == "ABD'a"  # YANLIŞ: ünlülü kısaltma sözcük sanıldı
assert add_suffix("ABD", "dative", pronunciation="abede") == "ABD'ye"
assert add_suffix("Bordeaux", "dative", pronunciation="bordo") == "Bordeaux'ya"
print("tamam")
```

```cikti
tamam
```

Gerçeklemenin bilerek bıraktığı boşluklar: saat ("09.00'da"), ondalık sayı, Roma rakamı, noktalı kısaltma
("A.Ş.") ve çok sözcüklü kurum adları. Bunlar ve istisna listeleri havuzdaki kütüphanededir:
[ek.py](../../kutuphane/py/kutuphane/ek.py), TypeScript eşi [ek.ts](../../kutuphane/ts/src/ek.ts).

## Kısaltma ve yabancı ad sorunları

- **Harf harf mi, sözcük gibi mi?** ABD, THY, PTT harf harf; NATO, ASELSAN, ODTÜ sözcük gibi okunur. Ünlüsü olmayan
  kısaltma kesin harf harftir; ünlüsü olanlarda yazılımın bir listeye ya da açık okunuşa ihtiyacı vardır.
- **"ka" mı "ke" mi?** TDK harf adlarını "be, ce, de, ke…" diye verir ve "TDK'ye" yazar; günlük konuşmada "TDK'ya"
  da duyulur. Projede birini seçip her yerde onu kullanın.
- **Yabancı adlar** okunuşa göre ek alır ve okunuş yazılıştan çıkmaz: Shakespeare'e, Bordeaux'ya, Michigan'a.
  Kişi ve marka adları için profil ya da içerik kaydında isteğe bağlı bir okunuş alanı tutun; boşsa eksiz kalıba
  düşün.
- **İnce okunan adlar:** Kemal, Celal, Hilal, Bilal gibi bazı adlar kalın ünlüyle yazılıp ince ek alır. Liste
  tamamlanamaz; kişi adlarında eksiz kalıp en güvenli yoldur.
- **Büyük harfli metin:** tümü büyük harfli başlıkta ek de büyük yazılır ("ANKARA'YA"); bu işlemi Türkçe kuralla
  yapın ([Türkçe büyük/küçük harf](buyuk-kucuk-harf.md)). Kısaltmaya gelen ek normal metinde küçüktür: "TDK'ye".

## Kaçınma stratejisi: cümleyi eksiz kurun

| Ekli kalıp (kırılgan)              | Eksiz kalıp (sağlam)                        | Neden sağlam                                  |
| ---------------------------------- | ------------------------------------------- | --------------------------------------------- |
| `{ad}'e mesaj gönderildi`          | `Mesaj gönderildi. Alıcı: {ad}`             | Değişken etiketten sonra, ek yok              |
| `{şehir}'de hava`                  | `Hava durumu: {şehir}`                      | Aynı                                          |
| `{ürün}'ü sepete ekledin`          | `Sepete eklendi: {ürün}`                    | Aynı                                          |
| `{ad}'in listesi`                  | `Liste sahibi: {ad}`                        | Tamlayan eki kalktı                           |
| `{grup}'a eklendiniz`              | `{grup} grubuna eklendiniz`                 | Ek bilinen sözcükte ("grup")                  |
| `{tarih}'e kadar ödeyin`           | `Son ödeme tarihi: {tarih}`                 | Tarihin okunuşu gerekmez                      |
| `{ad}'le paylaşıldı`               | `{ad} ile paylaşıldı`                       | Ayrı yazılan "ile" uyuma girmez               |
| `{şehir} mi?`                      | `Şehir doğru mu: {şehir}`                   | Soru eki "mı/mi/mu/mü" de uyuma girer         |

Ayrı yazılan "ile, için, gibi, kadar, göre" uyuma girmez; bitişik "-le, -de, -e" ve soru eki "mi" girer.

Kural testi: sözlük dosyasında değişkenden hemen sonra gelen eki yakalayın.

```js calistir
import assert from 'node:assert/strict'

const tr = {
  'share.sent': "{name}'e gönderildi", // kırılgan
  'share.sentSafe': 'Gönderildi. Alıcı: {name}',
  'city.weather': '{city}’de hava', // kırılgan (tipografik kesme imiyle de)
  'group.added': '{group} grubuna eklendiniz', // ek sabit sözcükte: sağlam
  'list.shared': '{name} ile paylaşıldı', // ayrı yazılan "ile": sağlam
}

const SUFFIX_AFTER_PLACEHOLDER = /\{[^}]+\}['’]?\p{Ll}/u // {x}'e · {x}’de · {x}de
const offenders = Object.entries(tr)
  .filter(([, text]) => SUFFIX_AFTER_PLACEHOLDER.test(text))
  .map(([key]) => key)
assert.deepEqual(offenders, ['share.sent', 'city.weather'])
console.log('ekli kalıplar:', offenders.join(', '))
```

```cikti
ekli kalıplar: share.sent, city.weather
```

Bu denetimi projenin kural testlerine ekleyin; istisna gereken kalıp için yanına gerekçe yazılsın.

## Tuzaklar

| Belirti                                         | Neden                                                    | Çözüm                                                       |
| ----------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| "İzmir'a", "Kemal'a"                            | Ünlü yazılıştan ya da sabit "a" seçildi; istisna bilinmedi | Okunuşa göre seçim; kişi adında eksiz kalıp               |
| "3'de", "Paris'de", "Zonguldak'da"              | Sertleşme unutuldu                                       | Son ses f, s, t, k, ç, ş, h, p ise t                        |
| "Zonguldağ'a", "Ahmed'e"                        | Yumuşama yazıya geçirildi                                | Özel adda yumuşama yazılmaz                                 |
| "%20'i", "%40'sı"                               | İyelikte kaynaştırma ünsüzü yanlış                       | Okunuşun son sesi: yirmi → si, kırk → ı                     |
| "1990'lerde"                                    | Okunuşun ilk sözcüğüne ("bin") bakıldı                   | Son sözcük: doksan → 1990'larda                             |
| "TDK'ya" ile "TDK'ye" aynı üründe               | Harf adı için iki alışkanlık                             | Projede birini seçin                                        |
| "Ahmet 'e" ya da "'e"                           | Kullanıcı girdisi kırpılmadı ya da boş                   | Ekten önce kırpın; boş değerde eksiz kalıp                  |
| "ANKARA'ya"                                     | Büyük harfli metinde ek küçük kaldı                      | Tümü büyük metinde eki de Türkçe kuralla büyütün            |
| Aramada "Ankara'ya" bulunuyor, "Ankara’ya" yok  | İki farklı kesme imi                                     | Yazarken birini seçin; aramada ikisini eşitleyin ([Türkçe metin işleme](turkce-metin-isleme.md)) |
| Çeviride kalıp bozuldu                          | Ek kaynak dile göre kurulmuştu                           | Eksiz kalıp her dilde çalışır                               |

## Denetim listesi

- [ ] Sözlük dosyasında değişkenden hemen sonra ek yok (kural testi yeşil) ya da her istisnanın gerekçesi yazılı.
- [ ] Ek gereken yerde okunuşa göre çalışan tek bir yardımcı kullanılıyor; elle "'e/'a" yazılmıyor.
- [ ] Okunuşu bilinmeyen değer için yedek eksiz kalıp var.
- [ ] Testlerde şunlar geçiyor: Ankara'ya, İzmir'e, Zonguldak'ta, 3'te, 5'e, 6'ya, 40'ı, 2026'da, %20'si, TDK'ye,
      NATO'ya, Kemal'e.
- [ ] Kesme iminin türü projede tek (`'` ya da `’`).
- [ ] Kullanıcı girdisi ekten önce kırpılıyor; boş ya da yalnız emoji olan değerde ek eklenmiyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Arayüz metninde değişkenin arkasına ek yazma; cümleyi eksiz kur ('Alıcı: {ad}',
  'Sepete eklendi: {ürün}'). Ek zorunluysa projedeki ek yardımcısını kullan; ünlüyü kendin seçme."
- **Modelin tipik hatası:** `${ad}'e` gibi sabit ünlülü ek yazar; her yere "'de" koyar (sertleşmeyi unutur);
  uyumu yazılışa göre kendisi hesaplamaya kalkar; "3 dosyalar" gibi çoğul ekler; kısaltmanın harf harf okunduğunu
  bilmez.
- **Çıktıda denetleyin:** sözlük dosyalarında ve şablon dizgelerinde `}'`, `}’` ve `}` ardından harf; elle yazılmış
  `'e`, `'a`, `'de`, `'da`. Model ek yardımcısı yazdıysa yukarıdaki örnek listesiyle test isteyin.

## İlgili

- [Arayüz dili](arayuz-dili.md): eksiz kalıplarla arayüz metni yazımı.
- [Türkçe büyük/küçük harf](buyuk-kucuk-harf.md): büyük harfli metinde ek.
- [Türkçe metin işleme](turkce-metin-isleme.md): kesme imli sözcükleri aramada eşleştirmek.
- [Türkçe sayı ve para](turkce-sayi-ve-para.md): sayının okunuşu ve yazıyla yazılışı.
- Tam gerçekleme ve sınama vektörleri: [kutuphane/py/kutuphane/ek.py](../../kutuphane/py/kutuphane/ek.py),
  [kutuphane/vektorler/ek.json](../../kutuphane/vektorler/ek.json).
- Diğer kümelerden: [Uluslararasılaştırma](../20-web-onyuz/uluslararasilastirma.md).
