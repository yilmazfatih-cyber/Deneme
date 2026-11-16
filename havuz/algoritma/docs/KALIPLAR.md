# Problem çözme kalıpları

Yeni bir problemle karşılaşınca önce **hangi kalıba benzediğini** sorun. Her kalıbın modülünde:
ne zaman akla gelmeli, kopyalanacak iskelet işlev (`İSKELET` diye işaretli) ve bu kütüphane için
yazılmış özgün 2–3 örnek problem + çözüm + kaba kuvvetle karşılaştıran test vardır.

| Kalıp | Akla getiren işaretler | Modül | Örnek problemler |
| --- | --- | --- | --- |
| İki işaretçi | sıralı dizi, "çift/üçlü bul", yerinde ayıkla | `two_pointers.py` | hediye çeki (iki ürün), koşu ikilileri, fatura tekilleştirme |
| Kayan pencere | "ardışık", "en uzun/en kısa parça", "son k gün" | `sliding_window.py` | kampanya kategorileri, bisiklet enerjisi, fırın satışları |
| Önek toplamı | çok aralık toplamı, "toplamı k olan parça sayısı", aralığa ekle | `prefix_sum.py` | kasa değişimleri, pansiyon doluluğu, tarla verimi (2B) |
| Tekdüze yığın | "sağdaki ilk büyük", "görüş engellenene dek", en büyük dikdörtgen | `monotonic_stack.py` | cadde binaları, raf afişi, dönem minimumları toplamı |
| Yanıt üzerinde ikili arama | "en büyüğün en küçüğü", "en az kapasite" | `binary_search_answer.py` | kitap çevirmenleri, cankurtaran kuleleri, tahta kesme |
| BFS katmanları | "en az adım", yayılma, en yakın kaynak | `bfs_layers.py` | metro istasyonu uzaklığı, eski asansör, sınıfta grip |
| Birleşim-bul | bağlantılar sırayla ekleniyor, gruplar, gereksiz bağlantı | `union_find_applications.py` | kuruyan göl adaları, köy kabloları, müşteri kayıtları |
| Aralık birleştirme | takvim, çakışan aralıklar, ortak boşluk | `interval_merging.py` | doktor takvimi, ekip boş saatleri, asfalt uzunluğu |
| Açgözlü + değişim argümanı | "sırala ve seç", tek ölçüt | `greedy_exchange.py` | berber sırası, son günlü işler, baharat karışımı |
| Geri izleme | "tümünü listele", permütasyon/kombinasyon, bulmaca | `backtracking_template.py` | küs konuklar, kafe siparişleri, dengeli etiketler |
| DP durumu tasarlama | "kaç yolla", "en iyi … öyle ki komşular …" | `dp_state_design.py` | kırık merdiven, tabela boyama, mevsimlik işçi |

## Kalıplar arasındaki sık karışıklıklar

- **Kayan pencere mi, önek toplamı mı?** Değerler negatif olabiliyorsa pencere "daraltınca
  toplam azalır" varsayımı bozulur → önek toplamı + sözlük (`prefix_sum.py`
  `count_subarrays_with_sum`).
- **Açgözlü mü, DP mi?** Küçük girdide kaba kuvvetle karşılaştırın. 0/1 sırt çantası, ağırlıklı
  aralık seçimi, kanonik olmayan madeni para → açgözlü YANLIŞ, DP gerekir
  (`algoritma/dp/knapsack.py`, `algoritma/dp/coin_change.py`).
- **Geri izleme mi, DP mi?** Yalnız sayı ya da en iyi değer isteniyorsa ve alt problemler
  örtüşüyorsa DP; tüm çözümlerin listesi isteniyorsa geri izleme.
- **BFS mi, Dijkstra mı?** Adımlar eşit maliyetliyse BFS; değilse Dijkstra; yalnız 0/1 ise 0-1 BFS
  (`algoritma/graf/bfs.py`).
- **Tekdüze yığın mı, tekdüze kuyruk mu?** Her öğe için en yakın büyük/küçük → yığın; sabit bir
  pencerenin en büyüğü → kuyruk (`algoritma/cesitli/sliding_window_max.py`).

## Yeni kalıp eklemek

`python scripts/new_algorithm.py kaliplar <ad>` → başlığa "Kalıp — …" yazın, bir `İSKELET` işlevi
ve en az iki özgün örnek problem ekleyin (problem metni docstring'de, başka sitelerden kopyalamayın),
testte her birini kaba kuvvetle karşılaştırın, sonra bu tabloya bir satır ekleyin (kural testi
`test_every_pattern_is_in_kaliplar_doc` bunu ister).
