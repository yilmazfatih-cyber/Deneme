---
baslik: Optimizasyon
ozet: Gradyan inişi ve öğrenme oranının etkisi (ıraksama, salınım), momentum ve Adam sezgisi, dışbükeylik ve yerel minimum, Lagrange ile kısıtlı en iyileme (gölge fiyat), doğrusal programlamanın ne zaman gerektiği.
etiketler: [optimizasyon, gradyan-inisi, ogrenme-orani, adam, dogrusal-programlama, lagrange]
duzey: orta
guncellik: 2026-11
---

# Optimizasyon

> Bu notu ne zaman okumalı: bir model eğitilirken kayıp düşmediğinde, salındığında ya da `nan` olduğunda;
> öğrenme oranı ve optimizer seçerken; "bütçeyi kanallara nasıl dağıtalım", "hangi üründen kaç adet
> üretelim" gibi kısıtlı bir karar problemini çözmeden önce.

## Temel fikir

- Optimizasyon (en iyileme): bir **amaç fonksiyonunu** (kayıp, maliyet, kâr) **kısıtlar** altında en küçüğe ya
  da en büyüğe getiren girdiyi bulmak. İlk iş problemi bu üç parçayla yazmaktır: değişkenler, amaç, kısıtlar.
- **Gradyan inişi**: gradyanın tersi yönünde küçük adımlar: `x ← x − η·∇f(x)`. Adım boyu `η` (öğrenme oranı)
  her şeydir: büyükse salınır ya da ıraksar, küçükse sürünür.
- **Momentum** geçmiş adımları biriktirir: dar vadilerde salınımı söndürür, düz yerlerde hızlanır. **Adam** her
  parametrenin adımını kendi gradyan büyüklüğüne bölerek ölçekten bağımsız adım atar.
- **Dışbükey** (convex) problemde her yerel minimum genel minimumdur; dışbükey olmayanda (sinir ağları)
  başlangıç noktası sonucu belirler.
- **Kısıtlı** problemde en iyi noktada amaç ile kısıtın gradyanları paraleldir (Lagrange). Çarpan `λ`, kısıtı bir
  birim gevşetmenin değeridir: **gölge fiyat**.
- Amaç ve kısıtlar **doğrusalsa** problem doğrusal programlamadır (LP); çözücüye verilir, elle aranmaz.

## Karar tablosu

| Problem                                                       | Yöntem                                                | Neden                                                 |
| ------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| Türevlenebilir, dışbükey, az parametre (lojistik regresyon)   | Kütüphane çözücüsü: L-BFGS, Newton                    | Eğriliği kullanır; öğrenme oranı ayarı gerekmez      |
| Sinir ağı, çok parametre, gürültülü küçük yığın gradyanı      | Adam/AdamW (varsayılan), ya da SGD + momentum         | Ölçeğe dayanıklı; SGD + momentum iyi ayarlanırsa genelleyebilir |
| Türev yok ya da gürültülü, birkaç parametre (hiperparametre)  | Rastgele arama, ızgara, Bayesçi optimizasyon          | Her deneme pahalı; gradyan yok                       |
| Doğrusal amaç + doğrusal kısıtlar (üretim, karışım, taşıma)   | Doğrusal programlama çözücüsü                         | Kesin en iyiyi hızla bulur                           |
| Tam sayı kararlar (aç/kapa, kaç adet, hangi depo)             | Tam sayılı programlama (MILP) çözücüsü                | LP çözümünü yuvarlamak yanlış ya da geçersiz         |
| Rota, çizelge, atama (kombinatoryal)                          | Sezgisel arama (yerel arama, tavlama) ya da MILP      | Durum sayısı patlar ([kombinatorik](kombinatorik.md)) |
| Tek değişkenli kök ya da en küçük                             | İkiye bölme, Newton ([sayısal yöntemler](sayisal-yontemler.md)) | Basit ve garantili                         |

## Gradyan inişi ve öğrenme oranı

`f(x) = (x − 3)² + 1` için türev `2(x − 3)`. Her adımda hata `(1 − 2η)` ile çarpılır: `0 < η < 1` ise yakınsar,
`η = 0,5` tek adımda varır, `η = 1` sonsuza dek salınır, `η > 1` ıraksar. Genel kural: eğrilik (ikinci türev)
`L` ise **`η < 2/L`** gerekir, `η ≈ 1/L` en hızlısıdır.

```python calistir
def descend(lr, steps=60, x=0.0):
    path = [x]
    for _ in range(steps):
        x -= lr * 2 * (x - 3)  # x ← x − η·f'(x)
        path.append(x)
    return path


smooth = descend(0.1)
assert abs(smooth[-1] - 3) < 1e-4 and all(a < b for a, b in zip(smooth, smooth[1:]))  # tekdüze yaklaşır
assert descend(0.5)[1] == 3.0  # η = 1/L: tek adımda
zigzag = descend(0.9)
assert abs(zigzag[-1] - 3) < 1e-4 and zigzag[1] > 3 > zigzag[2]  # hedefin iki yanında salınarak yakınsar
assert set(descend(1.0)[-2:]) == {0.0, 6.0}  # 0 ile 6 arasında sonsuz salınım
assert abs(descend(1.1)[-1]) > 1e4  # ıraksama: kayıp büyür, sonunda inf/nan
print("tamam")
```

Belirtiden tanı: kayıp düzgün ama yavaş düşüyorsa `η` küçüktür; testere dişi gibi iniyorsa büyüğe yakındır;
artıyor ya da `nan` oluyorsa büyüktür. Yeni bir problemde `η`'yi 10'ar kat değiştirerek (1e-5 … 1e-1) kısa
denemeler yapın; ıraksamanın başladığı değerin 3–10 kat altını seçin.

## Dar vadi: momentum neden işe yarar

`f(x, y) = ½(x² + 50·y²)`: `y` yönünde dik, `x` yönünde düz bir vadi. `η`, dik yöne göre (`< 2/50`) seçilmek
zorundadır; düz yönde ilerleme o yüzden sürünür.

```python calistir
import math


def steps_to_converge(lr, beta, tol=1e-6, limit=10_000):
    """Ağır top (heavy ball) momentumu; beta=0 düz gradyan inişidir."""
    x, y, vx, vy = 1.0, 1.0, 0.0, 0.0
    for step in range(1, limit + 1):
        gx, gy = x, 50 * y  # gradyan
        vx, vy = beta * vx - lr * gx, beta * vy - lr * gy
        x, y = x + vx, y + vy
        if math.hypot(x, y) < tol:
            return step
    return None  # yakınsamadı


plain = steps_to_converge(0.035, 0.0)
assert steps_to_converge(0.041, 0.0) is None  # η > 2/50: dik yönde ıraksar
with_momentum = steps_to_converge(0.035, 0.7)
print("düz gradyan inişi:", plain, "adım | momentum (β=0,7):", with_momentum, "adım")
assert with_momentum < plain / 3
```

Aynı sorunun ikinci çaresi **ölçeklemedir**: özellikleri aynı ölçeğe getirmek vadiyi yuvarlaklaştırır. Doğrusal
modellerde standartlaştırma bu yüzden yakınsamayı hızlandırır.

## Adam: ölçekten bağımsız adım

Adam, gradyanın üstel ortalamasını (`m`, yön) karesinin üstel ortalamasına (`v`, ölçek) böler: adım `≈ η·m/√v`.
Sonuç: gradyan 1 000 kat büyüse de adım aynı kalır.

```python calistir
import math


def adam_first_step(g, lr=1e-3, b1=0.9, b2=0.999, eps=1e-8):
    m, v = (1 - b1) * g, (1 - b2) * g * g
    m_hat, v_hat = m / (1 - b1), v / (1 - b2)  # sapma düzeltmesi: ilk adımlarda m ve v sıfıra yanlı
    return lr * m_hat / (math.sqrt(v_hat) + eps)


for g in (0.0005, 0.5, 500.0):
    assert math.isclose(adam_first_step(g), 1e-3, rel_tol=1e-4)  # adım ≈ η, gradyanın büyüklüğünden bağımsız
    # düz gradyan inişinde adım η·g: 5e-7 ile 0,5 arasında, 1 000 000 kat fark
print("tamam")
```

Pratik sonuçlar: Adam'da `η` "parametre başına en büyük adım" gibi düşünülür (çoğu iş için 1e-4 – 1e-3
civarında başlanır); öğrenme oranı ısınma (warmup) ve kosinüs düşüşüyle birlikte kullanılır. Ağırlık küçültme için
**AdamW** kullanın: Adam'a eklenen L2 cezası ölçeklemeyle bozulur, AdamW bunu gradyandan ayrı uygular.

## Dışbükeylik ve yerel minimum

```python calistir
def f(x):
    return x**4 - 3 * x**2 + x


def df(x):
    return 4 * x**3 - 6 * x + 1


def descend(x, lr=0.01, steps=2000):
    for _ in range(steps):
        x -= lr * df(x)
    return x


# Dışbükeylik ihlali: iki noktanın ortası, değerlerin ortalamasından yukarıda
a, b = -1.3, 1.1
assert f((a + b) / 2) > (f(a) + f(b)) / 2

ends = {start: descend(start) for start in (2.0, 0.5, -2.0)}
assert round(ends[2.0], 3) == 1.131 and round(ends[0.5], 3) == 1.131  # yerel minimum (f ≈ −1,07)
assert round(ends[-2.0], 3) == -1.301  # genel minimum (f ≈ −3,51)
best = min(ends.values(), key=f)  # çok başlangıç: en iyisini seç
assert round(f(best), 2) == -3.51
print("tamam")
```

Sinir ağlarında yerel minimumdan çok **eyer noktaları** ve düz bölgeler sorun çıkarır; momentum ve küçük yığın
gürültüsü bunlardan çıkmaya yardım eder. Klasik dışbükey olmayan problemlerde (k-means, kümeleme, ayrık
seçim) birkaç farklı başlangıçla çalıştırıp en iyisini almak ucuz ve etkilidir.

## Kısıtlı en iyileme: Lagrange ve gölge fiyat

Reklam bütçesi 100 bin TL; iki kanalın getirisi azalan verimle `3·√x` ve `√y`. Nasıl bölünmeli? Lagrange
koşulu: en iyi noktada iki kanalın **marjinal getirisi eşittir** (aksi hâlde parayı yüksek olana kaydırmak
kazandırırdı).

```python calistir
import math


def total_return(x, budget):
    return 3 * math.sqrt(x) + math.sqrt(budget - x)


def best_split(budget, steps=100_000):
    return max((total_return(budget * i / steps, budget), budget * i / steps) for i in range(steps + 1))


value, x = best_split(100.0)
assert round(x, 3) == 90.0  # kanal 1'e 90, kanal 2'ye 10
marginal_1, marginal_2 = 3 / (2 * math.sqrt(x)), 1 / (2 * math.sqrt(100 - x))
assert math.isclose(marginal_1, marginal_2, rel_tol=1e-6)  # ∇f, ∇g'ye paralel: marjinaller eşit

# λ (çarpan) = bütçe bir birim artınca en iyi değerin artışı: gölge fiyat
gain = best_split(101.0)[0] - value
assert abs(gain - marginal_1) < 0.001  # ek 1 bin TL ≈ 0,158 birim getiri
print("tamam")
```

Gölge fiyat karar verdirir: ek bütçenin getirisi (λ) maliyetinden büyükse kısıt gevşetilmeye değer. Çözücüler
(LP dahil) bu değeri "dual değer" adıyla verir; çıktıda ona bakın.

## Doğrusal programlama ne zaman

Amaç ve kısıtlar doğrusalsa en iyi nokta, kısıtların oluşturduğu çokgenin bir **köşesindedir**. İki
değişkende köşeleri elle bulabiliriz; gerçek problemde çözücü kullanılır.

```python calistir
from fractions import Fraction
from itertools import combinations


def lp_vertices(constraints):
    """a·x + b·y <= c kısıtlarının bütün uygun köşeleri (iki doğrunun kesişimi)."""
    points = set()
    for ((a1, b1), c1), ((a2, b2), c2) in combinations(constraints, 2):
        det = a1 * b2 - b1 * a2
        if det == 0:
            continue
        x, y = Fraction(c1 * b2 - b1 * c2, det), Fraction(a1 * c2 - c1 * a2, det)
        if all(a * x + b * y <= c for (a, b), c in constraints):
            points.add((x, y))
    return points


# Ürün A kârı 40, B kârı 30. İşçilik: A + B <= 40 saat; makine: 2A + B <= 60 saat; adetler >= 0
plant = [((1, 1), 40), ((2, 1), 60), ((-1, 0), 0), ((0, -1), 0)]
profit, best = max((40 * x + 30 * y, (x, y)) for x, y in lp_vertices(plant))
assert best == (20, 20) and profit == 1400

# Tam sayı gerekiyorsa LP çözümünü yuvarlamak yanlıştır
cons = [((6, 4), 24), ((1, 2), 6), ((-1, 0), 0), ((0, -1), 0)]
lp_value, lp_point = max((5 * x + 4 * y, (x, y)) for x, y in lp_vertices(cons))
assert lp_point == (3, Fraction(3, 2)) and lp_value == 21
assert 6 * 3 + 4 * 2 > 24  # (3, 2)'ye yuvarlamak kısıtı çiğner; (3, 1) değeri 19
integer_best = max(
    (5 * x + 4 * y, (x, y)) for x in range(10) for y in range(10) if 6 * x + 4 * y <= 24 and x + 2 * y <= 6
)
assert integer_best == (20, (4, 0))  # tam sayı en iyisi bambaşka bir köşede
print("tamam")
```

LP'ye uygun işler: üretim karması, karışım (yem, yakıt), taşıma ve atama, vardiya planı. Doğrusal olmayan
amaç ya da tam sayı karar varsa uygun çözücü sınıfı seçilir (MILP). Python'da yaygın seçenekler `scipy.optimize`
(`linprog`, `milp`), PuLP ve OR-Tools'tur; sürüm ve arayüzü kurulu paketten doğrulayın.

## Tuzaklar

| Belirti                                                     | Neden                                                          | Çözüm                                                               |
| ----------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------- |
| Kayıp artıyor ya da `nan`                                   | Öğrenme oranı büyük (`η > 2/L`); patlayan gradyan              | `η`'yi 3–10 kat küçültün; gradyan kırpma; ısınma                     |
| Kayıp testere dişi gibi iniyor                              | `η` sınıra yakın; dar vadi                                     | `η`'yi biraz küçültün; momentum; özellik ölçekleme                  |
| Kayıp çok yavaş düşüyor                                     | `η` küçük ya da özellikler ölçeksiz                            | Öğrenme oranı taraması; standartlaştırma                            |
| Kayıp hiç düşmüyor (sabit)                                  | Gradyan sıfır/kopuk, yanlış işaret, veri-etiket kayması        | Önce tek küçük yığını ezberletin; gradyanları yazdırın              |
| Her çalıştırmada başka sonuç                                | Dışbükey olmayan amaç; başlangıca bağlı                        | Tohumu sabitleyin; birkaç başlangıçla en iyisini alın               |
| Adam ile ağırlık küçültme beklenen etkiyi vermiyor          | Adam'a L2 eklemek uyarlamalı ölçekle bozulur                   | AdamW                                                               |
| Eğitimi sürdürünce kayıp sıçradı                            | Optimizer durumu (`m`, `v`, adım sayısı) kaydedilmemiş          | Ağırlıklarla birlikte optimizer durumunu da kaydedin                |
| LP çözümü yuvarlanınca kısıt çiğnendi ya da kâr düştü        | Tam sayı problemi LP gibi çözülmüş                             | MILP çözücüsü                                                       |
| Elle "deneme yanılma" ile bulunan plan çözücüden kötü        | Köşe yerine iç nokta; kısıt etkileşimi gözden kaçtı            | Problemi değişken/amaç/kısıt diye yazıp çözücüye verin              |

## Denetim listesi

- [ ] Problem yazılı: değişkenler, amaç (en küçük mü en büyük mü), kısıtlar, birimler.
- [ ] Öğrenme oranı bir taramayla seçilmiş; kayıp eğrisi kaydedilmiş ve incelenmiş.
- [ ] Özellikler ölçeklenmiş; gerekiyorsa momentum/Adam(W) kullanılmış.
- [ ] Durma ölçütü var: gradyan normu ya da kayıptaki göreli değişim + adım sınırı.
- [ ] Dışbükey olmayan problemde birden çok tohum/başlangıç denenmiş.
- [ ] Sürdürülebilir eğitimde optimizer durumu kaydediliyor.
- [ ] Kısıtlı problemde gölge fiyatlar (dual değerler) okunmuş ve yorumlanmış.
- [ ] Tam sayı karar varsa MILP; LP çözümü yuvarlanmamış.

## Küçük modele yaptırırken

- **İsteme yazın:** "Önce problemi değişken, amaç ve kısıt olarak listele. Eğitimde öğrenme oranını 1e-5'ten 1e-1'e
  10'ar kat tarayıp kısa denemelerin kayıp eğrilerini kaydet; seçimini eğriye dayanarak açıkla."
- **Modelin tipik hatası:** öğrenme oranını gerekçesiz seçer; kayıp `nan` olunca veriyi suçlar; Adam'a L2 ekler;
  tam sayı problemi LP gibi çözüp yuvarlar; eğitimi sürdürürken optimizer durumunu yüklemez.
- **Çıktıda denetleyin:** kayıp eğrisi var mı; `zero_grad` her adımda mı; durma ölçütü; optimizer durumu kayıtta
  mı; çözücü çıktısında "optimal" durumu ve dual değerler.
- **Hata ayıklama sırası verin:** (1) tek küçük yığını ezberleyebiliyor mu, (2) öğrenme oranı taraması,
  (3) gradyan normlarının seyri, (4) ancak sonra mimari değişikliği.

## İlgili

- [Kalkülüs sezgisi](kalkulus-sezgisi.md): türev ve gradyan
- [Geri yayılım matematiği](geri-yayilim-matematigi.md): gradyan nereden gelir
- [Sayısal yöntemler](sayisal-yontemler.md): Newton yöntemi, yakınsama ve durma ölçütü
- [Derin öğrenme temelleri](../80-ml/derin-ogrenme-temelleri.md): SGD/Adam seçimi, öğrenme oranı çizelgesi, yığın boyu
- [Eğitim hata ayıklama](../80-ml/egitim-hata-ayiklama.md): belirtiden nedene deneme sırası
- SGD (momentum, Nesterov), Adam, AdamW, ısınma + kosinüs, kırpma: [`ml-temel/ml_temel/optim/`](../../ml-temel/ml_temel/optim/adam.py)
  (`adam.py`, `optimizer.py`, `schedule.py`, `clip.py`)
- Gerçek bir eğitimde AdamW, öğrenme oranı çizelgesi ve sürdürme: [`dil-modeli/docs/MIMARI.md`](../../dil-modeli/docs/MIMARI.md) → "Eğitim"
