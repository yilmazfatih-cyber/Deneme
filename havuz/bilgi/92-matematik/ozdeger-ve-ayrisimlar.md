---
baslik: Özdeğer ve ayrışımlar
ozet: Özvektör sezgisi, güç yinelemesi ve PageRank, simetrik matrisler, SVD ve PCA ile boyut indirgeme; merkezleme, ölçekleme, işaret belirsizliği ve AᵀA kurmanın sayısal tehlikesi.
etiketler: [lineer-cebir, ozdeger, svd, pca, boyut-indirgeme, sayisal-kararlilik]
duzey: orta
guncellik: 2026-11
---

# Özdeğer ve ayrışımlar

> Bu notu ne zaman okumalı: PCA ile boyut indirgerken ya da bir PCA grafiğini yorumlarken; "açıklanan varyans"
> oranı gördüğünüzde; PageRank, öneri sistemi ya da düşük ranklı yaklaşım konuşulurken; özvektörlerin işareti
> çalıştırmadan çalıştırmaya değiştiğinde.

## Temel fikir

- Bir matris çoğu vektörü hem döndürür hem uzatır. **Özvektör** (eigenvector) yalnız uzayan (ya da kısalan) özel
  yöndür: `A·v = λ·v`. **Özdeğer** `λ` o yöndeki uzama katsayısıdır.
- Matrisi tekrar tekrar uygularsanız her vektör en büyük özdeğerin yönüne döner. **Güç yinelemesi** (power
  iteration) budur; PageRank ve "uzun vadeli durum" hesapları böyle çalışır.
- **Simetrik** matrislerin (kovaryans, benzerlik matrisi) özdeğerleri gerçek, özvektörleri birbirine diktir. Bu
  yüzden PCA bileşenleri diktir.
- **SVD** her matrisi "döndür · eksenler boyunca ger · döndür" diye yazar: `A = U·S·Vᵀ`. Tekil değerler (`S`)
  her yönün ağırlığıdır. Büyük birkaç tanesini tutmak, bilginin çoğunu az sayıyla saklamaktır.
- **PCA** = merkezlenmiş verinin SVD'si = kovaryans matrisinin özvektörleri. Birinci bileşen verinin en çok
  yayıldığı yöndür. Sonuç **birimlere** bağlıdır: ölçeklemeden yapılan PCA en büyük birimli sütunu bulur.

## Karar tablosu

| Soru                                                         | Yöntem                                      | Not                                                      |
| ------------------------------------------------------------ | ------------------------------------------- | -------------------------------------------------------- |
| Yalnız en baskın yön/özdeğer (sıralama, kararlı durum)       | Güç yinelemesi                              | Hız `λ₂/λ₁` oranına bağlı                                 |
| Küçük simetrik matrisin bütün özdeğerleri                    | Kütüphanede simetrik çözücü (`eigh`)        | Genel `eig` karmaşık sayı ve sırasız sonuç verebilir     |
| Boyut indirgeme, görselleştirme, gürültü azaltma             | PCA (SVD ile), önce merkezleme + ölçekleme  | Kaç bileşen: açıklanan varyansın birikimli eğrisi        |
| Kullanıcı × ürün matrisinden öneri, gizli etken              | Düşük ranklı ayrışım (kesilmiş SVD, matris tamamlama) | Eksik değerlerle düz SVD yapılmaz                |
| Doğrusal sistem çözmek                                       | Eleme/QR ([lineer cebir](lineer-cebir-sezgisi.md)) | Özdeğer ayrışımı gerekmez                          |
| Doğrusal olmayan yapı (kıvrımlı küme) görselleştirme         | PCA yetmez; t-SNE/UMAP gibi yöntemler       | Onların eksenleri ve uzaklıkları yorumlanmaz             |

## Güç yinelemesi: baskın yön ve yakınsama hızı

```python calistir
import math


def matvec(M, v):
    return [sum(a * b for a, b in zip(row, v)) for row in M]


def power_iteration(M, tol=1e-10, max_iter=100_000):
    """En büyük özdeğer ve özvektör. Durma ölçütü vektörün kendisinde (özdeğer daha erken durur)."""
    v = [1.0] + [0.3] * (len(M) - 1)  # baskın özvektöre dik olmayan bir başlangıç
    for k in range(1, max_iter + 1):
        w = matvec(M, v)
        size = math.sqrt(sum(x * x for x in w))
        w = [x / size for x in w]
        if max(abs(a - b) for a, b in zip(w, v)) < tol:
            eigenvalue = sum(a * b for a, b in zip(w, matvec(M, w)))  # Rayleigh bölümü
            return eigenvalue, w, k
        v = w
    raise RuntimeError("yakınsamadı: λ₁ ile λ₂ çok yakın ya da baskın özdeğer negatif olabilir")


lam, vec, steps_fast = power_iteration([[2.0, 1.0], [1.0, 2.0]])  # özdeğerler 3 ve 1
assert math.isclose(lam, 3.0) and all(math.isclose(x, 1 / math.sqrt(2)) for x in vec)
Av = matvec([[2.0, 1.0], [1.0, 2.0]], vec)
assert all(math.isclose(a, lam * b) for a, b in zip(Av, vec))  # A·v = λ·v

_, _, steps_slow = power_iteration([[1.0, 0.0], [0.0, 0.99]])  # λ₂/λ₁ = 0,99
print("λ₂/λ₁ = 1/3:", steps_fast, "adım | λ₂/λ₁ = 0,99:", steps_slow, "adım")
assert steps_slow > 50 * steps_fast
```

Her adımda hata `λ₂/λ₁` kadar küçülür. Oran 1'e yakınsa yöntem yavaşlar; eşitse (ya da `λ` ile `−λ` gibi eşit
büyüklükte iki özdeğer varsa) hiç yakınsamaz. Durma ölçütünü özdeğere koymayın: özdeğer, vektörden çok daha erken
"yakınsamış" görünür.

## PageRank: güç yinelemesinin en ünlü kullanımı

Bir sayfanın önemi, ona bağlantı veren sayfaların öneminden pay alır. Bu, bağlantı matrisinin baskın özvektörüdür.

```python calistir
links = {"A": ["B", "C"], "B": ["C"], "C": ["A"], "D": ["C"]}  # D'ye kimse bağlantı vermiyor
pages, damping = sorted(links), 0.85
rank = {p: 1 / len(pages) for p in pages}
for step in range(1, 200):
    new = {p: (1 - damping) / len(pages) for p in pages}  # rastgele sıçrama payı
    for page, outs in links.items():
        for target in outs:
            new[target] += damping * rank[page] / len(outs)
    change = sum(abs(new[p] - rank[p]) for p in pages)
    rank = new
    if change < 1e-12:
        break

assert abs(sum(rank.values()) - 1) < 1e-9  # olasılık dağılımı
assert max(rank, key=rank.get) == "C"  # en çok bağlantı alan
assert abs(rank["D"] - 0.15 / 4) < 1e-12  # yalnız sıçrama payı
print({p: round(r, 3) for p, r in rank.items()}, "|", step, "adımda")
```

Sönümleme (damping) iki işe yarar: döngülere takılmayı önler ve `λ₂/λ₁ ≤ 0,85` yaparak hızlı yakınsama sağlar.
Dışarı bağlantısı olmayan sayfa (dangling node) varsa onun payını bütün sayfalara dağıtın; yoksa toplam sıra
1'den eksilir.

## PCA: elle, iki boyutta

```python calistir
import math
import random

rng = random.Random(0)
points = []
for _ in range(2000):  # veri (1, 2) yönünde uzanıyor
    t = rng.gauss(0, 3)
    points.append((t + rng.gauss(0, 0.5), 2 * t + rng.gauss(0, 0.5)))

n = len(points)
mx, my = sum(p[0] for p in points) / n, sum(p[1] for p in points) / n
sxx = sum((x - mx) ** 2 for x, _ in points) / (n - 1)
syy = sum((y - my) ** 2 for _, y in points) / (n - 1)
sxy = sum((x - mx) * (y - my) for x, y in points) / (n - 1)
C = [[sxx, sxy], [sxy, syy]]  # kovaryans matrisi: simetrik

# 2x2 simetrik matrisin özdeğerleri kapalı formülle: iz/2 ± √((iz/2)² − det)
half_trace, det = (sxx + syy) / 2, sxx * syy - sxy * sxy
lam1 = half_trace + math.sqrt(half_trace**2 - det)
lam2 = half_trace - math.sqrt(half_trace**2 - det)
v1 = [sxy, lam1 - sxx]
size = math.hypot(*v1)
v1 = [v1[0] / size, v1[1] / size]
v2 = [-v1[1], v1[0]]  # simetrik matriste ikinci bileşen birinciye diktir

assert abs(v1[0] / math.sqrt(5) + v1[1] * 2 / math.sqrt(5)) > 0.999  # gerçek yönle aynı
assert abs(sum(a * b for a, b in zip(C[0], v2)) - lam2 * v2[0]) < 1e-9  # C·v2 = λ₂·v2
explained = lam1 / (lam1 + lam2)
assert explained > 0.99  # tek bileşen varyansın %99'undan fazlasını taşıyor
projected = [(x - mx) * v1[0] + (y - my) * v1[1] for x, y in points]  # 2 boyut → 1 boyut
assert math.isclose(sum(p * p for p in projected) / (n - 1), lam1)  # izdüşümün varyansı = λ₁
print("açıklanan varyans oranı:", round(explained, 4))
```

Kaç bileşen tutulur: açıklanan varyans oranlarının birikimli toplamı %90–95'e ulaşana dek, ya da toplamın
"dirsek" yaptığı yere kadar. Bu bir sezgiseldir; asıl ölçü sonraki işin (sınıflandırma, arama) başarısıdır.

## PCA'nın iki klasik hatası: merkezlememek ve ölçeklememek

```python calistir
import math
import random

rng = random.Random(1)


def top_component(rows, center):
    """İki sütunlu verinin birinci bileşeni ve açıklanan varyans oranı."""
    n = len(rows)
    mx = sum(r[0] for r in rows) / n if center else 0.0
    my = sum(r[1] for r in rows) / n if center else 0.0
    a = sum((x - mx) ** 2 for x, _ in rows) / n
    c = sum((y - my) ** 2 for _, y in rows) / n
    b = sum((x - mx) * (y - my) for x, y in rows) / n
    lam1 = (a + c) / 2 + math.sqrt(((a - c) / 2) ** 2 + b * b)
    v = [b, lam1 - a] if abs(b) > 1e-12 else ([1.0, 0.0] if a >= c else [0.0, 1.0])
    size = math.hypot(*v)
    return [v[0] / size, v[1] / size], lam1 / (a + c)


# 1) Merkezlemeden: "bileşen" verinin yayılımını değil, ortalamanın yönünü gösterir
data = []
for _ in range(2000):
    t = rng.gauss(0, 1)
    data.append((100 + t, 50 + 2 * t))  # yayılım (1, 2) yönünde, ortalama (100, 50)
right, _ = top_component(data, center=True)
wrong, _ = top_component(data, center=False)
assert abs(right[0] - 1 / math.sqrt(5)) < 0.01  # (1, 2) yönü
assert abs(wrong[0] - 2 / math.sqrt(5)) < 0.01  # (2, 1): ortalamanın yönü — YANLIŞ

# 2) Ölçeklemeden: birimi büyük sütun "kazanır"
people = [(rng.gauss(40, 10), rng.gauss(30_000, 10_000)) for _ in range(2000)]  # yaş, gelir (bağımsız)
_, raw_ratio = top_component(people, center=True)
assert raw_ratio > 0.999  # "tek bileşen her şeyi açıklıyor" — yalnız gelirin birimi büyük olduğu için


def standardize(rows):
    columns = list(zip(*rows))
    means = [sum(c) / len(c) for c in columns]
    stds = [math.sqrt(sum((x - m) ** 2 for x in c) / len(c)) for c, m in zip(columns, means)]
    return [tuple((x - m) / s for x, m, s in zip(row, means, stds)) for row in rows]


_, scaled_ratio = top_component(standardize(people), center=True)
assert 0.45 < scaled_ratio < 0.56  # bağımsız iki sütun: her biri ~yarı yarıya
print("ölçeksiz:", round(raw_ratio, 4), "| ölçekli:", round(scaled_ratio, 3))
```

Ölçekli örnekte iki özdeğer neredeyse eşittir; o zaman bileşenin **yönü anlamsızdır** ve küçük bir veri
değişikliğiyle döner. Yakın özdeğerli bileşenleri tek tek yorumlamayın.

## SVD: düşük ranklı yaklaşım ve AᵀA uyarısı

```python calistir
import math


def matvec(M, v):
    return [sum(a * b for a, b in zip(row, v)) for row in M]


def top_singular(A, iters=500):
    """En büyük tekil değer ve vektörleri: AᵀA üzerinde güç yinelemesi (yalnız öğretim amaçlı)."""
    AtA = [[sum(r[i] * r[j] for r in A) for j in range(len(A[0]))] for i in range(len(A[0]))]
    v = [1.0] * len(A[0])
    for _ in range(iters):
        w = matvec(AtA, v)
        size = math.sqrt(sum(x * x for x in w))
        v = [x / size for x in w]
    sigma = math.sqrt(sum(x * x for x in matvec(A, v)))
    u = [x / sigma for x in matvec(A, v)]
    return sigma, u, v


# Kullanıcı × ürün puanları: "ne kadar etkin kullanıcı" × "ne kadar popüler ürün" + küçük sapmalar
A = [[5, 4, 1], [10, 6, 2], [15, 9, 4], [20, 13, 4]]
sigma, u, v = top_singular(A)
A1 = [[sigma * ui * vj for vj in v] for ui in u]  # rank-1 yaklaşım: 4×3 yerine 4+3+1 sayı
total = sum(x * x for row in A for x in row)
error = sum((a - b) ** 2 for ra, rb in zip(A, A1) for a, b in zip(ra, rb))
assert math.isclose(error, total - sigma**2)  # Eckart–Young: hata = atılan tekil değerlerin kareleri
assert math.sqrt(error / total) < 0.05  # bilginin %95'ten fazlası tek bileşende

# UYARI: AᵀA kurmak koşul sayısının karesini alır, küçük tekil değerler kaybolur
B = [[1.0, 1.0], [0.0, 1e-9]]
assert B[0][0] * B[1][1] - B[0][1] * B[1][0] == 1e-9  # B tekil değil
BtB = [[1.0, 1.0], [1.0, 1.0 + 1e-18]]  # BᵀB'nin gerçek değeri
assert BtB[1][1] == 1.0  # 1e-18, 1'in yanında yuvarlandı
assert BtB[0][0] * BtB[1][1] - BtB[0][1] * BtB[1][0] == 0.0  # kayan noktada "tekil" oldu
print("tamam")
```

Gerçek işte SVD'yi kütüphaneden alın (numpy `linalg.svd`, büyük veride kesilmiş/rastgele SVD). Yukarıdaki
`top_singular` yalnız fikri gösterir; tam da son satırdaki nedenle (AᵀA) küçük tekil değerlerde güvenilmezdir.

## Tuzaklar

| Belirti                                                       | Neden                                                         | Çözüm                                                             |
| ------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- |
| Birinci bileşen veriyi değil ortalamayı gösteriyor            | Veri merkezlenmemiş                                           | Önce sütun ortalamalarını çıkarın (kütüphane PCA'sı yapar)        |
| Tek bileşen "%99,9 açıklıyor" ama işe yaramıyor               | Ölçeksiz veri; en büyük birimli sütun baskın                  | `StandardScaler`; açıklanan oranı ölçekli veride okuyun           |
| Bileşenlerin işareti çalıştırmadan çalıştırmaya değişiyor     | Özvektör `v` ve `−v` ikisi de geçerli                         | İşaret kuralı (en büyük mutlak öğe pozitif); yorumda işarete dayanmayın |
| numpy `eigh` sonucunda ilk sütun en önemsiz bileşen            | `eigh` özdeğerleri küçükten büyüğe sıralar                    | Ters çevirin ya da `svd` kullanın (büyükten küçüğe)               |
| Güç yinelemesi bitmiyor ya da salınıyor                       | `λ₁ ≈ λ₂`, ya da baskın özdeğer negatif                       | Kütüphane çözücüsü; durma ölçütünü vektöre koyun, adım sınırı     |
| PageRank toplamı her adımda azalıyor                          | Dışarı bağlantısı olmayan sayfaların payı kayboluyor          | Onların payını bütün sayfalara dağıtın                            |
| Küçük tekil değerler/özdeğerler sıfır ya da eksi çıkıyor      | AᵀA (ya da kovaryans) kurulurken bilgi yuvarlandı             | Veriye doğrudan SVD; normal denklemlerden kaçının                 |
| PCA sonrası model daha kötü                                   | Hedefle ilgili ama varyansı küçük yön atıldı                  | PCA denetimsizdir; bileşen sayısını sonraki işin başarısıyla seçin |
| PCA eğitim + sınama verisinin tamamında uydurulmuş             | Ön işleme sızıntısı                                           | PCA'yı yalnız eğitimde uydurun (hattın içinde)                    |

## Denetim listesi

- [ ] PCA öncesi veri merkezlenmiş ve (birimler farklıysa) standartlaştırılmış.
- [ ] Açıklanan varyans oranları ve birikimli toplamı raporlanmış; bileşen sayısı gerekçeli.
- [ ] PCA yalnız eğitim verisinde uydurulmuş, sınama verisine yalnız uygulanmış.
- [ ] Yorumlarda bileşen işaretine ve neredeyse eşit özdeğerli bileşenlerin yönüne dayanılmamış.
- [ ] Simetrik matriste simetrik çözücü kullanılmış; sıralamanın yönü (artan/azalan) denetlenmiş.
- [ ] Güç yinelemesinde adım sınırı ve vektör üzerinde durma ölçütü var.
- [ ] Sayısal hesapta AᵀA kurulmamış; SVD veriye doğrudan uygulanmış.

## Küçük modele yaptırırken

- **İsteme yazın:** "PCA'yı `Pipeline` içinde ölçeklemeden sonra kur, yalnız eğitimde uydur. Açıklanan varyans
  oranlarını ve birikimli toplamı yazdır. Bileşen işaretini yorumlama."
- **Modelin tipik hatası:** ölçeklemeyi unutur; PCA'yı bütün veride uydurur (sızıntı); `eigh` çıktısını büyükten
  küçüğe sanır; özdeğer ayrışımını `AᵀA` üzerinden elle kurar.
- **Çıktıda denetleyin:** ölçekleyici PCA'dan önce mi; `fit` yalnız eğitim verisinde mi; açıklanan oranlar
  toplamı 1'e yakın mı; tekrar çalıştırmada sonuç (işaret dışında) aynı mı.
- **Değişmez testi isteyin:** "her bileşen için `C·v ≈ λ·v`", "bileşenler birbirine dik", "bütün bileşenlerle geri
  çatılan veri asıl veriye eşit".

## İlgili

- [Lineer cebir sezgisi](lineer-cebir-sezgisi.md): matris, dönüşüm, tekillik
- [Sayısal yöntemler](sayisal-yontemler.md): koşul sayısı ve kararlılık
- [Veri sızıntısı](../80-ml/veri-sizintisi.md): ön işlemeyi (PCA dahil) yalnız eğitimde uydurmak
- Çalışan PCA (SVD ile, işaret kuralıyla): [`ml-temel/ml_temel/klasik/decomposition.py`](../../ml-temel/ml_temel/klasik/decomposition.py)
- Ölçekleme + PCA + k-means örneği: [`ml-temel/ornekler/05_kmeans_pca.py`](../../ml-temel/ornekler/05_kmeans_pca.py)
