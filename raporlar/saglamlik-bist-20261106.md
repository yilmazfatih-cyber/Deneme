# Sağlamlık testleri — BIST — 2026-11-08 16:47

Ölçüm penceresi (ileriye yürüyen): ileri:2025-11-11→2026-11-06; seçim penceresi ilk 12 ay. Nakit 1,000,000, tek yön maliyet 0.15%.

Karar anı (ileri pencerede, hisse×gün): 9,671 → parametre bütçesi 96.

## 1. Kıyas modelleri (maliyet sonrası, ileriye yürüyen)

| Model | Bitiş | Getiri | Sharpe | Maks düşüş | Maliyet 2× bitiş | Boğa | Ayı | Yatay |
|---|---|---|---|---|---|---|---|---|
| al-tut | 1,051,167 | +5.1% | 0.41 | -26.5% | 1,047,931 (+4.8%) | +26.2% | -14.8% | -0.3% |
| haftalık momentum (20g, ilk 10) | 975,129 | -2.5% | 0.11 | -33.1% | 883,125 (-11.7%) | +18.4% | -15.7% | -0.5% |
| trend 50g | 1,087,844 | +8.8% | 0.51 | -30.5% | 970,853 (-2.9%) | +23.1% | -12.4% | +2.5% |
| haber olumluysa al (39 metin olay, 20g tut; yön LLM'ce sonradan etiketli) | 1,095,236 | +9.5% | 0.52 | -35.3% | 1,075,654 (+7.6%) | -15.5% | +54.8% | -14.7% |

Rejim günleri (ileri pencere): {'boga': 117, 'yatay': 78, 'ayi': 53}

## 2. Modeller: deneme günlüğü ve Deflated Sharpe

| Model | Eşik | Seçim ödülü (ilk yıl) | İleri bitiş | Sharpe | Maks düşüş | Maliyet 2× | Boğa | Ayı | Yatay |
|---|---|---|---|---|---|---|---|---|---|
| ridge **(seçilen)** | 0.00% | +0.375 | 726,844 (-27.3%) | -0.87 | -39.2% | 608,823 | -13.0% | +3.4% | -18.6% |
| ridge | 0.25% | +0.073 | 970,571 (-2.9%) | -0.04 | -16.0% | 950,356 | -12.8% | +8.8% | +2.3% |
| ridge | 0.50% | +0.000 | 1,000,000 (+0.0%) | - | 0.0% | 1,000,000 | +0.0% | +0.0% | +0.0% |
| ridge | 0.75% | +0.000 | 1,000,000 (+0.0%) | - | 0.0% | 1,000,000 | +0.0% | +0.0% | +0.0% |
| ridge | 1.00% | +0.000 | 1,000,000 (+0.0%) | - | 0.0% | 1,000,000 | +0.0% | +0.0% | +0.0% |
| mlp | 0.00% | -0.651 | 656,034 (-34.4%) | -1.22 | -48.3% | 347,980 | +22.7% | -23.6% | -29.8% |
| mlp | 0.25% | -0.066 | 623,012 (-37.7%) | -1.01 | -48.3% | 346,833 | +2.9% | -16.7% | -28.0% |
| mlp | 0.50% | -0.000 | 1,223,646 (+22.4%) | 0.64 | -29.5% | 814,665 | +34.4% | +4.7% | -14.6% |
| mlp | 0.75% | +0.219 | 897,222 (-10.3%) | -0.26 | -37.2% | 717,195 | -0.9% | +6.4% | -16.5% |
| mlp | 1.00% | +0.127 | 970,048 (-3.0%) | 0.03 | -27.6% | 857,470 | -6.2% | +11.9% | -7.5% |

Deneme günlüğünde bu pencere için toplam **41 deneme** (bu koşu dahil). Seçilen modelin Sharpe'ı -0.87; 7 denemeden beklenen en büyük şans Sharpe'ı 0.86; **Deflated Sharpe olasılığı 0.04** (0,95 üstü anlamlı; 0,5 civarı şans).

## 3. Etiket karıştırma (sızıntı testi)

Seçilen model (ridge, eşik 0.00%) gerçek etiketle ileri getiri -27.3%.
Eğitim hedefleri karıştırılıp yeniden eğitildiğinde (3 tekrar):
- dışarı korelasyon +0.010, ileri getiri +2.5%
- dışarı korelasyon +0.014, ileri getiri -4.3%
- dışarı korelasyon +0.034, ileri getiri +0.0%
Karışık ortalama -0.6%. Gerçek sonuç karışık dağılımın içindeyse model sinyal değil gürültü/sızıntı taşıyor; karışık sonuçlar da pozitifse kazanç modelden değil piyasa sürüklenmesinden geliyor.

## 4. Parametre bütçesi (her 100 karar anına 1 parametre)

```
ridge: 15 öğrenilmiş + 26 veri türevi parametre; karar anı 9,671; bütçe (1/100) = 96 → BÜTÇE İÇİNDE
  - ağırlık[g1] (standart birim başına beklenen getiri): +0.00030
  - ağırlık[g2] (standart birim başına beklenen getiri): +0.00025
  - ağırlık[g3] (standart birim başına beklenen getiri): +0.00002
  - ağırlık[g4] (standart birim başına beklenen getiri): +0.00110
  - ağırlık[g5] (standart birim başına beklenen getiri): -0.00048
  - ağırlık[mom20] (standart birim başına beklenen getiri): +0.00012
  - ağırlık[mom60] (standart birim başına beklenen getiri): -0.00022
  - ağırlık[oyn20] (standart birim başına beklenen getiri): -0.00045
  - ağırlık[gunduz_bugun] (standart birim başına beklenen getiri): +0.00037
  - ağırlık[gece_dun] (standart birim başına beklenen getiri): -0.00001
  - ağırlık[piyasa1] (standart birim başına beklenen getiri): -0.00021
  - ağırlık[piyasa5] (standart birim başına beklenen getiri): -0.00006
  - ağırlık[piyasa20] (standart birim başına beklenen getiri): -0.00021
  - sabit (ortalama hedef): -0.00010
  - ridge katsayısı (seçildi): +1.00000
  Not: Doğrusal: her özelliğin işareti ve büyüklüğü doğrudan okunur ve sorgulanır.
```

```
mlp: 241 öğrenilmiş + 28 veri türevi parametre; karar anı 9,671; bütçe (1/100) = 96 → BÜTÇEYİ AŞIYOR
  - toplam etki[g1] (W1·W2): +0.13333
  - toplam etki[g2] (W1·W2): +0.03512
  - toplam etki[g3] (W1·W2): -0.01346
  - toplam etki[g4] (W1·W2): +0.10977
  - toplam etki[g5] (W1·W2): -0.10431
  - toplam etki[mom20] (W1·W2): +0.04828
  - toplam etki[mom60] (W1·W2): +0.03794
  - toplam etki[oyn20] (W1·W2): -0.08867
  - toplam etki[gunduz_bugun] (W1·W2): -0.01141
  - toplam etki[gece_dun] (W1·W2): -0.05805
  - toplam etki[piyasa1] (W1·W2): -0.01692
  - toplam etki[piyasa5] (W1·W2): +0.03106
  - toplam etki[piyasa20] (W1·W2): -0.06799
  - gizli ağırlık #0: …
  - gizli ağırlık #1: …
  - gizli ağırlık #2: …
  - gizli ağırlık #3: …
  - gizli ağırlık #4: …
  - gizli ağırlık #5: …
  - gizli ağırlık #6: …
  - gizli ağırlık #7: …
  - gizli ağırlık #8: …
  - gizli ağırlık #9: …
  - gizli ağırlık #10: …
  - gizli ağırlık #11: …
  - gizli ağırlık #12: …
  - gizli ağırlık #13: …
  - gizli ağırlık #14: …
  - gizli ağırlık #15: …
  - gizli ağırlık #16: …
  - gizli ağırlık #17: …
  - gizli ağırlık #18: …
  - gizli ağırlık #19: …
  - gizli ağırlık #20: …
  - gizli ağırlık #21: …
  - gizli ağırlık #22: …
  - gizli ağırlık #23: …
  - gizli ağırlık #24: …
  - gizli ağırlık #25: …
  - gizli ağırlık #26: …
  … ve 201 parametre daha
  Not: Toplam 241 ağırlık; gizli katman tek tek okunmaz, yalnız toplam etki özetlenir.
```

```
trend_50: 1 öğrenilmiş + 0 veri türevi parametre; karar anı 9,671; bütçe (1/100) = 96 → BÜTÇE İÇİNDE
  - pencere: 50
  Not: Kural tabanlı: parametreler elle seçilmiş eşikler; veriden öğrenilmedi ama seçimde veri kullanıldıysa sayılır.
```

```
haftalik_momentum: 2 öğrenilmiş + 0 veri türevi parametre; karar anı 9,671; bütçe (1/100) = 96 → BÜTÇE İÇİNDE
  - pencere: 20
  - n: 10
  Not: Kural tabanlı: parametreler elle seçilmiş eşikler; veriden öğrenilmedi ama seçimde veri kullanıldıysa sayılır.
```

Bütçeye uyan modeller: ridge, trend_50, haftalik_momentum. Bütçeyi aşanlar son testte kullanılmaz.

## 5. Karar

LLM ajanı ve sayısal model, kıyasları (al-tut, momentum, haber kuralı) maliyet sonrası ve rejimler arasında TUTARLI biçimde geçmiyorsa işe yaramıyor sayılır. Bu rapordaki sayılarla:

- En iyi kıyas: haber → 1,095,236. Seçilen model → 726,844. **Model kıyası geçemiyor.**
- Parametre dökümü yukarıda; son test (veri unutturulup yalnız parametrelerle) için `veri/saatlik/model_*.json` dosyaları ve bu rapor yeter.

Yatırım tavsiyesi değildir.
