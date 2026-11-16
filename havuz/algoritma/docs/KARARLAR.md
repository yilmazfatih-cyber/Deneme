# Kararlar

Her kayıt: ne seçildi, neden, hangi seçenek neden elendi. Yeni bir karar verdiğinizde sona
`K<sıradaki numara>` başlığıyla ekleyin.

## K01 — Çalışma zamanında yalnız standart kütüphane

- **Seçilen:** `algoritma/` paketi yalnız Python standart kütüphanesini içe aktarır
  (`dependencies = []`). Geliştirme araçları (pytest, hypothesis, ruff, mypy) yalnız `dev` ekstrasında.
- **Neden:** Bu temelin amacı bir modülü başka bir projeye **dosya olarak kopyalamak** ya da başka
  dile çevirmektir; dış bağımlılık kopyalamayı bozar. Algoritmaların kendisi zaten burada yazılı.
- **Elenen:** numpy (FFT, Gauss, LU için cazip ama kopyalanabilirliği ve "adımları göster"
  amacını bozar; hız gerekiyorsa README'de numpy/scipy'ye yönlendirilir).
- **Koruyan:** `tests/test_kurallar.py::test_only_stdlib_and_declared_dependencies`.

## K02 — Konu klasörleri, modül başına tek fikir, küçük yardımcılar kopyalanır

- **Seçilen:** 12 konu klasörü; her modül tek bir fikir (ör. `dijkstra.py`). Bir modül başka bir
  modüle muhtaçsa başlığındaki `Bağımlılık:` satırında yazar. Yalnız 5 modül böyledir:
  `segment_intersection.py`, `convex_hull.py`, `point_in_polygon.py` → `orientation.py`;
  `pollard_rho.py` → `miller_rabin.py`; `suffix_array_search.py` → `suffix_array.py`.
  Birkaç satırlık yardımcılar (ayrık küme, Fenwick,
  genişletilmiş Öklid, Tarjan) ihtiyaç duyan modülde **kısa bir kopya** olarak durur ve başlıkta
  asıl kaynağı anılır (`kruskal.py`, `sweep_line_intersections.py`, `two_sat.py` …).
- **Neden:** Küçük bir model bir dosyayı tek başına açtığında her şeyi orada görmeli; kopyalanan
  dosya başka dosya istememeli.
- **Elenen:** ortak bir "utils" modülü (her kopyalamada sürüklenir, döngüsel bağımlılık riski).

## K03 — Makine okunur başlık + üretilen dizin + kural testleri

- **Seçilen:** Her modül başlığı sabit alanlar taşır (`Fikir`, `Karmaşıklık`, `Ne zaman`,
  `Ne zaman değil`, `Bağımlılık`, `Genişletme`, `Örnek`; isteğe bağlı `Kararlılık`, `Özyineleme`).
  `scripts/build_index.py` başlıkları `ast` ile okuyup `docs/DIZIN.md`'yi üretir.
- **Neden:** Dizin ile kod hiç ayrışmasın; kural testi her alanı, test dosyasını, dışa açılan her
  adın testte geçmesini, dizinin güncelliğini ve belgelerde anılan dosyaların varlığını denetler.
- **Elenen:** elle tutulan dizin (eskir), modülleri içe aktararak okuma (yan etki, yavaş).

## K04 — Özellik testleri hypothesis ile, belirlenimci

- **Seçilen:** Her modülün testinde (a) elle doğrulanmış örnek, (b) kaba kuvvet ya da stdlib ile
  karşılaştıran hypothesis testi, (c) uç durumlar. Profil `derandomize=True` (aynı kod → aynı
  örnekler), hızlı denetimde 40, `--uzun`'da 300 örnek.
- **Neden:** "Testle kanıtlanmış" iddiası ancak bağımsız bir başvuruyla karşılaştırmayla anlamlı;
  belirlenimcilik, paylaşımlı makinede ve CI'da aynı sonucu verir.
- **Elenen:** yalnız sabit örnekli testler (ince hataları kaçırır), rastgele tohumlu testler
  (bir koşuda geçip ötekinde kalabilir).

## K05 — Özyinelemesiz gerçekleme tercih edildi

- **Seçilen:** Derinliği girdiyle doğrusal büyüyebilen her algoritma (DFS, Tarjan, köprüler,
  BST, birleştirmeli sıralama, Hopcroft-Karp, Dinic, Euler, ağaç DP'si …) açık yığınla yazıldı.
  Özyineleme yalnız derinliği O(log n) ya da küçük sabitle sınırlı yerlerde var ve başlıktaki
  `Özyineleme:` satırında belirtildi.
- **Neden:** CPython'un varsayılan özyineleme sınırı 1000'dir (ölçüldü: `sys.getrecursionlimit()`);
  5000 derinlikte `RecursionError` alınır. Testler bu sınırın 3–50 katı derinlikte çalıştırır.
- **Elenen:** `sys.setrecursionlimit` yükseltmek (C yığınını taşırıp süreci çökertebilir).

## K06 — Kesin aritmetik: tam sayı ve `Fraction`

- **Seçilen:** Geometri yönelim testleri, Gauss eliminasyonu ve simplex `int`/`Fraction` ile kesin;
  LU ayrışımı ve FFT bilerek `float` (sayısal yöntemleri ve tuzaklarını göstermek için), başlıkta
  sınırları yazılı; kesin karşılıkları (`gaussian_elimination.py`, `ntt.py`) ayrıca var.
- **Neden:** Kayan noktada neredeyse doğrusal noktalar yanlış yöne dönebilir; test bunu gösterir
  (`tests/geometri/test_orientation.py::test_float_pitfall_and_remedies`).

## K07 — Olasılıksal yapılarda Python `hash()` kullanılmaz

- **Seçilen:** Bloom süzgeci, count-min sketch, HyperLogLog ve tutarlı karma `hashlib.blake2b`
  kullanır.
- **Neden:** `hash(str)` süreçten sürece değişir (PYTHONHASHSEED); sonuçlar ve testler
  belirlenimci olmazdı, kaydedilen yapı başka süreçte yanlış yanıt verirdi.

## K08 — `mypy --strict`, testler dahil

- **Seçilen:** `pyproject.toml`'da `strict = true`; `files = ["algoritma", "scripts", "tests"]`.
- **Neden:** Küçük model tip imzalarından yola çıkar; test kodu da örnek kod olarak okunur.

## K09 — Modül adları stdlib'i gölgelemez

- **Seçilen:** `queue` yerine `fifo_queue.py`, `base64` yerine `base64_codec.py`. Kural testi bunu
  denetler (`test_module_name_does_not_shadow_stdlib`); üreteç de reddeder.
- **Neden:** Tek dosya başka bir projeye kopyalanınca `import queue` gibi satırlar sessizce bozulur.

## K10 — Aralık kuralları açıkça yazılı

- **Seçilen:** Dizi aralıkları her yerde yarı açık `[lo, hi)` (Python dilimleri gibi). Zaman/geometri
  aralıklarında modüle göre: `interval_tree.py` ve `interval_merging.py` KAPALI `[a, b]` (dokunanlar
  çakışır), `interval_scheduling.py` yarı açık `[başlangıç, bitiş)` (uç uca toplantılar çakışmaz).
  Her modülün başlığı kendi kuralını söyler.

## K11 — Yavaş testler ayrı

- **Seçilen:** Büyük girdili stres testleri `tests/test_yavas.py` içinde `@pytest.mark.yavas`;
  `python scripts/check.py` bunları atlar, `--uzun` koşar (ve hypothesis'i 300 örneğe çıkarır).
- **Ölçüm:** hızlı denetimin pytest adımı bu makinede ~15 sn (aşağıdaki README "Doğrulama").

## K12 — Türkçe metin kuralı

- **Seçilen:** Büyük/küçük harf dönüşümü yalnız `algoritma/dizgi/turkish_text.py` içinde
  (`upper_tr`, `lower_tr`, `casefold_tr`, `sort_key_tr`). Diğer modüllerde `.upper()`, `.lower()`,
  `.casefold()` vb. kural testiyle yasak (`test_source_hygiene`).
- **Neden:** `"i".upper()` → `"I"` (doğrusu "İ"); `"İ".lower()` iki kod noktası üretir.

## K13 — Kapsam dışı bırakılanlar

Şartnamede istenmeyen ama yakın konular bilerek eklenmedi; README "Sınırlar" bölümünde listeli:
genel (eğik) parçalar için Bentley-Ottmann, Edmonds'un çiçek algoritması (genel grafta eşleme),
Johnson (tüm çiftler, negatif kenar), sonek otomatı, HyperLogLog++ sapma tabloları.
Şartnamenin "süpürme çizgisiyle kesişim sayımı" maddesi yatay–dikey parçalar için gerçeklendi.

## K14 — Kilit dosyası

- **Seçilen:** `requirements-dev.lock` (`uv pip compile --extra dev`) geliştirme araçlarının tam
  sürümlerini sabitler; `pyproject.toml` yalnız alt sınır verir.
- **Neden:** STANDARTLAR §2 "kilit dosyası" ister; temiz kurulum aynı araç sürümleriyle yapılabilsin.
