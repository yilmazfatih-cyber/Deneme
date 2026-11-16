---
baslik: Tutma ve iptal akışı
ozet: Abonelikli üründe kaybı azaltmak; istemli ve istemsiz kaybı ayırmak, ödeme hatırlatması, duraklatma, dürüst iptal akışı, iptal nedenini öğrenmek, geri kazanma ve karanlık örüntülerden kaçınmak.
etiketler: [urun, tutma, iptal, abonelik, karanlik-oruntu]
duzey: orta
guncellik: 2026-11
---

# Tutma ve iptal akışı

> Bu notu ne zaman okumalı: abonelikli bir ürünün iptal ekranını tasarlarken; aylık kayıp oranı birim ekonomisini
> zorlarken; "iptal düğmesini biraz gizlesek?" önerisi geldiğinde. Kayıp oranının doğru hesabı:
> [ürün ölçütleri](../70-veri/urun-olcutleri.md); fiyata etkisi: [fiyatlandırma](fiyatlandirma.md).

## Temel fikir

Kayıp (churn) iki türdür ve çözümleri farklıdır:

- **İstemsiz kayıp:** müşteri gitmek istemedi; kartın süresi doldu, limit yetmedi, ödeme başarısız oldu. Çözümü ürün
  değil **ödeme akışıdır**: yeniden deneme, kart güncelleme hatırlatması, hizmeti hemen kesmeyen bir bekleme süresi.
- **İstemli kayıp:** müşteri kendisi iptal etti. Nedeni çoğunlukla değeri hiç bulamamaktır (aktivasyon sorunu);
  fiyat, eksik özellik ve işin kapanması bunu izler.

Tutmanın asıl kaldıracı iptal ekranı değil **ilk haftadır**: değeri bulan kalır ([ölçüm ve öğrenme](olcum-ve-ogrenme.md)).
İptal ekranının görevi müşteriyi tutmak değil, **dürüst ve kolay bir çıkış** sunmak, nedeni öğrenmek ve uygun olanlara
iptalden daha iyi bir seçenek (duraklatma, küçük paket) göstermektir. İptali zorlaştırmak kısa vadede sayıyı
düzeltir, uzun vadede güveni, tavsiyeyi ve çoğu zaman yasal uyumu bozar.

## Karar tablosu: kayıp nedeni → eylem

| İptal nedeni ya da durum                  | Eylem                                                                      | Nerede                     |
| ----------------------------------------- | -------------------------------------------------------------------------- | -------------------------- |
| Ödeme başarısız (istemsiz)                | Birkaç gün arayla yeniden deneme; e-posta ve uygulama içi kart güncelleme hatırlatması; kısa bekleme süresi | Ödeme akışı |
| "Kullanmıyorum"                           | Aktivasyon sorunu: ilk hafta akışına dönün; iptal ekranında "kurulumu birlikte yapalım" teklifi | İlk kullanım, iptal ekranı |
| "Pahalı"                                  | Daha küçük paket ya da yıllık seçenek gösterin; indirimi alışkanlık yapmayın | İptal ekranı, fiyat sayfası |
| "Mevsimlik iş", "tatildeyim"              | Duraklatma (ör. 1–3 ay, veri korunur)                                      | İptal ekranı               |
| "Şu özellik eksik"                        | İstek defterine yazın; varsa geçici yol; söz vermeyin                      | [Önceliklendirme](onceliklendirme.md) |
| "İşimi kapattım"                          | Kolay çıkış, veri indirme, teşekkür; bu kayıp kontrol edilemez             | İptal ekranı               |
| "Rakibe geçtim"                           | Nedeni sorun (tek soru); konumlandırmayı gözden geçirin                    | [Segment ve konumlandırma](segment-ve-konumlandirma.md) |
| Deneme süresi bitiyor                     | Bitmeden önce hatırlatma; ne olacağını açıkça söyleyin                     | E-posta, uygulama içi      |

## Kaybı ayrıştırmak: yeni özellik yazmadan kazanç

```python calistir
from collections import Counter

GROSS_PROFIT = 349 - 85.47  # hesap başına aylık brüt kâr, TL (fiyatlandırma notundaki kurgusal Sedir)
active = 400  # ay başındaki ödeyen hesap
voluntary, involuntary = 10, 6  # ay içinde: kendi iptal eden, ödemesi başarısız olduğu için düşen


def ltv(churn: float) -> float:
    return GROSS_PROFIT / churn


base = (voluntary + involuntary) / active
recovered = involuntary // 2  # ödeme hatırlatması + yeniden deneme yarısını kurtarırsa
paused = 2  # mevsimlik işletmeler iptal yerine iki ay duraklatırsa
after = (voluntary - paused + involuntary - recovered) / active
print(f"kayıp: %{100 * base:.2f} → %{100 * after:.2f}")
print(f"LTV: {ltv(base):.0f} TL → {ltv(after):.0f} TL")
assert ltv(after) / ltv(base) > 1.4  # yeni özellik yazmadan, yalnız ödeme ve iptal akışıyla

reasons = Counter(["kullanmıyorum", "pahalı", "kullanmıyorum", "işimi kapattım", "eksik: kapora",
                   "kullanmıyorum", "pahalı", "eksik: kapora", "kullanmıyorum", "geçici: sezon"])
for reason, count in reasons.most_common(3):
    print(f"{count}  {reason}")
```

```cikti
kayıp: %4.00 → %2.75
LTV: 6588 TL → 9583 TL
4  kullanmıyorum
2  pahalı
2  eksik: kapora
```

Okuma: kurtarma ve duraklatma oranları burada **varsayımdır**; kendi ödeme kayıtlarınızdan ölçün. Ders şudur:
istemsiz kaybı ayrı saymadan "kayıp %4" demek, en ucuz kaldıracı gizler. İptal nedenlerinde "kullanmıyorum" başı
çekiyorsa iptal ekranında değil ilk kullanım akışında çalışın ([bilgi mimarisi ve akış](bilgi-mimarisi-ve-akis.md)).
Duraklatılan hesap kayıp sayılmaz ama ayrı izlenir: duraklatmadan dönmeyenler sonradan kayıptır.

## Dürüst iptal akışı

```text
İptal akışı — Sedir (kurgusal)
1. Ayarlar → Abonelik → [Aboneliği iptal et]            (aranınca bulunur; abone olunan yoldan, birkaç dokunuşla)
2. "Neden ayrılıyorsunuz?" (isteğe bağlı, tek soru)     ○ Kullanmıyorum ○ Pahalı ○ Mevsimlik ○ Eksik özellik
                                                         ○ İşimi kapattım ○ Başka: [____]      [Atla]
3. Nedene göre TEK teklif (varsa):                       Mevsimlik → "3 aya kadar duraklatın; verileriniz kalır."
                                                         Pahalı → "Başlangıç paketine geçin."  [Hayır, iptal et]
4. Onay: "Aboneliğiniz 30 Kasım'da sona erecek. O güne kadar kullanabilirsiniz. Verilerinizi [indirin]."
                                                         [Aboneliği iptal et]   [Vazgeç]
5. Son ekran ve e-posta: "Aboneliğiniz iptal edildi. Fikrinizi değiştirirseniz tek dokunuşla dönebilirsiniz."
```

Kurallar: iptal, abone olunan yoldan ve birkaç dokunuşla yapılır; neden sorusu isteğe bağlıdır; en çok **bir** teklif
gösterilir ve reddetmek tek dokunuştur; ne zaman sona ereceği ve verinin ne olacağı açıkça yazılır; iptal sonrası
e-posta yalnız bilgi verir. Tüketici aboneliklerinde iptalin kolay olması ve deneme sonrası ücretlendirmeden önce
bilgilendirme tüketici mevzuatının da beklentisidir (hukuki danışmanlık değildir; güncel kuralı doğrulayın,
[yasal temel belgeler](yasal-temel-belgeler.md)).

## Karanlık örüntülerden kaçınmak

| Örüntü                                                     | Neden yanlış                                   | Doğrusu                                                  |
| ---------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------- |
| İptal yalnız telefonla ya da e-postayla                    | Çıkışı zorlaştırır; güveni ve uyumu bozar      | Abone olunan yoldan, ürün içinde iptal                   |
| Suçlayıcı ret düğmesi ("Hayır, müşteri kaçırmak istiyorum") | Kullanıcıyı utandırır                          | Nötr metin: "Hayır, iptal et"                            |
| Zorunlu uzun anket                                         | İptali cezalandırır; yanıtlar da kötüleşir     | İsteğe bağlı tek soru                                    |
| Arka arkaya üç teklif ekranı                               | Yorarak tutmak                                 | Nedene göre en çok bir teklif                            |
| Deneme bitişinde habersiz ücret                            | Sürpriz; şikâyet ve iade                       | Bitişten önce hatırlatma; ne olacağı açık                |
| Önceden işaretli ek paket ya da otomatik yükseltme         | Onaysız ücret                                  | Açık, işaretsiz onay                                     |
| Fiyat artışını habersiz uygulamak                          | Güven kaybı                                    | Önceden duyuru ve geçiş süresi ([fiyatlandırma](fiyatlandirma.md)) |

## Geri kazanma

- İptal edene bir süre sonra **tek** bir ileti: ne değişti (gerçekten değiştiyse), nasıl dönülür. Dizi hâlinde
  "seni özledik" e-postaları göndermeyin; ticari ileti onayı ayrıca gerekir ([içerik ve büyüme](icerik-ve-buyume.md)).
- Dönüş tek dokunuş olsun; veri saklama süresi içindeyse hesap ve veriler eski hâliyle gelsin. Saklama süresi
  aydınlatma metninde yazılıdır; süre dolunca veri gerçekten silinir.
- İptal nedenini düzelttiyseniz (eksik özellik geldi) yalnız o nedeni söyleyenlere haber verin.

## Tuzaklar

| Belirti                                                       | Neden                                                    | Çözüm                                                                   |
| ------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| Kayıp oranı yüksek, iptal anketinde neden yok                 | Kaybın bir kısmı ödeme başarısızlığı (istemsiz)          | İstemli ve istemsiz kaybı ayrı sayın; ödeme akışını düzeltin            |
| Kart süresi dolan müşteri bir sabah hizmetsiz kaldı           | Yeniden deneme ve bekleme süresi yok                     | Yeniden deneme, hatırlatma, kısa bekleme süresi                          |
| İptal ekranı tutuyor gibi görünüyor ama şikâyetler arttı      | Yorucu teklifler, gizli düğme                            | En çok bir teklif; kolay ve açık çıkış                                  |
| "Kullanmıyorum" nedeni çoğunlukta                             | Değer hiç bulunmadı                                      | İlk hafta ve aktivasyona çalışın; iptal ekranı burada çözüm değil        |
| İndirim teklifi alışkanlık oldu, herkes iptal edip indirim bekliyor | Teklif her iptal girişimine verildi                | Teklifi nedene bağlayın; indirim yerine paket ya da duraklatma          |
| Duraklatılan hesaplar sessizce kayboluyor                     | Duraklatma bitişi izlenmedi                              | Bitişten önce hatırlatma; dönmeyenleri kayıp sayın                       |
| Dönmek isteyen müşterinin verisi silinmiş                     | Saklama süresi yazılmadı ya da söylenmedi                | Süreyi iptal ekranında ve aydınlatmada yazın                             |
| İptal sonrası kampanya e-postaları şikâyet aldı               | Onay ve ret yolu düşünülmedi                             | Tek bilgi iletisi; ticari ileti için ayrı onay                           |

## Denetim listesi

- [ ] Kayıp istemli ve istemsiz diye ayrı ölçülüyor; payda dönem başı ödeyen hesap.
- [ ] Başarısız ödemede yeniden deneme, kart güncelleme hatırlatması ve kısa bekleme süresi var.
- [ ] İptal, abone olunan yoldan ve birkaç dokunuşla yapılabiliyor; düğme aranınca bulunuyor.
- [ ] Neden sorusu isteğe bağlı tek soru; en çok bir teklif; reddetmek tek dokunuş.
- [ ] Onay ekranı sona erme tarihini ve verinin ne olacağını söylüyor; veri indirme yolu var.
- [ ] Deneme bitişinden ve fiyat değişikliğinden önce hatırlatma gidiyor.
- [ ] Duraklatma varsa bitişi izleniyor.
- [ ] İptal nedenleri haftalık sayılıyor ve ilk üç neden için karar yazılıyor.
- [ ] Karanlık örüntü tablosundaki hiçbir örüntü üründe yok.

## Küçük modele yaptırırken

- **İsteme yazın:** "İptal akışını şu kurallarla yap: abonelik ayarlarından birkaç dokunuşla iptal; isteğe bağlı tek
  neden sorusu; nedene göre en çok bir teklif; onay ekranında bitiş tarihi ve veri indirme bağlantısı. Suçlayıcı ya da
  utandırıcı metin yazma. Metinleri sözlük dosyasına koy."
- **Ödeme akışı için:** "Başarısız ödemede hizmeti hemen kesme; yeniden deneme ve kart güncelleme hatırlatması ekle;
  istemli ve istemsiz iptali ayrı olaylarla kaydet."
- **Modelin tipik hatası:** "tutma artsın" denince iptal düğmesini gizler ya da üç teklif ekranı ekler; ret düğmesine
  suçlayıcı metin yazar; başarısız ödemede hesabı hemen kapatır; istemsiz kaybı ayrı kaydetmez.
- **Çıktıda denetleyin:** iptale kaç dokunuşta varıldığı; ret düğmesinin metni; başarısız ödeme testinin varlığı;
  olay adlarında iptal türünün ayrı olması ([olay izleme planı](../70-veri/olay-izleme-plani.md)).

## İlgili

- [Fiyatlandırma](fiyatlandirma.md): kayıp oranının LTV'ye ve geri ödeme süresine etkisi.
- [Ölçüm ve öğrenme](olcum-ve-ogrenme.md) ve [ürün ölçütleri](../70-veri/urun-olcutleri.md): tutma eğrisi, kayıp tanımı.
- [Geri bildirim ve destek](geri-bildirim-ve-destek.md): iptal nedenlerini etiketlemek ve saymak.
- [UX temelleri](ux-temelleri.md): hata affetme, geri alma, suçlamayan metin.
- [Yasal temel belgeler](yasal-temel-belgeler.md): abonelik ve tüketici kuralları, saklama süresi.
