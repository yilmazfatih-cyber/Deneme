# Sıfırdan: bir algoritma deposu iskeleti

TheAlgorithms/Python'un algoritmalarını değil, **onları bir arada tutan düzeneği** küçük ölçekte yeniden kuruyoruz:
doctest'li tek dosyalık algoritmalar, makinenin yazdığı `DIRECTORY.md`, adlandırma ve içerik kurallarını denetleyen
bir betik ve hepsini sırayla koşan tek komutluk yerel CI.

## Gereksinimler

- Python 3.11 veya üstü (burada 3.13 ile denendi). Yalnızca standart kütüphane; kurulum yok.
- İnternet gerekmez.

## Çalıştırma

```bash
cd repo-atlasi/dallar/09-bilgisayar-bilimi/thealgorithms-python/sifirdan
python3 betikler/kontrol.py              # kurallar + tüm doctest'ler + DIRECTORY.md tazeliği
python3 betikler/dizin_olustur.py        # DIRECTORY.md'yi yeniden üret
python3 betikler/kurallari_denetle.py    # yalnızca kurallar (bulgu varsa çıkış kodu 1)
python3 -m doctest -v arama/ikili_arama.py   # tek dosyanın doctest'leri (orijinal depodaki öneri)
```

## Test

```bash
python3 -m unittest discover -s repo-atlasi/dallar/09-bilgisayar-bilimi/thealgorithms-python/sifirdan \
  -t repo-atlasi/dallar/09-bilgisayar-bilimi/thealgorithms-python/sifirdan
```

30 test; bunların 17'si modüllerdeki doctest'li docstring'lerden (toplam 54 örnek) üretilir.

## Aşamalar

1. **Tek dosya, tek algoritma.** `arama/ikili_arama.py`: modül docstring'inde kaynak URL ve karmaşıklık, her
   fonksiyonda tip ipucu, hem geçerli hem hatalı girdiyi gösteren doctest (`Traceback ... ValueError`).
2. **Klasörler ve paketler.** Her klasörde boş `__init__.py`; `testler/test_doctestler.py` doctest'leri `load_tests`
   protokolüyle unittest'e bağlar (orijinaldeki `pytest --doctest-modules`'un karşılığı).
3. **Ortak sözleşme testi.** `testler/test_siralamalar.py`: her sıralamaya aynı girdi bataryası, girdiyi değiştirmeme ve
   kararlılık testi (orijinaldeki `tests/test_sorts.py` fikri).
4. **Makinenin yazdığı içindekiler.** `betikler/dizin_olustur.py` ağacı dolaşır, iç içe Markdown listesi üretir;
   `--kontrol` bayrağı "dosya güncel mi" diye bakar. Çıktı Prettier biçimiyle birebir uyumludur (bu depo CI'da
   `prettier --check` koşuyor).
5. **Kural denetleyicisi.** `betikler/kurallari_denetle.py`: dosya adı kuralları (orijinalin dördü + ASCII) ve `ast` ile
   içerik kuralları (kaynak URL, doctest, hata doctest'i, tip ipucu, `print`/`input` yasağı).
6. **Yerel CI.** `betikler/kontrol.py` üç adımı sırayla koşar ve tek çıkış kodu döndürür.

## Türkçe başlık tuzağı

Dosya adları taşınabilirlik için ASCII'dir (`siralama`, `duzenleme_mesafesi`). Başlık üretirken iki tuzak var:

- `"ikili arama".title()` → `"Ikili Arama"`: Türkçede doğrusu `"İkili Arama"`. `baslik_yap()` ilk harfi Türkçe kurala
  göre büyütür (`i → İ`, `ı → I`).
- ASCII adda `ç ğ ı ö ş ü` olamayacağı için `basliklar.json` küçük bir sözlükle görünen adı verir
  (`"siralama": "Sıralama"`).
- Bağlantı çapası (`#sıralama`) için ise Türkçe kural **kullanılmaz**: GitHub başlık çapasını dilden bağımsız küçük harf
  dönüşümüyle üretir (`capa_yap()`).

## Eşleme tablosu

| Mini'deki parça                     | Gerçek depodaki karşılığı                                   | Fark                                                                                 |
| ----------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `arama/`, `siralama/`, `graflar/` … | `searches/`, `sorts/`, `graphs/` … (43 klasör)              | 7 algoritma; Türkçe ad ve açıklama                                                   |
| `testler/test_doctestler.py`        | `pyproject.toml` > `[tool.pytest]` `--doctest-modules`      | pytest yerine unittest `load_tests`                                                  |
| `testler/test_siralamalar.py`       | `tests/test_sorts.py`                                       | pytest parametrize yerine `subTest`                                                  |
| `betikler/dizin_olustur.py`         | `scripts/build_directory_md.py`                             | Prettier uyumlu çıktı, Türkçe başlık, `basliklar.json`, `--kontrol` bayrağı          |
| `betikler/kurallari_denetle.py`     | `scripts/validate_filenames.py` + ruff `ANN` + CONTRIBUTING | İçerik kuralları `ast` ile; çıkış kodu 0/1 (orijinal hatalı dosya sayısını döndürür) |
| `betikler/kontrol.py`               | `.pre-commit-config.yaml` + `.github/workflows/build.yml`   | Yerel ve sıralı; paralel iş parçacığı testi, ruff, ty yok                            |
| `DIRECTORY.md` tazelik testi        | `.github/workflows/directory_writer.yml`                    | Biz "güncel değilse başarısız ol" diyoruz; orijinal CI dosyayı üretip kendisi iter   |
| `basliklar.json`                    | yok                                                         | ASCII dosya adının Türkçe görünen adı                                                |

## Kendin dene

- `arama/dogrusal_arama.py` ekle, `python3 betikler/kontrol.py` çalıştır: DIRECTORY.md "güncel değil" der.
  `python3 betikler/dizin_olustur.py` ile üret, tekrar dene.
- Bir dosyayı `Ikili-Arama.py` diye yeniden adlandır: denetleyici `AD-BUYUK` ve `AD-TIRE` bulgusu verir.
- Bir fonksiyondan tip ipucunu sil ya da içine `print()` ekle: `IC-TIP` ve `IC-YANETKI` bulgularını gör.
