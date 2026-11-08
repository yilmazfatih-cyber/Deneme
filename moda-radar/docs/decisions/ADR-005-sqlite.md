# ADR-005: Parquet + DuckDB yerine SQLite tek dosya

**Durum:** Kabul · 2026-11-08 · veri-muhendisi (+ bas-mimar onayı bekliyor)

## Bağlam

PLAN §10 ve CLAUDE.md mimari özeti veriyi "Parquet + DuckDB (`veri/`)" olarak tanımlıyordu. Pilot dönemde veri küçük
(sezon başına ~40 defile × ~40 look URL'si, haftalık birkaç bin perakende ürünü); yazımlar artımlı (her hafta
upsert), okuyucular birden çok modül (tahmin, renk, yatırım) ve geriye test zaman kilidi ister. Veri GitHub Actions'ta
üretilir ve sunucu yoktur; bir yerde kalıcı olarak saklanması gerekir.

## Karar

- Bütün veri tek SQLite dosyasında: `veri/moda.db` (`moda_radar/veri/depo.py`, stdlib `sqlite3`).
- Dosya kod dallarında değil, yalnız `moda-verileri` dalında yaşar (`veri/` kod dallarında `.gitignore`'da);
  haftalık iş akışı `.github/workflows/moda-radar-veri.yml` dalı çeker, günceller, `integrity_check` sonrası geri yazar.
- Her yazım tek transaction'dır; yarıda kesilen tarama dosyayı bozmaz. Günlük kipi `DELETE` (WAL değil): git'e tek dosya gider.
- Görülme günlüğü (`perakende_gorulme`) her taramayı ayrı satır tutar; zaman kilidi bu sayede "o gün ne biliniyordu"yu
  tam olarak yeniden kurar.
- DuckDB analiz için isteğe bağlı kalır: `INSTALL sqlite; ATTACH 'veri/moda.db' (TYPE sqlite);` ile aynı dosya
  okunur, Parquet'e dışa aktarım gerektiğinde yapılır. `pyarrow`/`duckdb` çekirdek bağımlılık değildir.

## Gerekçe

- **Taşınabilirlik:** tek dosya; her Python'da hazır; kopyala-çalıştır.
- **Git ile saklama:** ikili tek dosya ayrı dalda sürümlenir; geçmiş haftaların DB'si `git show` ile geri alınır.
- **Stdlib:** CI'da ve ajan oturumlarında ek kurulum yok; testler ağsız ve hızlı.
- **Artımlı upsert ve kısıtlar** (UNIQUE, FOREIGN KEY, transaction) Parquet'te el ile yazılması gereken işlerdir.

## Sonuçlar

- Dosya büyüdükçe git geçmişi şişer; 100 MB'a yaklaşınca (P2) dal sıkıştırılır (eski commit'ler tek commit'e indirilir)
  ya da Parquet anlık görüntüsü Release varlığı olarak yayımlanır.
- CLAUDE.md "Mimari özeti" ve PLAN §10'daki "Parquet + DuckDB" ifadesi baş mimar tarafından güncellenmelidir.
- `pyproject.toml` `[veri]` grubunda duckdb/pyarrow opsiyonel kalabilir; perakende ayrıştırıcısı için
  `beautifulsoup4` eklenmelidir.
