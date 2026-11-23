---
baslik: Türkçe adres modeli: il, ilçe, mahalle, sokak ve posta kodu
ozet: Türkiye'de adres hiyerarşisi, posta kodunun ille, ilçeyle ve mahalleyle ilişkisi, adres biçimleri, serbest metin adresi ayrıştırmanın zorluğu, konum bulma kavramı ve adres doğrulamada yapılmaması gerekenler.
etiketler: [turkce, adres, posta-kodu, form, veri-modeli, konum]
duzey: orta
guncellik: 2026-11
---

# Türkçe adres modeli: il, ilçe, mahalle, sokak ve posta kodu

> Bu notu ne zaman okumalı: adres formu, teslimat ya da kargo, fatura adresi, şube bulucu ya da adres içe aktarma
> yaparken; eski kayıtlardaki serbest metin adresleri düzenlemek gerektiğinde; biri "posta kodunu doğrulayalım" ya da
> "adresi otomatik düzeltelim" dediğinde.

## Temel fikir

- Hiyerarşi: **İl → İlçe → Mahalle ya da köy → Cadde/Sokak/Bulvar → Dış kapı (bina) no → İç kapı (daire) no.**
  Site, apartman adı, blok ve kat ek bilgidir. Köy adreslerinde sokak olmayabilir.
- **Adlar benzersiz değildir.** 24 ilçe adı birden çok ilde geçer (Yenişehir üç ilde), "Merkez" 51 ilde ilçe adıdır;
  PTT kaynaklı bir mahalle listesinde "Yeni Mahallesi" 310, "Cumhuriyet Mahallesi" 306 kez geçer. Bir yerin
  kimliği **tam yoludur**: (il, ilçe, mahalle).
- **Posta kodu bir dağıtım bölgesidir, adresin kimliği değildir.** Beş hanedir, ilk ikisi ilin plaka kodudur; bir
  ilçede çoğunlukla birden çok posta kodu vardır ve bir posta kodu çok sayıda mahalleyi kapsar. Posta kodundan il
  çıkarılabilir, mahalle çıkarılamaz.
- Doğru tasarım **yapılandırılmış alanlar + kullanıcının yazdığı ham metindir.** Serbest metni ayrıştırmak son
  çaredir ve ayrıştırıcı "emin değilim" diyebilmelidir.

## Karar tablosu

| İhtiyaç                                        | Seçim                                                                                  | Neden                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Teslimat ya da kargo adresi                    | İl (seçim) → ilçe (bağımlı seçim) → mahalle (liste varsa arama) → cadde/sokak, bina, daire (metin) → posta kodu (isteğe bağlı) → adres tarifi | Kargo ve fatura sistemleri alan alan ister |
| Yalnız şehir bilgisi (bölgesel rapor)          | Yalnız il                                                                              | En az veri ([KVKK pratiği](../50-guvenlik/kvkk-pratik.md)) |
| Fatura adresi                                  | İl, ilçe ve açık adres satırı                                                          | Fatura sağlayıcınızın şemasına bakın (doğrulanmadı) |
| Eski kayıtlarda serbest metin                  | Kesin olanı ayıkla (İlçe/İl, posta kodu, No), gerisini açık adres bırak, şüpheyi işaretle | Tahminle "düzeltme" veriyi bozar               |
| Yakındaki şube                                 | İlçe düzeyi yetiyorsa tablo; kapı düzeyi gerekiyorsa konum bulma servisi               | Doğruluk, maliyet ve gizlilik ödünleşimi           |
| "Adres doğru mu?"                              | Tutarlılık denetimi + kullanıcı onayı                                                  | Adresin var olduğunu ancak resmî kayıt söyler      |

## Hiyerarşi ve başvuru verisi

| Düzey           | Sayı                                        | Havuzdaki veri                                    | Not                                                     |
| --------------- | ------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------- |
| İl              | 81 (30'u büyükşehir)                        | [`veri/tr/iller.csv`](../../veri/tr/iller.csv)    | Eski/kısa adlar `diger_adlar`'da: Afyon, Antep, İçel, Maraş, Urfa, Elâzığ, Hakkâri |
| İlçe            | 973 (898 farklı ad)                          | [`veri/tr/ilceler.csv`](../../veri/tr/ilceler.csv) | "Merkez" 51 ilde; büyükşehirlerde "Merkez" yok; "19 Mayıs" rakamla yazılır |
| Mahalle / köy   | ~73 bin kayıt (PTT listesinden türetilmiş açık veri) | Yok: yeniden dağıtım koşulu denetlenmedi  | Sık değişir; kaynağıyla ve tarihiyle ayrı tutulmalı     |
| Cadde, sokak, kapı | Çok sayıda                               | Yok                                               | Resmî adres kaydı (UAVT) nüfus idaresindedir; erişim koşulları doğrulanmadı |

Ayrıntı ve doğrulama kayıtları: [`BASVURU_VERILERI.md`](../../veri/docs/BASVURU_VERILERI.md). İl bulma, "bu ilçe bu
ilde mi", posta kodu ve alan kodu tutarlılığı için hazır işlevler: [`geo.py`](../../veri/verihavuzu/geo.py).

2012'de çıkan 6360 sayılı Kanunla büyükşehir illerinde köyler mahalleye dönüştü. Veride de görünür: incelenen PTT
kaynaklı veri kümesinde (turkey-neighbourhoods 4.0.3, MIT) 30 büyükşehirde tek bir "Köyü" kaydı yok, öteki illerde
12.731 köy kaydı var. Aynı kümede "Çakmak Mah (akdurak Köyü)" gibi küçük harfle başlayan adlar ve çift boşluklar da
var: **başvuru verisi de kirlidir**; karşılaştırmadan önce iki tarafı da aynı anahtara indirin. İl ve ilçe listeleri
de değişir (ilçe kurulur, ad değişir): veriyi sürümlü bir dosyada, kaynağı ve tarihiyle tutun; koda gömmeyin.

```python calistir
KATLA = str.maketrans("çğıöşüâîû", "cgiosuaiu")


def anahtar(metin: str) -> str:
    """Karşılaştırma anahtarı: Türkçe küçük harf, işaretsiz, tek boşluk ("İSTANBUL" = "Istanbul" = "istanbul")."""
    return " ".join(metin.replace("İ", "i").replace("I", "ı").lower().translate(KATLA).split())


# veri/tr/iller.csv ve ilceler.csv'den küçük bir parça (gerçek uygulamada dosyadan okunur)
ILLER = {2: ("Adıyaman", []), 3: ("Afyonkarahisar", ["Afyon"]), 6: ("Ankara", []), 16: ("Bursa", []),
         21: ("Diyarbakır", []), 33: ("Mersin", ["İçel"]), 34: ("İstanbul", []), 55: ("Samsun", [])}
ILCELER = [(2, "Gölbaşı"), (6, "Gölbaşı"), (16, "Yenişehir"), (21, "Yenişehir"), (33, "Yenişehir"),
           (34, "Kadıköy"), (3, "Merkez"), (55, "19 Mayıs")]


def il_bul(ad: str) -> int | None:
    k = anahtar(ad)
    return next((plaka for plaka, (resmi, eski) in ILLER.items() if k in {anahtar(resmi), *map(anahtar, eski)}), None)


def ilce_adaylari(ilce: str, il: str | None = None) -> list[tuple[str, str]]:
    plaka = il_bul(il) if il else None
    return [(ILLER[p][0], ad) for p, ad in ILCELER if anahtar(ad) == anahtar(ilce) and plaka in (None, p)]


assert il_bul("ISTANBUL") == il_bul("istanbul") == il_bul("İstanbul") == 34
assert il_bul("İçel") == 33 and il_bul("Afyon") == 3  # eski ve kısa adlar
assert ilce_adaylari("Yenişehir") == [("Bursa", "Yenişehir"), ("Diyarbakır", "Yenişehir"), ("Mersin", "Yenişehir")]
assert ilce_adaylari("YENİŞEHİR", il="İçel") == [("Mersin", "Yenişehir")]  # il verilince tek aday
assert ilce_adaylari("golbasi", il="Ankara") == [("Ankara", "Gölbaşı")]  # Türkçe harfsiz yazım da bulunur
assert ilce_adaylari("19 mayis") == [("Samsun", "19 Mayıs")]  # ilçe adında rakam olabilir
assert ilce_adaylari("Kadıköy", il="Ankara") == []  # tutarsız: kullanıcıya sorun, düzeltmeyin
print("tamam")
```

## Posta kodu

Aynı PTT kaynaklı veri kümesinde ölçülenler (73.305 mahalle/köy kaydı):

| Ölçüm                                         | Sonuç                                     | Sonucu                                                       |
| --------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------ |
| İlk iki hane = ilin plaka kodu                | Kayıtların tamamında                      | Posta kodundan il çıkarılabilir; il ile çelişki denetlenebilir |
| Farklı posta kodu sayısı                      | 2.771                                     | Mahalle sayısının yirmide biri kadar                         |
| Birden çok posta kodu olan ilçe               | 973 ilçenin 648'i                         | "İlçenin posta kodu" diye tek değer yoktur                   |
| Bir posta kodunun kapsadığı mahalle/köy       | Ortanca 8, en çok 669                     | Posta kodundan mahalle çıkarılamaz                           |
| İki ilçeye yayılan posta kodu                 | Bu kümede yok                             | İlçe tahmini mümkün ama güncel listeye bağlı; kesin bilgi değil |

Uygulamada: posta kodunu **isteğe bağlı** tutun (çoğu kişi bilmez), biçimini (5 rakam) ve ilk iki hanenin seçilen
ille tutarlılığını denetleyin, tutarsızsa kullanıcıya sorun; ilçeyi ya da ili posta koduna göre **sessizce
değiştirmeyin**. Metin olarak saklayın: "06420" sayı olursa baştaki sıfır gider
([Türkiye biçimleri](turkiye-bicimleri.md)). Posta kodunun gerçekten var olduğunu söylemek güncel PTT listesini
gerektirir.

## Adres biçimleri ve kısaltmalar

```text
Caferağa Mah. Moda Cad. No: 12/4 34710 Kadıköy/İstanbul        tek satır; "12/4" = bina 12, daire 4
Atatürk Mahallesi, 1453. Sokak, No:5 D:3, Yenişehir / Mersin    numaralı sokak; "D:3" = daire 3
Örnek Köyü, Merkez Mevkii No: 7, Merkez / Bayburt               köy: sokak yok
Cumhuriyet Mh. 19 Mayıs Cd. Gül Apt. No:8 K:2 D:5               apartman adı, kat; il ve ilçe yazılmamış
(örnek yazımlar; gerçek adres değildir)
```

| Kısaltma            | Açılımı                 | Kısaltma        | Açılımı          |
| ------------------- | ----------------------- | --------------- | ---------------- |
| Mah., Mh.           | Mahallesi               | Apt., Ap.       | Apartmanı        |
| Cad., Cd.           | Caddesi                 | Sit.            | Sitesi           |
| Sok., Sk.           | Sokağı / Sokak          | Blk., Blok      | Blok             |
| Bulv., Blv.         | Bulvarı                 | No              | Dış kapı (bina)  |
| K., Kat             | Kat                     | D., Daire       | İç kapı (daire)  |

Etikette ve kargoda yaygın gösterim sırası: ad soyad → mahalle, cadde/sokak, no, daire → posta kodu, ilçe/il.
Büyük harf gerekiyorsa Türkçe kuralla ("FATİH", "İSTANBUL"; [Büyük/küçük harf](buyuk-kucuk-harf.md)).

## Serbest metin adresi neden zor

- **Aynı ad farklı düzeyde:** "Cumhuriyet" mahalle de cadde de olabilir; "Fatih" hem ilçe hem yüzlerce mahalle.
- **Sayılar her yerde:** "19 Mayıs Caddesi", "1453. Sokak", "100. Yıl Bulvarı", "No: 12/4", posta kodu.
- **"/" iki anlamlı:** "12/4" bina/daire, "Kadıköy/İstanbul" ilçe/il.
- **Eksik, karışık sıralı, kısaltmalı, yazım hatalı:** "kadikoy", "KADIKÖY", "Kadıköy'de oturuyorum".
- **Halkın kullandığı semt adı** resmî mahalle adıyla aynı olmayabilir; eski adlar (İçel) ve kısa adlar (Antep).

Bu yüzden ayrıştırıcı yalnız **kesin** parçaları çıkarır ve şüpheyi kullanıcıya döndürür:

```python calistir
import re

PLAKA = {"istanbul": 34, "ankara": 6, "mersin": 33, "bursa": 16}  # gerçekte veri/tr/iller.csv
KISA = [(r"\bMa?h\b\.?", "Mahallesi"), (r"\bCa?d\b\.?", "Caddesi"), (r"\bSo?k\b\.?", "Sokak"), (r"\bBu?lv\b\.?", "Bulvarı")]


def anahtar(metin: str) -> str:
    return metin.replace("İ", "i").replace("I", "ı").lower().translate(str.maketrans("çğıöşü", "cgiosu"))


def ayikla(metin: str) -> tuple[dict[str, str], list[str]]:
    """Serbest metinden yalnız KESİN parçaları ayıklar; gerisini açık adres bırakır, şüpheyi bildirir."""
    s, alan, uyari = " ".join(metin.split()), {}, []
    if m := re.search(r"(\S+)\s*/\s*(\S+)\s*$", s):  # sondaki "İlçe/İl" (bina/daire "12/4" ile karışmaz)
        alan["ilce"], alan["il"], s = m[1], m[2], s[: m.start()]
    if m := re.search(r"(?<![\d/])(\d{5})(?![\d/])", s):  # beş hane: posta kodu adayı
        alan["posta_kodu"], s = m[1], s[: m.start()] + s[m.end() :]
    if m := re.search(r"\bNo\b\s*[:.]?\s*(\w+)(?:\s*/\s*(\w+))?", s):
        alan["bina"], s = m[1], s[: m.start()] + s[m.end() :]
        if m[2]:
            alan["daire"] = m[2]
    if m := re.search(r"\b(?:D|Daire)\b\s*[:.]?\s*(\w+)", s):
        alan["daire"], s = m[1], s[: m.start()] + s[m.end() :]
    for kisa, uzun in KISA:
        s = re.sub(kisa, uzun, s, flags=re.IGNORECASE)
    alan["acik_adres"] = " ".join(s.split())
    plaka = PLAKA.get(anahtar(alan.get("il", "")))
    if plaka is None:
        uyari.append("il bulunamadı: listeden seçtirin")
    elif "posta_kodu" in alan and int(alan["posta_kodu"][:2]) != plaka:
        uyari.append(f"posta kodu {alan['posta_kodu'][:2]} ile başlıyor, il {alan['il']} ({plaka:02d}): sorun, düzeltmeyin")
    return alan, uyari


alan, uyari = ayikla("Caferağa Mah. Moda Cad. No: 12/4 34710 Kadıköy/İstanbul")
assert alan == {"ilce": "Kadıköy", "il": "İstanbul", "posta_kodu": "34710", "bina": "12", "daire": "4",
                "acik_adres": "Caferağa Mahallesi Moda Caddesi"} and uyari == []

alan, uyari = ayikla("19 Mayıs Cad. 1453. Sok. No:5 D:3 06420 Kadıköy/İstanbul")
assert alan["acik_adres"] == "19 Mayıs Caddesi 1453. Sokak"  # sokak adındaki sayılar numara sanılmadı
assert (alan["bina"], alan["daire"]) == ("5", "3")
assert uyari == ["posta kodu 06 ile başlıyor, il İstanbul (34): sorun, düzeltmeyin"]

alan, uyari = ayikla("Cumhuriyet Mh. Atatürk Blv. No 7")
assert alan["acik_adres"] == "Cumhuriyet Mahallesi Atatürk Bulvarı" and uyari == ["il bulunamadı: listeden seçtirin"]
print("tamam")
```

Bu ayıklayıcının sınırları bilinçlidir: "19 Mayıs/Samsun" gibi birden çok sözcüklü ilçe adını tek sözcük sanır
(sonra il–ilçe denetimi yakalar), mahalle ile sokağı birbirinden ayırmaya çalışmaz. Toplu temizlikte sonuçları
"kesin", "şüpheli", "ayrıştırılamadı" diye üç kümeye ayırıp şüphelileri bir insana gösterin
([Veri temizleme yöntemi](../70-veri/veri-temizleme-yontemi.md)). Dil modeline ayrıştırtmak da mümkündür, ama
çıktısı aynı il–ilçe listesiyle doğrulanmadan kaydedilmez ([Yapılı çıktı](../85-llm/yapili-cikti.md)).

## Konum bulma (geocoding)

- **İleri** konum bulma adresi koordinata, **ters** konum bulma koordinatı adrese çevirir.
- Sonuç bir **tahmindir** ve bir doğruluk düzeyiyle gelir: kapı, sokak, mahalle merkezi, ilçe merkezi. Düzeyi
  sonuçla birlikte saklayın; "ilçe merkezi" düzeyindeki noktayı kapı adresi gibi kullanmayın (kurye ilçe meydanına
  gider).
- Sağlayıcı seçerken kullanım koşullarını okuyun: istek sınırı, sonucu saklama izni, haritada gösterim zorunluluğu,
  Türkiye'deki kapsama. Açık harita verisine dayalı ücretsiz hizmetlerin de kullanım politikası vardır; yoğun
  kullanım kendi sunucunuzu gerektirir. Fiyat ve sınırlar değişir; güncel belgeden doğrulayın.
- Adres ve koordinat kişisel veridir: üçüncü taraf servise gönderdiğinizi aydınlatma metninde söyleyin, konumu
  gerekenden hassas saklamayın (şube önerisi için ilçe yeter).
- Kuş uçuşu uzaklık (haversine) yol uzaklığı değildir; "en yakın şube" sıralaması için çoğu zaman yeter:
  [`cografya.py`](../../kutuphane/py/kutuphane/cografya.py).

## Doğrulamada yapılmaması gerekenler

```python calistir
import re

gercek = [
    {"il": "İstanbul", "ilce": "Kadıköy", "mahalle": "Caferağa", "sokak": "Moda Caddesi", "bina": "12A", "daire": "4",
     "posta_kodu": ""},
    {"il": "Bayburt", "ilce": "Merkez", "mahalle": "Örnek Köyü", "sokak": "", "bina": "Z-3", "daire": "",
     "posta_kodu": ""},
]

# YANLIŞ 1: ASCII düzenli ifadesi Türkçe harfli, geçerli adresi reddeder
assert re.fullmatch(r"[A-Za-z0-9 .,/:-]+", "Caferağa Mahallesi") is None
# YANLIŞ 2: bina numarasını tamsayı sanmak "12A" ve "Z-3"te çöker
for numara in ("12A", "Z-3"):
    try:
        int(numara)
        raise AssertionError("çökmeliydi")
    except ValueError:
        pass
# YANLIŞ 3: İngilizce kuralla büyütmek etikete yanlış yazar
assert "Fatih Mahallesi".upper() == "FATIH MAHALLESI"  # doğrusu "FATİH MAHALLESİ"


# DOĞRU: yapılandırılmış alanlar + yumuşak denetim; engel yalnız gerçekten gerekenlerde
def denetle(adres: dict[str, str]) -> tuple[list[str], list[str]]:
    hatalar, uyarilar = [], []
    if not (adres["il"] and adres["ilce"]):
        hatalar.append("İl ve ilçeyi listeden seçin.")
    if not (adres["mahalle"] or adres["sokak"]):
        hatalar.append("Mahalle ya da sokak yazın.")
    if not adres["bina"].strip():
        uyarilar.append("Bina numarası yoksa adres tarifi ekleyin.")
    if adres["posta_kodu"] and not re.fullmatch(r"\d{5}", adres["posta_kodu"]):
        hatalar.append("Posta kodu 5 rakamdır; bilmiyorsanız boş bırakın.")
    for alan, deger in adres.items():
        if len(deger) > 100:
            hatalar.append(f"{alan} çok uzun.")
    return hatalar, uyarilar


assert all(denetle(a) == ([], []) for a in gercek)  # köy adresi sokaksız, posta kodu boş: ikisi de geçerli
assert denetle({**gercek[0], "posta_kodu": "3471"})[0] == ["Posta kodu 5 rakamdır; bilmiyorsanız boş bırakın."]
print("tamam")
```

Yapılmayacaklar listesi:

1. Adresi ASCII ya da katı bir düzenli ifadeyle doğrulamak (ç, ğ, ı, İ, ö, ş, ü, â, kesme, nokta, "/" geçerlidir).
2. Bina numarasını tamsayı yapmak ("12A", "12/1", "Z-3", "5. Blok").
3. Posta kodunu zorunlu tutmak ya da posta koduna göre ili/ilçeyi sessizce değiştirmek.
4. Köy adresinde sokak alanını zorunlu tutmak.
5. İlçe adını tek başına anahtar yapmak (Yenişehir, Gölbaşı, Merkez).
6. İl ve ilçe listesini koda gömmek; kaynağı ve tarihi olmayan liste kullanmak.
7. Adresi yalnız biçimlenmiş tek satır olarak saklamak (alanlar + kullanıcının yazdığı ham metin saklanır).
8. Formu gönderirken dış bir doğrulama servisine bağımlı olmak; servis çökünce kaydı reddetmek.
9. "Adres doğrulandı" demek: biçim tutarlılığı adresin var olduğunu ya da kişinin orada oturduğunu kanıtlamaz.

## Tuzaklar

| Belirti                                                       | Neden                                                        | Çözüm                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| Kargo yanlış ile gitti                                        | İlçe adı tek başına eşleştirildi ("Yenişehir")               | Anahtar (il, ilçe); il önce seçilir                          |
| "İçel", "Antep" yazan kullanıcı "il bulunamadı" uyarısı aldı   | Eski/kısa adlar listede yok                                  | `diger_adlar` ile eşleme                                    |
| "ISTANBUL" araması "İstanbul"u bulmuyor                        | Katlamasız karşılaştırma                                     | Türkçe katlama anahtarı                                     |
| Etikette "FATIH MAHALLESI"                                    | İngilizce kuralla büyütme                                    | Türkçe kurallı büyütme                                      |
| "12A" numaralı binaya adres girilemiyor                        | Bina numarası sayı alanı                                     | Metin alanı                                                 |
| Köyde oturan kullanıcı formu gönderemiyor                     | Sokak zorunlu                                                | Mahalle ya da sokaktan biri yeter; adres tarifi alanı       |
| Kullanıcının seçtiği ilçe kendiliğinden değişmiş              | Posta koduna göre "düzeltme" yapıldı                         | Çelişkide sorun; düzeltmeyin                                |
| "06420" posta kodu "6420" olarak kaydedildi                   | Sayı sütunu                                                  | Metin sütunu                                                |
| Ayrıştırıcı "19 Mayıs Caddesi"ni bina numarası 19 sandı        | Sayı her yerde; "No" bağlamına bakılmadı                     | Yalnız "No"dan sonraki sayıyı bina sayın                    |
| Haritada adres ilçe meydanında görünüyor                      | Konum bulma sonucu ilçe merkezi düzeyindeydi                 | Doğruluk düzeyini saklayın ve gösterin                      |
| Yeni kurulan ilçe listede yok                                 | Liste koda gömülü, güncellenmedi                             | Sürümlü veri dosyası ve güncelleme tarihi                   |

## Denetim listesi

- [ ] Form il → ilçe bağımlı seçimle başlıyor; liste sürümlü bir veri dosyasından geliyor.
- [ ] Bina, daire, posta kodu metin alanı; posta kodu isteğe bağlı; köy adresi sokaksız gönderilebiliyor.
- [ ] Eşleştirme Türkçe katlama anahtarıyla ve eski/kısa il adlarıyla yapılıyor.
- [ ] Posta kodu–il çelişkisi uyarıyla kullanıcıya soruluyor; hiçbir alan sessizce değiştirilmiyor.
- [ ] Yapılandırılmış alanların yanında kullanıcının yazdığı ham metin de saklanıyor.
- [ ] Testlerde Yenişehir/Gölbaşı/Merkez, "İçel", "19 Mayıs", "12A", sokaksız köy adresi ve "06420" var.
- [ ] Konum bulma sonucu doğruluk düzeyiyle saklanıyor; üçüncü taraf servise gönderim aydınlatma metninde yazılı.
- [ ] Adres yalnız gereken amaç için ve gerektiği kadar ayrıntılı isteniyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Adres formunu il → ilçe bağımlı seçimle kur; listeyi `veri/tr/ilceler.csv`'den oku, koda gömme.
  Bina, daire ve posta kodunu metin olarak sakla; posta kodu isteğe bağlı olsun. Karşılaştırmada Türkçe katlama
  kullan. Posta kodu il ile çelişirse uyar, alanı değiştirme. Kullanıcının yazdığı ham metni de sakla."
- **Modelin tipik hatası:** il listesini ezberden yazar (eksik ya da eski); ilçeyi il olmadan arar; bina numarasını
  `number` yapar; `[A-Za-z]` ile doğrular; posta kodunu zorunlu tutar ya da ondan ilçe "türetir"; adresi
  `toUpperCase()` ile büyütür; serbest metin ayrıştırıcısının sonucunu doğrulamadan kaydeder.
- **Çıktıda arayın:** koda gömülü il/ilçe dizileri, `type="number"` ya da `INTEGER` bina/posta kodu alanı, ASCII
  düzenli ifadeleri, `toUpperCase(`/`.upper(`, posta kodundan alan dolduran kod, yalnız ilçe adıyla yapılan arama.
- **Test isteyin:** yukarıdaki üç örnekteki gibi aynı adlı ilçeler, eski il adları, rakamlı ilçe adı, harfli bina
  numarası, sokaksız köy adresi ve çelişen posta kodu senaryoları.

## İlgili

- [Türkiye biçimleri](turkiye-bicimleri.md) — posta kodu ve telefonun biçimi ve doğrulaması
- [Yerelleştirme denetimi](yerellestirme-denetimi.md) — ad, adres, telefon formları
- [Büyük/küçük harf](buyuk-kucuk-harf.md) — Türkçe büyütme ve arama için katlama
- [Türkçe metin işleme](turkce-metin-isleme.md) — normalleştirme ve bulanık eşleme
- [Formlar](../20-web-onyuz/formlar.md) — bağımlı seçim, doğrulama zamanlaması, otomatik doldurma
- [Veritabanı tasarımı](../30-arkauc/veritabani-tasarimi.md) — sütun türleri, ham ve işlenmiş veriyi birlikte tutmak
- Havuzdaki veri ve kod: [`iller.csv`](../../veri/tr/iller.csv), [`ilceler.csv`](../../veri/tr/ilceler.csv),
  [`adres_kaliplari.csv`](../../veri/tr/adres_kaliplari.csv) (sentetik adres üretimi için kalıplar),
  [`geo.py`](../../veri/verihavuzu/geo.py) (il, ilçe, posta kodu tutarlılığı)
