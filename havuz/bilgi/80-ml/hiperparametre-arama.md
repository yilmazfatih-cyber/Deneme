---
baslik: Hiperparametre arama
ozet: Arama bütçesi, ızgara–rastgele–yönlü (Bayesçi) arama sezgisi, logaritmik ölçek, erken durdurma ve ardışık yarılama, doğrulamaya aşırı uyum; tohumlu çalışan karşılaştırmalarla.
etiketler: [makine-ogrenmesi, hiperparametre, capraz-dogrulama, ayar, deney]
duzey: orta
guncellik: 2026-11
---

# Hiperparametre arama

> Bu notu ne zaman okumalı: bir modelin ayarlarını (öğrenme oranı, ağaç derinliği, düzenlileştirme…) aramaya
> başlamadan önce; "ızgarayı büyütelim mi?" sorusunda; arama bitti, en iyi puan raporlanacakken.

## Temel fikir

Hiperparametre arama, **gürültülü ve pahalı** bir işlevin en iyisini aramaktır: her deneme bir eğitimdir, her puan
çapraz doğrulamanın oynak bir ölçümüdür. Üç gerçek kararı yönetir:

1. **Bütçe:** deneme sayısı × kat sayısı × eğitim süresi. Önce bütçe yazılır, sonra yöntem seçilir.
2. **Uzay:** hangi ayar, hangi aralık, hangi **ölçek** (çoğu oran ve ceza logaritmik). Kötü uzayı hiçbir
   yöntem kurtarmaz.
3. **Dürüstlük:** en iyi görünen ayarın puanı iyimserdir. Ne kadar çok denerseniz o kadar iyimser. Raporlanacak
   başarı aramanın dokunmadığı veriden gelir ([ayrım ve çapraz doğrulama](ayrim-ve-capraz-dogrulama.md)).

Çoğu modelde ayarların çoğu az, bir-ikisi çok etkilidir. Hangisinin çok etkili olduğunu baştan bilmezsiniz; bu
yüzden **rastgele arama ızgarayı çoğu zaman geçer**: her denemede her ayarın yeni bir değerini dener.

## Karar tablosu

| Durum | Seçim | Neden |
| --- | --- | --- |
| 1–2 ayar, eğitim ucuz | Logaritmik ızgara (5–7 değer) | Yüzeyi tümüyle görürsünüz; tabloya dökülür |
| 3+ ayar, hangisinin önemli olduğu bilinmiyor | Rastgele arama, 30–60 deneme, log ölçekte | Önemli ayar her denemede yeni değer alır |
| Eğitim pahalı (dakikalar–saatler), bütçe ≤ 50 deneme | 10–20 rastgele ısınma + yönlü (Bayesçi) arama | Önceki sonuçlar sonrakini yönlendirir |
| Yinelemeli model (gradyan artırma, sinir ağı) | Her denemede erken durdurma; çok aday varsa ardışık yarılama | Kötü adaya tam bütçe harcanmaz |
| Az veri, puanlar çok oynak | Az aday, tekrarlı CV, bir standart hata kuralı | Gürültüde "en iyi" şanstır |
| Gradyan artırma (tablo verisi) | [Ağaç toplulukları](agac-topluluklari.md) notundaki sıralı ayar | Ayarlar arasında bilinen bir sıra var |
| Sinir ağı | Önce öğrenme oranı (log tarama), sonra ötekiler | En etkili ayar odur ([derin öğrenme](derin-ogrenme-temelleri.md)) |
| Varsayılan değerle taban, fark kat yayılımından küçük | Aramayı durdurun | Kazanç gürültüdür; zaman veride ve özellikte |

## Bütçe hesabı

Aramadan önce tek satırlık hesap: `deneme × kat × eğitim süresi`. 60 deneme × 5 kat × 40 sn = 12.000 sn ≈ 3,3 saat.
Paylaşımlı makinede ya da ücretsiz defterde bu, kesintiye uğrayacak bir iştir: her denemenin sonucunu anında
dosyaya yazın (deneme başına bir JSON satırı; [MLOps](mlops.md)) ki kesilen arama kaldığı yerden sürsün.

Bütçeyi küçültmenin sırası:

1. Taban çizgisi ve varsayılan ayarla tek koşu. Çoğu zaman en iyi ayar bunun kat yayılımı içindedir.
2. Uzayı daraltın: bilinen sıra ve makul aralıklar ([ağaç toplulukları](agac-topluluklari.md),
   [ince-ayar HIPERPARAMETRE](../../ince-ayar/docs/HIPERPARAMETRE.md)).
3. Denemeyi ucuzlatın: verinin bir alt örneğiyle kaba arama, tam veriyle yalnız ilk 3–5 aday.
4. Kötü adayı erken kesin (aşağıda ardışık yarılama).

## Ölçek: log mu, doğrusal mı

| Ayar | Ölçek | Tipik aralık (başlangıç, ölçüm değil) |
| --- | --- | --- |
| Öğrenme oranı | Log | 1e-4 – 1 (ağaç artırma 0,01–0,3; ince ayar 1e-5–1e-3) |
| L2 cezası, `C`, `alpha`, ağırlık bozunumu | Log | 1e-4 – 1e2 |
| Yaprak sayısı, en az yaprak örneği | Log ya da tamsayı log | 8 – 256; 1 – 100 |
| Ağaç derinliği | Tamsayı, doğrusal | 2 – 10 |
| Bırakma (dropout), alt örnekleme oranı | Doğrusal | 0 – 0,5; 0,5 – 1 |
| Tur sayısı, dönem | Aranmaz | Erken durdurmayla bulunur |

Doğrusal örnekleme log ölçekli bir ayarda denemelerin neredeyse hepsini en üst onluğa harcar:

```python calistir
import random

rng = random.Random(1)
linear = [rng.uniform(1e-4, 1.0) for _ in range(1000)]
log_uniform = [10 ** rng.uniform(-4, 0) for _ in range(1000)]


def per_decade(values):
    return [sum(10.0**d <= v < 10.0 ** (d + 1) for v in values) for d in range(-4, 0)]


print("aralık            doğrusal örnekleme   log-düzgün örnekleme")
for d, a, b in zip(range(-4, 0), per_decade(linear), per_decade(log_uniform)):
    print(f"1e{d} – 1e{d + 1}    {a:5d}                {b:5d}")
assert per_decade(linear)[0] + per_decade(linear)[1] < 20
```

```cikti
aralık            doğrusal örnekleme   log-düzgün örnekleme
1e-4 – 1e-3        1                  255
1e-3 – 1e-2        9                  249
1e-2 – 1e-1       84                  263
1e-1 – 1e0      906                  233
```

Aynı yanlış ızgarada da yapılır: `[0.001, 0.25, 0.5, 0.75, 1]` öğrenme oranının dört değerini 0,25'in üstüne
koyar. Log ölçekli ayarın ızgarası `[0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1]` gibi kat kat ilerler.

## Izgara ↔ rastgele: çalışan karşılaştırma

Oyuncak bir başarı yüzeyi: öğrenme oranı çok, derinlik az, L2 çok az etkili; en iyi öğrenme oranı 0,04 civarı.
Doğrulama puanı gerçek puan + ±0,004 gürültü. İkisi de 27 deneme: 3 × 3 × 3 ızgara ve 27 rastgele nokta:

```python calistir
import math
import random
import statistics


def true_score(lr, depth, l2):  # bilinmeyen "gerçek" başarı: lr çok, derinlik az, l2 çok az etkili
    return (0.85 - 0.05 * math.log10(lr / 0.04) ** 2 - 0.0015 * (depth - 5) ** 2
            - 0.002 * math.log10(l2 / 0.3) ** 2)


grid = [(lr, d, l2) for lr in (0.001, 0.01, 0.1) for d in (3, 6, 9) for l2 in (0.01, 0.1, 1.0)]


def sample(rng):
    return (10 ** rng.uniform(-3, 0), rng.randint(2, 10), 10 ** rng.uniform(-3, 1))


def pick(configs, rng):  # doğrulama puanı = gerçek + ölçüm gürültüsü; en iyi görüneni seç
    seen = [(true_score(*c) + rng.gauss(0, 0.004), c) for c in configs]
    observed, chosen = max(seen)
    return true_score(*chosen), observed


results = {"ızgara": [], "rastgele": []}
for seed in range(300):
    rng = random.Random(seed)
    results["ızgara"].append(pick(grid, rng))
    results["rastgele"].append(pick([sample(rng) for _ in range(len(grid))], rng))
for name, rows in results.items():
    true_mean = statistics.fmean(t for t, _ in rows)
    optimism = statistics.fmean(o - t for t, o in rows)
    print(f"{name:9s} 27 deneme: seçilenin gerçek puanı {true_mean:.4f}, iyimserlik +{optimism:.4f}")
wins = sum(r[0] > g[0] for r, g in zip(results["rastgele"], results["ızgara"]))
print(f"rastgele arama {wins}/300 tohumda ızgaradan iyi ayar seçti")
assert wins > 240
```

```cikti
ızgara    27 deneme: seçilenin gerçek puanı 0.8391, iyimserlik +0.0039
rastgele  27 deneme: seçilenin gerçek puanı 0.8444, iyimserlik +0.0029
rastgele arama 269/300 tohumda ızgaradan iyi ayar seçti
```

Neden: ızgara öğrenme oranının yalnız **3** değerini denedi, 27 denemenin 24'ü önemsiz ayarlardaki farkları
tekrarladı. Rastgele arama öğrenme oranının **27** farklı değerini denedi. İki not: (1) "iyimserlik" sütunu,
seçilen ayarın doğrulama puanının gerçek puanından ne kadar yüksek göründüğüdür; aşağıda ayrıca ele alınır.
(2) Izgara, ayar sayısı 1–2 iken ve yüzeyi tablo olarak görmek istediğinizde hâlâ en iyi araçtır.

## Önceki sonuçlardan yararlanmak: Bayesçi aramanın sezgisi

Bayesçi arama (Bayesian optimization) şimdiye kadarki denemelerden bir **vekil model** (surrogate) kurar:
"bu ayar şu kadar iyi olur, şu kadar emin değilim". Sonraki denemeyi iki isteği tartarak seçer: iyi bilinen
bölgenin yakınına bakmak (sömürü, exploitation) ve hiç bakılmamış bölgeye bakmak (keşif, exploration). Ne zaman
değer: deneme pahalıyken, ayar sayısı birkaç–yirmi arasındayken, denemeler sırayla koşabiliyorken. Paralel çok
deneme koşuyorsanız yönlendirme etkisi azalır; birkaç denemelik bütçede rastgele aramadan farkı ayırt edilmez.

Aynı sezginin en yalın biçimi: 10 rastgele ısınma, sonra çoğunlukla en iyi üçün çevresinden örnek, arada keşif:

```python calistir
import math
import random
import statistics


def true_score(lr, depth, l2):  # aynı oyuncak yüzey: lr çok, derinlik az, l2 çok az etkili
    return (0.85 - 0.05 * math.log10(lr / 0.04) ** 2 - 0.0015 * (depth - 5) ** 2
            - 0.002 * math.log10(l2 / 0.3) ** 2)


def observe(config, rng):
    return true_score(*config) + rng.gauss(0, 0.004)


def wide(rng):
    return (10 ** rng.uniform(-3, 0), rng.randint(2, 10), 10 ** rng.uniform(-3, 1))


def near(config, rng):  # iyi bir ayarın çevresinden örnek: log ölçekte küçük adım
    lr, depth, l2 = config
    return (min(1.0, lr * 10 ** rng.gauss(0, 0.25)), min(10, max(2, depth + rng.choice((-1, 0, 1)))),
            l2 * 10 ** rng.gauss(0, 0.5))


def random_search(rng, budget=30):
    tried = [(observe(c, rng), c) for c in (wide(rng) for _ in range(budget))]
    return true_score(*max(tried)[1])


def guided_search(rng, budget=30, warmup=10):
    tried = [(observe(c, rng), c) for c in (wide(rng) for _ in range(warmup))]
    while len(tried) < budget:
        top = sorted(tried, reverse=True)[:3]  # sömürü: en iyi üçün çevresi
        candidate = near(rng.choice(top)[1], rng) if rng.random() < 0.8 else wide(rng)  # %20 keşif
        tried.append((observe(candidate, rng), candidate))
    return true_score(*max(tried)[1])


plain = [random_search(random.Random(s)) for s in range(300)]
guided = [guided_search(random.Random(s)) for s in range(300)]
print(f"30 deneme, yalnız rastgele:       seçilenin gerçek puanı {statistics.fmean(plain):.4f}")
print(f"30 deneme, 10 rastgele + 20 yönlü: seçilenin gerçek puanı {statistics.fmean(guided):.4f}")
print(f"yönlü arama {sum(g > p for g, p in zip(guided, plain))}/300 tohumda daha iyi")
```

```cikti
30 deneme, yalnız rastgele:       seçilenin gerçek puanı 0.8445
30 deneme, 10 rastgele + 20 yönlü: seçilenin gerçek puanı 0.8459
yönlü arama 179/300 tohumda daha iyi
```

Kazanç gerçek ama **küçük**: ölçüm gürültüsüyle (±0,004) aynı mertebede. Ders: yönlü arama iyi bir uzay ve log
ölçek üstüne küçük bir ek kazançtır; kötü uzayı kurtarmaz. Hazır kütüphaneler (ör. Optuna) bu işi ağaç yapılı
Parzen kestirici (TPE) gibi yöntemlerle yapar; adlar ve varsayılanlar sürüme göre değişir, kurulu sürümde doğrulayın.

## Erken durdurma ve ardışık yarılama

Yinelemeli modelde her deneme **kendi içinde** erken durdurulur (tur sayısı aranmaz;
[aşırı öğrenme](asiri-ogrenme.md)). Çok aday varsa bir adım daha: **ardışık yarılama** (successive halving):
bütün adaylara küçük bütçe ver, en iyi üçte birini tut, bütçeyi üçe katla, yinele. Tuzağı: yavaş öğrenen (küçük
öğrenme oranlı) adaylar küçük bütçede kötü görünür ve elenir. 27 aday, tam bütçe 27 birim:

```python calistir
import math
import random
import statistics


def make_configs(rng, n=27):
    configs = []
    for _ in range(n):
        final = rng.uniform(0.70, 0.85)  # bütçe bitince ulaşacağı başarı
        speed = rng.choice((1.0, 3.0, 10.0))  # yavaş öğrenen (küçük öğrenme oranı) geç toparlar
        configs.append((final, speed))
    return configs


def score(config, budget, rng):  # 'budget' birim eğitimden sonraki doğrulama puanı (gürültülü)
    final, speed = config
    return final - 0.25 * math.exp(-budget / speed) + rng.gauss(0, 0.005)


def full_search(configs, rng, max_budget=27):
    best = max(configs, key=lambda c: score(c, max_budget, rng))
    return best[0], len(configs) * max_budget


def successive_halving(configs, rng, min_budget, max_budget=27, eta=3):
    alive, budget, cost = list(configs), min_budget, 0
    while True:
        cost += len(alive) * budget  # basitlik için her turda baştan eğitim
        ranked = sorted(alive, key=lambda c: score(c, budget, rng), reverse=True)
        if budget >= max_budget or len(ranked) == 1:
            return ranked[0][0], cost
        alive, budget = ranked[: max(1, len(ranked) // eta)], min(max_budget, budget * eta)


rows = {"hepsi tam bütçe": [], "yarılama, ilk tur 1 birim": [], "yarılama, ilk tur 3 birim": []}
for seed in range(300):
    rng = random.Random(seed)
    configs = make_configs(rng)
    best_final = max(c[0] for c in configs)
    for name, run in (("hepsi tam bütçe", lambda: full_search(configs, rng)),
                      ("yarılama, ilk tur 1 birim", lambda: successive_halving(configs, rng, 1)),
                      ("yarılama, ilk tur 3 birim", lambda: successive_halving(configs, rng, 3))):
        final, cost = run()
        rows[name].append((best_final - final, cost))
for name, values in rows.items():
    regret = statistics.fmean(r for r, _ in values)
    near = sum(r < 0.01 for r, _ in values) / len(values)
    print(f"{name:26s} maliyet {values[0][1]:4d} birim, kayıp {regret:.4f}, en iyiye 0,01 yakın: %{100 * near:.0f}")
```

```cikti
hepsi tam bütçe            maliyet  729 birim, kayıp 0.0024, en iyiye 0,01 yakın: %94
yarılama, ilk tur 1 birim  maliyet  108 birim, kayıp 0.0097, en iyiye 0,01 yakın: %68
yarılama, ilk tur 3 birim  maliyet  243 birim, kayıp 0.0036, en iyiye 0,01 yakın: %89
```

Okuma: ilk tur bütçesi çok küçükse yarılama yedi kat ucuzdur ama iyi adayı sık eler; ilk tur birkaç ısınma
süresi kadar olunca üç kat ucuzlukla neredeyse aynı sonuç alınır. Kural: ilk tur bütçesi, en yavaş makul adayın
öğrenme eğrisinin "kıvrıldığı" noktadan kısa olmasın; eğrileri bir kez çizip bakın.

## Doğrulamaya aşırı uyum

Aramanın kendisi doğrulama kümesine uydurmadır. Bütün ayarlar **eşit derecede iyi** olsa bile en iyi görünenin puanı
deneme sayısıyla büyür:

```python calistir
import random
import statistics

rng = random.Random(7)
TRUE, NOISE = 0.800, 0.010  # bütün ayarlar aynı iyi; CV puanının gürültüsü ±0,01
for n in (1, 10, 100, 1000):
    best = [max(TRUE + rng.gauss(0, NOISE) for _ in range(n)) for _ in range(200)]
    print(f"{n:4d} eşdeğer ayar denendi → en iyinin CV puanı ortalama {statistics.fmean(best):.3f}")

# Bir standart hata (SH) kuralı: en iyiye bir SH yakın olanların EN BASİTİ seçilir.
cv = {  # C (küçük = daha çok düzenlileştirme = daha basit) → 5 katın puanları
    0.01: [0.781, 0.790, 0.770, 0.785, 0.779],
    0.1: [0.801, 0.812, 0.795, 0.806, 0.799],
    1.0: [0.806, 0.818, 0.796, 0.811, 0.804],
    10.0: [0.809, 0.815, 0.799, 0.810, 0.807],
}
summary = {c: (statistics.fmean(s), statistics.stdev(s) / len(s) ** 0.5) for c, s in cv.items()}
best_c = max(summary, key=lambda c: summary[c][0])
limit = summary[best_c][0] - summary[best_c][1]
chosen = min(c for c, (mean, _) in summary.items() if mean >= limit)
print(f"en yüksek ortalama C={best_c}, sınır {limit:.4f} → seçilen C={chosen}")
assert chosen == 1.0
```

```cikti
   1 eşdeğer ayar denendi → en iyinin CV puanı ortalama 0.800
  10 eşdeğer ayar denendi → en iyinin CV puanı ortalama 0.815
 100 eşdeğer ayar denendi → en iyinin CV puanı ortalama 0.825
1000 eşdeğer ayar denendi → en iyinin CV puanı ortalama 0.833
en yüksek ortalama C=10.0, sınır 0.8054 → seçilen C=1.0
```

Hiçbir ayar ötekinden iyi değilken 1000 deneme "3,3 puan kazanç" gösterir. Karşı önlemler:

| Önlem | Ne zaman |
| --- | --- |
| Arama bittikten sonra aramanın görmediği sınama kümesinde **bir kez** ölçmek | Veri yeterliyse her zaman |
| İç içe çapraz doğrulama (dış kat ölçer, iç kat arar) | Veri küçükse ([ayrım notu](ayrim-ve-capraz-dogrulama.md)) |
| Bir standart hata kuralı (one-standard-error rule): en iyiye 1 SH yakın olanların en basiti | Puanlar oynak, fark küçük |
| En iyi 3 adayı farklı tohum ve farklı kat bölünmesiyle yeniden koşmak | Kazanan "şanslı" olabilir |
| Deneme sayısını rapora yazmak | Okur iyimserliği tartabilsin |

## Kodda rastgele arama

Havuzdaki `ml-temel`'de rastgele arama ayrı sınıf olmadan yapılır: `GridSearchCV` bir **ızgara listesi** de alır;
her rastgele noktayı tek elemanlı bir ızgara yapın (ml-temel'in kendi ortamında denendi):

```python
import random

from ml_temel.klasik import LogisticRegression
from ml_temel.onisleme import StandardScaler, make_pipeline
from ml_temel.secim import GridSearchCV, StratifiedKFold

rng = random.Random(0)  # tohum: arama yeniden üretilebilir olsun
candidates = [{"logisticregression__C": [10 ** rng.uniform(-3, 2)]} for _ in range(40)]  # log-düzgün
search = GridSearchCV(make_pipeline(StandardScaler(), LogisticRegression()), candidates,
                      cv=StratifiedKFold(5, shuffle=True, random_state=0))
search.fit(X_dev, y_dev)  # sınama kümesi BURAYA girmez
print(search.best_params_, search.best_score_)  # best_score_ iyimserdir; rapor sınamadan
```

scikit-learn'de (1.9.1'de denendi, Kasım 2026): `RandomizedSearchCV(model, {"C": loguniform(1e-3, 1e2)},
n_iter=40, cv=..., random_state=0)` (`from scipy.stats import loguniform`). Ardışık yarılama
`HalvingRandomSearchCV` adıyla vardır ama **deneysel** işaretlidir: önce
`from sklearn.experimental import enable_halving_search_cv` gerekir.

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Seçilen değer ızgaranın kenarında (en küçük ya da en büyük) | Aralık dar; en iyi değer dışarıda | Aralığı o yöne genişletip yeniden arayın |
| Öğrenme oranı denemelerinin çoğu 0,1–1 arasında | Doğrusal örnekleme | Log-düzgün örnekleme; ızgara kat kat |
| CV'de en iyi ayar, sınamada tabandan iyi değil | Doğrulamaya aşırı uyum; çok deneme, küçük veri | Deneme sayısını azaltın; iç içe CV; bir SH kuralı |
| Arama günlerce sürdü, kazanç 0,2 puan | Varsayılan zaten yeterliydi; zaman yanlış yere | Önce taban + varsayılan; kazanç kat yayılımından küçükse durun |
| Aynı ayar iki koşuda farklı puan | Tohum ve kat bölünmesi her koşuda değişiyor | `random_state` sabit; adaylar aynı katlarla |
| Gradyan artırmada tur sayısı ızgaraya konmuş | Erken durdurmanın işi aramaya yüklendi | Turu erken durdurma bulsun; aramadan çıkarın |
| Erken durdurma doğrulama katına bakıyor, puan da o kattan | Aynı kat hem durdurdu hem ölçtü | Eğitim katının içinden ayrı durdurma parçası |
| Yarılama en iyi ayarı ilk turda eledi | İlk tur bütçesi yavaş öğrenenler için çok kısa | İlk turu büyütün; eğrilere bakın |
| Arama yarıda kesildi, her şey kayboldu | Sonuçlar yalnız bellekte | Her denemeyi anında dosyaya yazın; kaldığı yerden sürün |
| Ön işleme (ölçekleme, kodlama) bütün veride uyduruldu | Sızıntı aramaya taşındı | `Pipeline` içinde ara ([veri sızıntısı](veri-sizintisi.md)) |

## Denetim listesi

- [ ] Arama başlamadan bütçe (deneme × kat × süre) yazıldı ve taban + varsayılan ayar ölçüldü.
- [ ] Her ayarın aralığı ve ölçeği (log/doğrusal/tamsayı) gerekçesiyle yazıldı.
- [ ] Yinelemeli modellerde tur sayısı erken durdurmayla bulunuyor, aranmıyor.
- [ ] Bütün adaylar aynı katlarla ve sabit tohumla değerlendirildi; sonuçlar deneme deneme dosyada.
- [ ] Seçilen değerlerin hiçbiri aralığın kenarında değil (ya da aralık genişletilip yeniden bakıldı).
- [ ] En iyi ayar ile varsayılan arasındaki fark kat yayılımıyla birlikte raporlandı.
- [ ] Raporlanan başarı aramanın görmediği veriden (sınama ya da iç içe CV) geliyor; deneme sayısı yazılı.
- [ ] Son model seçilen ayarla bütün geliştirme verisinde yeniden eğitildi.

## Küçük modele yaptırırken

- **İsteme yazın:** "Önce varsayılan ayarla 5 katlı CV ortalama ± std ver. Sonra en çok 40 denemelik rastgele
  arama yap: öğrenme oranı ve cezalar log-düzgün, tohum 0. Her denemeyi `aramalar.jsonl` dosyasına satır satır yaz.
  Sınama kümesini kullanma. Sonunda en iyi 5 ayarı ve varsayılanı aynı tabloda ± std ile göster."
- **Modelin tipik hatası:** ızgarayı doğrusal yazar (`[0.1, 0.2, …, 1.0]`); tur sayısını ızgaraya koyar; her şeyi
  bir ızgarada çarpıp yüzlerce birleşim üretir; `best_score_`'u son başarı diye yazar; varsayılanla karşılaştırmayı
  unutur; ızgara kenarındaki sonucu fark etmez.
- **Çıktıda denetleyin:** aday sayısı (`len(candidates)`) bütçeyle uyumlu mu; log ölçekli ayarlar `10 **` ya da
  `loguniform` ile mi örnekleniyor; seçilen değer kenarda mı; sınama kümesi aramada geçiyor mu.
- **Sorun:** "En iyi ayar varsayılandan kaç standart sapma iyi? Bu fark başka bir tohumla da çıkıyor mu?"

## İlgili

- [Ayrım ve çapraz doğrulama](ayrim-ve-capraz-dogrulama.md) — iç içe CV kodu, seçimin iyimserliği
- [Ağaç toplulukları](agac-topluluklari.md) — gradyan artırmada sıralı ayar ve başlangıç değerleri
- [Aşırı öğrenme](asiri-ogrenme.md) — erken durdurma · [Derin öğrenme temelleri](derin-ogrenme-temelleri.md) —
  öğrenme oranı taraması
- [Eğitim hata ayıklama](egitim-hata-ayiklama.md) — tohum ve yeniden üretilebilirlik · [MLOps](mlops.md) — deney kaydı
- [Optimizasyon](../92-matematik/optimizasyon.md) · [Rastgelelik ve benzetim](../92-matematik/rastgelelik-ve-benzetim.md)
- Izgara araması ve iyimserlik notu: [`ml_temel/secim/search.py`](../../ml-temel/ml_temel/secim/search.py)
- İnce ayar başlangıç değerleri ve belirtiye göre ayar: [`ince-ayar/docs/HIPERPARAMETRE.md`](../../ince-ayar/docs/HIPERPARAMETRE.md)
