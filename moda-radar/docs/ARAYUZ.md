# Modüller arası arayüz sözleşmesi

Baş mimar yazar; ajanlar bu imzalara uyar. Değişiklik gerekiyorsa önce bu dosya, sonra kod.

## Komut eklentisi

Her modül `moda_radar/<modul>/komut.py` içinde:

```python
def ekle(alt) -> list[str]: ...  # alt: argparse alt-parser grubu; eklediği komut adlarını döner
def calistir(args) -> int: ...  # args.komut ile dallanır
```

Komutlar: `veri` → `topla`, `db-ozet`, `gecikme-olc`, `sinyal-yukle` · `renk` → `renk`, `esle` · `tahmin` → `tahmin`, `geriye-test` · `yatirim` → `yatirim`, `sor`.

## Veri (veri-muhendisi) — `moda_radar/veri/`

- `depo.Depo(yol: Path)` SQLite tek dosya (`veri/moda.db`, ADR-005). Tablolar: `defile`, `gorsel`, `parca_nitelik`, `parca_renk`,
  `perakende_urun`, `perakende_gorulme`, `perakende_nitelik`, `perakende_renk`, `talep`, `sinyal`, `gozlem`, `gecikme_olcum`. Görsel baytı asla yazılmaz; yalnız URL.
- `Depo.parca_renkleri(sezon)` (renk komutu kullanır), `Depo.ozet()`, `Depo.butunluk()`; `KilitliDepo` salt okunur.
- `Depo.sinyaller(sezon: str | None = None) -> list[SinyalKaydi]` — podyum parça sayımlarından türetilmiş sinyaller.
- `Depo.gozlemler(ulke="TR", segment=None, kategori=None) -> list[GozlemKaydi]` — perakende ilk/son görülme.
- `Depo.ekle_sinyaller(kayitlar)`, `Depo.ekle_gozlemler(kayitlar)`; `rapor` kaynaklı sinyaller `content/sinyaller/*.json`'dan `sinyal.yukle(klasor)` ile okunur ve DB'ye yazılır.
- `zaman_kilidi.kilitle(depo, tarih)` → `tarih`ten sonraki kayıtları görmeyen görünüm (geriye test).
- Toplayıcılar: `podyum_vogue.py`, `perakende.py` (segment başına seçici tablosu `content/perakende-kaynaklar.json`). Ağ yoksa fixture ile test.

## Renk (renk-bilimci) — `moda_radar/renk/`

- `uzay.hex_to_lab(hex) -> Lab`, `uzay.delta_e2000(a: Lab, b: Lab) -> float`
- `pantone.en_yakin(lab: Lab, n: int = 2) -> list[PantoneEslesme]` (tablo `content/pantone/tcx.json`)
- `pantone.esle(hex: str) -> tuple[PantoneEslesme, PantoneEslesme]` (birinci, ikinci aday)
- `palet.parca_renkleri(goruntu: bytes, k: int = 4) -> list[tuple[Lab, float]]` (renk, pay); arka plan ve ten dışarı
- `palet.sezon_paleti(renkler: list[tuple[Lab, float, str]], onceki: ... | None) -> list[PaletSatiri]`

## Tahmin (trend-modelci) — `moda_radar/tahmin/`

- `gecikme.olc(sinyaller, gozlemler, segment, onsel: dict, kategori=None) -> tuple[float, Literal["olculen","onsel","karma"], dict]` (3. öğe: n, medyan, çeyrekler, ağırlık). Gecikme defile tarihinden ölçülür; ufuk = defile tarihi + gecikme → Türkiye raf takvimi (`sezon.raf_donemi`).
- `model.tahmin_et(sezon, ulke, segment, kategori, eksen, deger, sinyaller, gozlemler, segmentler, *, esik_raf_payi=0.04, gecikme=None, model_surumu="v0") -> TahminKaydi` (`sezon` = podyum sezonu)
- `geriye_test.calistir(...) -> dict` ve `docs/karne/<surum>.md` yazımı
- Sinyal bulunamayan nitelik için olasılık 0,5'e yakın, `kaynak_sayisi=0`, gerekçede "sinyal yok" (ilke 1).

## Yatırım (yatirim-analisti) — `moda_radar/yatirim/`

- `boyutlar.hesapla(tahmin, urun, segment, maliyet=None, hedef_fiyat=None, maliyet_adet=None, rakip_sayisi=None, bugun=None) -> YatirimBoyutlari`
- `kural.karar_ver(b: YatirimBoyutlari, esikler: dict, segment_kodu: str, sinyal_durumu="tutarli") -> tuple[Karar, str]` (karar + gerekçe cümlesi); eşikler `content/esikler.json`
- `kart.uret(...) -> YatirimKarti`
- `sor` komutu: `--segment orta --kategori kadin-ust --renk "#2E5A88"|"19-4052 TCX" --desen duz --siluet oversize --kumas keten --hedef-fiyat 899 --maliyet 380 --sezon SS27`
  Çıktı: Markdown kart (beş boyut ayrı) + `--json`.
  Renk için `moda_radar.renk.pantone.esle`, tahmin için `moda_radar.tahmin.model.tahmin_et`, veri için `Depo` veya yoksa `content/sinyaller`.
