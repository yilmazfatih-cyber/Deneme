---
baslik: Türkçe sayı ve para
ozet: Sayıyı Türkçe yazıya çevirme kuralları ve çalışan gerçekleme, tutarın yazıyla yazılışı, binlik ve ondalık ayırıcı karışıklığı, kuruş yuvarlama, en büyük kalanla bölüştürme ve KDV dahil/hariç hesabı.
etiketler: [turkce, sayi, para, kdv, yuvarlama, bolusturme]
duzey: orta
guncellik: 2026-11
---

# Türkçe sayı ve para

> Bu notu ne zaman okumalı: fatura, makbuz, çek ya da sözleşmede tutarı yazıyla yazacaksanız; kullanıcının
> yazdığı "1.234,56"yı sayıya çevirecekseniz; bir tutarı kişilere ya da satırlara bölüştürecekseniz; KDV dahil ve
> hariç fiyat hesaplayacaksanız. Bu not mali ya da hukuki danışmanlık değildir; genel yöntemi anlatır.

## Temel fikir

- **Para tam sayı kuruştur.** 12,50 TL = `1250`. Hesap hep tam sayıyla (ya da ondalık/kesir türüyle) yapılır;
  `float` yalnız gösterimde ve hiç değilse en sonda kullanılır.
- **Yuvarlama tek yerde, bilinçli yönde** yapılır; her ara adımda yuvarlamak kuruş kaçırır.
- **Bölüştürmede toplam korunur:** paylar ayrı ayrı yuvarlanmaz; en büyük kalan yöntemiyle artan kuruş dağıtılır.
- **Kullanıcı girdisi Türkçe biçimdedir** (binlik nokta, ondalık virgül); makineler arası veri (JSON, API,
  veritabanı) makine biçimindedir. İkisi hiçbir zaman karışmaz ve belirsiz giriş tahmin edilmez, sorulur.
- **Sayının yazıyla yazılışı** kurallıdır ama iki istisnası vardır: "bin" (bir bin değil) ve "yüz" (bir yüz değil).

## Karar tablosu

| Durum                                         | Yapılacak                                                    | Neden                                         |
| --------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------- |
| Tutarı saklamak                               | Tam sayı kuruş (`INTEGER`)                                   | Toplama ve karşılaştırma kesin                |
| Kullanıcının yazdığı tutar                    | Katı Türkçe ayrıştırıcı; belirsizse hata ve örnek göster      | "1.234" bin iki yüz otuz dört mü, 1,234 mü?   |
| API / JSON / CSV dışa aktarım                 | Makine biçimi (nokta ondalık) ya da kuruş tam sayı            | Yerel biçim makineler arasında bozulur        |
| Ekranda gösterim                              | `Intl.NumberFormat('tr-TR')` ([Yerelleştirme denetimi](yerellestirme-denetimi.md)) | Doğru ayırıcı ve simge |
| Tutarı kişilere/satırlara bölmek              | En büyük kalan yöntemi                                       | Paylar toplamı tutara eşit kalır              |
| Yuvarlama yönü                                | Ticari: yarım yukarı; kuralı işletme ve mevzuat belirler     | Python `round` yarımı çifte yuvarlar          |
| KDV hariç → dahil                             | KDV = net × oran (bir kez yuvarla); brüt = net + KDV          |                                               |
| KDV dahil → hariç                             | Net = brüt ÷ (1 + oran) (bir kez yuvarla); KDV = brüt − net   | Toplam her zaman brüte eşit                   |
| Tutarı yazıyla yazmak (fatura, çek)           | Kurallı işlev + kurumun istediği biçim (ayrı/bitişik)         | Belge türüne göre biçim değişir               |

## Sayıyı yazıya çevirme

Kurallar:

1. Sayı üçlü gruplara ayrılır; her grup "yüzler + onlar + birler" olarak okunur, arkasına ölçek gelir: bin,
   milyon, milyar, trilyon, katrilyon, kentilyon.
2. **"bir yüz" denmez:** 100 → "yüz", 105 → "yüz beş"; ama 200 → "iki yüz".
3. **"bir bin" denmez:** 1000 → "bin", 1001 → "bin bir"; ama 21.000 → "yirmi bir bin", 101.000 → "yüz bir bin"
   (grup tam olarak 1 olduğunda düşer). Milyon ve üstünde "bir" kalır: "bir milyon".
4. Sözcükler ayrı yazılır: "bin iki yüz otuz dört". (Çek ve senette araya ekleme yapılamasın diye bitişik yazım
   yaygındır: "binikiyüzotuzdört". Kurumun istediği biçimi izleyin.)
5. Sıra sayısı, son sözcüğe ünlü uyumuyla "-(ı)ncı" ekler: birinci, altıncı, dokuzuncu, yüzüncü; tek yumuşama
   "dört → dördüncü"dür. Rakamla: "3." ya da "3'üncü".
6. Tutar: "yalnız … lira … kuruş". 0,50 TL → "yalnız elli kuruş"; 100 TL → "yalnız yüz lira".

```python calistir
ONES = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"]
TENS = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"]
SCALES = ["", "bin", "milyon", "milyar", "trilyon", "katrilyon", "kentilyon"]
VOWELS = "aeıioöuü"


def group_words(n: int) -> list[str]:  # 0 < n < 1000
    hundreds, rest = divmod(n, 100)
    words: list[str] = []
    if hundreds:
        words += ([] if hundreds == 1 else [ONES[hundreds]]) + ["yüz"]  # "yüz", "bir yüz" değil
    if rest >= 10:
        words.append(TENS[rest // 10])
    if rest % 10:
        words.append(ONES[rest % 10])
    return words


def number_to_words(n: int) -> str:
    if n == 0:
        return "sıfır"
    if n < 0:
        return "eksi " + number_to_words(-n)
    words: list[str] = []
    scale = 0
    while n:
        n, group = divmod(n, 1000)
        if group:
            part = [] if (scale == 1 and group == 1) else group_words(group)  # "bin", "bir bin" değil
            words = part + ([SCALES[scale]] if scale else []) + words
        scale += 1
    return " ".join(words)


def ordinal_words(n: int) -> str:
    words = number_to_words(n)
    last = words.split()[-1]
    vowel = [ch for ch in last if ch in VOWELS][-1]
    narrow = {"a": "ı", "ı": "ı", "e": "i", "i": "i", "o": "u", "u": "u", "ö": "ü", "ü": "ü"}[vowel]
    if last == "dört":
        words = words[:-1] + "d"  # dördüncü: tek yumuşayan sayı
    return words + ("" if last[-1] in VOWELS else narrow) + "nc" + narrow


def amount_to_words(kurus: int) -> str:
    lira, rest = divmod(kurus, 100)
    parts = ([f"{number_to_words(lira)} lira"] if lira or not rest else []) + (
        [f"{number_to_words(rest)} kuruş"] if rest else []
    )
    return "yalnız " + " ".join(parts)


assert number_to_words(100) == "yüz" and number_to_words(1000) == "bin" and number_to_words(1001) == "bin bir"
assert number_to_words(21_000) == "yirmi bir bin" and number_to_words(101_000) == "yüz bir bin"
assert number_to_words(1_000_000) == "bir milyon" and number_to_words(1_001_000) == "bir milyon bin"
assert number_to_words(2026) == "iki bin yirmi altı" and number_to_words(-5) == "eksi beş"
assert [ordinal_words(n) for n in (1, 3, 4, 6, 9, 40, 100)] == [
    "birinci", "üçüncü", "dördüncü", "altıncı", "dokuzuncu", "kırkıncı", "yüzüncü"
]
assert ordinal_words(24) == "yirmi dördüncü"
assert amount_to_words(123450) == "yalnız bin iki yüz otuz dört lira elli kuruş"
assert amount_to_words(50) == "yalnız elli kuruş" and amount_to_words(10000) == "yalnız yüz lira"
print(amount_to_words(123450))
print("bitişik:", number_to_words(1234).replace(" ", ""))
```

```cikti
yalnız bin iki yüz otuz dört lira elli kuruş
bitişik: binikiyüzotuzdört
```

Bu işlev havuzdaki kütüphaneyle 105.000 sayıda (0–100.000 ve rastgele büyük sayılar) karşılaştırıldı, aynı sonucu
veriyor. Tam sürüm (ondalık okunuş, birleşik yazım seçeneği, para birimleri):
[sayi_yazi.py](../../kutuphane/py/kutuphane/sayi_yazi.py), sözcük listesi
[veri/tr/sayi_sozcukleri.csv](../../veri/tr/sayi_sozcukleri.csv).

## Binlik ve ondalık ayırıcı karışıklığı

| Yazım          | Türkçede anlamı             | İngilizcede anlamı  |
| -------------- | --------------------------- | ------------------- |
| `1.234`        | bin iki yüz otuz dört       | bir virgül iki üç dört |
| `1,234`        | bir virgül iki yüz otuz dört | bin iki yüz otuz dört |
| `1.234,56`     | 1234,56                     | geçersiz            |
| `1,234.56`     | geçersiz                    | 1234,56             |

- `parseFloat("1.234,56")` hata vermez, **1,234** döndürür: kullanıcı bin kat az öder. `parseFloat("12,5")` 12'dir.
- Türkçe bölgesel ayarlı tablolama programları CSV'yi çoğu zaman `;` ayırıcı ve `,` ondalıkla yazar; virgülle
  bölen okuyucu sütunları kaydırır. İçe aktarmada ayırıcıyı ve ondalık işaretini açıkça seçtirin.
- Katı ayrıştırıcı belirsiz girişi tahmin etmez, reddeder ve doğru biçimi örnekle gösterir:

```js calistir
import assert from 'node:assert/strict'

assert.equal(parseFloat('1.234,56'), 1.234) // sessizce YANLIŞ: bin kat küçük
assert.equal(parseFloat('12,5'), 12) // virgülden sonrası atıldı
assert.ok(Number.isNaN(Number('1.234,56')))

function parseNumberTr(text) {
  const s = text.trim().replace(/[\s\xa0]/g, '')
  if (!/^-?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/.test(s)) throw new Error(`Sayı anlaşılmadı: "${text}". Örnek: 1.234,56`)
  return Number(s.replaceAll('.', '').replace(',', '.'))
}

assert.equal(parseNumberTr('1.234,56'), 1234.56)
assert.equal(parseNumberTr('12,5'), 12.5)
assert.equal(parseNumberTr(' 1 234,5 '), 1234.5)
assert.throws(() => parseNumberTr('1,234.56')) // İngilizce biçim: tahmin etme
assert.throws(() => parseNumberTr('1.23')) // binlik mi ondalık mı? belirsiz
console.log('tamam')
```

```cikti
tamam
```

Tutar alanında sonucu kuruşa çevirirken `Math.round(x * 100)` yerine metinden doğrudan kuruş üretmek daha
güvenlidir (havuzda: [para.py](../../kutuphane/py/kutuphane/para.py) `parse_money`).

## Kuruş yuvarlama

| Yöntem                                  | 2,675 → | 0,125 → | Not                                              |
| --------------------------------------- | ------- | ------- | ------------------------------------------------ |
| Yarım yukarı (ticari)                   | 2,68    | 0,13    | Fatura uygulamalarında yaygın                    |
| Yarım çifte (bankacı)                   | 2,68    | 0,12    | Python `round` ve `Decimal` varsayılanı          |
| Python `round(2.675, 2)` (float)        | 2,67    | 0,12    | 2,675 ikili kesirde 2,67499… olarak tutulur      |
| JavaScript `(2.675).toFixed(2)`         | 2,67    | —       | Aynı neden; `(1.005).toFixed(2)` → "1.00"        |

```python calistir
from decimal import ROUND_HALF_EVEN, ROUND_HALF_UP, Decimal

assert round(2.675, 2) == 2.67  # float: 2.67499999… olarak saklanır
assert round(0.125, 2) == 0.12 and round(2.5) == 2  # yarım çifte
cent = Decimal("0.01")
assert Decimal("2.675").quantize(cent, ROUND_HALF_UP) == Decimal("2.68")
assert Decimal("0.125").quantize(cent, ROUND_HALF_UP) == Decimal("0.13")
assert Decimal("0.125").quantize(cent, ROUND_HALF_EVEN) == Decimal("0.12")
assert Decimal(2.675) != Decimal("2.675")  # float'tan Decimal: hata zaten içeride; metinden kurun
print("tamam")
```

```cikti
tamam
```

## Bölüştürme ve KDV

**En büyük kalan yöntemi:** her payın tam değerini hesaplayın, tabana yuvarlayın, artan kuruşları kesirli kısmı en
büyük olanlara birer birer verin (eşitlikte listedeki sıra). Paylar toplamı her zaman tutara eşittir.

**KDV:** hariçten dahile giderken KDV'yi hesaplayıp bir kez yuvarlayın; dahilden hariçe giderken neti hesaplayıp bir
kez yuvarlayın ve **KDV'yi farktan** bulun. KDV dahil fiyattan oran kadar düşmek yanlıştır: 100 TL'den %20 düşmek
80 TL verir; doğrusu 100 ÷ 1,2 = 83,33 TL. Örneklerde %20 kullanıldı; güncel oranları resmî kaynaktan alın ve koda
gömmeyin, yapılandırmadan okuyun.

```python calistir
from fractions import Fraction


def half_up(x: Fraction) -> int:
    return int(x + Fraction(1, 2)) if x >= 0 else -int(-x + Fraction(1, 2))


def allocate(total: int, weights: list[int]) -> list[int]:
    """Kuruşu ağırlıklara göre böler; toplam korunur (en büyük kalan, eşitlikte sıra)."""
    exact = [Fraction(total * w, sum(weights)) for w in weights]
    shares = [int(x) for x in exact]
    order = sorted(range(len(weights)), key=lambda i: (-(exact[i] - shares[i]), i))
    for i in order[: total - sum(shares)]:
        shares[i] += 1
    return shares


def add_vat(net: int, rate: int) -> tuple[int, int, int]:
    vat = half_up(Fraction(net * rate, 100))
    return net, vat, net + vat


def remove_vat(gross: int, rate: int) -> tuple[int, int, int]:
    net = half_up(Fraction(gross * 100, 100 + rate))
    return net, gross - net, gross  # KDV farktan: toplam her zaman brüte eşit


assert [round(10000 / 3)] * 3 == [3333, 3333, 3333]  # YANLIŞ: toplam 99,99 TL
assert [round(20000 / 3)] * 3 == [6667, 6667, 6667]  # YANLIŞ: toplam 200,01 TL
assert allocate(10000, [1, 1, 1]) == [3334, 3333, 3333]
assert allocate(20000, [1, 1, 1]) == [6667, 6667, 6666]
assert allocate(1000, [1, 2, 3]) == [167, 333, 500]

assert add_vat(10000, 20) == (10000, 2000, 12000)  # net 100,00 → KDV 20,00 → brüt 120,00
assert remove_vat(10000, 20) == (8333, 1667, 10000)  # brüt 100,00 → net 83,33 + KDV 16,67
assert 10000 - 10000 * 20 // 100 == 8000  # YANLIŞ: dahil fiyattan %20 düşmek

lines = [99, 99, 99]  # üç satır, her biri 0,99 TL (KDV hariç)
by_line = sum(add_vat(net, 20)[1] for net in lines)
by_total = add_vat(sum(lines), 20)[1]
print(f"satır satır KDV: {by_line} kuruş · toplamdan KDV: {by_total} kuruş")
```

```cikti
satır satır KDV: 60 kuruş · toplamdan KDV: 59 kuruş
```

Satır satır mı, toplamdan mı hesaplanacağı işletmenin ve kullandığı e-belge sisteminin kuralıdır; ikisi 1 kuruş
farklı çıkabilir. Hangisi seçildiyse her yerde o kullanılmalı ve testle sabitlenmelidir. Havuzdaki
[para.py](../../kutuphane/py/kutuphane/para.py) aynı sonuçları verir (`allocate`, `add_vat`, `remove_vat`).

## Tuzaklar

| Belirti                                                    | Neden                                                   | Çözüm                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| "bir bin iki yüz", "bir yüz"                               | İstisna atlanmış                                        | 1000 → bin, 100 → yüz; 21.000'de "bir" kalır                 |
| "dörtüncü", "altıinci"                                     | Sıra ekinde yumuşama ve kaynaştırma unutulmuş           | dördüncü; ünlüyle bitene "-ncı"                              |
| Kullanıcı 1.234,56 yazdı, 1,23 TL tahsil edildi            | `parseFloat` Türkçe biçimi yanlış okudu                 | Katı Türkçe ayrıştırıcı; metinden kuruşa                     |
| Toplamlar 1 kuruş tutmuyor                                 | Paylar ya da satırlar ayrı ayrı yuvarlandı              | En büyük kalan; yuvarlama tek yerde                          |
| KDV dahil fiyattan net yanlış                              | Oran kadar düşüldü (100 − 20)                           | Net = brüt ÷ (1 + oran); KDV = brüt − net                    |
| Fatura toplamı muhasebe programıyla 1 kuruş farklı         | Biri satır satır, öteki toplamdan yuvarlıyor            | Kuralı seçip yazın; testle sabitleyin                        |
| `round(2.675, 2)` 2,67 verdi                               | Float ikili kesir + yarım çifte                         | `Decimal("2.675")` ya da tam sayı kuruş                      |
| İçe aktarılan CSV'de sütunlar kaydı                        | Türkçe bölgesel CSV `;` ve `,` ondalık kullanıyor       | Ayırıcıyı ve ondalık işaretini açıkça seçtirin               |
| API'den gelen "1.234,56" metni hesapta bozuldu             | Yerel biçim makineler arası veriye girdi                | API'de sayı ya da kuruş tam sayı; biçim yalnız ekranda       |
| Oran değişince kodun birçok yerinde güncelleme gerekti     | KDV oranı koda gömülü                                   | Oran yapılandırmada ve tarihli                               |

## Denetim listesi

- [ ] Tutarlar tam sayı kuruş saklanıyor; hesapta `float` yok.
- [ ] Kullanıcı girişi katı Türkçe ayrıştırıcıdan geçiyor; "1.234,56", "12,5" kabul, "1,234.56" ve "1.23" ret.
- [ ] Yuvarlama yönü yazılı ve tek yardımcıda; negatif tutarla da test edildi.
- [ ] Bölüştürmede paylar toplamı tutara eşit (özellik testiyle).
- [ ] KDV dahilden hariçe: net bölmeyle, KDV farktan; satır/toplam kuralı seçilmiş ve testli.
- [ ] Tutarın yazıyla yazılışı test ediliyor: 100, 1000, 1001, 21.000, 101.000, 1.000.000, 0,50 TL.
- [ ] Sıra sayıları test ediliyor: birinci, üçüncü, dördüncü, altıncı, yirmi dördüncü.
- [ ] Oranlar ve para biçimi yapılandırmada; koda gömülü değil.

## Küçük modele yaptırırken

- **İsteme yazın:** "Para tam sayı kuruştur; `float` ve `parseFloat` kullanma. Kullanıcı girdisini projedeki Türkçe
  ayrıştırıcıyla oku. Bölüştürmede en büyük kalan yöntemini kullan ve paylar toplamının tutara eşit olduğunu test
  et. KDV dahilden hariçe: net = brüt ÷ (1 + oran), KDV = brüt − net. Yuvarlama yalnız bir yerde."
- **Modelin tipik hatası:** `parseFloat` ve `toFixed` ile para hesaplar; payları ayrı ayrı yuvarlar; KDV dahil
  fiyattan oran kadar düşer; "bir bin", "dörtüncü" üretir; Python'da `round` kullanıp ticari yuvarlama sanır; KDV
  oranını koda gömer.
- **Çıktıda denetleyin:** `parseFloat`, `toFixed`, `float(`, `round(` geçen satırlar; bölüştürme testinde toplam
  denetimi; KDV testinde 100 TL → 83,33 + 16,67 örneği; yazıyla tutar testinde 1000 ve 21.000 örnekleri.

## İlgili

- [Yerelleştirme denetimi](yerellestirme-denetimi.md): sayı ve para gösterimi.
- [Ekler ve ünlü uyumu](ekler-ve-unlu-uyumu.md): sayıya ek getirme (3'te, %20'si).
- [Test stratejisi](../00-yontem/test-stratejisi.md): bölüştürmenin özellik tabanlı testi.
- [Hata sınıfları ve imzaları](../00-yontem/hata-siniflari.md): kayan nokta imzaları.
- Çalışan gerçeklemeler ve TypeScript eşleri: [para.ts](../../kutuphane/ts/src/para.ts),
  [sayi_yazi.ts](../../kutuphane/ts/src/sayi_yazi.ts).
- Diğer kümelerden: [Sayılar ve kayan nokta](../92-matematik/sayilar-ve-kayan-nokta.md), [Finans matematiği](../92-matematik/finans-matematigi.md), [Ödeme tümleştirme](../30-arkauc/odeme-tumlestirme.md).
