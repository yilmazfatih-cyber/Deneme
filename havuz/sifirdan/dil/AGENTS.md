# sifirdan/dil — model talimatları

## Bu temel ne yapar

Dil ve metin işleme için dokuz mini sistem: `yorumlayici` (Tohum dili), `sanal_makine` (aynı dil
için bayt kodu), `regex`, `json_ayristirici`, `sablon`, `markdown`, `hesap`, `fark`,
`test_cercevesi`. Hepsi yalnız Python standart kitaplığıyla yazılır; her biri tek klasördür ve
testleri `tests/<sistem>/` altındadır. Bağımsız bir doğruya karşı farksal testler esastır.

## Komutlar

| Komut (bu klasörden) | Ne yapar |
| --- | --- |
| `uv venv .venv && uv pip install --python .venv/bin/python -r requirements-dev.lock && uv pip install --python .venv/bin/python -e . --no-deps` | kurulum |
| `.venv/bin/python scripts/check.py` | **tek denetim**: ruff + ruff format + mypy (strict) + pytest (< 2 dk) |
| `.venv/bin/python scripts/check.py --duzelt` | biçim/lint sorunlarını kendiliğinden düzeltip denetler |
| `.venv/bin/python scripts/check.py --uzun` | + yavaş testler ve 2 000 örnekli hypothesis |
| `.venv/bin/python -m pytest tests/<sistem> -q` | tek sistemin testleri |
| `.venv/bin/python -m <sistem> --help` | her sistemin komut satırı (alt komutlar Türkçe ASCII) |
| `uv pip compile pyproject.toml --extra dev --universal --python-version 3.11 -o requirements-dev.lock` | kilidi yeniler (yalnız bağımlılık değişince) |

## Harita

| Şunu değiştireceksen | Şuraya bak |
| --- | --- |
| Tohum dilinin sözdizimi | `yorumlayici/tokens.py`, `lexer.py`, `pratt.py` (ifade), `parser.py` (deyim), `DIL.md` |
| Tohum'un anlamı (işleçler, değerler) | `yorumlayici/ops.py`, `values.py` — İKİ arka uç da bunu kullanır |
| Tohum yerleşik işlevi | `yorumlayici/natives.py` `TABLE` |
| Kapsam/kapanım kuralı | `yorumlayici/resolver.py` + `interp.py` + `sanal_makine/compiler.py` (üçü aynı olmalı) |
| Bayt kodu komutu | `sanal_makine/opcodes.py`, `compiler.py`, `vm.py` |
| Regex sözdizimi / eşleme | `regex/parser.py` / `regex/compiler.py` + `pikevm.py` |
| JSON kuralı ya da hata iletisi | `json_ayristirici/scanner.py` (iki ayrıştırıcının ORTAK kodu) |
| Şablon etiketi / süzgeç | `sablon/compiler.py` `tags` / `sablon/filters.py` `FILTERS` |
| Markdown blok / satır içi | `markdown/blocks.py` / `markdown/inline.py` + `delimiters.py` |
| Hesap birimi / işlevi | `hesap/units.py` `UNITS` / `hesap/functions.py` `FUNCTIONS` |
| Fark algoritması / yama | `fark/myers.py` / `fark/patch.py` |
| Test çerçevesi işareti | `test_cercevesi/markers.py` + `runner.py` |
| Ortak kurallar | `tests/test_kurallar.py` |

## Değişmez kurallar

1. Paketler yalnız standart kitaplığı içe aktarır; tek istisna `sanal_makine → yorumlayici`.
   (`tests/test_kurallar.py::test_only_stdlib_and_allowed_sibling_imports`)
2. `eval`, `exec`, `compile`, `__import__` yasak; tek istisna `test_cercevesi/rewrite.py`.
   (`test_no_eval_exec_and_no_unsafe_case_calls`)
3. `.upper()/.lower()/.title()/.casefold()` Türkçe'de yanlıştır: `upper_tr`/`lower_tr` kullanın ya da
   satıra `# tr-güvenli: neden` yazın. (aynı test)
4. Her kaynak dosya Türkçe docstring + `Genişletme:` satırıyla açılır, ≤ 320 satırdır (hedef ~300).
   (`test_source_file_rules`)
5. Dosya adı standart modülü gölgeleyemez (`ast.py`, `types.py`, `html.py`… yasak).
   (`test_module_names_do_not_shadow_stdlib`)
6. Her sistemin README'sinde "Nasıl çalışır", "Dosya haritası", "Sınırlar", "Buradan nereye" vardır.
   (`test_each_system_has_readme_sections_and_tests`)
7. Test dosyası adları benzersizdir: `tests/<sistem>/test_<sistem>_*.py`. (`test_test_file_names_are_unique`)
8. Tohum'un iki arka ucu aynı sonucu verir; yeni dil özelliği `sanal_makine/random_programs.py`'ye de
   eklenir. (`tests/sanal_makine/test_sanal_makine_farksal.py`)
9. Hata iletileri Türkçe: konum + ne beklendi + ne bulundu + (uygunsa) ipucu. Testler iletiyi sınar.
10. Kötü niyetli girdi sınırları (adım, derinlik, boyut) kaldırılmaz; her sınırın testi vardır.
11. Görünmez/birleşen karakter (BOM, sıfır genişlikli/bölünmez boşluk, U+0300–036F…) kaynağa
    karakterin kendisiyle yazılmaz, `"\u200b"` gibi kaçışla yazılır (STANDARTLAR §6.11).
    Dosya yazma aracı `\uXXXX`'i gerçek karaktere çevirebilir: yazdıktan sonra depo kökünden
    `python3 havuz/araclar/kacis.py havuz/sifirdan/dil`. (`test_no_invisible_characters_in_sources`)

## Tarifler

**Tohum'a yerleşik işlev eklemek** — `yorumlayici/natives.py`: `_yeni(args, ctx, pos)` yazın,
`TABLE`'a `("yeni_ad", "yeni_ad_ascii", _yeni, en_az, en_çok)` ekleyin; `DIL.md` tablosuna satır;
`tests/yorumlayici/test_yorumlayici_yerlesik.py`'ye bir örnek. Sanal makine kendiliğinden kullanır.
Doğrula: `.venv/bin/python -m pytest tests/yorumlayici tests/sanal_makine -q`.

**Tohum'a yeni ikili işleç eklemek** — `tokens.py` (belirteç), `lexer.py` tabloları, `pratt.py` `INFIX`,
`ops.py` `binary`, `sanal_makine/opcodes.py` (`Op` + `BINARY_OPS`), `random_programs.py` `INFIX`.
Doğrula: farksal testler.

**Regex'e yeni kaçış (ör. `\h`)** — `regex/nodes.py` `CATEGORIES`'e işlev; `regex/parser.py`
`escape_char` içinde harfi tanıyın; `tests/regex/test_regex_engine.py`'ye örnek. `re` desteklemiyorsa
farksal teste girmez.

**Şablona süzgeç eklemek** — `sablon/filters.py`: `f_ad(env, value, *args)` + `FILTERS["ad"]`;
çıktı HTML ise `Markup` döndürün ve XSS testi yazın (`tests/sablon/test_sablon_xss.py`).

**Hesap'a birim eklemek** — `hesap/units.py` `UNITS`'e satır (ad, boyut, çarpan); test:
`tests/hesap/test_hesap_birim.py::test_conversions`'a satır. Gidiş-dönüş testi kendiliğinden kapsar.

**Markdown'a satır içi sözdizimi** — `markdown/inline.py` `scan` içine dal; güvenlik özellik testi
(`test_any_input_produces_safe_html`) izin listesindeki etiket/öznitelikleri denetler — yeni etiket
gerekiyorsa oradaki `ALLOWED_TAGS`'e de ekleyin.

**Yeni mini sistem eklemek** — kökte `yeni_sistem/` (+ `__init__.py`, `README.md` dört bölümle,
`__main__.py`), `tests/yeni_sistem/test_yeni_sistem_*.py`; `pyproject.toml`'da `include`,
`known-first-party`, mypy `files` listelerine ve `tests/test_kurallar.py` `SYSTEMS`'e ekleyin.

## Sık yapılan hatalar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| `ruff format --check` kırmızı | biçim | `scripts/check.py --duzelt` |
| E501 satır çok uzun (yorum/dizgi) | ruff format dizgileri bölmez | satırı elle bölün (≤ 100) |
| Kural testi: `.lower() Türkçe'de yanlış` | `str.lower` kullanıldı | `lower_tr` ya da `# tr-güvenli:` açıklaması |
| `ModuleNotFoundError: regex` testte | paket kurulmamış | `uv pip install … -e . --no-deps` |
| Farksal test: yorumlayıcı ≠ sanal makine | kapsam/değerlendirme sırası farkı | hata iletisindeki programı `python -m yorumlayici kod` ve `python -m sanal_makine dok` ile karşılaştırın |
| hypothesis "Flaky"/yavaş | ağır örnek | örnek boyunu küçültün; `deadline` kapalıdır |
| `pytest.raises(match=…)` regex hatası | iletide `+`, `(` gibi karakterler | `re.escape` ya da daha kısa bir parça |
| mypy "Source file found twice" | paket olmayan klasörde aynı ad | dosyaya benzersiz ad verin |

## Bitti tanımı

- [ ] `.venv/bin/python scripts/check.py` YEŞİL (ruff, biçim, mypy, pytest)
- [ ] Yeni davranışın testi var; mümkünse bağımsız bir doğruya karşı farksal testi var
- [ ] Hata iletileri Türkçe ve yol gösterici; ilgili README "Sınırlar"/"Buradan nereye" güncel
- [ ] Kötü niyetli girdi için sınır ve testi düşünüldü
- [ ] README'deki örnek komutlar gerçekten çalışıyor
