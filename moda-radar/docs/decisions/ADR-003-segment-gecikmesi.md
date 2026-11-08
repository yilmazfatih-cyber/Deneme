# ADR-003: Segment gecikmesi önselden başlar, veriyle güncellenir

**Durum:** Kabul · 2026-11-08 · bas-mimar + trend-modelci + yatirim-analisti

## Bağlam

Podyum→raf gecikmesi segmentten segmente değişir ve Türkiye için ölçülmüş bir değer yok. Sabit varsayım yanıltır,
sıfırdan öğrenmek için de veri az.

## Karar

- `content/segmentler.json` her segment için gecikme **önseli** (sezon cinsinden, aralık) taşır.
- `moda_radar/tahmin/gecikme.py` geçmiş podyum ve raf serilerinden çapraz korelasyonla gecikmeyi tahmin eder;
  önsel ile ağırlıklı birleştirir (az veride önsel ağır, çok veride veri ağır).
- Sonuç segment × kategori düzeyinde `veri/gecikme/*.parquet`'e yazılır ve raporda "ölçülen / önsel" olarak ayrı gösterilir.
- Pazar segmenti için podyum yerine toptancı Instagram serisi birincil öncü kabul edilir.

## Sonuçlar

İlk sezon tahminleri önselle çalışır; her yeni sezonla gecikme değerleri ölçüme yaklaşır ve karnede izlenir.
