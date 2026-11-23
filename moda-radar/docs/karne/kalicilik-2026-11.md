# Karne: podyum yönünün kalıcılığı (gerçek veri, 2026-11-23)

Soru: bir sezon podyumda yükselen renk, bir sonraki aynı mevsim sezonunda da yükseliyor mu? Model v0 bunu varsayıyordu
(yükseliş → olasılık artar). Bu, tahmin modelinin gerçek fotoğraf verisiyle ilk geriye testidir.

Veri: Vogue Runway, SS25 · FW25 · SS26 · FW26 · SS27 (159 defile, 9.338 look, 37.351 parça rengi), parça yüzeyi
ağırlıklı pay. Yöntem: SS25→SS26 ve SS26→SS27 pay değişimlerinin karşılaştırılması.

| Düzey                         | n   | Korelasyon (Δ₁, Δ₂) | Aynı yön / zıt yön | İlk dönem en çok yükselen 10'dan sürenler | En çok düşen 10'dan sürenler |
| ----------------------------- | --- | ------------------- | ------------------ | ----------------------------------------- | ---------------------------- |
| Pantone TCX kodu (pay ≥ %0,4) | 57  | −0,59               | 20 / 37            | 1 / 10                                    | 1 / 10                       |
| Renk ailesi                   | 12  | +0,20               | 7 / 5              | 5 / 10                                    | 6 / 10                       |

FW25→FW26 ile SS26→SS27 değişimleri arasında kod düzeyinde ilişki yok (r = +0,01); aile düzeyinde ters (r = −0,57):
ardışık sezon karşılaştırması mevsim etkisi taşır.

Aile payları:

| Aile       | SS25  | SS26  | SS27  |
| ---------- | ----- | ----- | ----- |
| siyah      | %20,0 | %19,1 | %21,4 |
| kahverengi | %12,2 | %17,0 | %20,7 |
| nötr açık  | %21,4 | %17,4 | %17,1 |
| nötr koyu  | %20,6 | %17,1 | %16,7 |
| kırmızı    | %6,2  | %9,9  | %6,4  |
| mavi       | %9,6  | %7,6  | %5,0  |

## Sonuç ve model değişikliği (v0 → v0.1)

1. Tek kod düzeyinde podyum yönü sürmez, ortalamaya döner. Renk yönü artık **renk ailesinin** toplam payından
   hesaplanır (`moda_radar/tahmin/model.py`, `_renk_ailesi_serisi`).
2. Yön **aynı mevsimle** karşılaştırılır (SS27 ↔ SS26), ardışık sezonla değil (`KARSILASTIRMA_ADIMI = 2`).
3. Gecikme eşleşmesinde podyum tarafında da sol sansür: verinin ilk sezonunda görünen değer yeni giriş sayılmaz.

Sınırlar: iki geçiş (SS25→SS26→SS27), 12 aile; korelasyonlar küçük örneklemde oynak. Perakende raf verisi
olmadığından gerçekleşmeye dayalı Brier karnesi henüz yazılamaz; raf verisi biriktikçe `geriye-test` gerçek veriyle
çalıştırılacak. Sentetik karne (`v0-sentetik.md`) yalnız mekaniği sınar.
