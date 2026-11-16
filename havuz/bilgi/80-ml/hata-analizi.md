---
baslik: Hata analizi
ozet: Toplu ölçütün ötesine geçmek; hataları elle inceleme yöntemi, dilimleme, karışan sınıflar, etiket hatası bulma ve en çok kazandıracak düzeltmeyi seçme; çalışan bir hata çizelgesi örneğiyle.
etiketler: [makine-ogrenmesi, hata-analizi, dilimleme, etiket-hatasi, onceliklendirme]
duzey: orta
guncellik: 2026-11
---

# Hata analizi

> Bu notu ne zaman okumalı: model ilk kez ölçüldükten sonra "şimdi ne yapalım?" sorusunda; başarım bir yerde
> takıldığında; "daha büyük model" ya da "daha çok veri" önerisinden önce.

## Temel fikir

Toplu ölçüt (doğruluk %90) neyin düzeltileceğini söylemez. Hata analizi, hataların **nerede** (hangi dilim),
**ne tür** (hangi neden) ve **ne kadar** (payı) olduğunu ortaya çıkarır; böylece emek, en çok kazandıracak düzeltmeye
gider. Kural: **model değiştirmeden önce 50–100 hatayı gözle okuyun.**

Hata analizi **doğrulama** kümesinde yapılır. Sınama kümesinin hatalarına bakıp düzeltme yapmak, sınama kümesini
doğrulama kümesine çevirir ([ayrım notu](ayrim-ve-capraz-dogrulama.md)).

## Yöntem

1. **Örnekleyin:** doğrulama hatalarından 50–100 tanesini rastgele seçin; ayrıca modelin çok emin olduğu hatalardan ve
   en büyük dilimlerden birkaç tane ekleyin.
2. **Önce serbest not:** her hataya bir satır not yazın ("iki konu birden", "etiket yanlış görünüyor", "ASCII
   yazım"). Kategorileri baştan dayatmayın.
3. **Kategorilere ayırın:** notları 5–10 türe toplayın; bir hata birden çok türe girebilir.
4. **Sayın ve tavanı hesaplayın:** her türün payı × düzeltilebilir oranı = o düzeltmeyle en fazla kazanılabilecek.
5. **Seçin, düzeltin, yeniden ölçün:** en büyük kazanç / en düşük maliyet. Aynı doğrulama kümesiyle önce/sonra.
6. **Kaydedin:** hata çizelgesi ve kararlar deney kaydına girer ([MLOps](mlops.md)).

## Dilimleme: oran değil, fazla hata

Hataları kanal, cihaz, metin uzunluğu, bölge, müşteri türü gibi dilimlere ayırın. Öncelik **en yüksek hata oranı**
değil, **genel orana göre fazladan kaç hata** ürettiğidir:

```python calistir
import random
from collections import defaultdict

random.seed(46)
slices = {  # dilim: (payı, hata oranı)
    "web": (0.50, 0.07),
    "mobil uygulama": (0.35, 0.12),
    "çağrı merkezi notu": (0.13, 0.20),
    "faks taraması": (0.02, 0.45),
}
rows = []
for _ in range(5000):
    name = random.choices(list(slices), weights=[s[0] for s in slices.values()])[0]
    rows.append((name, random.random() < slices[name][1]))
overall = sum(err for _, err in rows) / len(rows)
stats = defaultdict(lambda: [0, 0])
for name, err in rows:
    stats[name][0] += 1
    stats[name][1] += err
print(f"genel hata oranı %{overall * 100:.1f}")
print(f"{'dilim':20s} satır  hata  oran   fazla hata")
for name, (n, errors) in sorted(stats.items(), key=lambda kv: -(kv[1][1] - kv[1][0] * overall)):
    print(f"{name:20s} {n:5d} {errors:5d}  %{100 * errors / n:4.1f}  {errors - n * overall:+8.0f}")
```

```cikti
genel hata oranı %11.3
dilim                satır  hata  oran   fazla hata
çağrı merkezi notu     653   140  %21.4       +66
faks taraması           98    45  %45.9       +34
mobil uygulama        1737   205  %11.8        +9
web                   2512   173  % 6.9      -110
```

"Faks taraması" en yüksek orana sahip ama küçük (fazla hata +34); "çağrı merkezi notu" daha düşük oranla en çok
fazladan hatayı (+66) üretiyor: önce oraya bakılır. Web'in oranı genelin altında; orada emek en az getiriyi sağlar.
Küçük dilimlerin oranı oynaktır; güven aralığıyla yorumlayın.

## Karışan sınıflar

Karışıklık matrisinde (satır = gerçek, sütun = tahmin) en çok karışan çiftler çoğu zaman bir **tanım** sorununu
gösterir:

```python calistir
labels = ["kargo", "iade", "fatura", "hesap", "diğer"]
matrix = [  # satır: gerçek, sütun: tahmin
    [410, 22, 3, 2, 13],
    [35, 280, 30, 1, 4],
    [2, 28, 330, 25, 15],
    [1, 2, 20, 190, 7],
    [18, 6, 9, 4, 63],
]
pairs = []
for i, row in enumerate(matrix):
    for j, count in enumerate(row):
        if i != j:
            pairs.append((count / sum(row), count, labels[i], labels[j]))
for share, count, truth, predicted in sorted(pairs, reverse=True)[:4]:
    print(f"gerçek {truth:6s} → tahmin {predicted:6s}: {count:3d} örnek, sınıf içindeki payı %{share * 100:.0f}")
recall = {labels[i]: matrix[i][i] / sum(matrix[i]) for i in range(len(labels))}
print("sınıf başına duyarlılık:", ", ".join(f"{k} {v:.2f}" for k, v in recall.items()))
```

```cikti
gerçek diğer  → tahmin kargo :  18 örnek, sınıf içindeki payı %18
gerçek iade   → tahmin kargo :  35 örnek, sınıf içindeki payı %10
gerçek hesap  → tahmin fatura:  20 örnek, sınıf içindeki payı %9
gerçek diğer  → tahmin fatura:   9 örnek, sınıf içindeki payı %9
sınıf başına duyarlılık: kargo 0.91, iade 0.80, fatura 0.82, hesap 0.86, diğer 0.63
```

| Karışma görünümü | Olası neden | Yapılacak |
| --- | --- | --- |
| İki sınıf karşılıklı karışıyor (iade ↔ fatura) | Tanımlar örtüşüyor; iletiler iki konuyu birden içeriyor | Sınır kuralını kılavuza yazın; çok etiketli kurgu; gerekirse birleştirin |
| "Diğer" her yere dağılıyor | "Diğer" bir çöp kutusu; tanımsız | "Diğer"i alt konulara ayırın ya da "belirsiz" eşiğiyle insana gönderin |
| Tek yönlü karışma (az sınıf → büyük sınıf) | Dengesizlik; az sınıfta veri az | Sınıf ağırlığı, az sınıfa veri, eşik ayarı |
| Belirli bir dilimde karışma | Girdi biçimi farklı (ASCII, kısaltma) | O dilimden eğitim örneği; ön işleme |

## Etiket hatası bulma

Modelin çok emin olduğu hâlde etiketle çeliştiği örnekler çoğu zaman **etiket hatasıdır**. Etiketlerin %5'i yanlış
bir veride, "verilen etikete modelin verdiği olasılık" en düşük olanlar:

```python calistir
import math
import random

random.seed(47)
items = []
for _ in range(2000):
    p_true = 1 / (1 + math.exp(-random.gauss(2.5, 1.5)))  # modelin gerçek sınıfa verdiği olasılık
    flipped = random.random() < 0.05  # etiket hatası
    p_given = 1 - p_true if flipped else p_true  # verilen (kayıttaki) etikete verilen olasılık
    items.append((p_given, flipped))
ranked = sorted(items)
print(f"rastgele 100 kayıtta etiket hatası oranı ≈ %{100 * sum(f for _, f in items) / len(items):.0f}")
for k in (50, 100, 200):
    found = sum(flipped for _, flipped in ranked[:k])
    print(f"en şüpheli {k:3d} kayıtta etiket hatası %{100 * found / k:.0f}  ({found} hata)")
```

```cikti
rastgele 100 kayıtta etiket hatası oranı ≈ %5
en şüpheli  50 kayıtta etiket hatası %98  (49 hata)
en şüpheli 100 kayıtta etiket hatası %78  (78 hata)
en şüpheli 200 kayıtta etiket hatası %46  (91 hata)
```

Rastgele denetimde 100 kayıtta ~5 hata bulunur; en şüpheli 100 kayda bakıldığında aynı emekle 78 hata bulunuyor.
Kurallar: olasılıklar **kat dışı** tahminlerden gelsin (model kendi eğitim satırını ezberlemiş olmasın); şüpheliler
otomatik değil **insan** tarafından düzeltilsin; düzeltmeler kaydedilsin. Aynı metnin iki ayrı etiketle durması da
kesin bir etiket hatası işaretidir.

## Hata çizelgesi: en çok kazandıracak düzeltme

4.000 doğrulama örneği, 400 hata (%10). 100 hata elle incelendi ve türlere ayrıldı. "Düzeltilebilir oran" ekibin
kaba tahminidir; çizelge **tavan** kazancı gösterir:

```python calistir
TOTAL, ERRORS, REVIEWED = 4000, 400, 100
sheet = [  # (hata türü, incelenen 100 hatadaki sayı, düzeltilebilir oran, önerilen düzeltme)
    ("etiket yanlış", 22, 0.9, "etiketleri düzelt, kılavuzu güncelle"),
    ("iki konu birden", 18, 0.3, "çok etiketli kurgu"),
    ("ASCII/yazım hatası", 15, 0.7, "Türkçe katlama + karakter n-gram"),
    ("eş anlamlı sözcük", 14, 0.5, "gömme tabanlı özellik"),
    ("konu dışı ileti", 11, 0.6, "'belirsiz' eşiği"),
    ("çok kısa ileti", 10, 0.2, "kanal bilgisini özellik yap"),
    ("diğer", 10, 0.1, "—"),
]
print(f"{'tür':20s} pay   tavan kazanç   düzeltme")
rows = []
for kind, count, fixable, fix in sheet:
    gain = count / REVIEWED * ERRORS * fixable / TOTAL  # doğrulukta en fazla kaç puan
    rows.append((gain, kind, count, fix))
for gain, kind, count, fix in sorted(rows, reverse=True):
    print(f"{kind:20s} %{count:2d}   +{gain * 100:.1f} puan     {fix}")
print(f"hepsi düzelse doğruluk en fazla %{100 * (1 - ERRORS / TOTAL):.0f} → %{100 * (1 - ERRORS / TOTAL + sum(r[0] for r in rows)):.1f}")
```

```cikti
tür                  pay   tavan kazanç   düzeltme
etiket yanlış        %22   +2.0 puan     etiketleri düzelt, kılavuzu güncelle
ASCII/yazım hatası   %15   +1.1 puan     Türkçe katlama + karakter n-gram
eş anlamlı sözcük    %14   +0.7 puan     gömme tabanlı özellik
konu dışı ileti      %11   +0.7 puan     'belirsiz' eşiği
iki konu birden      %18   +0.5 puan     çok etiketli kurgu
çok kısa ileti       %10   +0.2 puan     kanal bilgisini özellik yap
diğer                %10   +0.1 puan     —
hepsi düzelse doğruluk en fazla %90 → %95.2
```

Okuma ve karar:

- İlk iki satır, büyük bir model değişikliğinden (gömme) daha fazla kazandırıyor ve daha ucuz: önce etiket temizliği
  ve Türkçe katlama.
- "Etiket yanlış" düzeltmesi **ölçülen** doğruluğu artırır; model zaten haklıysa gerçek davranış değişmez. İkisini
  ayrı raporlayın.
- Tavan, gerçekleşecek kazanç değildir; düzeltmeden sonra aynı doğrulama kümesiyle yeniden ölçün.
- Bu tablo, "daha büyük model" önerisini sayıyla tartmanın yoludur: o öneri hangi satırı düzeltecek?

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Ayarlar değişiyor, başarım yerinde | Hatalara hiç bakılmadı | 50–100 hatayı okuyun, çizelge kurun |
| Sınama sonucu her turda biraz daha iyi | Hata analizi sınama kümesinde yapılıyor | Analiz doğrulamada; sınama kilitli |
| En yüksek hata oranlı dilime emek harcandı, genel başarı kıpırdamadı | Dilim çok küçüktü | "Fazla hata" ile önceliklendirin |
| Kategoriler baştan dayatıldı, yeni hata türü görülmedi | Serbest not aşaması atlandı | Önce serbest not, sonra kategori |
| Etiket düzeltmesi sonrası "büyük iyileşme" raporu | Ölçüm iyileşti, model aynı | Etiket düzeltmesini ayrı raporlayın |
| Şüpheli etiketler otomatik "düzeltildi" | Model kendi yanlılığını etikete yazdı | İnsan incelemesi şart |
| Yalnız yanlış tahminlere bakıldı | Doğru ama düşük güvenli tahminler de risk | Düşük güvenli doğruları da örnekleyin |

## Denetim listesi

- [ ] Doğrulama kümesinden en az 50 hata elle okundu; her birine not yazıldı.
- [ ] Hatalar türlere ayrıldı; her türün payı ve tavan kazancı hesaplandı.
- [ ] Dilimler (kanal, cihaz, uzunluk, bölge…) için hata oranı ve fazla hata tablosu çıkarıldı.
- [ ] Karışıklık matrisinden en çok karışan çiftler ve nedenleri yazıldı.
- [ ] Kat dışı olasılıklarla şüpheli etiket listesi çıkarıldı ve insan tarafından incelendi.
- [ ] Seçilen düzeltme, aynı doğrulama kümesiyle önce/sonra ölçüldü.
- [ ] Çizelge ve kararlar deney kaydına eklendi.

## Küçük modele yaptırırken

- **İsteme yazın:** "Doğrulama hatalarından rastgele 60 tanesini girdi, gerçek etiket, tahmin ve olasılıkla tablo
  yap. Her biri için tek cümlelik olası neden yaz. Sonra nedenleri en çok 8 türe topla, her türün sayısını ve önerilen
  düzeltmeyi ver. Dilimler için hata oranı ve 'fazla hata' tablosu ekle."
- **Modelin tipik hatası:** Hataları okumadan genel öneriler sıralar ("daha çok veri", "daha büyük model"); sınama
  kümesinin hatalarını kullanır; yalnız hata oranına göre sıralar; şüpheli etiketleri kendisi düzeltir.
- **Çıktıda denetleyin:** tablonun gerçekten doğrulama kümesinden geldiği; örneklerin rastgele seçildiği; her önerinin
  bir hata türüne ve sayısına dayandığı.
- Küçük model, nedenleri yazmada iyi bir yardımcıdır ama son karar sizin: 10 tanesini kendiniz okuyup modelin
  notlarıyla karşılaştırın.

## İlgili

- [Değerlendirme ölçütleri](degerlendirme-olcutleri.md) — karışıklık matrisi · [Metin sınıflandırma](metin-siniflandirma.md) —
  Türkçe hata türleri · [Veri ve etiket kalitesi](veri-ve-etiket.md) · [Model kartı](model-karti-ve-sorumluluk.md) — alt gruplar
- Karışıklık matrisi ve sınıf başına ölçütler: [`ml_temel/olcut/classification.py`](../../ml-temel/ml_temel/olcut/classification.py);
  kat dışı olasılıklar: `cross_val_predict` ([`secim/validate.py`](../../ml-temel/ml_temel/secim/validate.py))
- Çelişen etiket ve yinelenen örnek denetimi: [`ince_ayar/data/checks.py`](../../ince-ayar/ince_ayar/data/checks.py);
  değerlendirme örneklerini gözle okuma: [`ince-ayar/docs/DEGERLENDIRME.md`](../../ince-ayar/docs/DEGERLENDIRME.md)
