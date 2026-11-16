# Sınav — model talimatları

## Bu temel ne yapar

Kod ajanlarını havuzun temelleri üstünde ölçer. Bir görev = **başlangıç durumu** (temelin temiz kopyasına uygulanan
`hazirla.py`) + ajana verilen **talimat** (`GOREV.md`) + **gizli denetim** (`gizli/`) + **başvuru çözümü**
(`cozum.py`). `hazirla` görev klasörünü kurar; sahibi ajanını orada çalıştırır; `puanla` hile denetimi + gizli
testler + temelin kendi denetimiyle ölçer; `rapor` modelleri karşılaştırır; `dogrula` görevlerin kendisini sınar.
Yalnız Python standart kütüphanesi; havuzun ortak araçlarını (`havuz/araclar`) içe aktarır.

## Komutlar

Hepsi bu klasörden (`havuz/sinav`) çalışır. Sınavı KULLANMAK için yalnız Python 3.11+ yeter; geliştirme ortamı
(kilitten): `uv venv .venv && uv pip install --python .venv/bin/python -r requirements-dev.lock && uv pip install
--python .venv/bin/python --no-deps -e .` (ya da depo kökünden `python havuz/araclar/denetle.py sinav --kur`).
Kilidi yenilemek: `uv pip compile pyproject.toml --extra dev --python-version 3.11 --universal -o requirements-dev.lock`.

| Komut | Ne yapar |
| --- | --- |
| `.venv/bin/python scripts/check.py` | **Tek komutluk denetim**: ruff + biçim + mypy + hızlı testler (~10 sn, ağsız) |
| `.venv/bin/python scripts/check.py --duzelt` | Önce biçim ve basit lint hatalarını düzeltir |
| `python sinav.py liste` | Görevler |
| `python sinav.py hazirla <gorev> <klasor> [--kurma] [--gitsiz]` | Görev klasörünü kurar (klasör deponun dışında olmalı) |
| `python sinav.py puanla <klasor> --etiket <model> [--dur] [--kaydetme]` | Ölçer, `sonuclar/<etiket>.jsonl`'e yazar |
| `python sinav.py rapor [--cikti x.md]` | Karşılaştırma tablosu |
| `python sinav.py dogrula [gorev …] [--klasor k] [--hizli] [--birak]` | Sınavın sınavı (görev başına 1–3 dk) |
| `SINAV_TAM=1 .venv/bin/python -m pytest tests/test_dogrulama.py` | Aynı doğrulama, pytest olarak (uzun denetim) |

## Harita

| Şunu değiştireceksen | Şuraya bak |
| --- | --- |
| Görev ekle / düzelt | `gorevler/<kimlik>/` (tarif aşağıda); örnek basit hata: `site-okuma-suresi`, iki dilli: `kutuphane-paylastirma` |
| `gorev.toml` alanları ve doğrulaması | `exam/tasks.py` |
| Korunan dosya desenleri (temel başına) | `exam/foundations.py` → `_ORTAK_*`, `_OZEL` |
| Hile denetimi kuralları | `exam/integrity.py` (`_ATLAMA`, `_SUSTURMA`, yalnız-ekleme denetimi) |
| Görev betiklerinin düzenleme yardımcıları | `exam/edit.py` (`replace`, `remove_between`, `insert_before`, `run`) |
| Hazırlık adımları | `exam/prepare.py`; GOREV.md biçimi `exam/prompt.py` (1. ileti `rehber/ISTEMLER.md` §1'den okunur) |
| Puanlama aşamaları | `exam/grade.py`; komut çalıştırma ve süre sınırı `exam/runner.py` |
| Okuma görevi yanıt kuralları | `exam/answers.py` + `gorevler/<kimlik>/gizli/yanit_denetle.py` |
| Sonuç dosyası, rapor | `exam/results.py`, `exam/report.py` |
| Doğrulama (genel hileler) | `exam/verify.py` |
| Komut satırı | `exam/cli.py` (Türkçe argparse: `exam/cli_tr.py`) |

## Değişmez kurallar

1. **Gizli test ve çözüm görev klasörüne girmez.** Gizli dosyalar puanlamada kopyalanır, koşulur, silinir; hedef
   adları `sinav` içerir. → `exam/tasks.py` (ad denetimi), `tests/test_gorevler.py`.
2. **Görev metni çözümü ele vermez ve sınandığını söylemez** ("gizli", "hile", "sınav" geçmez). → `test_gorev_metni_cozumu_ele_vermez`.
3. **Hazırlık betiği temele tam uyar:** aranan metin bulunamazsa `EditError`; temel değişince hızlı denetim
   kırmızı olur. → `test_hazirlik_temelin_simdiki_haline_uygulanir`.
4. **Hata görevinde hata mevcut testlerden kaçar** (başlangıçta temelin denetimi yeşil; hatayı yakalayan test
   varsa hazırlık onu çıkarır). → `dogrula` (`baslangic_denetimi = "yesil"`).
5. **Her görev üç koşulu sağlar:** başlangıç KALIR, çözüm GEÇER, hile GEÇERSİZ. → `dogrula`, `tests/test_dogrulama.py`.
6. **Var olan teste yalnız ekleme** (yeni test, yeni vektör, içe aktarmaya ad) serbest; silmek, değiştirmek,
   atlama işareti ihlaldir. Görev gerçekten var olan testi değiştirmeyi gerektiriyorsa `[koruma] izinli` listesine
   yazılır. → `tests/test_butunluk.py`.
7. **Yalnız standart kütüphane**, her dosya Türkçe başlık + `Genişletme:` satırıyla açılır, ≤ 300 satır.
   → `tests/test_kurallar.py`.
8. **README görev tablosu eksiksizdir; her komut belgelenir.** → `test_belgeler_komutlari_ve_gorevleri_anar`.
9. Testler sonuç ve kayıt klasörüne dokunmaz (`SINAV_SONUCLAR`, `SINAV_CALISMA` geçici klasöre yönlenir). → `tests/conftest.py`.

## Tarifler

### Yeni görev ekle

1. Klasör: `gorevler/<temel>-<kısa-ad>/` (ASCII, tire). En yakın görevi kopyalayın.
2. `gorev.toml`: `kimlik` (klasör adı), `baslik`, `temel`, `zorluk` (kolay/orta/zor), `tur`
   (ozellik/hata/degisiklik/okuma/tuzak), `tahmini_sure_dk`, `aciklama` (sahibi için: ne ölçer, tuzak ne),
   `baslangic_denetimi` (`yesil`/`kirmizi`) ve en az bir `[[gizli]]` (`ad`, `komut`, `klasor`, `dosyalar = {
   "kaynak" = "hedef/yol/sinav-gizli-x.test.ts" }`, isteğe bağlı `ortam`, `konum = "gorev"`). Komutta
   `{python}` (sınavın Python'u), `{gizli}`, `{gorev}`, `{kopya}` kullanılabilir.
3. `hazirla.py` → `def hazirla(kopya: Path) -> None`: `exam.edit` ile tam eşleşen değişiklikler. Hata görevinde
   hatayı yerleştirin ve onu yakalayan mevcut test satırlarını çıkarın (kullanılmayan içe aktarmayı da!).
4. `GOREV.md`: sahibinin yazacağı gibi, belirtiyi anlatın, çözümü değil. Ad/imza gerekiyorsa açıkça verin
   (gizli test ona bağlıdır). "Denetim yeşil olsun" ile bitirin.
5. `gizli/`: davranışı sınayan test; mümkünse kaba kuvvet ya da başvuru gerçeklemesiyle karşılaştırın. Görev
   metninde yazmayan bir ayrıntıya bağlanmayın (ör. düğme metni yerine erişilebilir ad).
6. `cozum.py` → `def coz(kopya: Path) -> None` (biçimleyiciyi de çalıştırın; temelin denetimi yeşil olmalı).
   İsteğe bağlı `hile.py` → `def hile(kopya: Path) -> None`: görevin en cazip hilesi (başlangıca uygulanır).
7. README görev tablosuna satır ekleyin.
8. Doğrulama: `.venv/bin/python scripts/check.py` ve `python sinav.py dogrula <kimlik>`.

### Hızlı deneme (kurulumsuz)

`python sinav.py hazirla <gorev> /tmp/x --kurma --gitsiz` → `python sinav.py puanla /tmp/x --etiket deneme
--kaydetme --dur` (bütünlük ve gizli test hattını sınar; temelin denetimi ortamsız koşmaz).

### Temel değişti, görev bozuldu

`scripts/check.py` hangi görevin hangi metni bulamadığını söyler (`EditError`). Temelin yeni hâline bakıp
`hazirla.py`/`cozum.py`'deki aranan metni güncelleyin, sonra `python sinav.py dogrula <kimlik>`.

## Sık yapılan hatalar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| `EditError: aranan metin 1 kez beklenirken 0 kez bulundu` | Temel değişti | Aranan metni temelin şimdiki hâline göre güncelleyin |
| Başlangıçta denetim kırmızı (beklenen yeşil) | Çıkarılan test kullanılmayan içe aktarma bıraktı | Hazırlıkta içe aktarmadan adı da çıkarın |
| Çözüm KALDI, gizli test geçti | Çözümün biçimi/lint'i temele uymuyor | `cozum.py`'nin sonunda biçimleyiciyi çalıştırın |
| Hile GEÇERSİZ değil, KALDI | Hile korunan dosyaya dokunmuyor | Hile korunan dosyayı değiştirmeli ya da `[koruma] degismez`'e ekleyin |
| `hazirla` "deponun içinde" diyor | Hedef klasör depo içinde | Deponun dışında bir klasör verin (ör. `~/sinav/...`) |
| JS testinde `\b` Türkçe harften sonra eşleşmiyor | JS `\b` yalnız ASCII | `(?!\p{L})` ve `u` bayrağı |

## Bitti tanımı

- [ ] `.venv/bin/python scripts/check.py` yeşil
- [ ] Yeni/değişen görev için `python sinav.py dogrula <kimlik>` TAMAM (1, 2, 3)
- [ ] README görev tablosu ve `docs/DOGRULAMA.md` güncel; karar alındıysa `docs/KARARLAR.md`
- [ ] Görev metni çözümü ele vermiyor; sahibi için `aciklama` ne ölçtüğünü söylüyor
