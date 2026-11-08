# Persona Katmanı veritabanı

Tek şema, iki motor: **PostgreSQL** üretim hedefi (`01-sistem.md` §12), **SQLite** yerel geliştirme ve demo. `schema.sql` ikisinde de
aynen çalışır (SQLite'ta `PRAGMA` satırı etkili, PostgreSQL'de yok sayılır; `AUTOINCREMENT` yerine `GENERATED ALWAYS AS IDENTITY`
istenirse `sed` ile dönüştürülür).

## Kurulum

```bash
python3 -I persona-katmani/db/pk_db.py kur          # persona-katmani/db/persona.sqlite (PK_DB ile yol değişir)
python3 -I persona-katmani/db/pk_db.py yukle-temel  # 19 parametre, 7 segment, S0/S1 öncülleri, 225 literatür bulgusu
python3 -I persona-katmani/db/pk_db.py ornek        # demo kiracı: 3 mağaza, 2.500 takma adlı müşteri, 12.000 fiş, kamera sayımları, 1.500 web oturumu
python3 -I persona-katmani/db/pk_db.py kaynak-b demo              # fişlerden Kaynak B bütçe kestirimi + S1 fark raporu
python3 -I persona-katmani/db/pk_db.py ozet
```

Gerçek veri: `yukle-pos KIRACI MAGAZA fis.csv` (sütunlar `musteri_id,magaza_id,tarih,tutar,urun_sayisi,kampanya`),
`yukle-kamera MAGAZA sayim.csv` (`bolge_id,bolge_ad,dilim_baslangic,kisi_sayisi,ort_bekleme_sn`), `yukle-kosu kosu.json`
(persona-sim'in "Koşuyu dışa aktar" çıktısı). `.sqlite` dosyası depoya girmez; yukarıdaki komutlarla yeniden üretilir.

## Tablolar (24)

| Grup | Tablolar | Not |
| --- | --- | --- |
| Kiracı ve varlıklar | `kiraci`, `magaza` (şehir, konum türü → S2/S3), `site`, `musteri` (takma ad, rıza, silme talebi), `segment`, `parametre`, `kampanya` | `musteri`de ad/e-posta/telefon yok |
| Gerçek davranış (Kaynak B girdisi) | `pos_islem`, `pos_satir`, `magaza_gunluk`, `kamera_bolge`, `kamera_sayim`, `web_olay` | kamera yalnız toplu sayım (ADR-004) |
| Model | `literatur_bulgu` (Excel kopyası), `oncul` (Kaynak A, seviye × kapsam × parametre), `kaynak_b_kestirim`, `fark_raporu` | ADR-003: B A'dan öncül almaz |
| Kampanya ve simülasyon | `simulasyon_kosusu` (sürüm demeti), `sim_olay`, `sim_kpi`, `hedefleme_raporu` (segment düzeyi), `kor_tahmin` (03 §8.4) | hedefleme raporunda kişi yok (ADR-002) |
| Yönetişim | `denetim_kaydi` | her yükleme, koşu, rapor, dışa aktarım |

## Veri akışı

```
şirket POS/ERP ──► pos_islem / magaza_gunluk ──┐
kamera (toplu) ──► kamera_sayim ───────────────┼──► kaynak_b_kestirim ──► fark_raporu (A vs B)
web/uygulama ────► web_olay ───────────────────┘            ▲
Excel literatür ─► literatur_bulgu ──► oncul (S0, S1) ──────┘  (Kaynak A)
persona-sim ─────► simulasyon_kosusu + sim_olay + sim_kpi + hedefleme_raporu ──► kor_tahmin → gerçek sonuç → Brier
```
