---
baslik: Geri yayılım matematiği
ozet: Hesap çizgesinde zincir kuralı, saf Python ile küçük bir otomatik türev ve sonlu farkla doğrulaması, softmax ile çapraz entropinin türevi (p − y), sayısal kararlılık ve kaybolan gradyan.
etiketler: [geri-yayilim, otomatik-turev, zincir-kurali, softmax, capraz-entropi, sinir-agi]
duzey: orta
guncellik: 2026-11
---

# Geri yayılım matematiği

> Bu notu ne zaman okumalı: yeni bir katman ya da kayıp fonksiyonu yazarken; eğitimde kayıp `nan` olduğunda ya
> da hiç düşmediğinde; gradyan denetimi (gradcheck) başarısız olduğunda; `backward()`'ın ne yaptığını anlamak
> istediğinizde.

## Temel fikir

- Her hesap küçük işlemlerden oluşan bir **çizgedir** (graph): `u = a·b`, `v = u + c`, `kayıp = v²`. Her işlem
  kendi **yerel türevini** bilir.
- **Zincir kuralı**: kaybın bir girdiye göre türevi, yol boyunca yerel türevlerin **çarpımıdır**; bir düğüm birden
  çok yolla kayba bağlanıyorsa yolların katkıları **toplanır**.
- **Geri yayılım** (backpropagation, ters kipli otomatik türev): çizgeyi sondan başa bir kez gezer ve bütün
  parametrelerin gradyanını bulur. Maliyeti kabaca bir ileri hesap kadardır; milyonlarca parametre bu yüzden
  eğitilebilir.
- Her gradyanın **şekli**, ait olduğu parametrenin şekliyle aynıdır. Bu tek kural çoğu şekil hatasını yakalar.
- Doğruluk sınaması hep aynıdır: otomatik türevi **merkezi farkla** karşılaştırmak
  ([kalkülüs](kalkulus-sezgisi.md)).

## Elle bir zincir

`f(a, b, c) = (a·b + c)²`, `a = 2`, `b = −3`, `c = 10`.

| Adım (ileri) | Değer | Geri: kaybın bu düğüme göre türevi        |
| ------------ | ----- | ----------------------------------------- |
| `u = a·b`    | −6    | `∂f/∂u = ∂f/∂v · 1 = 8`                   |
| `v = u + c`  | 4     | `∂f/∂v = 2v = 8`                          |
| `f = v²`     | 16    | `∂f/∂f = 1`                               |
| `a`          | 2     | `∂f/∂a = ∂f/∂u · b = −24`                 |
| `b`          | −3    | `∂f/∂b = ∂f/∂u · a = 16`                  |
| `c`          | 10    | `∂f/∂c = ∂f/∂v · 1 = 8`                   |

```python calistir
import math


def f(a, b, c):
    return (a * b + c) ** 2


a, b, c = 2.0, -3.0, 10.0
v = a * b + c
grads = {"a": 2 * v * b, "b": 2 * v * a, "c": 2 * v}  # zincir kuralıyla elle
assert grads == {"a": -24.0, "b": 16.0, "c": 8.0}

h = 1e-6
numeric = {
    "a": (f(a + h, b, c) - f(a - h, b, c)) / (2 * h),
    "b": (f(a, b + h, c) - f(a, b - h, c)) / (2 * h),
    "c": (f(a, b, c + h) - f(a, b, c - h)) / (2 * h),
}
assert all(math.isclose(grads[k], numeric[k], rel_tol=1e-7) for k in grads)
print("tamam")
```

## Küçük bir otomatik türev ve gerçek bir ağ

Aşağıdaki `Value` sınıfı skaler değerlerle çalışan tam bir ters kipli otomatik türevdir. Onunla iki girişli,
iki gizli nöronlu bir ağ kurup XOR problemini öğretiyoruz; önce her gradyanı sonlu farkla doğruluyoruz.

```python calistir
import math
import random


class Value:
    """Skaler otomatik türev: her düğüm değerini, çocuklarını ve yerel türev kuralını saklar."""

    def __init__(self, data, children=()):
        self.data, self.grad = float(data), 0.0
        self._children, self._backward = children, lambda: None

    def __add__(self, other):
        other = other if isinstance(other, Value) else Value(other)
        out = Value(self.data + other.data, (self, other))

        def backward():
            self.grad += out.grad  # "+=": düğüm birden çok yerde kullanılmış olabilir
            other.grad += out.grad

        out._backward = backward
        return out

    def __mul__(self, other):
        other = other if isinstance(other, Value) else Value(other)
        out = Value(self.data * other.data, (self, other))

        def backward():
            self.grad += other.data * out.grad
            other.grad += self.data * out.grad

        out._backward = backward
        return out

    def tanh(self):
        t = math.tanh(self.data)
        out = Value(t, (self,))

        def backward():
            self.grad += (1 - t * t) * out.grad

        out._backward = backward
        return out

    __radd__, __rmul__ = __add__, __mul__

    def __sub__(self, other):
        return self + other * -1

    def backward(self):
        order, seen = [], set()

        def visit(node):  # topolojik sıra: her düğüm girdilerinden sonra gelir
            if node not in seen:
                seen.add(node)
                for child in node._children:
                    visit(child)
                order.append(node)

        visit(self)
        self.grad = 1.0
        for node in reversed(order):
            node._backward()


a = Value(3.0)
(a * a).backward()
assert a.grad == 6.0  # iki yolun katkısı toplandı; "=" yazılsaydı 3 çıkardı

data = [((0.0, 1.0), 1.0), ((1.0, 0.0), 1.0), ((1.0, 1.0), 0.0), ((0.0, 0.0), 0.0)]  # XOR


def loss_fn(p):
    """2 giriş → 2 gizli nöron (tanh) → 1 çıkış; ortalama kare hata."""
    w11, w12, w21, w22, b1, b2, v1, v2, c = p
    total = 0.0
    for (x1, x2), y in data:
        h1 = (w11 * x1 + w12 * x2 + b1).tanh()
        h2 = (w21 * x1 + w22 * x2 + b2).tanh()
        error = v1 * h1 + v2 * h2 + c - y
        total = total + error * error
    return total * (1 / len(data))


rng = random.Random(0)
params = [Value(rng.uniform(-1, 1)) for _ in range(9)]
loss = loss_fn(params)
loss.backward()

h = 1e-6
for i, p in enumerate(params):  # her gradyanı merkezi farkla doğrula
    up = [Value(q.data + (h if j == i else 0)) for j, q in enumerate(params)]
    down = [Value(q.data - (h if j == i else 0)) for j, q in enumerate(params)]
    numeric = (loss_fn(up).data - loss_fn(down).data) / (2 * h)
    assert math.isclose(p.grad, numeric, rel_tol=1e-6, abs_tol=1e-9), (i, p.grad, numeric)

start = loss.data
for _ in range(300):  # gradyan inişi
    for p in params:
        p.grad = 0.0  # sıfırlamayı unutmak: gradyanlar adımdan adıma birikir
    loss = loss_fn(params)
    loss.backward()
    for p in params:
        p.data -= 0.2 * p.grad
print(f"kayıp: {start:.3f} → {loss.data:.3f}")
assert loss.data < start / 2
```

Üç ayrıntı her gerçek kütüphanede de vardır:

1. **Gradyan biriktirilir** (`+=`): `a * a` gibi bir değer iki yoldan kayba bağlanır.
2. **Her adımda sıfırlanır**: sıfırlanmazsa önceki adımların gradyanı eklenir, adım giderek büyür.
3. **Topolojik sıra**: bir düğümün geri adımı, ona bağlı bütün düğümlerinkinden sonra çalışmalıdır. Burada
   özyineleme kullanıldı; binlerce katmanlı çizgede yığın taşar, gerçek gerçekleme döngüyle gezer.

Vektörlü işlemlerde aynı kurallar matris biçiminde yazılır. `Y = X @ W` için: `∂L/∂X = G @ Wᵀ`,
`∂L/∂W = Xᵀ @ G` (`G = ∂L/∂Y`). Şekil kuralı formülü kendisi doğrular: `∂L/∂W`, `W` ile aynı şekilde olmalıdır.
Yayınlanan (broadcast) bir terimin gradyanı yayınlandığı eksen boyunca **toplanarak** asıl şekline indirilir.

## Softmax ve çapraz entropi: türev `p − y`

Sınıflandırmada son katman skorları (logit) `z` softmax ile olasılığa çevrilir: `pᵢ = e^(zᵢ) / Σ e^(zⱼ)`.
Doğru sınıf `t` için kayıp `−log p_t`. İkisi birlikte türevlenince sonuç çok sadedir: `∂kayıp/∂zᵢ = pᵢ − yᵢ`
(`y`: doğru sınıfta 1, ötekilerde 0).

```python calistir
import math


def softmax(z):
    m = max(z)  # en büyüğü çıkarmak sonucu değiştirmez, taşmayı önler
    e = [math.exp(v - m) for v in z]
    s = sum(e)
    return [v / s for v in e]


def cross_entropy(z, target):
    m = max(z)
    log_sum_exp = m + math.log(sum(math.exp(v - m) for v in z))
    return log_sum_exp - z[target]  # = −log softmax(z)[target], log'u ayrıca almadan


z, target = [2.0, -1.0, 0.5], 0
p = softmax(z)
analytic = [pi - (1.0 if i == target else 0.0) for i, pi in enumerate(p)]  # p − y
h = 1e-6
for i in range(len(z)):
    up, down = z.copy(), z.copy()
    up[i] += h
    down[i] -= h
    numeric = (cross_entropy(up, target) - cross_entropy(down, target)) / (2 * h)
    assert math.isclose(numeric, analytic[i], rel_tol=1e-6, abs_tol=1e-9)

# Saf formül büyük logitte taşar; kaydırılmış formül taşmaz
try:
    [math.exp(v) for v in [1000.0, 1001.0]]
    raise AssertionError("taşma bekleniyordu")
except OverflowError:
    pass
assert math.isclose(softmax([1000.0, 1001.0])[1], 1 / (1 + math.exp(-1)))

# Önce softmax sonra log: küçük olasılık 0'a yuvarlanır ve log(0) çöker
far = [0.0, 800.0]
assert softmax(far)[0] == 0.0  # e^(-800) float'ta 0
try:
    math.log(softmax(far)[0])
    raise AssertionError("hata bekleniyordu")
except ValueError:
    pass
assert cross_entropy(far, 0) == 800.0  # log-sum-exp ile doğru ve sonlu
print("tamam")
```

Kural: kaybı **logit üzerinden** hesaplayan hazır işlevi kullanın (PyTorch'ta `cross_entropy` logit alır;
önüne softmax koymayın). İkili sınıflamada aynı şey sigmoid + ikili çapraz entropi için geçerlidir.

## Kaybolan ve patlayan gradyan

Zincir kuralı çarpımdır: her katmanın yerel türevi 1'den küçükse çarpım sıfıra, büyükse sonsuza gider.

```python calistir
import math


def sigmoid(x):
    return 1 / (1 + math.exp(-x))


# Sigmoid'in türevi s(1 − s) en fazla 0,25'tir (x = 0'da)
grad, x = 1.0, 0.0
for _ in range(10):  # on sigmoid katmanı art arda
    s = sigmoid(x)
    grad *= s * (1 - s)
    x = s
assert grad <= 0.25**10 < 1e-6  # ilk katmana ulaşan sinyal milyonda birin altında

# Ters yönde: yerel türev 1,5 olan 50 katman
assert 1.5**50 > 6e8  # patlama → kayıp nan
print("tamam")
```

Pratikteki çareler: ReLU/GELU gibi türevi 1'e yakın etkinleştirmeler, artık bağlantılar (`x + f(x)`: türevde
doğrudan bir `+1` yolu açar), katman normalleştirme, dikkatli başlatma (Xavier/He) ve **gradyan kırpma**
(`‖g‖ > c` ise `g ← g·c/‖g‖`).

## Tuzaklar

| Belirti                                                         | Neden                                                       | Çözüm                                                            |
| --------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| Kayıp ilk adımlarda `nan`/`inf`                                 | `exp` taşması; softmax/log ayrı ayrı; `log(0)`               | Logit alan kayıp işlevi; log-sum-exp; gerekirse kırpma           |
| Kayıp önce düşüyor, sonra adımlar giderek büyüyor               | Gradyan sıfırlanmıyor, birikiyor                            | Her adımda `zero_grad`; biriktirme bilinçliyse kaybı bölün       |
| Bir parametrenin gradyanı yarı değerinde                        | Biriktirme yerine atama (`=`)                               | Geri adımda hep `+=`                                             |
| Gradyan denetimi tek bir örnekte başarısız                      | Kırık nokta (ReLU'da 0, `max`), ya da `float32`             | Kırıktan uzak nokta; `float64`; `h ≈ 1e-6`                       |
| Derin çizgede `RecursionError`                                  | Topolojik sıralama özyinelemeli                             | Yığınla (döngüyle) gezinme                                       |
| Gradyan şekli parametreyle uyuşmuyor                            | Yayınlanan eksen geri yolda toplanmamış                     | Yayınlanan eksenlerde toplayıp asıl şekle indirin                |
| İlk katmanlar hiç öğrenmiyor                                    | Kaybolan gradyan (sigmoid/tanh zinciri, kötü başlatma)      | ReLU/GELU, artık bağlantı, normalleştirme, He/Xavier başlatma    |
| Kayıp birden sıçrayıp `nan` oluyor                              | Patlayan gradyan; öğrenme oranı büyük                       | Gradyan kırpma; öğrenme oranını küçültün ([optimizasyon](optimizasyon.md)) |
| Çıktı katmanında softmax + `CrossEntropyLoss` ile eğitim kötü    | Softmax iki kez uygulanmış                                  | Kayıp işlevine ham logit verin                                   |

## Denetim listesi

- [ ] Her yeni işlem/katman için gradyan, merkezi farkla `float64`'te ve kırık noktalardan uzak denetlenmiş.
- [ ] Geri adımlarda gradyan `+=` ile biriktiriliyor; eğitim döngüsü her adımda sıfırlıyor.
- [ ] Her gradyanın şekli parametresinin şekline eşit (`assert`).
- [ ] Softmax ve log ayrı hesaplanmıyor; kayıp logit üzerinden (log-sum-exp).
- [ ] Derin ağda kaybolan/patlayan gradyana önlem var (etkinleştirme, artık bağlantı, normalleştirme, kırpma).
- [ ] Kayıp ilk adımda beklenen değerde: `K` sınıflı rastgele modelde ≈ `ln K`.

## Küçük modele yaptırırken

- **İsteme yazın:** "Yeni işlemin ileri ve geri adımını yaz; ardından `gradcheck` ile (float64, merkezi fark,
  rastgele girdi) sınayan bir test ekle. Kaybı logit üzerinden hesapla; softmax'ı ayrıca uygulama."
- **Modelin tipik hatası:** geri adımda `=` yazar; yayınlanan terimin gradyanını toplamayı unutur; softmax'tan
  sonra `log` alır; eğitim döngüsünde gradyanı sıfırlamaz; gradyan denetimini ReLU'nun sıfır noktasında yapar.
- **Çıktıda denetleyin:** geri adım satırlarında `+=`; `zero_grad` ya da `grad = 0` çağrısı; `log(softmax(`
  kalıbı (olmamalı); test dosyasında gradcheck var mı.
- **İlk kayıp sorusu:** "Eğitimin ilk adımında kayıp neden yaklaşık `ln(sınıf sayısı)`?" Bu değerden çok
  farklıysa başlatma ya da kayıp hesabı yanlıştır.

## İlgili

- [Kalkülüs sezgisi](kalkulus-sezgisi.md): türev, zincir kuralı, sonlu fark
- [Optimizasyon](optimizasyon.md): gradyanla ne yapılır (öğrenme oranı, momentum, Adam)
- [Bilgi kuramı](bilgi-kurami.md): çapraz entropi ve şaşkınlık
- [Eğitim hata ayıklama](../80-ml/egitim-hata-ayiklama.md): kayıp inmiyor, `nan`, tek yığını ezberleme testi
- [Derin öğrenme temelleri](../80-ml/derin-ogrenme-temelleri.md): başlatma, normalleştirme, artık bağlantı
- Gerçek gerçekleme (36 işlem, yayınlama, döngüyle topolojik sıra): [`ml-temel/ml_temel/autograd/tensor.py`](../../ml-temel/ml_temel/autograd/tensor.py)
- İşlemlerin geri kuralları tablosu: [`ml-temel/docs/NASIL_CALISIR.md`](../../ml-temel/docs/NASIL_CALISIR.md) → "Geri yayılım"
- Gradyan denetimi: [`ml-temel/ml_temel/autograd/gradcheck.py`](../../ml-temel/ml_temel/autograd/gradcheck.py)
