# Moda Radar — ekip ve işe alım

## Roller

| Rol              | Model                      | Ajan dosyası                         | İş                                                                  |
| ---------------- | -------------------------- | ------------------------------------ | ------------------------------------------------------------------- |
| Baş mimar        | Fable 5.1 (yoksa Opus 5.5) | `.claude/agents/bas-mimar.md`        | Brief, kapsam, kapılar, çelişki çözümü, demo notu                   |
| Veri mühendisi   | Opus 5.5                   | `.claude/agents/veri-muhendisi.md`   | Şema, tarama, Parquet/DuckDB, zaman kilidi, CLI, CI                 |
| Görsel analist   | Opus 5.5                   | `.claude/agents/gorsel-analist.md`   | Taksonomi, görsel→etiket istemi, çift etiketleme kalite ölçümü      |
| Renk bilimci     | Opus 5.5                   | `.claude/agents/renk-bilimci.md`     | Maske, Lab, kümeleme, Pantone TCX eşleme, sezon paleti              |
| Trend modelci    | Opus 5.5                   | `.claude/agents/trend-modelci.md`    | Yayılma modeli, geriye test, kalibrasyon, karne                     |
| Yatırım analisti | Opus 5.5                   | `.claude/agents/yatirim-analisti.md` | Segment tanımları, maliyet bantları, karar kuralı, yatırım kartları |
| Moda editörü     | Opus 5.5                   | `.claude/agents/moda-editoru.md`     | Alan mantığı incelemesi, sezon raporu anlatısı; kod yazmaz          |

Toplu etiketleme çalışma zamanında Sonnet 5.5, örneklem denetimi Opus 5.5 ile yapılır (ADR-004). Bu, ajan modelinden ayrıdır.

Bütçe: bir sezon döngüsünde en fazla **12 alt görev**, en fazla **3 düzeltme turu**.

## WGSN'de ne tür teknik profiller var (açık kaynak araştırması, 2026-11-08)

LinkedIn ve wgsn.com bu oturumdan doğrudan açılamadı; bulgular arama sonuçlarından ve üçüncü taraf iş ilanı
kopyalarından geliyor. Doğrudan LinkedIn'de doğrulanmalı.

| Profil                                              | Kanıt                                                                                    | Yığın                                                                       |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Senior Analytics Engineer (Data ekibi)              | İş ilanı kopyası (simplify.jobs)                                                         | SQL, Python, dbt, GitHub, CI/CD; ML iş akışları, embedding, graf veritabanı |
| Senior Data Engineer                                | wgsn.com kişi sayfası (Ahmed Radwan): "AI, bilgisayarla görü ve arama" veri mühendisliği | Veri altyapısı + CV + arama                                                 |
| Data Analyst (Londra)                               | LinkedIn ilan özeti                                                                      | Analiz, raporlama                                                           |
| AI/ML, veri altyapısı, platform, DevOps iş akışları | Dış tedarikçi vaka çalışması (Vanguard X; öz tanıtım, zayıf kanıt)                       | Spark, Kafka, Snowflake, Databricks, Airflow                                |
| Ürün: TrendCurve AI, Instock, Coloro ortaklığı      | wgsn.com ürün sayfaları, basın bültenleri                                                | Derin öğrenme + analist döngüde; 40M+ ürün takibi; 3.500 renk               |

Okuma: WGSN'nin teknik kadrosu klasik "veri platformu" kadrosudur (analytics/data engineer ağırlıklı), üstünde küçük bir
CV/ML katmanı ve büyük bir analist/editör katmanı vardır. Modeli özel kılan şey veri derinliği ve insan küratörlüğüdür.

## Eşleme: WGSN profili → Moda Radar ajanı

| WGSN                      | Moda Radar                    | Not                                                           |
| ------------------------- | ----------------------------- | ------------------------------------------------------------- |
| Analytics / Data Engineer | veri-muhendisi                | dbt+Snowflake yerine Parquet+DuckDB; aynı disiplin            |
| CV / ML Engineer          | gorsel-analist + renk-bilimci | Eğitilmiş model yerine görsel dil modeli + klasik renk bilimi |
| Data Scientist (forecast) | trend-modelci                 | Açık karne ve taban karşılaştırması zorunlu                   |
| Retail analyst (Instock)  | yatirim-analisti              | Segment ve maliyet katmanı Türkiye'ye özgü                    |
| Trend analyst / editor    | moda-editoru                  | Kod yazmaz, inceler ve anlatır                                |

## İnsan tarafında önerilen üç kişi

1. **Satın almacı danışman** (orta segment, 5+ yıl): P2'de kartları gerçek sipariş takvimiyle karşılaştırır. Haftada 2 saat.
2. **Hukuk görüşü** (bir kez): tarama, görsel saklamama ve Pantone ad kullanımı için yazılı görüş.
3. **Saha fotoğrafçısı** (P3): 5 referans pazarda iki haftada bir tezgah fotoğrafı; yüzsüz çekim yönergesiyle.

Kaynaklar: wgsn.com ürün sayfaları (TrendCurve AI, %94 iddiası), Coloro ortaklığı basın özeti, simplify.jobs ilan kopyası,
wgsn.com kişi sayfası, Vanguard X vaka çalışması, PR Newswire Instock bülteni. Bağlantılar `docs/kaynaklar.md`.
