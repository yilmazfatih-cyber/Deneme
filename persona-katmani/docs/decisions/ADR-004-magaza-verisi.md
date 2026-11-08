# ADR-004 · Fiziksel mağaza verisi doğrudan şirketten: müşteri sepet tutarları ve mağaza başı tutarlar (F-18)

Tarih: 2026-11-08 · Durum: Kabul edildi (proje sahibi)

## Karar

Fiziksel mağaza için veri kaynağı **kiracı şirketin kendi işlem verisidir**: müşteri bazında sepet (fiş) tutarları ve mağaza bazında
toplam tutarlar. Kapı sayacı, sadakat kartı entegrasyonu, kamera veya cihaz izleme ilk sürümde **kaynak değildir**; mağaza verisi
şirketin ERP/POS dışa aktarımıyla gelir.

- **Kaynak A, S3 (konum):** mağaza başı tutarlar ve fiş sayıları → konum etkisi Γ³, toplu fiyat/kampanya tepkisi, sepet tutarı dağılımı.
- **Kaynak B:** müşteri kimliğine bağlı fiş tutarları (şirket zaten müşteri bazında tutuyorsa) → müşteri kümeleri; müşteri kimliği yoksa
  yalnız A'nın S3'ü beslenir.
- Fiş satırı ayrıntısı (ürün, indirim, taksit) varsa daha çok parametre tanımlanır; yalnız tutar varsa yalnız tutar dağılımı, ziyaret
  sıklığı ve kampanya dönemine tepki kestirilir. Hangi parametrenin hangi veriyle tanımlandığı `07` §4.4'te.

## Sonuçları

- `07` §4.1 son satırı ve §12 son maddesi buna göre düzeltildi; §4.4 "Mağaza işlem verisi" eklendi.
- `04` ortam katmanı mağaza için bir sandbox üretmez; mağaza verisi doğrudan `03`/`07` kestirim girdisidir (olay günlüğüne `pos_transaction`
  olarak alınır).
- `06`: POS dışa aktarımı veri sınıfı "müşterinin gerçek işlem verisi"; müşteri kimliği takma adlanır; amaç sınırı Kaynak B kestirimi.
- F-18 kapandı. Kamera/cihaz izleme gündemde değil.
