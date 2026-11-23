---
baslik: Türkçe ses ve konuşma: metni seslendirmeye hazırlama, telaffuz ve tanıma hatası ölçümü
ozet: Türkçe metni sesli okumaya hazırlarken sayı, tarih, saat, para, yüzde, telefon ve kısaltmanın okunuşu, kısaltma açılınca ek uyumu, vurgu ve telaffuz sorunları, konuşma tanımada sık hatalar ve WER/CER ölçümü.
etiketler: [turkce, ses, tts, konusma-tanima, normalizasyon, wer]
duzey: orta
guncellik: 2026-11
---

# Türkçe ses ve konuşma: metni seslendirmeye hazırlama, telaffuz ve tanıma hatası ölçümü

> Bu notu ne zaman okumalı: Türkçe bir metin sesli okutulacaksa (TTS), sesli okuma "beş milyar otuz iki milyon…"
> gibi tuhaf çıkıyorsa, kısaltmalar ve eklerle bozuk okunuyorsa; konuşma tanıma (ASR) eklenip doğruluğu ölçülecekse
> ya da iki tanıma motoru karşılaştırılacaksa.

## Temel fikir

- Seslendirme motoru "yazıyı" değil **okunacak metni** bekler. "23.11.2026", "%20", "0532 123 45 67", "Dr.",
  "TL'ye" gibi yazımları kendi bildiği gibi okur: tarihi "yirmi üç nokta on bir…", telefonu tek bir dev sayı gibi.
  Çözüm metni motora vermeden önce **seslendirilebilir** biçime çevirmektir (normalizasyon). Kuralların sırası
  önemlidir: önce en özel kalıp (telefon, tarih, saat), en son genel sayı.
- Türkçeye özgü iki ek sorun vardır: (1) sayıya ve kısaltmaya kesmeyle gelen ek **okunuşa göre** yazılmıştır;
  kısaltma açılınca ek yeni sözcüğe uyarlanmalıdır ("TL'ye" → "liraya"); (2) aynı yazılıp farklı vurgulanan
  sözcükler vardır (yer adları), motor bağlamı bilmez.
- Konuşma tanımada Türkçe sondan eklemeli olduğu için tek bir ek hatası bütün sözcüğü yanlış sayar. Sözcük hata
  oranının (WER) yanında karakter hata oranını (CER) da verin ve iki metni ölçmeden önce **aynı** normalleştirmeden
  geçirin.

## Karar tablosu: okunuş kararları

| Yazılış                  | Okunuş                                                        | Not                                                         |
| ------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------- |
| `23.11.2026`             | yirmi üç Kasım iki bin yirmi altı                             | Ay adıyla; "on bir" değil                                   |
| `14:30`, `saat 14.30`    | on dört otuz                                                  | "14.30" saat mi ondalık mı? İki nokta ya da önündeki "saat" |
| `09:05`                  | dokuz sıfır beş                                               | Gündelik dil "dokuzu beş geçe" der; birini seçip tutarlı olun |
| `0532 123 45 67`         | sıfır beş yüz otuz iki, yüz yirmi üç, kırk beş, altmış yedi   | Gruplar yazıldığı gibi; virgül kısa durak verir; asla tek sayı |
| `₺1.234,50`              | bin iki yüz otuz dört lira elli kuruş                         | "bir bin" denmez                                            |
| `%20'si`                 | yüzde yirmisi                                                 | İşaret önde yazılır, önde okunur                            |
| `3. kat`                 | üçüncü kat                                                    | Noktalı sayı + küçük harfle devam → sıra sayısı             |
| `3'te`, `2026'da`        | üçte, iki bin yirmi altıda                                    | Ek okunuşa göre yazılmış; sayı sözcüğüne eklenir            |
| `Dr.`, `vb.`, `Sn.`      | doktor, ve benzeri, sayın                                     | "sn." hem "sayın" hem "saniye": sayıdan sonra saniye        |
| `TL'ye`                  | liraya                                                        | Kısaltma açılınca ek uyarlanır                              |
| `TBMM`, `ABD`            | te be me me, a be de                                          | Ünlüsüz ya da hecelenemeyen öbek: harf harf                 |
| `NATO`, `TÜBİTAK`        | nato, tübitak                                                 | Hecelenebilen kısaltma sözcük gibi                          |
| `XIV. yüzyıl`            | on dördüncü yüzyıl                                            | Romen rakamı yalnız bilinen bağlamda ("XI" bir ad olabilir) |
| `0123`, 10+ basamak      | sıfır bir iki üç; rakam rakam                                 | Sipariş no, kimlik: sayı gibi okunmaz                       |

Bu kararlar havuzdaki seslendirme normalleştiricisiyle aynıdır:
[`normallestirici.py`](../../ses/ses/tts/normallestir/normallestirici.py) ve kalıp kuralları
(`sayi_kurallari.py`) aynı klasörde. Sayıyı yazıya çevirme kuralları (sıfırlar, "bir bin" yasağı, büyük basamaklar)
[Türkçe sayı ve para](turkce-sayi-ve-para.md) notundadır.

## Nasıl yapılır: normalizasyon

Aşağıdaki küçük gerçekleme ilkeyi gösterir: her kural rakamlı bir kalıbı **sözcüğe** çevirir, sonraki kurallar
sözcüğe dokunmaz; sıra özelden genele gider.

```python calistir
import re

BIRLER = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"]
ONLAR = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"]
AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]
SIRA_EKI = {"a": "ıncı", "ı": "ıncı", "e": "inci", "i": "inci", "o": "uncu", "u": "uncu", "ö": "üncü", "ü": "üncü"}


def sayi(n: int) -> str:
    """Sayıyı yazıya çevirir (n < 10^12). "bir yüz", "bir bin" denmez; "bir milyon" denir."""
    if n == 0:
        return "sıfır"
    sozler: list[str] = []
    for deger, ad in ((10**9, "milyar"), (10**6, "milyon"), (1000, "bin"), (1, "")):
        grup, n = divmod(n, deger)
        if grup and not (ad == "bin" and grup == 1):
            yuz, kalan = divmod(grup, 100)
            sozler += [BIRLER[yuz] if yuz > 1 else "", "yüz" if yuz else "", ONLAR[kalan // 10], BIRLER[kalan % 10]]
        if grup:
            sozler.append(ad)
    return " ".join(s for s in sozler if s)


def sira(n: int) -> str:  # 3 → "üçüncü", 4 → "dördüncü" (t → d yumuşar)
    soz = sayi(n)
    ek = SIRA_EKI[[c for c in soz if c in SIRA_EKI][-1]]
    soz = soz[:-4] + "dörd" if soz.endswith("dört") else soz
    return soz + (ek[1:] if soz[-1] in SIRA_EKI else ek)


def grup(rakam: str) -> str:  # telefon grubu: "05" → "sıfır beş", "123" → "yüz yirmi üç"
    return " ".join(sayi(int(r)) for r in rakam) if rakam.startswith("0") else sayi(int(rakam))


def ek(m: re.Match) -> str:  # sayıya kesmeyle gelen ek okunuşa göre yazılmıştır: "3'te" → "üç" + "te"
    return m["ek"] or ""


EK = r"(?:'(?P<ek>\w+))?"
KURALLAR = [  # SIRA ÖNEMLİ: önce en özel kalıp, en son genel sayı
    (r"(?P<ulke>\+90 ?)?(?<!\d)(?P<sifir>0)?(5\d\d)[ -]?(\d{3})[ -]?(\d\d)[ -]?(\d\d)(?!\d)",
     lambda m: ("artı doksan, " if m["ulke"] else "") + ("sıfır " if m["sifir"] else "") + ", ".join(grup(g) for g in m.groups()[2:])),
    (rf"\b(\d{{1,2}})\.(\d{{1,2}})\.(\d{{4}})\b{EK}", lambda m: f"{sayi(int(m[1]))} {AYLAR[int(m[2]) - 1]} {sayi(int(m[3]))}{ek(m)}"),
    (r"(?:₺ ?)?\b(\d{1,3}(?:\.\d{3})*|\d+),(\d\d)\b(?: ?TL)?", lambda m: f"{sayi(int(m[1].replace('.', '')))} lira {sayi(int(m[2]))} kuruş"),
    (r"\b(\d{1,3}(?:\.\d{3})*|\d+) ?TL\b(?!')", lambda m: f"{sayi(int(m[1].replace('.', '')))} lira"),
    (rf"%(\d+)(?:,(\d+))?{EK}", lambda m: "yüzde " + sayi(int(m[1])) + (f" virgül {grup(m[2])}" if m[2] else "") + ek(m)),
    (rf"\b(\d{{1,2}})[:.](\d\d)\b(?!\.\d){EK}", lambda m: sayi(int(m[1])) + ("" if m[2] == "00" else " " + grup(m[2])) + ek(m)),
    (r"\b(\d+)\.(?= [a-zçğıöşü])", lambda m: sira(int(m[1]))),  # "3. kat" → "üçüncü kat"
    (rf"\b(\d{{1,3}}(?:\.\d{{3}})+|\d+)\b{EK}", lambda m: sayi(int(m[1].replace(".", ""))) + ek(m)),
]


def seslendirilebilir(metin: str) -> str:
    for desen, cevir in KURALLAR:
        metin = re.sub(desen, cevir, metin)
    return metin


ornekler = {
    "0532 123 45 67": "sıfır beş yüz otuz iki, yüz yirmi üç, kırk beş, altmış yedi",
    "+90 532 123 45 67": "artı doksan, beş yüz otuz iki, yüz yirmi üç, kırk beş, altmış yedi",
    "23.11.2026'da": "yirmi üç Kasım iki bin yirmi altıda",
    "Saat 14:30'da": "Saat on dört otuzda",
    "09:05": "dokuz sıfır beş",
    "%20'si peşin": "yüzde yirmisi peşin",
    "%7,5": "yüzde yedi virgül beş",
    "₺1.234,50": "bin iki yüz otuz dört lira elli kuruş",
    "1.250 TL": "bin iki yüz elli lira",
    "3. kat, 4. daire": "üçüncü kat, dördüncü daire",
    "2026'da 1.500 kişi": "iki bin yirmi altıda bin beş yüz kişi",
    "1000 ve 1001": "bin ve bin bir",
}
for girdi, beklenen in ornekler.items():
    assert seslendirilebilir(girdi) == beklenen, (girdi, seslendirilebilir(girdi))
assert sayi(1_000_000) == "bir milyon" and sayi(100) == "yüz" and sira(6) == "altıncı" and sira(2) == "ikinci"
print("tamam")
```

Gerçek bir normalleştiricide bunlara ek olarak ölçü birimleri ("90 km/sa" → "saatte doksan kilometre"), kesir
("3/4" → "dörtte üç"), aralık ("5-10" → "beş on"), IBAN ve uzun sayıların rakam rakam okunması gerekir; havuzdaki
gerçekleme bunları kapsar ve her kuralı bir sınama tablosuyla korur. Yeni bir kalıp eklerken önce sınama tablosuna
örnek yazın, sonra kuralı **doğru sıraya** koyun: genel sayı kuralının önüne eklenmeyen tarih kuralı hiç çalışmaz.

## Kısaltma açılınca ek uyumu

Kısaltmaya gelen ek, kısaltmanın **okunuşuna** göre yazılır: "TL" "te le" diye okunduğu için "TL'ye" yazılır. Motor
için "lira"ya açtığınızda ek uymazsa "lira'ye" okunur. Ek yeni sözcüğün son ünlüsüne ve son harfine göre
yeniden kurulmalıdır:

```python calistir
import re

ARKA, ON = "aıou", "eiöü"
SERT = "çfhkpsşt"  # "fıstıkçı şahap": bu harflerle biten sözcüğe d değil t gelir (kitapta, evde)
DORTLU = {"a": "ı", "ı": "ı", "o": "u", "u": "u", "e": "i", "i": "i", "ö": "ü", "ü": "ü"}


def uyumla(sozcuk: str, ek: str) -> str:
    """Kısaltma açılınca ek yeni sözcüğe uymalı. Yalnız sık durumlar; tam kurallar: Ekler ve ünlü uyumu notu."""
    unlu = next(c for c in reversed(sozcuk) if c in ARKA + ON)
    cikti = []
    for i, harf in enumerate(ek):
        if harf in "ae":
            harf = "a" if unlu in ARKA else "e"
        elif harf in "ıiuü":
            harf = DORTLU[unlu]
        elif i == 0 and harf in "dt":
            harf = "t" if sozcuk[-1] in SERT else "d"
        elif i == 0 and harf in "yn" and sozcuk[-1] not in ARKA + ON:
            continue  # kaynaştırma harfi yalnız ünlüden sonra gelir
        if harf in ARKA + ON:
            unlu = harf
        cikti.append(harf)
    return sozcuk + "".join(cikti)


KISALTMALAR = {"TL": "lira", "km": "kilometre", "kg": "kilogram", "mg": "miligram", "Dr.": "doktor", "vb.": "ve benzeri"}


def kisaltma_ac(metin: str) -> str:
    for kisa, uzun in KISALTMALAR.items():
        desen = rf"(?<!\w){re.escape(kisa)}"
        metin = re.sub(desen + r"'(\w+)", lambda m: uyumla(uzun, m[1]), metin)
        metin = re.sub(desen + r"(?!\w)", uzun, metin)
    return metin


# Ek kısaltmanın OKUNUŞUNA göre yazılmıştır: "TL" "te le" diye okunduğu için "TL'ye" yazılır.
# Açılınca ek yeni sözcüğe uymazsa motor "lira'ye" okur.
assert kisaltma_ac("5 TL'ye aldım") == "5 liraya aldım"
assert kisaltma_ac("TL'den, TL'yi") == "liradan, lirayı"
assert kisaltma_ac("3 km'de mola") == "3 kilometrede mola"
assert kisaltma_ac("500 mg'lık tablet") == "500 miligramlık tablet"
assert kisaltma_ac("Dr. Ayşe, vb. işler") == "doktor Ayşe, ve benzeri işler"
assert kisaltma_ac("ATM'de") == "ATM'de"  # sözlükte yok: dokunulmaz (harf harf okunacaklar ayrı kural)
print("tamam")
```

Sıra: önce kısaltmalar (ekleriyle), sonra sayı kalıpları. Böylece "5 TL'ye" → "5 liraya" → "beş liraya" olur.
Bir incelik daha: kısaltma iyelik ekli bir bileşiğe açılırsa ("TL" → "Türk lirası") ek araya "n" ister: "Türk
lirasına". Havuzdaki sözlük bu bilgiyi her kısaltmanın yanında tutar
([`kisaltma.py`](../../ses/ses/tts/normallestir/kisaltma.py), [`ek.py`](../../ses/ses/tts/normallestir/ek.py)).
Ünlü uyumu ve ünsüz benzeşmesinin bütün kuralları: [Ekler ve ünlü uyumu](ekler-ve-unlu-uyumu.md).

## Harf harf okuma ve telaffuz sözlüğü

Harf harf okunan kısaltmalarda harf adları kullanılır: a, be, ce, çe, de, e, fe, ge, yumuşak ge, he, ı, i, je, ke,
le, me, ne, o, ö, pe, re, se, şe, te, u, ü, ve, ye, ze. Gündelik kullanım bazı kısaltmalarda bu adlardan ayrılır
("KDV" çoğunlukla "ka de ve" diye okunur); her kısaltma için yazım kılavuzunun önerisini ayrıca denetleyin (emin
değilim). Pratik yol, ürünün **telaffuz sözlüğünü** tutmaktır:

| Yazılış          | Okunuş            | Neden sözlükte                                        |
| ---------------- | ----------------- | ----------------------------------------------------- |
| `KDV`            | ka de ve          | Yaygın okunuş harf adından ayrılıyor                  |
| `WhatsApp`       | vatsap            | Yabancı marka Türkçe okunursa tanınmaz                |
| `ODTÜ`           | odtü              | Hecelenebilir; harf harf okunmamalı                   |
| Kişi adları      | aile kaydı        | Sentez sesi özel adları bozar; kişisel kayıt önce gelir |

Sözlük kodda değil içerik dosyasında durur; her yeni kayıt bir kez seslendirilip dinlenir. Motorların bir kısmı
fonetik yazım kabul eder; desteklemeyen motorda okunuşu Türkçe yazımla verirsiniz ("vatsap").

## Vurgu ve telaffuz sorunları

| Sorun                                   | Örnek                                                          | Çare                                                          |
| --------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| Yer adının vurgusu                      | "Bebek" (semt, vurgu ilk hecede) ↔ "bebek"; "Ordu" (il) ↔ "ordu" | Motor bağlamı bilmez: kayıt ya da telaffuz sözlüğü           |
| Şapkalı harf                            | "kâr" ↔ "kar", "hâlâ" ↔ "hala", "âdet" ↔ "adet"                | Metinde şapkayı koruyun; motor yok sayıyorsa kayıt           |
| Aynı yazılan farklı sözcük              | "yüz" (sayı, surat, yüzmek), "ocak", "gül", "dolu"              | Okunuş aynı, anlam farklı: tek sözcüklük kartta resim belirler |
| Yabancı ad, marka                       | "WhatsApp", "Google"                                           | Telaffuz sözlüğü                                              |
| Tek sözcüklük metin soru gibi okunuyor  | "Su" → yükselen ezgi                                           | Sonuna nokta koyun; tek sözcükleri hazır kayıtla verin        |
| Uzun cümlede nefes yok                  | Virgülsüz uzun cümle                                           | Cümleyi bölün; durak için virgül ve nokta                     |
| "ğ" ve ünlü uzunluğu                    | "dağ", "saat", "değil"                                         | Motorunuzda dinleyin; sorunlu sözcükleri sözlüğe alın         |

Motordan motora davranış değişir; bu tablo neyi dinlemeniz gerektiğini söyler, sonucu değil. Hız, ses seçimi ve
tarayıcıdaki okuma: [Ses ve konuşma](../20-web-onyuz/ses-ve-konusma.md).

## Konuşma tanımada sık Türkçe hatalar

| Hata türü                         | Örnek (söylenen → yazılan)                    | Ne yapılır                                                     |
| --------------------------------- | --------------------------------------------- | -------------------------------------------------------------- |
| Bağlaç "de/da" ile ek "-de/-da"   | "ben de geldim" → "bende geldim"              | Ölçümde CER de verin; düzeltme kuralı yazmak risklidir          |
| Ek hatası                         | "gidecek" → "gidecekmiş"                      | WER bütün sözcüğü yanlış sayar; CER ile birlikte raporlayın    |
| Sayının biçimi                    | "üç yüz" → "300"                              | Ölçmeden önce iki tarafı aynı biçime getirin                   |
| Kesme ve büyük harf               | "İstanbul'a" → "istanbula"                    | Normalleştirme (aşağıda)                                       |
| Özel ad                           | "Gökçe" → "göçe"                              | Destekleyen motorda sözcük listesi; kapalı sözlükle eşleme     |
| Kısa tek sözcük                   | "su" → "şu"                                   | Alternatifleri alıp uygulamanın sözcük listesiyle eşleyin      |
| Dolgu sözcükleri                  | "ıı", "şey", "yani"                           | Ölçüm kuralında açıkça karar verin (sayılır mı, silinir mi)    |
| Alışılmadık konuşma               | afazi, dizartri, yaşlı ses, yöre ağzı          | Tanıma sonucunu karar verici yapmayın; insan onayı             |

Tanıma motoru dil modeliyle "en olası" cümleyi yazar: yanlış söyleneni doğru yazabilir. Telaffuz alıştırmasında
"doğru söyledi" kararı tanıma çıktısına bırakılmaz.

## WER ve CER ölçümü

WER = (değiştirme + silme + ekleme) / doğru metindeki sözcük sayısı; CER aynı hesabın karakterlerle yapılanıdır.
Ölçmeden önce iki metin aynı normalleştirmeden geçer: Türkçe küçük harf, kesme işareti silinip ek birleştirilir,
noktalama atılır, isteğe bağlı olarak sayılar yazıya çevrilir.

```python calistir
KUCUK = str.maketrans({"I": "ı", "İ": "i"})


def norm(metin: str) -> list[str]:
    """Ölçüm için: Türkçe küçük harf, kesme işareti silinir (ek birleşir), noktalama boşluk olur."""
    metin = metin.translate(KUCUK).lower().replace("'", "").replace("’", "")
    return "".join(ch if ch.isalnum() or ch.isspace() else " " for ch in metin).split()


def duzenleme(dogru: list, tahmin: list) -> int:  # Levenshtein: değiştirme + silme + ekleme
    onceki = list(range(len(tahmin) + 1))
    for i, d in enumerate(dogru, 1):
        simdiki = [i]
        for j, t in enumerate(tahmin, 1):
            simdiki.append(min(onceki[j] + 1, simdiki[j - 1] + 1, onceki[j - 1] + (d != t)))
        onceki = simdiki
    return onceki[-1]


def wer(dogru: str, tahmin: str, normallestir: bool = True) -> float:
    d, t = (norm(dogru), norm(tahmin)) if normallestir else (dogru.split(), tahmin.split())
    return duzenleme(d, t) / len(d)


def cer(dogru: str, tahmin: str) -> float:
    d, t = " ".join(norm(dogru)), " ".join(norm(tahmin))
    return duzenleme(list(d), list(t)) / len(d)


dogru = "Annem yarın İstanbul'a gidecek."
assert wer(dogru, "annem yarın istanbula gidecek", normallestir=False) == 0.75  # yazım farkı "hata" sayıldı
assert wer(dogru, "annem yarın istanbula gidecek") == 0.0
# Tek ek hatası bütün sözcüğü yanlış sayar; karakter hata oranı küçük kalır: Türkçede ikisini birlikte verin
assert wer(dogru, "annem yarın istanbula gidecekmiş") == 0.25
assert round(cer(dogru, "annem yarın istanbula gidecekmiş"), 2) == 0.1
# Bağlaç "de" ile ek "-de": tanıma motorlarının en sık Türkçe hatalarından
assert round(wer("ben de geldim", "bende geldim"), 2) == 0.67
# WER %100'ü aşabilir (ekleme)
assert wer("evet", "evet evet tamam") == 2.0
# Derlem WER'i: toplam hata / toplam sözcük; örnek ortalaması kısa cümleleri şişirir
ornekler = [("su", "şu"), ("annem yarın İstanbul'a gidecek", "annem yarın istanbula gidecek")]
ortalama = sum(wer(d, t) for d, t in ornekler) / len(ornekler)
toplam = sum(duzenleme(norm(d), norm(t)) for d, t in ornekler) / sum(len(norm(d)) for d, _ in ornekler)
assert ortalama == 0.5 and toplam == 0.2
print("tamam")
```

Ölçüm kuralları:

- Normalleştirme olmadan ölçülen WER motoru değil yazım kurallarını ölçer (yukarıda aynı cümle %75 ile %0 arasında).
- İki motoru **aynı** ses kaydı kümesinde, **aynı** normalleştirmeyle karşılaştırın; normalleştirme kodu iki taraf
  için tek olsun. Havuzdaki ölçüm araçları: [`hata_orani.py`](../../ses/ses/olcum/hata_orani.py) (derlem WER/CER,
  sayıları yazıya çevirme seçeneği) ve [`normallestir.py`](../../ses/ses/olcum/normallestir.py).
- Sınama kümesi hedef kullanıcıdan gelsin: haber spikeri sesinde iyi olan motor yaşlı ya da afazili konuşmada çok
  kötü olabilir. Kişi sesi kişisel veridir; kayıt için açık onay alın ([KVKK pratiği](../50-guvenlik/kvkk-pratik.md)).
- Küçük kümede tek sayı yanıltır; konuşmacı başına ayrı rapor verin ve ham hataları elle okuyun
  ([Dil modeli işini değerlendirme](../85-llm/degerlendirme.md)).

## Tuzaklar

| Belirti                                                     | Neden                                                      | Çözüm                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------- |
| Telefon numarası "beş milyar…" diye okunuyor                | Genel sayı kuralı telefondan önce çalıştı                  | Kural sırası: özelden genele                                |
| Tarih "yirmi üç nokta on bir…" okunuyor                     | Normalleştirme yok; metin motora ham verildi               | Seslendirmeden önce normalleştirici                         |
| "lira'ye", "kilometre'de" okunuyor                          | Kısaltma açıldı, ek uyarlanmadı                            | Ek uyumu; kısaltmayı ekiyle birlikte açın                   |
| "Sn. Ayşe" "saniye Ayşe" okunuyor                           | "sn." iki anlamlı                                          | Sayıdan sonra saniye, öbür durumda sayın                    |
| "%20" "yirmi yüzde" okunuyor                                | İngilizce sıra uygulandı                                   | Türkçede işaret önde: "yüzde yirmi"                         |
| "14.30" bazen "on dört virgül otuz"                         | Saat ile ondalık karıştı                                   | İki nokta ya da önünde "saat" şartı                         |
| Kişi ve yer adları tuhaf vurguyla okunuyor                  | Motor bağlamı ve özel adı bilmiyor                         | Telaffuz sözlüğü; kişisel kayıt                             |
| Tanıma WER'i çok yüksek, dinleyince doğru görünüyor         | Ölçüm öncesi normalleştirme yok                            | Aynı normalleştirme iki tarafa                              |
| Motor A, motor B'den iyi çıktı; sahada tersi                | Sınama kümesi hedef kullanıcıyı temsil etmiyor             | Hedef kitleden kayıt; konuşmacı başına rapor                |
| Ortalama WER kısa cümlelerde şişiyor                        | Örnek oranlarının ortalaması alındı                        | Toplam hata / toplam sözcük                                 |

## Denetim listesi

- [ ] Seslendirilecek her metin motordan önce normalleştiriciden geçiyor; kurallar özelden genele sıralı.
- [ ] Sınama tablosunda en az şu örnekler var: telefon, tarih, saat, para (kuruşlu), yüzde (ekli), sıra sayısı,
      kesmeli ek, "1000", "1001", "100".
- [ ] Kısaltmalar ekleriyle birlikte açılıyor; "TL'ye", "km'de", "mg'lık" örnekleri testte.
- [ ] Telaffuz sözlüğü içerik dosyasında; her kayıt bir kez dinlendi.
- [ ] Özel adlar ve sık kullanılan cümleler için hazır ya da kişisel kayıt var.
- [ ] Tanıma ölçümünde WER ve CER birlikte, aynı normalleştirmeyle, derlem düzeyinde raporlanıyor.
- [ ] Sınama kaydı hedef kullanıcıdan ve onaylı; konuşmacı başına sonuç ayrı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Metni seslendirmeden önce projedeki normalleştiriciden geçir. Yeni kalıp eklersen önce sınama
  tablosuna örnek yaz, kuralı genel sayı kuralından önce koy. Kısaltmayı ekiyle birlikte aç ve eki yeni sözcüğe
  uyumla. Tanıma ölçümünde iki metni aynı normalleştirmeden geçir; WER ile CER'i derlem düzeyinde ver."
- **Modelin tipik hatası:** sayıyı tek tek rakam ya da tek dev sayı olarak okutur; "bir bin", "bir yüz" yazar;
  "%20"yi "yirmi yüzde" yapar; kısaltmayı açıp eki olduğu gibi bırakır; Python'un `lower()`'ıyla "İstanbul"u
  bozar; WER'i normalleştirmeden ya da örnek ortalamasıyla hesaplar.
- **Çıktıda arayın:** kural listesinde genel `\d+` kuralının yeri; `lower()`/`upper()` çağrıları; "bir bin";
  kısaltma sözlüğünde ek işlemesi; ölçüm kodunda iki taraf için ayrı normalleştirme.
- **Test isteyin:** yukarıdaki iki sınama tablosu gibi girdi → beklenen okunuş tablosu; WER için "aynı cümle yazım
  farkıyla %0" testi.

## İlgili

- [Ses ve konuşma](../20-web-onyuz/ses-ve-konusma.md) — tarayıcıda sesli okuma, ses kaydı, tanıma, hazır ses dosyaları
- [Türkçe sayı ve para](turkce-sayi-ve-para.md) — sayıyı yazıya çevirme kuralları, tutarın yazıyla yazılışı
- [Ekler ve ünlü uyumu](ekler-ve-unlu-uyumu.md) — okunuşa göre ek seçen gerçekleme
- [Türkiye biçimleri](turkiye-bicimleri.md) — telefon numarasının biçimi ve doğrulaması
- [Türkçe metin işleme](turkce-metin-isleme.md) — belirteçleme, katlama, normalleştirme
- [Büyük/küçük harf](buyuk-kucuk-harf.md) — I/ı ve İ/i dönüşümü
- Havuzdaki gerçekleme: [`normallestirici.py`](../../ses/ses/tts/normallestir/normallestirici.py) (seslendirme),
  [`hata_orani.py`](../../ses/ses/olcum/hata_orani.py) (WER/CER),
  [`sayi_yazi.py`](../../kutuphane/py/kutuphane/sayi_yazi.py) (sayıyı yazıya çevirme kütüphanesi)
