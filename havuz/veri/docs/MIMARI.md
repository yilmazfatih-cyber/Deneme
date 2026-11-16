# Mimari

## Parçalar

```
                 tr/*.json (+ .meta.json)                    katalog/kumeler.yaml
                        │                                            │
          reference.py ─┼─ geo.py, calendar_tr.py          katalog/catalog.py ── search
                        │                                            │
        ┌───────────────┴───────────────┐                  katalog/verify.py ── HF API
        ▼                               ▼                  katalog/download.py ─ HF dosyaları
  sentetik/ (üreteçler)           kalite/ (denetim)                  │
  base → people, companies,       validators ← ids.py, geo.py        │
  products → commerce →           schema → validate                  │
  invoices; banking,              profile, checks, drift, split,     │
  timeseries, churn, support,     dedupe, pii, clean → report        │
  weblog; dirty; registry         dictionary                         │
        │                               ▲                            │
        ▼                               │                            ▼
  ornekler/ (examples.py)  ──────► dogrula/profil/...        hat/fetch.py (nazik getirici)
                                                               ├─ http_cache.py
                                                               ├─ pipeline.py (çek→doğrula→dönüştür→yükle)
                                                               ├─ storage.py (JSONL, CSV, SQLite, DuckDB)
                                                               └─ examples/tcmb.py, registry.py
                         cli/main.py → commands_data.py / commands_net.py
```

## Veri akışı

1. **Başvuru verisi** `tr/<ad>.json` asıl kaynaktır; `reference.load()` okur, `geo`/`calendar_tr`
   yardımcıları onun üstündedir. CSV kopyası `scripts/build_reference.py` ile üretilir.
2. **Sentetik üretim**: `registry.GENERATORS[ad].calistir(adet, tohum, ayar)` → `{tablo: satırlar}`.
   Satırlar Python türlerini (`Decimal`, `date`) taşır; `files.write_table` CSV/JSONL/JSON/Parquet'e
   yazar. Her tablonun `TableContract`ı `.sema.json` olur.
3. **Kirli kip**: `dirty.make_dirty(satırlar)` → (temiz metin, kirli metin, bozulma kaydı).
   `kalite.clean.clean_rows` geri alınabilir bozulmaları geri alır.
4. **Kalite**: dosya → `files.read_table` → `validate_rows` (şema) / `run_checks` (denetimler) /
   `profile_table` / `drift_report` / `mask_rows` → `report.*_markdown` + JSON.
5. **Hat**: `run_pipeline(spec, depo, getirici)` → `spec.cek` ham kayıt üretir (getirici robots, hız
   sınırı, önbellek, yeniden deneme uygular) → `spec.dogrula` → geçersizler karantinaya → `spec.donustur`
   → `depo.upsert` (anahtarlı, idempotent) → durum dosyası ve koşu günlüğü.
6. **Katalog**: YAML → `DatasetEntry` → `verify_entry` (HF API) → `dogrulama-<tarih>.json`; `indir`
   ağaç API'sinden dosya listesini alır, SHA-256 denetler.

## Bağımlılık yönü

`text`, `ids`, `files`, `paths` hiçbir şeye bağlı değildir. `reference` → `files`; `geo`, `calendar_tr`
→ `reference`. `kalite` → `ids`, `geo`, `calendar_tr`, `files`. `sentetik` → `kalite.schema`
(sözleşmeler için), `reference`, `geo`, `calendar_tr`. `hat` → `files`. `katalog` → `hat.fetch`.
`cli` hepsini kullanır. Döngüyü önlemek için iki yerde işlev içi içe aktarma vardır
(`clean._kind_for`, `examples.build_example`).
