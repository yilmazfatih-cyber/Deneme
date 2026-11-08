# ADR-005 · Veritabanı: tek şema, PostgreSQL hedef, SQLite ile hemen çalışır

Tarih: 2026-11-08 · Durum: Kabul edildi (proje sahibi: "en önemlisi veritabanını kur")

## Karar

- Şema `persona-katmani/db/schema.sql`; 24 tablo; PostgreSQL ve SQLite'ta aynı DDL. Olay hacmi büyüyünce `sim_olay` ve `web_olay`
  ClickHouse'a akar (01 §12), ilişkisel çekirdek PostgreSQL'de kalır.
- Kişisel veri en azda: `musteri` yalnız kiracının takma adı (hash), rıza ve silme alanları; kamera yalnız toplu bölge sayımı;
  hedefleme raporu yalnız segment düzeyi (ADR-002); Kaynak B kestirimi A'dan bağımsız tabloda (ADR-003); POS verisi şirketten (ADR-004).
- Her yükleme, koşu, rapor ve dışa aktarım `denetim_kaydi`na yazılır. Her simülasyon koşusu `surum_demeti` (kod, öncül, seed) taşır.
- Araç: `pk_db.py` (stdlib, bağımlılık yok). Demo kiracı sentetik veriyle üretilir; `.sqlite` depoya girmez.

## Sonuçları

- persona-sim "Koşuyu dışa aktar" JSON biçimi `yukle-kosu` ile uyumlu olmalı: `{kosu, olaylar, kpi, hedefleme}`.
- 06 veri sınıfları tabloya eşlenir: gerçek işlem verisi (R) = pos_*, web_olay, kamera_sayim; türetilmiş (T) = kaynak_b_kestirim, oncul S2–S3;
  sentetik (S) = sim_*; müşteri yaratıcı varlıkları henüz tabloda yok (kampanya görselleri sonraki tur).
- `kor_tahmin` tablosu 03 §8.4 kalibrasyon döngüsünün veri tarafıdır; `brier` gerçek sonuç gelince hesaplanır.
