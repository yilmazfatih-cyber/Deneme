# ADR-006 · Reklam hedefleme birimi: sosyolojik segment + Kaynak B davranış kümeleri

Tarih: 2026-11-08 · Durum: Kabul edildi (proje sahibi: "müşteri kümeleri olsun reklam için")

## Karar

Reklam hedefleme raporu iki birimden biriyle üretilir:

1. **Segment** (varsayılan, Kaynak A): 7 sosyolojik grup (yaş × gelir).
2. **Davranış kümesi** (Kaynak B): şirketin gerçek fiş verisinden, yalnız davranış özellikleriyle (ziyaret sıklığı, sepet medyanı,
   kampanya günlerine duyarlılık) türetilen kümeler. Demografi kümelemeye girmez.

Kurallar (ADR-002 ve 07 §3.4 ile uyumlu):
- Küme en az **50 müşteri**; daha küçük kümeler en yakınına birleştirilir; kimlikli müşteri sayısı 100'ün altındaysa küme üretilmez.
- Küme adı **kod + nötr betimleme** ("K2 · sık gelen, küçük sepet, kampanya günlerini tercih eden"); zaaf çağrıştıran sıfat yok (F-17 bu şekilde uygulandı).
- Rapor ve dışa aktarım küme düzeyindedir; küme üyeliği kişi kimliğiyle pazarlama sistemine geri yazılmaz.
- Simülasyonda kümeler nüfusa payları oranında atanır ve θ çarpanları (bütçe, fiyat duyarlılığı, sabır) uygulanır; bu A+B birleşimidir (ADR-003).

## Sonuçları

- `persona-sim/src/kalibrasyon/kumeler.ts` (özellik çıkarma, tohumlu k-means, asgari N birleştirme, adlandırma, nüfusa atama).
- `Kampanya.hedefBirimi` ve `hedefKumeler`; `hedeflemeRaporu` birimle gruplar; `HedeflemeSatiri.birim`.
- Veritabanı: `kaynak_b_kume` tablosu; `hedefleme_raporu.birim` ve `kume_id`; `pk_db.py kaynak-b-kume`.
- 05 rapor şablonuna "hedef birimi" satırı; 06 kötüye kullanım bölümüne küme adlandırma yasak listesi.
