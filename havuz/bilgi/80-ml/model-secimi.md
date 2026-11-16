---
baslik: Model seçimi
ozet: Veri türü, veri boyutu ve gereksinime (yorumlanabilirlik, hız, bellek) göre model ailesi seçimi; tablo verisinde ağaç topluluklarının üstünlüğü, derin öğrenmenin yeri ve basit modelin değeri.
etiketler: [makine-ogrenmesi, model-secimi, tablo-verisi, karar-tablosu, taban-cizgisi]
duzey: orta
guncellik: 2026-11
---

# Model seçimi

> Bu notu ne zaman okumalı: problem çerçevelendikten ve taban çizgisi kurulduktan sonra "hangi modeli
> deneyelim?" sorusunda; ya da biri tablo verisine doğrudan derin öğrenme önerdiğinde.

## Temel fikir

Model ailesini en çok **veri türü** belirler; sonra **veri boyutu**, sonra **gereksinimler** (açıklanabilirlik,
gecikme, bellek, olasılık kalitesi). Sıra hep aynıdır:

1. Taban çizgisi (çoğunluk sınıfı / ortalama / basit kural).
2. Düzenlileştirilmiş doğrusal model (lojistik regresyon, Ridge) — ölçekli girdiyle.
3. Tablo verisindeyse histogram tabanlı gradyan artırma, varsayılan ayarlar + erken durdurma.
4. Ancak fark ölçülürse: ayar, başka aile, topluluk.

Karmaşık model, basitten **güven aralığını aşan** bir farkla ve işletme maliyetine (gecikme, bakım, açıklama)
değecek kadar iyiyse seçilir. Fark yoksa basit model kazanır.

## Karar tablosu

| Veri ve durum | İlk aday | Sonra | Kaçının |
| --- | --- | --- | --- |
| Tablo, birkaç yüz satır | Düzenlileştirilmiş lojistik/Ridge, sığ orman | İç içe CV ile küçük ayar | Derin öğrenme, geniş ızgara araması |
| Tablo, binlerden milyonlara | Histogram tabanlı gradyan artırma | Ayar; lojistik tabanla karşılaştırma | Ölçeklemesiz k-NN, ham tek-sıcak binlerce sütun |
| Tablo + yorum zorunlu (kredi, sağlık) | Lojistik + puan kartı, sığ ağaç, toplamsal model (GAM) | Artırmayı yalnız kıyas için | Gerekçesi yazılamayan model |
| Hedef eğitim aralığının dışına çıkacak (fiyat artışı, büyüme) | Doğrusal model ya da farkı/oranı tahmin etmek | Ağaç + doğrusal artık | Ham hedefle ağaç (ekstrapolasyon yapamaz) |
| Metin, az etiket (sınıf başına < ~100) | TF-IDF + lojistik / Naive Bayes; ya da dil modeli ile sıfır atış | Gömme + doğrusal | Sıfırdan sinir ağı |
| Metin, binlerce etiket | Önceden eğitilmiş kodlayıcıya ince ayar | Damıtma, ONNX | Kural yığını |
| Görüntü, ses | Önceden eğitilmiş ağ + ince ayar (aktarım) | Veri artırma | Elle özellik + ağaç |
| Zaman serisi | Naif ve mevsimsel naif taban | Gecikme özellikli gradyan artırma | Rastgele ayrımla değerlendirilmiş herhangi bir model |
| Çok düşük gecikme, cihaz üstü | Doğrusal model, küçük ağaç, nicemlenmiş küçük ağ | — | Büyük topluluk |
| İyi olasılık gerekli | Lojistik ya da kalibre edilmiş artırma | Kalibrasyon ([not](kalibrasyon-ve-olasilik.md)) | Kalibre edilmemiş SVM/ağaç olasılıkları |
| Etiket yok | Kümeleme, aykırı değer, ya da etiket topla | — | Uydurma etiketle denetimli model |

## Model aileleri kısa karşılaştırma

| Aile | Güçlü yanı | Zayıf yanı | Ölçek ister | Eksik değer | Yorum |
| --- | --- | --- | --- | --- | --- |
| Doğrusal / lojistik (L2) | Hızlı, kararlı, iyi kalibre (lojistik), ekstrapolasyon | Eğri ve etkileşim elle eklenir | Evet | Doldurulmalı | Yüksek |
| k-en yakın komşu | Basit, yerel örüntü | Yüksek boyutta zayıf, tahmini yavaş | Evet | Doldurulmalı | Orta |
| Naive Bayes | Çok hızlı, az veriyle çalışır, metin | Olasılıkları aşırı emin | — | — | Orta |
| Tek karar ağacı | Okunur kurallar | Oynak, kolay aşırı öğrenir | Hayır | Uygulamaya bağlı | Yüksek (sığsa) |
| Rastgele orman | Az ayar, sağlam, torba dışı ölçüm | Büyük model, ekstrapolasyon yok | Hayır | Uygulamaya bağlı | Orta |
| Gradyan artırma | Tablo verisinde çoğu kez en iyi | Ayar ister, erken durdurma şart | Hayır | Histogram türünde evet | Orta |
| Doğrusal SVM | Yüksek boyutlu seyrek veri (metin) | Olasılık vermez (kalibrasyon gerekir) | Evet | Doldurulmalı | Orta |
| Sinir ağı | Yapısız veri, çok büyük veri, aktarım | Tablo verisinde çoğu kez ağaçların gerisinde; ayar ve donanım | Evet | Doldurulmalı | Düşük |

## Ağaç mı, doğru mu? Veri karar verir

Aynı iki model (doğru ve 4 derinlikli regresyon ağacı) üç durumda:

```python calistir
import math
import random
import statistics

random.seed(3)


def fit_line(rows):
    slope, intercept = statistics.linear_regression([x for x, _ in rows], [y for _, y in rows])
    return lambda x: slope * x + intercept


def fit_tree(rows, depth=4, min_leaf=3):  # tek değişkenli regresyon ağacı
    rows = sorted(rows)
    ys = [y for _, y in rows]
    mean, total, best, left = statistics.fmean(ys), sum(ys), None, 0.0
    for i in range(1, len(rows)):
        left += ys[i - 1]
        if depth > 0 and min_leaf <= i <= len(rows) - min_leaf and rows[i][0] > rows[i - 1][0]:
            gain = left * left / i + (total - left) ** 2 / (len(rows) - i)  # büyük = az kare hata
            if best is None or gain > best[0]:
                best = (gain, i)
    if best is None:
        return lambda x: mean
    i = best[1]
    cut, lo, hi = (rows[i - 1][0] + rows[i][0]) / 2, fit_tree(rows[:i], depth - 1), fit_tree(rows[i:], depth - 1)
    return lambda x: lo(x) if x <= cut else hi(x)


def rmse(model, rows):
    return math.sqrt(statistics.fmean((model(x) - y) ** 2 for x, y in rows))


def make(n, f, low=0.0, high=10.0, noise=1.0):
    return [(x, f(x) + random.gauss(0, noise)) for x in (random.uniform(low, high) for _ in range(n))]


cases = {
    "dış değer (x 10–20)": (make(200, lambda x: 2 * x), make(200, lambda x: 2 * x, 10, 20)),
    "az veri, doğrusal": (make(15, lambda x: 2 * x, noise=3), make(500, lambda x: 2 * x, noise=3)),
    "çok veri, eğri": (make(2000, lambda x: 8 * math.sin(x)), make(500, lambda x: 8 * math.sin(x))),
}
for name, (train, test) in cases.items():
    print(f"{name:20s} RMSE  doğru {rmse(fit_line(train), test):5.2f}   ağaç {rmse(fit_tree(train), test):5.2f}")
```

```cikti
dış değer (x 10–20)  RMSE  doğru  1.03   ağaç 11.83
az veri, doğrusal    RMSE  doğru  3.04   ağaç  3.72
çok veri, eğri       RMSE  doğru  5.39   ağaç  1.56
```

Üç ders: (1) ağaç, eğitimde gördüğü aralığın dışına **tahmin yapamaz**; en uçtaki yaprağın değerinde kalır.
Büyüyen bir hedef (fiyat, hacim) için doğrusal model ya da "değişimi tahmin et" kurgusu gerekir. (2) Az ve
gürültülü veride basit model kazanır. (3) Bol veride ve eğri ilişkide esnek model kazanır. Hangisinin
kazandığını tartışmak yerine aynı katlarla ölçün.

## Tablo verisinde neden çoğu kez ağaç toplulukları?

- Sütunlar farklı ölçek ve anlamda (yaş, tutar, kategori kodu); ağaç ölçeklemeye ve tekdüze dönüşüme duyarsız.
- İlişkiler eşikli ve düzensiz ("borç/gelir 0,4'ü geçince risk sıçrar"); ağaç eşiği doğrudan bulur.
- Etkileşimleri kendisi kurar; doğrusal modelde etkileşim elle eklenir.
- İşe yaramayan sütunlara görece dayanıklıdır; histogram tabanlı artırma eksik değeri kendisi işler.
- Az ayarla iyi sonuç verir; varsayılan ayarlar + erken durdurma sağlam bir başlangıçtır.

Derin öğrenme tablo verisinde ancak şu durumlarda ciddi adaydır: çok büyük veri, tablo + metin/görüntü
birlikte, çok sayıda yüksek kardinaliteli kimlik (gömme ile) ya da önceden eğitilmiş bir modelden aktarım. Bu
durumlarda bile gradyan artırma tabanı kurulur.

## Basit modelin değeri

- **Taban görevi görür:** karmaşık modelin kazancı ona göre ölçülür.
- **Hatası anlaşılır:** katsayılar ve kurallar okunur; tuhaf davranış erken görülür.
- **Ucuzdur:** eğitim saniyeler, tahmin mikro saniyeler; izleme ve yeniden eğitim kolay.
- **Sağlamdır:** dağılım biraz kaydığında karmaşık modelden daha az bozulma eğilimindedir (garanti değil).

Rapora şu satırı yazın: "Basit model (lojistik) X, seçilen model Y; fark Z (%95 GA: …)". Fark aralığı 0'ı
içeriyorsa basit model kullanılır.

## Seçim süreci

1. Bütün adaylar ve taban **aynı katlarla** çapraz doğrulanır ([ayrım notu](ayrim-ve-capraz-dogrulama.md)).
2. Ana ölçüt işin ölçütüdür ([ölçütler](degerlendirme-olcutleri.md)); ikinci ölçüt olarak süre ve model boyutu yazılır.
3. Kat başına fark ve yayılımı raporlanır; fark yayılımdan küçükse basit olan seçilir.
4. Seçilen model bütün eğitim verisiyle yeniden eğitilir; sınama kümesinde bir kez ölçülür.
5. Seçim gerekçesi (ölçüt farkı, kısıtlar) kayda geçer ([MLOps](mlops.md)).

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Tablo verisinde sinir ağı haftalarca ayarlandı, artırmayı geçemedi | Yanlış aile | Önce gradyan artırma tabanı |
| Fiyat tahmini yeni dönemde hep düşük kalıyor | Ağaç, eğitim aralığının üstüne çıkamaz | Doğrusal model, oran/değişim hedefi ya da ağaç + doğrusal eğilim |
| 30 aday denendi, en iyisi rapora girdi, canlıda daha kötü | Seçim iyimserliği | İç içe CV ya da ayrı sınama; aday sayısını azaltın |
| "Model A %0,4 daha iyi" kararıyla karmaşık model seçildi | Fark gürültü içinde | Eşleştirilmiş fark ve güven aralığı |
| SVM ya da artırmanın olasılıklarıyla eşik formülü uygulandı, sonuç kötü | Olasılıklar kalibre değil | Kalibrasyon ya da lojistik |
| k-NN çok kötü | Ölçeklenmemiş sütunlar ya da çok boyut | Ölçekleme; boyut azaltma; başka aile |
| Model canlıda gecikme bütçesini aşıyor | Seçimde gecikme ölçülmedi | Tahmin süresini adaylar tablosuna ekleyin |
| Sınıflandırmada doğrusal model "öğrenmiyor" | Etkileşim/eğri var, özellik yok | Etkileşim ve dönüşüm ekleyin ya da ağaç deneyin |

## Denetim listesi

- [ ] Taban çizgisi ve düzenlileştirilmiş doğrusal model ölçüldü.
- [ ] Tablo verisinde gradyan artırma aday listesinde.
- [ ] Bütün adaylar aynı katlarla, aynı ölçütle değerlendirildi; kat yayılımı raporlandı.
- [ ] Seçilen modelin basit modele farkı güven aralığıyla verildi.
- [ ] Ekstrapolasyon gerekip gerekmediği (hedef eğitim aralığının dışına çıkacak mı) düşünüldü.
- [ ] Gecikme, bellek ve model boyutu ölçülüp tabloya yazıldı.
- [ ] Olasılık kullanılacaksa kalibrasyon ölçüldü.
- [ ] Seçim gerekçesi ve elenen adaylar kayda geçti.

## Küçük modele yaptırırken

- **İsteme yazın:** "Şu sırayla dene ve her birini aynı 5 katla ölç: taban (DummyClassifier), ölçekli lojistik
  regresyon, HistGradientBoosting (varsayılan + erken durdurma). Sonuçları ortalama ± std tablosu olarak ver.
  Başka model önermeden önce bu tabloyu göster."
- **Modelin tipik hatası:** Tablo verisine doğrudan sinir ağı ya da "en güçlü" diye bilinen bir kütüphaneyi
  önerir; tabanı atlar; tek bir rastgele ayrımda en iyi görüneni seçer; farkın gürültü olabileceğini söylemez.
- **Çıktıda denetleyin:** tabloda taban satırı ve ± sütunu var mı; bütün modeller aynı `cv` nesnesini mi kullanıyor;
  seçilen modelin farkı yayılımdan büyük mü; tahmin süresi yazılmış mı.
- **Hazır araç:** `python -m ml_temel egit --veri x.csv --hedef y` doğrusal, orman ve artırma adaylarını aynı
  katlarla karşılaştırıp tabloyu kendisi yazar; küçük modelin elle kurduğu deneyle karşılaştırın.

## İlgili

- [Ağaç toplulukları](agac-topluluklari.md) — ayar rehberi · [Derin öğrenme temelleri](derin-ogrenme-temelleri.md)
- [Aşırı öğrenme](asiri-ogrenme.md) · [Zaman serisi tahmini](zaman-serisi-tahmini.md) ·
  [Metin sınıflandırma](metin-siniflandirma.md) · [Hesaplama ve donanım](hesaplama-ve-donanim.md)
- Aday modeller ve ön işlemeleri: [`ml_temel/tablo/candidates.py`](../../ml-temel/ml_temel/tablo/candidates.py)
- Modellerin numpy gerçeklemeleri ve scikit-learn eşlemesi: [`ml-temel/AGENTS.md`](../../ml-temel/AGENTS.md)
  (tarif 6), hız ölçümleri: [`ml-temel/README.md`](../../ml-temel/README.md)
- İstem mi, RAG mı, ince ayar mı: [`ince-ayar/docs/NE_ZAMAN_INCE_AYAR.md`](../../ince-ayar/docs/NE_ZAMAN_INCE_AYAR.md);
  dil modeliyle sınıflandırma: `85-llm` kümesi
