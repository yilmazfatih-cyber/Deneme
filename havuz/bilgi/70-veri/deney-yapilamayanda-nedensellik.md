---
baslik: Deney yapılamayanda nedensellik
ozet: Rastgele deney mümkün değilken farkların farkı (plasebo ve eğilim sınaması), eşik süreksizliği (bant ve yığılma), sentetik kontrol ve kesintili zaman serisi; varsayımları, sınamaları ve sınırları tohumlu örneklerle.
etiketler: [istatistik, nedensellik, yari-deney, farklarin-farki, zaman-serisi, analiz]
duzey: ileri
guncellik: 2026-11
---

# Deney yapılamayanda nedensellik

> Bu notu ne zaman okumalı: bir değişiklik (kampanya, fiyat, özellik, kural) herkese ya da bir şehre birden
> uygulandı ve "işe yaradı mı?" sorulduğunda; deney etik, yasal ya da teknik olarak yapılamıyorsa; birinin
> "öncesi–sonrası şu kadar arttı" sunumunu değerlendirirken.

## Temel fikir

Rastgele deney ([A/B testi](ab-testi.md)) karşılaştırma grubunu şansla kurar. Deney yoksa karşılaştırma grubunu bir
**varsayımla** kurarsınız; her yöntem bir varsayımın adıdır:

| Yöntem | Karşı-olgusal ("olmasaydı") nereden gelir | Varsayım |
| --- | --- | --- |
| Farkların farkı (difference-in-differences) | Müdahale almayan benzer birimin değişimi | Paralel eğilim: müdahale olmasa iki birim aynı oranda değişirdi |
| Eşik süreksizliği (regression discontinuity) | Eşiğin hemen altındakiler | Eşiğe yakın olanlar başka açıdan benzer; eşik oynanamıyor |
| Sentetik kontrol | Müdahale almayan birimlerin ağırlıklı karışımı | Öncesinde iyi uyan karışım, sonrasında da karşı-olgusalı izler |
| Kesintili zaman serisi | Aynı serinin önceki eğilimi | Eğilim sürerdi; aynı anda başka bir şey olmadı |

Sonuç her zaman "**varsayım tutarsa** etki şu aralıktadır" cümlesidir. Varsayım tümüyle kanıtlanamaz ama
**sınanabilir yanları** sınanır: öncesi dönemde plasebo, eşikte yığılma, öncesi uyum hatası. Temel kavramlar
(karıştırıcı, seçim, ortalamaya dönüş) ve 2×2 farkların farkı: [korelasyon ve nedensellik](korelasyon-ve-nedensellik.md).

## Karar tablosu

| Elinizdeki durum | Yöntem | İlk sınama |
| --- | --- | --- |
| Değişiklik bazı şehir/şube/gruplarda başladı, ötekilerde başlamadı; ikisinin de öncesi verisi var | Farkların farkı | Öncesi dönemde plasebo ve eğilim grafiği |
| Müdahaleyi bir puan/tutar/yaş eşiği belirliyor | Eşik süreksizliği | Eşikte yığılma; farklı bant genişlikleri |
| Tek birim (bir şehir, bir ürün) müdahale aldı, çok sayıda aday karşılaştırma birimi var | Sentetik kontrol | Öncesi uyum hatası; her bağışçıya plasebo |
| Yalnız tek seri var, müdahale tarihi kesin | Kesintili zaman serisi | Mevsim ve eş zamanlı olay listesi; geçen yılın aynı dönemi |
| Kademeli yayın planlanabiliyor | Yayını rastgele sıraya koyun: bu bir deneydir | En iyi seçenek; analiz kolaylaşır |
| Müdahaleyi kim alacağını kişi kendisi seçti, eşik ya da karşılaştırma grubu yok | Hiçbiri güvenilir değil | Sonucu "birlikte görülüyor" diye yazın; deney planlayın |

## 1. Farkların farkı: plasebo ile sınamak

İzmir'de 12. haftada ücretsiz kargo başladı; aynı hafta bütün ülkede siparişler %10 düştü. Karşılaştırma şehri
Bursa. Gerçek etki +%8:

```python calistir
import math
import random
import statistics

rng = random.Random(31)
WEEKS, START, EFFECT = 20, 12, 0.08  # 12. haftada İzmir'de ücretsiz kargo başladı; gerçek etki +%8


def city(base, growth, treated):  # haftalık sipariş: ortak dalgalanma ve şok + şehrin eğilimi + etki + gürültü
    common = [(1 + 0.05 * math.sin(w / 2)) * (0.90 if w >= START else 1.0) for w in range(WEEKS)]  # aynı hafta herkeste %10 düşüş
    return [base * common[w] * (1 + growth) ** w * (1 + EFFECT * (treated and w >= START)) * (1 + rng.gauss(0, 0.01))
            for w in range(WEEKS)]


def did(treated, control, start, end=None):  # log ölçekte farkların farkı: oransal etki
    lt, lc = [math.log(v) for v in treated[:end]], [math.log(v) for v in control[:end]]
    pre = statistics.fmean(a - b for a, b in zip(lt[:start], lc[:start]))
    post = statistics.fmean(a - b for a, b in zip(lt[start:], lc[start:]))
    return math.exp(post - pre) - 1


izmir, bursa = city(1000, 0.0, True), city(900, 0.0, False)
before_after = statistics.fmean(izmir[START:]) / statistics.fmean(izmir[:START]) - 1
print(f"yalnız öncesi–sonrası: %{100 * before_after:+.1f}   farkların farkı: %{100 * did(izmir, bursa, START):+.1f}")
print(f"plasebo (sahte başlangıç 6. hafta, yalnız ilk 12 hafta): %{100 * did(izmir, bursa, 6, START):+.1f}")
fast = city(1000, 0.015, True)  # paralel eğilim BOZUK: bu şehir zaten haftada %1,5 büyüyordu
print(f"eğilimler farklıyken farkların farkı: %{100 * did(fast, bursa, START):+.1f}   "
      f"plasebo: %{100 * did(fast, bursa, 6, START):+.1f}")
```

```cikti
yalnız öncesi–sonrası: %-1.2   farkların farkı: %+7.2
plasebo (sahte başlangıç 6. hafta, yalnız ilk 12 hafta): %+0.8
eğilimler farklıyken farkların farkı: %+25.1   plasebo: %+9.9
```

Okuma:

- Öncesi–sonrası "işe yaramadı" (%−1) diyor: ortak düşüş etkiyi gizledi. Farkların farkı +%7 buluyor (gerçek +%8).
- **Plasebo:** müdahale olmayan öncesi dönemde sahte bir başlangıç tarihiyle aynı hesap yapılır; sonuç sıfıra yakın
  olmalı (+%0,8). İkinci senaryoda İzmir zaten daha hızlı büyüyordu: farkların farkı +%25'e şişiyor ve plasebo
  +%10 vererek bunu **ele veriyor**. Plasebo sıfırdan uzaksa sonuç raporlanmaz; karşılaştırma birimi değiştirilir
  ya da sentetik kontrole geçilir.
- Oransal etki için log ölçekte çalışın (büyük şehir ile küçük şehrin farkı mutlak sayıda yanıltır). Birden çok
  karşılaştırma birimi varsa hepsini kullanın ve her birinin sonucunu ayrı da gösterin.
- Karşılaştırma birimi müdahaleden etkilenmemeli: İzmir'deki kargo kampanyası Manisa'dan sipariş çekiyorsa Manisa
  kontrol olamaz (taşma, spillover).

## 2. Eşik süreksizliği: bant ve yığılma

Geçen yıl 5.000 TL üstü harcayan müşteriler "altın üye" oldu. Bu yılki harcama geçen yıla zaten bağlı; üyeliğin
gerçek etkisi +400 TL. Etki, eşiğin iki yanına uydurulan doğruların eşikteki farkıdır:

```python calistir
import random
import statistics

rng = random.Random(41)
CUT, EFFECT = 5000, 400  # geçen yıl 5.000 TL üstü harcayan "altın üye" oldu; gerçek etki +400 TL


def outcome(x):  # bu yılki harcama: geçen yıla bağlı (eğrisel) + üyelik etkisi + gürültü
    return 1500 + 0.6 * x + 3e-8 * (x - CUT) ** 3 + EFFECT * (x >= CUT) + rng.gauss(0, 600)


rows = [(x, outcome(x)) for x in (rng.uniform(1000, 9000) for _ in range(20_000))]


def line_at_cut(points):  # en küçük karelerle doğru; eşikteki değeri döndürür
    xs, ys = [p[0] - CUT for p in points], [p[1] for p in points]
    mx, my = statistics.fmean(xs), statistics.fmean(ys)
    slope = sum((a - mx) * (b - my) for a, b in zip(xs, ys)) / sum((a - mx) ** 2 for a in xs)
    return my - slope * mx


naive = statistics.fmean(y for x, y in rows if x >= CUT) - statistics.fmean(y for x, y in rows if x < CUT)
print(f"üye olan − olmayan (düz karşılaştırma): {naive:+.0f} TL")
for h in (300, 1000, 3000):  # bant genişliği: eşiğin iki yanında kaç TL'lik pencere
    left = [p for p in rows if CUT - h <= p[0] < CUT]
    right = [p for p in rows if CUT <= p[0] < CUT + h]
    print(f"bant ±{h:4d} TL ({len(left) + len(right):5d} müşteri): eşikteki sıçrama {line_at_cut(right) - line_at_cut(left):+.0f} TL")

# Yığılma denetimi: eşiği bilen müşteriler sınırı geçmek için alışveriş eklerse süreksizlik geçersizleşir
moved = [x + rng.uniform(300, 400) if 4700 <= x < CUT and rng.random() < 0.5 else x for x, _ in rows]
for name, xs in (("doğal", [x for x, _ in rows]), ("eşiği bilenler", moved)):
    counts = [sum(lo <= x < lo + 100 for x in xs) for lo in range(4700, 5300, 100)]
    print(f"{name:15s} 4.700–5.300 TL arası 100'lük kutular: {counts}")
```

```cikti
üye olan − olmayan (düz karşılaştırma): +3774 TL
bant ± 300 TL ( 1468 müşteri): eşikteki sıçrama +352 TL
bant ±1000 TL ( 4929 müşteri): eşikteki sıçrama +388 TL
bant ±3000 TL (14907 müşteri): eşikteki sıçrama +54 TL
doğal           4.700–5.300 TL arası 100'lük kutular: [256, 237, 240, 264, 237, 234]
eşiği bilenler  4.700–5.300 TL arası 100'lük kutular: [131, 115, 114, 321, 365, 371]
```

Okuma:

- Düz karşılaştırma (+3.774 TL) üyeliğin değil "zaten çok harcayan" olmanın farkıdır.
- **Bant genişliği** bir ödünleşimdir. Aynı süreci 40 tohumla çalıştırınca: ±300 TL bandı ortalamada doğru ama
  tohumdan tohuma ±60 TL oynuyor; ±1.000 TL hem kararlı (±30) hem doğruya yakın; ±3.000 TL çok kararlı ama eğrilik
  yüzünden ~80 TL'ye çöküyor (yanlı). Tek bant değil, birkaç bantla sonucu yan yana verin; sonuç banda göre
  değişiyorsa eğrilik vardır.
- **Yığılma** (bunching): insanlar eşiği bilip geçmeye çalışıyorsa eşiğin hemen altı boşalır, üstü dolar. Eşiğin iki
  yanındaki kişiler artık benzer değildir (geçmek için çabalayanlar başka insanlardır) ve yöntem geçersizleşir.
  Önce sıklık tablosuna bakın. "Kargo 500 TL üstü bedava" gibi herkesin bildiği eşiklerde yığılma beklenir.
- Bulunan etki **yalnız eşiğin yakınındakiler** içindir: 2.000 TL harcayan birine altın üyelik verilse ne olacağını
  söylemez.

## 3. Sentetik kontrol: ağırlıklı karşılaştırma birimi

Tek bir şehirde (Eskişehir) kampanya başladı; tek bir karşılaştırma şehri benzemiyor. Kampanyasız şehirlerden,
öncesi dönemi en iyi taklit eden **ağırlıklı karışım** kurulur (ağırlıklar negatif değil, toplamı 1):

```python calistir
import itertools
import math
import random
import statistics

rng = random.Random(52)
WEEKS, START, EFFECT = 24, 16, 0.10  # 16. haftada yalnız Eskişehir'de yeni kampanya; gerçek etki +%10
donors = {  # kampanya olmayan şehirler: farklı düzey ve eğilimler
    "Konya": [800 * 1.02**w for w in range(WEEKS)],
    "Kayseri": [600 + 0 * w for w in range(WEEKS)],
    "Sivas": [700 * 0.99**w for w in range(WEEKS)],
    "Samsun": [650 * (1 + 0.15 * math.sin(w / 2)) for w in range(WEEKS)],
}
donors = {k: [v * (1 + rng.gauss(0, 0.01)) for v in s] for k, s in donors.items()}
names = list(donors)
treated = [(0.6 * donors["Konya"][w] + 0.4 * donors["Sivas"][w]) * (1 + EFFECT * (w >= START)) * (1 + rng.gauss(0, 0.01))
           for w in range(WEEKS)]


def blend(weights):
    return [sum(wt * donors[n][w] for wt, n in zip(weights, names)) for w in range(WEEKS)]


def pre_rmse(series):
    return math.sqrt(statistics.fmean((a - b) ** 2 for a, b in zip(treated[:START], series[:START])))


grid = [c for c in itertools.product(range(21), repeat=len(names)) if sum(c) == 20]  # ağırlıklar 0,05 adımlı, toplam 1
best = min(grid, key=lambda c: pre_rmse(blend([x / 20 for x in c])))
for label, weights in (("bağışçıların düz ortalaması", [0.25] * 4), ("sentetik kontrol", [x / 20 for x in best])):
    synthetic = blend(weights)
    effect = statistics.fmean(t / s - 1 for t, s in zip(treated[START:], synthetic[START:]))
    print(f"{label:28s} öncesi uyum hatası {pre_rmse(synthetic):5.1f}, tahmini etki %{100 * effect:+.1f}")
print("ağırlıklar:", {n: x / 20 for n, x in zip(names, best) if x})
```

```cikti
bağışçıların düz ortalaması  öncesi uyum hatası 118.3, tahmini etki %+37.7
sentetik kontrol             öncesi uyum hatası   8.7, tahmini etki %+9.7
ağırlıklar: {'Konya': 0.6, 'Sivas': 0.4}
```

Kurallar:

- Öncesi uyum hatası küçük değilse sonuç yoktur: karışım öncesini taklit edemiyorsa sonrasını da edemez.
- **Yerinde plasebo:** aynı yöntemi her bağışçı şehre "sanki kampanya oradaymış" diye uygulayın. Gerçek şehrin
  sonrası açığı, plasebo açıklarının çoğundan belirgin büyük değilse etki iddia edilmez.
- Bağışçılar müdahaleden etkilenmemiş ve kendi büyük şoklarını yaşamamış olmalı. Çok bağışçı ve kısa öncesi dönem
  aşırı uydurmaya götürür: öncesi dönemin son birkaç haftasını uydurmaya katmayıp doğrulama için ayırın.
- Gerçek işte ağırlıklar ızgara yerine kısıtlı en iyilemeyle bulunur ([optimizasyon](../92-matematik/optimizasyon.md));
  fikir aynıdır.

## 4. Kesintili zaman serisi

Yalnız tek seri var: haftalık destek talepleri. 36. haftada uygulama içi yardım eklendi (gerçek etki: haftada 15
talep az); kullanıcı sayısı büyüdüğü için talepler zaten artıyor. Parçalı regresyon eğilimi ayırır:

```python calistir
import random
import statistics

WEEKS, START, DROP = 52, 36, -15.0  # 36. haftada uygulama içi yardım eklendi; gerçek etki: haftada 15 talep az


def weekly_tickets(seed):
    rng, noise, series = random.Random(seed), 0.0, []
    for t in range(WEEKS):
        noise = 0.6 * noise + rng.gauss(0, 4)  # ardışık haftalar birbirine benzer (öz ilişkili gürültü)
        series.append(100 + 1.2 * t + DROP * (t >= START) + noise)  # kullanıcı büyüdükçe talep artıyor
    return series


def solve(a, b):  # küçük doğrusal sistem: Gauss eleme
    m = [row[:] + [v] for row, v in zip(a, b)]
    for c in range(len(m)):
        p = max(range(c, len(m)), key=lambda r: abs(m[r][c]))
        m[c], m[p] = m[p], m[c]
        for r in range(len(m)):
            if r != c:
                f = m[r][c] / m[c][c]
                m[r] = [x - f * y for x, y in zip(m[r], m[c])]
    return [m[i][-1] / m[i][i] for i in range(len(m))]


def level_change(ys, t0):  # parçalı regresyon: y = b0 + b1·t + b2·sonra + b3·(t − t0)·sonra → b2
    rows = [[1.0, t, float(t >= t0), (t - t0) * (t >= t0)] for t in range(len(ys))]
    xtx = [[sum(r[i] * r[j] for r in rows) for j in range(4)] for i in range(4)]
    xty = [sum(r[i] * y for r, y in zip(rows, ys)) for i in range(4)]
    return solve(xtx, xty)[2]


series = weekly_tickets(66)
naive = statistics.fmean(series[START:]) - statistics.fmean(series[:START])
print(f"öncesi–sonrası ortalama farkı: {naive:+.1f} talep/hafta   parçalı regresyon: {level_change(series, START):+.1f}")
estimates = [level_change(weekly_tickets(seed), START) for seed in range(200)]  # aynı süreç, 200 farklı gürültü
print(f"aynı süreç 200 kez: tahmin ortalaması {statistics.fmean(estimates):+.1f}, "
      f"standart sapma {statistics.stdev(estimates):.1f}")
```

```cikti
öncesi–sonrası ortalama farkı: +16.2 talep/hafta   parçalı regresyon: -15.1
aynı süreç 200 kez: tahmin ortalaması -15.3, standart sapma 5.2
```

Okuma: öncesi–sonrası "talepler arttı" diyor; parçalı regresyon düzey düşüşünü buluyor. Ama tek bir serinin tahmini
**±5 talep** oynuyor: kesin bir sayı değil, aralık raporlanır. Ardışık haftalar birbirine benzediği için sıradan
regresyonun verdiği standart hata belirsizliği küçük gösterir. Mevsim varsa (bayram, yaz, ay sonu) modele mevsim
terimi ya da geçen yılın aynı dönemi eklenir ([tahmin ve senaryo](tahmin-ve-senaryo.md),
[zaman serisi tahmini](../80-ml/zaman-serisi-tahmini.md)). En büyük tehdit **aynı hafta olan başka bir şeydir**
(fiyat değişikliği, kampanya, kesinti): o haftanın olay listesini yazmadan sonuç verilmez. Bir karşılaştırma serisi
bulunabiliyorsa yöntem farkların farkına dönüşür ve güçlenir.

## Sonuç nasıl yazılır

```text
Soru: Ücretsiz kargo İzmir'de haftalık siparişi artırdı mı?
Kanıt türü: yarı deney (farkların farkı; karşılaştırma: Bursa). Rastgele deney değildir.
Varsayım: kargo olmasa İzmir ve Bursa aynı oranda değişirdi (paralel eğilim).
Sınamalar: öncesi 12 haftada plasebo %+0,8 (sıfıra yakın); grafik ekte; Bursa'ya taşma beklenmiyor.
Sonuç: +%7 (öncesi–sonrası karşılaştırması bunu %−1 gösteriyordu: aynı hafta ülke genelinde %10 düşüş vardı).
Sınırlar: tek karşılaştırma şehri; 8 haftalık sonrası; yeni müşteri ile var olan müşteri ayrılmadı.
```

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| "Öncesine göre %30 arttı" sunumu | Mevsim, eğilim, eş zamanlı olay elenmedi | Karşılaştırma birimi ya da geçen yılın aynı dönemi |
| Farkların farkı büyük ama plasebo da büyük | Paralel eğilim bozuk | Başka karşılaştırma; sentetik kontrol; sonucu raporlamayın |
| Karşılaştırma şehri de "etkilendi" | Taşma: müşteri ya da sipariş şehir değiştirdi | Uzak ya da bağımsız birimler |
| Eşik etkisi banda göre işaret değiştiriyor | Eğrilik ya da az veri | Birkaç bant yan yana; grafiğe bakın |
| Eşiğin hemen üstünde kalabalık | Yığılma: insanlar eşiği oynuyor | Yöntem geçersiz; başka kanıt |
| Sentetik kontrol öncesini taklit edemiyor | Bağışçı havuzu uygun değil | Sonuç yok; başka birimler ya da başka yöntem |
| Tek seri, kesin "−15 talep" iddiası | Belirsizlik raporlanmadı | Aralık ver; öz ilişki nedeniyle sıradan standart hatayı küçültmeyin |
| Etki, müdahaleyi kendisi seçenlerde ölçüldü | Kendi kendini seçme | Bu yöntemler kurtarmaz; deney planlayın ([etki modelleme](../80-ml/etki-modelleme.md)) |
| Analiz yönteminin sonuca göre seçildiği izlenimi | Çatallanan yollar: en iyi görünen sonuç | Yöntemi ve sınamaları sonuca bakmadan yazın |

## Denetim listesi

- [ ] Sonuç cümlesinin yanında kanıt türü (yarı deney) ve dayandığı varsayım yazılı.
- [ ] Farkların farkında öncesi dönem plasebosu ve eğilim grafiği var; karşılaştırma birimine taşma tartışıldı.
- [ ] Eşik süreksizliğinde yığılma tablosu ve en az üç bant genişliği raporlandı; etkinin yerel olduğu yazıldı.
- [ ] Sentetik kontrolde öncesi uyum hatası, ağırlıklar ve bağışçı plaseboları var.
- [ ] Kesintili zaman serisinde mevsim, eş zamanlı olay listesi ve aralık var.
- [ ] Yöntem ve sınamalar sonuçtan önce yazıldı; birden çok yöntem varsa sonuçları yan yana.
- [ ] Mümkünse bir sonraki değişiklik için kademeli ve rastgele sıralı yayın planlandı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu değişiklik deneysiz uygulandı. Farkların farkı yap: log ölçekte, karşılaştırma birimi X.
  Öncesi dönemde sahte başlangıçla plasebo hesapla ve sonucu ayrı satırda ver. Sonuç cümlesinde kanıt türünü ve
  paralel eğilim varsayımını yaz; 'neden oldu' yerine 'varsayım altında tahmin' de."
- **Modelin tipik hatası:** öncesi–sonrası farkını etki diye yazar; plasebo ve eğilim grafiği yapmaz; tek bant
  genişliğiyle eşik etkisi verir; sentetik kontrolde öncesi uyumu göstermez; regresyonun standart hatasıyla
  kesinlik iddia eder; eşiğin yakınındaki sonucu herkese genelleştirir.
- **Çıktıda denetleyin:** plasebo satırı ve değeri; birden çok bant; ağırlıklar ve öncesi hata; olay listesi;
  sonuç cümlesindeki fiil.
- **Sorun:** "Müdahale hiç olmasaydı bu seri ne yapardı ve bunu hangi veriden biliyoruz?"

## İlgili

- [Korelasyon ve nedensellik](korelasyon-ve-nedensellik.md) — karıştırıcı, seçim, 2×2 farkların farkı
- [A/B testi](ab-testi.md) — mümkünse her zaman önce bu · [Anlamlılık ve güven aralığı](anlamlilik-ve-guven-araligi.md)
- [Tahmin ve senaryo](tahmin-ve-senaryo.md) — mevsimsel taban ve geriye dönük sınama
- [Etki modelleme](../80-ml/etki-modelleme.md) — kime müdahale edilmeli; geçmiş kampanya verisinin tuzağı
- [En küçük kareler](../92-matematik/en-kucuk-kareler.md) — doğru uydurma ve artıklar
- Gözlemsel bir karşılaştırma örneği: [`veri/docs/ANALIZ_TARIFLERI.md`](../../veri/docs/ANALIZ_TARIFLERI.md) 5. tarif
