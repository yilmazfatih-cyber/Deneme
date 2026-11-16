# Nasıl seçilir — problem → veri yapısı / algoritma karar tabloları

Önce problemi bir cümleyle yazın ("en kısa yol, ağırlıklar pozitif"), sonra ilgili tabloda satırı
bulun. Her modülün başlığında ayrıca "Ne zaman" ve "Ne zaman değil" satırları vardır; tam liste
[DIZIN.md](DIZIN.md)'de. Sayılar için bkz. [KARMASIKLIK.md](KARMASIKLIK.md).

## 1. n şu kadarsa hangi karmaşıklık yeter? (saf Python, ~1 saniye)

Bu makinede ölçüldü (`python scripts/measure_speed.py`, ayrıntı [KARMASIKLIK.md](KARMASIKLIK.md)):
basit bir döngü adımı saniyede ~30 milyon; gerçek bir algoritma adımı (birkaç işlem, liste/sözlük
erişimi) bunun 5–10 katı pahalıdır. Aşağıdaki tablo bu payı içerir — kaba bir rehberdir.

| n en çok | Yetişen karmaşıklık | Örnek |
| --- | --- | --- |
| ~10 | O(n!) | tüm permütasyonlar (kaba kuvvet TSP) |
| ~18–20 | O(n² · 2ⁿ), O(n · 2ⁿ) | `tsp_held_karp.py`, `bitmask_dp.py` |
| ~25 | O(2ⁿ) | alt küme taraması |
| ~150–300 | O(n³) | `floyd_warshall.py`, `matrix_chain.py`, Gauss |
| ~2 000–5 000 | O(n²) | `lcs.py`, `edit_distance.py`, kaba kuvvet çiftler |
| ~200 000–1 000 000 | O(n log n) | sıralama, `dijkstra.py`, `segment_tree.py` |
| ~5 000 000+ | O(n) | `kmp.py`, `z_algorithm.py`, önek toplamı |
| 10¹⁸ (değer olarak) | O(log n) | `binary_search.py`, `matrix_power.py`, `mod_pow` |

Python yetmiyorsa önce algoritmayı (karmaşıklığı), sonra veri yapısını değiştirin; en son çare
numpy/C'dir.

## 2. En kısa yol: hangi durumda hangisi?

| Durum | Seçim | Modül |
| --- | --- | --- |
| Ağırlıksız (her adım 1) | BFS | `algoritma/graf/bfs.py` (`bfs_distances`) |
| Ağırlıklar yalnız 0 ya da 1 | 0-1 BFS (çift uçlu kuyruk) | `algoritma/graf/bfs.py` (`zero_one_bfs`) |
| Ağırlıklar ≥ 0, tek kaynak | Dijkstra | `algoritma/graf/dijkstra.py` |
| Ağırlıklar ≥ 0, tek hedef, iyi bir alt tahmin var (harita) | A* | `algoritma/graf/a_star.py` |
| Negatif ağırlık var | Bellman-Ford | `algoritma/graf/bellman_ford.py` |
| "Negatif döngü var mı?" (arbitraj) | Bellman-Ford n. tur | `algoritma/graf/bellman_ford.py` (`find_negative_cycle`) |
| Tüm çiftler, n ≲ 300 | Floyd-Warshall | `algoritma/graf/floyd_warshall.py` |
| Tüm çiftler, büyük seyrek graf | her köşeden Dijkstra | `algoritma/graf/dijkstra.py` |
| Ağaçta iki köşe arası | LCA ile uzaklık | `algoritma/graf/lca_binary_lifting.py` |
| Yönlü döngüsüz grafta (DAG) | topolojik sıra + o sırayla gevşetme | `algoritma/graf/topological_sort.py` (gevşetme 5 satır; ayrı modül yok) |
| Izgara, eşit adımlar, çok kaynak | çok kaynaklı BFS | `algoritma/kaliplar/bfs_layers.py` |

## 3. Arama ve saklama için hangi yapı?

| İhtiyaç | Yapı | Modül |
| --- | --- | --- |
| Anahtar → değer, sıra önemsiz | hash tablosu (`dict`) | `hash_table_open.py`, `hash_table_chaining.py` (öğretici) |
| Sıralı anahtarlar, en yakın küçük/büyük, aralık | dengeli ağaç | `avl_tree.py`, `treap.py`, `skip_list.py` |
| k. en küçük, "kaç tane x'ten küçük" | sıra istatistikli ağaç | `treap.py` (`kth`, `rank`) |
| Diskte/sayfalı büyük sıralı veri | B-ağacı | `b_tree.py` |
| Önek araması, otomatik tamamlama | trie | `trie.py` |
| Hep en küçüğü/büyüğü al | ikili yığın | `binary_heap.py` (gerçek kodda `heapq`) |
| Öncelik sonradan değişiyor | dizinli öncelik kuyruğu | `indexed_priority_queue.py` |
| Gruplar, "aynı grupta mı?" | ayrık küme | `disjoint_set.py` |
| Dizi değişiyor, önek/aralık toplamı | Fenwick ağacı | `fenwick_tree.py` |
| Aralığa güncelleme + aralık toplam/min | tembel segment ağacı | `segment_tree.py` |
| Dizi değişmiyor, aralık min/max/ebob O(1) | seyrek tablo | `sparse_table.py` |
| "Şu aralıkla çakışanlar hangileri?" | aralık ağacı | `interval_tree.py` |
| En yakın nokta, dikdörtgen içindeki noktalar | k-d ağacı | `kd_tree.py` |
| Sabit boyutlu önbellek | LRU / LFU | `lru_cache.py`, `lfu_cache.py` |
| "Kesin yok / belki var" (az bellek) | Bloom süzgeci | `bloom_filter.py` |
| Akışta yaklaşık sıklık | count-min sketch | `count_min_sketch.py` |
| Akışta yaklaşık farklı öğe sayısı | HyperLogLog | `hyperloglog.py` |
| Aynı metinde çok sayıda desen sorgusu | sonek dizisi | `suffix_array.py`, `suffix_array_search.py` |
| FIFO / LIFO / iki uç | kuyruk / yığın / deque | `fifo_queue.py`, `stack.py`, `deque.py` |

## 4. Sıralama: hangisi?

| Durum | Seçim | Kararlı mı | Modül |
| --- | --- | --- | --- |
| Genel amaç, gerçek kod | `sorted()` (Timsort) | evet | — |
| Kararlılık + en kötü durum güvencesi | birleştirmeli | evet | `merge_sort.py` |
| Yerinde, ortalama hızlı, çok yinelenen | üç yollu hızlı | hayır | `quick_sort.py` |
| Ek bellek yok + en kötü durum güvencesi | yığın | hayır | `heap_sort.py` |
| Neredeyse sıralı ya da çok küçük | eklemeli | evet | `insertion_sort.py` |
| Küçük aralıkta tam sayı anahtar | sayma | evet | `counting_sort.py` |
| Çok sayıda sınırlı genişlikte tam sayı | taban (radix) | evet | `radix_sort.py` |
| Veri belleğe sığmıyor | dış sıralama | evet* | `external_sort.py` |
| Yalnız k. öğe / ortanca | quickselect (ortalama), BFPRT (en kötü) | — | `quickselect.py`, `median_of_medians.py` |
| Ters çevrim sayısı (sıralamaların farkı) | birleştirmeli + sayma | — | `merge_sort.py` (`count_inversions`) |

\* eşit satırlar zaten aynı metin olduğundan kararlılık burada görünmez.

## 5. Metinde arama ve karşılaştırma

| Durum | Seçim | Modül |
| --- | --- | --- |
| Tek desen, uzun metin, en kötü durum güvencesi | KMP | `kmp.py` |
| Tek desen, kısa kod | Z algoritması | `z_algorithm.py` |
| Aynı uzunlukta çok desen | Rabin-Karp | `rabin_karp.py` |
| Binlerce desen, tek geçiş | Aho-Corasick | `aho_corasick.py` |
| Aynı metinde çok sayıda sorgu | sonek dizisi | `suffix_array_search.py` |
| En uzun palindrom parça | Manacher | `manacher.py` |
| Yazım benzerliği (sayı) | Levenshtein / Damerau | `levenshtein.py` |
| "Neyi değiştirdin?" (işlemlerin kendisi) | düzenleme betiği | `edit_distance.py` |
| Satır farkı | LCS + diff | `lcs.py` |
| Ortak kesintisiz parça | en uzun ortak alt dizgi | `longest_common_substring.py` |
| Türkçe büyük/küçük harf, alfabetik sıra | yerel kurallar | `turkish_text.py` |

## 6. Sayılar

| Soru | Seçim | Modül |
| --- | --- | --- |
| n'ye kadar tüm asallar | Eratosthenes | `sieve.py` |
| Uzak bir aralıktaki asallar | parçalı elek | `sieve.py` (`segmented_primes`) |
| Tek büyük sayı asal mı? | Miller-Rabin | `miller_rabin.py` |
| Büyük sayıyı çarpanlara ayır | Pollard rho | `pollard_rho.py` |
| a·x ≡ 1 (mod m) | genişletilmiş Öklid | `modular_arithmetic.py`, `gcd.py` |
| Birden çok kalan denklemi | Çin kalan teoremi | `crt.py` |
| C(n, k) mod p, çok sorgu | faktöriyel tabloları | `combinatorics_mod.py` |
| Doğrusal yinelemenin 10¹⁸. terimi | matris üssü | `matrix_power.py` |
| Büyük çok terimli çarpımı | FFT (float) / NTT (kesin, mod) | `fft.py`, `ntt.py` |
| Doğrusal denklem, kesin | Gauss (Fraction, mod p) | `gaussian_elimination.py` |
| Aynı matrisle çok sağ taraf (float) | LU | `lu_decomposition.py` |

## 7. En iyileme: kesin mi, yaklaşık mı?

| Durum | Seçim | Modül |
| --- | --- | --- |
| Küçük tam sayı kapasite, kesin | DP sırt çantası | `algoritma/dp/knapsack.py` |
| Ondalık/büyük kapasite, kesin | dal-sınır | `branch_and_bound.py` |
| Tüm çözümleri listele | geri izleme | `n_queens.py`, `sudoku.py`, `subset_sum.py`, `backtracking_template.py` |
| Doğrusal amaç ve kısıtlar | simplex | `algoritma/cesitli/simplex.py` |
| Atama (kişi–iş), en ucuz | bit maskeli DP (n ≤ 20) / en düşük maliyetli akış | `bitmask_dp.py`, `min_cost_flow.py` |
| Gezgin satıcı n ≲ 18 / daha büyük | Held-Karp / 2-opt (+ tavlama) | `tsp_held_karp.py`, `tsp_two_opt.py` |
| İki kişilik oyun, küçük | minimax + alfa-beta | `minimax.py` |
| Büyük oyun, değerlendirme fonksiyonu yok | MCTS | `mcts.py` |
| Engebeli arama uzayı, "yeterince iyi" | tavlama / tepe tırmanma / genetik | `simulated_annealing.py`, `hill_climbing.py`, `genetic_algorithm.py` |
| Kutulara yerleştirme | FFD (kanıtlı ≤ 11/9·OPT + 6/9) | `bin_packing.py` |
| Toplantı seçimi / salon sayısı | açgözlü | `interval_scheduling.py` |

## 8. Hangi problem çözme kalıbı?

Bkz. [KALIPLAR.md](KALIPLAR.md): "ardışık parça" → kayan pencere; "sıralı dizide çift" → iki
işaretçi; "çok sayıda aralık toplamı" → önek toplamı; "sağdaki ilk büyük" → tekdüze yığın;
"en küçük yeterli değer" → yanıt üzerinde ikili arama; "en az adım" → BFS katmanları;
"gruplar birleşiyor" → birleşim-bul; "takvim" → aralık birleştirme; "sırala ve seç" → açgözlü;
"tümünü listele" → geri izleme; "kaç yolla / en iyi … öyle ki" → DP durumu.
