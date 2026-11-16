---
baslik: Kalkülüs sezgisi
ozet: Türev yerel eğimdir, gradyan en dik yokuştur, integral birikmiş toplamdır; sonlu farkla türev ve adım boyu seçimi, zincir kuralı, yamuk ve Simpson ile sayısal integral, limitte kayan nokta tuzağı.
etiketler: [kalkulus, turev, gradyan, integral, sayisal-turev]
duzey: temel
guncellik: 2026-11
---

# Kalkülüs sezgisi

> Bu notu ne zaman okumalı: bir modelin eğitimini (gradyan) anlamak, türev formülünü denetlemek, "fiyatı biraz
> artırırsam ne olur" gibi bir duyarlılık sorusunu yanıtlamak, ölçüm verisinden toplam hesaplamak istediğinizde.

## Temel fikir

- **Türev** = yerel eğim: girdi çok az değişince çıktı kaç kat değişir. `Δy ≈ f'(x)·Δx`. Birimi
  "çıktı birimi / girdi birimi"dir (TL/adet, ms/istek); birim tutmuyorsa formül yanlıştır.
- **Zincir kuralı**: iç içe fonksiyonda yerel eğimler çarpılır: `(f(g(x)))' = f'(g(x))·g'(x)`. Geri yayılımın
  tamamı bu kuraldır ([geri yayılım matematiği](geri-yayilim-matematigi.md)).
- **Kısmi türev**: çok girdili fonksiyonda yalnız birini oynatıp ötekileri sabit tutmak. Hepsinin listesi
  **gradyan**dır; en hızlı artış yönünü gösterir, tersi en hızlı azalış yönüdür ([optimizasyon](optimizasyon.md)).
- **İntegral** = birikmiş toplam: hızdan yol, istek hızından toplam istek, olasılık yoğunluğundan olasılık.
  Sayısal olarak ince dilimlerin alanları toplanır.
- **Limit**: bir büyüklük sınıra yaklaşırken neye yaklaşır. Bilgisayarda "çok küçük h" ya da "çok büyük n"
  kayan nokta sınırına çarpar; matematikteki limit kodda kendiliğinden çıkmaz.

## Karar tablosu

| Soru                                                        | Araç                                        | Dikkat                                                  |
| ----------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------- |
| "x biraz artarsa y ne kadar değişir?"                       | Türev (duyarlılık): `Δy ≈ f'(x)·Δx`         | Yalnız küçük değişimde doğru; büyükte eğrilik girer     |
| "Hangi yöne gidersem en hızlı artar/azalır?"                | Gradyan                                     | Değişkenlerin ölçeği farklıysa yön yanıltır             |
| "Türev formülüm / otomatik türevim doğru mu?"               | Merkezi farkla karşılaştır, `h ≈ 1e-5`      | Kırık noktalardan (`abs`, ReLU'da 0) uzak durun         |
| "Formül yok, yalnız ölçümler var; değişim hızı?"            | Sayısal türev ya da eğri uydurup türevi     | Gürültüyü büyütür; önce düzleştirin                     |
| "Toplam ne kadar birikti?"                                  | Yamuk kuralı (ölçüm verisinde)              | Ölçüm aralıkları eşit değilse her dilimi ayrı hesaplayın |
| "Düzgün fonksiyonun integrali, az hesapla yüksek doğruluk" | Simpson                                     | Çift sayıda aralık ister                                |
| Sonsuz aralık, tekillik, salınan fonksiyon                  | Kütüphanenin uyarlamalı integrali           | Elle yazmayın                                           |

## Sonlu farkla türev: adım boyunu seçmek

İleri fark `(f(x+h) − f(x)) / h`, merkezi fark `(f(x+h) − f(x−h)) / 2h`. `h` büyükse kesme hatası
(truncation), küçükse yuvarlama hatası (iki yakın sayının farkı) büyür. En iyisi ortadadır.

```python calistir
import math

f, x = math.sin, 1.0
exact = math.cos(x)


def forward(h):
    return (f(x + h) - f(x)) / h


def central(h):
    return (f(x + h) - f(x - h)) / (2 * h)


errors = {h: (abs(forward(h) - exact), abs(central(h) - exact)) for h in (1e-1, 1e-5, 1e-8, 1e-14)}
for h, (e_fwd, e_cen) in errors.items():
    print(f"h={h:.0e}   ileri fark hatası {e_fwd:.1e}   merkezi fark hatası {e_cen:.1e}")
assert errors[1e-8][0] < errors[1e-1][0] and errors[1e-8][0] < errors[1e-14][0]  # ileri: h ≈ 1e-8 en iyi
assert errors[1e-5][1] < 1e-10  # merkezi fark h ≈ 1e-5 ile ~10 hane doğru
assert errors[1e-14][1] > 1e-4  # çok küçük h: yuvarlama hatası baskın

# Kırık noktada sayısal türev yalan söyler: |x|'in 0'da türevi yoktur, merkezi fark 0 der
assert (abs(1e-6) - abs(-1e-6)) / 2e-6 == 0.0
```

Pratik kural (`float64`): ileri farkta `h ≈ 1e-8·max(1, |x|)`, merkezi farkta `h ≈ 1e-5·max(1, |x|)`. `float32`
(GPU) ile sayısal türev denetimi güvenilmez; denetimi `float64`'te yapın.

## Zincir kuralı ve duyarlılık

```python calistir
import math


def derivative(f, x, h=1e-5):
    return (f(x + h) - f(x - h)) / (2 * h)


def g(x):
    return math.sin(x * x)


# Zincir kuralı: d/dx sin(x²) = cos(x²) · 2x
for x in (0.3, 1.0, 2.5):
    assert math.isclose(derivative(g, x), math.cos(x * x) * 2 * x, rel_tol=1e-8)


def revenue(price):
    return price * (1000 - 20 * price)  # gelir = fiyat × talep


slope = derivative(revenue, 20.0)
assert math.isclose(slope, 1000 - 40 * 20, rel_tol=1e-9)  # 200 TL gelir / 1 TL fiyat artışı
estimate = slope * 0.5  # fiyat 0,5 TL artarsa ≈ +100 TL
actual = revenue(20.5) - revenue(20.0)
assert math.isclose(estimate, 100) and math.isclose(actual, 95)  # fark: eğrilik (ikinci türev)
assert math.isclose(derivative(revenue, 25.0), 0, abs_tol=1e-6)  # eğimin sıfır olduğu yer: en yüksek gelir
print("tamam")
```

Türev sıfırsa fonksiyon o noktada düzdür: en büyük, en küçük ya da eyer noktası olabilir. Eniyilemenin
temeli budur.

## Kısmi türev ve gradyan

```python calistir
import math


def f(x, y):
    return x * x + 3 * x * y + y * y


def partial(fn, point, i, h=1e-6):
    up, down = list(point), list(point)
    up[i] += h
    down[i] -= h
    return (fn(*up) - fn(*down)) / (2 * h)


point = (1.0, 2.0)
grad = [partial(f, point, i) for i in range(2)]
assert all(math.isclose(g, e, rel_tol=1e-8) for g, e in zip(grad, (8.0, 7.0)))  # (2x + 3y, 3x + 2y)

# En dik artış yönü gradyandır: 360 yönde aynı küçük adımın etkisini ölç
step, gains = 1e-4, {}
for degree in range(360):
    a = math.radians(degree)
    gains[degree] = f(point[0] + step * math.cos(a), point[1] + step * math.sin(a)) - f(*point)
best = max(gains, key=gains.get)
assert abs(best - math.degrees(math.atan2(grad[1], grad[0]))) < 1  # ≈ 41,2°
assert abs(gains[(best + 90) % 360]) < 0.02 * gains[best]  # gradyana dik yönde değişim ≈ 0
print("tamam")
```

Gradyana dik yönler "eş yükselti" çizgisidir: o yönde gitmek değeri değiştirmez. Gradyan inişi tam ters
yöne küçük adım atar.

## İntegral: dilimleri toplamak

```python calistir
import math


def trapezoid(f, a, b, n):
    h = (b - a) / n
    return h * (f(a) / 2 + sum(f(a + i * h) for i in range(1, n)) + f(b) / 2)


def simpson(f, a, b, n):
    if n % 2:
        raise ValueError("Simpson çift sayıda aralık ister")
    h = (b - a) / n
    odd = sum(f(a + i * h) for i in range(1, n, 2))
    even = sum(f(a + i * h) for i in range(2, n, 2))
    return h / 3 * (f(a) + 4 * odd + 2 * even + f(b))


exact = 2.0  # sin x'in 0'dan π'ye integrali
t8, t16 = (abs(trapezoid(math.sin, 0, math.pi, n) - exact) for n in (8, 16))
s8, s16 = (abs(simpson(math.sin, 0, math.pi, n) - exact) for n in (8, 16))
assert 3.9 < t8 / t16 < 4.1  # yamuk: aralık yarıya inince hata 4'te 1 (h²)
assert 15 < s8 / s16 < 17  # Simpson: 16'da 1 (h⁴)
assert s16 < t16 / 100  # aynı sayıda hesapla çok daha doğru

# Veriden integral: 10 saniyede bir ölçülen istek hızı (istek/sn) → toplam istek
rates = [12, 15, 21, 30, 28, 22, 18]
total = sum((rates[i] + rates[i + 1]) / 2 * 10 for i in range(len(rates) - 1))
assert total == 1310  # 60 saniyede ≈ 1 310 istek
print("tamam")
```

Hata oranı sınaması (adımı yarıya indirip hatanın kaç kat küçüldüğüne bakmak) kendi yazdığınız bir sayısal
yöntemin doğru çalıştığını göstermenin en ucuz yoludur: beklenen kat (4, 16) çıkmıyorsa kodda hata vardır.

## Limit ve kayan nokta

```python calistir
import math

# (1 + 1/n)^n → e. Kayan noktada 1 + 1/n, n büyüyünce 1'e yuvarlanır
for n in (10, 10**6, 10**15, 10**16):
    print(f"n = {n:.0e}: {(1 + 1 / n) ** n}")
assert abs((1 + 1 / 10**6) ** 10**6 - math.e) < 2e-6
assert (1 + 1 / 10**16) ** 10**16 == 1.0  # "limit 1" — YANLIŞ
assert math.isclose(math.exp(10**16 * math.log1p(1 / 10**16)), math.e)  # log1p kaybı önler

# sin(x)/x, x = 0'da tanımsızdır ama x → 0 iken 1'e gider
assert abs(math.sin(1e-4) / 1e-4 - 1) < 1e-8
```

`log1p(x)` (= `log(1 + x)`) ve `expm1(x)` (= `e^x − 1`) küçük `x`'te yuvarlama kaybını önler; faiz, olasılık ve
kayıp fonksiyonlarında sık gerekir ([sayısal yöntemler](sayisal-yontemler.md)).

## Tuzaklar

| Belirti                                                        | Neden                                                    | Çözüm                                                           |
| -------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------- |
| Sayısal türev çok küçük `h` ile saçmaladı                      | Yuvarlama hatası: iki yakın sayının farkı                | Merkezi fark, `h ≈ 1e-5·max(1, ∣x∣)`; `float64`                 |
| Türev denetimi `float32`'de hep "hatalı" diyor                 | 7 haneli duyarlıkta sonlu fark gürültülü                 | Denetimi `float64`'te yapın                                     |
| Türev denetimi tek bir noktada başarısız                       | Kırık nokta (ReLU'da 0, `abs`, `max`)                    | Denetim noktasını kırıktan uzak seçin                           |
| Ölçüm verisinden türev çok gürültülü                           | Fark almak gürültüyü büyütür                             | Önce düzleştirin ya da eğri uydurup onun türevini alın          |
| Duyarlılık tahmini büyük değişimde tutmadı                     | Türev yerel bir yaklaşımdır; eğrilik var                 | Büyük değişimi doğrudan hesaplayın; ikinci türeve bakın         |
| Simpson tek sayıda aralıkla yanlış sonuç                       | Formül çift sayıda aralık varsayar                       | `n`'i çift yapın; işlev bunu denetlesin                          |
| Kendi yazılan integral yavaşça yanlış                          | Formül hatası                                            | Adımı yarıya indirip hata oranını sınayın (4 ya da 16)           |
| Bileşik büyüme/limit hesabı 1 ya da saçma çıktı                | `1 + çok küçük` yuvarlandı                               | `log1p`, `expm1`                                                |
| Gradyan yönü "yanlış" gösteriyor                               | Değişkenlerin ölçeği farklı (TL ve yüzde)                | Değişkenleri ölçekleyin ya da birimleri gözden geçirin           |

## Denetim listesi

- [ ] Her türevin birimi yazılı ve anlamlı (çıktı birimi / girdi birimi).
- [ ] Elle yazılmış ya da otomatik türev, merkezi farkla `float64`'te birkaç noktada denetlenmiş.
- [ ] Denetim noktaları kırık noktalardan uzak.
- [ ] Sayısal integralde adımı yarıya indirme sınaması yapılmış; sonuç kararlı.
- [ ] Ölçüm verisinden türev alınıyorsa gürültü önlemi var.
- [ ] Küçük sayılı `log(1 + x)`, `e^x − 1` hesapları `log1p`/`expm1` ile.

## Küçük modele yaptırırken

- **İsteme yazın:** "Türev formülünü yazdıktan sonra merkezi farkla (`h=1e-5`, `float64`) üç farklı noktada
  karşılaştıran bir test ekle; göreli fark `1e-6`'dan küçük olmalı."
- **Modelin tipik hatası:** `h = 1e-12` gibi aşırı küçük adım seçer; ileri fark kullanır; denetimi ReLU'nun
  sıfır noktasında yapar; Simpson'ı tek sayıda aralıkla çağırır; türevin birimini düşünmez.
- **Çıktıda denetleyin:** `h` değeri; merkezi fark mı; denetim noktaları; integral kodunda adım yarılama
  sınaması var mı.
- **Soru sorun:** "Bu türevin birimi ne?" Yanıtı tutmayan formül çoğu zaman yanlıştır.

## İlgili

- [Geri yayılım matematiği](geri-yayilim-matematigi.md): zincir kuralının hesap çizgesinde uygulanması
- [Optimizasyon](optimizasyon.md): gradyan inişi, öğrenme oranı
- [Sayısal yöntemler](sayisal-yontemler.md): kök bulma, koşul sayısı, yıkıcı sadeleşme
- [Sayılar ve kayan nokta](sayilar-ve-kayan-nokta.md): yuvarlama hatasının kaynağı
- Otomatik türevi sonlu farkla denetleyen kod: [`ml-temel/ml_temel/autograd/gradcheck.py`](../../ml-temel/ml_temel/autograd/gradcheck.py)
