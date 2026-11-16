# algoritma — model talimatları

## Bu temel ne yapar

Algoritmalar ve veri yapılarının çalışan, testle kanıtlanmış başvuru gerçeklemeleri (138 modül,
yalnız Python stdlib). Bir algoritmaya ihtiyacın olduğunda **ezberden yazma**: buradan al, testiyle
birlikte kopyala. Her modülün başlığı ne zaman kullanılacağını ve ne zaman kullanılmayacağını söyler.

## Komutlar

Hepsi bu klasörden; önce `uv venv .venv && uv pip install --python .venv/bin/python -e ".[dev]"`.

| Komut | Ne zaman |
| --- | --- |
| `.venv/bin/python scripts/check.py` | her değişiklikten sonra (yeşil değilse iş bitmemiştir) |
| `.venv/bin/python scripts/check.py --duzelt` | biçim/lint hatası ya da "DIZIN.md güncel değil" görünce |
| `.venv/bin/python scripts/check.py --uzun` | büyük bir değişiklikten sonra (stres testleri) |
| `.venv/bin/python -m pytest tests/graf/test_dijkstra.py -q` | tek bir modülün testleri |
| `.venv/bin/python -m pytest algoritma/graf/dijkstra.py -q` | tek bir modülün doctest'i |
| `.venv/bin/python scripts/build_index.py` | bir modül başlığını değiştirdikten sonra |
| `.venv/bin/python scripts/new_algorithm.py <konu> <ad>` | yeni algoritma eklerken (ilk adım) |
| `.venv/bin/python scripts/measure_speed.py` | hız iddiası yazmadan önce ölçmek için |

## Harita

| Şunu yapacaksan | Şuraya bak |
| --- | --- |
| hangi algoritmayı seçeceğine karar ver | `docs/NASIL_SECILIR.md`, `docs/DIZIN.md` |
| girdi boyu yetişir mi | `docs/KARMASIKLIK.md` (ölçülmüş tablolar) |
| bir problem çözme kalıbı uygula | `docs/KALIPLAR.md`, `algoritma/kaliplar/` |
| bir modülü değiştir/düzelt | `algoritma/<konu>/<ad>.py` + `tests/<konu>/test_<ad>.py` |
| kural testleri (başlık, test, dizin, hijyen) | `tests/test_kurallar.py` |
| graf testlerinin kaba kuvvet yardımcıları | `tests/graf/helpers.py` |
| rastgeleliği tam denetleyen sahte kaynak | `tests/rastgele/scripted_random.py` |
| yavaş stres testleri | `tests/test_yavas.py` |
| hypothesis ayarları (örnek sayısı, tohum) | `tests/conftest.py` |
| neden böyle yapıldı | `docs/KARARLAR.md` |

## Değişmez kurallar

1. Çalışma zamanında yalnız stdlib; başka modüle bağımlılık başlıkta `Bağımlılık:` satırında yazılı
   → `test_only_stdlib_and_declared_dependencies`.
2. Her modül başlığında `Fikir` (3–8 satır), `Karmaşıklık` (içinde `O(`), `Ne zaman`, `Ne zaman değil`,
   `Bağımlılık`, `Genişletme`, `Örnek` (çalışan `>>>`) var → `test_header_has_required_fields`,
   `test_idea_section_is_three_to_eight_lines`, doctest'ler.
3. Her modülün `tests/<konu>/test_<ad>.py` dosyası var ve dışa açılan HER adı anıyor
   → `test_module_has_test_that_mentions_public_names`.
4. `docs/DIZIN.md` üretilir, elle düzenlenmez → `test_index_is_up_to_date`.
5. Modül adı stdlib modülü adı olamaz (`queue` değil `fifo_queue`) → `test_module_name_does_not_shadow_stdlib`.
6. `.upper()`/`.lower()`/`.casefold()` yalnız `turkish_text.py`'de; başka yerde `upper_tr`/`lower_tr`
   → `test_source_hygiene`.
7. Küresel `random` yok; rastgelelik `rng: random.Random` parametresiyle → `test_source_hygiene`.
8. `TODO`, `FIXME`, `DOLDUR`, `NotImplementedError` yok; modül ≤ 400 satır → `test_source_hygiene`.
9. Belgelerde ve başlıklarda anılan dosyalar gerçekten var → `test_documents_reference_existing_files`,
   `test_headers_reference_existing_files`.
10. Görünmez/birleşen karakter kaynakta yazılmaz, kaçış dizisi kullanılır (`"s\u0327"` metni)
    → `test_no_invisible_characters`.
11. `mypy --strict` testler dahil temiz; ruff (satır ≤ 100) temiz → `scripts/check.py`.
12. Test dosyası başka bir test dosyasından içe aktarmaz; ortak kaba kuvvet `tests/graf/helpers.py`
    gibi yardımcıda durur → `test_tests_do_not_import_other_tests`.

## Tarifler

### 1. Yeni algoritma ekle (kaba kuvvet testiyle)

1. `.venv/bin/python scripts/new_algorithm.py <konu> <ad>` (ad: İngilizce, küçük harf, alt çizgi).
2. `algoritma/<konu>/<ad>.py` içindeki her `DOLDUR`'u doldur. Örnek başlık için
   `algoritma/graf/dijkstra.py`'yi aç ve aynı alanları aynı sırayla yaz.
3. ÖNCE testi yaz: `tests/<konu>/test_<ad>.py` içinde `_brute_force` (en basit, apaçık doğru
   çözüm: tüm olasılıkları dene) + elle hesaplanmış bir örnek + uç durumlar (boş, tek öğe,
   yinelenen, negatif, büyük değer) + `@given` ile karşılaştırma. Kaba kuvvet yavaşsa hypothesis
   girdilerini küçük tut (`max_size=8` gibi).
4. Derinliği n'ye çıkabilecek özyineleme yazma; açık yığın kullan (örnek: `algoritma/graf/dfs.py`).
5. `.venv/bin/python scripts/check.py --duzelt` (dizini de üretir), sonra `scripts/check.py` yeşil olana dek düzelt.

### 2. Var olan bir algoritmadaki hatayı düzelt

1. Hatayı gösteren en küçük girdiyi bul; ilgili test dosyasına `test_hand_checked_example` içine
   ya da yeni bir test olarak ekle; testin KIRMIZI olduğunu gör.
2. Kodu düzelt; kaba kuvvet testini gevşetme (STANDARTLAR §5).
3. `scripts/check.py`.

### 3. Bir algoritmayı başka bir projeye kopyala

1. Modül dosyasını kopyala (ör. `algoritma/graf/dijkstra.py` → `projem/dijkstra.py`).
2. Başlıktaki `Bağımlılık:` "yok" değilse oradaki dosyayı da kopyala ve `from algoritma.<konu>.<ad>`
   satırını yeni yola göre değiştir.
3. Test dosyasını da kopyala ve içe aktarma satırlarını düzelt. Test `tests.graf.helpers` ya da
   `tests.rastgele.scripted_random`'dan bir şey alıyorsa o yardımcı dosyayı da kopyala (yalnız
   stdlib + hypothesis kullanır; dijkstra testi `helpers.py`'ye bağlı). hypothesis yoksa
   `pip install hypothesis` ya da `@given` testlerini silmek yerine birkaç sabit örneğe çevir.
4. Projede çalıştır: `python -m pytest projem/test_dijkstra.py`.

### 4. TypeScript'e (ya da başka dile) çevir — test vektörlerini taşıyarak

1. Python sürümünden test vektörleri üret ve JSON'a yaz (girdi + beklenen çıktı; kaba kuvvetle
   doğrulanmış): ör. `tests/graf/test_dijkstra.py`'deki stratejilerden 200 rastgele girdi üretip
   `json.dump` ile kaydeden küçük bir betik yaz (tohum sabit).
2. TS tarafında aynı JSON'u okuyan bir `node:test` testi yaz; önce testi çalıştır (kırmızı), sonra çevir.
3. Çeviride bilinen tuzaklar (bunlar ince hatalara yol açar; aşağıdaki JS çıktıları node 22 ile
   denendi):
   - Python `//` ve `%` negatif sayıda aşağı yuvarlar; JS `%` işaret korur (`-7 % 3` → `-1`,
     Python'da `2`) → `((a % m) + m) % m`, `Math.floor(a / b)`; `(a / b) | 0` sıfıra doğru keser
     (`-3.5` → `-3`).
   - Python tam sayıları sınırsız; JS `number` 2⁵³'te kesinliğini yitirir → `BigInt`
     (`mod_pow`, `ntt`, `miller_rabin`, `crc32` gibi modüllerde şart; `crc32` için `>>> 0`).
   - JS `array.sort()` varsayılan olarak SÖZLÜK sırasıyla sıralar (`[10, 9].sort()` → `[10, 9]`);
     her zaman karşılaştırıcı verin: `(a, b) => a - b`.
   - JS dizgileri UTF-16'dır: `"😀".length === 2`; Python'da 1. Kod noktası gerekiyorsa `Array.from(s)`.
   - Türkçe büyük/küçük harf: `toLocaleUpperCase('tr-TR')`; `turkish_text.py` testleriyle doğrula.
   - `heapq` karşılığı yok: `binary_heap.py`'yi çevirin; `dict` yerine `Map` (anahtar sırası ve tipleri korunur).
   - Özyineleme sınırları farklıdır; buradaki özyinelemesiz yapıyı koruyun.
4. Tüm vektörler geçince bitti.

### 5. Bir modülün başlığını/belgesini değiştir

1. Başlıkta alan adlarını (`Karmaşıklık:` …) değiştirme; değerleri değiştir.
2. `.venv/bin/python scripts/build_index.py`; hız iddiası yazdıysan önce ölç (`perf_counter`) ve
   ölçümü başlığa "Ölçüm:" diye yaz.

### 6. Yeni bir problem çözme kalıbı ekle

`docs/KALIPLAR.md` sonundaki "Yeni kalıp eklemek" bölümünü izle; problem metinlerini kendin yaz.

## Sık yapılan hatalar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| `docs/DIZIN.md güncel değil` | başlık değişti, dizin üretilmedi | `scripts/build_index.py` |
| `… şu adlar testte hiç geçmiyor` | yeni dışa açık işlev testsiz | testte o adı çağır ya da adı `_` ile başlat |
| `yerel ayarı bilmez (i → İ hatası)` | `.upper()`/`.lower()` kullanıldı | `turkish_text.upper_tr` / `lower_tr` |
| `küresel random durumu kullanılıyor` | `random.randint(...)` | işleve `rng: random.Random` parametresi ekle |
| `RecursionError` büyük girdide | özyinelemeli DFS/ağaç gezintisi | açık yığına çevir (`dfs.py` örneği) |
| hypothesis testi çok yavaş / zaman aşımı | kaba kuvvet üstel, girdiler büyük | stratejide `max_size`/sınırları küçült; bkz. `tests/dp/test_digit_dp.py` notu |
| doctest başarısız: beklenen ile gelen farklı | örnek çıktı elle yanlış yazılmış | çıktıyı bağımsız bir yolla doğrula, sonra düzelt (rastgele tohumlu örneklerde gerçek çıktıyı kullan) |
| `E501 Line too long` | satır > 100 | başlıkta girintili devam satırı kullan (`    ` ile başla) |
| `mypy: Need type annotation` | boş liste/sözlük | `found: list[int] = []` |
| `görünmez/birleşen karakter` | kaynakta U+0307 gibi bir karakter | karakter yerine `\u0307` kaçış dizisini metin olarak yaz |

## Bitti tanımı

- [ ] `.venv/bin/python scripts/check.py` yeşil (ruff, biçim, mypy --strict, pytest).
- [ ] Yeni/değişen her modülün başlığı tam; `Örnek` doctest'i çalışıyor.
- [ ] Testte: elle doğrulanmış örnek + uç durumlar + kaba kuvvet/stdlib ile karşılaştıran özellik testi.
- [ ] `docs/DIZIN.md` yeniden üretildi; gerekiyorsa `docs/NASIL_SECILIR.md` tablosuna satır eklendi.
- [ ] Hız/kalite iddiası varsa ölçüldü ve nasıl ölçüldüğü yazıldı.
- [ ] Yetişmeyen bir şey varsa README "Sınırlar" bölümüne yazıldı.
