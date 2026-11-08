# ADR-004: Toplu etiketleme Sonnet 5.5, denetim Opus 5.5

**Durum:** Kabul · 2026-11-08 · bas-mimar + gorsel-analist

## Bağlam

Bir sezonda binlerce defile karesi ve on binlerce perakende ürünü etiketlenir. Her görseli en güçlü modelle işlemek
pahalı; en ucuz modelle işlemek taksonomi tutarlılığını bozar.

## Karar

- Toplu nitelik çıkarımı `claude-sonnet-5-5` ile, yapılandırılmış çıktı (`NitelikKaydi` şeması) zorunlu.
- Rastgele %5 örneklem `claude-opus-5-5` ile ikinci kez etiketlenir; eksen başına uyum (Cohen κ) ≥ 0,80 hedef.
- Uyum düşen eksen için önce taksonomi daraltılır, sonra istem düzeltilir, en son model yükseltilir.
- Uyum değerleri sezon raporunda yayımlanır.

## Sonuçlar

Maliyet denetim altında, kalite ölçülebilir; taksonomi zamanla sadeleşir.
