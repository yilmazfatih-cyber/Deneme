---
baslik: Derin öğrenme temelleri
ozet: Katmanlar ve etkinleştirmeler, başlatma, normalleştirme, artık bağlantı, SGD ve Adam ailesi, öğrenme oranı çizelgesi, yığın boyutu ve düzenlileştirme için karar tabloları ve çalışan sezgiler.
etiketler: [derin-ogrenme, sinir-agi, optimizasyon, baslatma, normallestirme, ogrenme-orani]
duzey: orta
guncellik: 2026-11
---

# Derin öğrenme temelleri

> Bu notu ne zaman okumalı: bir sinir ağı kurarken ya da ince ayarlarken; öğrenme oranı, en iyileyici,
> yığın boyutu, normalleştirme seçerken; "neden öğrenmiyor?" sorusundan önce temel ayarları gözden geçirirken.

## Temel fikir

Sinir ağı, basit fonksiyonların (doğrusal katman + doğrusal olmayan etkinleştirme) üst üste dizilmesidir. Eğitim:
kaybın her parametreye göre gradyanı geri yayılımla (backpropagation) hesaplanır, en iyileyici (optimizer)
parametreleri gradyanın tersi yönünde küçük adımlarla günceller.

Derin ağın eğitilebilmesi için sinyalin katmanlar boyunca **ne sönmesi ne patlaması** gerekir. Başlatma,
normalleştirme ve artık bağlantı bunun içindir. Öğrenme oranı ise en önemli tek ayardır: yanlışsa geri kalan hiçbir
ayar kurtarmaz.

Tablo verisinde sinir ağı çoğu zaman gradyan artırmanın gerisindedir ([model seçimi](model-secimi.md)); derin
öğrenmenin yeri metin, görüntü, ses ve önceden eğitilmiş modelden aktarımdır.

## Katman, etkinleştirme, çıkış

| Görev | Çıkış katmanı | Kayıp | Dikkat |
| --- | --- | --- | --- |
| Regresyon | 1 doğrusal birim | Ortalama kare hata ya da Huber (aykırıya dayanıklı) | Hedefi ölçeklemek eğitimi kolaylaştırır |
| İkili sınıflandırma | 1 logit | İkili çapraz entropi, **logit alan** sürümü | Önce sigmoid uygulayıp sonra kayıp almak sayısal olarak kırılgandır |
| Çok sınıflı | K logit | Çapraz entropi (logit alır) | Kayıptan önce softmax uygulamayın; kütüphane kendisi yapar |
| Çok etiketli | K logit | K bağımsız ikili çapraz entropi | Softmax değil, her etiket ayrı sigmoid |

| Etkinleştirme | Nerede |
| --- | --- |
| ReLU | Çok katmanlı algılayıcı ve evrişimli ağlarda varsayılan |
| GELU / SiLU | Transformer bloklarının ileri besleme katmanı |
| tanh / sigmoid | Kapılar ve çıkış; gizli katmanda derin ağı yavaşlatır (doygunluk) |

## Başlatma: sinyal sönmesin, patlamasın

20 katmanlı, 32 genişlikli bir ReLU ağında ağırlıkların başlangıç ölçeği değişiyor; katman çıkışlarının
büyüklüğüne (RMS) bakın:

```python calistir
import math
import random

random.seed(24)
WIDTH, DEPTH = 32, 20
inputs = [[random.gauss(0, 1) for _ in range(WIDTH)] for _ in range(8)]


def activations(scale):
    h, seen = inputs, {}
    for layer in range(1, DEPTH + 1):
        W = [[random.gauss(0, scale) for _ in range(WIDTH)] for _ in range(WIDTH)]
        h = [[max(0.0, sum(a * w for a, w in zip(row, column))) for column in zip(*W)] for row in h]
        if layer in (1, 10, 20):
            values = [v for row in h for v in row]
            seen[layer] = math.sqrt(sum(v * v for v in values) / len(values))
    return seen


he = math.sqrt(2 / WIDTH)  # He (Kaiming) başlatma: ReLU için
for name, scale in (("küçük 0.10", 0.10), (f"He {he:.2f}", he), ("büyük 0.40", 0.40)):
    seen = activations(scale)
    print(f"{name:10s} RMS: 1. katman {seen[1]:.2e}, 10. {seen[10]:.2e}, 20. {seen[20]:.2e}")
```

```cikti
küçük 0.10 RMS: 1. katman 4.53e-01, 10. 1.37e-04, 20. 5.55e-09
He 0.25    RMS: 1. katman 1.13e+00, 10. 7.28e-01, 20. 3.95e-01
büyük 0.40 RMS: 1. katman 1.68e+00, 10. 9.91e+01, 20. 3.61e+03
```

| Başlatma | Ne zaman |
| --- | --- |
| He (Kaiming): sapma √(2 / giriş sayısı) | ReLU ailesi |
| Xavier (Glorot): sapma √(2 / (giriş + çıkış)) | tanh, sigmoid |
| Küçük normal (ör. 0,02) + artık yola yazan katmanları ayrıca küçültmek | Transformer'lar |
| Yanlılık (bias) sıfır | Hemen her yerde |

Kütüphaneler katmanları makul varsayılanlarla başlatır; elle yazılan katmanlarda ya da özel yapılarda bu tablo
önem kazanır.

## Normalleştirme ve artık bağlantı

| Normalleştirme | Neyi normalleştirir | Nerede | Dikkat |
| --- | --- | --- | --- |
| Yığın normu (BatchNorm) | Yığındaki örnekler boyunca | Evrişimli ağlar, büyük yığın | Eğitim ve değerlendirme kipinde farklı davranır; küçük yığında kararsız |
| Katman normu (LayerNorm) | Her örneğin kendi özellikleri | Transformer, tekrarlayan ağlar | Yığın boyutundan bağımsız |
| RMSNorm | LayerNorm'un ortalama çıkarmayan, daha ucuz hâli | Yeni dil modelleri | — |
| Grup normu (GroupNorm) | Kanal grupları | Küçük yığınlı görüntü işleri | — |

Artık bağlantı (residual): `h ← h + f(h)`. Gradyan, toplama yolundan doğrudan geçer; ağ derinleştikçe sönmez.
Elle hesaplanmış bir örnek: aynı 50 katman, artık bağlantılı ve bağlantısız; girdiye ulaşan gradyan:

```python calistir
import math

W = 0.5  # her katmanın ağırlığı


def input_gradient(depth, residual):
    h, grad = 0.3, 1.0
    for _ in range(depth):
        local = W * (1 - math.tanh(W * h) ** 2)  # tanh(W·h) türevi
        grad *= (1 + local) if residual else local
        h = h + math.tanh(W * h) if residual else math.tanh(W * h)
    return grad


for depth in (10, 30, 50):
    print(f"{depth} katman: düz {input_gradient(depth, False):.1e}, artık {input_gradient(depth, True):.1e}")
```

```cikti
10 katman: düz 9.5e-04, artık 8.2e+00
30 katman: düz 9.0e-10, artık 8.3e+00
50 katman: düz 8.6e-16, artık 8.3e+00
```

Düz ağda gradyan katman başına yarıya iniyor ve 50 katmanda kayboluyor; artık yolda en az 1 ile çarpılıyor.
Transformer'larda "ön-norm" düzeni (`h + f(norm(h))`) derin modellerde daha kararlıdır.

## En iyileyici: SGD, momentum, Adam

Eğri bir vadide (bir yönde 100 kat dik) `(1, 1)` noktasından çıkıp kaybı 0,001'in altına indirme süresi:

```python calistir
import math


def run(kind, lr, steps=2000):
    x = y = 1.0
    vx = vy = mx = my = sx = sy = 0.0
    for t in range(1, steps + 1):
        gx, gy = 100 * x, y  # f = 0,5·(100·x² + y²)
        if kind == "SGD":
            x, y = x - lr * gx, y - lr * gy
        elif kind == "momentum":
            vx, vy = 0.9 * vx + gx, 0.9 * vy + gy
            x, y = x - lr * vx, y - lr * vy
        else:  # Adam: her yön kendi gradyan büyüklüğüne bölünür
            mx, my = 0.9 * mx + 0.1 * gx, 0.9 * my + 0.1 * gy
            sx, sy = 0.999 * sx + 0.001 * gx * gx, 0.999 * sy + 0.001 * gy * gy
            c1, c2 = 1 - 0.9**t, 1 - 0.999**t
            x -= lr * (mx / c1) / (math.sqrt(sx / c2) + 1e-8)
            y -= lr * (my / c1) / (math.sqrt(sy / c2) + 1e-8)
        f = 0.5 * (100 * x * x + y * y)
        if f > 1e6:
            return f"ıraksadı ({t}. adım)"
        if f < 1e-3:
            return f"{t} adım"
    return "bitmedi"


for kind, lr in (("SGD", 0.019), ("SGD", 0.021), ("momentum", 0.005), ("Adam", 0.05), ("Adam", 0.01)):
    print(f"{kind:9s} öğrenme oranı {lr:<6} → {run(kind, lr)}")
```

```cikti
SGD       öğrenme oranı 0.019  → 162 adım
SGD       öğrenme oranı 0.021  → ıraksadı (52. adım)
momentum  öğrenme oranı 0.005  → 61 adım
Adam      öğrenme oranı 0.05   → 24 adım
Adam      öğrenme oranı 0.01   → 235 adım
```

- SGD'nin öğrenme oranı **en dik yön** tarafından sınırlanır (burada 2/100'ü geçince ıraksıyor); yatık yönde
  bu küçük adım çok yavaştır. Momentum hızı biriktirerek yatık yönde ilerler.
- Adam her parametreyi kendi gradyan büyüklüğüyle ölçekler; kötü koşullu problemlerde hızlıdır. Ama Adam'ın da
  öğrenme oranı yanlışsa (0,01) yavaştır: "Adam ayar istemez" yanlıştır.
- **AdamW**, ağırlık çürümesini gradyandan ayırır; transformer eğitimi ve ince ayarında varsayılandır. Ağırlık
  çürümesi genelde yalnız matrislere uygulanır, norm kazançlarına ve yanlılıklara uygulanmaz.

| En iyileyici | Ne zaman | Yaygın başlangıç öğrenme oranı (doğrulayın) |
| --- | --- | --- |
| AdamW | Transformer, çoğu yeni ağ, ince ayar | Küçük ağlar 1e-3; transformer ön eğitimi 3e-4 civarı; tam ince ayar 1e-5–5e-5; LoRA 1e-4–3e-4 |
| SGD + momentum (0,9) | Görüntüde iyi ayarlanmış tarifler | 0,1 civarı (yığın boyutuna göre) + çizelge |
| Adam (ağırlık çürümesiz) | Hızlı denemeler | 1e-3 |

## Öğrenme oranı çizelgesi

Isınma (warmup) başta Adam'ın istatistikleri oturana kadar adımı küçük tutar; kosinüs ya da doğrusal azalma
sonda ince ayar yapar:

```python calistir
import math


def lr_at(step, peak=3e-4, warmup=100, total=1000, min_ratio=0.1):
    if step < warmup:
        return peak * (step + 1) / warmup
    progress = (step - warmup) / max(1, total - warmup)
    return peak * (min_ratio + (1 - min_ratio) * 0.5 * (1 + math.cos(math.pi * progress)))


print("  ".join(f"{s}:{lr_at(s):.1e}" for s in (0, 50, 99, 100, 500, 999)))
```

```cikti
0:3.0e-06  50:1.5e-04  99:3.0e-04  100:3.0e-04  500:1.9e-04  999:3.0e-05
```

Öğrenme oranını seçmenin hızlı yolu: aynı kısa eğitimi (birkaç yüz adım) 3'er kat aralıklı birkaç oranla (1e-4,
3e-4, 1e-3, 3e-3) koşun; kaybı en hızlı ve kararlı indireni alın, sonra tam eğitimi o oranla yapın.

## Yığın boyutu

Küçük yığının gradyanı gürültülüdür; gürültü yığın boyutunun karekökü oranında azalır:

```python calistir
import math
import random
import statistics

random.seed(25)
data = [(x, 2 * x + random.gauss(0, 1)) for x in (random.gauss(0, 1) for _ in range(10_000))]
per_sample = [-2 * x * y for x, y in data]  # w = 0 noktasında kare hatanın gradyanı
for batch in (1, 8, 64, 512):
    estimates = [statistics.fmean(random.sample(per_sample, batch)) for _ in range(400)]
    print(f"yığın {batch:<4d} gradyan tahmini sapması {statistics.stdev(estimates):.3f}")
```

```cikti
yığın 1    gradyan tahmini sapması 5.748
yığın 8    gradyan tahmini sapması 1.977
yığın 64   gradyan tahmini sapması 0.736
yığın 512  gradyan tahmini sapması 0.239
```

| Karar | Kural |
| --- | --- |
| Yığın boyutunu büyüttünüz | Öğrenme oranını da artırmanız gerekebilir (kabaca orantılı, bir noktaya kadar); ısınmayı koruyun |
| Bellek yetmiyor | Yığını küçültüp gradyan biriktirin: etkin yığın = yığın × biriktirme adımı ([donanım](hesaplama-ve-donanim.md)) |
| Çok büyük yığın, doğrulama kötüleşti | Gürültünün düzenlileştirici etkisi kayboldu; oranı ve ısınmayı yeniden ayarlayın |
| Yığın normu kullanıyorsunuz | Yığın en az birkaç on örnek olsun; değilse katman ya da grup normu |

## Düzenlileştirme

| Yöntem | Başlangıç (yaygın) | Not |
| --- | --- | --- |
| Ağırlık çürümesi (AdamW) | 0,01–0,1 | Matrislere; norm ve yanlılığa değil |
| Bırakma (dropout) | Transformer 0–0,1; MLP 0,2–0,5 | Değerlendirmede kapalı olmalı (`eval` kipi) |
| Veri artırma | Göreve özgü | Yalnız eğitimde; etiketi değiştirmeyen dönüşümler |
| Etiket yumuşatma | 0,1 | Aşırı güveni azaltır; kalibrasyonu etkiler |
| Erken durdurma | Sabır 3–10 değerlendirme | En iyi denetim noktasını saklayın |

## Neden çalışıyor? (Sezgi)

- **Bileşim:** her katman bir öncekinin çıktısını yeniden düzenler; derin ağ, işe yarayan ara temsilleri kendisi
  öğrenir (elle özellik çıkarmak yerine).
- **Yapısal varsayım:** evrişim "yakındaki pikseller ilişkili, örüntü her yerde aynı" der; dikkat "hangi öğeye
  bakılacağını içerik belirler" der. Doğru varsayım veriyi verimli kullanır.
- **Aşırı parametre:** gereğinden çok parametre, en iyilemeyi kolaylaştırır; SGD'nin gürültüsü ve erken durdurma
  da örtük düzenlileştirme yapar. Bunun tam kuramı yoktur; pratik kurallar deneyle bulunmuştur.

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Kayıp yavaş iniyor, çıktılar hep birbirine benzer | Kayıptan önce softmax uygulandı (çift softmax) | Kayba ham logit verin |
| İkili sınıflamada kayıp `nan` | Sigmoid sonrası `log(0)` | Logit alan ikili kayıp |
| Doğrulama sonucu her çalıştırmada oynuyor, eğitimden kötü | Değerlendirmede bırakma/yığın normu eğitim kipinde | `model.eval()` ve gradyansız değerlendirme |
| Kayıp hiç inmiyor | Öğrenme oranı çok düşük ya da çok yüksek; girdiler ölçeksiz | Oran taraması; girdileri standartlaştırın ([hata ayıklama](egitim-hata-ayiklama.md)) |
| Gradyanlar her adımda büyüyor | Gradyanlar sıfırlanmıyor (birikiyor) | Her adımda `zero_grad` |
| Küçük yığınla yığın normu kararsız | Yığın istatistikleri gürültülü | Katman ya da grup normu |
| İnce ayar sonrası genel yetenek kayboldu | Öğrenme oranı/dönem fazla (felaket unutma) | Oranı düşürün, dönemi azaltın, LoRA |
| fp16'da kayıp `inf` | Sayısal taşma | Kayıp ölçekleme ya da bf16 |
| Ağırlık çürümesi açık, model zayıf | Norm kazançları ve yanlılıklar da çürütülüyor | Onları parametre grubundan çıkarın |

## Denetim listesi

- [ ] Çıkış katmanı ve kayıp görevle uyumlu; kayba ham logit veriliyor.
- [ ] Girdiler ölçeklendi; hedef regresyonda gerekiyorsa ölçeklendi.
- [ ] Öğrenme oranı kısa bir taramayla seçildi; ısınma + azalma çizelgesi var.
- [ ] AdamW kullanılıyorsa ağırlık çürümesi norm ve yanlılıklara uygulanmıyor.
- [ ] Değerlendirme `eval` kipinde ve gradyansız yapılıyor.
- [ ] Gradyan kırpma (ör. norm 1,0) açık; gradyan normu günlüğe yazılıyor.
- [ ] Eğitim ve doğrulama kaybı birlikte izleniyor; en iyi denetim noktası saklanıyor.
- [ ] Tohum sabit; aynı ayar iki kez koşulunca aynı eğri çıkıyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "AdamW kullan; ağırlık çürümesini yalnız 2 boyutlu ağırlıklara uygula. Öğrenme oranı için
  1e-4, 3e-4, 1e-3 ile 200 adımlık kısa deneme yap ve kayıp eğrilerini karşılaştır. Isınma + kosinüs çizelgesi,
  gradyan kırpma 1,0. Doğrulamayı `model.eval()` ve `torch.no_grad()` içinde yap."
- **Modelin tipik hatası:** `CrossEntropyLoss`'tan önce `softmax` koyar; `model.eval()`'i unutur; öğrenme oranını
  tek bir değerde bırakır; ağırlık çürümesini her parametreye uygular; eğitim kaybını yazıp doğrulamayı yazmaz.
- **Çıktıda denetleyin:** kayıp fonksiyonuna ne verildiği (logit mi olasılık mı); `eval`/`train` kip geçişleri;
  `optimizer.zero_grad()` yeri; parametre gruplarının ayrımı; günlükte öğrenme oranı ve gradyan normu var mı.

## İlgili

- Matematik: [Geri yayılım](../92-matematik/geri-yayilim-matematigi.md), [Optimizasyon](../92-matematik/optimizasyon.md)
- [Eğitim hata ayıklama](egitim-hata-ayiklama.md) · [Transformer](transformer.md) · [Aşırı öğrenme](asiri-ogrenme.md) ·
  [Hesaplama ve donanım](hesaplama-ve-donanim.md)
- Sıfırdan otomatik türev ve katmanlar: [`ml_temel/autograd/tensor.py`](../../ml-temel/ml_temel/autograd/tensor.py),
  [`nn/layers.py`](../../ml-temel/ml_temel/nn/layers.py), başlatma: [`nn/init.py`](../../ml-temel/ml_temel/nn/init.py),
  normlar: [`nn/norm.py`](../../ml-temel/ml_temel/nn/norm.py)
- En iyileyiciler ve çizelge: [`ml_temel/optim/adam.py`](../../ml-temel/ml_temel/optim/adam.py),
  [`schedule.py`](../../ml-temel/ml_temel/optim/schedule.py), [`clip.py`](../../ml-temel/ml_temel/optim/clip.py)
- Çalışan örnekler: [`01_mlp_siniflandirma.py`](../../ml-temel/ornekler/01_mlp_siniflandirma.py),
  [`06_sekil_evrisim.py`](../../ml-temel/ornekler/06_sekil_evrisim.py)
- PyTorch'ta AdamW + ısınma + kosinüs ve parametre grupları: [`dil_modeli/optim.py`](../../dil-modeli/dil_modeli/optim.py),
  matematiği: [`dil-modeli/docs/MIMARI.md`](../../dil-modeli/docs/MIMARI.md)
- İnce ayar başlangıç değerleri: [`ince-ayar/docs/HIPERPARAMETRE.md`](../../ince-ayar/docs/HIPERPARAMETRE.md)
