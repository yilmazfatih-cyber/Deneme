---
baslik: Tanıtım sayfası
ozet: Başlık, alt başlık ve değer önerisi formülleri; sorun, çözüm, kanıt, çağrı düzeni; uydurmasız sosyal kanıt, SSS, fiyat bölümü, tek çağrı ilkesi ve site temeline bağlı doldurulmuş Türkçe örnek.
etiketler: [urun, tanitim-sayfasi, metin-yazarligi, donusum, pazarlama]
duzey: temel
guncellik: 2026-11
---

# Tanıtım sayfası

> Bu notu ne zaman okumalı: bir ürünün ana sayfasını ya da tanıtım (landing) sayfasını yazarken; fikir
> doğrulamak için duman testi kurarken; ziyaret geldiği hâlde kimse kaydolmuyorsa.

## Temel fikir

Ziyaretçi okumaz, tarar. İlk ekranda üç soruya yanıt arar: **Bu ne? Benim için mi? Şimdi ne yapmalıyım?** Sayfanın
geri kalanı bir argümandır: **sorun → çözüm → kanıt → çağrı**; her bölüm ziyaretçinin bir sonraki sorusunu
yanıtlar.

Sayfanın **tek amacı** ve **tek ana çağrısı** vardır (kayıt, deneme, erken erişim, satın alma). Başka her bağlantı o
amaçtan dikkat çalar. Sözcükler müşteriden gelir: görüşme notlarındaki "SÖZCÜKLER" satırları başlığa ve alt başlığa
taşınır ([kullanıcı görüşmesi](kullanici-gorusmesi.md)). Kanıt dürüsttür: uydurma görüş, sahte sayaç, ölçülmemiş
rakam yoktur; kanıt yoksa kanıt bölümü de yoktur.

## Karar tablosu: amaç → yapı

| Sayfanın amacı                 | Ana çağrı                                 | Sayfada olmalı                                              | Olmamalı                              |
| ------------------------------ | ----------------------------------------- | ----------------------------------------------------------- | ------------------------------------- |
| Fikir doğrulama (duman testi)  | "Erken erişime yazılın"                   | Sorun, vaat, tek alanlı form, "yapım aşamasındayız" dürüstlüğü | Fiyat tablosu, "hemen başla" yalanı |
| Ön satış                       | "Kaporayla yerinizi ayırtın"              | Fiyat, iade koşulu, teslim aralığı                          | Belirsiz teslim tarihi                |
| Deneme ya da kayıt (abonelik)  | "14 gün ücretsiz deneyin"                 | Ürün görüntüsü, nasıl çalışır, fiyat, SSS                   | Beş farklı düğme                      |
| Tek seferlik satış             | "Satın alın"                              | Fiyat (tüketiciye vergiler dâhil), teslim, iade             | Ödeme adımında çıkan ek ücret         |
| Uygulamaya yönlendirme         | "Ana ekrana ekleyin" ya da mağaza düğmesi | Ekran görüntüleri, gizlilik özeti                           | Uzun özellik listesi                  |
| Kurumsal satış                 | "Görüşme ayarlayın"                       | Kim için, güvenlik ve KVKK, süreç                           | Bütün özelliklerin dökümü             |

## Başlık, alt başlık, değer önerisi

**Başlık formülleri** (en çok 8–10 sözcük):

| Formül                          | Örnek                                                  | Ne zaman                                  |
| ------------------------------- | ------------------------------------------------------ | ----------------------------------------- |
| [Kim] için [ne]                 | "Tek başına çalışan kuaförler için randevu sayfası."   | Duman testi; en açık, en güvenli          |
| [Sonuç], [istenmeyen şey] olmadan | "Faturanız hazır, Excel'siz."                         | Bilinen acı, bilinen alternatif           |
| [Sonuç olsun], [acı sussun]     | "Randevular dolsun, telefon sussun." ([`site`](../../site/) örneği) | Sonuç ve acı tek nefeste söylenebiliyorsa |
| [Eylem]; gerisini biz yapalım   | "Bağlantınızı paylaşın, gerisini biz yapalım."         | Kurulum kolaylığı asıl fark ise           |

**Alt başlık:** nasıl ve kimin için; somut iki özellik ve bir sonuç. "[Ürün], [kim]in [ne] yapmasını sağlar;
[özellik], [özellik]. [Sonuç]."

**Değer önerisi** (iç belge, sayfaya aynen yazılmaz): "[Hedef müşteri] için, [bugünkü alternatif]ten farklı olarak,
[ürün] [ana fayda] sağlar; çünkü [inanmak için neden]." Bu cümle yazılamıyorsa sayfa da yazılamaz; nasıl kurulduğu
ve "kimin için değil" satırı: [segment ve konumlandırma](segment-ve-konumlandirma.md).

**Boş sıfat testi:** "yenilikçi, lider, en iyi, akıllı çözüm, platform, dünya standartlarında" sözcüklerini silin;
cümlenin anlamı değişmiyorsa silinmiş hâli kalsın.

## Bölümler ve site temeli

Havuzdaki [`site`](../../site/) temelinin ana sayfası bu düzeni izler; metinler JSON dosyalarındadır, sıra
[`HomeView.astro`](../../site/src/views/HomeView.astro) dosyasındadır.

| Bölüm (sıra)        | Ziyaretçinin sorusu              | Site bileşeni (`src/components/home/`) | İçerik dosyası (`src/content/`)               |
| ------------------- | -------------------------------- | -------------------------------------- | --------------------------------------------- |
| Kahraman            | Bu ne, benim için mi?            | `Hero.astro`                           | [`anasayfa/tr.json`](../../site/src/content/anasayfa/tr.json) → `hero` |
| Özellikler (çözüm)  | Somut olarak ne alıyorum?        | `Features.astro`                       | `ozellikler/tr.json`                          |
| Nasıl çalışır       | Başlamak zor mu?                 | `Steps.astro`                          | `anasayfa/tr.json` → `steps`                  |
| Referanslar (kanıt) | Başkaları memnun mu?             | `Testimonials.astro`                   | `referanslar/tr.json`                         |
| Fiyatlar            | Ne kadar tutar?                  | `Pricing.astro`                        | `fiyatlar/tr.json`                            |
| SSS                 | Aklımdaki son itirazlar          | `Faq.astro`                            | `sss/tr.json` (arama motoruna FAQPage verisi) |
| Son çağrı           | Şimdi başlayayım                 | `CtaBand.astro`                        | `anasayfa/tr.json` → `cta`                    |

Ayrıntılı düzenleme kılavuzu: [`ana-sayfayi-duzenleme.md`](../../site/src/content/belgeler/tr/ana-sayfayi-duzenleme.md);
başlık ve bölüm sırası üzerine örnek yazı:
[`iyi-bir-ana-sayfa-nasil-yazilir.mdx`](../../site/src/content/blog/tr/iyi-bir-ana-sayfa-nasil-yazilir.mdx).
Duman testinde sayfa daha kısadır: kahraman + üç maddelik sorun + nasıl çalışır + SSS + form.

## Sosyal kanıt: uydurmadan

| Elinizdeki                 | Ne yazılır                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| Hiç müşteri yok            | Bölümü koymayın. Yerine (doğruysa): neden bu ürünü yaptığınız, kim olduğunuz, deneme koşulu       |
| Pilot kullanıcılar         | Yazılı izinli, adlı ve işli alıntı; kişinin kendi sözleri, düzeltmeden                           |
| Ölçülmüş sonuç             | Rakam + nasıl ve kaç kişide ölçüldüğü + süre: "Pilotta 3 kuaför, 2 hafta, 128 randevu: %41'i bağlantıdan." |
| Basında haber, ödül        | Kaynağa bağlantıyla                                                                              |
| Müşteri logosu             | Yalnız yazılı izinle                                                                             |

Yasak: uydurma görüş, stok fotoğraflı "müşteri", "şu an 37 kişi bakıyor" gibi sahte sayaç, "binlerce mutlu müşteri"
gibi ölçülmemiş iddia. Reklamdaki iddianın kanıtlanabilir olması tüketici mevzuatının da beklentisidir (hukuki
danışmanlık değildir; bkz. [yasal temel belgeler](yasal-temel-belgeler.md)). **Site temelindeki referanslar ve
ekip kurgusaldır:** yayından önce gerçek ve izinli görüşlerle değiştirin ya da `HomeView.astro`'dan referans
bölümünü kaldırın.

## SSS, fiyat ve çağrı

- **SSS:** görüşmelerde ve destekte duyulan gerçek itirazlar: kurulum süresi, taahhüt, verinin yeri, iptal, fiyat,
  uyumluluk. Yanıt 2–3 cümle, somut; pazarlama dili yok.
- **Fiyat:** açık rakam, kime göre paket adı ("Tek başına çalışanlar için"), en çok bir "en çok tercih edilen"
  vurgusu, KDV durumu yazılı, deneme ve iptal koşulu fiyatın hemen altında. Ayrıntı: [fiyatlandırma](fiyatlandirma.md).
- **Tek çağrı:** ana çağrı her yerde **aynı sözcüklerle** tekrar eder (ilk ekran, özelliklerden sonra, fiyatta,
  sayfa sonunda); en çok bir ikincil çağrı ("Nasıl çalışır?"). Düğme metni fiil + kazanç: "Ücretsiz deneyin";
  "Gönder", "Tıklayın" değil. Sen ya da siz dilinden birini seçin, karıştırmayın
  ([arayüz dili](../97-turkce/arayuz-dili.md)).

## Doldurulmuş örnek: duman testi sayfası

```text
Ürün (kurgusal): Evrak Kutusu — mali müşavir büroları için müşteri belgesi toplama. Amaç: duman testi.

Üst etiket:  Mali müşavir büroları için
Başlık:      Ay sonu belgeleri kendiliğinden gelsin.
Alt başlık:  Müşterileriniz fişi ve faturayı telefonla çekip gönderir; Evrak Kutusu kimden hangi belgenin
             eksik olduğunu gösterir ve hatırlatmayı sizin yerinize yapar.
Çağrı:       [Erken erişime yazılın]  — tek alan: e-posta. Altında: "Aydınlatma metni" bağlantısı.
Not:         Yapım aşamasındayız. İlk 20 büroyla birlikte geliştiriyoruz; bu dönemde ücret almıyoruz.

SORUN        Ay sonu hep aynı:
             · Belgeler WhatsApp'ta, e-postada, poşette dağınık gelir.
             · Eksik belgeyi bulmak için müşteri müşteri aranır.
             · Beyanname günü son belgeler hâlâ yoldadır.
NASIL        1. Müşterinize bağlantı gönderirsiniz.  2. Müşteri belgeyi çekip yükler.  3. Eksikler listesi kendiliğinden oluşur.
KANIT        Henüz müşteri yok → bölüm yok. (Doğruysa yerine: "Ekibimizde bu sorunu her ay yaşamış bir mali müşavir var.")
SSS          Müşterilerimin uygulama indirmesi gerekir mi? — Hayır; bağlantı telefonda tarayıcıda açılır.
             Ne kadar tutacak? — Fiyatı ilk bürolarla birlikte belirleyeceğiz; kararı yazılı olarak önceden bildiririz.
SON ÇAĞRI    Ay sonunu birlikte kolaylaştıralım. [Erken erişime yazılın]
```

Sayfanın taslağını bir modele yazdırdıysanız şu süzgeçten geçirin: başlık uzunluğu, boş sıfatlar, çağrı tutarlılığı
ve izinsiz görüş.

```python calistir
FLUFF = ["yenilikçi", "lider", "en iyi", "akıllı çözüm", "dünya standartlarında", "devrim", "eşsiz",
         "mükemmel", "son teknoloji", "dijital dönüşüm"]


def lower_tr(text: str) -> str:
    return text.replace("İ", "i").replace("I", "ı").lower()


def check(page: dict) -> list[str]:
    issues = []
    words = len(page["title"].split())
    if not 3 <= words <= 10:
        issues.append(f"başlık {words} sözcük; 3–10 olsun")
    text = lower_tr(page["title"] + " " + page["lead"])
    issues += [f"boş sıfat: {word}" for word in FLUFF if word in text]
    if len(set(page["ctas"])) != 1:
        issues.append("ana çağrı her yerde aynı sözcüklerle olmalı")
    if len(page["secondary"]) > 1:
        issues.append("en çok bir ikincil çağrı")
    for quote in page["testimonials"]:
        if not (quote["izin"] and quote["ad"] and quote["is"]):
            issues.append(f"izinsiz ya da kimliksiz görüş: {quote['metin']}")
    return issues


good = {  # Evrak Kutusu, kurgusal; duman testi sayfası
    "title": "Ay sonu belgeleri kendiliğinden gelsin.",
    "lead": "Müşterileriniz fişi ve faturayı telefonla çekip gönderir; eksik belgeleri liste gösterir.",
    "ctas": ["Erken erişime yazılın", "Erken erişime yazılın"],  # ilk ekran + sayfa sonu
    "secondary": ["Nasıl çalışır?"],
    "testimonials": [],  # henüz müşteri yok: bölüm gösterilmez
}
bad = {
    "title": "Yenilikçi ve akıllı çözümlerle işletmenizi dijitalleştiren lider platform",
    "lead": "Dijital dönüşümün en iyi adresi.",
    "ctas": ["Hemen başla", "Ücretsiz dene", "Demo iste"],
    "secondary": ["Daha fazla bilgi", "Bize ulaşın"],
    "testimonials": [{"metin": "Harika bir ürün!", "ad": "Ahmet B.", "is": "", "izin": False}],
}
assert check(good) == []
for issue in check(bad):
    print(issue)
```

```cikti
boş sıfat: yenilikçi
boş sıfat: lider
boş sıfat: en iyi
boş sıfat: akıllı çözüm
boş sıfat: dijital dönüşüm
ana çağrı her yerde aynı sözcüklerle olmalı
en çok bir ikincil çağrı
izinsiz ya da kimliksiz görüş: Harika bir ürün!
```

## Tuzaklar

| Belirti                                                     | Neden                                                    | Çözüm                                                                       |
| ----------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------- |
| Ziyaret var, kayıt yok                                      | Başlık ne yaptığını söylemiyor ya da çağrı belirsiz      | "Kim için ne" başlığı; beş saniye testi                                      |
| Beş düğme var, hiçbirine basılmıyor                         | Çok çağrı                                                | Tek ana çağrı + en çok bir ikincil                                          |
| Şablonun kurgusal referansları yayına çıktı                 | Site temelinin örnek görüşleri değiştirilmedi            | Yayından önce `referanslar/tr.json` gerçek ve izinli mi bakın; değilse bölümü kaldırın |
| "Binlerce mutlu müşteri" yazıyor, kimse sayıyı bilmiyor     | Ölçülmemiş iddia                                         | Ölçülmüş rakam + yöntem ya da hiç                                           |
| Erken erişim formunda yedi alan                             | Duman testinde gereksiz soru                             | Yalnız e-posta (+ en çok bir eleme sorusu)                                  |
| Telefonda ana düğme ilk ekranda görünmüyor                  | İlk ekran masaüstüne göre tasarlandı                     | 360 px'te başlık ve düğme ilk ekranda                                       |
| Tüketiciler fiyatın sonradan arttığını söylüyor             | KDV hariç fiyat tüketiciye gösterildi                    | Tüketiciye vergiler dâhil fiyat ([fiyatlandırma](fiyatlandirma.md))          |
| Başlık değişti ama etkisi okunamıyor                        | Aynı anda başlık, görsel ve düğme değişti                | Bir seferde tek değişiklik; tarihli not ([ölçüm](olcum-ve-ogrenme.md))       |
| Form günlerdir bozukmuş                                     | Form servisi bağlanıp denenmedi                          | Yayından sonra kendi adresinizle gönderin; site temelinin form tarifi       |
| E-postalar toplandı, aydınlatma metni yok                   | KVKK unutuldu; bülten için onay alınmadı                 | Formun yanında aydınlatma bağlantısı; ticari ileti için ayrı onay ([yasal](yasal-temel-belgeler.md)) |

## Denetim listesi

- [ ] Başlık bir formüle uyuyor, en çok 10 sözcük, boş sıfat yok.
- [ ] Alt başlık nasıl çalıştığını ve iki somut özelliği söylüyor.
- [ ] Sayfanın tek amacı ve tek ana çağrısı var; çağrı her yerde aynı sözcüklerle.
- [ ] Bölüm sırası sorun → çözüm → kanıt → fiyat ve SSS → çağrı.
- [ ] Her referans gerçek, adlı, işli ve yazılı izinli; değilse bölüm yok.
- [ ] Her rakamın yanında nasıl, kaç kişide ve ne kadar sürede ölçüldüğü yazıyor.
- [ ] SSS gerçek itirazlardan; yanıtlar kısa ve somut.
- [ ] Fiyat açık; KDV durumu yazılı.
- [ ] 360 px'te başlık ve ana düğme ilk ekranda.
- [ ] Form denendi; aydınlatma metni bağlantısı formun yanında.
- [ ] Beş saniye testi: tanımayan biri "ne, kim için, ne yapmalıyım" sorularını doğru yanıtladı.

## Küçük modele yaptırırken

- **İsteme yazın:** görüşmelerden 5–10 alıntıyı verin ve "Başlık için 5 seçenek yaz; 'kim için ne' ya da 'sonuç,
  istenmeyen şey olmadan' formülünde, en çok 8 sözcük. Yenilikçi, lider, akıllı, çözüm, platform sözcüklerini
  kullanma. Referans, rakam, müşteri adı UYDURMA; elinde yoksa o bölümü yazma ve bana söyle" deyin.
- **Site temelinde:** "Yalnız `src/content/anasayfa/tr.json`, `ozellikler/tr.json`, `sss/tr.json`, `fiyatlar/tr.json`
  dosyalarını değiştir. `referanslar/tr.json`'a dokunma; gerçek görüş olmadığı için `src/views/HomeView.astro`'dan
  referans bölümünü kaldır. `npm run check` yeşil olsun ve çıktıyı göster."
- **Modelin tipik hatası:** boş sıfat yığar; "%40 daha fazla randevu" gibi rakam ve "Ayşe K., memnun müşteri" gibi
  görüş uydurur; her bölüme farklı çağrı metni yazar; sen ve siz dilini karıştırır; İngilizce kalıpları çevirir.
- **Çıktıda denetleyin:** yukarıdaki süzgeç; metinde geçen her rakam ve yüzde için kaynak sorun; referans dosyası
  değişmiş mi bakın.

## İlgili

- [Fikir doğrulama](fikir-dogrulama.md): duman testi ve sonucunu okumak.
- [Segment ve konumlandırma](segment-ve-konumlandirma.md): başlığın dayandığı konumlandırma cümlesi.
- [Kullanıcı görüşmesi](kullanici-gorusmesi.md): başlığın sözcükleri.
- [SEO temelleri](seo-temelleri.md): sayfanın bulunması; başlık ve açıklama etiketi.
- [Fiyatlandırma](fiyatlandirma.md) ve [yasal temel belgeler](yasal-temel-belgeler.md).
- [Ölçüm ve öğrenme](olcum-ve-ogrenme.md) ve [içerik ve büyüme](icerik-ve-buyume.md): trafiği getirmek ve ölçmek.
