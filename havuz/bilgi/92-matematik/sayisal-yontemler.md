---
baslik: Sayısal yöntemler
ozet: İkiye bölme ve Newton ile kök bulma, yakınsama hızı, durma ölçütü ve tolerans, korumalı Newton, yıkıcı sadeleşme ve kararlı formüller, koşul sayısı ve "küçük artık küçük hata değildir" uyarısı.
etiketler: [sayisal-yontemler, kok-bulma, newton, kosul-sayisi, yakinsama, tolerans]
duzey: orta
guncellik: 2026-11
---

# Sayısal yöntemler

> Bu notu ne zaman okumalı: bir denklemi kapalı formülle çözemeyip yinelemeli bir yöntem yazarken (iç verim oranı,
> ters fonksiyon, denge noktası); bir döngünün "ne zaman duracağına" karar verirken; formül doğru olduğu hâlde
> sonuç saçma çıktığında; bir sistemin girdideki küçük hatayı ne kadar büyüttüğünü merak ettiğinizde.

## Temel fikir

- Çoğu gerçek denklemin kapalı çözümü yoktur; çözüm **yinelemeyle** yaklaşılır: tahmin et, düzelt, yeterince
  yakınsa dur. Üç soru her zaman yanıtlanır: nereden başlanır, nasıl düzeltilir, ne zaman durulur.
- **İkiye bölme** (bisection) yavaş ama garantilidir: işaret değiştiren bir aralık yeter; her adım bir bit
  doğruluk kazandırır. **Newton** hızlıdır (doğru hane sayısı her adımda kabaca ikiye katlanır) ama türev ister
  ve kötü başlangıçta ıraksar ya da döngüye girer. İkisinin birleşimi (korumalı Newton) en iyisidir.
- **Durma ölçütü** hep üç parçalıdır: adım boyuna göreli tolerans, gerekiyorsa artığa (`|f(x)|`) tolerans ve **en
  çok adım sayısı**. `while f(x) != 0` ya da yalnız `|f(x)| < 1e-12` sonsuz döngüdür.
- **Yıkıcı sadeleşme** (catastrophic cancellation): birbirine çok yakın iki sayının farkı, anlamlı hanelerin
  çoğunu siler. Formül cebirsel olarak doğru olsa da sayısal olarak yanlış olabilir; eşdeğer, kararlı biçim seçilir.
- **Koşul sayısı** (κ): girdideki göreli hatanın çıktıda kaç kat büyüyebileceği. Problemin kendi özelliğidir;
  algoritma iyileştirmek kötü koşullu problemi kurtarmaz. κ ≈ 10^k ise k hane kaybetmeyi bekleyin.

## Karar tablosu

| Durum                                               | Yöntem                                             | Neden                                            |
| --------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------ |
| Kök bir aralıkta, işaret değişiyor, güvenlik önemli | İkiye bölme                                        | Her zaman yakınsar; adım sayısı önceden bilinir  |
| Türev kolay, iyi başlangıç var, hız önemli          | Korumalı Newton (aralık + Newton)                  | Hızlı; aralık dışına çıkınca ikiye bölmeye düşer |
| Türev yok, fonksiyon pahalı                         | Kiriş (secant) ya da kütüphanede Brent             | Türevsiz ve hızlı                                |
| `x = g(x)` biçiminde denge/sabit nokta              | Sabit nokta yinelemesi                             | `∣g'(x)∣ < 1` ise yakınsar; yavaş olabilir       |
| Çok değişkenli denklem sistemi, en iyileme          | Kütüphane (`scipy.optimize` gibi)                  | Elle yazmak hataya açık                          |
| Büyük seyrek doğrusal sistem                        | Yinelemeli çözücü (eşlenik gradyan vb.) + tolerans | Doğrudan çözüm bellek/zaman tüketir              |
| Finans: iç verim oranı                              | İkiye bölme ([finans](finans-matematigi.md))       | Garantili; birden çok kök olasılığına dikkat     |

## İkiye bölme ve Newton: yakınsama hızı

```python calistir
import math


def bisect(f, lo, hi, tol=1e-12, max_iter=200):
    f_lo = f(lo)
    if f_lo * f(hi) > 0:
        raise ValueError("aralıkta işaret değişimi yok: kök garanti değil")
    for step in range(1, max_iter + 1):
        mid = (lo + hi) / 2
        f_mid = f(mid)
        if (f_mid > 0) == (f_lo > 0):
            lo, f_lo = mid, f_mid
        else:
            hi = mid
        if hi - lo <= tol:
            return (lo + hi) / 2, step
    raise RuntimeError("en çok adım sayısına ulaşıldı")


root, steps = bisect(lambda x: x * x - 2, 0.0, 2.0)
assert abs(root - math.sqrt(2)) < 1e-12
assert steps == math.ceil(math.log2(2.0 / 1e-12)) == 41  # adım sayısı önceden bilinir

# Newton: x ← x − f(x)/f'(x). Hata her adımda kabaca karesine iner
x, errors = 1.0, []
for _ in range(5):
    x -= (x * x - 2) / (2 * x)
    errors.append(abs(x - math.sqrt(2)))
print(["%.1e" % e for e in errors])
assert errors[1] < 0.01 and errors[2] < 1e-5 and errors[3] < 1e-11  # 2 → 5 → 11 hane
```

| Yöntem      | Yakınsama             | Adım başına kazanç                        |
| ----------- | --------------------- | ----------------------------------------- |
| İkiye bölme | Doğrusal, oran 1/2    | 1 bit (~0,3 ondalık hane)                 |
| Sabit nokta | Doğrusal, oran `∣g'∣` | `g'` küçükse hızlı, 1'e yakınsa çok yavaş |
| Kiriş       | Üstün doğrusal (~1,6) | Hane sayısı ~1,6 katına çıkar             |
| Newton      | Karesel               | Hane sayısı ~2 katına çıkar               |

## Newton ne zaman bozulur, nasıl korunur

```python calistir
import math


def f(x):
    return x**3 - 2 * x + 2


def df(x):
    return 3 * x * x - 2


# Düz Newton 0'dan başlayınca 0 → 1 → 0 → 1 döngüsüne girer
x, seen = 0.0, []
for _ in range(6):
    x -= f(x) / df(x)
    seen.append(x)
assert seen == [1.0, 0.0, 1.0, 0.0, 1.0, 0.0]


def safe_newton(f, df, lo, hi, tol=1e-12, max_iter=100):
    """Kökü içeren aralığı tutar; Newton adımı aralık dışına çıkarsa ikiye böler."""
    f_lo = f(lo)
    if f_lo * f(hi) > 0:
        raise ValueError("aralıkta işaret değişimi yok")
    x = (lo + hi) / 2
    for step in range(1, max_iter + 1):
        fx = f(x)
        if fx == 0:
            return x, step  # tam kök: aralık güncellemesi bunu bozmasın
        if (fx > 0) == (f_lo > 0):
            lo, f_lo = x, fx
        else:
            hi = x
        d = df(x)
        candidate = x - fx / d if d != 0 else None
        if candidate is None or not lo <= candidate <= hi:
            candidate = (lo + hi) / 2
        if abs(candidate - x) <= tol * max(1.0, abs(candidate)) or hi - lo <= tol:
            return candidate, step
        x = candidate
    raise RuntimeError("yakınsamadı")


root, steps = safe_newton(f, df, -3.0, 0.0)
assert abs(f(root)) < 1e-12 and steps < 10

# atan için düz Newton 1,5'ten başlayınca ıraksar; korumalı Newton bulur
x = 1.5
for _ in range(6):
    x -= math.atan(x) * (1 + x * x)  # 1,5 → −1,69 → 2,32 → −5,11 → 32,3 → −1575 → …
assert abs(x) > 1e6
root, _ = safe_newton(math.atan, lambda t: 1 / (1 + t * t), -10.0, 20.0)
assert abs(root) < 1e-12
print("tamam")
```

## Durma ölçütü: neden `|f(x)| < 1e-12` sonsuz döngüdür

Kayan noktada fonksiyon değerinin inebileceği bir taban vardır: kökün en yakın temsilinde bile `f` sıfır olmaz.
Fonksiyonun ölçeği büyükse bu taban `1e-12`'den çok büyüktür.

```python calistir
def g(x):
    return 1e10 * (x * x - 2)  # kök √2; ölçeği büyük


x, steps = 1.0, 0
while abs(g(x)) > 1e-12 and steps < 100:  # YANLIŞ ölçüt; yalnız adım sınırı kurtarıyor
    x -= g(x) / (2e10 * x)
    steps += 1
assert steps == 100  # hiç durmadı
assert abs(x * x - 2) < 1e-15 and abs(g(x)) > 1e-6  # x zaten olabilecek en iyi değerde

# DOĞRU: adım boyuna göreli tolerans + adım sınırı
x = 1.0
for steps in range(1, 101):
    step = g(x) / (2e10 * x)
    x -= step
    if abs(step) <= 1e-15 * max(1.0, abs(x)):
        break
assert steps < 10
print("tamam")
```

Kural: toleransı **göreli** yazın (`tol · max(1, |x|)`), birimi olan büyüklükte (TL, metre) mutlak toleransın
anlamını düşünün ve her döngüye en çok adım sınırı koyun; sınıra ulaşılırsa **sessizce sonuç döndürmeyin**, hata
verin ya da uyarı yazın.

## Yıkıcı sadeleşme ve kararlı formüller

```python calistir
import math

# 1 − cos(x), küçük x'te: iki yakın sayının farkı. Eşdeğeri 2·sin²(x/2) kararlıdır
x = 1e-8
assert 1 - math.cos(x) == 0.0  # bütün bilgi kayboldu
assert math.isclose(2 * math.sin(x / 2) ** 2, x * x / 2)  # doğru: 5e-17

# İkinci derece denklem: x² + 1e8·x + 1 = 0, küçük kök ≈ −1e-8
a, b, c = 1.0, 1e8, 1.0
d = math.sqrt(b * b - 4 * a * c)
naive_small = (-b + d) / (2 * a)  # −b ile d neredeyse eşit: sadeleşme
q = -(b + math.copysign(d, b)) / 2  # aynı işaretlileri topla
stable_small, stable_large = c / q, q / a  # Vieta: kökler çarpımı c/a
assert abs(naive_small / -1e-8 - 1) > 0.2  # %25 hatalı
assert math.isclose(stable_small, -1e-8, rel_tol=1e-12) and math.isclose(stable_large, -1e8)

# Hazır kararlı işlevler: log1p, expm1, hypot, fsum
assert math.log(1 + 1e-17) == 0.0 and math.log1p(1e-17) == 1e-17
assert math.sqrt(3e200 * 3e200 + 4e200 * 4e200) == math.inf  # kareler taştı
assert math.isclose(math.hypot(3e200, 4e200), 5e200)  # hypot taşmadan hesaplar
print("tamam")
```

## Koşul sayısı: problem hatayı ne kadar büyütür

```python calistir
def solve2(A, b):
    det = A[0][0] * A[1][1] - A[0][1] * A[1][0]
    return [(b[0] * A[1][1] - A[0][1] * b[1]) / det, (A[0][0] * b[1] - b[0] * A[1][0]) / det]


def norm_inf(M):
    return max(sum(abs(v) for v in row) for row in M)


A = [[1.0, 1.0], [1.0, 1.0001]]  # neredeyse tekil: iki satır neredeyse aynı
det = A[0][0] * A[1][1] - A[0][1] * A[1][0]
A_inv = [[A[1][1] / det, -A[0][1] / det], [-A[1][0] / det, A[0][0] / det]]
kappa = norm_inf(A) * norm_inf(A_inv)
assert 4.0e4 < kappa < 4.1e4  # ~4 hane kaybı beklenir

x1 = solve2(A, [2.0, 2.0001])  # gerçek çözüm (1, 1)
x2 = solve2(A, [2.0, 2.0002])  # b'de on binde birlik değişiklik
rel_b = 0.0001 / 2.0002
rel_x = max(abs(p - q) for p, q in zip(x1, x2)) / max(abs(v) for v in x1)
assert rel_x / rel_b > 10_000 and rel_x / rel_b <= kappa  # büyütme κ ile sınırlı ama çok büyük

# Küçük artık, küçük hata demek değildir
wrong = [2.0, 0.0]
residual = [bi - sum(a * x for a, x in zip(row, wrong)) for row, bi in zip(A, [2.0, 2.0001])]
assert max(abs(r) for r in residual) / 2.0001 < 1e-4  # göreli artık on binde birin altında...
assert abs(wrong[0] - 1.0) == 1.0  # ...ama çözüm %100 yanlış
print("tamam")
```

Yinelemeli çözücüler çoğu zaman "artık normu tolerans altına inince" durur. Kötü koşullu sistemde bu, çözümün
doğru olduğunu göstermez: hata, artığın κ katına kadar büyük olabilir. Kötü koşullu bir sistemle karşılaşınca
veriyi ölçekleyin, gereksiz (neredeyse aynı) değişkenleri çıkarın ya da düzenlileştirme ekleyin.

## Sabit nokta yinelemesi ve tolerans

```python calistir
import math

x = 1.0
for step in range(1, 1000):
    new = math.cos(x)  # x = cos(x) denkleminin çözümü
    if abs(new - x) <= 1e-12 * max(1.0, abs(new)):
        break
    x = new
assert abs(new - math.cos(new)) < 1e-11
assert 50 < step < 100  # oran |sin(0,739)| ≈ 0,67: her adımda yalnız ~%33 iyileşme
print(f"{step} adımda x = {new:.12f}")
```

Doğrusal yakınsayan bir yinelemede "art arda iki değerin farkı" gerçek hatadan küçük görünebilir: oran `r` ise
gerçek hata ≈ fark · `r/(1−r)`. Oran 1'e yakınsa (0,99) fark 1e-12 iken hata 1e-10 olabilir; toleransı ona
göre sıkı tutun ya da daha hızlı bir yönteme geçin.

## Tuzaklar

| Belirti                                                  | Neden                                                   | Çözüm                                                     |
| -------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| Döngü hiç bitmiyor                                       | `while f(x) != 0` ya da mutlak `∣f∣ < tol`; ölçek büyük | Göreli adım toleransı + en çok adım sayısı                |
| Newton bazen saçma büyük sayı, bazen `ZeroDivisionError` | Kötü başlangıç, türevin sıfır olduğu nokta              | Aralıkla korunan Newton; türev sıfırsa ikiye bölme        |
| Newton iki değer arasında gidip geliyor                  | Döngü (ör. `x³ − 2x + 2`, `x₀ = 0`)                     | Korumalı Newton; adım sınırı                              |
| İkiye bölme "işaret değişimi yok" diyor                  | Aralıkta kök yok ya da çift sayıda kök var              | Fonksiyonu tarayıp aralığı daraltın; çizdirin             |
| Sonuç adım sınırında döndü, kimse fark etmedi            | Yakınsamama sessizce yutulmuş                           | Sınıra ulaşınca hata ya da uyarı                          |
| Doğru formül saçma sonuç veriyor (0, ya da %25 hata)     | Yıkıcı sadeleşme                                        | Kararlı eşdeğer formül; `log1p`, `expm1`, `hypot`         |
| Girdideki küçük değişiklik sonucu altüst ediyor          | Kötü koşullu problem (κ büyük)                          | Ölçekleme, değişken azaltma, düzenlileştirme              |
| Yinelemeli çözücü "yakınsadı" ama sonuç yanlış           | Küçük artık, büyük hata (κ büyük)                       | Koşul sayısını kestirin; sonucu bağımsız yolla doğrulayın |
| Sabit nokta yinelemesi çok yavaş                         | `∣g'∣ ≈ 1`                                              | Newton ya da hızlandırma; toleransı sıkılaştırın          |

## Denetim listesi

- [ ] Her yinelemeli döngüde en çok adım sınırı var; sınıra ulaşılması hata ya da uyarı üretiyor.
- [ ] Tolerans göreli ve gerekçeli; mutlak tolerans kullanıldıysa birimi düşünülmüş.
- [ ] Kök bulmada aralık (işaret değişimi) denetleniyor; Newton aralıkla korunuyor.
- [ ] Yakın sayıların farkını alan formüller kararlı biçimle yazılmış (`log1p`, `expm1`, Vieta, `hypot`).
- [ ] Sonuç bağımsız bir yolla doğrulanmış: kök için `f(kök) ≈ 0`, sistem için `A·x ≈ b` **ve** koşul sayısı.
- [ ] Testlerde kötü durumlar var: kötü başlangıç, türevin sıfır olduğu nokta, büyük ölçekli fonksiyon.

## Küçük modele yaptırırken

- **İsteme yazın:** "Kökü korumalı Newton ile bul: aralığı tut, Newton adımı dışarı çıkarsa ikiye böl. Durma:
  göreli adım toleransı 1e-12 ve en çok 100 adım; sınıra ulaşırsan `RuntimeError` ver."
- **Modelin tipik hatası:** `while abs(f(x)) > 1e-9` yazar ve adım sınırı koymaz; düz Newton kullanır; `1 - cos(x)`,
  `(-b + sqrt(d)) / 2a`, `log(1 + x)` gibi kararsız formülleri olduğu gibi yazar; yakınsamamayı sessizce geçer.
- **Çıktıda denetleyin:** her `while` döngüsünde adım sınırı; tolerans göreli mi; `math.log(1 +`, `1 - math.cos(`,
  `sqrt(b*b - 4*a*c)` kalıpları; sonuç doğrulaması var mı.
- **Zor test isteyin:** "Newton'u `x³ − 2x + 2` için 0'dan başlat; döngüye girmeden kökü bulmalı" ve
  "`1e10·(x² − 2)` için döngü 10 adımda durmalı."

## İlgili

- [Sayılar ve kayan nokta](sayilar-ve-kayan-nokta.md): yuvarlama hatasının kaynağı
- [Kalkülüs sezgisi](kalkulus-sezgisi.md): sonlu farkla türev ve sayısal integral hataları
- [En küçük kareler ve eğri uydurma](en-kucuk-kareler.md): merkezleme ile kötü koşulun giderilmesi
- [Lineer cebir sezgisi](lineer-cebir-sezgisi.md): pivotlu eleme, tekillik
- [Optimizasyon](optimizasyon.md): en iyileme algoritmaları ve öğrenme oranı
- [Finans matematiği](finans-matematigi.md): iç verim oranını ikiye bölmeyle bulmak
- Kısmi pivotlu LU ayrışımı (küçük pivotta "tekil" hatası verir): [`algoritma/algoritma/sayilar/lu_decomposition.py`](../../algoritma/algoritma/sayilar/lu_decomposition.py)
