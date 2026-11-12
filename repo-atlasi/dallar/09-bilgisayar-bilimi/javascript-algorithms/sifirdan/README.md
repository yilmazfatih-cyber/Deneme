# Sıfırdan: JavaScript'te temel veri yapıları ve algoritmalar

Altı modül, bağımlılık yok, testler Node'un kendi test çalıştırıcısıyla (`node:test`). Her dosyanın başında Türkçe
bir açıklama ve Büyük-O tablosu var; kodu okurken önce o yorumu oku.

## Gereksinimler

- Node.js 22 veya üstü (burada 22.23 ile denendi). `npm install` gerekmez.

## Çalıştırma ve test

```bash
cd repo-atlasi/dallar/09-bilgisayar-bilimi/javascript-algorithms/sifirdan
node --test                       # test/ altındaki *.test.js dosyalarını bulur (31 test)
node --test "test/graph.test.js"  # tek dosya
```

Not: Node 22'de `node --test <klasör>` klasörü test dosyası sanıp hata verir; ya argümansız çalıştır ya da glob ver
(`node --test "test/*.test.js"`).

Bir modülü denemek için:

```bash
node -e "import('./src/graph.js').then(({ Graph, dijkstra }) => {
  const g = new Graph().addEdge('A', 'B', 4).addEdge('B', 'C', 1).addEdge('A', 'C', 7)
  console.log(dijkstra(g, 'A').distances)
})"
```

## Modüller, kısa açıklama ve Büyük-O

| Dosya                | İçerik                                              | Ana işlemler ve karmaşıklık                                                           |
| -------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/linked-list.js` | Tek yönlü bağlı liste, baş ve kuyruk işaretçili     | `prepend`/`append`/`deleteHead` O(1); `insertAt`/`delete`/`find` O(n); `reverse` O(n) |
| `src/hash-table.js`  | Ayrı zincirleme, FNV-1a hash, 0,75'te ikiye katlama | `set`/`get`/`delete` ortalama O(1), en kötü O(n); büyüme amortize O(1)                |
| `src/heap.js`        | `MinHeap` ve FIFO eşitlikli `PriorityQueue`         | `push`/`pop` O(log n); `peek` O(1); `heapify` O(n)                                    |
| `src/trie.js`        | Önek ağacı, budamalı silme, otomatik tamamlama      | `insert`/`has`/`startsWith`/`delete` O(L); öneri O(L + alt ağaç)                      |
| `src/graph.js`       | Komşuluk listesi; BFS, DFS, Dijkstra, Kahn          | BFS/DFS/topolojik O(V + E); Dijkstra O((V + E) log V)                                 |
| `src/lru-cache.js`   | `Map` + çift yönlü liste; kısa `MapLRUCache` sürümü | `get`/`set`/`delete` O(1)                                                             |

### Neden böyle?

- **Bağlı liste:** Dizinin ortasına eklemek her şeyi kaydırır (O(n)); listede yalnızca iki işaretçi değişir. Ama i.
  elemana gitmek için baştan yürürsün. Kuyruk işaretçisi, sona eklemeyi O(1) yapar; silmede kuyruğu güncellemeyi unutmak
  en yaygın hatadır (testte var).
- **Hash tablosu:** Karakter kodlarını toplayan hash (gerçek depodaki) anagramları hep çakıştırır: `"kalem"` ve
  `"melak"` aynı kovaya düşer. FNV-1a her karakterden sonra çarptığı için sıra da hash'e girer.
- **Heap:** Ağaç işaretçisiz bir dizide durur (çocuklar `2i+1`, `2i+2`). Eşit öncelikli işler için heap kendiliğinden
  FIFO değildir; artan sıra numarası eklemek bunu çözer.
- **Trie:** Ortak önekler bir kez saklanır. Türkçe büyük/küçük harf eşitlemesi çağırana bırakıldı:
  `"IŞIK".toLowerCase()` → `"işik"` olur, doğrusu `toLocaleLowerCase('tr-TR')` ile `"ışık"`.
- **Graf:** BFS ziyaret işaretini kuyruğa eklerken koyar (aynı düğüm iki kez girmesin). DFS açık yığınla yazıldı:
  derin graflarda çağrı yığını taşmaz. Dijkstra anahtar azaltma yerine "tembel silme" kullanır; negatif ağırlıkta hata
  verir. Kahn algoritması önkoşul sıralamasının temelidir (bkz. [çalışma planı motoru](../../ossu-computer-science/sifirdan/README.md)).
- **LRU:** Map "nerede?", çift yönlü liste "en eski kim?" sorusunu O(1) yanıtlar. Baş/son nöbetçi düğümler boş liste
  ve tek eleman durumlarındaki `if`'leri siler.

## Aşamalar

1. `linked-list.js`
2. `hash-table.js`
3. `heap.js`
4. `trie.js`
5. `graph.js` (öncelik kuyruğu için `heap.js`'i kullanır)
6. `lru-cache.js`

Her aşamanın testi `test/` altında aynı adla durur; önce testi oku, sonra kodu.

## Eşleme tablosu

| Mini'deki parça                     | Gerçek depodaki karşılığı                                                                                | Fark                                                                                                                                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LinkedList`                        | `src/data-structures/linked-list/LinkedList.js`                                                          | `#private` alanlar, üreteçle gezinme, `insertAt` RangeError                                                                                                                                 |
| `HashTable`, `fnv1a`, `charCodeSum` | `src/data-structures/hash-table/HashTable.js`                                                            | FNV-1a ve yeniden boyutlandırma; orijinal sabit 32 kova + toplam                                                                                                                            |
| `MinHeap`, `PriorityQueue`          | `src/data-structures/heap/Heap.js`, `MinHeap.js`, `priority-queue/…`                                     | O(n) `heapify`; FIFO eşitlik; `changePriority` yok (tembel silme)                                                                                                                           |
| `Trie`                              | `src/data-structures/trie/Trie.js`, `TrieNode.js`                                                        | Çocuklar `Map`'te (orijinal kendi `HashTable`'ını kullanır); `wordsWithPrefix` tam kelime önerir (orijinal `suggestNextCharacters` yalnızca sonraki harfleri verir); budama ikisinde de var |
| `Graph`, `bfs`, `dfs`, `dijkstra`   | `src/data-structures/graph/` + `src/algorithms/graph/{breadth-first-search,depth-first-search,dijkstra}` | Düğüm/kenar sınıfları yok; geri çağrı kancaları yok                                                                                                                                         |
| `topologicalSort`                   | `src/algorithms/graph/topological-sorting/`                                                              | Orijinal DFS tabanlı; burada Kahn (döngüyü doğrudan raporlar)                                                                                                                               |
| `LRUCache`, `MapLRUCache`           | `src/data-structures/lru-cache/LRUCache.js`, `LRUCacheOnMap.js`                                          | İkisi de nöbetçi düğüm kullanır; orijinal düğümleri düz nesnede (`nodesMap = {}`), mini `Map`'te tutar; `set` atılan anahtarı döndürür                                                      |
| `node:test`                         | Jest 30 + Babel + %100 kapsam eşiği                                                                      | Bağımlılıksız; kapsam ölçülmüyor                                                                                                                                                            |
