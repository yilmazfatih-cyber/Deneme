# D09: 12 ayda bilgisayar bilimi derinleşmesi

> Bu dosya `plan_yaz.py` ile `turkce-12-ay.json` verisinden üretildi; elle düzenleme, yeniden üret.
> Haftalık bütçe 15 saat · aynı anda en fazla 2 ders (kulvarlar: matematik-sistem, algoritma) · başlangıç 4 Ocak 2027.
> İlerlemeyi kutuları işaretleyerek izle ve `coding-interview-university/sifirdan/ilerleme.py` ile say.

## Özet

- Zorunlu: 755 saat, 52. haftada biter (27 Aralık 2027 haftası).
- Seçmeli: 170 saat; zorunlulardan sonra başlar, plan toplam 64 hafta sürer.
- Saatler tahmindir; iki hafta üst üste geride kalırsan haftalık saati değil kapsamı küçült.

## Sıra ve takvim

| #   | Ders                          | Saat | Önkoşullar                    | Kulvar           | Hafta |
| --- | ----------------------------- | ---- | ----------------------------- | ---------------- | ----- |
| 1   | `missing-semester`            | 24   | -                             | matematik-sistem | 1-4   |
| 2   | `python-tekrar`               | 24   | -                             | algoritma        | 1-4   |
| 3   | `buyuk-o`                     | 12   | python-tekrar                 | algoritma        | 5-6   |
| 4   | `math-for-cs`                 | 65   | python-tekrar                 | matematik-sistem | 5-12  |
| 5   | `dogrusal-yapilar`            | 40   | buyuk-o                       | algoritma        | 7-12  |
| 6   | `algoritma-deposu`            | 16   | python-tekrar                 | algoritma        | 12-14 |
| 7   | `ag`                          | 64   | missing-semester              | matematik-sistem | 12-20 |
| 8   | `siralama-arama`              | 24   | dogrusal-yapilar              | algoritma        | 15-18 |
| 9   | `agaclar`                     | 30   | dogrusal-yapilar              | algoritma        | 19-22 |
| 10  | `nand2tetris-1`               | 60   | python-tekrar                 | matematik-sistem | 21-28 |
| 11  | `graflar`                     | 30   | agaclar                       | algoritma        | 23-26 |
| 12  | `ozyineleme-dp`               | 30   | siralama-arama                | algoritma        | 27-30 |
| 13  | `ostep`                       | 80   | nand2tetris-1                 | matematik-sistem | 29-38 |
| 14  | `algo-1`                      | 48   | math-for-cs, siralama-arama   | algoritma        | 31-37 |
| 15  | `algo-2`                      | 48   | algo-1, graflar               | algoritma        | 38-43 |
| 16  | `sistem-tasarimi`             | 60   | ag, dogrusal-yapilar          | matematik-sistem | 39-46 |
| 17  | `soru-pratigi`                | 60   | graflar, ozyineleme-dp        | algoritma        | 44-49 |
| 18  | `bitirme`                     | 40   | sistem-tasarimi, soru-pratigi | algoritma        | 50-52 |
| 19  | `cs-notes-secmeler` (seçmeli) | 20   | sistem-tasarimi               | matematik-sistem | 53-54 |
| 20  | `veritabanlari` (seçmeli)     | 60   | python-tekrar                 | matematik-sistem | 54-58 |
| 21  | `nand2tetris-2` (seçmeli)     | 90   | nand2tetris-1                 | matematik-sistem | 58-64 |

## Aylara göre

| Ay  | Takvim       | Hafta | Odak (saat)                                                           |
| --- | ------------ | ----- | --------------------------------------------------------------------- |
| 1   | Ocak 2027    | 1-4   | missing-semester (24), python-tekrar (24)                             |
| 2   | Şubat 2027   | 5-8   | math-for-cs (33), buyuk-o (12), dogrusal-yapilar (15)                 |
| 3   | Mart 2027    | 9-13  | math-for-cs (32), dogrusal-yapilar (25), ag (9), algoritma-deposu (9) |
| 4   | Nisan 2027   | 14-17 | ag (30,5), algoritma-deposu (7), siralama-arama (22,5)                |
| 5   | Mayıs 2027   | 18-22 | ag (24,5), siralama-arama (1,5), agaclar (30), nand2tetris-1 (19)     |
| 6   | Haziran 2027 | 23-26 | nand2tetris-1 (30), graflar (30)                                      |
| 7   | Temmuz 2027  | 27-30 | nand2tetris-1 (11), ozyineleme-dp (30), ostep (19)                    |
| 8   | Ağustos 2027 | 31-35 | ostep (37,5), algo-1 (37,5)                                           |
| 9   | Eylül 2027   | 36-39 | ostep (23,5), algo-1 (10,5), algo-2 (18,5), sistem-tasarimi (7,5)     |
| 10  | Ekim 2027    | 40-43 | sistem-tasarimi (30,5), algo-2 (29,5)                                 |
| 11  | Kasım 2027   | 44-48 | sistem-tasarimi (22), soru-pratigi (53)                               |
| 12  | Aralık 2027  | 49-52 | soru-pratigi (7), bitirme (40)                                        |
| 13  | Ocak 2028    | 53-57 | cs-notes-secmeler (20), veritabanlari (55)                            |
| 14  | Şubat 2028   | 58-61 | veritabanlari (5), nand2tetris-2 (55)                                 |
| 15  | Mart 2028    | 62-64 | nand2tetris-2 (35)                                                    |

## Dersler

- `missing-semester`: [The Missing Semester: kabuk, Git, betik, hata ayıklama (OSSU CS Tools)](https://missing.csail.mit.edu/)
- `python-tekrar`: [Python tekrarı: G3 kontrol listesi + Python-100-Days 1-20. gün seçmeleri](../../python-100-days/README.md) — Python'u yeni bitirdiysen atla; hiç bilmiyorsan yerine OSSU Intro CS (112 saat) koy.
- `buyuk-o`: [Büyük-O ve asimptotik analiz (CIU)](../../coding-interview-university/README.md)
- `dogrusal-yapilar`: [Dizi, bağlı liste, yığın, kuyruk, hash tablosu (CIU) + JS minisi](../../javascript-algorithms/sifirdan/README.md)
- `algoritma-deposu`: [Algoritma deposu iskeleti: doctest, DIRECTORY.md, kural denetimi](../../thealgorithms-python/sifirdan/README.md)
- `siralama-arama`: [Sıralama, ikili arama, bit işlemleri (CIU)](../../coding-interview-university/README.md)
- `agaclar`: [Ağaçlar: ikili arama ağacı, heap ve öncelik kuyruğu, trie (CIU)](../../coding-interview-university/README.md)
- `graflar`: [Graflar: BFS, DFS, topolojik sıralama, Dijkstra (CIU)](../../coding-interview-university/README.md)
- `ozyineleme-dp`: [Özyineleme ve dinamik programlama (CIU)](../../coding-interview-university/README.md)
- `math-for-cs`: [Mathematics for Computer Science (OSSU, MIT 6.042J)](https://openlearninglibrary.mit.edu/courses/course-v1:OCW+6.042J+2T2019/about) — OSSU'da önkoşulu Calculus 1C; burada bilerek gevşetildi (ayrık matematik için lise matematiği yeterli başlangıç).
- `algo-1`: [Algorithms: Design and Analysis, Part 1 (OSSU)](https://www.edx.org/learn/algorithms/stanford-university-algorithms-design-and-analysis-part-1)
- `algo-2`: [Algorithms: Design and Analysis, Part 2 (OSSU)](https://www.edx.org/learn/algorithms/stanford-university-algorithms-design-and-analysis-part-2)
- `soru-pratigi`: [Kodlama sorusu pratiği: konu başına 2-3 soru, önce kâğıtta (CIU)](../../coding-interview-university/README.md)
- `ag`: [Computer Networking: a Top-Down Approach + Wireshark lab'leri (OSSU)](https://gaia.cs.umass.edu/kurose_ross/online_lectures.htm)
- `nand2tetris-1`: [Nand to Tetris Part I (OSSU)](https://www.nand2tetris.org/) — OSSU'daki önkoşul 'C benzeri bir dil'; projeleri Python ile yazmak yeterli.
- `ostep`: [OSTEP temel yaklaşım: kitap + bölüm sonu ödevleri (OSSU, ~80 saat)](https://pages.cs.wisc.edu/~remzi/OSTEP/) — OSSU'da önkoşulu Nand2Tetris Part II; zaman kazanmak için Part I ile yetiniliyor.
- `sistem-tasarimi`: [System Design Primer + yapı taşı minileri + Anki](../../system-design-primer/nasil-calisilir.md)
- `bitirme`: [Bitirme: testli kısa link servisi (base62, hız sınırlama, LRU, tutarlı hash)](../../system-design-primer/sifirdan/README.md)
- `cs-notes-secmeler`: [CS-Notes seçmeleri (Çince, çeviri iş akışıyla): önbellek, dağıtık sistemler](../../cs-notes/README.md)
- `veritabanlari`: [Databases: Modeling, SQL, Semistructured (OSSU, 3 x 2 hafta)](https://www.edx.org/learn/relational-databases/stanford-university-databases-relational-databases-and-sql)
- `nand2tetris-2`: [Nand to Tetris Part II (OSSU)](https://www.coursera.org/learn/nand2tetris2) — Coursera: Temmuz 2025'ten beri ücretsiz izleme büyük ölçüde kalktı (OSSU FAQ).

## Haftalık kontrol listesi

### 1. hafta · 4 Ocak 2027

- [ ] The Missing Semester: kabuk, Git, betik, hata ayıklama (OSSU CS Tools) — 7,5 saat
- [ ] Python tekrarı: G3 kontrol listesi + Python-100-Days 1-20. gün seçmeleri — 7,5 saat

### 2. hafta · 11 Ocak 2027

- [ ] The Missing Semester: kabuk, Git, betik, hata ayıklama (OSSU CS Tools) — 7,5 saat
- [ ] Python tekrarı: G3 kontrol listesi + Python-100-Days 1-20. gün seçmeleri — 7,5 saat

### 3. hafta · 18 Ocak 2027

- [ ] The Missing Semester: kabuk, Git, betik, hata ayıklama (OSSU CS Tools) — 7,5 saat
- [ ] Python tekrarı: G3 kontrol listesi + Python-100-Days 1-20. gün seçmeleri — 7,5 saat

### 4. hafta · 25 Ocak 2027

- [ ] The Missing Semester: kabuk, Git, betik, hata ayıklama (OSSU CS Tools) — 1,5 saat (biter)
- [ ] Python tekrarı: G3 kontrol listesi + Python-100-Days 1-20. gün seçmeleri — 1,5 saat (biter)

### 5. hafta · 1 Şubat 2027

- [ ] Mathematics for Computer Science (OSSU, MIT 6.042J) — 7,5 saat
- [ ] Büyük-O ve asimptotik analiz (CIU) — 7,5 saat

### 6. hafta · 8 Şubat 2027

- [ ] Mathematics for Computer Science (OSSU, MIT 6.042J) — 10,5 saat
- [ ] Büyük-O ve asimptotik analiz (CIU) — 4,5 saat (biter)

### 7. hafta · 15 Şubat 2027

- [ ] Mathematics for Computer Science (OSSU, MIT 6.042J) — 7,5 saat
- [ ] Dizi, bağlı liste, yığın, kuyruk, hash tablosu (CIU) + JS minisi — 7,5 saat

### 8. hafta · 22 Şubat 2027

- [ ] Mathematics for Computer Science (OSSU, MIT 6.042J) — 7,5 saat
- [ ] Dizi, bağlı liste, yığın, kuyruk, hash tablosu (CIU) + JS minisi — 7,5 saat

### 9. hafta · 1 Mart 2027

- [ ] Mathematics for Computer Science (OSSU, MIT 6.042J) — 7,5 saat
- [ ] Dizi, bağlı liste, yığın, kuyruk, hash tablosu (CIU) + JS minisi — 7,5 saat

### 10. hafta · 8 Mart 2027

- [ ] Mathematics for Computer Science (OSSU, MIT 6.042J) — 7,5 saat
- [ ] Dizi, bağlı liste, yığın, kuyruk, hash tablosu (CIU) + JS minisi — 7,5 saat

### 11. hafta · 15 Mart 2027

- [ ] Mathematics for Computer Science (OSSU, MIT 6.042J) — 7,5 saat
- [ ] Dizi, bağlı liste, yığın, kuyruk, hash tablosu (CIU) + JS minisi — 7,5 saat

### 12. hafta · 22 Mart 2027

- [ ] Mathematics for Computer Science (OSSU, MIT 6.042J) — 9,5 saat (biter)
- [ ] Dizi, bağlı liste, yığın, kuyruk, hash tablosu (CIU) + JS minisi — 2,5 saat (biter)
- [ ] Computer Networking: a Top-Down Approach + Wireshark lab'leri (OSSU) — 1,5 saat
- [ ] Algoritma deposu iskeleti: doctest, DIRECTORY.md, kural denetimi — 1,5 saat

### 13. hafta · 29 Mart 2027

- [ ] Computer Networking: a Top-Down Approach + Wireshark lab'leri (OSSU) — 7,5 saat
- [ ] Algoritma deposu iskeleti: doctest, DIRECTORY.md, kural denetimi — 7,5 saat

### 14. hafta · 5 Nisan 2027

- [ ] Computer Networking: a Top-Down Approach + Wireshark lab'leri (OSSU) — 8 saat
- [ ] Algoritma deposu iskeleti: doctest, DIRECTORY.md, kural denetimi — 7 saat (biter)

### 15. hafta · 12 Nisan 2027

- [ ] Computer Networking: a Top-Down Approach + Wireshark lab'leri (OSSU) — 7,5 saat
- [ ] Sıralama, ikili arama, bit işlemleri (CIU) — 7,5 saat

### 16. hafta · 19 Nisan 2027

- [ ] Computer Networking: a Top-Down Approach + Wireshark lab'leri (OSSU) — 7,5 saat
- [ ] Sıralama, ikili arama, bit işlemleri (CIU) — 7,5 saat

### 17. hafta · 26 Nisan 2027

- [ ] Computer Networking: a Top-Down Approach + Wireshark lab'leri (OSSU) — 7,5 saat
- [ ] Sıralama, ikili arama, bit işlemleri (CIU) — 7,5 saat

### 18. hafta · 3 Mayıs 2027

- [ ] Computer Networking: a Top-Down Approach + Wireshark lab'leri (OSSU) — 13,5 saat
- [ ] Sıralama, ikili arama, bit işlemleri (CIU) — 1,5 saat (biter)

### 19. hafta · 10 Mayıs 2027

- [ ] Computer Networking: a Top-Down Approach + Wireshark lab'leri (OSSU) — 7,5 saat
- [ ] Ağaçlar: ikili arama ağacı, heap ve öncelik kuyruğu, trie (CIU) — 7,5 saat

### 20. hafta · 17 Mayıs 2027

- [ ] Computer Networking: a Top-Down Approach + Wireshark lab'leri (OSSU) — 3,5 saat (biter)
- [ ] Ağaçlar: ikili arama ağacı, heap ve öncelik kuyruğu, trie (CIU) — 11,5 saat

### 21. hafta · 24 Mayıs 2027

- [ ] Nand to Tetris Part I (OSSU) — 7,5 saat
- [ ] Ağaçlar: ikili arama ağacı, heap ve öncelik kuyruğu, trie (CIU) — 7,5 saat

### 22. hafta · 31 Mayıs 2027

- [ ] Nand to Tetris Part I (OSSU) — 11,5 saat
- [ ] Ağaçlar: ikili arama ağacı, heap ve öncelik kuyruğu, trie (CIU) — 3,5 saat (biter)

### 23. hafta · 7 Haziran 2027

- [ ] Nand to Tetris Part I (OSSU) — 7,5 saat
- [ ] Graflar: BFS, DFS, topolojik sıralama, Dijkstra (CIU) — 7,5 saat

### 24. hafta · 14 Haziran 2027

- [ ] Nand to Tetris Part I (OSSU) — 7,5 saat
- [ ] Graflar: BFS, DFS, topolojik sıralama, Dijkstra (CIU) — 7,5 saat

### 25. hafta · 21 Haziran 2027

- [ ] Nand to Tetris Part I (OSSU) — 7,5 saat
- [ ] Graflar: BFS, DFS, topolojik sıralama, Dijkstra (CIU) — 7,5 saat

### 26. hafta · 28 Haziran 2027

- [ ] Nand to Tetris Part I (OSSU) — 7,5 saat
- [ ] Graflar: BFS, DFS, topolojik sıralama, Dijkstra (CIU) — 7,5 saat (biter)

### 27. hafta · 5 Temmuz 2027

- [ ] Nand to Tetris Part I (OSSU) — 7,5 saat
- [ ] Özyineleme ve dinamik programlama (CIU) — 7,5 saat

### 28. hafta · 12 Temmuz 2027

- [ ] Nand to Tetris Part I (OSSU) — 3,5 saat (biter)
- [ ] Özyineleme ve dinamik programlama (CIU) — 11,5 saat

### 29. hafta · 19 Temmuz 2027

- [ ] OSTEP temel yaklaşım: kitap + bölüm sonu ödevleri (OSSU, ~80 saat) — 7,5 saat
- [ ] Özyineleme ve dinamik programlama (CIU) — 7,5 saat

### 30. hafta · 26 Temmuz 2027

- [ ] OSTEP temel yaklaşım: kitap + bölüm sonu ödevleri (OSSU, ~80 saat) — 11,5 saat
- [ ] Özyineleme ve dinamik programlama (CIU) — 3,5 saat (biter)

### 31. hafta · 2 Ağustos 2027

- [ ] OSTEP temel yaklaşım: kitap + bölüm sonu ödevleri (OSSU, ~80 saat) — 7,5 saat
- [ ] Algorithms: Design and Analysis, Part 1 (OSSU) — 7,5 saat

### 32. hafta · 9 Ağustos 2027

- [ ] OSTEP temel yaklaşım: kitap + bölüm sonu ödevleri (OSSU, ~80 saat) — 7,5 saat
- [ ] Algorithms: Design and Analysis, Part 1 (OSSU) — 7,5 saat

### 33. hafta · 16 Ağustos 2027

- [ ] OSTEP temel yaklaşım: kitap + bölüm sonu ödevleri (OSSU, ~80 saat) — 7,5 saat
- [ ] Algorithms: Design and Analysis, Part 1 (OSSU) — 7,5 saat

### 34. hafta · 23 Ağustos 2027

- [ ] OSTEP temel yaklaşım: kitap + bölüm sonu ödevleri (OSSU, ~80 saat) — 7,5 saat
- [ ] Algorithms: Design and Analysis, Part 1 (OSSU) — 7,5 saat

### 35. hafta · 30 Ağustos 2027

- [ ] OSTEP temel yaklaşım: kitap + bölüm sonu ödevleri (OSSU, ~80 saat) — 7,5 saat
- [ ] Algorithms: Design and Analysis, Part 1 (OSSU) — 7,5 saat

### 36. hafta · 6 Eylül 2027

- [ ] OSTEP temel yaklaşım: kitap + bölüm sonu ödevleri (OSSU, ~80 saat) — 7,5 saat
- [ ] Algorithms: Design and Analysis, Part 1 (OSSU) — 7,5 saat

### 37. hafta · 13 Eylül 2027

- [ ] OSTEP temel yaklaşım: kitap + bölüm sonu ödevleri (OSSU, ~80 saat) — 12 saat
- [ ] Algorithms: Design and Analysis, Part 1 (OSSU) — 3 saat (biter)

### 38. hafta · 20 Eylül 2027

- [ ] OSTEP temel yaklaşım: kitap + bölüm sonu ödevleri (OSSU, ~80 saat) — 4 saat (biter)
- [ ] Algorithms: Design and Analysis, Part 2 (OSSU) — 11 saat

### 39. hafta · 27 Eylül 2027

- [ ] System Design Primer + yapı taşı minileri + Anki — 7,5 saat
- [ ] Algorithms: Design and Analysis, Part 2 (OSSU) — 7,5 saat

### 40. hafta · 4 Ekim 2027

- [ ] System Design Primer + yapı taşı minileri + Anki — 7,5 saat
- [ ] Algorithms: Design and Analysis, Part 2 (OSSU) — 7,5 saat

### 41. hafta · 11 Ekim 2027

- [ ] System Design Primer + yapı taşı minileri + Anki — 7,5 saat
- [ ] Algorithms: Design and Analysis, Part 2 (OSSU) — 7,5 saat

### 42. hafta · 18 Ekim 2027

- [ ] System Design Primer + yapı taşı minileri + Anki — 7,5 saat
- [ ] Algorithms: Design and Analysis, Part 2 (OSSU) — 7,5 saat

### 43. hafta · 25 Ekim 2027

- [ ] System Design Primer + yapı taşı minileri + Anki — 8 saat
- [ ] Algorithms: Design and Analysis, Part 2 (OSSU) — 7 saat (biter)

### 44. hafta · 1 Kasım 2027

- [ ] System Design Primer + yapı taşı minileri + Anki — 7,5 saat
- [ ] Kodlama sorusu pratiği: konu başına 2-3 soru, önce kâğıtta (CIU) — 7,5 saat

### 45. hafta · 8 Kasım 2027

- [ ] System Design Primer + yapı taşı minileri + Anki — 7,5 saat
- [ ] Kodlama sorusu pratiği: konu başına 2-3 soru, önce kâğıtta (CIU) — 7,5 saat

### 46. hafta · 15 Kasım 2027

- [ ] System Design Primer + yapı taşı minileri + Anki — 7 saat (biter)
- [ ] Kodlama sorusu pratiği: konu başına 2-3 soru, önce kâğıtta (CIU) — 8 saat

### 47. hafta · 22 Kasım 2027

- [ ] Kodlama sorusu pratiği: konu başına 2-3 soru, önce kâğıtta (CIU) — 15 saat

### 48. hafta · 29 Kasım 2027

- [ ] Kodlama sorusu pratiği: konu başına 2-3 soru, önce kâğıtta (CIU) — 15 saat

### 49. hafta · 6 Aralık 2027

- [ ] Kodlama sorusu pratiği: konu başına 2-3 soru, önce kâğıtta (CIU) — 7 saat (biter)

### 50. hafta · 13 Aralık 2027

- [ ] Bitirme: testli kısa link servisi (base62, hız sınırlama, LRU, tutarlı hash) — 15 saat

### 51. hafta · 20 Aralık 2027

- [ ] Bitirme: testli kısa link servisi (base62, hız sınırlama, LRU, tutarlı hash) — 15 saat

### 52. hafta · 27 Aralık 2027

- [ ] Bitirme: testli kısa link servisi (base62, hız sınırlama, LRU, tutarlı hash) — 10 saat (biter)

### 53. hafta · 3 Ocak 2028

- [ ] CS-Notes seçmeleri (Çince, çeviri iş akışıyla): önbellek, dağıtık sistemler — 15 saat

### 54. hafta · 10 Ocak 2028

- [ ] CS-Notes seçmeleri (Çince, çeviri iş akışıyla): önbellek, dağıtık sistemler — 5 saat (biter)
- [ ] Databases: Modeling, SQL, Semistructured (OSSU, 3 x 2 hafta) — 10 saat

### 55. hafta · 17 Ocak 2028

- [ ] Databases: Modeling, SQL, Semistructured (OSSU, 3 x 2 hafta) — 15 saat

### 56. hafta · 24 Ocak 2028

- [ ] Databases: Modeling, SQL, Semistructured (OSSU, 3 x 2 hafta) — 15 saat

### 57. hafta · 31 Ocak 2028

- [ ] Databases: Modeling, SQL, Semistructured (OSSU, 3 x 2 hafta) — 15 saat

### 58. hafta · 7 Şubat 2028

- [ ] Databases: Modeling, SQL, Semistructured (OSSU, 3 x 2 hafta) — 5 saat (biter)
- [ ] Nand to Tetris Part II (OSSU) — 10 saat

### 59. hafta · 14 Şubat 2028

- [ ] Nand to Tetris Part II (OSSU) — 15 saat

### 60. hafta · 21 Şubat 2028

- [ ] Nand to Tetris Part II (OSSU) — 15 saat

### 61. hafta · 28 Şubat 2028

- [ ] Nand to Tetris Part II (OSSU) — 15 saat

### 62. hafta · 6 Mart 2028

- [ ] Nand to Tetris Part II (OSSU) — 15 saat

### 63. hafta · 13 Mart 2028

- [ ] Nand to Tetris Part II (OSSU) — 15 saat

### 64. hafta · 20 Mart 2028

- [ ] Nand to Tetris Part II (OSSU) — 5 saat (biter)
