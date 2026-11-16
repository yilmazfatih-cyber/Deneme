---
baslik: Öneri sistemleri
ozet: Popülerlik tabanı, işbirlikçi süzme ve içerik tabanlı öneri sezgisi, soğuk başlangıç, örtük geri bildirim, çevrimdışı değerlendirme tuzakları ve geri besleme döngüsü; çalışan benzetimlerle.
etiketler: [makine-ogrenmesi, oneri, isbirlikci-suzme, degerlendirme, geri-besleme]
duzey: orta
guncellik: 2026-11
---

# Öneri sistemleri

> Bu notu ne zaman okumalı: "bunu alan şunu da aldı", "size özel", "benzer ürünler" gibi bir özellik
> kurarken; bir öneri modelinin çevrimdışı başarısını yorumlarken; vitrin hep aynı ürünlere kilitlendiğinde.

## Temel fikir

Öneri, kullanıcıya gösterilecek **sıralı kısa bir liste** üretmektir. Üç bilgi kaynağı vardır:

- **Popülerlik:** herkesin çok etkileştiği öğeler. Şaşırtıcı derecede güçlü bir tabandır; her model onunla kıyaslanır.
- **İşbirlikçi süzme (collaborative filtering):** "benzer davranan kullanıcılar" ya da "birlikte tüketilen öğeler".
  Öğenin içeriğini bilmez; yalnız etkileşim geçmişine bakar.
- **İçerik tabanlı:** öğenin özellikleri (kategori, metin, gömme). Yeni öğe için tek yol budur.

İki ayrı zorluk modelden önce gelir: **değerlendirme** (çevrimdışı ölçüm kolayca yanıltır) ve **geri besleme
döngüsü** (sistem, kendi gösterdiklerinden öğrenir).

## Yaklaşım seçimi

| Durum | Yaklaşım | Neden |
| --- | --- | --- |
| Başlangıç, az veri | Popülerlik (+ kategori içi popülerlik) + iş kuralları | Ucuz, sağlam taban |
| "Bunu alan şunu da aldı" | Öğe-öğe işbirlikçi süzme (birlikte görülme sayısı, kosinüs) | Basit, açıklanır, hızlı |
| Kişisel ana sayfa | Öğe-öğe ya da matris ayrıştırma/gömme ile kullanıcı-öğe puanı | Kullanıcının bütün geçmişini kullanır |
| Yeni öğe çok, etkileşim az (haber, ilan) | İçerik tabanlı (metin/görsel gömme) | Etkileşim beklemeden önerilir |
| Hepsi | Karma: aday üretimi (birkaç yöntem) + sıralama modeli | Büyük sistemlerin olağan yapısı |
| Stok, yaş sınırı, yasal kısıt | Her zaman en sonda iş kuralı süzgeci | Model bunları bilmez |

## Taban ve işbirlikçi süzme: çalışan karşılaştırma

400 kullanıcı, 120 ürün (12 grup), her kullanıcının iki gözde grubu var. Her kullanıcının **son** etkileşimi sınama,
öncesi eğitim (zaman ayrımı); ölçüt: son ürün ilk 10 öneride mi (hit@10)?

```python calistir
import math
import random
from collections import Counter, defaultdict

random.seed(36)
GROUPS, PER_GROUP = 12, 10
ITEMS = GROUPS * PER_GROUP
weight = [1 / (1 + i % PER_GROUP) for i in range(ITEMS)]  # her grupta birkaç popüler ürün
pick = lambda candidates: random.choices(candidates, weights=[weight[i] for i in candidates])[0]
histories = []
for _ in range(400):
    favorites = [g * PER_GROUP + k for g in random.sample(range(GROUPS), 2) for k in range(PER_GROUP)]
    seq = []
    while len(seq) < 15:
        item = pick(favorites) if random.random() < 0.8 else pick(range(ITEMS))
        if item not in seq:
            seq.append(item)
    histories.append(seq)

train, test = [h[:-1] for h in histories], [h[-1] for h in histories]
popularity = Counter(i for h in train for i in h)
together = defaultdict(Counter)  # birlikte görülme sayıları (yalnız eğitimden)
for h in train:
    for a in h:
        for b in h:
            if a != b:
                together[a][b] += 1


def popular(history, k=10):
    return [i for i, _ in popularity.most_common() if i not in history][:k]


def item_item(history, k=10):
    scores = Counter()
    for a in history:
        for b, count in together[a].items():
            if b not in history:
                scores[b] += count / math.sqrt(popularity[a] * popularity[b])  # kosinüs benzeri düzeltme
    return [i for i, _ in scores.most_common(k)]


rng = random.Random(0)
unseen_random = lambda history, k=10: rng.sample([i for i in range(ITEMS) if i not in history], k)
for name, recommender in (("rastgele", unseen_random), ("popülerlik", popular), ("öğe-öğe", item_item)):
    print(f"{name:10s} hit@10 {sum(t in recommender(h) for h, t in zip(train, test)) / len(test):.2f}")
```

```cikti
rastgele   hit@10 0.09
popülerlik hit@10 0.14
öğe-öğe    hit@10 0.45
```

Öğe-öğe süzme, kullanıcının gözde gruplarını geçmişinden "buluyor". Gerçek veride fark bu kadar büyük olmayabilir;
ama sıra hep aynıdır: önce popülerlik tabanını ölçün, model onu anlamlı farkla geçmiyorsa karmaşıklık eklemeyin.
Birlikte görülmeyi popülerlikle düzeltmezseniz (karekök bölmesi) her öneri listesi yine en popüler ürünlere kayar.

## Soğuk başlangıç

| Durum | Yapılacak |
| --- | --- |
| Yeni kullanıcı, geçmiş yok | Popülerlik (bölge, kanal, saat bazında); ilk oturumda birkaç tercih sorusu; ilk tıklardan sonra hızla kişiselleştirme |
| Yeni öğe, etkileşim yok | İçerik tabanlı benzerlik (kategori, metin/görsel gömme); vitrinde küçük bir keşif payı |
| Yeni sistem | Editör seçkileri + iş kuralları + popülerlik; kayıt (log) altyapısını ilk günden kurun |

## Örtük geri bildirim

Çoğu sistemde "beğenmedim" bilgisi yoktur; yalnız davranış vardır: görüntüleme, tıklama, sepete ekleme, satın alma,
izleme süresi.

- **Yokluk olumsuzluk değildir:** kullanıcı bir ürünü görmediği için tıklamamış olabilir. Olumsuz örnekler
  "gösterildi ama tıklanmadı" kayıtlarından ya da örneklemeyle seçilir.
- **Sinyalleri ağırlıklandırın:** satın alma > sepete ekleme > tıklama > görüntüleme. Hedef işin hedefi olsun (tık
  değil satış ya da geri dönüş; [problem çerçeveleme](problem-cerceveleme.md)).
- **Konum yanlılığı:** listenin üstündekiler daha çok tıklanır; "tıklandı" kısmen "üstte gösterildi" demektir.
- **Tekrar tüketim:** sarf malzemesinde (kahve) yeniden önermek doğru, dayanıklı malda (buzdolabı) yanlıştır;
  "görüleni çıkar" kuralını ürün türüne göre verin.

## Çevrimdışı değerlendirme tuzakları

| Tuzak | Ne olur | Doğrusu |
| --- | --- | --- |
| Rastgele ayrım | Model gelecekteki etkileşimlerden öğrenip geçmişi "tahmin eder"; yükselen trendleri önceden bilir | Zaman ayrımı: her kullanıcının son etkileşimi ya da bir tarihten sonrası sınama |
| Popülerlik yanlılığı | Ölçütler popüler öğeleri öneren modeli ödüllendirir; model "iyi" görünür ama kimseye yeni bir şey göstermez | Popülerlik tabanını hep yanına yazın; kapsama ve çeşitliliği de ölçün |
| Örneklenmiş ölçüt | "Gerçek öğe + 100 rastgele öğe arasında sıra" ölçütü iyimserdir ve modellerin sırasını değiştirebilir | Bütün aday kümesinde sıralayın |
| Maruz kalma yanlılığı | Kayıtlar eski sistemin gösterdiklerinden ibaret; hiç gösterilmeyenin başarısı bilinmez | Küçük rastgele keşif grubu; sonuçları dikkatle genelleyin |
| Görülenleri süzmemek | Kullanıcının zaten aldığı ürün önerilir, ölçüt şişer | Değerlendirmede ve canlıda aynı süzgeç |
| Ağır kullanıcı baskınlığı | Etkileşim başına ortalama, çok aktif birkaç kullanıcıya göre şekillenir | Kullanıcı başına ortalama; aktiflik dilimlerine ayrı bakın |
| Çevrimdışı = çevrimiçi sanmak | Çevrimdışı kazanç canlıda görünmeyebilir | Son karar kontrol gruplu canlı deneme (A/B) |

Ölçütler: hit@k, recall@k, MRR, nDCG@k ([değerlendirme ölçütleri](degerlendirme-olcutleri.md)); ayrıca **katalog
kapsaması** (önerilen farklı öğe oranı) ve **çeşitlilik**.

## Geri besleme döngüsü

Sistem gösterdiğini öğrenir; göstermediğini hiç öğrenemez. 50 ürün, vitrinde 5 yer, ürünlerin gerçek çekiciliği
farklı. Vitrin toplam tıka göre doluyor; bir sürümde gösterimlerin %10'u rastgele bir ürüne ayrılıyor (keşif):

```python calistir
import random

random.seed(37)
ITEMS, SLOTS = 50, 5
appeal = [random.uniform(0.02, 0.10) for _ in range(ITEMS)]  # gerçek tıklanma olasılığı
best = set(sorted(range(ITEMS), key=lambda i: -appeal[i])[:SLOTS])


def simulate(explore, rounds=60, visitors=200):
    rng = random.Random(1)
    clicks, shows, total = [0] * ITEMS, [0] * ITEMS, 0
    for _ in range(rounds):
        showcase = sorted(range(ITEMS), key=lambda i: (-clicks[i], i))[:SLOTS]  # en çok tıklanan 5
        for _ in range(visitors):
            item = rng.choice(showcase) if rng.random() >= explore else rng.randrange(ITEMS)
            shows[item] += 1
            if rng.random() < appeal[item]:
                clicks[item] += 1
                total += 1
    final = set(sorted(range(ITEMS), key=lambda i: (-clicks[i], i))[:SLOTS])
    return total, len(final & best), sum(1 for s in shows if s > 0)


for name, explore in (("keşifsiz", 0.0), ("%10 keşif", 0.1)):
    total, found, seen = simulate(explore)
    print(f"{name:10s} toplam tık {total}, son vitrinde gerçek en iyi 5'ten {found}, hiç gösterilen ürün {seen}/{ITEMS}")
```

```cikti
keşifsiz   toplam tık 826, son vitrinde gerçek en iyi 5'ten 0, hiç gösterilen ürün 5/50
%10 keşif  toplam tık 996, son vitrinde gerçek en iyi 5'ten 2, hiç gösterilen ürün 50/50
```

Keşifsiz sistem ilk turda rastgele seçtiği 5 ürüne kilitleniyor; 45 ürün hiç gösterilmediği için daha iyi olanlar
asla bulunamıyor. Çareler:

- Vitrinin küçük bir payını keşfe ayırın (rastgele ya da belirsizliği yüksek öğeler); daha iyi yöntemler tıklama
  oranını belirsizlik payıyla birlikte kullanır (UCB, Thompson örneklemesi — kavram düzeyinde).
- Hangi öğenin hangi olasılıkla gösterildiğini kaydedin; ileride yansız değerlendirme için gerekir.
- Çeşitlilik ve kapsama kısıtı koyun; yeni öğelere zorunlu gösterim kotası verin.
- Öneri görmeyen küçük bir kontrol grubu tutun; sistemin gerçek katkısını ancak o gösterir.

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Çevrimdışı harika, canlıda etkisiz | Rastgele ayrım, örneklenmiş ölçüt ya da popülerlik yanlılığı | Zaman ayrımı, tam aday kümesi, popülerlik tabanı, A/B |
| Herkese aynı ürünler öneriliyor | Birlikte görülme popülerlikle düzeltilmemiş | Kosinüs/ağırlıklı benzerlik; çeşitlilik kısıtı |
| Yeni ürünler hiç görünmüyor | Yalnız etkileşim tabanlı model + keşif yok | İçerik tabanlı aday + keşif kotası |
| Aynı ürünü yeniden öneriyor | Görülen/alınanlar süzülmemiş | Ürün türüne göre süzgeç |
| Tıklama arttı, satış ve memnuniyet düştü | Hedef tık; tık tuzağı öneriler | Hedefi satış/geri dönüşe çevirin; ikisini birlikte izleyin |
| Stokta olmayan ürün öneriliyor | İş kuralı süzgeci sonda değil | Sıralamadan sonra kural süzgeci |
| Öneri listesi her yenilemede çok değişiyor | Puanlar gürültülü, eşitlikler rastgele kırılıyor | Kararlı sıralama (eşitlikte sabit anahtar) |

## Denetim listesi

- [ ] Popülerlik tabanı aynı ayrım ve ölçütle ölçüldü; model onu anlamlı farkla geçiyor.
- [ ] Değerlendirme zaman ayrımıyla; görülen öğeler süzülerek; bütün aday kümesinde yapıldı.
- [ ] Ölçütlerin yanında kapsama ve çeşitlilik raporlandı; kullanıcı başına ortalama alındı.
- [ ] Soğuk başlangıç (yeni kullanıcı, yeni öğe) için ayrı yol tanımlı ve sınandı.
- [ ] Vitrinde keşif payı ve gösterim kaydı (hangi öğe, hangi konum, hangi olasılık) var.
- [ ] İş kuralları (stok, yaş, yasal) sıralamadan sonra uygulanıyor.
- [ ] Hedef ölçüt işin hedefi (satış, geri dönüş); tık yalnız ara gösterge.
- [ ] Canlıya çıkış kontrol gruplu bir denemeyle karar verildi.

## Küçük modele yaptırırken

- **İsteme yazın:** "Önce popülerlik tabanını kur. Değerlendirmeyi zaman ayrımıyla yap: her kullanıcının son
  etkileşimi sınama. Kullanıcının daha önce etkileştiği öğeleri öneriden çıkar. hit@10, nDCG@10 ve katalog
  kapsamasını popülerlik tabanıyla yan yana ver."
- **Modelin tipik hatası:** `train_test_split` ile etkileşimleri rastgele böler; 100 rastgele olumsuzla örneklenmiş
  ölçüt kullanır; popülerlik tabanını atlar; görülen öğeleri süzmez; geri besleme döngüsünden hiç söz etmez.
- **Çıktıda denetleyin:** ayrımın zamana göre olduğu; aday kümesinin bütün katalog olduğu; tabanın tabloda yer aldığı;
  önerilerin kaç farklı öğeye dağıldığı.

## İlgili

- [Gömmeler ve benzerlik](gommeler-ve-benzerlik.md) — içerik tabanlı öneri · [Değerlendirme ölçütleri](degerlendirme-olcutleri.md)
- [Problem çerçeveleme](problem-cerceveleme.md) — vekil hedef · [Veri sızıntısı](veri-sizintisi.md) — zaman ayrımı
- Deneme verisi: e-ticaret siparişleri ve kalemleri [`veri/ornekler/eticaret/VERI_KARTI.md`](../../veri/ornekler/eticaret/VERI_KARTI.md),
  web olayları [`veri/ornekler/web_olaylari/VERI_KARTI.md`](../../veri/ornekler/web_olaylari/VERI_KARTI.md)
- [Ürün ölçütleri](../70-veri/urun-olcutleri.md), [Olay izleme planı](../70-veri/olay-izleme-plani.md),
  [A/B testi](../70-veri/ab-testi.md)
