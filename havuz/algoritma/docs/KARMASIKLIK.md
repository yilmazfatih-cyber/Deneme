# Karmaşıklık — büyük-O sezgisi, amortize çözümleme, ana teorem, pratik sınırlar

Bu belge "bu algoritma benim girdime yetişir mi?" sorusunu yanıtlamak içindir. Sayılar bu
makinede **ölçüldü**; nasıl ölçüldüğü her tablonun altında yazıyor.

## 1. Büyük-O sezgisi

Büyük-O, girdi büyüdükçe işin **nasıl büyüdüğünü** söyler; sabitleri ve küçük terimleri atar.
`3n² + 100n + 7` → O(n²): n iki katına çıkınca iş ~4 katına çıkar.

| Sınıf | n iki katına çıkınca | Tipik kaynak | Kütüphaneden örnek |
| --- | --- | --- | --- |
| O(1) | aynı | dizin erişimi, karma tablosu | `hash_table_open.py`, `lru_cache.py` |
| O(log n) | +1 adım | her adımda yarıya bölme | `binary_search.py`, `avl_tree.py` |
| O(n) | 2 kat | her öğeye bir kez bak | `kmp.py`, `sliding_window_max.py` |
| O(n log n) | ~2 kat | böl-yönet, sıralama, yığınla n işlem | `merge_sort.py`, `dijkstra.py` |
| O(n²) | 4 kat | iç içe iki döngü, 2B DP tablosu | `lcs.py`, `edit_distance.py` |
| O(n³) | 8 kat | üç iç içe döngü | `floyd_warshall.py`, `matrix_chain.py` |
| O(2ⁿ) | karesi | her alt küme | `subset_sum.py`, `bitmask_dp.py` (n · 2ⁿ) |
| O(n!) | patlar | her permütasyon | kaba kuvvet TSP (testlerde başvuru) |

Ayrıntılar:

- **En kötü / ortalama / beklenen:** Hızlı sıralama en kötü O(n²), rastgele pivotla *beklenen*
  O(n log n) (`quick_sort.py`). Treap ve atlama listesi *beklenen* O(log n). "Beklenen", girdiden
  değil algoritmanın kendi rastgeleliğinden gelir; kötü niyetli girdi onu bozamaz.
- **Çıktıya duyarlı:** Aralık ağacı sorgusu O(log n + k); k = yanıt sayısı (`interval_tree.py`).
- **Sözde polinom:** Sırt çantası DP'si O(n · C); C sayının **değeri**, girdi uzunluğu değil.
  C = 10¹² ise tablo kurulamaz → `branch_and_bound.py`.
- **Yer (bellek):** DP'de "yanıtın kendisini" geri izlemek için tablo saklanır (O(n · m));
  yalnız değer gerekirse iki satır yeter (`levenshtein.py` O(min(n, m))).

## 2. Amortize çözümleme

Bazı işlemler ara sıra pahalıdır ama **uzun bir dizi işlemin ortalaması** ucuzdur.

- **Dinamik dizi** (`dynamic_array.py`): dolunca iki katına büyür ve n öğe taşınır (O(n)). Ama n
  eklemede toplam taşıma n + n/2 + n/4 + … < 2n'dir; ekleme başına amortize O(1).
  *Potansiyel yöntemi:* Φ = 2·boyut − kapasite. Ucuz eklemede Φ 2 artar (gelecekteki taşımaya
  "para biriktirir"); büyütmede biriken para taşımayı öder.
- **Neden küçültme eşiği 1/4?** Yarı dolunca küçültülseydi, tam sınırda "ekle, sil, ekle, sil"
  her adımda O(n) taşıma yaptırırdı. 1/4 eşiği iki pahalı işlem arasında Θ(n) ucuz işlem bırakır.
- **Ayrık küme** (`disjoint_set.py`): yol sıkıştırma + sıraya göre birleştirme ile m işlem
  O(m · α(n)); α ters Ackermann fonksiyonudur, evrendeki her n için ≤ 4.
- **Tekdüze yığın/kuyruk** (`monotonic_stack.py`, `sliding_window_max.py`): her öğe en çok bir
  kez girip bir kez çıkar; tek tek adımlar O(n) sürebilse de toplam O(n).
- **İki işaretçi / kayan pencere:** iki dizin de yalnız ileri gider; toplam adım ≤ 2n.

## 3. Ana teorem (böl ve yönet yinelemeleri)

`T(n) = a · T(n / b) + f(n)` (a alt problem, her biri n/b boyunda, birleştirme maliyeti f(n)).
`c = log_b a` olsun:

| Durum | Koşul | Sonuç | Örnek |
| --- | --- | --- | --- |
| 1 | f(n) = O(n^(c−ε)) | T(n) = Θ(n^c) | Karatsuba: a=3, b=2 → Θ(n^1.585) |
| 2 | f(n) = Θ(n^c) | T(n) = Θ(n^c log n) | birleştirmeli sıralama: a=2, b=2, f=n → Θ(n log n) |
| 3 | f(n) = Ω(n^(c+ε)) (+ düzenlilik) | T(n) = Θ(f(n)) | T = 2T(n/2) + n² → Θ(n²) |

- İkili arama: a=1, b=2, f=1 → c=0, durum 2 → Θ(log n).
- En yakın nokta çifti (`closest_pair.py`): 2T(n/2) + O(n) → Θ(n log n).
- **Teoremin kapsamadığı:** eşit olmayan bölünmeler. Medyanların medyanı
  (`median_of_medians.py`): T(n) ≤ T(n/5) + T(7n/10) + O(n); 1/5 + 7/10 < 1 olduğundan
  tümevarımla T(n) = O(n). Hızlı sıralamanın beklenen değeri de olasılıkla çözülür.
- **Özyineleme derinliği** ayrı bir sınırdır: CPython varsayılanı 1000 çerçeve
  (`sys.getrecursionlimit()`; bu makinede ölçüldü). Bu yüzden derinliği n'ye çıkabilen
  algoritmalar burada döngüyle yazıldı (bkz. [KARARLAR.md](KARARLAR.md) K05).

## 4. Pratik sınırlar — ölçüldü

**Yöntem:** `python scripts/measure_speed.py` (her deneme `time.perf_counter` ile; 5 tekrarın en
kısası). Makine: Linux, x86_64, 4 çekirdek (paylaşımlı), Python 3.13.18. Tarih: 16 Kasım 2026.
Paylaşımlı makinede sonuçlar ±%30 oynayabilir; kendi makinenizde betiği yeniden çalıştırın.

### 4.1 Basit işlemler (1 saniyede)

| İşlem | 1 saniyede (yaklaşık) |
| --- | --- |
| `for` döngüsü + toplama | 39.5 milyon |
| liste dizinleme | 30.8 milyon |
| sözlük okuma | 26.6 milyon |
| heapq push/pop (yarı yarıya) | 2.4 milyon |
| `sorted()` (n rastgele sayı) | 4.1 milyon öğe |

### 4.2 1 saniyede yetişen n (iyimser: her adım = 1 basit işlem)

| Karmaşıklık | n (≈ 1 sn) |
| --- | --- |
| O(n) | ~30 000 000 |
| O(n log n) | ~1 450 000 |
| O(n²) | ~5 500 |
| O(n³) | ~310 |
| O(2ⁿ) | ~24 |
| O(n!) | ~10 |

Gerçek algoritma adımları birkaç işlem içerdiğinden bu sınırları **3–10'a bölün**. Aşağıdaki
gerçek ölçümler bunu doğrular.

### 4.3 Bu kütüphaneden gerçek ölçümler

| Algoritma | Girdi | Süre |
| --- | --- | --- |
| `merge_sort` | n = 100 000 rastgele sayı | 0.47 sn |
| `lis_indices` | n = 100 000 | 0.03 sn |
| `dijkstra` | n = 20 000, m = 100 000 | 0.18 sn |
| `kmp_search` | metin 1 000 000 | 0.16 sn |
| `held_karp` | n = 14 / 17 şehir | 0.12 / 0.62 sn |
| `min_cost_assignment` (bit maskeli DP) | n = 18 / 20 | 0.30 / 1.79 sn |
| `floyd_warshall` | n = 100 / 200 / 300 | 0.02 / 0.17 / 0.57 sn |
| `longest_common_subsequence` | n = 1 000 / 2 000 / 3 000 | 0.11 / 0.53 / 1.10 sn |
| `quickselect` / `median_of_medians_select` | n = 200 000 | 0.12 / 0.12 sn |
| `radix_sort` / `sorted()` / `quick_sort` | n = 200 000 tam sayı | 0.11 / 0.04 / 0.49 sn |
| `solve_sudoku` | "en zor" bilinen bulmaca | 0.06 sn |
| `factorize` (Pollard rho) | 20 tane ~10¹⁸ yarı asal, en kötü | 0.05 sn |

İlk dört satır `scripts/measure_speed.py`'nin çıktısıdır; diğerleri aynı yöntemle (tek çalıştırma,
`perf_counter`) bu oturumda ölçüldü. Ders: **yerleşik `sorted()` (C) buradaki saf Python sıralamalardan
~3–25 kat hızlıdır** (radix 0.11 sn ↔ 0.04 sn; merge_sort 100 000 öğede 0.47 sn ↔ ~0.02 sn); buradaki sıralamalar öğretmek ve başka dile taşımak içindir.

## 5. Bellek (CPython 3.13, ölçüldü)

| Nesne | Boyut |
| --- | --- |
| küçük `int` | 28 bayt (`sys.getsizeof(1)`), 2⁶⁴: 36 bayt |
| `float` | 24 bayt |
| boş `list` | 56 bayt + öğe başına 8 bayt işaretçi |
| 1 000 000 tam sayılık liste | ~40 MB (`tracemalloc`) |
| 1 000 000 girdili `dict` | ~74 MB |
| `bytearray(1 000 000)` | ~1 MB |

Sonuç: Python'da "n sayı" kabaca **40 · n bayt**. 10⁷ öğe ~400 MB demektir. Elek ve Bloom süzgeci
bu yüzden `bytearray` kullanır (`sieve.py`, `bloom_filter.py`).

## 6. Hızlı karar kuralı

1. n'yi ve süre bütçesini yazın (ör. n = 10⁵, 1 sn).
2. [NASIL_SECILIR.md](NASIL_SECILIR.md) §1 tablosundan izin verilen karmaşıklığı bulun (O(n log n)).
3. O karmaşıklıkta çözen modülü [DIZIN.md](DIZIN.md)'den seçin.
4. Emin değilseniz ölçün: `python -m timeit` ya da `scripts/measure_speed.py`'yi örnek alın.
