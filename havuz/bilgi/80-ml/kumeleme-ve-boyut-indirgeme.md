---
baslik: Kümeleme ve boyut indirgeme
ozet: Etiketsiz veride k-means, yoğunluk tabanlı ve hiyerarşik kümeleme ile PCA'nın ne zaman işe yaradığı; ölçek ve ilgisiz sütun etkisi, "küme her zaman bulunur" tuzağı, k seçimi, kararlılık ve değerlendirme.
etiketler: [makine-ogrenmesi, kumeleme, k-means, pca, denetimsiz-ogrenme, segmentasyon]
duzey: orta
guncellik: 2026-11
---

# Kümeleme ve boyut indirgeme

> Bu notu ne zaman okumalı: müşteri ya da ürün segmentasyonu yapılacakken; çok sütunlu veriyi görselleştirmek
> ya da sıkıştırmak gerektiğinde; biri "veride kaç grup var?" diye sorduğunda.

## Temel fikir

Kümeleme (clustering), etiket olmadan birbirine benzeyen satırları gruplar; boyut indirgeme (PCA gibi) çok sütunu
az sayıda özet sütuna sıkıştırır. İkisinin de **doğru cevabı yoktur**: algoritma her veride bir sonuç üretir.

- Kümeler, verdiğiniz **sütunlara** ve **ölçeğe** göre oluşur. Ölçeklenmemiş ya da ilgisiz bir sütun sonucu belirler.
- **Küme her zaman bulunur:** yapısız veride de k-means k grup çıkarır. Varlığı ayrıca sınanır.
- Değer, **amaca** göre ölçülür: segment bir eylemi ayırt ediyor mu, özellik modeli iyileştiriyor mu?
- Basit bir kural (ör. son alım, sıklık, tutar dilimleri) çoğu iş segmentasyonunda kümelemeden daha anlaşılır ve
  yeterlidir; önce onu deneyin.

## Karar tablosu

| Amaç | Yöntem | Not |
| --- | --- | --- |
| İş segmentasyonu (pazarlama, hizmet düzeyi) | Önce kural tabanlı dilimler; sonra az ve anlamlı sütunla k-means | Segmentin bir eyleme bağlanması şart |
| Yuvarlak, benzer boyutlu gruplar | k-means (k-means++ başlatma, birden çok deneme) | Ölçekleme şart; aykırıya duyarlı |
| Düzensiz biçimli gruplar, gürültü noktaları | Yoğunluk tabanlı (DBSCAN türü) | Yoğunluk parametresi veriye duyarlı |
| Az satır, grup hiyerarşisi merak ediliyor | Hiyerarşik kümeleme (dendrogram) | Büyük veride pahalı |
| Metin ya da ürün kümeleri | Gömme + k-means ya da yoğunluk tabanlı ([gömmeler](gommeler-ve-benzerlik.md)) | Kümeleri örnek metinlerle adlandırın |
| Çok sütunu görselleştirmek | PCA ile 2 boyut; doğrusal olmayan yöntemler yalnız görsel için | Doğrusal olmayan izdüşümlerde uzaklıklar ve küme boyları yorumlanmaz |
| Doğrusal model ya da k-NN için sıkıştırma | PCA (yalnız eğitimde uydurulur) | Ağaçlara nadiren yarar |
| Aykırı bulma | [Aykırı değer notu](aykiri-deger-ve-anomali.md) | Kümeleme dolaylı bir yoldur |

## Ölçek ve ilgisiz sütun

Üç yaş grubu var; gelir sütunu gruplarla ilgisiz ama sayısal olarak bin kat büyük. k-means'in bulduğu kümelerin
gerçek gruplarla örtüşmesi (saflık):

```python calistir
import math
import random
import statistics

random.seed(49)


def kmeans(points, k, seed=0, iterations=50):
    centers = random.Random(seed).sample(points, k)
    for _ in range(iterations):
        groups = [[] for _ in range(k)]
        for p in points:
            groups[min(range(k), key=lambda c: math.dist(p, centers[c]))].append(p)
        new = [[statistics.fmean(v) for v in zip(*g)] if g else centers[i] for i, g in enumerate(groups)]
        if new == centers:
            break
        centers = new
    return [min(range(k), key=lambda c: math.dist(p, centers[c])) for p in points]


people = [((random.gauss((25, 45, 65)[g], 4), random.gauss(30_000, 9_000)), g) for g in range(3) for _ in range(60)]
points, truth = [p for p, _ in people], [g for _, g in people]


def purity(labels):
    total = 0
    for c in set(labels):
        members = [t for lab, t in zip(labels, truth) if lab == c]
        total += max(members.count(g) for g in set(members))
    return total / len(labels)


means = [statistics.fmean(v) for v in zip(*points)]
stds = [statistics.stdev(v) for v in zip(*points)]
scaled = [tuple((x - m) / s for x, m, s in zip(p, means, stds)) for p in points]
print(f"ölçeksiz (yaş + gelir):  saflık {purity(kmeans(points, 3)):.2f}")
print(f"ölçekli (yaş + gelir):   saflık {purity(kmeans(scaled, 3)):.2f}")
print(f"yalnız ilgili sütun:     saflık {purity(kmeans([(p[0],) for p in scaled], 3)):.2f}")
```

```cikti
ölçeksiz (yaş + gelir):  saflık 0.39
ölçekli (yaş + gelir):   saflık 0.65
yalnız ilgili sütun:     saflık 0.99
```

Ölçeklenmemiş veride kümeler yalnız geliri böler. Ölçekleme şarttır ama yetmez: ilgisiz sütun da kümeleri bulandırır.
Kümelemeye girecek sütunları amaca göre seçin; "elimizde ne varsa" yaklaşımı anlamsız segment üretir.

## Küme her zaman bulunur: yapıyı sınamak

Siluet puanı (silhouette): her nokta için "kendi kümesine uzaklık" ile "en yakın öteki kümeye uzaklık" farkı;
−1 ile 1 arası, yüksek iyi. Üç gerçek grubu olan veri ile hiç yapısı olmayan (düzgün dağılmış) veri:

```python calistir
import math
import random
import statistics

random.seed(50)


def kmeans(points, k, seed=0, iterations=50):
    centers = random.Random(seed).sample(points, k)
    for _ in range(iterations):
        groups = [[] for _ in range(k)]
        for p in points:
            groups[min(range(k), key=lambda c: math.dist(p, centers[c]))].append(p)
        new = [[statistics.fmean(v) for v in zip(*g)] if g else centers[i] for i, g in enumerate(groups)]
        if new == centers:
            break
        centers = new
    return [min(range(k), key=lambda c: math.dist(p, centers[c])) for p in points]


def silhouette(points, labels):
    scores = []
    for i, p in enumerate(points):
        own = [math.dist(p, q) for j, q in enumerate(points) if labels[j] == labels[i] and j != i]
        if not own:
            scores.append(0.0)
            continue
        a = statistics.fmean(own)
        b = min(statistics.fmean(math.dist(p, q) for j, q in enumerate(points) if labels[j] == c)
                for c in set(labels) if c != labels[i])
        scores.append((b - a) / max(a, b))
    return statistics.fmean(scores)


groups = [(0, 0), (4, 0), (2, 3.5)]
structured = [(x + random.gauss(0, 0.7), y + random.gauss(0, 0.7)) for x, y in groups for _ in range(60)]
uniform = [(random.uniform(-1, 5), random.uniform(-1, 4.5)) for _ in range(180)]
for name, data in (("üç gerçek grup", structured), ("yapısız veri", uniform)):
    print(f"{name:15s} siluet: " + "  ".join(f"k={k} {silhouette(data, kmeans(data, k)):.2f}" for k in (2, 3, 4, 5)))
```

```cikti
üç gerçek grup  siluet: k=2 0.46  k=3 0.65  k=4 0.51  k=5 0.51
yapısız veri    siluet: k=2 0.32  k=3 0.39  k=4 0.38  k=5 0.36
```

Yapılı veride siluet gerçek k'da belirgin tepe yapıyor; yapısız veride düz ve orta düzeyde kalıyor; yine de k-means
"kümeler" üretti. Yapısız veride bulunan segmentler, sınır çizgisi keyfî olan dilimlerdir.

## k seçimi ve kararlılık

| Yol | Nasıl | Not |
| --- | --- | --- |
| Dirsek (inertia) | k arttıkça küme içi uzaklık toplamı; kırılma noktası | Çoğu zaman belirgin dirsek yoktur |
| Siluet | k = 2…10 için ortalama siluet | Yuvarlak kümeleri kayırır |
| Kararlılık | Farklı tohum ya da önyükleme örnekleriyle yeniden kümeleyip atamaların örtüşmesini ölçün | Kararsız kümeler gerçek değildir |
| İş yorumu | Her kümenin profil tablosu (büyüklük, ortalamalar, örnek satırlar) | Adlandırılamayan küme kullanılmaz |
| Eylem | Kümeler farklı eyleme yol açıyor mu? | Aynı eylemi alan kümeler birleştirilir |

Havuzdaki örnekte (`ml-temel/ornekler/05_kmeans_pca.py`) dirsek k = 4'te belirgin (inertia 1506 → 859, sonra 803),
saflık 0,998; ama orada veri bilerek 4 gerçek kümeyle üretilmiştir. Gerçek veride bu kadar net bir kırılma beklemeyin.

## PCA'yı doğru kullanmak

- PCA varyansı en çok taşıyan doğrusal yönleri bulur; önce **ölçekleyin** (yoksa büyük ölçekli sütun ilk bileşen olur).
- Yalnız eğitim verisinde uydurun; çapraz doğrulamada `Pipeline` içinde olsun (ön işleme sızıntısı).
- "İlk iki bileşen varyansın %66'sını açıklıyor" gibi bir sonuçta kalan %34'ün içinde hedef için önemli bilgi
  olabilir; boyut sayısını modelin doğrulama başarısıyla seçin.
- Bileşenler sütunların karışımıdır; tek tek anlam yüklemek çoğu zaman yanıltır.
- Görselleştirme için doğrusal olmayan izdüşümler (t-SNE, UMAP türü) kümeleri olduğundan ayrık gösterebilir;
  bu görüntülerden küme sayısı ya da uzaklık sonucu çıkarmayın.

## Kümeyi model özelliği yapmak

Küme numarası ya da kümeye uzaklık, denetimli bir modele özellik olarak eklenebilir. Kurallar: kümeleme de veriden
öğrenir, yani **kat içinde** uydurulur; küme numaraları her eğitimde yer değiştirebilir (2 numaralı küme bir sonraki
eğitimde 0 olabilir), bu yüzden kodda "2 = sadık müşteri" gibi sabit anlam yüklenmez; tohum sabitlenir ve
eşleştirme kümelerin profiline göre yapılır.

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Kümeler yalnız bir sütuna göre ayrılmış | Ölçekleme yok | Standartlaştırın; çarpık sütunlara `log` |
| Segmentler anlamsız, adlandırılamıyor | İlgisiz sütunlar ya da yapısız veri | Sütunları amaca göre seçin; siluet ve kararlılığı ölçün |
| Her çalıştırmada farklı kümeler | Rastgele başlatma, kararsız yapı | Birden çok başlatma, sabit tohum, kararlılık ölçümü |
| "Küme 2" raporda her ay başka müşteri grubu | Küme numaralarının yer değiştirmesi | Profile göre eşleştirme; numaraya anlam yüklemeyin |
| Bir küme tek başına aykırılardan oluşuyor | k-means aykırıya duyarlı | Aykırıları önce ayırın ya da sağlam yöntem |
| Kümeleme özelliği çapraz doğrulamada parlak | Kümeleme bütün veride uyduruldu | `Pipeline` içinde, kat içinde |
| t-SNE/UMAP görselinde "net 7 grup" | Doğrusal olmayan izdüşüm yapı abartabilir | Küme sayısını görselden değil ölçümden çıkarın |
| Kategorik sütunlar sayı gibi kümelendi | Kod numaraları uzaklık sanıldı | Tek-sıcak, uygun uzaklık ya da kategorik yöntem |

## Denetim listesi

- [ ] Kümelemenin amacı ve bağlanacağı eylem yazıldı; kural tabanlı dilim alternatifi değerlendirildi.
- [ ] Sütunlar amaca göre seçildi; sayısal sütunlar ölçeklendi, çarpıklar dönüştürüldü.
- [ ] k birden çok yolla (siluet, dirsek, kararlılık, iş yorumu) seçildi; yapısızlık olasılığı sınandı.
- [ ] Her kümenin profil tablosu ve örnek satırları çıkarıldı; kümeler adlandırıldı.
- [ ] Farklı tohumlarla kararlılık ölçüldü.
- [ ] PCA ve kümeleme, denetimli bir modele girdi oluyorsa `Pipeline` içinde, kat içinde.
- [ ] Kod küme numarasına sabit anlam yüklemiyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Kümelemeye yalnız şu sütunları al: … Sayısal sütunları standartlaştır, tutar gibi çarpık
  sütunlara önce log uygula. k = 2…8 için siluet ve inertia tablosu ver; 5 farklı tohumla atamaların ne kadar
  örtüştüğünü ölç. Seçilen k için her kümenin büyüklüğü, sütun ortalamaları ve 5 örnek satırını yaz."
- **Modelin tipik hatası:** Bütün sütunları ölçeklemeden k-means'e verir; k'yı tek bir dirsek grafiğinden "açıkça 4"
  diye seçer; kümelere veriyle desteklenmeyen hikâyeli adlar uydurur; t-SNE görselinden küme sayısı çıkarır.
- **Çıktıda denetleyin:** ölçekleme adımı; kararlılık ölçümü; profil tablosundaki farkların gerçekten büyük olup
  olmadığı; küme adlarının profil sayılarına dayandığı.

## İlgili

- [Özellik mühendisliği](ozellik-muhendisligi.md) — ölçek ve dönüşüm · [Gömmeler ve benzerlik](gommeler-ve-benzerlik.md) ·
  [Aykırı değer ve anomali](aykiri-deger-ve-anomali.md) · [Veri sızıntısı](veri-sizintisi.md) — ön işleme sızıntısı
- k-means (k-means++) ve PCA (numpy): [`ml_temel/klasik/cluster.py`](../../ml-temel/ml_temel/klasik/cluster.py),
  [`decomposition.py`](../../ml-temel/ml_temel/klasik/decomposition.py); çalışan örnek ve beklenen çıktısı:
  [`05_kmeans_pca.py`](../../ml-temel/ornekler/05_kmeans_pca.py), [`beklenen/05_kmeans_pca.txt`](../../ml-temel/ornekler/beklenen/05_kmeans_pca.txt)
- PCA'nın matematiği: [Özdeğer ve ayrışımlar](../92-matematik/ozdeger-ve-ayrisimlar.md)
