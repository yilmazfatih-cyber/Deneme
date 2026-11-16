---
baslik: Ölçüm ve öğrenme
ozet: Kuzey yıldızı ölçütünü seçmek, aktivasyonu veriden tanımlamak, huniyi ve tutmayı ürün kararına çevirmek, küçük trafikte deney sonucu okumak ve izleme yapılamayan üründe öğrenmek.
etiketler: [urun, olcum, aktivasyon, huni, tutma, deney]
duzey: orta
guncellik: 2026-11
---

# Ölçüm ve öğrenme

> Bu notu ne zaman okumalı: bir ürünün "işe yarıyor mu?" sorusuna sayıyla yanıt vermek istediğinizde; neye
> çalışacağınızı (kayıt mı, aktivasyon mu, ödeme mi) seçerken; bir değişikliğin sonucunu okumadan önce.
> Ölçüt tanımı, SQL ve istatistik ayrıntısı `70-veri` kümesindedir; bu not ürün kararı tarafıdır.

## Temel fikir

Ölçüm bir **karar** için yapılır. Her ölçümden önce şu cümle yazılır: "Bu sayı X'in üstündeyse A'yı, altındaysa B'yi
yaparız." Cümle yazılamıyorsa o sayı panoya girmez.

Döngü: **varsayım → değişiklik → ölçüt ve koruma ölçütü → karar kuralı → sonuç → karar ve öğrenme kaydı.**

Dört sayı çoğu ürün kararını taşır: **kuzey yıldızı** (kullanıcıya verilen değerin tek sayısı), **aktivasyon** (yeni
kullanıcının ilk gerçek değeri aldığı an), **huni** (hangi adımda kaybediyoruz), **tutma** (kalıyorlar mı). Tutma
düzelmeden büyümeye para harcanmaz. Ölçüm ürün ilkesiyle çatışırsa ilke kazanır; ölçüm başka yoldan yapılır.

## Karar tablosu: soru → ölçüm → karar

| Soru                                         | Ölçüm                                                    | Karar                                                      |
| -------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| Ürün değer veriyor mu?                       | Kohort tutma eğrisi düzleşiyor mu                        | Düzleşmiyorsa büyümeyi durdur, değere dön                  |
| Yeni gelenler değeri buluyor mu?             | Aktivasyon oranı (tanımlı eylem, tanımlı sürede)         | Düşükse ilk kullanım akışına çalış                         |
| Nereye çalışmalıyım?                         | Huni: aşama oranları + iyileştirmenin kolaylığı          | Göreli iyileştirmesi kolay ve büyük olan aşama             |
| Bu değişiklik işe yaradı mı?                 | Önceden yazılmış ölçüt + koruma ölçütü; aralıkla okuma   | Yay / değiştir / geri al                                   |
| Trafiğim deney için yeter mi?                | Görülebilecek en küçük fark                              | Yetmiyorsa yalnız büyük değişiklik ya da nitel yöntem      |
| Ürün–pazar uyumuna yaklaştık mı?             | Tutma + "artık kullanamasanız?" anketi + kendiliğinden tavsiye | Sinyal yoksa yeni segment ya da yeni değer önerisi    |
| Analiz aracı kullanamıyorum (ilke, gizlilik) | Kullanılabilirlik testi, isteğe bağlı paylaşılan özet, anket, görüşme | Nitel kanıtla karar; sayıyı küçük ama dürüst tut |

## Kuzey yıldızı: seçim

Tanımlar ve ürün türlerine göre adaylar: [ürün ölçütleri](../70-veri/urun-olcutleri.md). Seçerken üç soru:

1. Kullanıcı bu sayı arttığında gerçekten daha çok **değer** alıyor mu? (Açılış sayısı değil, tamamlanan iş.)
2. Ekip bu sayıyı **haftalık** etkileyebiliyor mu?
3. Bu sayıyı değer katmadan şişirmenin en ucuz yolu ne? Yanıt kolaysa yanına bir **koruma ölçütü** koyun.

Sedir (kurgusal): "haftalık bağlantıdan alınan ve iptal edilmeyen randevu"; koruma ölçütü: "gelmeyen müşteri oranı".

## Aktivasyon: veriden tanımlamak

Aktivasyon, "kalanların erken dönemde yaptığı ve kaybedilenlerin yapmadığı" eylemdir; **eylem + eşik + süre**
olarak yazılır. Bulma yolu: ilk haftadaki davranışı eşiklerle bölün, eşiğin üstünde ve altında kalanların tutmasını
karşılaştırın; farkın en büyük olduğu, ama grubu çok küçültmeyen eşiği aday seçin.

```python calistir
# İlk 7 günde bağlantıdan gelen randevu → 4. haftada hâlâ kullanıyor mu (Sedir, kurgusal, 40 hesap)
groups = {0: (10, 1), 1: (8, 2), 2: (6, 2), 3: (6, 5), 4: (5, 4), 5: (5, 5)}  # sayı: (hesap, kalan)
users = [(count, i < kept) for count, (n, kept) in groups.items() for i in range(n)]

gaps = {}
print("eşik  hesap  kalan: üstü  altı")
for t in range(1, 6):
    above = [kept for count, kept in users if count >= t]
    below = [kept for count, kept in users if count < t]
    rate_above, rate_below = sum(above) / len(above), sum(below) / len(below)
    gaps[t] = rate_above - rate_below
    print(f"≥{t}    {len(above):2}/{len(users)}  %{100 * rate_above:.0f}".ljust(26) + f"%{100 * rate_below:.0f}")
best = max(gaps, key=gaps.get)
assert best == 3
print(f"aday tanım: ilk 7 günde bağlantıdan en az {best} randevu")
```

```cikti
eşik  hesap  kalan: üstü  altı
≥1    30/40  %60          %10
≥2    22/40  %73          %17
≥3    16/40  %88          %21
≥4    10/40  %90          %33
≥5     5/40  %100         %40
aday tanım: ilk 7 günde bağlantıdan en az 3 randevu
```

Bu **ilişkidir, neden değildir**: zaten çok müşterisi olan kuaför hem 3 randevuyu geçer hem kalır (karıştırıcı
değişken; [korelasyon ve nedensellik](../70-veri/korelasyon-ve-nedensellik.md)). Adayı iki yolla sınayın: kalanlarla
ve gidenlerle görüşün; sonra ilk kullanımı o eşiğe götüren bir değişiklik yapıp tutmanın değişip değişmediğine bakın.
Tanımı ölçüt kartına yazın ve sürümleyin.

## Huni: nereye çalışmalı

Huninin en büyük **mutlak** kaybı hep başındadır (2000 ziyaretten 1800'ü kaydolmaz); bu tek başına nereye
çalışılacağını söylemez. Aşamalar çarpılarak ilerler; karar, **göreli iyileştirmenin büyüklüğü ve kolaylığıdır**.
Aynı hesap, hedef müşteri sayısı için gereken trafiği de verir:

```python calistir
import math
from statistics import NormalDist

visits = 2000
rates = {"kayıt": 0.10, "aktivasyon": 0.40, "ödeme": 0.25}  # aşamadan aşamaya (Sedir, kurgusal)


def customers(visits: int, rates: dict[str, float]) -> float:
    return visits * math.prod(rates.values())


base = customers(visits, rates)
assert round(base) == 20
options = {"kayıt %10→%12": ("kayıt", 0.12), "aktivasyon %40→%50": ("aktivasyon", 0.50), "ödeme %25→%30": ("ödeme", 0.30)}
for label, (stage, value) in options.items():
    print(f"{label}: {customers(visits, {**rates, stage: value}):.0f} müşteri (şimdi {base:.0f})")
need = 50 / math.prod(rates.values())
print(f"ayda 50 müşteri için gereken ziyaret: {need:.0f}")


def detectable_difference(n_per_arm: int, p: float, alpha: float = 0.05, power: float = 0.8) -> float:
    """Kaba yaklaşım: iki kolda n kişiyle güvenle görülebilecek en küçük mutlak oran farkı."""
    z = NormalDist().inv_cdf(1 - alpha / 2) + NormalDist().inv_cdf(power)
    return z * math.sqrt(2 * p * (1 - p) / n_per_arm)


small, large = detectable_difference(300, 0.05), detectable_difference(3000, 0.05)
assert 0.045 < small < 0.055  # %5'lik dönüşümde 300'er kişiyle ancak ~%5 → ~%10 farkı görülür
print(f"kol başına 300 kişi: %5 → %{100 * (0.05 + small):.1f} altını göremezsiniz")
print(f"kol başına 3000 kişi: %5 → %{100 * (0.05 + large):.1f}")
```

```cikti
kayıt %10→%12: 24 müşteri (şimdi 20)
aktivasyon %40→%50: 25 müşteri (şimdi 20)
ödeme %25→%30: 24 müşteri (şimdi 20)
ayda 50 müşteri için gereken ziyaret: 5000
kol başına 300 kişi: %5 → %10.0 altını göremezsiniz
kol başına 3000 kişi: %5 → %6.6
```

İki ders: (1) "Kayıtta iki puan" ile "aktivasyonda on puan" aynı ağırlıktadır; hangisinin daha kolay olduğuna bakın.
Aktivasyon çoğu zaman en ucuz kaldıraçtır, çünkü ürünün içindedir. (2) Küçük trafikte A/B testi yalnız **büyük**
farkları görür: %5'lik dönüşümü %6'ya çıkaran bir değişikliği 300'er kişiyle göremezsiniz. Örneklem hesabının doğru
yapılışı ve erken bakma tuzağı: [A/B testi](../70-veri/ab-testi.md).

## Tutma: düzleşiyor mu?

Tutma eğrisi kohort kohort çizilir (SQL: [analitik SQL kalıpları](../70-veri/analitik-sql-kaliplari.md)). Ürün kararı
için tek soru: eğri **bir yerde düzleşiyor mu**, yoksa sıfıra mı iniyor? Düzleşen eğri, bir grup kullanıcının ürünü
alışkanlık hâline getirdiğini gösterir; sıfıra inen eğri, trafiğin boşa gittiğini.

```python calistir
cohorts = {  # hafta hafta hâlâ kullananların yüzdesi (Sedir, kurgusal)
    "Eylül kohortu": [100, 40, 22, 14, 9, 6, 4],
    "Ekim kohortu": [100, 45, 32, 27, 25, 24, 24],
}


def flattens(curve: list[int], weeks: int = 3, max_drop: int = 2) -> bool:
    """Son `weeks` haftanın her birinde düşüş `max_drop` puanı geçmiyorsa eğri düzleşiyor."""
    drops = [a - b for a, b in zip(curve[-weeks - 1:], curve[-weeks:])]
    return all(drop <= max_drop for drop in drops)


for name, curve in cohorts.items():
    verdict = f"düzleşiyor (~%{curve[-1]})" if flattens(curve) else "düzleşmiyor: sıfıra iniyor"
    print(f"{name}: {verdict}")
assert not flattens(cohorts["Eylül kohortu"]) and flattens(cohorts["Ekim kohortu"])
```

```cikti
Eylül kohortu: düzleşmiyor: sıfıra iniyor
Ekim kohortu: düzleşiyor (~%24)
```

Kohortları **aynı yaşta** karşılaştırın (ikisinin de 6. haftası). Ekim kohortunda ne değişti (kurulum sihirbazı mı,
segment mi)? Öğrenme kaydına yazın. Düzleşme yüzdesinin "iyi" sayılan değeri ürün türüne göre çok değişir; başka
ürünlerin sayısıyla değil kendi kohortlarınızla karşılaştırın.

## Deney sonucunu okumak: ürün kararı

| Birincil ölçüt          | Koruma ölçütü | Karar                                                             |
| ----------------------- | ------------- | ----------------------------------------------------------------- |
| Önceden yazılan eşiği geçti (aralığın alt sınırı eşik üstünde) | Bozulmadı | Yayın; öğrenme kaydı                    |
| Geçti                   | Bozuldu       | Yayma; nedenini bul (ör. randevu arttı ama iptal de arttı)         |
| Belirsiz (aralık eşiği kesiyor) | Bozulmadı | Bedeli düşükse ve ilkeye uygunsa yay; değilse daha çok veri ya da daha büyük değişiklik |
| Açıkça kötü             | —             | Geri al; öğrenme kaydı ("neden işe yarayacağını sanmıştık?")        |

Önce-sonra karşılaştırması (değişiklikten önceki iki hafta ↔ sonraki iki hafta) küçük ekiplerin gerçeğidir ama
mevsim, bayram, kampanya gibi etkilerle karışır: tarih ve dış olayları kayda yazın, aynı anda tek değişiklik yapın.
Aralıkla okuma kuralı: [fikir doğrulama](fikir-dogrulama.md) → "Sonucu okumak"; ayrıntı:
[anlamlılık ve güven aralığı](../70-veri/anlamlilik-ve-guven-araligi.md).

**Ürün–pazar uyumu sinyalleri:** tutma eğrisinin düzleşmesi; kendiliğinden gelen tavsiyeler; etkin kullanıcılara
sorulan "Ürünü artık kullanamasanız ne hissederdiniz?" sorusunda "çok üzülürdüm" diyenlerin payı (Sean Ellis'in
önerdiği bu soruda yaygın eşik %40'tır; bu bir pratik kuraldır, kanıtlanmış bir sınır değildir ve küçük örneklemde
oynaktır; anketin hata payı ve yanıt vermeme yanlılığı: [anket ve örneklem](../70-veri/anket-ve-orneklem.md)).

## İzleme yapılamayan üründe ölçmek

Köprü (depo kökü, `CLAUDE.md` → ilke 9: "veri telefonda kalır") gibi ürünlerde analiz aracı yoktur ve olmamalıdır.
Öğrenme yine mümkündür:

- **Kullanılabilirlik testi:** görev tamamlama ve süre ([kullanılabilirlik testi](kullanilabilirlik-testi.md));
  Köprü'nün başarı ölçütü "5 afazili kullanıcıyla testte görev tamamlama ≥ %80" böyle ölçülür (`docs/PLAN.md`).
- **Cihazda özet, isteğe bağlı paylaşım:** uygulama sayıları cihazda tutar, kullanıcıya gösterir; kullanıcı isterse
  paylaşır (Köprü'de terapist için CSV ve yazdırılabilir rapor).
- **Anket ve görüşme:** kısa, gönüllü, adsız.
- **Destek ve geri bildirim kayıtları:** etiketleyip sayın ([geri bildirim ve destek](geri-bildirim-ve-destek.md)).

## Öğrenme kaydı

```text
Öğrenme kaydı #7 — 2026-12-15 (Sedir, kurgusal)
Varsayım:      Kurulum sihirbazı aktivasyonu artırır (aktivasyon: ilk 7 günde bağlantıdan ≥ 3 randevu).
Değişiklik:    Sihirbaz 2026-11-24'te bütün yeni hesaplara açıldı. Aynı dönemde başka değişiklik yok.
Ölçüt / eşik:  Aktivasyon %40'tan en az %48'e; koruma: kurulumu yarıda bırakma oranı artmaz.
Sonuç:         Önce 82/205 (%40), sonra 120/214 (%56); aralık %49–%63 (alt sınır eşiğin üstünde). Koruma bozulmadı.
Dış etkiler:   Kasım sonu kampanyası yok; bayram yok.
Karar:         Kalıcı. Sıradaki varsayım: hatırlatma iletisi gelmeyen müşteriyi azaltır.
Öğrenilen:     Yeni hesapların asıl takıldığı yer hizmet süresi girmekti; varsayılan sürelerle çözüldü.
```

## Tuzaklar

| Belirti                                                       | Neden                                                   | Çözüm                                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------- |
| Panoda otuz sayı var, hiçbiri karar doğurmuyor                | Sayılar karar cümlesi olmadan eklendi                   | Her sayıya karar cümlesi; yoksa silin ([pano tasarımı](../70-veri/pano-tasarimi.md)) |
| Kayıt sayısı artıyor, gelir yerinde sayıyor                   | Huninin başı ölçülüyor, aktivasyon ve tutma değil       | Aktivasyon ve kohort tutma                                                 |
| "Aktif kullanıcı" uygulamayı açan kişi                        | Değer yerine açılış ölçüldü                             | Çekirdek eylemle tanım ([ürün ölçütleri](../70-veri/urun-olcutleri.md))     |
| Aktivasyon eşiği seçildi, onu artırınca tutma değişmedi       | İlişki neden sanıldı                                    | Görüşme ve müdahaleyle sınayın; tanımı güncelleyin                         |
| Küçük bir düğme değişikliği "A/B testinde kazandı"            | Küçük trafik, erken bakma, şans                         | Görülebilir fark hesabı; yalnız büyük değişiklikleri test edin             |
| Aynı hafta üç değişiklik yayına çıktı, sonuç okunamıyor       | Etkiler karıştı                                         | Aynı anda tek değişiklik; tarihli kayıt                                    |
| Bayram haftasında düşüş "başarısızlık" sayıldı                | Mevsim etkisi                                           | Dış olayları kayda yazın; aynı dönemle karşılaştırın                       |
| Ölçüm için kullanıcıdan izinsiz veri toplandı                 | Ölçüm, gizlilik ilkesinin önüne geçti                   | İlke kazanır; nitel yöntem ya da isteğe bağlı paylaşım                     |
| Hedef ölçüt iyileşti, şikâyet arttı                           | Koruma ölçütü yoktu                                     | Her hedefin yanına koruma ölçütü                                           |

## Denetim listesi

- [ ] Her ölçütün yanında bir karar cümlesi var; karar doğurmayan sayı panoda yok.
- [ ] Kuzey yıldızı değeri yansıtıyor ve yanında bir koruma ölçütü var.
- [ ] Aktivasyon eylem + eşik + süre olarak tanımlı ve veriyle seçildi; nedenselliği sınandı.
- [ ] Huni aşama oranlarıyla yazılı; nereye çalışılacağı göreli iyileştirme ve kolaylıkla seçildi.
- [ ] Tutma kohort kohort ve aynı yaşta karşılaştırılıyor; düzleşme sorusunun yanıtı yazılı.
- [ ] Her değişiklik için eşik ve koruma ölçütü önceden yazıldı; trafik görülebilir farka yetiyor.
- [ ] Aynı anda tek değişiklik; dış olaylar kayıtta.
- [ ] Her sonuç bir öğrenme kaydına ve bir karara bağlandı.
- [ ] Ölçüm yöntemi ürünün gizlilik ilkesine ve yasal metinlere uygun.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu ölçüt için önce karar cümlesini yaz: 'X'in üstündeyse A, altındaysa B'. Sonra tanımı (pay,
  payda, süre, kim sayılmaz) ve bir koruma ölçütü öner. Rakam uydurma; yalnız verdiğim veriyi kullan."
- **Sonuç yorumlatırken:** "Sonucu önceden yazılan eşikle karşılaştır, aralıkla oku, 'belirsiz' seçeneğini kullan.
  Nedensellik iddia etme; olası başka açıklamaları (mevsim, kampanya, segment değişimi) listele."
- **Modelin tipik hatası:** küçük farkları "anlamlı artış" diye sunar; ilişkiyi neden sayar; aktivasyonu açılışla
  tanımlar; kohortları farklı yaşta karşılaştırır; bulamadığı veriyi tahminle doldurur.
- **Çıktıda denetleyin:** her sayının pay ve paydası; eşiğin önceden yazılıp yazılmadığı; "belirsiz" sonucun dürüstçe
  kaydı; ölçüt tanımının `70-veri` notlarındaki kartla uyumu.

## İlgili

- [Ürün ölçütleri](../70-veri/urun-olcutleri.md), [olay izleme planı](../70-veri/olay-izleme-plani.md),
  [A/B testi](../70-veri/ab-testi.md), [anlamlılık ve güven aralığı](../70-veri/anlamlilik-ve-guven-araligi.md),
  [analitik SQL kalıpları](../70-veri/analitik-sql-kaliplari.md): tanım, olay, deney ve SQL ayrıntısı.
- [Fikir doğrulama](fikir-dogrulama.md): eşiği önceden yazma ve aralıkla karar.
- [Bilgi mimarisi ve akış](bilgi-mimarisi-ve-akis.md): ilk kullanım adımları.
- [İçerik ve büyüme](icerik-ve-buyume.md): kanal başına huni.
- [Tutma ve iptal akışı](tutma-ve-iptal-akisi.md): kaybı istemli ve istemsiz diye ayırıp azaltmak.
- Hazır analiz tarifleri (huni, kayıp): [`veri/docs/ANALIZ_TARIFLERI.md`](../../veri/docs/ANALIZ_TARIFLERI.md).
