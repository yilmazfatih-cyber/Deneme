---
baslik: Veri ve etiket kalitesi
ozet: Etiket gürültüsü ve uyuşma ölçümü, sınıf dengesizliği, örnekleme yanlılığı, eğitim-kullanım uyumsuzluğu ve öğrenme eğrisiyle "daha çok veri mi, daha güçlü model mi" kararı.
etiketler: [makine-ogrenmesi, etiket, veri-kalitesi, dengesizlik, ogrenme-egrisi]
duzey: orta
guncellik: 2026-11
---

# Veri ve etiket kalitesi

> Bu notu ne zaman okumalı: veri toplanırken ya da etiketlenirken; model "öğrenmiyor" ya da başarısı bir yerde
> takılıp kaldığında; "daha çok veri toplayalım mı?" sorusu sorulduğunda.

## Temel fikir

Model etiketin **tanımını** öğrenir, gerçeği değil. Etiketi kim, ne zaman, hangi kuralla koyduysa model onu
taklit eder; etiketçinin yanlılığı da modele geçer. Bu yüzden üç soru veri miktarından önce gelir:

1. **Etiket tutarlı mı?** Aynı örneğe iki kişi aynı etiketi veriyor mu?
2. **Eğitim verisi kullanımdakine benziyor mu?** Model hangi müşteriye, hangi döneme, hangi kanala
   uygulanacaksa veri oradan mı geldi?
3. **Darboğaz veri mi, model mi?** Öğrenme eğrisi bunu söyler; tahminle karar verilmez.

Gürültülü sınama etiketi ölçümün de tavanıdır: etiketlerin %10'u yanlışsa kusursuz bir model bile %90 ölçülür.

## Etiket kalitesi

### Uyuşmayı ölçmek: ham oran yanıltır

İki etiketçi 100 destek iletisini "normal / şikâyet" diye etiketlesin. Çoğu ileti normal olduğu için ham
uyuşma yüksek çıkar; şansa göre düzeltilmiş uyuşma (Cohen kappa) gerçeği gösterir.

```python calistir
from collections import Counter

# (etiketçi A, etiketçi B) çiftlerinin sayıları
pairs = [("normal", "normal")] * 82 + [("normal", "şikâyet")] * 8 \
      + [("şikâyet", "normal")] * 6 + [("şikâyet", "şikâyet")] * 4
n = len(pairs)
observed = sum(a == b for a, b in pairs) / n
count_a = Counter(a for a, _ in pairs)
count_b = Counter(b for _, b in pairs)
expected = sum(count_a[c] * count_b[c] for c in count_a) / (n * n)
kappa = (observed - expected) / (1 - expected)
both_complaint = pairs.count(("şikâyet", "şikâyet"))
any_complaint = sum("şikâyet" in pair for pair in pairs)
print(f"ham uyuşma {observed:.2f}, kappa {kappa:.2f}")
print(f"şikâyette uyuşma: {both_complaint}/{any_complaint}")
assert observed > 0.85 and kappa < 0.35
```

```cikti
ham uyuşma 0.86, kappa 0.29
şikâyette uyuşma: 4/18
```

Ham uyuşma %86, ama asıl önemli sınıfta (şikâyet) iki kişi 18 iletiden yalnız 4'ünde anlaşıyor. Bu durumda
model kurmak boşunadır: önce etiket kılavuzu düzeltilir. Kaba yorum (yaygın kullanım, kesin eşik değildir):
kappa 0,6 altı zayıf, 0,8 üstü iyi.

### Gürültü ölçümün tavanıdır

```python calistir
import random

random.seed(1)
truth = [random.random() < 0.3 for _ in range(10_000)]
noisy_test = [not y if random.random() < 0.10 else y for y in truth]  # %10 yanlış etiket


def measured_accuracy(true_accuracy: float) -> float:
    predictions = [y if random.random() < true_accuracy else not y for y in truth]
    return sum(p == t for p, t in zip(predictions, noisy_test)) / len(truth)


for true_accuracy in (1.00, 0.95, 0.90):
    print(f"gerçek doğruluk {true_accuracy:.2f} → ölçülen {measured_accuracy(true_accuracy):.3f}")
assert measured_accuracy(1.0) < 0.91
```

```cikti
gerçek doğruluk 1.00 → ölçülen 0.900
gerçek doğruluk 0.95 → ölçülen 0.860
gerçek doğruluk 0.90 → ölçülen 0.813
```

İki sonuç çıkar: (1) ölçülen tavan 0,90 ise "model takıldı" demek yanlıştır, etiket takılmıştır; (2) gerçekte
5 puan farklı iki model, gürültülü etikette daha yakın görünür. **Sistematik** gürültü daha sinsidir: bir
etiketçi bütün iade iletilerini "şikâyet" yaptıysa ve sınama etiketleri de aynı kişidense ölçüt hatayı hiç
göstermez. Sınama kümesinin etiketlerini en dikkatli kişiye ya da iki kişiye koydurun.

### Etiket kalitesini artırmanın sırası

1. **Etiket kılavuzu:** her sınıfın tanımı, 3–5 örnek, sınır durumları ("iade + kargo gecikmesi hangisi?"),
   "emin değilim" seçeneği.
2. **İki kişiyle küçük deneme:** 100–200 örneği iki kişi etiketler; kappa ve karışan sınıf çiftleri
   çıkarılır, kılavuz düzeltilir.
3. **Ayrı ve temiz sınama kümesi:** en dikkatli etiketlenen kısım sınamaya ayrılır.
4. **Etiket denetimi:** modelin emin olduğu hâlde etiketle çeliştiği örnekler gözden geçirilir
   ([hata analizi](hata-analizi.md)).
5. **Çelişen etiket ve yinelenen örnek taraması:** aynı metin iki ayrı etiketle varsa biri yanlıştır.

## Sınıf dengesizliği

Dengesizlik (az pozitif) kendi başına çoğu zaman sorun değildir. Sorun **0,5 eşiği** ve **doğruluk** ölçütüdür.

```python calistir
import math
import random

random.seed(3)
PRIOR = 0.02  # pozitif oranı %2


def posterior(x: float) -> float:  # x | y=1 ~ N(2, 1), x | y=0 ~ N(0, 1); gerçek olasılık
    odds = PRIOR / (1 - PRIOR) * math.exp(2 * x - 2)
    return odds / (1 + odds)


rows = []
for _ in range(20_000):
    y = random.random() < PRIOR
    rows.append((posterior(random.gauss(2.0 if y else 0.0, 1.0)), y))

ranked = sorted(rows)
positives = sum(y for _, y in rows)
rank_sum = sum(rank for rank, (_, y) in enumerate(ranked, start=1) if y)
negatives = len(rows) - positives
auc = (rank_sum - positives * (positives + 1) / 2) / (positives * negatives)
print(f"pozitif {positives}, ROC-AUC {auc:.3f}")
for threshold in (0.5, 0.2, 0.1):
    flagged = [y for p, y in rows if p >= threshold]
    recall = sum(flagged) / positives
    precision = sum(flagged) / len(flagged)
    print(f"eşik {threshold:.1f}: işaretlenen {len(flagged):4d}, duyarlılık {recall:.2f}, kesinlik {precision:.2f}")
```

```cikti
pozitif 442, ROC-AUC 0.927
eşik 0.5: işaretlenen  105, duyarlılık 0.18, kesinlik 0.77
eşik 0.2: işaretlenen  409, duyarlılık 0.41, kesinlik 0.44
eşik 0.1: işaretlenen  854, duyarlılık 0.56, kesinlik 0.29
```

Olasılıklar doğru (gerçek sonsal olasılık), sıralama iyi (AUC ≈ 0,93); ama 0,5 eşiği pozitiflerin çoğunu
kaçırır. Çare yeniden örnekleme değil, **eşiği maliyete göre seçmektir**
([değerlendirme ölçütleri](degerlendirme-olcutleri.md)). Yeniden örnekleme olasılıkları bozar
([kalibrasyon](kalibrasyon-ve-olasilik.md)).

| Durum | Sorun mu? | Ne yapılır |
| --- | --- | --- |
| Pozitif oranı düşük ama sayısı yüzlerce/binlerce | Genelde hayır | Olasılık + maliyetle eşik; ölçüt PR-AUC, kesinlik/duyarlılık |
| Pozitif sayısı birkaç on | Evet: öğrenecek ve ölçecek örnek yok | Önce pozitif toplayın; basit model; güven aralığı yazın |
| Ölçüt doğruluk, eşik 0,5 | Evet | Ölçütü değiştirin, eşiği seçin |
| Model ağırlıklı kayıpla/yeniden örneklemeyle eğitildi | Olasılıklar kaydı | Olasılığı düzeltin ya da yeniden kalibre edin |
| Az sınıf çok sınıflı görevde kayboluyor | Evet | Makro F1'e bakın; sınıf ağırlığı; az sınıfa veri |
| Yeniden örnekleme ayrımdan ÖNCE yapıldı | Evet: sızıntı | Ayrımdan sonra, yalnız eğitim katında yapın |

## Örnekleme yanlılığı

Veri, kullanılacağı topluluktan değil bir süzgeçten geçmiş bir alt kümeden geliyorsa model süzgeci öğrenir.
Süzgeç iki değişkene birlikte bakıyorsa, nüfusta ilişkisiz iki değişken arasında **sahte bir ilişki** doğar:

```python calistir
import random
import statistics

random.seed(5)
people = [(random.gauss(0, 1), random.gauss(0, 1)) for _ in range(5000)]  # deneyim, sınav puanı
hired = [(x, s) for x, s in people if x + s > 1.0]  # işe alım ikisinin toplamına bakıyor
r_all = statistics.correlation([x for x, _ in people], [s for _, s in people])
r_hired = statistics.correlation([x for x, _ in hired], [s for _, s in hired])
print(f"nüfusta ilişki {r_all:+.2f}, işe alınanlarda {r_hired:+.2f} ({len(hired)} kişi)")
assert abs(r_all) < 0.05 and r_hired < -0.4
```

```cikti
nüfusta ilişki -0.00, işe alınanlarda -0.62 (1166 kişi)
```

Yalnız işe alınanlarla kurulan bir model "sınav puanı yüksekse deneyim azdır" gibi nüfusta olmayan bir kural
öğrenir. Sık görülen biçimleri: yalnız onaylanan krediler, yalnız uygulamayı kullananlar, yalnız şikâyet
edenler, yalnız hayatta kalan şirketler, yalnız eski modelin gösterdiği ürünler.

## Eğitim-kullanım uyumsuzluğu

| Tür | Örnek | Belirti | Ne yapılır |
| --- | --- | --- | --- |
| Girdi dağılımı kayması (covariate shift) | Eğitim İstanbul müşterileri, kullanım bütün ülke | Yeni bölgelerde hata yüksek | Kullanım dağılımından örnek ekleyin; dilim dilim ölçün |
| Etiket oranı kayması (label shift) | Kampanya döneminde iade oranı iki katı | Olasılıklar sistematik düşük | Yakın dönem verisiyle yeniden kalibre edin; eşiği güncelleyin |
| Kavram kayması (concept drift) | Sahtecilik yöntemi değişti | Aynı özellik, farklı anlam; başarı zamanla düşüyor | Zaman ayrımıyla ölçün; düzenli yeniden eğitin |
| Özellik hesap farkı (training-serving skew) | Eğitimde gün sonu toplamı, canlıda anlık değer | Canlıda tahmin dağılımı farklı | Tek özellik kodu; canlı girdiyi kaydedip karşılaştırın ([MLOps](mlops.md)) |
| Girdi biçimi farkı | Eğitimde düzgün metin, canlıda "cok guzel urun" | Metin modelinde düşüş | Eğitime gerçek kullanım örnekleri ekleyin |

## Ne kadar veri? Öğrenme eğrisiyle karar

Kaba başlangıç noktaları (yaygın uygulama; ölçüm değildir, öğrenme eğrisiyle doğrulayın):

| İş | Başlamak için |
| --- | --- |
| Tablo verisi, ikili sınıflandırma | Belirleyici olan **pozitif sayısı**: birkaç yüz pozitif |
| Metin sınıflandırma (TF-IDF + doğrusal) | Sınıf başına 50–100+ temiz örnek |
| Zaman serisi | En az 2–3 tam mevsim döngüsü (yıllık örüntü için 2–3 yıl) |
| Sınama kümesi | ±2 puan hassasiyetle doğruluk için ~2.400 satır; ±5 puan için ~400 |

Öğrenme eğrisi (learning curve): aynı model, artan eğitim büyüklüğü, eğitim ve doğrulama başarısı. Aşağıda
dairesel sınırlı bir veri ve %10 etiket gürültüsü var; doğrusal bir model (en yakın merkez) ile esnek bir model
(15 komşulu k-NN) karşılaştırılıyor:

```python calistir
import random

random.seed(11)


def sample(n):
    rows = []
    for _ in range(n):
        x = (random.uniform(-1, 1), random.uniform(-1, 1))
        y = x[0] ** 2 + x[1] ** 2 < 0.5
        rows.append((x, y if random.random() > 0.1 else not y))  # %10 gürültü
    return rows


def centroid_model(train):
    def mean(points):
        return [sum(p[i] for p in points) / len(points) for i in (0, 1)]
    c1, c0 = mean([x for x, y in train if y]), mean([x for x, y in train if not y])
    d = lambda a, b: (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2
    return lambda x: d(x, c1) < d(x, c0)


def knn_model(train, k=15):
    def predict(x):
        near = sorted(train, key=lambda r: (r[0][0] - x[0]) ** 2 + (r[0][1] - x[1]) ** 2)[:k]
        return sum(y for _, y in near) * 2 > k
    return predict


def accuracy(model, rows):
    return sum(model(x) == y for x, y in rows) / len(rows)


valid = sample(300)
print("örnek  doğrusal eğt/doğ   k-NN eğt/doğ")
for n in (50, 200, 800):
    train = sample(n)
    lin, knn = centroid_model(train), knn_model(train)
    print(f"{n:<5d}    {accuracy(lin, train):.2f} / {accuracy(lin, valid):.2f}"
          f"       {accuracy(knn, train[:200]):.2f} / {accuracy(knn, valid):.2f}")
```

```cikti
örnek  doğrusal eğt/doğ   k-NN eğt/doğ
50       0.56 / 0.50       0.80 / 0.76
200      0.54 / 0.51       0.86 / 0.84
800      0.51 / 0.50       0.89 / 0.87
```

| Eğrinin görünüşü | Teşhis | Ne yapılır |
| --- | --- | --- |
| Eğitim ve doğrulama yakın, ikisi de düşük, n artınca düz | Yüksek yanlılık (bias): model ya da özellik yetersiz | Daha çok veri işe yaramaz; daha güçlü model ya da daha iyi özellik |
| Eğitim yüksek, doğrulama düşük, aradaki açıklık n ile kapanıyor | Yüksek varyans | Veri toplamak işe yarar; düzenlileştirme |
| Doğrulama son noktada hâlâ belirgin yükseliyor | Veri darboğaz | Eğimden kazancı kestirin, veri toplama maliyetiyle karşılaştırın |
| İkisi de etiket gürültüsü tavanına yakın | Etiket darboğaz | Etiket temizliği; daha çok veri ve model az fayda eder |

Yukarıdaki çıktıda doğrusal model 800 örnekte de ~0,5'te takılı (hep "dışarıda" demek bile ~0,6 alır):
veri eklemek boşuna. k-NN'in doğrulaması
gürültü tavanına (0,90) doğru çıkıyor. Ayrıntılı okuma: [aşırı öğrenme](asiri-ogrenme.md).

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Ham etiket uyuşması %90, model yine de kötü | Uyuşma çoğunluk sınıfından geliyor | Kappa ve az sınıfta uyuşmayı ölçün; kılavuzu düzeltin |
| Model başarısı bir değerde takılıyor, ne yapılsa çıkmıyor | Etiket gürültüsü tavanı | 100 etiketi elle denetleyin; gürültü oranını kestirin |
| Sınama sonucu iyi, kullanıcı hatalardan şikâyetçi | Sınama etiketleri eğitimle aynı sistematik yanlılıkta | Sınamayı bağımsız, dikkatli etiketçiye koydurun |
| 0,5 eşiğinde hiç pozitif yakalanmıyor | Dengesiz sınıf, eşik varsayılan | Eşiği maliyetle seçin; yeniden örneklemeye koşmayın |
| Aşırı örneklemeden sonra çapraz doğrulama parlak | Kopyalanan azınlık satırları hem eğitim hem doğrulama katında | Yeniden örneklemeyi kat içinde, ayrımdan sonra yapın |
| Model "yeni" müşteride kötü | Eğitim verisi bir süzgeçten geçmiş (örnekleme yanlılığı) | Verinin nereden geldiğini yazın; kullanım dağılımından örnek ekleyin |
| Canlıda başarı aylar içinde eriyor | Kavram ya da etiket oranı kayması | Zaman ayrımıyla ölçün; kayma izleyin; yeniden eğitim takvimi |
| "Daha çok veri" toplandı, hiçbir şey değişmedi | Yanlılık darboğazıydı | Önce öğrenme eğrisini çizin |
| Aynı metin iki farklı etiketle duruyor | Etiketçiler arası tutarsızlık ya da kopyala-yapıştır | Çelişen etiket taraması; kılavuzu güncelleyin |

## Denetim listesi

- [ ] Etiketin tanımı, kaynağı ve tarihi yazılı (veri kartı).
- [ ] En az 100 örnekte iki kişinin uyuşması ölçüldü; kappa ve az sınıftaki uyuşma raporlandı.
- [ ] Sınama kümesinin etiketleri en dikkatli şekilde konuldu ve eğitim etiketçisinden bağımsız.
- [ ] 100 rastgele etiket elle denetlendi; tahmini gürültü oranı yazıldı.
- [ ] Pozitif sayısı (oranı değil) yazıldı; ölçüt ve eşik buna göre seçildi.
- [ ] Yeniden örnekleme/ağırlık varsa yalnız eğitim katında; olasılıklar sonradan düzeltildi.
- [ ] Verinin nereden geldiği ve kimleri dışarıda bıraktığı yazıldı (örnekleme yanlılığı).
- [ ] Eğitim dağılımı ile kullanım dağılımı en az birkaç özellikte karşılaştırıldı.
- [ ] "Daha çok veri" kararından önce öğrenme eğrisi çizildi.
- [ ] Çelişen etiket ve yinelenen örnek taraması yapıldı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Model kurmadan önce şunları raporla: sınıf başına örnek sayısı, pozitif sayısı, yinelenen
  ve çelişen etiketli satırlar, rastgele 20 örnek. Yeniden örnekleme yapma; eşiği ayrı seç."
- **Modelin tipik hatası:** Dengesiz veride hemen aşırı örnekleme (SMOTE vb.) önerir ve bunu ayrımdan önce
  yapar; etiketleri sorgusuz doğru kabul eder; "daha çok veri" ya da "daha büyük model" önerisini eğri çizmeden verir.
- **Çıktıda denetleyin:** yeniden örnekleme kodu çapraz doğrulama döngüsünün içinde mi; rapor pozitif sayısını
  veriyor mu; öğrenme eğrisi en az 3 noktada çizilmiş mi; uyuşma ölçümünde kappa var mı.
- **Örnek isteyin:** modelden 20 etiketli örneği tablo hâlinde göstermesini isteyin ve kendiniz okuyun; etiket
  sorunlarının çoğu ilk 20 satırda görünür.

## İlgili

- [Problem çerçeveleme](problem-cerceveleme.md) — hedef tanımı, etiket var mı
- [Veri sızıntısı](veri-sizintisi.md) · [Ayrım ve çapraz doğrulama](ayrim-ve-capraz-dogrulama.md)
- [Aşırı öğrenme](asiri-ogrenme.md) — öğrenme eğrisi okuma · [Hata analizi](hata-analizi.md) — etiket hatası bulma
- [Kalibrasyon ve olasılık](kalibrasyon-ve-olasilik.md) — yeniden örneklemenin olasılığı bozması
- Çelişen etiket ve tek örnekli sınıf denetimi: [`ince_ayar/data/checks.py`](../../ince-ayar/ince_ayar/data/checks.py)
- Görev başına veri miktarı: [`ince-ayar/docs/NE_ZAMAN_INCE_AYAR.md`](../../ince-ayar/docs/NE_ZAMAN_INCE_AYAR.md)
- Dengesiz sınıf ve küçük sınama uyarıları: [`ml_temel/tablo/checks.py`](../../ml-temel/ml_temel/tablo/checks.py)
- Kayma ölçümü (PSI/KS): [`verihavuzu/kalite/drift.py`](../../veri/verihavuzu/kalite/drift.py)
- Veri kartı şablonu: [`veri/docs/VERI_KARTI_SABLONU.md`](../../veri/docs/VERI_KARTI_SABLONU.md)
- Temizlik yöntemi: [Veri temizleme](../70-veri/veri-temizleme-yontemi.md)
