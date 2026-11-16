---
baslik: Eğitim hata ayıklama
ozet: Kayıp inmiyor, NaN, eğitim iyi doğrulama kötü, çok yavaş ve oynak sonuç için belirti, olası neden ve deneme sırası; tek yığını ezberleme testi, gradyan denetimi, veri hattı hataları, tohum.
etiketler: [makine-ogrenmesi, hata-ayiklama, egitim, gradyan, yeniden-uretilebilirlik]
duzey: orta
guncellik: 2026-11
---

# Eğitim hata ayıklama

> Bu notu ne zaman okumalı: kayıp inmediğinde, `nan` olduğunda, doğrulama eğitimden çok kötü çıktığında,
> eğitim beklenenden yavaş ya da her çalıştırmada farklı sonuç verdiğinde.

## Temel fikir

Eğitim hataları sessizdir: kod çalışır, sayı çıkar, ama model öğrenmez ya da yanlış şeyi öğrenir. Rastgele ayar
değiştirmek yerine **küçükten büyüğe** sırayla daraltın:

1. **Veriye bakın:** 10 örneği (girdi, etiket) gözle yazdırın. Hataların çoğu buradadır.
2. **Tek yığını ezberletin:** modeli tek bir küçük yığında yüzlerce adım eğitin; kayıp sıfıra yaklaşmalı.
   Yaklaşmıyorsa sorun veri değil; model, kayıp ya da güncelleme kodudur.
3. **Başlangıç kaybını kontrol edin:** K sınıflı rastgele bir model ≈ ln K kayıpla başlar (2 sınıf 0,69; 10 sınıf
   2,30). Çok farklıysa başlatma ya da kayıp yanlıştır.
4. **Gradyanları ölçün:** sıfır mı, sonsuz mu, katman katman normu ne?
5. **Ancak sonra** öğrenme oranı, model boyutu, düzenlileştirme.

## Belirti → neden → deneme sırası

| Belirti | Olası nedenler (sıklık sırasıyla) | Deneme sırası |
| --- | --- | --- |
| Kayıp hiç inmiyor | Veri-etiket hizası bozuk; güncelleme parametreye ulaşmıyor (dondurulmuş, kopyaya yazılıyor); öğrenme oranı çok düşük/yüksek; kayıp yanlış (çift softmax); girdiler ölçeksiz | 10 örneği yazdır → tek yığını ezberlet → gradyan normu 0 mı → oranı 3'er kat tara |
| Kayıp `nan` / `inf` | Öğrenme oranı yüksek; `log(0)`, `exp` taşması; sıfıra bölme (normda varyans 0); fp16 taşması; veride NaN | Veride NaN tara → oranı yarıya indir → gradyan kırpma → kararlı kayıp → `nan`ın ilk çıktığı adım ve katmanı bul |
| Eğitim iyi, doğrulama kötü | Aşırı öğrenme; doğrulamada farklı ön işleme; değerlendirmede `eval` kipi unutulmuş; doğrulama başka dağılımdan | Eğitimden rastgele ayrılmış doğrulamayla ölç → ön işleme yolunu karşılaştır → `eval` kipi → sonra düzenlileştirme ([aşırı öğrenme](asiri-ogrenme.md)) |
| Kayıp iniyor, ölçüt yerinde | Ölçüt yanlış hesaplanıyor (argmax ekseni, sınıf sırası); etiket kodlaması eğitim ve değerlendirmede farklı | Ölçütü elle 5 örnekte hesapla; sınıf ↔ kimlik eşlemesini yazdır |
| Çok yavaş | Veri yükleme darboğazı (GPU boşta); her adımda `.item()`/yazdırma; küçük yığın; iş parçacığı ayarı; karışık duyarlık kapalı | Adım süresini "veri bekleme" ve "hesap" diye ölç → yükleyici işçisi → yığın → duyarlık |
| Sonuç her çalıştırmada farklı | Tohum yok; dosya listesi sırası değişken; küme/sözlük sırası; GPU'da belirlenimci olmayan işlemler; doğrulama kümesi küçük | Tohumları sabitle → dosya listesini sırala → 3 tohumla koş, yayılımı raporla |
| Doğrulama kaybı eğitimden düşük | Bırakma/veri artırma yalnız eğitimde açık; doğrulama daha kolay; kopya | Kapalı kiple eğitim kaybını ölç; kopya taraması |
| Başlangıç kaybı ln K'dan çok farklı | Son katman büyük başlatılmış; etiketler yanlış aralıkta; kayıp toplam/ortalama karışık | Son katmanı küçük başlat; etiket aralığını yazdır |

## Tek yığını ezberleme testi

16 örnek, 20 özellik, rastgele etiket. Özellik sayısı örnekten fazla olduğu için doğru kurulmuş bir model bu
yığını **ezberleyebilmelidir**. Aynı kod, tek bir Python hatasıyla:

```python calistir
import math
import random

random.seed(26)
X = [[random.gauss(0, 1) for _ in range(20)] for _ in range(16)]
y = [random.random() < 0.5 for _ in range(16)]


def loss_and_grad(w):
    total, grad = 0.0, [0.0] * len(w)
    for xi, yi in zip(X, y):
        p = 1 / (1 + math.exp(-sum(a * b for a, b in zip(w, xi))))
        total -= math.log(p if yi else 1 - p)
        grad = [g + (p - yi) * a for g, a in zip(grad, xi)]
    return total / len(X), [g / len(X) for g in grad]


def train(buggy, steps=300, lr=0.5):
    w = [0.0] * 20
    for _ in range(steps):
        _, grad = loss_and_grad(w)
        if buggy:
            for w_i, g_i in zip(w, grad):  # HATA: döngü değişkeni değişir, liste değişmez
                w_i -= lr * g_i
        else:
            w = [w_i - lr * g_i for w_i, g_i in zip(w, grad)]
    return loss_and_grad(w)[0]


print(f"doğru güncelleme: son kayıp {train(False):.3f}")
print(f"hatalı güncelleme: son kayıp {train(True):.3f}  (ln 2 = {math.log(2):.3f})")
assert train(False) < 0.05 and abs(train(True) - math.log(2)) < 1e-9
```

```cikti
doğru güncelleme: son kayıp 0.009
hatalı güncelleme: son kayıp 0.693  (ln 2 = 0.693)
```

Kayıp tam ln 2'de kalıyorsa model hiç değişmiyor demektir: güncelleme parametreye ulaşmıyor. PyTorch'taki
karşılıkları: parametre `requires_grad=False` kalmış, en iyileyiciye yanlış parametre listesi verilmiş, tensör
`.detach()` ya da `.item()` ile çizgeden koparılmış, `optimizer.step()` unutulmuş. Bu test **veri hatalarını
yakalamaz**: karıştırılmış etiketler de ezberlenebilir. Onun için aşağıdaki veri hattı denetimine bakın.

## Gradyan denetimi

Elle yazılmış bir gradyanı (ya da yeni bir katmanı) sonlu farkla karşılaştırın: `f'(x) ≈ (f(x+ε) − f(x−ε)) / 2ε`.

```python calistir
import math
import random

random.seed(27)
X = [[random.gauss(0, 1) for _ in range(3)] for _ in range(10)]
y = [random.random() < 0.5 for _ in range(10)]


def loss(w):
    total = 0.0
    for xi, yi in zip(X, y):
        p = 1 / (1 + math.exp(-sum(a * b for a, b in zip(w, xi))))
        total -= math.log(p if yi else 1 - p)
    return total / len(X)


def analytic(w, buggy=False):
    grad = [0.0] * 3
    for xi, yi in zip(X, y):
        p = 1 / (1 + math.exp(-sum(a * b for a, b in zip(w, xi))))
        error = (yi - p) if buggy else (p - yi)  # hatalı sürümde işaret ters
        grad = [g + error * a / len(X) for g, a in zip(grad, xi)]
    return grad


def numeric(w, eps=1e-6):
    return [(loss(w[:j] + [w[j] + eps] + w[j + 1:]) - loss(w[:j] + [w[j] - eps] + w[j + 1:])) / (2 * eps) for j in range(3)]


w = [0.3, -0.2, 0.1]
for buggy in (False, True):
    a, n = analytic(w, buggy), numeric(w)
    rel = max(abs(x - z) / max(1e-12, abs(x) + abs(z)) for x, z in zip(a, n))
    print(f"{'hatalı' if buggy else 'doğru '} gradyan: en büyük göreli fark {rel:.1e}")
```

```cikti
doğru  gradyan: en büyük göreli fark 6.4e-10
hatalı gradyan: en büyük göreli fark 1.0e+00
```

Göreli fark 1e-6'nın altındaysa gradyan doğrudur; 1e-2 civarı ve üstü hatadır. Hazır kütüphanenin katmanlarını
denetlemeye gerek yoktur; elle yazılan işlem, özel kayıp ve özel katman denetlenir. `float64` ile yapın.

## Veri hattı hataları: en sık neden

Girdiler ve etiketler ayrı ayrı karıştırılınca (hiza bozulunca) model kod hatası vermeden eğitilir ama
doğrulamada şans düzeyine (≈0,5) düşer. Basit bir kontrol: aynı modeli hizalı ve hizası bozuk veriyle eğitip karşılaştırmak:

```python calistir
import random
import statistics

random.seed(28)
rows = [((random.gauss(1.5 if y else 0, 1), random.gauss(0, 1)), y) for y in (random.random() < 0.5 for _ in range(1000))]
train, valid = rows[:800], rows[800:]


def knn_accuracy(train, valid, k=15):
    def predict(x):
        near = sorted(train, key=lambda r: (r[0][0] - x[0]) ** 2 + (r[0][1] - x[1]) ** 2)[:k]
        return sum(y for _, y in near) * 2 > k
    return statistics.fmean(predict(x) == y for x, y in valid)


features, labels = [x for x, _ in train], [y for _, y in train]
random.shuffle(features)  # HATA: yalnız girdiler karıştırıldı, etiketler yerinde kaldı
print(f"hizalı veri:       doğrulama {knn_accuracy(train, valid):.2f}")
print(f"hizası bozuk veri: doğrulama {knn_accuracy(list(zip(features, labels)), valid):.2f}")
```

```cikti
hizalı veri:       doğrulama 0.80
hizası bozuk veri: doğrulama 0.54
```

| Veri hattı hatası | Belirti | Denetim |
| --- | --- | --- |
| Girdi ve etiket ayrı karıştırıldı / birleştirmede kayma | Doğrulama şans düzeyinde | Rastgele 10 (girdi, etiket) çiftini yazdırıp gözle okuyun |
| Etiket kodlaması eğitimde ve tahminde farklı (sınıf sırası) | Ölçüt düşük, karışıklık matrisi "kaymış" | Sınıf ↔ kimlik eşlemesini model dosyasıyla birlikte saklayın |
| Doğrulamaya eğitimdeki ön işleme uygulanmadı | Eğitim iyi, doğrulama kötü | Tek bir `Pipeline` ya da tek bir dönüştürme fonksiyonu |
| Görüntüde renk kanalı sırası/normalleştirme farkı | Önceden eğitilmiş model kötü | Ön eğitimdeki normalleştirmeyi aynen kullanın |
| Metinde azami uzunluk kırpması yanıtı kesiyor | Model cevabı bitirmiyor | Uzunluk dağılımını (p99) yazdırın; uzun örneği atın ya da sınırı artırın |
| Dolgu (padding) maskesi yanlış | Kayıp dolgu belirteçlerinde de hesaplanıyor | Bir yığının maskesini gözle yazdırın |
| Veri artırma etiketi bozuyor | Sağ/sol, yön içeren sınıflarda hata | Artırılmış örnekleri görselleştirin |
| Dosyalar değişken sırayla okunuyor | Çalıştırmadan çalıştırmaya fark | Dosya listesini sıralayın |
| Eksik değer sessizce 0 oldu | Model 0'ı anlamlı sanıyor | Okumadan sonra eksik sayısını yazdırın |

## Sayısal kararlılık: `nan` nereden gelir?

```python calistir
import math


def naive_bce(z, y):  # önce olasılık, sonra log
    p = 1 / (1 + math.exp(-z))
    return -math.log(p) if y else -math.log(1 - p)


def stable_bce(z, y):  # logit üzerinden: softplus(-z) ya da softplus(z)
    softplus = lambda t: max(t, 0) + math.log1p(math.exp(-abs(t)))
    return softplus(-z) if y else softplus(z)


for z, y in ((40.0, 0), (-800.0, 1)):
    try:
        naive = f"{naive_bce(z, y):.1f}"
    except (ValueError, OverflowError) as error:
        naive = f"HATA ({type(error).__name__})"
    print(f"z={z:7.1f}, y={y}: naif {naive:22s} kararlı {stable_bce(z, y):.1f}")
```

```cikti
z=   40.0, y=0: naif HATA (ValueError)      kararlı 40.0
z= -800.0, y=1: naif HATA (OverflowError)   kararlı 800.0
```

Saf Python hata fırlatır; numpy ve PyTorch ise sessizce `inf` ya da `nan` üretir ve eğitim birkaç adım sonra
bozulur. Kural: olasılıkla değil **logitle** çalışan kayıplar, `log-sum-exp` ile yazılmış softmax, normalleştirmede
paydaya küçük ε, gradyan kırpma.

## Tohum ve yeniden üretilebilirlik

Aynı kod iki kez çalışınca farklı sonuç veriyorsa önce rastgelelik kaynaklarını sabitleyin. Gözden kaçan bir
kaynak: Python'da metinlerin karma değeri her süreçte farklıdır; bu yüzden **kümelerin** gezinme sırası değişir.

```python calistir
import subprocess
import sys

CODE = "print(list({'elma', 'armut', 'kiraz', 'erik', 'incir', 'ayva'}))"


def run(code, seed):
    env = {"PYTHONHASHSEED": seed}
    return subprocess.run([sys.executable, "-c", code], env=env, capture_output=True, text=True, check=True).stdout


same = run(CODE, "1") == run(CODE, "1")
different = run(CODE, "1") != run(CODE, "2")
sorted_code = CODE.replace("list(", "sorted(")
stable = run(sorted_code, "1") == run(sorted_code, "2")
print(f"aynı karma tohumu → aynı sıra: {same}")
print(f"farklı karma tohumu → farklı sıra: {different}")
print(f"sorted() ile → her durumda aynı: {stable}")
```

```cikti
aynı karma tohumu → aynı sıra: True
farklı karma tohumu → farklı sıra: True
sorted() ile → her durumda aynı: True
```

Yeniden üretilebilirlik denetim listesi:

- `random`, `numpy` ve `torch` tohumları başta sabitlendi; veri yükleyici işçilerinin tohumu da.
- Kümeden ya da dosya sisteminden gelen her liste sıralandı (`sorted(os.listdir(...))`).
- Ayar dosyası, tohum, kütüphane sürümleri ve veri dosyasının özeti (hash) çıktıyla birlikte kaydedildi.
- GPU'da bazı işlemler belirlenimci değildir; bire bir aynılık gerekiyorsa kütüphanenin belirlenimci kipini açın
  (yavaşlatır) ya da sonuçları birkaç tohumun yayılımıyla raporlayın.
- Yarıda kalan eğitimin sürdürülmesi aynı sonuca götürmeli: yığın seçimi ve öğrenme oranı adım numarasının saf
  fonksiyonu olsun ([donanım notu](hesaplama-ve-donanim.md)).

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Saatlerce ayar denendi, sonunda veri hatası çıktı | Veriye bakılmadan hiperparametreye geçildi | Önce 10 örnek, sonra tek yığın testi |
| Tek yığın testi geçti, model yine öğrenmiyor | Test veri hizası hatalarını yakalamaz | Hizalı/hizasız karşılaştırma; çiftleri gözle okuyun |
| `nan` ilk adımda | Veride `nan` ya da sıfıra bölme | Okumadan sonra eksik/sonsuz taraması |
| `nan` binlerce adım sonra | Öğrenme oranı/fp16 taşması, nadir aykırı yığın | Gradyan kırpma, oranı düşürme, bf16; o yığını kaydedip inceleyin |
| Gradyanlar her adımda büyüyor | Gradyan sıfırlanmıyor, birikiyor | Her adımda `zero_grad` |
| Doğrulama ölçütü dalgalı | Küçük doğrulama kümesi ya da `train` kipinde değerlendirme | Kümeyi büyütün; `eval` kipi |
| GPU kullanımı düşük | Veri yükleme darboğazı | Yükleyici işçisi, önceden işlenmiş veri, daha büyük yığın |
| İki makinede farklı sonuç | Sürüm, tohum, belirlenimci olmayan işlem | Sürümleri kaydedin; yayılımı raporlayın |

## Denetim listesi

- [ ] 10 rastgele (girdi, etiket) çifti gözle okundu; etiket dağılımı yazdırıldı.
- [ ] Başlangıç kaybı beklenen düzeyde (sınıflandırmada ≈ ln K).
- [ ] Tek bir küçük yığın ezberletildi; kayıp sıfıra yaklaştı.
- [ ] Elle yazılan her gradyan/katman sonlu farkla denetlendi.
- [ ] Eğitim ve doğrulama aynı dönüştürme kodundan geçiyor; değerlendirme `eval` kipinde.
- [ ] Günlükte kayıp, öğrenme oranı ve gradyan normu var.
- [ ] Tohumlar sabit; dosya ve küme sıraları sıralı; sürümler kayıtlı.
- [ ] `nan` görüldüğünde ilk adım ve katman bulundu; kök neden giderildi (yalnız oran düşürülmedi).

## Küçük modele yaptırırken

- **İsteme yazın:** "Hiperparametre değiştirmeden önce şu sırayı uygula ve her adımın çıktısını göster: 10 örnek
  yazdır, başlangıç kaybını ln K ile karşılaştır, tek yığını 300 adım ezberlet, gradyan normlarını katman katman
  yazdır. Ancak bunlar geçerse öğrenme oranı taraması yap."
- **Modelin tipik hatası:** Belirtiyi görünce doğrudan öğrenme oranı ya da model boyutu değiştirir; `nan`ı oranı
  düşürerek "çözer" ama nedeni (veride `nan`, `log(0)`) bırakır; tohumları yalnız `random` için sabitler.
- **Çıktıda denetleyin:** tek yığın testinin gerçekten aynı yığını kullandığı; ölçütün elle hesaplanmış küçük
  bir örnekle doğrulandığı; değerlendirmede `eval` ve gradyansız bağlam; dosya listelerinin sıralanması.
- **Hata iletisini olduğu gibi verin:** ilk hata satırı ve yığın izi (traceback) küçük modelin en iyi ipucudur;
  özetlemeyin.

## İlgili

- Genel yöntem: [Hata ayıklama](../00-yontem/hata-ayiklama.md); türevin matematiği:
  [Geri yayılım matematiği](../92-matematik/geri-yayilim-matematigi.md)
- [Derin öğrenme temelleri](derin-ogrenme-temelleri.md) · [Aşırı öğrenme](asiri-ogrenme.md) ·
  [Hesaplama ve donanım](hesaplama-ve-donanim.md) · [MLOps](mlops.md) — deney kaydı
- Sonlu farkla gradyan denetimi: [`ml_temel/autograd/gradcheck.py`](../../ml-temel/ml_temel/autograd/gradcheck.py);
  her işlem için denetim testi: [`tests/test_autograd_ops.py`](../../ml-temel/tests/test_autograd_ops.py)
- Sık yapılan hatalar tablosu: [`ml-temel/AGENTS.md`](../../ml-temel/AGENTS.md)
- Dil modeli eğitiminde sık sorunlar ve kayıp eğrisi okuma: [`dil-modeli/docs/EGITIM_REHBERI.md`](../../dil-modeli/docs/EGITIM_REHBERI.md)
- Bire bir sürdürme ve tohum düzeni: [`dil_modeli/train.py`](../../dil-modeli/dil_modeli/train.py)
- İnce ayarda belirtiye göre ayar ve kayıp maskesi gösterimi (`sohbet dogrula`):
  [`ince-ayar/docs/HIPERPARAMETRE.md`](../../ince-ayar/docs/HIPERPARAMETRE.md)
