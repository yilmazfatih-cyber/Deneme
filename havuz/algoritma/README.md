# algoritma — algoritmalar ve veri yapıları kütüphanesi

Klasik bilgisayar bilimi müfredatının **çalışan, testle kanıtlanmış, Türkçe açıklamalı** hâli:
138 modül, 12 konu. Her modül tek bir fikri anlatır, yalnız Python standart kütüphanesini kullanır
ve tek başına kopyalanabilir. Her gerçekleme bir başvuru gerçeklemesiyle (kaba kuvvet ya da
stdlib) karşılaştırılarak sınanır. Öncelik sırası: **doğruluk > okunaklılık > hız**.

Kimin için: bir algoritmaya ihtiyaç duyan küçük bir dil modeli (ezberden ince hatalarla yazmak
yerine buradan alır) ve "bu nasıl çalışıyor?" diye açıp okumak isteyen insan.

## 5 dakikada çalıştırma

Bu klasörün içinden (Python ≥ 3.11 ve `uv` kurulu olmalı):

```bash
uv venv .venv
uv pip install --python .venv/bin/python -e ".[dev]"
.venv/bin/python scripts/check.py          # ruff + biçim + mypy --strict + pytest (~20 sn)
```

Kilit dosyasındaki tam sürümlerle kurmak için ikinci satır yerine:
`uv pip install --python .venv/bin/python -r requirements-dev.lock -e .`

Bir modülü denemek:

```bash
.venv/bin/python -c "from algoritma.graf.dijkstra import shortest_path; print(shortest_path([[(1, 4), (2, 1)], [(3, 1)], [(1, 2), (3, 5)], []], 0, 3))"
# (4, [0, 2, 1, 3])
```

## Neler var

| Konu | Klasör | Modül | Örnekler |
| --- | --- | --- | --- |
| Veri yapıları | `algoritma/veri_yapilari/` | 28 | dinamik dizi, bağlı listeler, hash tabloları, ikili yığın, dizinli öncelik kuyruğu, BST, AVL, treap, B-ağacı, trie, ayrık küme, tembel segment ağacı, Fenwick, seyrek tablo, atlama listesi, aralık ağacı, k-d ağacı, LRU/LFU, Bloom, count-min, HyperLogLog, sonek dizisi + LCP |
| Sıralama ve arama | `algoritma/siralama/` | 10 | eklemeli, birleştirmeli (+ ters çevrim), üç yollu hızlı, yığın, sayma, taban; ikili arama çeşitleri, quickselect, medyanların medyanı, dış sıralama |
| Graf | `algoritma/graf/` | 22 | BFS/0-1 BFS, DFS, topolojik sıra, bileşenler, Tarjan/Kosaraju, köprü/eklem, Dijkstra, Bellman-Ford, Floyd-Warshall, A*, Kruskal, Prim, Dinic, Hopcroft-Karp, en düşük maliyetli akış, LCA, Euler, 2-SAT, Held-Karp, 2-opt |
| Dinamik programlama | `algoritma/dp/` | 11 | LIS, LCS + diff, düzenleme betiği, sırt çantası (3 tür), para üstü, matris zinciri, aralık DP, bit maskesi, basamak DP, ağaç DP, tekdüze kuyruk — hepsi **yanıtın kendisini** geri izler |
| Dizgi | `algoritma/dizgi/` | 9 | KMP, Z, Rabin-Karp, Aho-Corasick, Manacher, Levenshtein + Damerau, en uzun ortak alt dizgi, sonek dizisiyle arama, **Türkçe metin** (doğru büyük/küçük harf, alfabe sırası, NFC) |
| Sayılar ve cebir | `algoritma/sayilar/` | 12 | EBOB/Öklid, modüler üs/ters, ÇKT, elekler, Miller-Rabin, Pollard rho, C(n,k) mod p, matris üssü, FFT, NTT, Gauss (kesirli/modüler), LU |
| Rastgelelik | `algoritma/rastgele/` | 4 | Fisher-Yates, rezervuar (düz/ağırlıklı), takma ad yöntemi, tutarlı karma |
| Geometri | `algoritma/geometri/` | 7 | yönelim (+ kayan nokta tuzağı), parça kesişimi, dışbükey örtü, alan + Pick, çokgende nokta, en yakın çift, süpürme çizgisi |
| Arama ve en iyileme | `algoritma/eniyileme/` | 9 | N vezir, sudoku, alt küme toplamı, dal-sınır, minimax + alfa-beta, MCTS, tavlama, tepe tırmanma, genetik algoritma |
| Sıkıştırma ve kodlama | `algoritma/kodlama/` | 8 | RLE, Huffman, LZ77, LZW, Base64, varint, CRC32, Hamming (8,4) |
| Çeşitli | `algoritma/cesitli/` | 7 | aralık zamanlama, akıştan ortanca, en sık k, kayan pencere en büyüğü, Merkle ağacı, simplex, kutu paketleme |
| Problem çözme kalıpları | `algoritma/kaliplar/` | 11 | iki işaretçi, kayan pencere, önek toplamı, tekdüze yığın, yanıt üzerinde ikili arama, BFS katmanları, birleşim-bul, aralık birleştirme, açgözlü değişim, geri izleme, DP durumu |

Tam liste (ad, dosya, karmaşıklık, ne zaman): [docs/DIZIN.md](docs/DIZIN.md) — betikle üretilir.

Her modülün başlığında aynı alanlar var: **Fikir**, **Karmaşıklık**, **Ne zaman**, **Ne zaman
değil**, **Bağımlılık**, **Genişletme** ve çalıştırılan bir **Örnek** (doctest).

## Nasıl kullanılır

- **Paket olarak:** `from algoritma.veri_yapilari.treap import Treap`.
- **Tek dosya kopyalayarak:** modül dosyasını projenize kopyalayın; başlığındaki `Bağımlılık:` satırı
  "yok" değilse oradaki dosyayı da alın. Testini de kopyalayın. Ayrıntı: [AGENTS.md](AGENTS.md).
- **Seçim yaparken:** [docs/NASIL_SECILIR.md](docs/NASIL_SECILIR.md) (problem → yapı/algoritma
  tabloları), [docs/KARMASIKLIK.md](docs/KARMASIKLIK.md) (büyük-O, ölçülmüş pratik sınırlar),
  [docs/KALIPLAR.md](docs/KALIPLAR.md) (problem çözme kalıpları).

## Komutlar

| Komut | Ne yapar |
| --- | --- |
| `.venv/bin/python scripts/check.py` | hızlı denetim: ruff, biçim, mypy --strict, pytest (yavaşlar hariç) |
| `.venv/bin/python scripts/check.py --uzun` | yavaş stres testleri + 300 örnekli özellik testleri |
| `.venv/bin/python scripts/check.py --duzelt` | önce biçim/lint düzelt ve dizini yeniden üret |
| `.venv/bin/python scripts/build_index.py` | `docs/DIZIN.md`'yi modül başlıklarından üretir |
| `.venv/bin/python scripts/new_algorithm.py <konu> <ad>` | yeni modül + test iskeleti |
| `.venv/bin/python scripts/measure_speed.py` | bu makinede işlem/saniye ölçümü |

## Doğrulama

Temiz durumdan (`.venv` ve tüm önbellekler silindi, yukarıdaki iki komutla yeniden kuruldu;
Python 3.13.18) `python scripts/check.py`: ruff, ruff format, `mypy --strict` (312 dosya) ve
pytest — 1 969 test geçti: 138 doctest, 542 modül testi (179 `@given` özellik testi dahil),
1 289 kural testi (çoğu modül başına parametreli). Süre 18–21 sn; ağ bağlantısı olmayan bir ad
alanında (`unshare -n`) da yeşil. `--uzun` (9 stres testi + 300 örnekli özellik testleri):
1 978 test, ~60 sn. Ölçümler 16 Kasım 2026, paylaşımlı 4 çekirdekli Linux makinede; kendi makinenizde aynı
komutu çalıştırın.

## Sınırlar

Dürüst liste — bunlar bilerek yapılmadı ya da denenmedi:

- **Hız:** saf Python. Gerçek kodda yerleşikleri (`sorted`, `dict`, `heapq`, `bisect`,
  `zlib`, `base64`) ve gerektiğinde numpy/scipy'yi kullanın; burada amaç doğruluk ve okunaklılık.
  Ölçümler [docs/KARMASIKLIK.md](docs/KARMASIKLIK.md)'de.
- **Kapsam dışı:** genel (eğik) doğru parçaları için Bentley-Ottmann (süpürme çizgisi yalnız
  yatay–dikey parçalarda var), genel grafta en büyük eşleme (Edmonds çiçek algoritması), Johnson
  (negatif kenarlı tüm çiftler), sonek otomatı, HyperLogLog++ sapma düzeltme tabloları, Reed-Solomon.
- **Sezgiseller garanti vermez:** MCTS, tavlama, tepe tırmanma, genetik algoritma ve 2-opt tohumlu
  ve testlerde belirli örneklerde doğrulandı; başka girdide en iyiyi bulmayabilirler. MCTS
  "taş alma" oyununda 18–19 taşta 10 000 yinelemeyle doğru hamleyi bulamadı (ölçüldü, başlıkta yazılı).
- **Sayısal:** `fft.py` ve `lu_decomposition.py` kayan noktalıdır (büyük katsayı/kötü koşullu matriste
  hata yapar; başlıklarında yazılı); kesin karşılıkları `ntt.py` ve `gaussian_elimination.py`.
  `simplex.py` küçük problemler içindir (Fraction ile kesin ama yavaş; en kötü durumda üstel).
- **Özyineleme:** derinliği n'ye çıkabilen her şey döngüyle yazıldı; kalan özyinelemeler başlıkta
  `Özyineleme:` satırında listeli (çoğu O(log n) derinlik). `subset_sum.py` ve geri izleme iskeleti
  n ≳ 900'de Python sınırına takılır (zaten üstel algoritmalar).
- **Dış sıralama** yalnız UTF-8 metin satırlarını sıralar; kayıt/CSV alanına göre sıralama yok.
- **Eşzamanlılık:** hiçbir yapı iş parçacığı güvenli değildir.
- **Doğrulanmadı:** Python 3.11/3.12'de koşulmadı (yalnız 3.13.18'de); `requires-python = ">=3.11"`
  sözdizimine göre konuldu.
