# ADR-001: Renk kodlama Pantone TCX, eşleme ΔE2000 ile

**Durum:** Kabul · 2026-11-08 · bas-mimar + renk-bilimci

## Bağlam

Kullanıcı renkleri Pantone koduyla ister. Pantone'un resmi açık veri indirmesi yok; Fashion, Home + Interiors (FHI)
TCX serisinin 2.310 renginin hex değerleri açık depolarda var, renk **adları** Pantone telifi altında. Coloro (WGSN
ortağı) 3.500 renklik ayrı bir sistem, lisanslı.

## Karar

- Birincil kod: Pantone FHI **TCX**. Her küme merkezi (Lab) açık hex veri kümesine **ΔE2000** ile eşlenir.
- Raporda sıra: `kod · hex · Lab · ΔE` önde, ad parantez içinde ve "Pantone adı" ibaresiyle.
- ΔE ≤ 3 "eşleşme", 3–5 "yakın", > 5 "yaklaşık"; ikinci en yakın aday her zaman verilir.
- Hex→Lab dönüşümü sRGB/D65 varsayımıyla; Pantone'un basılı renginden sapma olabileceği raporda not edilir.
- Coloro eşlemesi birikim listesinde; lisans sorulmadan eklenmez.

## Sonuçlar

Renk hattı Pantone bağımlılığından kurtulur (kod değiştirilebilir), telif riski adların ikincil kullanımıyla azalır,
doğruluk ΔE ile şeffaf raporlanır.
