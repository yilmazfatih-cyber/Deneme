---
baslik: Etiketleme ve aktif öğrenme
ozet: Etiket kılavuzu şablonu, çok etiketçili uyum (Fleiss ve ağırlıklı kappa), kontrol soruları ve çoğunluk oyu, etiket bütçesi hesabı, belirsizlik örneklemesiyle aktif öğrenme ve tuzakları; çalışan örneklerle.
etiketler: [makine-ogrenmesi, etiket, aktif-ogrenme, kappa, veri-kalitesi]
duzey: orta
guncellik: 2026-11
---

# Etiketleme ve aktif öğrenme

> Bu notu ne zaman okumalı: bir sınıflandırıcı için etiketli veri toplanacakken; etiketçilere (insan ya da model)
> iş verilmeden önce; "hangi örnekleri etiketletelim, kaç tane yeter?" sorusunda; etiketler arasında çelişki
> görüldüğünde.

## Temel fikir

Model etiketin **tanımını** öğrenir ([veri ve etiket kalitesi](veri-ve-etiket.md)). Tanım bir belgedir: etiket
kılavuzu. Kılavuz yazılmadan etiketlenen veri, her etiketçinin kafasındaki farklı tanımların karışımıdır ve
sonradan temizlenmesi etiketlemekten pahalıdır. Sıra şudur:

1. Kılavuz → 2. iki-üç kişiyle küçük pilot ve uyum ölçümü → 3. kılavuzu düzelt → 4. bütçeyi hesapla →
5. etiketle (kontrol soruları ve ikinci okuma payıyla) → 6. hataları ara, kılavuzu sürümle.

Aktif öğrenme (active learning) 5. adımda **hangi** öğenin etiketleneceğini seçer: modelin en kararsız olduğu
öğeler. Az pozitifli işlerde aynı başarıya çok daha az etiketle ulaştırır; bedeli, etiketli kümenin artık nüfusu
temsil etmemesidir. Bu yüzden **sınama kümesi her zaman rastgele seçilir.**

## Karar tablosu

| Durum | Seçim | Neden |
| --- | --- | --- |
| Sınıflar dengeli, etiket ucuz | Rastgele örnekleme | Basit; temsilî; aktif öğrenmenin kazancı küçük |
| Az pozitif (%1–10), etiket pahalı | Belirsizlik örneklemesi + rastgele sınama kümesi | Etiket bütçesi sınır bölgesine gider |
| Henüz model yok, hiç etiket yok | 50–200 rastgele (ya da anahtar sözcükle zenginleştirilmiş) öğe | Soğuk başlangıç: kararsızlığı ölçecek model yok |
| Sınama kümesi | Her zaman rastgele, iki kişiyle, en dikkatli etiket | Ölçüm temsilî ve temiz olmalı |
| Sıralı ölçek (ciddiyet 1–3, memnuniyet 1–5) | Ağırlıklı kappa | Komşu puan anlaşmazlığı tam anlaşmazlık değildir |
| 3+ etiketçi | Fleiss kappa + karışan sınıf çiftleri | Kimin değil, hangi tanımın sorunlu olduğu görünür |
| Etiketçi kalitesi bilinmiyor | Akışa %5 kontrol sorusu; ağırlıklı oy | Özensiz etiketçi çoğunluğu bozar |
| Bir model etiketliyor | [Dil modeliyle veri etiketleme](../85-llm/llm-ile-veri-etiketleme.md) | Model de ölçülmesi gereken bir etiketçidir |

## Etiket kılavuzu şablonu

```text
Etiket kılavuzu — destek iletisi konusu · sürüm 3 · 2026-11-20
Görev: Müşterinin iletisini OKUYUN, iletinin ANA isteğine göre TEK etiket seçin.

iade       Ürünü geri göndermek ya da parasını geri almak istiyor.
           Dahil: "değiştirmek istiyorum" (değişim de iade akışından geçer).
           Hariç: yalnız "iade ne kadar sürer?" diye soruyor → bilgi
kargo      Teslimatın yeri, zamanı, durumu. Hariç: hasarlı geldi ve iade istiyor → iade
bilgi      Ürün, fiyat, süreç sorusu; bir işlem istemiyor.
diger      Yukarıdakilerin hiçbiri. "diger" bir çöp kutusu değildir: notunu yazın.
emin_degilim  İki etiket eşit derecede uyuyorsa. Not alanına iki adayı yazın.

Sınır durumları (pilotta en çok karışanlar):
  "Kargo gecikti, artık istemiyorum, paramı iade edin"  → iade (ana istek para)
  "İadem ne durumda?"                                     → iade (işlem süren iade)
Kural: İleti birden çok istek içeriyorsa SON cümledeki isteğe bakın.
Değişiklik günlüğü: s3 — "değişim" iade'ye alındı (pilot kappa 0,52 → 0,71).
```

Kılavuzun iyi olduğunun ölçüsü uyumdur. Her sürüm değişikliğinde hangi örneklerin etkilendiği yazılır; eski sürümle
etiketlenmiş veri ya yeniden etiketlenir ya da sürüm sütunuyla ayrı tutulur.

## Pilot ve uyum ölçümü

İki kişilik Cohen kappa ve "ham uyuşma yanıltır" dersi [veri ve etiket kalitesi](veri-ve-etiket.md) notunda. Burada
iki eksik parça: üç etiketçi (Fleiss kappa, karışan çiftler) ve sıralı ölçek (ağırlıklı kappa):

```python calistir
from collections import Counter
from itertools import combinations

# 3 etiketçi, 12 destek iletisi; her satır bir ileti: (A, B, C)
items = [
    ("iade", "iade", "iade"), ("kargo", "kargo", "kargo"), ("iade", "kargo", "iade"),
    ("diger", "diger", "diger"), ("kargo", "kargo", "iade"), ("iade", "iade", "iade"),
    ("kargo", "iade", "kargo"), ("diger", "kargo", "diger"), ("iade", "iade", "kargo"),
    ("kargo", "kargo", "kargo"), ("diger", "diger", "iade"), ("iade", "iade", "iade"),
]


def fleiss_kappa(rows):
    n, categories = len(rows[0]), sorted({label for row in rows for label in row})
    counts = [Counter(row) for row in rows]
    p_item = [(sum(c[k] ** 2 for k in categories) - n) / (n * (n - 1)) for c in counts]
    p_cat = [sum(c[k] for c in counts) / (len(rows) * n) for k in categories]
    observed, expected = sum(p_item) / len(rows), sum(p * p for p in p_cat)
    return (observed - expected) / (1 - expected)


confused = Counter()
for row in items:
    for a, b in combinations(row, 2):
        if a != b:
            confused[tuple(sorted((a, b)))] += 1
print(f"Fleiss kappa: {fleiss_kappa(items):.2f}")
print("en çok karışan çiftler:", confused.most_common(2))


def weighted_kappa(pairs, levels, power):  # power 0: ağırlıksız, 1: doğrusal, 2: karesel
    n = len(pairs)
    count_a, count_b = Counter(a for a, _ in pairs), Counter(b for _, b in pairs)
    weight = lambda i, j: (0 if i == j else 1) if power == 0 else abs(i - j) ** power
    observed = sum(weight(a, b) for a, b in pairs) / n
    expected = sum(weight(i, j) * count_a[i] * count_b[j] for i in levels for j in levels) / (n * n)
    return 1 - observed / expected


# İki kişi şikâyetin ciddiyetini 1–3 puanlıyor; anlaşmazlıkların çoğu komşu puanda
severity = [(1, 1)] * 10 + [(2, 2)] * 6 + [(3, 3)] * 6 + [(1, 2)] * 4 + [(2, 3)] * 3 + [(1, 3)] * 1
for name, power in (("ağırlıksız", 0), ("doğrusal", 1), ("karesel", 2)):
    print(f"{name:10s} kappa: {weighted_kappa(severity, (1, 2, 3), power):.2f}")
```

```cikti
Fleiss kappa: 0.47
en çok karışan çiftler: [(('iade', 'kargo'), 8), (('diger', 'kargo'), 2)]
ağırlıksız kappa: 0.60
doğrusal   kappa: 0.67
karesel    kappa: 0.73
```

Okuma: Fleiss 0,47 zayıftır ama sorun dağınık değil: anlaşmazlıkların çoğu **iade–kargo** sınırında. Çare daha çok
etiketçi değil, o sınır için kılavuza bir kural ve iki örnektir. Ciddiyet puanında ağırlıksız kappa 1–2 ile 1–3
anlaşmazlığını aynı sayar; sıralı ölçekte ağırlıklı kappayı raporlayın ve hangi ağırlığı kullandığınızı yazın
(sonuçlar scikit-learn `cohen_kappa_score(weights=...)` ile aynı çıktı). Kaba yorum yaygın kullanımdır, kesin eşik
değildir: 0,6 altı zayıf, 0,8 üstü iyi.

## Kontrol soruları ve çoğunluk oyu

Doğru yanıtı bilinen öğeler (kontrol soruları, gold questions) etiketçinin akışına fark ettirmeden karıştırılır;
etiketçinin doğruluğu bunlarla ölçülür. Üç kişinin çoğunluk oyu genelde tek kişiden iyidir; ama **özensiz bir
etiketçi** varsa çoğunluk, en iyi tek kişinin altına düşer:

```python calistir
import math
import random

rng = random.Random(4)


def label(truth, accuracy):  # ikili etiket: doğruluk olasılığıyla doğru, yoksa ters
    return truth if rng.random() < accuracy else 1 - truth


def run(accuracies, items=5000, gold=50):
    # Kontrol soruları: doğru yanıtı bilinen 50 öğe her etiketçinin akışına karışık konur.
    measured = []
    for acc in accuracies:
        hits = sum(label(1, acc) == 1 for _ in range(gold))
        measured.append(min(max(hits / gold, 0.51), 0.99))  # 0 ve 1'e yapışmasın
    weights = [math.log(p / (1 - p)) for p in measured]  # log-olasılık oranı ağırlığı
    majority = weighted = 0
    for _ in range(items):
        truth = rng.randint(0, 1)
        votes = [label(truth, acc) for acc in accuracies]
        majority += (sum(votes) * 2 > len(votes)) == truth
        score = sum(w if v else -w for v, w in zip(votes, weights))
        weighted += (score > 0) == truth
    return [round(m, 2) for m in measured], majority / items, weighted / items


for name, accs in (("üç özenli etiketçi", (0.90, 0.90, 0.90)), ("iki özenli + bir özensiz", (0.92, 0.88, 0.55))):
    measured, majority, weighted = run(accs)
    print(f"{name}: kontrol sorusu doğruluğu {measured}")
    print(f"   en iyi tek kişi {max(accs):.2f} · çoğunluk oyu {majority:.3f} · ağırlıklı oy {weighted:.3f}")
```

```cikti
üç özenli etiketçi: kontrol sorusu doğruluğu [0.92, 0.86, 0.86]
   en iyi tek kişi 0.90 · çoğunluk oyu 0.973 · ağırlıklı oy 0.973
iki özenli + bir özensiz: kontrol sorusu doğruluğu [0.98, 0.92, 0.51]
   en iyi tek kişi 0.92 · çoğunluk oyu 0.907 · ağırlıklı oy 0.918
```

Kurallar:

- Kontrol sorusu payı akışın ~%5'i; sorular gerçek öğelere benzer (kolay olanlar etiketçiyi ölçmez).
- 50 kontrol sorusu kaba bir ölçümdür (±10 puan); karar "bu kişi özensiz mi" düzeyinde verilir, sıralama için değil.
- Doğruluğu şansa yakın çıkan etiketçinin etiketleri ağırlıklı oyda neredeyse sıfır ağırlık alır; daha iyisi,
  nedenini konuşup (kılavuzu mu anlamadı, acele mi ediyor) gerekirse etiketlerini atmaktır.
- Uyuşmazlık çıkan öğeler "çöp" değil, kılavuzun eksik yeridir: birkaçını kılavuza sınır örneği olarak ekleyin.

## Etiket bütçesi

Bütçe üç kalemdir: sınama kümesi (ölçüm hassasiyetinden), eğitim kümesi (öğrenme eğrisinden) ve kalite payı
(ikinci okuma + kontrol sorusu). Süre pilottan **ölçülür**:

```python calistir
import math

SECONDS_PER_ITEM = 25  # pilottan ölçülen ortanca süre (tahmin etmeyin, ölçün)
HOURLY_COST = 300  # TL/saat, kurgusal
test_items = math.ceil(1.96**2 * 0.85 * 0.15 / 0.03**2)  # doğruluk ~%85 beklenirken ±3 puan
train_items = 4 * 150  # 4 sınıf × 150; öğrenme eğrisiyle sonradan doğrulanır
DOUBLE, GOLD = 0.20, 0.05  # eğitimde ikinci kişiye giden pay; akışa karışan kontrol sorusu payı
labels = math.ceil((2 * test_items + train_items * (1 + DOUBLE)) * (1 + GOLD))  # sınama iki kişiyle
hours = labels * SECONDS_PER_ITEM / 3600
cost = f"{hours * HOURLY_COST:,.0f}".replace(",", ".")
print(f"sınama {test_items} öğe, eğitim {train_items} öğe → toplam {labels} etiketleme")
print(f"{hours:.1f} saat, yaklaşık {cost} TL")
assert test_items == 545
```

```cikti
sınama 545 öğe, eğitim 600 öğe → toplam 1901 etiketleme
13.2 saat, yaklaşık 3.960 TL
```

Okuma: sınama kümesi bütçenin yarısından fazlasını yiyor; hassasiyeti ±3'ten ±5 puana gevşetmek onu üçte birine
indirir. Eğitim miktarı tahmindir: 300 etiketle eğitip öğrenme eğrisine bakın, sonra karar verin
([veri ve etiket kalitesi](veri-ve-etiket.md)). İnsan bir saatte ~100 öğeden fazlasını dikkatle okuyamaz; günde
4–5 saati geçen etiketleme oturumunda kontrol sorusu doğruluğu düşer.

## Aktif öğrenme: belirsizlik örneklemesi

Havuzda %8 pozitif ("acil" ileti) var. 10 rastgele etiketle başlanıyor; her turda 10 öğe etiketleniyor: ya rastgele
ya da modelin 0,5'e en yakın olasılık verdiği (en kararsız) öğeler. Model lojistik regresyon; ölçüt rastgele sınama
kümesinde pozitif sınıfın F1'i; 20 tohumun ortalaması:

```python calistir
import math
import random
import statistics


def make(rng, n):  # %8 pozitif (ör. "acil" ileti); iki sınıf iki boyutta örtüşüyor
    rows = []
    for _ in range(n):
        y = int(rng.random() < 0.08)
        rows.append(((rng.gauss(2.5 * y, 1), rng.gauss(1.5 * y, 1)), y))
    return rows


def fit(rows, l2=0.1, steps=8):  # L2 cezalı lojistik regresyon, Newton adımları (3 parametre)
    w = [0.0, 0.0, 0.0]
    for _ in range(steps):
        g = [l2 * wi for wi in w]
        h = [[l2 * (i == j) for j in range(3)] for i in range(3)]
        for (x1, x2), y in rows:
            f = (1.0, x1, x2)
            p = 1 / (1 + math.exp(-sum(a * b for a, b in zip(w, f))))
            for i in range(3):
                g[i] += (p - y) * f[i]
                for j in range(3):
                    h[i][j] += p * (1 - p) * f[i] * f[j]
        a = [row + [gi] for row, gi in zip(h, g)]  # h · d = g (Gauss–Jordan)
        for c in range(3):
            pivot = max(range(c, 3), key=lambda r: abs(a[r][c]))
            a[c], a[pivot] = a[pivot], a[c]
            for r in range(3):
                if r != c:
                    a[r] = [x - a[r][c] / a[c][c] * y for x, y in zip(a[r], a[c])]
        w = [wi - a[i][3] / a[i][i] for i, wi in enumerate(w)]
    return lambda x: 1 / (1 + math.exp(-(w[0] + w[1] * x[0] + w[2] * x[1])))


def f1(model, rows):
    pairs = [(model(x) > 0.5, y == 1) for x, y in rows]
    tp = sum(p and y for p, y in pairs)
    return 2 * tp / (2 * tp + sum(p != y for p, y in pairs))


def run(seed, strategy, budgets=(20, 40, 80, 160)):
    rng = random.Random(seed)
    pool, test = make(rng, 2000), make(rng, 1000)
    labeled, pool, out = pool[:10], pool[10:], []  # 10 rastgele etiketle başla
    while len(labeled) < budgets[-1]:
        if strategy == "belirsizlik":
            model = fit(labeled)
            pool.sort(key=lambda r: abs(model(r[0]) - 0.5))  # en kararsız 10 öğe etiketlenir
        labeled, pool = labeled + pool[:10], pool[10:]
        if len(labeled) in budgets:
            out.append((f1(fit(labeled), test), statistics.fmean(y for _, y in labeled)))
    return out


results = {s: [run(seed, s) for seed in range(20)] for s in ("rastgele", "belirsizlik")}
print("etiket  F1 rastgele  F1 belirsizlik  etiketli kümede pozitif (rastgele / belirsizlik)")
for i, budget in enumerate((20, 40, 80, 160)):
    f = {s: statistics.fmean(r[i][0] for r in results[s]) for s in results}
    pos = {s: statistics.fmean(r[i][1] for r in results[s]) for s in results}
    print(f"{budget:5d}   {f['rastgele']:.3f}        {f['belirsizlik']:.3f}           "
          f"%{100 * pos['rastgele']:.0f} / %{100 * pos['belirsizlik']:.0f}")
```

```cikti
etiket  F1 rastgele  F1 belirsizlik  etiketli kümede pozitif (rastgele / belirsizlik)
   20   0.501        0.497           %7 / %18
   40   0.634        0.764           %8 / %35
   80   0.737        0.770           %8 / %43
  160   0.749        0.772           %8 / %42
```

Okuma:

- Belirsizlik örneklemesi **40 etiketle**, rastgele örneklemenin **160 etiketle** vardığı yerin üstünde. Kazanç az
  pozitifli işten gelir: rastgele seçim etiket bütçesini zaten bilinen negatiflere harcar.
- 20 etikette fark yok: model kararsızlığı ölçecek kadar iyi değil (soğuk başlangıç).
- Etiketli kümede pozitif oranı %42; nüfusta %8. Bu küme **ölçüm için kullanılamaz** (başarı, oran, eşik): her
  şey ayrı, rastgele seçilmiş sınama kümesinde ölçülür.

Pratik kurallar:

| Konu | Kural |
| --- | --- |
| Toplu seçim | Her turda en kararsız 10 öğenin hepsi aynı yerden gelebilir; en kararsız 50'den çeşitli 10 seçin (kümeleyip her kümeden bir) |
| Gürültü | Doğası gereği belirsiz öğeler (iki sınıfa da uyan iletiler) hep "kararsız" görünür; "emin_degilim" oranı yükseliyorsa durun ya da kılavuza bakın |
| Model değişirse | Bir modelin kararsızlığına göre seçilen veri başka bir modele daha az yarar; seçimin hangi modelle yapıldığını kaydedin |
| Durma | Rastgele sınama F1'i iki-üç tur boyunca kat yayılımından az artıyorsa durun |
| Karışım | Her turda %10–20 rastgele öğe ekleyin: hem keşif hem dağılımı izleme |

## Etiket hatası bulma

- Modelin emin olduğu hâlde etiketle çeliştiği öğeleri gözden geçirmek, rastgele denetimden kat kat verimlidir
  ([hata analizi](hata-analizi.md)); olasılıklar kat dışı tahminlerden gelsin.
- Etiketçi bazında bakın: bir kişinin etiketleri çoğunlukla sistematik olarak bir sınıfa kayıyorsa (hep "diger")
  sorun kişide değil çoğu zaman kılavuzun o kişiye ulaşan sürümündedir.
- Aynı (ya da katlanmış hâli aynı) metnin iki etiketi varsa biri yanlıştır:
  [`ince_ayar/data/checks.py`](../../ince-ayar/ince_ayar/data/checks.py).
- Düzeltme kuralı: şüpheli öğe iki yeni kişiye gösterilir; eski ve yeni etiket, kim ve neden kaydedilir. Sınama
  kümesinde düzeltme yalnız modelin çıktısına bakmadan yapılır (yoksa ölçüm modele doğru kayar).

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Pilot kappa düşük, herkes "kılavuz açık" diyor | Sınır durumları yazılmamış | Karışan çiftleri çıkarın; her biri için kural + iki örnek |
| Çoğunluk oyu tek tek etiketçilerden kötü | Özensiz bir etiketçi | Kontrol soruları; ağırlıklı oy; nedenini konuşun |
| "diger" sınıfı büyüyor | Zor öğeler çöp kutusuna atılıyor | "emin_degilim" ayrı; "diger"e not zorunlu |
| Aktif öğrenmeyle model iyi görünüyor, canlıda kötü | Etiketli (seçilmiş) kümede ölçüldü | Rastgele sınama kümesi; aktif kümeyi ölçüme katmayın |
| Pozitif oranı kestirimi abartılı | Seçilmiş örnekten oran hesaplandı | Oranı yalnız rastgele örnekten kestirin |
| Aktif öğrenme rastgeleden iyi değil | Sınıflar dengeli ya da model çok zayıf | Rastgele örnekleme; önce daha çok rastgele etiket |
| Etiketler kılavuz sürümleri arasında tutarsız | Kılavuz değişti, eski veri kaldı | Sürüm sütunu; etkilenen sınıfları yeniden etiketleyin |
| Etiketleme hızı yükseldi, kalite düştü | Yorgunluk, acele | Kontrol sorusu doğruluğunu oturum oturum izleyin; kısa oturum |
| Sınama etiketleri eğitim etiketçisiyle aynı kişiden | Sistematik hata ölçümde görünmez | Sınamayı bağımsız iki kişiye koydurun |

## Denetim listesi

- [ ] Kılavuz yazılı: tanım, dahil/hariç, sınır örnekleri, "emin_degilim" kuralı, sürüm ve değişiklik günlüğü.
- [ ] Pilotta en az 100 öğe 2–3 kişiyle etiketlendi; kappa ve karışan çiftler raporlandı; kılavuz güncellendi.
- [ ] Sıralı ölçekte ağırlıklı kappa ve ağırlık türü yazıldı.
- [ ] Akışta kontrol soruları var; etiketçi başına doğruluk izleniyor.
- [ ] Bütçe hesabı (sınama, eğitim, kalite payı, ölçülen süre) yazılı.
- [ ] Sınama kümesi rastgele seçildi, iki kişiyle etiketlendi, aktif öğrenme kümesinden ayrı.
- [ ] Aktif öğrenme kullanıldıysa seçim modeli, tur sayısı ve durma ölçütü kayıtlı.
- [ ] Çelişen etiket ve yinelenen öğe taraması yapıldı; düzeltmeler gerekçesiyle kaydedildi.

## Küçük modele yaptırırken

- **İsteme yazın:** "Etiketleri değerlendirmeden önce uyumu ölç: üç etiketçi için Fleiss kappa, sınıf çiftlerine
  göre anlaşmazlık sayıları. Sıralı puan için doğrusal ağırlıklı kappa. Aktif öğrenme turlarında sınama kümesini
  rastgele seçilmiş ayrı dosyadan oku; etiketli havuzdan ölçüm yapma."
- **Modelin tipik hatası:** yalnız ham uyuşma yüzdesi verir; aktif öğrenmeyle seçilmiş kümede başarı ölçer; her
  turda en kararsız öğeleri körü körüne seçip aynı bölgeden on kopya etiketletir; kılavuz yerine "sağduyunu kullan"
  yazar; etiketçiler arasında anlaşmazlık olunca rastgele birini seçer.
- **Çıktıda denetleyin:** sınama kümesinin nereden geldiği; kappa hesabında beklenen uyuşmanın nasıl bulunduğu;
  etiketli kümenin sınıf oranının nüfusla karşılaştırıldığı; düzeltmelerin kaydı.
- **Sorun:** "Bu etiketi iki kişi görse aynısını koyar mıydı? Koymazsa kılavuzun hangi satırı eksik?"

## İlgili

- [Veri ve etiket kalitesi](veri-ve-etiket.md) — Cohen kappa, gürültünün ölçüm tavanı, öğrenme eğrisi
- [Hata analizi](hata-analizi.md) — etiket hatası bulma, karışan sınıflar
- [Metin sınıflandırma](metin-siniflandirma.md) — etiket tasarımı ve "emin değilim" sınıfı
- [Dil modeliyle veri etiketleme](../85-llm/llm-ile-veri-etiketleme.md) — modeli etiketçi olarak kullanmak
- [Değerlendirme ölçütleri](degerlendirme-olcutleri.md) — F1, güven aralığı · [Anket ve örneklem](../70-veri/anket-ve-orneklem.md)
  — hata payı ve örneklem büyüklüğü
- Çelişen etiket ve tek örnekli sınıf denetimi: [`ince_ayar/data/checks.py`](../../ince-ayar/ince_ayar/data/checks.py);
  yakın kopyaları gruplama: [`ince_ayar/data/neardup.py`](../../ince-ayar/ince_ayar/data/neardup.py)
