---
baslik: Belge, görüntü ve ses girdisiyle çalışmak
ozet: Belge hattı (metin katmanı ya da OCR, sayfa bazında karar), tablo ve düzen sorunları, uzun belgeyi böl-özetle-birleştir, rakam doğrulama; görüntü ve ses girdisi için genel ilkeler.
etiketler: [llm, belge, ocr, ozetleme, tablo, cok-kipli]
duzey: orta
guncellik: 2026-11
---

# Belge, görüntü ve ses girdisiyle çalışmak

> Bu notu ne zaman okumalı: PDF, taranmış belge, e-posta, fatura, sözleşme gibi belgelerden özet ya da bilgi
> çıkaracakken; belgedeki tabloyu modele okuturken; görüntü ya da ses kaydını bir modelle metne çevirecekken;
> özetteki rakamlar kaynakla tutmadığında.

## Temel fikir

Model ancak önüne gelen metin kadar iyidir: belge işinin çoğu **metni doğru çıkarmaktır**. PDF'te metin katmanı
varsa doğrudan okunur, yoksa (taranmış sayfa) OCR gerekir; karar **sayfa sayfa** verilir. En sık bozulan şey düzendir:
çok sütunlu sayfalarda okuma sırası, tablolarda değerin başlığından kopması. Uzun belge bağlama sığmaz ya da küçük
modeli dağıtır: parçala, parçaları ayrı özetle, özetleri birleştir. Her aşamada **rakamları kaynakta doğrulayın**:
küçük modellerin özetteki en sık hatası rakamdır. Görüntü ve ses de aynı kurala uyar: önce metne/yapıya çevir,
sonra doğrula; model çıktısı bir dökümdür, gerçeğin kendisi değil.

## Karar tablosu

| Girdi                                       | Yöntem                                                        | Dikkat                                                  |
| ------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------- |
| Metin katmanlı PDF, düz metin               | Metin katmanını oku                                           | Üst/alt bilgi, sayfa numarası, satır sonu tirelemesi    |
| Taranmış PDF / fotoğraf                     | OCR (sayfa bazında)                                           | ı/i, ş/s karışır; düşük çözünürlük                      |
| Karışık PDF (bazı sayfalar taranmış)        | Sayfa başına karar                                            | Belge bazında karar taranmış sayfaları kaybeder         |
| Tablo ağırlıklı belge (fatura, döküm)       | Tabloyu satır satır yapıya çevir; aritmetiği kodla denetle    | Düzleşen tabloda değer başlığından kopar                |
| Çok sütunlu sayfa (gazete, akademik)        | Düzeni tanıyan çıkarıcı; okuma sırasını gözle denetleyin      | Sütunlar karışıp cümleler birleşir                      |
| E-posta                                     | Başlıklar + gövde; alıntı ve imza atılır; ekler ayrı işlenir  | Yanlış etiketli kodlama (Türkçe postada cp1254)         |
| Uzun belge (bağlama sığmıyor)               | Böl → bölüm özeti → birleştir (en çok 2 seviye)               | Bölüm sınırında kaybolan bilgi; rakam doğrulama         |
| Belgeye soru sorulacak                      | Özet değil, RAG                                               | [RAG tasarımı](rag-tasarimi.md)                         |

## Metin katmanı mı, OCR mı

Karar sayfa sayfa verilir. Basit ve işe yarar ölçüt: sayfada çok az karakter var mı, harf/rakam oranı düşük mü,
bozuk yazı tipi kalıntısı (`(cid:12)`) var mı? Rakam ağırlıklı fatura sayfaları yanlışlıkla "taranmış" sayılmamalı.

```python calistir
def ocr_gerekli(sayfa_metni: str, asgari_karakter: int = 40, asgari_oran: float = 0.55) -> bool:
    """Karar BELGE için değil SAYFA için verilir: karışık (yarısı taranmış) belgeler yaygındır."""
    sade = sayfa_metni.strip()
    if len(sade) < asgari_karakter:
        return True  # metin katmanı yok ya da neredeyse boş: taranmış sayfa
    bosluksuz = [c for c in sade if not c.isspace()]
    oran = sum(c.isalnum() for c in bosluksuz) / len(bosluksuz)
    return oran < asgari_oran or sade.count("(cid:") > 5  # bozuk yazı tipi kodlaması kalıntısı


sayfalar = {
    "düz metin": "Sözleşmenin 4. maddesine göre ödeme, fatura tarihinden itibaren 30 gün içinde yapılır.",
    "fatura kalemleri": "Toner 2 450,00 900,00\nKağıt 5 120,00 600,00\nGenel toplam 1.500,00",
    "taranmış": "  ",
    "bozuk kodlama": "(cid:12)(cid:45)(cid:3)(cid:88)(cid:19)(cid:7)(cid:41)(cid:2)" * 2,
}
for ad, metin in sayfalar.items():
    print(f"{ad}: {'OCR' if ocr_gerekli(metin) else 'metin katmanı'}")
assert [ocr_gerekli(m) for m in sayfalar.values()] == [False, False, True, True]
```

```cikti
düz metin: metin katmanı
fatura kalemleri: metin katmanı
taranmış: OCR
bozuk kodlama: OCR
```

OCR sonrası Türkçe için: `ı/i`, `ş/s`, `ğ/g`, `ü/u` karışması sık görülür. Aramada katlama kullanın (iki tarafı da
işaretsiz anahtara indirin; [Türkçe büyük/küçük harf](../97-turkce/buyuk-kucuk-harf.md)); rakamları "düzeltmeyin",
yalnız işaretleyin. Taranmış görüntüde çözünürlük OCR başarısını doğrudan etkiler; çok düşük ve gereksiz yüksek
çözünürlükten kaçının ve kendi belgelerinizde deneyin.

Havuz ve depodaki karşılıklar: `yz` yalnız metin katmanını okur, taranmış PDF için OCR yoktur
([yz README](../../yz/README.md) "Sınırlar"); temizleme (yumuşak tire, bölünmüş kelime, sayfa no, yinelenen üst/alt
bilgi) `yz/yz/rag/temizle.py`. Depo kökündeki `ozetci` projesi sayfa bazında OCR kararını, e-posta ayrıştırmayı ve
böl-özetle-birleştir hattını gerçekler (`ozetci/extract/pdf.py`, `ozetci/extract/email.py`,
`ozetci/summarize/llm.py`); o projenin kendi notuna göre gerçek model ağırlıklarıyla uçtan uca koşu yapılamamış,
kod yolları küçük rastgele bir modelle doğrulanmıştır.

## Tablo ve düzen sorunu

Tablo düz metne döküldüğünde satır ve sütun ilişkisi kaybolur: "2 450,00 900,00" dizisinde hangi sayının adet,
hangisinin tutar olduğunu küçük model karıştırır. Tabloyu **satır başına "başlık: değer"** metnine çevirin; tablo
parçalanacaksa başlık satırını her parçaya yineleyin. Aritmetik ilişkileri (adet × birim = tutar, kalemler toplamı =
genel toplam) **kodla** denetleyin; tutmuyorsa OCR ya da çıkarım hatası vardır.

```python calistir
def sayi(ham: str) -> float:  # "1.500,00" -> 1500.0 (Türkçe biçim)
    return float(ham.replace(".", "").replace(",", "."))


baslik = ["Kalem", "Adet", "Birim fiyat", "Tutar"]
satirlar = [["Toner", "2", "450,00", "900,00"], ["Kağıt", "5", "120,00", "600,00"]]

# Tablo satırını "başlık: değer" metnine çevirin: düzleşince değer başlığından kopmaz
for satir in satirlar:
    print("; ".join(f"{b}: {d}" for b, d in zip(baslik, satir)))


def aritmetik_denetim(satirlar: list[list[str]], belge_toplami: str) -> list[str]:
    sorunlar = [f"{s[0]}: {s[1]} × {s[2]} ≠ {s[3]}" for s in satirlar
                if abs(sayi(s[1]) * sayi(s[2]) - sayi(s[3])) > 0.01]
    toplam = sum(sayi(s[3]) for s in satirlar)
    if abs(toplam - sayi(belge_toplami)) > 0.01:
        sorunlar.append(f"kalemler toplamı {toplam:.2f}, belgede {belge_toplami}")
    return sorunlar


assert aritmetik_denetim(satirlar, "1.500,00") == []
print(aritmetik_denetim(satirlar, "1.580,00"))  # OCR "5"i "8" okumuş olabilir: insana gönder
```

```cikti
Kalem: Toner; Adet: 2; Birim fiyat: 450,00; Tutar: 900,00
Kalem: Kağıt; Adet: 5; Birim fiyat: 120,00; Tutar: 600,00
['kalemler toplamı 1500.00, belgede 1.580,00']
```

Çok sütunlu sayfada okuma sırasını birkaç örnek sayfada gözle denetleyin; bozuksa düzeni tanıyan bir çıkarıcı ya da
belge düzeni modeli gerekir (depodaki `ozetci` README'si seçenekleri ve lisanslarını listeler; denemeden seçmeyin).

## Uzun belge: böl, özetle, birleştir

1. **Böl:** paragraf → cümle → sert sınır; parçalar arasında örtüşme. Parça boyu modelin rahat okuduğu boyda
   (depodaki `ozetci` varsayılanı 6000 karakter ≈ 2000 belirteç).
2. **Eşle:** her parça ayrı ve **aynı istemle** özetlenir; parça istemi düz özet ister, biçim istemez.
3. **İndirge:** bölüm özetleri numaralı olarak birleştirilir ve son, biçimli özet istenir. Birleşik metin de
   sığmıyorsa bir seviye daha; en çok 2–3 seviye.
4. **Doğrula:** son özetteki rakamlar kaynakta aranır; bulunmayanlar "doğrulayın" notu olur.

```python calistir
import re


def bol(metin: str, azami: int) -> list[str]:
    """Paragrafları `azami` karaktere kadar birleştirir (gerçekte: cümle sınırı + örtüşme)."""
    parcalar, simdiki = [], ""
    for paragraf in metin.split("\n\n"):
        if simdiki and len(simdiki) + len(paragraf) > azami:
            parcalar.append(simdiki)
            simdiki = ""
        simdiki = f"{simdiki}\n\n{paragraf}".strip()
    return parcalar + [simdiki]


def sayilar(metin: str) -> set[str]:
    return {re.sub(r"\.(?=\d{3}\b)", "", s) for s in re.findall(r"\d+(?:[.,]\d+)*", metin)}


def ozetle(metin: str, model, azami: int = 120) -> tuple[str, list[str], int]:
    parcalar = bol(metin, azami)
    if len(parcalar) == 1:
        ozet, cagri = model("ÖZETLE:\n" + parcalar[0]), 1
    else:  # eşle: her parça ayrı; indirge: bölüm özetleri tek özete
        bolumler = [f"[Bölüm {i}] " + model("BÖLÜMÜ ÖZETLE:\n" + p) for i, p in enumerate(parcalar, 1)]
        ozet, cagri = model("BİRLEŞTİR:\n" + "\n".join(bolumler)), len(parcalar) + 1
    return ozet, sorted(sayilar(ozet) - sayilar(metin)), cagri  # metinde geçmeyen rakamlar: "doğrulayın"


belge = ("Kira sözleşmesi 1 Mart 2026'da başlar. Aylık kira 18.500 TL'dir.\n\n"
         "Depozito iki aylık kira tutarıdır. Kira her yıl TÜFE oranında artar.\n\n"
         "Sözleşme 12 ay sürer. Erken çıkışta bir aylık kira ceza olarak ödenir.")
betik = iter(["Kira 1 Mart 2026'da başlar, aylık 18.500 TL.", "Depozito iki aylık kira; yıllık TÜFE artışı.",
              "Süre 12 ay; erken çıkış cezası bir kira.",
              "12 aylık sözleşme, aylık 18.500 TL; depozito 37.000 TL; erken çıkış cezası bir kira."])
ozet, dogrulanmayan, cagri = ozetle(belge, lambda istem: next(betik))
print(ozet)
print("model çağrısı:", cagri, "| metinde geçmeyen rakam:", dogrulanmayan)
assert cagri == 4 and dogrulanmayan == ["37000"]  # hesaplanmış ama metinde yazmayan değer: işaretle
```

```cikti
12 aylık sözleşme, aylık 18.500 TL; depozito 37.000 TL; erken çıkış cezası bir kira.
model çağrısı: 4 | metinde geçmeyen rakam: ['37000']
```

Okuma: 37.000 TL doğru bir hesap olabilir (2 × 18.500) ama metinde yazmıyor; model hesap yaptı. İşaretli rakam
"yanlış" değil "doğrulanmamış"tır: kullanıcıya gösterirken bunun hesaplanmış değer olduğunu belirtin ya da hesabı kod
yapsın. Bölüm özetleri arasında çelişki varsa (iki farklı tarih) birleştirme adımı birini seçmemeli, ikisini de
yazmalıdır; istemde bunu açıkça isteyin.

## Görüntü ve ses girdisi: genel ilkeler

| İlke                                                   | Neden                                                            |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| Önce özel araç: metin için OCR, konuşma için ses-metin | Genel görsel/ses modeli metni uydurabilir; özel araç ölçülebilir |
| Ön işleme: döndürme, kırpma, makul çözünürlük, gürültü | Bozuk girdi en büyük hata kaynağı                                |
| Çıktı bir dökümdür: rakam ve adları doğrulayın          | Ses dökümünde adlar ve sayılar en sık bozulur                    |
| "Okunamadı" / "duyulmadı" yazma izni verin             | Yoksa model boşluğu tahminle doldurur                            |
| Güven puanı varsa kullanın; düşük güveni insana gönderin | Hatalı döküm sessizce sonraki adıma gitmesin                    |
| Görüntüdeki metin de talimat olabilir                  | Fotoğraftaki yazı istem enjeksiyonu taşıyabilir ([LLM güvenliği](llm-guvenligi.md)) |
| Yüz, ses, kimlik kartı kişisel veridir                  | Yerelde işleyin ya da buluta göndermeden önce maskeleyin/kırpın  |
| Küçük görsel modeller düşük kaliteli görüntüde uydurur  | Görev kümesinde kendi belge/fotoğraf türlerinizle ölçün          |

## Tuzaklar

| Belirti                                                       | Neden                                                   | Çözüm                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| Taranmış sayfalar özette hiç yok                              | OCR kararı belge bazında verildi                        | Sayfa bazında karar                                        |
| Fatura sayfaları gereksiz yere OCR'a gidiyor                  | Harf oranı eşiği rakamları saymıyor                     | Harf + rakam oranı; eşiği örnek sayfalarla ayarlayın       |
| Özette tutar yanlış                                           | Tablo düzleşti, sütunlar karıştı                        | "Başlık: değer" satırları; aritmetik denetim               |
| Özet belgenin ortasını atlıyor                                | Tek seferde uzun belge; küçük model dağıldı             | Böl-özetle-birleştir                                       |
| Bölüm sınırındaki madde kayboldu                              | Örtüşme yok                                             | Cümle örtüşmesi; birleştirmede "her bölümden en az bir madde" |
| Özette metinde olmayan rakam                                  | Model hesap yaptı ya da uydurdu                         | Rakam doğrulama notu; hesabı kod yapsın                    |
| Türkçe e-postada "Ã¼" gibi bozuk harfler                     | Kodlama yanlış etiketli                                 | cp1254 ile yeniden çözme denemesi                          |
| OCR'da "ı" yerine "i", arama bulamıyor                        | OCR karışması                                           | Arama için katlama; ölçümü kendi taramalarınızla yapın     |

## Denetim listesi

- [ ] OCR kararı sayfa bazında; rakam ağırlıklı sayfalar yanlışlıkla OCR'a gitmiyor.
- [ ] Üst/alt bilgi, sayfa numarası, tireleme temizleniyor; kodlama sorunları ele alınıyor.
- [ ] Tablolar "başlık: değer" satırlarına çevriliyor; aritmetik ilişkiler kodla denetleniyor.
- [ ] Uzun belge bölünüyor; parçalar örtüşmeli; birleştirme en çok 2–3 seviye.
- [ ] Son özetteki rakamlar kaynakta aranıyor; bulunmayanlar "doğrulayın" diye işaretli.
- [ ] Görüntü/ses dökümünde "okunamadı" izni ve düşük güvenin insana gitmesi var.
- [ ] Kişisel veri (yüz, ses, kimlik) yerelde ya da maskeli işleniyor.
- [ ] Kendi belge türlerinizden 10–20 örnekle uçtan uca ölçüldü.

## Küçük modele yaptırırken

- **İsteme yazın (bölüm özeti):** "Aşağıdaki bölümü en çok 4 cümlede özetle. Bütün rakamları, tarihleri ve adları
  aynen koru. Yorum ekleme." **(birleştirme):** "Bölüm özetlerini tek özette birleştir. Çelişen bilgi varsa ikisini
  de yaz. Yeni rakam hesaplama."
- **Modelin tipik hatası:** rakamı yuvarlamak ya da hesaplayıp yeni rakam üretmek; tablo sütunlarını karıştırmak;
  OCR hatasını "düzeltip" yanlış değer yazmak; uzun belgede sonu ya da ortayı atlamak.
- **Çıktıda denetleyin:** rakam doğrulama notları; tabloların aritmetiği; her bölümden en az bir bilginin son özete
  girip girmediği; özetin dili ve uzunluğu.

## İlgili

- [RAG tasarımı](rag-tasarimi.md) · [Görev bölme ve zincirler](gorev-bolme-ve-zincirler.md) ·
  [Yapılı çıktı](yapili-cikti.md) · [LLM güvenliği](llm-guvenligi.md) · [RAG değerlendirme](rag-degerlendirme.md)
- Havuz: [`yukleyici.py`](../../yz/yz/rag/yukleyici.py) (txt, md, html, pdf metin katmanı), [`temizle.py`](../../yz/yz/rag/temizle.py),
  [`parcala.py`](../../yz/yz/rag/parcala.py); Türkçe sayı/tarih düzeltmesi [`sema_araclari.py`](../../yz/yz/yapili/sema_araclari.py)
- Depodaki örnek proje: kök dizindeki `ozetci` (PDF/e-posta/görüntü → OCR → küçük modelle özet; `README.md`
  "Sınırlar" bölümünü okuyun)
- Kodlama sorunları (cp1254, bozuk harf): [Unicode ve kodlama](../10-diller/unicode-ve-kodlama.md)
