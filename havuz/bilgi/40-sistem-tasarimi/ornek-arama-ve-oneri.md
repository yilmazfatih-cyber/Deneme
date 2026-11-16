---
baslik: "Örnek tasarım: arama ve öneri"
ozet: Türkçe metin araması ve "bunu alanlar şunları da aldı" önerisinin gereksinimleri, kaba hesabı, tek sunuculu tasarımı, dizin güncelliği, kesintisiz yeniden dizinleme, öneri sunum katmanı ve büyüyünce değişenler.
etiketler: [ornek-tasarim, arama, oneri, dizin, tutarlilik]
duzey: ileri
guncellik: 2026-11
---

# Örnek tasarım: arama ve öneri

> Bu notu ne zaman okumalı: ürüne arama kutusu, "benzer ürünler" ya da "sana önerilenler" eklenirken; arama
> sonuçları eksik/bayat çıktığında; ayrı bir arama motoruna ya da öneri modeline geçme sorusu geldiğinde.

## Temel fikir

- Arama ve öneri, ana verinin **türetilmiş kopyalarıdır** (dizin, hazır öneri listesi). Doğruluk kaynağı
  veritabanıdır; kopya nihai tutarlıdır ve her zaman yeniden üretilebilmelidir.
- Arama üç basamakta büyür: katlanmış sütunda `LIKE` → aynı veritabanında tam metin dizini (SQLite FTS5,
  Postgres tam metin) → ayrı arama motoru. Her basamak bir **ölçüm** (yavaşlık, ilgi kalitesi, hacim) ile atlanır.
- Önerinin zor kısmı çoğu zaman algoritma değil **sunum katmanıdır**: stokta olmayanı, zaten alınanı, yetkisiz
  içeriği süzmek ve liste boş kalınca yedekle doldurmak.
- Yetki ve görünürlük süzgeci **sorgu anında** uygulanır; dizine güvenilmez.
- Uygulama ayrıntıları başka notlarda: FTS5 ile süzgeçli arama ve Türkçe katlama [Arama](../30-arkauc/arama.md),
  öneri yöntemleri ve değerlendirme [Öneri sistemleri](../80-ml/oneri-sistemleri.md). Bu not mimariyi kurar.

## Gereksinimler

| Tür              | Gereksinim                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------- |
| İşlevsel         | Ürün/belge araması: büyük-küçük harf ve Türkçe işaret duyarsız ("cig" → "Çığ"), ön ek ile    |
| İşlevsel         | Süzgeç (kategori, fiyat, kiracı) ve ilgi sırası; yazdıkça öneri (otomatik tamamlama)          |
| İşlevsel         | Ürün sayfasında "bunu alanlar şunları da aldı"; yeni üründe de boş kalmaz                   |
| İşlevsel olmayan | Arama p95 < 200 ms; yeni/güncellenen kayıt 1 dk içinde aranabilir                            |
| Hedef dışı       | Yazım hatası düzeltme, eş anlamlılar, kişisel sıralama modeli (ilk sürümde)                  |

## Kaba hesap

```python calistir
belge, ort_kb = 200_000, 2  # tahmin
arama_gunluk, tepe, harf = 50_000, 6, 8
her_tus = arama_gunluk * harf / 86_400 * tepe  # yazdıkça her tuşta bir istek
gecikmeli = arama_gunluk * 2.5 / 86_400 * tepe  # 300 ms bekleyip istek: arama başına ~2,5 istek (varsayım)
print(f"metin ~{belge * ort_kb / 1e6:.1f} GB | tepe: her tuşta {her_tus:.0f} istek/sn, 300 ms beklemeyle {gecikmeli:.0f} istek/sn")
assert her_tus > 3 * gecikmeli
```

```cikti
metin ~0.4 GB | tepe: her tuşta 28 istek/sn, 300 ms beklemeyle 9 istek/sn
```

Yarım gigabaytlık metin ve saniyede onlarca sorgu, aynı veritabanındaki tam metin diziniyle rahat taşınır. Yazdıkça
aramada istek sayısını belirleyen arayüzdür: tuş başına istek yerine kısa bekleme (debounce) ve süren isteği iptal.

## İlk tasarım: tek sunucu

```text
yazma: kayıt + (aynı işlemde) FTS5 dizini, katlanmış metinle      ← dizin her zaman güncel, ayrı parça yok
arama: katla(sorgu) → FTS5 eşleşme + bm25 sırası → JOIN asıl tablo → kiracı/yetki/durum süzgeci → sayfa
öneri: gece işi → ilgili_urun(urun, aday, puan) tablosu → sunum katmanı (süz + yedekle doldur) → önbellek
```

- Türkçe katlama dizine giden ve sorguya giden metne **aynı işlevle** uygulanır. Ölçülmüş bir tuzak: SQLite FTS5'in
  varsayılan belirteçleyicisi (`unicode61`) ç/ş/ğ işaretlerini atar ama `ı` harfini `i`'ye çevirmez ve `I`'yı
  İngilizce kuralla küçültür; bu ortamda (SQLite 3.53) "cig" → "Çığ", "ilik" → "ılık", "kagithane" → "Kâğıthane"
  aramaları katlamasız **sonuç vermedi**. Katlama işlevi: [Türkçe büyük/küçük harf](../97-turkce/buyuk-kucuk-harf.md).
- Yeni kaydı oluşturan kullanıcıya kaydı aramadan değil doğrudan gösterin; dizin ayrı bir motordaysa "birkaç saniye
  içinde aranabilir" ([Tutarlılık modelleri](tutarlilik-modelleri.md)).

**Öneri sunum katmanı:** hazır listeyi süzer, yetmezse yedekle doldurur:

```python calistir
ILGILI = {  # gece toplu işle hesaplanır: "bunu alanlar şunları da aldı", puan sırasıyla
    "kalem": ["defter", "silgi", "kalemtras", "cetvel", "kalem"],
    "defter": ["kalem", "dosya"],
}
POPULER = ["su", "pil", "defter", "kalem", "sarj-kablosu"]  # soğuk başlangıç yedeği (son 7 gün)
STOK = {"silgi": 0}  # stokta olmayanlar


def oner(urun: str, alinanlar: set[str], adet: int = 4) -> list[str]:
    """Sunum katmanı: hazır listeyi süz, yetmezse yedekle doldur. Hesap gece yapılır; burada yalnız süzme."""
    sonuc: list[str] = []
    for aday in ILGILI.get(urun, []) + POPULER:
        if aday == urun or aday in alinanlar or STOK.get(aday, 1) == 0 or aday in sonuc:
            continue  # kendisi, zaten alınmış, stokta yok, yinelenen
        sonuc.append(aday)
        if len(sonuc) == adet:
            break
    return sonuc


assert oner("kalem", alinanlar={"defter"}) == ["kalemtras", "cetvel", "su", "pil"]
assert oner("yeni-urun", alinanlar=set()) == ["su", "pil", "defter", "kalem"]  # soğuk başlangıç: boş kalmaz
print(oner("kalem", alinanlar={"defter"}), "|", oner("yeni-urun", alinanlar=set()))
```

```cikti
['kalemtras', 'cetvel', 'su', 'pil'] | ['su', 'pil', 'defter', 'kalem']
```

İlk öneri hesabı basit tutulur: birlikte satın alma sayısı, popülerliğe göre normalleştirilmiş (yoksa her ürüne en
çok satanı önerir) — yöntem ve değerlendirme tuzakları [Öneri sistemleri](../80-ml/oneri-sistemleri.md)'nde.
Öneri, kullanıcının gördüğünü değiştirir ve gelecekteki veriyi bozar (geri besleme döngüsü); bir kısım gösterimi
keşfe ayırın ve etkisini A/B testiyle ölçün ([A/B testi](../70-veri/ab-testi.md)).

## Büyüyünce: dizin ayrı motora taşınınca

Ayrı arama motoru gerektiren durumlar: milyonlarca belge ve karmaşık ilgi ayarı, yüzeyler (facet) ve yazım hatası
toleransının ölçekte gerekmesi, aramanın veritabanını yorması. O zaman dizin **ayrı bir kopya** olur ve iki yeni
sorun doğar:

1. **Güncellik:** yazma giden kutusuna düşer, dizinleyici işçi en az bir kez ve idempotent uygular
   ([Kuyruk ve olaylar](kuyruk-ve-olaylar.md)). Dizin gecikmesi (en eski işlenmemiş olayın yaşı) izlenir.
2. **Yeniden dizinleme** (katlama kuralı ya da alan değişti): yeni dizin eskisinin **yanında** kurulur; kurulum
   sırasında gelen yazmalar giden kutusundan yeniden oynatılır, sonra takma ad (alias) yeni dizine çevrilir:

```python calistir
KATLA = str.maketrans("çğıöşüâîû", "cgiosuaiu")


def katla(metin: str) -> str:  # Türkçe arama anahtarı (bkz. 97-turkce/buyuk-kucuk-harf)
    return metin.replace("İ", "i").replace("I", "ı").lower().translate(KATLA)


kaynak = {1: "Kira sözleşmesi", 2: "Fatura", 3: "Vergi beyannamesi"}  # veritabanı: doğruluk kaynağı
giden: list[int] = list(kaynak)  # giden kutusu: değişen kaydın kimliği (yazmayla aynı işlemde eklenir)


def yaz(kimlik: int, metin: str | None) -> None:
    if metin is None:
        kaynak.pop(kimlik, None)
    else:
        kaynak[kimlik] = metin
    giden.append(kimlik)


def uygula(dizin: dict[int, str], imlec: int) -> int:
    """Dizinleyici: giden kutusunu imleçten itibaren uygular (idempotent: ekle/güncelle/sil); yeni imleci döner."""
    for kimlik in giden[imlec:]:
        if kimlik in kaynak:
            dizin[kimlik] = katla(kaynak[kimlik])
        else:
            dizin.pop(kimlik, None)
    return len(giden)


def beklenen() -> dict[int, str]:
    return {k: katla(v) for k, v in kaynak.items()}


canli: dict[int, str] = {}
imlec = uygula(canli, 0)
baslangic = len(giden)  # 1) kurulum başlarken giden kutusunun konumu not edilir
yeni = beklenen()  # 2) SONRA anlık görüntüden toplu kurulum (gerçekte dakikalar sürer)...
yaz(2, "Fatura (ödendi)")  # ...bu sırada yazmalar sürer
yaz(4, "Site aidatı")
yaz(1, None)  # silme
imlec = uygula(canli, imlec)  # canlı dizin güncel kalır
assert yeni != beklenen()  # YANLIŞ: hemen geçilirse kurulum sırasındaki 3 değişiklik kayıp
uygula(yeni, baslangic)  # DOĞRU: kurulum başındaki konumdan itibaren yeni dizine yeniden oynat
assert yeni == beklenen() == canli
print("yeniden dizinleme: giden kutusu yeniden oynatılınca yeni dizin eksiksiz; sonra takma ad çevrilir")
```

```cikti
yeniden dizinleme: giden kutusu yeniden oynatılınca yeni dizin eksiksiz; sonra takma ad çevrilir
```

Konum anlık görüntüden **önce** not edilir; arada iki kez uygulanan değişiklik zarar vermez, çünkü dizinleyici
idempotenttir. Geçişten sonra eski dizin bir süre geri dönüş için tutulur.

| Eşik                                             | Değişiklik                                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| Aramalar veritabanını yoruyor, ilgi ayarı yetmiyor | Ayrı arama motoru + giden kutusu + dizinleyici                           |
| Yazdıkça arama yükü yüksek                        | Ön ek önbelleği (sık ön ekler), istemcide bekleme ve iptal                  |
| Öneri listeleri herkese aynı                      | Kişisel aday üretimi + sıralama modeli; çevrimdışı hesap, çevrimiçi süzme  |
| Arama kalitesi şikâyetleri                        | Sorgu günlüğü (kişisel veri olmadan), sonuçsuz aramalar listesi, tıklama oranı |
| Dizin ile veritabanı farklı sayı veriyor          | Düzenli tam karşılaştırma işi; fark eşiği aşılınca uyarı                    |

## Tuzaklar

| Belirti                                                       | Neden                                                     | Çözüm                                                       |
| ------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| "cig", "ilik" araması sonuç vermiyor                          | Varsayılan belirteçleyici `ı`'yı katlamıyor               | Kendi katlamanız; dizin ve sorgu aynı işlevden              |
| Başka kiracının belgesi aramada çıkıyor                        | Süzgeç dizine bırakıldı ya da unutuldu                    | Sorgu anında kiracı/yetki süzgeci; iki kiracılı test        |
| Silinen ürün aramada ve önerilerde duruyor                    | Dizin/öneri tablosu silmeyi görmedi                       | Giden kutusunda silme olayı; sunum katmanında son denetim   |
| Yeniden dizinlemeden sonra son değişiklikler kayboldu         | Kurulum sırasındaki yazmalar yeni dizine yansımadı        | Konumu not et, yeniden oynat, sonra takma ad                |
| Yeni ürün sayfasında öneri kutusu boş                         | Soğuk başlangıç yedeği yok                                | Popüler/kategori yedeği                                     |
| Stokta olmayan ürün öneriliyor                                | Gece hesaplanan liste sunumda süzülmüyor                  | Sunum katmanında stok ve görünürlük süzgeci                 |
| Arama kutusu sunucuyu yoruyor                                 | Her tuşta istek, eski istekler iptal edilmiyor            | 250–300 ms bekleme, iptal, en az 2 harf                      |
| Her ürüne en çok satan öneriliyor                             | Birlikte alma sayısı popülerliğe göre normalleştirilmedi  | Normalleştirme; değerlendirmeyi popülerlik tabanına karşı yap |

## Denetim listesi

- [ ] Arama basamağı (LIKE / FTS / motor) ölçümle seçildi; geçiş eşiği yazılı.
- [ ] Katlama dizine ve sorguya aynı işlevle uygulanıyor; "cig", "ISPARTA", "ılık" testleri var.
- [ ] Kiracı, yetki ve durum süzgeci sorgu anında; iki kiracılı arama testi var.
- [ ] Dizin güncelliği tanımlı (aynı işlem ya da giden kutusu); dizin gecikmesi izleniyor.
- [ ] Yeniden dizinleme yolu yazılı ve denenmiş (konum → kurulum → yeniden oynatma → takma ad).
- [ ] Öneri sunum katmanı stok, alınmış ve görünürlük süzgeci uyguluyor; soğuk başlangıç yedeği var.
- [ ] Sonuçsuz aramalar ve tıklama oranı ölçülüyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Arama FTS5 ile, dizin yazmayla aynı işlemde güncellensin. Dizine ve sorguya aynı `katla`
  işlevini uygula. Sonuçları asıl tabloyla birleştirip kiracı ve durum süzgecini sorguda uygula. Öneri kutusu hazır
  `ilgili_urun` tablosundan okusun; stokta olmayanı ve kullanıcının aldığını çıkar, eksikse popüler ürünlerle doldur."
- **Modelin tipik hatası:** özgün metni dizine koyup Türkçe katlamayı unutur; kiracı süzgecini yalnız dizine
  güvenir; arama motoru önerir ama giden kutusu ve yeniden dizinleme yolu kurmaz; öneri listesini süzmeden basar.
- **Çıktıda arayın:** dizine yazılan metinde `katla(`; arama sorgusunda kiracı koşulu; öneri ucunda stok ve
  "zaten alındı" süzgeci; yazdıkça aramada bekleme ve iptal.

## İlgili

- [Arama](../30-arkauc/arama.md) (FTS5 ile süzgeçli çalışan örnek, ilgi sırası) ·
  [Öneri sistemleri](../80-ml/oneri-sistemleri.md) · [A/B testi](../70-veri/ab-testi.md)
- [Kuyruk ve olaylar](kuyruk-ve-olaylar.md) (giden kutusu) · [Tutarlılık modelleri](tutarlilik-modelleri.md) ·
  [Çok kiracılık](cok-kiracilik.md)
- Havuzda: bulanık arama [`kutuphane/py/kutuphane/bulanik_arama.py`](../../kutuphane/py/kutuphane/bulanik_arama.py),
  arama anahtarı [`kutuphane/py/kutuphane/turkce.py`](../../kutuphane/py/kutuphane/turkce.py); ters dizin, BM25,
  "bunu mu demek istediniz" ve otomatik tamamlamanın sıfırdan gerçeklemesi:
  [`sifirdan/veri/arama_motoru/README.md`](../../sifirdan/veri/arama_motoru/README.md)
