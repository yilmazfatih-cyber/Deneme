---
baslik: Tahmin ve planlama
ozet: İş tahminini parçalayarak ve aralıkla vermek, bilinmeyenleri saymak, tamponu doğru yere koymak, tarih sabitken kapsam kesmek ve ilerlemeyi dürüst bildirmek.
etiketler: [yontem, tahmin, planlama, kapsam, durum-raporu]
duzey: orta
guncellik: 2026-11
---

# Tahmin ve planlama

> Bu notu ne zaman okumalı: biri "ne zaman biter?" diye sorduğunda; bir sürüm tarihi konacağında; iş tahmin
> edilenden uzun sürmeye başladığında; ya da bir modelden iş planı ve süre tahmini istediğinizde.

## Temel fikir

Tahmin bir söz değil, **belirsizlik bildirimidir**: aralık + güven + varsayımlar. "5 gün" yerine "%50 olasılıkla
8, %85 olasılıkla 10 gün; e-posta servisinin hazır olduğunu varsayıyorum" denir. İyi tahminin dört kuralı:

1. **Parçalayın:** küçük parçalar daha iyi tahmin edilir; büyük parçanın içinde bilinmeyen saklanır.
2. **Aralık verin:** her parçaya iyimser, olası, kötümser üç değer.
3. **Bilinmeyeni ayrı sayın:** her bilinmeyene ya bir deney ya da açık bir tampon.
4. **Tarih sabitse kapsamı kesin:** fazla mesai ve kalite düşürmek yerine.

En sık hata, parçaların "en olası" değerlerini toplamaktır. Gecikmeler birbirini götürmez, birikir; aşağıdaki
benzetimde o toplam ancak yaklaşık %15 olasılıkla tutuyor.

## Karar tablosu

| Durum                                             | Yöntem                                                 | Neden                                        |
| ------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------- |
| Aynı işi daha önce yaptınız, süresi kayıtlı       | Geçmiş süreyi kullanın                                 | En iyi tahmin ölçülmüş geçmiştir             |
| Benzerini yaptınız                                | Parçala + üç nokta                                     | Belirsizlik parça düzeyinde görünür          |
| Hiç yapmadınız (yeni teknoloji, yeni servis)      | Önce zaman kutulu deney, sonra tahmin                  | Bilinmeyeni tahmin etmek yerine ölçmek       |
| Tarih sabit (fuar, yasal süre, kampanya)          | Kapsam değişken: önce olmazsa olmazlar                 | Tarih kaçarsa her şey kaçar                  |
| Kapsam sabit, tarih esnek                         | Aralıkla tahmin, her dilim sonunda güncelleme          | Öğrendikçe aralık daralır                    |
| Birisi tek sayı istiyor                           | %85 güvenli değeri verin, varsayımları yanına yazın    | Tek sayı söz gibi okunur; güvenli olanı verin |

## Nasıl yapılır

1. **Parçalayın.** Parçalar bir-iki günü aşmasın. Aşanın içinde bilinmeyen vardır; onu bulun
   ([İşi parçalama](isi-parcalama.md)).
2. **Üç değer verin.** İyimser: her şey yolunda. Olası: en sık olan. Kötümser: makul kötü (felaket değil).
3. **Unutulan işleri ekleyin.** Her parçanın içinde şunlar da var mı: test yazma, inceleme ve düzeltme turu,
   belge, dağıtım, veri göçü, bekleme (onay, erişim, başka ekip), demo ve ekran görüntüsü. Kodlama çoğu zaman
   işin yarısıdır.
4. **Bilinmeyenleri listeleyin.** "E-posta servisi Türkçe karakterli konuyu bozuyor mu?", "Banka ekstresi hangi
   biçimde?" Her birine ya deney (yarım gün) ya da tampon yazın.
5. **Toplayın, ama doğru toplayın.** Değerleri toplamak yerine dağılımı toplayın (aşağıdaki benzetim) ya da en
   azından PERT ortalamasını kullanın: `(iyimser + 4 × olası + kötümser) / 6`.
6. **Tamponu proje düzeyinde tutun.** Her parçaya ayrı tampon koyarsanız iş süreyi doldurur (Parkinson yasası).
   Tek bir ortak tampon, kullanıldıkça görünür olur.
7. **Bildirin:** aralık, güven, varsayımlar ve "şu öğrenilince güncellenecek".

```python calistir
import math
import random

tasks = {  # (iyimser, olası, kötümser) gün
    "yürüyen iskelet": (0.5, 1, 2),
    "harcama ekle": (1, 2, 4),
    "eşit bölüştür": (0.5, 1, 3),
    "üye davet (e-posta servisi yeni)": (1, 2, 6),
    "yayına hazırlık": (0.5, 1, 3),
}


def pert_sample(rng: random.Random, low: float, mode: float, high: float) -> float:
    """PERT (beta) dağılımından örnek: ortalaması (low + 4·mode + high) / 6."""
    alpha = 1 + 4 * (mode - low) / (high - low)
    beta = 1 + 4 * (high - mode) / (high - low)
    return low + (high - low) * rng.betavariate(alpha, beta)


most_likely = sum(m for _, m, _ in tasks.values())
expected = sum((o + 4 * m + p) / 6 for o, m, p in tasks.values())
rng = random.Random(7)
totals = sorted(sum(pert_sample(rng, *t) for t in tasks.values()) for _ in range(20_000))
p50, p85 = totals[len(totals) // 2], totals[int(len(totals) * 0.85)]
hit = sum(total <= most_likely for total in totals) / len(totals)

assert most_likely < expected < p85 and 0.10 < hit < 0.22
print(f"en olası değerlerin toplamı: {most_likely} gün (tutma olasılığı yaklaşık %{round(hit * 20) * 5})")
print(f"PERT beklenen toplam: {expected:.2f} gün")
print(f"benzetim: %50 olasılıkla {math.ceil(p50)}, %85 olasılıkla {math.ceil(p85)} gün içinde (tam güne yukarı)")
```

```cikti
en olası değerlerin toplamı: 7 gün (tutma olasılığı yaklaşık %15)
PERT beklenen toplam: 8.25 gün
benzetim: %50 olasılıkla 9, %85 olasılıkla 10 gün içinde (tam güne yukarı)
```

Okuma: "7 gün" demek, sizi %85 olasılıkla geç kalmış gösterir. Doğru cümle: "%85 olasılıkla 10 gün; en büyük
risk davet parçası, çünkü e-posta servisini ilk kez kullanıyoruz." Gerçekte parçalar birbirinden bağımsız da
değildir (aynı iyimserlik hepsine bulaşır); bu yüzden gerçek dağılım benzetimdekinden de geniştir.

## Kapsam kesme

Tarih sabitse kesmeye şu sırayla başlayın:

| Önce kesilir                                         | Yerine                                     |
| ---------------------------------------------------- | ------------------------------------------ |
| Süs: canlandırma, tema, ikinci renk düzeni           | Sade ama düzgün görünüm                    |
| Seyrek işlerin otomasyonu (yönetim ekranı)           | Sahibinin çalıştıracağı bir betik           |
| Seyrek durumlar için özel ekran                      | Açık bir ileti ve elle çözüm                |
| Ayar seçenekleri                                     | Akıllı bir varsayılan                      |
| İkinci platform, ikinci dil                          | Sonraki sürüm                              |

**Kesilmez:** veri doğruluğu, güvenlik, yedek ve geri dönüş, erişilebilirliğin temeli, kişisel verinin
korunması. Bunları kesmek tarihi kurtarmaz, sorunu yayından sonraya taşır.

Öncelik etiketi olarak dört kova kullanın: **olmazsa olmaz / olmalı / olsa iyi olur / bu sefer değil.** "Bu sefer
değil" kovası boşsa öncelik verilmemiş demektir.

## İlerleme bildirimi

İlerleme yüzdeyle değil, **bitti tanımını geçmiş dilim sayısıyla** bildirilir. "%90 bitti" bir duygudur; "6 dilimden
4'ü kabul örneklerini geçti" bir olgudur. Haftalık durum notu kalıbı:

```text
Durum (16 Kasım): RİSKTE — tarih bir hafta kayabilir.
Biten:      iskelet, harcama ekle, eşit bölüştür (6 dilimden 3'ü, bitti tanımıyla)
Bu hafta:   üye davet
Engel:      e-posta servisi hesabı açılmadı (sahibinde)
Risk:       davet dilimi 2 günden 4 güne çıktı (e-posta doğrulama gerekiyor)
Karar:      borç sadeleştirme bu sürüme girsin mi? Girmezse tarih tutar.
Tahmin:     %50: 28 Kasım · %85: 3 Aralık   (geçen hafta: 25 Kasım · 30 Kasım)
```

Kural: kötü haber **öğrenildiği gün** verilir ve yanında bir seçenek taşır ("şunu kesersek tarih tutar").
Tahminin geçmişini de yazın; sürekli kayan tahmin, planın yeniden yapılması gerektiğini gösterir.

## Modelle çalışırken tahmin

Model kodu dakikalar içinde yazar; darboğaz sahibinin **inceleme, deneme ve düzeltme turu** süresidir. Tahmini
"kaç oturum + kaç inceleme turu" olarak yapın. Her dilim için en az bir düzeltme turu sayın; ilk deneme nadiren
kabul edilir. Sprint başına tur sınırı koymak (ör. üç tur) kapsamı kesmeye zorlar ve sonsuz döngüyü önler.

## Tuzaklar

| Belirti                                                  | Neden                                          | Çözüm                                                       |
| -------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| Söylenen tek sayı sonradan söz sayıldı                   | Aralık ve varsayım verilmedi                   | Her tahmin: aralık + güven + varsayım                       |
| Kod zamanında bitti, yayın iki hafta gecikti             | Yalnız kodlama tahmin edildi                   | Unutulan işler listesini her parçaya uygulayın              |
| Her görev tam tamponunu kullandı                         | Görev başına tampon                            | Tek, proje düzeyinde, görünür tampon                        |
| "%90 bitti" haftalardır                                  | Yüzdeyle bildirim; bitti tanımı yok            | Bitti tanımını geçen dilim sayısıyla bildirin               |
| Yeni bir risk öğrenildi, tahmin değişmedi                | Tahmin bir kez yapıldı                         | Her dilim sonunda yeniden tahmin                            |
| Gecikme son gün söylendi                                 | Kötü haberden kaçınma                          | Öğrenildiği gün, bir seçenekle birlikte söyleyin            |
| İlk söylenen sayı aklında kaldı, hep ona göre ölçülüyor  | Çapalama (anchoring)                           | Önce parçalayıp toplayın, sonra sayı söyleyin               |
| Tarih tutsun diye testler ve güvenlik atlandı            | Kapsam yerine kalite kesildi                   | Kesme sırası tablosu; kesilmezler listesi                   |

## Denetim listesi

- [ ] İş bir-iki günü aşmayan parçalara bölündü.
- [ ] Her parçanın iyimser, olası, kötümser değeri var.
- [ ] Test, inceleme, belge, dağıtım ve bekleme süreleri eklendi.
- [ ] Bilinmeyenler listelendi; her birine deney ya da tampon atandı.
- [ ] Toplam aralık olarak (%50 ve %85) verildi; varsayımlar yazılı.
- [ ] Kapsam dört kovaya ayrıldı; "bu sefer değil" kovası boş değil.
- [ ] Durum notu biten dilim sayısını, riskleri ve tahminin değişimini gösteriyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu işi en çok iki günlük parçalara böl. Her parçaya iyimser, olası, kötümser süre ver. Test,
  inceleme, dağıtım ve beklemeyi ayrı satır olarak ekle. Bilinmeyenleri ayrı listele. Toplamı tek sayı değil,
  aralık olarak ver ve varsayımlarını yaz."
- **Modelin tipik hatası:** aşırı iyimserdir; bütünleştirme, test ve dağıtımı unutur; "en olası" değerleri toplayıp
  tek sayı verir; insan günü ile kendi çalışma süresini karıştırır; bilinmeyeni tahminin içine gömer.
- **Çıktıda denetleyin:** unutulan işler satırları var mı; toplam bir aralık mı; her bilinmeyenin karşısında
  deney ya da tampon var mı; tahmin birimi (gün, oturum) açık mı.
- Modelin tahminini sahibinin geçmiş verisiyle karşılaştırın: önceki benzer iş gerçekte ne kadar sürdü?

## İlgili

- [İşi parçalama](isi-parcalama.md): tahminin girdisi olan dilimler.
- [Teknik yazı](teknik-yazi.md): durum raporu yazımı.
- [Problem çözme döngüsü](problem-cozme-dongusu.md): zaman kutusu.
- Diğer kümelerden: [Tahmin ve büyüklük sezgisi](../92-matematik/tahmin-ve-buyukluk-sezgisi.md), [Önceliklendirme](../95-urun/onceliklendirme.md).
