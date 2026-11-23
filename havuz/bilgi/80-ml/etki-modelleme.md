---
baslik: Etki modelleme (uplift)
ozet: "Kim ayrılacak" ile "kime dokunmak sonucu değiştirir" farkı; dört müşteri türü, deneyle veri toplama, iki model yaklaşımı, dilimle değerlendirme ve beklenen değer kararı; tohumlu benzetimlerle.
etiketler: [makine-ogrenmesi, nedensellik, uplift, kampanya, deney, karar]
duzey: ileri
guncellik: 2026-11
---

# Etki modelleme (uplift)

> Bu notu ne zaman okumalı: "ayrılma olasılığı yüksek müşterileri arayalım / indirim verelim / bildirim
> gönderelim" planında; bir kampanya modelinin başarısını ölçerken; geçmiş kampanya verisinden "işe yaradı mı"
> sonucu çıkarılmak istendiğinde.

## Temel fikir

Kayıp (churn) modeli şunu söyler: **aranmazsa** kim ayrılır? Karar ise başka bir soru sorar: **aransa** sonucu
değişecek olan kim? İkisinin farkına etki (uplift) denir: `etki(x) = P(ayrılır | x, aranmaz) − P(ayrılır | x, aranır)`.
Müşteriler dört türdür:

| Tür | Aranmazsa | Aranırsa | Aramanın değeri |
| --- | --- | --- | --- |
| İkna edilebilir (persuadable) | Ayrılır | Kalır | Bütün kazanç buradan |
| Zaten kalacak (sure thing) | Kalır | Kalır | Boşa maliyet |
| Ne yapsan gider (lost cause) | Ayrılır | Ayrılır | Boşa maliyet |
| Uyuyan köpek (sleeping dog) | Kalır | **Ayrılır** | Zarar: arama iptali hatırlatır, sözleşmeyi gözden geçirtir |

Risk sıralaması en üste "ne yapsan gider"leri ve çoğu zaman "uyuyan köpek"leri koyar. Etki bireyde **gözlenmez**
(aynı kişi hem aranıp hem aranmamış olamaz); yalnız **rastgele** aranan ve aranmayan gruplar karşılaştırılarak
gruplar için kestirilir. Bu yüzden etki modellemesi deneysiz yapılmaz ([A/B testi](../70-veri/ab-testi.md)).

## Karar tablosu

| Soru | Yaklaşım | Neden |
| --- | --- | --- |
| "Kampanya ortalamada işe yarıyor mu?" | Rastgele kontrol gruplu deney; ortalama etki | Tek sayı; model gerekmez |
| "Kime yapmalıyız?" ve deney verisi var | Etki modeli (iki model, dönüştürülmüş hedef) | Kişiye göre değişen etki |
| "Kime yapmalıyız?" ama yalnız geçmiş kampanya verisi var | Önce deney: bir sonraki kampanyada rastgele kontrol | Geçmiş hedefleme seçilmişti; etki karışır |
| Etki herkeste aşağı yukarı aynı, maliyet düşük | Risk modeli + beklenen değer eşiği yeter | Etki sabitse sıralama riskle aynıdır |
| Müdahale zarar verebilir (zam duyurusu, sözleşme hatırlatma) | Etki modeli şart; uyuyan köpekleri dışarıda bırakın | Risk modeli zararı göremez |
| Kapasite sınırlı (günde 200 arama) | Tahmini etki × değer − maliyet sırasıyla doldurun | Kâr sırası, risk sırası değildir |
| Etki çok küçük, deney için örnek yetmiyor | Herkese aynı politika; segment düzeyinde ortalama etki | Kişi düzeyinde kestirim gürültü olur |

## Neden risk sıralaması yanıltır: benzetim

Kullanım düşüşü (`risk`, 0–4) ayrılma olasılığını belirliyor; teklife duyarlılık (`sens`, 0–4) aramanın etkisini.
Riski en yüksek olanlarda arama az işe yarıyor; duyarlılığı sıfır olanlar arandığında daha çok ayrılıyor. Önce
rastgele denemeli bir kampanya (yarısı arandı), sonra yeni müşterilerin %20'si için dört hedefleme:

```python calistir
import random
from collections import defaultdict

rng = random.Random(3)


def customer():
    risk, sens = rng.randint(0, 4), rng.randint(0, 4)  # kullanım düşüşü düzeyi, teklife duyarlılık
    p0 = 0.05 + 0.12 * risk  # aranmazsa ayrılma olasılığı
    if risk == 4:
        effect = 0.02  # ne yapsan gider
    elif sens == 0:
        effect = -0.06  # uyuyan köpek: arama iptali hatırlatır
    else:
        effect = 0.04 * sens  # ikna edilebilir: duyarlılıkla artar
    return (risk, sens), p0, p0 - effect  # aranırsa ayrılma olasılığı


# 1) Rastgele denemeli kampanya: yarısı arandı, yarısı aranmadı (kontrol)
counts = defaultdict(lambda: [0, 0, 0, 0])  # hücre → [kontrol n, kontrol ayrılan, aranan n, aranan ayrılan]
for _ in range(20_000):
    cell, p0, p1 = customer()
    treated = rng.random() < 0.5
    churned = rng.random() < (p1 if treated else p0)
    c = counts[cell]
    c[2 * treated] += 1
    c[2 * treated + 1] += churned
risk_hat = {cell: c[1] / c[0] for cell, c in counts.items()}  # "kim ayrılacak" (kontrolden)
uplift_hat = {cell: c[1] / c[0] - c[3] / c[2] for cell, c in counts.items()}  # iki model: fark

# 2) Yeni 20.000 müşteriden %20'si aranabilir. Kimi seçmeli?
population = [customer() for _ in range(20_000)]
k = len(population) // 5
strategies = {
    "rastgele": lambda c: rng.random(),
    "en riskli (kim ayrılacak)": lambda c: risk_hat[c[0]] + 1e-9 * rng.random(),
    "en yüksek tahmini etki": lambda c: uplift_hat[c[0]] + 1e-9 * rng.random(),
    "gerçek etki (erişilemez tavan)": lambda c: c[1] - c[2],
}
CALL, VALUE = 20, 600  # arama maliyeti, kurtarılan müşterinin değeri (TL, kurgusal)
print("strateji                         önlenen kayıp   kâr (TL)")
for name, key in strategies.items():
    chosen = sorted(population, key=key, reverse=True)[:k]
    saved = sum(p0 - p1 for _, p0, p1 in chosen)  # beklenen önlenen ayrılma
    profit = saved * VALUE - k * CALL
    print(f"{name:32s} {saved:9.0f}   {profit:10,.0f}".replace(",", "."))
```

```cikti
strateji                         önlenen kayıp   kâr (TL)
rastgele                               233       59.632
en riskli (kim ayrılacak)               80      -32.000
en yüksek tahmini etki                 575      265.144
gerçek etki (erişilemez tavan)         610      285.856
```

En riskli %20'yi aramak **rastgele aramaktan bile kötü** ve zarar ettiriyor: o dilim "ne yapsan gider"lerle dolu.
Etki tahminine göre seçmek tavana yakın. Burada "model" hücre başına iki oranın farkıdır (iki model yaklaşımının en
yalın hâli); gerçek veride hücre yerine iki sınıflandırıcı kullanılır.

## Geçmiş kampanya verisi deney değildir

Geçmişte riskli müşteriler arandıysa "arananlar daha çok ayrıldı" görülür; arama herkeste kaybı azalttığı hâlde:

```python calistir
import random

rng = random.Random(8)
rows = []
for _ in range(20_000):
    risk = rng.randint(0, 4)
    p0 = 0.05 + 0.12 * risk
    called = rng.random() < (0.9 if risk >= 3 else 0.1)  # geçmiş kampanya riskli olanları aradı
    p = p0 - 0.05 if called else p0  # arama HERKESTE kaybı 5 puan azaltıyor
    rows.append((risk, called, rng.random() < p))


def churn(subset):
    return 100 * sum(c for *_, c in subset) / len(subset)


called = [r for r in rows if r[1]]
not_called = [r for r in rows if not r[1]]
print(f"aranan %{churn(called):.0f} ayrıldı, aranmayan %{churn(not_called):.0f} → 'arama kaybı artırıyor'?")
for risk in range(5):
    a = [r for r in called if r[0] == risk]
    b = [r for r in not_called if r[0] == risk]
    print(f"risk {risk}: aranan %{churn(a):.0f}, aranmayan %{churn(b):.0f}")
assert churn(called) > churn(not_called)
```

```cikti
aranan %38 ayrıldı, aranmayan %20 → 'arama kaybı artırıyor'?
risk 0: aranan %0, aranmayan %5
risk 1: aranan %13, aranmayan %17
risk 2: aranan %24, aranmayan %30
risk 3: aranan %36, aranmayan %42
risk 4: aranan %49, aranmayan %58
```

Katmanlara bakınca etki görünüyor; ama gerçek veride hedeflemeyi belirleyen her şeyi (temsilcinin sezgisi, müşterinin
şikâyeti) bilemezsiniz. Geçmiş veriyle en fazla "eğilim puanı" (propensity) gibi yöntemlerle **varsayımlı** bir
kestirim yapılır ([deney yapılamayanda nedensellik](../70-veri/deney-yapilamayanda-nedensellik.md)); güvenilir yol
bir sonraki kampanyada rastgele kontrol grubu tutmaktır ([korelasyon ve nedensellik](../70-veri/korelasyon-ve-nedensellik.md)).

## Deneyle veri toplama

1. **Uygun liste** çıkarılır (ör. son 30 günde kullanımı düşen aboneler). Kural ve tarih yazılır.
2. Listede **rastgele** atama: aranan / aranmayan. Etki modeli kurulacaksa oran %50/%50'ye yakın; yalnız ortalama
   etki ölçülecekse %10–20 kontrol yeter. Atama özetle (ör. müşteri kimliği + kampanya adı) yapılır, kaydedilir.
3. **Sonuç penceresi** önceden sabitlenir ("aramadan sonraki 60 gün içinde iptal"); pencere dolmadan bakılmaz.
4. Atanan ama ulaşılamayan müşteri "aranan" grubunda kalır (niyete göre analiz, intention-to-treat). Yalnız
   ulaşılanları saymak, ulaşılabilen (zaten ilgili) müşterileri seçer.
5. Özellikler **atamadan önceki** veriden hesaplanır. Aramadan sonra oluşan bir alan ("temsilci notu") modele girerse
   sızıntıdır ([veri sızıntısı](veri-sizintisi.md)).
6. Örneklem: etki farkı küçüktür. %30 taban kayıpta 5 puanlık farkı görmek için grup başına ~1.300 müşteri gerekir;
   etkiyi 5 segmentte ayrı görmek isterseniz bunun 5 katı. Hesap: [A/B testi](../70-veri/ab-testi.md).

## Modeller

| Yöntem | Nasıl | Güçlü yanı | Zayıf yanı |
| --- | --- | --- | --- |
| İki model (T-learner) | Arananlarda bir model, aranmayanlarda bir model; etki = fark | Basit, her sınıflandırıcıyla olur | İki hatanın farkı gürültülü; küçük etkide oynak |
| Tek model + "arandı" özelliği (S-learner) | Tek modele atamayı özellik verin; iki kez tahmin edip farkı alın | Az veride kararlı | Ağaç modeli "arandı" sütununu hiç kullanmayabilir → her yerde sıfır etki |
| Dönüştürülmüş hedef | %50/%50 atamada hedef: aranan ve kaldıysa +2, aranmayan ve kaldıysa −2, ayrılanlar 0; bu hedefe regresyon | Tek model doğrudan etkiyi tahmin eder | Varyansı yüksek; atama oranı tam bilinmeli |
| Etki ağaçları / ormanları | Bölmeyi etki farkını büyütecek biçimde seçer | Etkiye göre doğrudan bölme | Hazır gerçekleme gerekir; ayarı zor |

Dönüştürülmüş hedefin genel biçimi, atama olasılığı `e` iken `Y·(T − e) / (e·(1 − e))`'dir (Y = 1 kaldı); `e = 0,5`
için yukarıdaki ±2 olur. Hangi yöntem olursa olsun değerlendirme aynıdır (aşağıda).

## Değerlendirme: dilimle

Bireysel etki gözlenmediği için doğruluk ya da ROC-AUC ölçülemez. Ayrı bir **rastgele denemeli** sınama kümesi
tahmine göre sıralanır ve her dilimde kontrol − aranan farkı hesaplanır:

```python calistir
import random
from collections import defaultdict

rng = random.Random(5)


def campaign(n):  # rastgele denemeli kampanya satırları: (hücre, arandı mı, ayrıldı mı)
    rows = []
    for _ in range(n):
        risk, sens = rng.randint(0, 4), rng.randint(0, 4)
        p0 = 0.05 + 0.12 * risk
        effect = 0.02 if risk == 4 else (-0.06 if sens == 0 else 0.04 * sens)
        treated = rng.random() < 0.5
        rows.append(((risk, sens), treated, rng.random() < (p0 - effect if treated else p0)))
    return rows


def rate(rows, treated):
    group = [churned for _, t, churned in rows if t == treated]
    return sum(group) / len(group)


train, test = campaign(20_000), campaign(20_000)
by_cell = defaultdict(list)
for row in train:
    by_cell[row[0]].append(row)
uplift_hat = {cell: rate(rows, False) - rate(rows, True) for cell, rows in by_cell.items()}

# Bireysel etki gözlenmez: sınama kümesini tahmine göre sırala, dilimde kontrol − aranan farkına bak.
ranked = sorted(test, key=lambda r: uplift_hat[r[0]] + 1e-9 * rng.random(), reverse=True)
print("dilim (tahmine göre)  tahmini etki  gözlenen etki (kontrol − aranan)")
fifth = len(ranked) // 5
for i in range(5):
    part = ranked[i * fifth:(i + 1) * fifth]
    predicted = sum(uplift_hat[r[0]] for r in part) / len(part)
    print(f"{i + 1}. beşte bir            {predicted:+.3f}        {rate(part, False) - rate(part, True):+.3f}")
```

```cikti
dilim (tahmine göre)  tahmini etki  gözlenen etki (kontrol − aranan)
1. beşte bir            +0.162        +0.142
2. beşte bir            +0.095        +0.070
3. beşte bir            +0.050        +0.039
4. beşte bir            -0.006        +0.027
5. beşte bir            -0.061        -0.025
```

Okuma kuralları:

- **Sıra tutuyor mu?** Gözlenen etki dilimden dilime azalmalı. Tutmuyorsa model sıralamayı bilmiyor demektir.
- **Uçlar abartılı:** en üst dilimin tahmini (+0,162) gözlenenden (+0,142) yüksek; en alttaki de olduğundan kötü.
  Çok hücre arasından en uçtakini seçmek, şanslı tahmini seçmektir (kazananın laneti). Eşik ve kâr hesabını eğitim
  tahminiyle değil sınama dilimlerinde **gözlenen** etkiyle yapın.
- **Negatif dilim** varsa (son satır) o dilime hiç dokunmamak kârdır; risk modeli bunu göremez.
- Birikimli biçimi (ilk %k aranırsa toplam önlenen kayıp) etki eğrisi ya da Qini eğrisi diye anılır; rastgele
  hedeflemenin düz çizgisiyle karşılaştırılır.

## Karar: beklenen değer

Kişi (ya da dilim) için: **arama değeri = etki × kurtarılan müşterinin değeri − arama maliyeti**. 600 TL değer ve
20 TL maliyetle etki 0,033'ün altındaysa aramak zarardır. Bu hesap, [problem çerçeveleme](problem-cerceveleme.md) ve
[kalibrasyon](kalibrasyon-ve-olasilik.md) notlarındaki "aranırsa %30'u kalır" varsayımının yerine geçer: o oran
herkes için aynı değildir ve en riskli dilimde en düşüktür.

- Kapasite sınırlıysa: dilimleri `etki × değer − maliyet` sırasıyla doldurun, negatif olanda durun.
- Birden çok müdahale varsa (arama, indirim, e-posta) her biri için ayrı kontrol grubu ve ayrı etki; indirimin
  maliyeti zaten kalacak olana da ödenir, bu yüzden "zaten kalacak"ların payı kârı belirler.
- Modeli canlıya aldıktan sonra da her kampanyada küçük bir rastgele kontrol grubu kalır: etki zamanla değişir,
  ölçemezseniz bilemezsiniz.

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Riskli müşterileri aradık, kayıp oranı değişmedi | Riskli dilim "ne yapsan gider"lerle dolu | Etkiyi deneyle ölçün; etkiye göre hedefleyin |
| "Arananlar daha çok ayrılmış, arama zararlı" | Geçmiş hedefleme seçilmişti (karıştırıcı) | Rastgele kontrol grubu; katmanlı bakış |
| Etki modeli çok iyi bir ROC-AUC veriyor | Etki değil, ayrılma ölçülüyor | Dilimle, deneyli sınama kümesinde gözlenen etki |
| Tek model + "arandı" özelliği, etki her yerde 0 | Ağaç atama sütununu kullanmadı | İki model ya da dönüştürülmüş hedef; atamayı her ağaçta zorlayan kurgu |
| Üst dilimde beklenen kâr çıkmadı | Uç tahminler abartılı | Sınama dilimindeki gözlenen etkiyle karar |
| Yalnız ulaşılan müşteriler analiz edildi | Ulaşılabilirlik seçilmiş bir özellik | Niyete göre analiz: atanan herkes |
| Modelde aramadan sonra oluşan alan var | Sonuçtan bilgi sızıyor | Özellikleri atama anından önceki veriyle sınırlayın |
| Segment etkileri her kampanyada yön değiştiriyor | Segment başına örnek az | Daha az segment; daha büyük deney; ortalama etkiyle yetinin |
| Kampanya kanalı değişti, eski model kullanıldı | Etki müdahaleye özgüdür | Her müdahale için ayrı deney ve model |

## Denetim listesi

- [ ] Karar sorusu "kim ayrılacak" değil "kime dokunmak sonucu değiştirir" diye yazıldı.
- [ ] Veri rastgele atamalı bir kampanyadan geliyor; atama oranı ve yöntemi kayıtlı.
- [ ] Sonuç penceresi önceden sabitlendi; analiz niyete göre (atanan herkes) yapıldı.
- [ ] Bütün özellikler atama anından önceki veriden.
- [ ] Değerlendirme ayrı, deneyli sınama kümesinde dilimle yapıldı; dilim sırası tutuyor.
- [ ] Eşik ve kâr, gözlenen dilim etkisi × değer − maliyet ile hesaplandı; negatif dilim dışarıda.
- [ ] Canlı kullanımda her kampanyada rastgele bir kontrol grubu korunuyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Ayrılma modeli değil etki modeli kuruyoruz. Veri rastgele denemeli: `arandi` atama sütunu.
  İki model yaklaşımı kur (arananlar ve aranmayanlar ayrı), etkiyi fark olarak hesapla. Değerlendirmeyi ayrı sınama
  kümesinde tahmine göre beş dilimde 'kontrol ayrılma oranı − aranan ayrılma oranı' tablosuyla ver. ROC-AUC verme."
- **Modelin tipik hatası:** ayrılma olasılığını etki sanır ve en riskliyi önerir; geçmiş kampanya verisinde arananla
  aranmayanı doğrudan karşılaştırır; `arandi` sütununu sıradan bir özellik gibi tek modele koyup etkiyi hiç
  hesaplamaz; aramadan sonraki alanları özellik yapar; etkiyi eğitim verisinde ölçer.
- **Çıktıda denetleyin:** atamanın rastgele olduğuna dair kanıt (atama kodu, oranlar); dilim tablosunda iki oranın
  ayrı ayrı yazılması; negatif dilim varsa önerinin onu dışarıda bırakması; maliyet ve değer varsayımlarının tabloda olması.
- **Sorun:** "Bu müşteriyi aramasaydık ne olurdu? Bunu hangi veriden biliyoruz?"

## İlgili

- [Korelasyon ve nedensellik](../70-veri/korelasyon-ve-nedensellik.md) — karıştırıcı, seçim yanlılığı
- [A/B testi](../70-veri/ab-testi.md) — örneklem, atama birimi, erken bakma
- [Deney yapılamayanda nedensellik](../70-veri/deney-yapilamayanda-nedensellik.md) — yarı deneysel yollar ve sınırları
- [Problem çerçeveleme](problem-cerceveleme.md) — hedef ve maliyet · [Kalibrasyon ve olasılık](kalibrasyon-ve-olasilik.md)
  — beklenen değerle karar · [Değerlendirme ölçütleri](degerlendirme-olcutleri.md)
- Ürün tarafı: [Tutma ve iptal akışı](../95-urun/tutma-ve-iptal-akisi.md) ·
  [Bildirim ve yeniden etkileşim](../95-urun/bildirim-ve-yeniden-etkilesim.md) (bildirimin etkisini ölçmek)
- Havuzdaki kayıp verisi ve modeli: [`ml-temel/ornekler/03_musteri_kaybi.py`](../../ml-temel/ornekler/03_musteri_kaybi.py)
  (yalnız risk modelidir; etki için deney verisi gerekir)
