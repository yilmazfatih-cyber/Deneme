# Veri havuzu — model talimatları

## Bu temel ne yapar

Türkçe başvuru verileri (`tr/`), tohumlu ve ilişkisel tutarlı sentetik veri üreteçleri
(`verihavuzu/sentetik/`), veri kalitesi araçları (`verihavuzu/kalite/`), nazik veri hattı iskeleti
(`verihavuzu/hat/`) ve Hugging Face API'siyle doğrulanmış açık veri kataloğu (`katalog/`). Çekirdek
bağımlılık yalnız standart kitaplık + pydantic. **Yanlış veri eksik veriden kötüdür**: doğrulayamadığın
olguyu hiçbir veri dosyasına yazma.

## Komutlar

Hepsi bu klasörden (`havuz/veri`) çalışır.

| Komut | Ne yapar |
| --- | --- |
| `uv venv .venv && uv pip install --python .venv/bin/python -e ".[dev,analiz]"` | kurulum |
| `.venv/bin/python scripts/check.py` | **tek denetim**: ruff + biçim + mypy + pytest (ağsız, ~20 sn) |
| `.venv/bin/python -m pytest tests/test_x.py -q` | tek test dosyası |
| `.venv/bin/ruff format .` | biçimle |
| `.venv/bin/python scripts/build_reference.py` | `tr/*.json` → `tr/*.csv` kopyalarını yenile |
| `.venv/bin/python scripts/build_examples.py` | `ornekler/` kümelerini yeniden üret |
| `.venv/bin/python -m verihavuzu.analiz --yaz` | analiz tariflerinin beklenen çıktılarını yenile |
| `.venv/bin/python scripts/verify_catalog.py` | kataloğu API'yle doğrula (AĞ) |
| `.venv/bin/python scripts/verify_reference.py` | başvuru verilerini kaynaklarla karşılaştır (AĞ; `.[dogrulama]`) |
| `VERIHAVUZU_AG=1 .venv/bin/python -m pytest tests/test_ag.py` | gerçek ağ testleri |

## Harita

| Şunu değiştireceksen | Şuraya bak |
| --- | --- |
| Başvuru tablosu | `tr/<ad>.json` + `tr/<ad>.meta.json`, sonra `scripts/build_reference.py` |
| İl/ilçe/posta/alan kodu yardımcıları | `verihavuzu/geo.py` |
| Ay/gün adı, tatil, tarih okuma-yazma | `verihavuzu/calendar_tr.py` |
| Büyük/küçük harf, ASCII'ye indirme | `verihavuzu/text.py` (`upper_tr`, `lower_tr`) |
| TCKN/VKN/IBAN/Luhn | `verihavuzu/ids.py` |
| Sayıyı yazıya çevirme | `verihavuzu/numwords.py` |
| CSV/JSONL/JSON/Parquet okuma-yazma | `verihavuzu/files.py` |
| Yeni sentetik varlık | `verihavuzu/sentetik/<varlik>.py` + `sentetik/registry.py` |
| Tohum, Zipf, para yuvarlama | `verihavuzu/sentetik/base.py` |
| KDV, kampanya, iade oranı ayarları | `verihavuzu/sentetik/config.py` |
| Kirli veri bozulmaları | `verihavuzu/sentetik/dirty.py` (temizleyici: `kalite/clean.py`) |
| Şema sözleşmesi / doğrulama | `kalite/schema.py`, `kalite/validate.py` |
| Tekil değer denetimi (tckn, iban…) | `kalite/validators.py` (`VALIDATORS`) |
| Tablo denetimleri (benzersiz, yabancı anahtar…) | `kalite/checks.py` |
| Profil, kayma, ayırma, yineleme, kişisel veri | `kalite/profile.py`, `drift.py`, `split.py`, `dedupe.py`, `pii.py` |
| Rapor biçimi | `kalite/report.py` |
| HTTP getirici, önbellek | `hat/fetch.py`, `hat/http_cache.py` |
| Hat çalıştırıcı, depolar | `hat/pipeline.py`, `hat/storage.py` |
| Örnek hat | `hat/examples/tcmb.py` + `hat/registry.py` |
| Katalog kaydı, arama, doğrulama, indirme | `katalog/kumeler.yaml`, `verihavuzu/katalog/*.py` |
| Komut satırı | `verihavuzu/cli/main.py` (ayrıştırıcı), `commands_data.py`, `commands_net.py` |
| Örnek kümeler | `verihavuzu/sentetik/examples.py` |

## Değişmez kurallar

1. `tr/` altındaki her veri dosyasının `<ad>.meta.json`'u vardır ve `kaynak`, `lisans`, `dogrulama`
   (yöntem, tarih, kaynaklar), `guven` taşır; CSV, JSON'un birebir kopyasıdır. → `tests/test_rules.py`
2. Doğrulanamayan olgu veri dosyasına girmez; tahmin ya da "muhtemelen doğru" bilgi yazılmaz. → inceleme + `scripts/verify_reference.py`
3. Başvuru değişmezleri: 81 il, plaka 1–81 benzersiz, 973 ilçe, 30 büyükşehir, 29 harf… → `tests/test_reference.py`
4. Büyük/küçük harf yalnız `upper_tr`/`lower_tr` ile; çıplak `.upper()`/`.lower()` yok (ASCII ise `# tr-ok`). → `tests/test_rules.py`
5. Her üreteç belirlenimcidir, sözleşmesine uyar ve yeni alanlar kendi `rng.child("alan")` akışını kullanır. → `tests/test_sentetik.py`
6. Para `Decimal` ile ve yarım yukarı yuvarlanır; float kuruş hesabı yok. → `tests/test_sentetik.py`
7. Uydurma kimlikler gerçek kişiyi tanımlamak için kullanılmaz; e-postalar `.example`/`.test` alanlarına gider. → `tests/test_sentetik.py`
8. Örnek kümeler aynı komutla bayt bayt yeniden üretilir; boyut ≤ ~1 MB/dosya, ≤ 8 MB toplam. → `tests/test_ornekler.py`
9. Katalogdaki her kayıt son doğrulama dosyasında "dogrulandi"dır; ticari karar lisans kuralından serbest olamaz. → `tests/test_katalog.py`
10. Raporlara kişisel veri değeri yazılmaz (maskeli gösterilir). → `tests/test_cli.py`
11. Testler ağsızdır; ağ isteyenler `@pytest.mark.ag` ile işaretlenir. → `tests/conftest.py`
12. Her kaynak dosya Türkçe başlıkla açılır, `Genişletme:` satırı taşır, ~300 satırı aşmaz. → `tests/test_rules.py`

## Tarifler

### Yeni başvuru verisi ekle (doğrulama kuralıyla)
1. Önce doğrulama yolunu seç: (a) algoritmayla üretilen, (b) en az bir bağımsız ve yeniden dağıtıma
   izin veren kaynakla karşılaştırılan (iki kaynak daha iyi), (c) kapalı ve kesin bilinen küme.
   Hiçbiri yoksa EKLEME; README "Sınırlar"a yaz.
2. `tr/<ad>.json` dosyasını "satır başına bir nesne" biçiminde yaz (sütun adları ASCII, küçük harf).
3. `tr/<ad>.meta.json` yaz (`tr/gunler.meta.json`ı kopyala): `kaynak`, `lisans`, `dogrulama.yontem`
   (`algoritma`/`capraz-kaynak`/`bilinen-kume`/`tasarim`), `dogrulama.kaynaklar` (ad, adres, lisans,
   sonuç), `guven`, `alanlar` (her sütun), `kayit_sayisi`.
4. Karşılaştırmayı `scripts/verify_reference.py`ye ekle; üçüncü taraf içerik kopyaladıysan `tr/ATIFLAR.md`ye bildirimi yaz.
5. `python scripts/build_reference.py` → CSV; değişmezlerini `tests/test_reference.py`ye yaz.
6. Doğrula: `python scripts/check.py`.

### Yeni sentetik varlık ekle
1. `verihavuzu/sentetik/people.py`yi kopyala → `sentetik/<varlik>.py`; sözleşmeyi (`TableContract`) yaz.
2. Her alan için `r.child("alan")` akışı kullan; para için `money()`, kimlik için `make_id()`.
3. `sentetik/registry.py`de "YENİ ÜRETEÇ BURAYA" satırının üstüne `GeneratorSpec` ekle.
4. Tutarlılık değişmezlerini `tests/test_sentetik.py`ye yaz (belirlenimcilik testi kendiliğinden kapsar).
5. Gerekirse `sentetik/examples.py`ye örnek ekle → `python scripts/build_examples.py`.
6. Doğrula: `python scripts/check.py`.

### Yeni kalite denetimi ekle
- Tekil değer denetimi (ör. plaka biçimi): `kalite/validators.py`ye işlev + `VALIDATORS` ve
  `VALIDATOR_LABELS`a kayıt; `tests/test_validators.py`ye geçerli/geçersiz örnek.
- Tablo denetimi: `kalite/checks.py`ye `check_x` + `CheckSpec.tur` + `_dispatch` dalı; ekilmiş hatayı
  `tests/test_kalite.py`de yakalat.
- Doğrula: `python scripts/check.py`.

### Yeni hat ekle
1. `verihavuzu/hat/examples/tcmb.py`yi kopyala; `fetch` (artımlı durum `ctx.state`), `validate`
   (sorun listesi), `transform` (satır) ve `SPEC` (tablo, anahtar) yaz.
2. `hat/registry.py`ye "YENİ HAT BURAYA" satırının üstüne ekle.
3. Gerçek yanıtları `tests/fixtures/<hat>/` altına kaydet (kaynağı ve tarihi belirt); `tests/test_hat.py`
   gibi sahte aktarımla çevrimdışı test yaz (idempotentlik + karantina + artımlılık).
4. Kaynağın robots.txt'sine ve kullanım koşullarına bak; `python -m verihavuzu hat calistir <ad>` ile bir kez gerçek ağda dene.

### Kataloğa küme ekle
1. `https://huggingface.co/api/datasets/<kimlik>` yanıtına bak: lisans ve boyut ETİKETLERİNİ olduğu gibi yaz.
2. `katalog/kumeler.yaml`a kayıt ekle (alanlar başlıktaki listede); `ticari_kullanim` kuralı
   `docs/LISANSLAR.md`de — kart web taraması/kazınmış içerik/çeviri diyorsa "belirsiz" yaz.
3. `python scripts/verify_catalog.py` (AĞ) → yeni `katalog/dogrulama-<tarih>.json`. "dogrulandi" değilse kaydı düzelt ya da çıkar.
4. Doğrula: `python scripts/check.py` (katalog testi EN YENİ doğrulama dosyasına bakar; eski
   tarihli doğrulama dosyalarını silmeyin, geçmiş kaydıdır).

### Bir CSV'yi profille ve temizle
```bash
python -m verihavuzu profil veri.csv --rapor calisma/profil.md --json calisma/profil.json
python -m verihavuzu temizle veri.csv --cikti calisma/temiz.csv --degisiklikler calisma/degisiklik.jsonl \
    --yineleme-sutunlari ad soyad dogum_tarihi
python -m verihavuzu dogrula calisma/temiz.csv --sema veri.sema.json --rapor calisma/dogrulama.md
```

### Kişisel veriyi maskele
```bash
python -m verihavuzu maskele veri.csv --rapor calisma/kv.md               # yalnız tara
python -m verihavuzu maskele veri.csv --cikti calisma/maskeli.csv           # •••••46 biçimi
export VERIHAVUZU_TAKMA_AD_ANAHTARI="$(python -c 'import secrets; print(secrets.token_hex(32))')"
python -m verihavuzu maskele veri.csv --yontem takma_ad --cikti calisma/takma.csv   # tutarlı belirteç
```
Anahtarı gizli tut ve kaybetme; takma adlı veri KVKK açısından hâlâ kişisel veridir (`docs/KVKK_NOTLARI.md`).

### Örnek kümeleri yeniden üret
Üreteci bilerek değiştirdiysen: `python scripts/build_examples.py` → `python -m verihavuzu.analiz --yaz`
→ farkları gözden geçir → `python scripts/check.py`.

## Sık yapılan hatalar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| `tr/x.csv güncel değil` | JSON değişti, CSV yenilenmedi | `python scripts/build_reference.py` |
| `ornekler/... farklı` | üreteç ya da başvuru verisi değişti | bilerek ise `python scripts/build_examples.py` |
| `tarifin çıktısı belgeyle uyuşmuyor` | örnekler değişti | `python -m verihavuzu.analiz --yaz`, sonra gözle denetle |
| `Türkçe için yanlış büyük/küçük harf` | `.upper()`/`.lower()` kullanıldı | `upper_tr`/`lower_tr`; ASCII ise `# tr-ok` |
| "İstanbul" ≠ "ISTANBUL" eşleşmiyor | karşılaştırma ham metinle | `text.match_key` ya da `geo.find_province` |
| Belirlenimcilik testi kırıldı | yeni alan mevcut akışı kullandı | yeni alana `r.child("yeni_alan")` ver |
| `Ayar dosyası geçersiz` | bilinmeyen alan/yanlış tür | hata iletisindeki alan adını düzelt |
| `robots.txt bu adrese izin vermiyor` | kaynak taramayı yasaklıyor | başka kaynak bul; kuralı aşma |
| `doğrulanmamış: <kimlik>` | katalog değişti, doğrulama eski | `python scripts/verify_catalog.py` (ağ) |
| Excel CSV'yi tek sütunda açıyor | standart CSV virgüllü | `uret ... --excel-tr` (`;` + BOM + ondalık virgül) |

## Bitti tanımı

- [ ] `python scripts/check.py` yeşil (ağsız)
- [ ] Yeni veri dosyasının `.meta.json`'u ve doğrulama kaydı var; doğrulanamayan olgu yok
- [ ] Yeni kod Türkçe başlıklı, `Genişletme:` satırlı, testli; dosya ~300 satırı aşmıyor
- [ ] Örnekler/analiz çıktıları değiştiyse bilerek yenilendi ve gözden geçirildi
- [ ] README "Sınırlar" güncel; yeni karar `docs/KARARLAR.md`de
- [ ] `calisma/` dışında geçici dosya yok
