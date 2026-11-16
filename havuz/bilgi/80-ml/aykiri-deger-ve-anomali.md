---
baslik: Aykırı değer ve anomali tespiti
ozet: Z-puanı ile ortanca tabanlı sağlam kuralların çalışan karşılaştırması, çarpık veri, mevsimsel artıkla anomali, çok değişkenli yaklaşımlar, etiket yokken değerlendirme, uyarı yorgunluğu ve eşik seçimi.
etiketler: [makine-ogrenmesi, anomali, aykiri-deger, izleme, esik, saglam-istatistik]
duzey: orta
guncellik: 2026-11
---

# Aykırı değer ve anomali tespiti

> Bu notu ne zaman okumalı: veri temizliğinde aykırı değerlere karar verirken; işlem, ölçüm ya da sistem
> metriklerinde "olağan dışı" durumları yakalayan bir uyarı kurarken; uyarılar çok fazla ya da çok az olduğunda.

## Temel fikir

Aykırı değer, verinin geri kalanına uymayan gözlemdir; **anomali** ise iş açısından ilgilenilmesi gereken olağan
dışılıktır. İkisi aynı değildir: bayram günü satışı aykırıdır ama anomali değildir; hafta içi sessiz bir düşüş
aykırı görünmeyebilir ama arızadır. Bu yüzden:

1. Anomali **beklenene göre** tanımlanır: "bu değer, bu gün, bu müşteri için olağan mı?"
2. Ölçek ve merkez **sağlam** (robust) istatistiklerle hesaplanır; aykırılar ortalamayı ve sapmayı bozar.
3. Etiket çoğu zaman yoktur; değerlendirme ve eşik seçimi **alarm bütçesi** ve insan incelemesiyle yapılır.
4. Önce **iş kuralları**: negatif tutar, gelecekteki tarih, imkânsız yaş. Bunlar istatistik değil, hatadır.

## Karar tablosu

| Durum | Yöntem | Not |
| --- | --- | --- |
| Tek sütun, simetrik dağılım | Sağlam z: \|x − ortanca\| / (1,4826·MAD) > 3,5 | Ortalama/sapma yerine ortanca/MAD; aykırılar ölçeği bozmaz |
| Tek sütun, sağa çarpık (tutar, süre) | Önce `log`, sonra sağlam z ya da IQR | Ham veride IQR normal kuyruğu aykırı sanar |
| Zamana bağlı metrik (günlük satış, istek sayısı) | Beklenenden sapma: mevsimsel taban (geçen haftaların aynı günü) ve artık üzerinde sağlam z | Sabit eşik hafta sonunu ve bayramı alarm yapar |
| Birkaç sütun birlikte (tutar + saat + ülke) | İzolasyon ormanı, sağlam Mahalanobis, yerel aykırılık (LOF) | Sütunları ölçekleyin; kategorikleri kodlayın |
| Çok boyutlu karmaşık veri (görüntü, ağ trafiği) | Özkodlayıcı yeniden kurma hatası, tek sınıflı modeller | Pahalı; önce basit yöntemlerin başarısını ölçün |
| Bilinen anomali türleri ve etiketleri var | Denetimli sınıflandırma | Etiket varsa anomali tespiti değil, dengesiz sınıflandırmadır |

## Z-puanı ↔ sağlam z: maskeleme

200 normal ölçüm (ortalama 100, sapma 5) ve 6 gerçek aykırı. Ortalama ve sapma aykırıları da içerdiği için sapma
şişer ve bazı aykırılar "normal" görünür:

```python calistir
import random
import statistics

random.seed(41)
normal = [random.gauss(100, 5) for _ in range(200)]
outliers = [130, 135, 140, 150, 300, 350]
data = normal + outliers

mean, std = statistics.fmean(data), statistics.pstdev(data)
median = statistics.median(data)
mad = statistics.median(abs(x - median) for x in data)
methods = {
    "z-puanı > 3": lambda x: abs(x - mean) / std > 3,
    "sağlam z > 3,5": lambda x: abs(x - median) / (1.4826 * mad) > 3.5,
}
print(f"ortalama {mean:.1f}, sapma {std:.1f} | ortanca {median:.1f}, 1,4826·MAD {1.4826 * mad:.1f}")
for name, flag in methods.items():
    caught = sum(flag(x) for x in outliers)
    false_alarms = sum(flag(x) for x in normal)
    print(f"{name:15s} yakalanan aykırı {caught}/6, yanlış alarm {false_alarms}")
```

```cikti
ortalama 103.1, sapma 23.4 | ortanca 100.6, 1,4826·MAD 6.0
z-puanı > 3     yakalanan aykırı 2/6, yanlış alarm 0
sağlam z > 3,5  yakalanan aykırı 6/6, yanlış alarm 0
```

MAD (ortanca mutlak sapma) aykırılardan neredeyse etkilenmez; 1,4826 çarpanı onu normal dağılımda sapmayla aynı
ölçeğe getirir. 3,5 eşiği yaygın bir başlangıçtır, kural değildir. Havuzdaki veri profilleyici de bu iki yolu
(IQR çitleri ve sağlam z) birlikte raporlar.

## Çarpık veride IQR

Tukey çitleri (Q1 − 1,5·IQR, Q3 + 1,5·IQR) simetrik veri için tasarlanmıştır. Sağa çarpık bir tutar dağılımında:

```python calistir
import math
import random
import statistics

random.seed(42)
amounts = [random.lognormvariate(5, 1) for _ in range(5000)]  # tamamen "normal" işlemler, aykırı yok


def tukey_share(values):
    q1, _, q3 = statistics.quantiles(values, n=4)
    low, high = q1 - 1.5 * (q3 - q1), q3 + 1.5 * (q3 - q1)
    return sum(v < low or v > high for v in values) / len(values)


print(f"ham tutarda 'aykırı' oranı:   %{tukey_share(amounts) * 100:.1f}")
print(f"log(tutar) üzerinde:          %{tukey_share([math.log(a) for a in amounts]) * 100:.1f}")
```

```cikti
ham tutarda 'aykırı' oranı:   %8.1
log(tutar) üzerinde:          %0.5
```

Hiç aykırı olmayan veride ham IQR yüzlerce işlemi "aykırı" ilan ediyor. Tutar, süre, sayı gibi pozitif ve çarpık
sütunlarda önce logaritma alın.

## Beklenene göre anomali: mevsimsel artık

Hafta sonları trafik %30 yüksek; iki hafta içi gününde sahte trafik sıçraması var ve değer hafta sonu düzeyine
çıkıyor. Sabit eşik ile "geçen 4 haftanın aynı gününün ortancasından sapma" karşılaştırması:

```python calistir
import random
import statistics

random.seed(43)
sales = [(130 if d % 7 in (5, 6) else 100) + random.gauss(0, 4) for d in range(84)]
sales[60] += 28  # gerçek anomali: hafta içi sıçrama
sales[74] += 28  # gerçek anomali: hafta içi sıçrama
truth = {60, 74}

center, spread = statistics.median(sales), 1.4826 * statistics.median(abs(s - statistics.median(sales)) for s in sales)
global_flags = {d for d in range(28, 84) if abs(sales[d] - center) / spread > 3.5}

residuals = {d: sales[d] - statistics.median(sales[d - 7 * k] for k in (1, 2, 3, 4)) for d in range(28, 84)}
res_mad = 1.4826 * statistics.median(abs(r) for r in residuals.values())
seasonal_flags = {d for d, r in residuals.items() if abs(r) / res_mad > 3.5}
for name, flags in (("sabit eşik", global_flags), ("mevsimsel artık", seasonal_flags)):
    print(f"{name:15s} işaretlenen {len(flags):2d} gün, gerçek anomali {len(flags & truth)}/2, yanlış alarm {len(flags - truth)}")
```

```cikti
sabit eşik      işaretlenen 11 gün, gerçek anomali 1/2, yanlış alarm 10
mevsimsel artık işaretlenen  2 gün, gerçek anomali 2/2, yanlış alarm 0
```

Sabit eşik hem hafta sonlarını alarm yapıyor hem de hafta sonu düzeyindeki hafta içi sıçramayı kaçırıyor. Beklenen değeri
[zaman serisi](zaman-serisi-tahmini.md) tabanlarıyla kurun, anomaliyi artık üzerinde arayın.

## Uyarı yorgunluğu ve eşik seçimi

Anomali nadirdir; bu yüzden iyi görünen bir dedektör bile çoğunlukla **yanlış alarm** üretir (taban oranı etkisi).
Günde 10.000 hesap denetleniyor, binde 1'i gerçekten sorunlu; normal skorlar N(0, 1), sorunlular N(4, 1):

```python calistir
from statistics import NormalDist

CHECKS, RATE, SHIFT = 10_000, 0.001, 4.0
normal, anomaly = NormalDist(0, 1), NormalDist(SHIFT, 1)
print("eşik  alarm/gün  yakalanan/gün  alarmların doğru oranı")
for threshold in (2.0, 3.0, 3.5, 4.0):
    false_alarms = CHECKS * (1 - RATE) * (1 - normal.cdf(threshold))
    caught = CHECKS * RATE * (1 - anomaly.cdf(threshold))
    print(f"{threshold:4.1f}  {false_alarms + caught:9.1f}  {caught:13.1f}  %{100 * caught / (false_alarms + caught):.0f}")
BUDGET = 15  # ekip günde en çok 15 alarm inceleyebiliyor
t = 2.0
while CHECKS * ((1 - RATE) * (1 - normal.cdf(t)) + RATE * (1 - anomaly.cdf(t))) > BUDGET:
    t += 0.05
print(f"günde en çok {BUDGET} alarm için eşik ≈ {t:.2f}")
```

```cikti
eşik  alarm/gün  yakalanan/gün  alarmların doğru oranı
 2.0      237.0            9.8  %4
 3.0       21.9            8.4  %38
 3.5        9.2            6.9  %75
 4.0        5.3            5.0  %94
günde en çok 15 alarm için eşik ≈ 3.20
```

Eşiği belirleyen soru "kaç alarma bakabiliriz?" ve "bir kaçırmanın bedeli nedir?" sorusudur, istatistik değil.
Uyarı yorgunluğuna karşı:

- **Alarm bütçesi** koyun ve eşiği ona göre ayarlayın; bütçeyi aşan günlerde en uç olanları gösterin.
- **Gruplayın:** aynı olaydan gelen 50 alarm tek kayıt olsun.
- **Süre kuralı:** tek noktalık sıçrama yerine "3 ardışık ölçüm" ya da "15 dakika boyunca" koşulu.
- **Her alarmın bir eylemi olsun:** kim bakar, ne yapar. Eylemsiz alarm kapatılır.
- **Geri bildirim toplayın:** "yararlı / yararsız" işareti; bu, ileride etiketli veri olur.

## Çok değişkenli yaklaşımlar (kavramsal)

| Yöntem | Fikir | Dikkat |
| --- | --- | --- |
| İzolasyon ormanı | Aykırılar rastgele bölmelerle çabuk yalnız kalır; kısa yol = aykırı | Ölçeklemeye duyarsız; `contamination` eşiği varsayımdır |
| Sağlam Mahalanobis uzaklığı | Ortak dağılıma (kovaryans) göre uzaklık | Kovaryansı sağlam yöntemle hesaplayın; doğrusal ilişki varsayar |
| Yerel aykırılık (LOF) | Komşularına göre seyrek bölgedeki noktalar | Ölçekleme ve k seçimi şart; büyük veride yavaş |
| Özkodlayıcı | Normali sıkıştırıp geri kurmayı öğren; kuramadığın aykırıdır | Eğitim verisi temiz olmalı; ayar ve izleme yükü |
| Tek sınıflı SVM | Normal bölgenin sınırını öğrenir | Ölçeğe ve parametreye duyarlı |

Hangisi seçilirse seçilsin: önce tek değişkenli kurallarla ve iş kurallarıyla taban kurun; çok değişkenli yöntem
ancak o tabanın kaçırdıklarını yakalıyorsa değerlidir.

## Etiket yokken değerlendirme

1. **Sentetik enjeksiyon:** gerçek veriye bilinen türde anomali ekleyin (ani artış, düşüş, düzey kayması, eksik
   veri) ve yakalanma oranını ölçün. Gerçeğe benzemeyen enjeksiyon iyimserdir.
2. **İnsan incelemesiyle precision@k:** her gün en uç k alarmı bir uzman incelesin; "gerçek sorun" oranı ölçütünüz olur.
3. **Bilinen olaylar listesi:** geçmiş arıza, dolandırıcılık ya da şikâyet kayıtları; dedektörün bunları ne zaman
   yakaladığına (ve kaçırdığına) bakın.
4. **Hacim ve kararlılık:** günlük alarm sayısı bütçe içinde mi, ayar değişince sıçrıyor mu?
5. Zamanla "yararlı" işaretleri biriktikçe sorunu denetimli sınıflandırmaya çevirin.

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Belirgin aykırılar yakalanmıyor | Ortalama/sapma aykırılarla şişti (maskeleme) | Ortanca ve MAD |
| Çarpık sütunda yüzlerce "aykırı" | Simetrik varsayımlı kural | Önce `log` |
| Her hafta sonu ve bayramda alarm | Sabit eşik; beklenen değer yok | Mevsimsel taban + artık |
| Alarmların çoğu yanlış, ekip bakmayı bıraktı | Taban oranı; eşik bütçeye göre seçilmedi | Alarm bütçesi, gruplama, süre kuralı |
| Aykırılar silindi, model kötüleşti | Aykırılar gerçek ve önemli vakalardı (büyük müşteri, kampanya) | Silmeden önce inceleyin; gerekirse kırpın ya da ayrı modelleyin |
| Eğitim verisindeki anomaliler "normal" öğrenildi | Dedektör kirli veriyle eğitildi | Bilinen anomalileri eğitimden çıkarın; sağlam yöntemler |
| Dedektör canlıda farklı davranıyor | Eşik eğitim dağılımına göre; veri kaydı | Eşiği düzenli yeniden hesaplayın; kaymayı izleyin |

## Denetim listesi

- [ ] Önce iş kuralları (imkânsız değerler) uygulandı ve ayrı raporlandı.
- [ ] Merkez ve ölçek ortanca/MAD gibi sağlam istatistiklerle hesaplandı.
- [ ] Çarpık sütunlarda logaritma sonrası kural uygulandı.
- [ ] Zamana bağlı metriklerde anomali beklenen değerden sapma olarak tanımlandı.
- [ ] Eşik, alarm bütçesi ve kaçırma maliyetine göre seçildi; günlük alarm sayısı yazıldı.
- [ ] Değerlendirme: sentetik enjeksiyon + insan incelemesiyle precision@k + bilinen olaylar.
- [ ] Her alarm türünün sahibi ve eylemi tanımlı; geri bildirim toplanıyor.
- [ ] Aykırı değerler silinmeden önce incelendi; silme kararı gerekçesiyle kaydedildi.

## Küçük modele yaptırırken

- **İsteme yazın:** "Aykırı değeri ortalama/standart sapma ile değil, ortanca ve 1,4826·MAD ile hesaplanan sağlam
  z-puanıyla (eşik 3,5) bul. Tutar gibi çarpık sütunlarda önce log al. Zamana bağlı metrikte beklenen değeri son 4
  haftanın aynı gününün ortancası say ve artık üzerinde ara. Günlük alarm sayısını raporla."
- **Modelin tipik hatası:** `abs(z) > 3`'ü ortalama/sapmayla uygular; aykırıları sormadan siler; zaman serisinde sabit
  eşik koyar; `IsolationForest(contamination=0.05)` yazıp %5'in gerçekten anomali olduğunu varsayar.
- **Çıktıda denetleyin:** merkez/ölçek hesabı; silinen satır sayısı ve gerekçesi; günlük alarm hacmi; değerlendirmede
  insan incelemesi ya da enjeksiyon olup olmadığı.

## İlgili

- [Zaman serisi tahmini](zaman-serisi-tahmini.md) — beklenen değer ve tahmin aralığı · [MLOps](mlops.md) — canlıda izleme
- [Değerlendirme ölçütleri](degerlendirme-olcutleri.md) — precision@k · [Veri ve etiket](veri-ve-etiket.md)
- İzolasyon ormanı (numpy): [`ml_temel/klasik/isolation.py`](../../ml-temel/ml_temel/klasik/isolation.py)
- IQR çitleri ve sağlam z ile sütun profili: [`verihavuzu/kalite/profile.py`](../../veri/verihavuzu/kalite/profile.py)
  (`python -m verihavuzu profil dosya.csv`)
- Etiketli anomalili örnek seri (ani artış, düşüş, düzey kayması, eksik): [`veri/ornekler/zaman_serisi/VERI_KARTI.md`](../../veri/ornekler/zaman_serisi/VERI_KARTI.md);
  sorgu tarifi: [`veri/docs/ANALIZ_TARIFLERI.md`](../../veri/docs/ANALIZ_TARIFLERI.md) (11. tarif)
