# mini_sql — SQL alt kümesi motoru

Bir veritabanının "beyni": SQL metnini okur, anlar, bir plan kurar ve yürütür. Belirteçleyici →
ayrıştırıcı → mantıksal plan → yineleyici (volcano) yürütücü. Anlamı **SQLite ile aynıdır** ve bu,
rastgele üretilen binlerce sorguyla `sqlite3`'e karşı sınanır. Yalnız standart kitaplık, bellek içi.

```python
from mini_sql import Database

db = Database()
db.execute("CREATE TABLE kisi (id INTEGER PRIMARY KEY, ad TEXT NOT NULL, sehir TEXT, yas INTEGER)")
db.execute("INSERT INTO kisi (ad, sehir, yas) VALUES (?, ?, ?)", ["Ayşe", "İzmir", 34])
db.execute("CREATE INDEX kisi_yas ON kisi (yas)")
db.query("SELECT sehir, count(*), avg(yas) FROM kisi GROUP BY sehir ORDER BY 2 DESC")
db.explain("SELECT ad FROM kisi WHERE yas BETWEEN 20 AND 35")
# ['Project kisi.ad', '  Filter kisi.yas BETWEEN 20 AND 35',
#  '    IndexScan kisi USING kisi_yas (kisi.yas BETWEEN 20 AND 35)']
```

Kabuk: `python -m mini_sql` (deyimler `;` ile biter, `.tablolar`, `.cikis`) ya da
`python -m mini_sql dosya.sql`.

## Nasıl çalışır

```
"SELECT ad FROM kisi WHERE yas > 30"
        │ lexer.py        belirteçler: KEYWORD(select) IDENT(ad) KEYWORD(from) ... NUMBER(30)
        ▼
        │ parser.py +     AST: Select(items=[ad], from=kisi, where=Binary('>', Column(yas), 30))
        │ parse_expr.py   (öncelik basamakları SQLite ile aynı: OR < AND < NOT < = < ... < ||)
        ▼
        │ planner.py      ad çözümleme (compile.qualify), erişim yolu (access.py), işleç ağacı:
        │ access.py         Project ← Filter ← IndexScan|SeqScan  (birleşme, gruplama, sıralama...)
        ▼
        │ operators.py    her işleç alttakinden satır ÇEKER (volcano): üst işleç `next` dedikçe
        │ compile.py      bir satır akar. İfadeler önceden Python işlevlerine derlenmiştir.
        ▼
      [('Mehmet',), ('Ayşe',)]
```

Bir SELECT'in plan sırası: kaynak (SeqScan / IndexScan) → birleşmeler (HashJoin / NestedLoopJoin)
→ WHERE (Filter) → GROUP BY + kümeleme (Aggregate) → HAVING (Filter) → SELECT listesi (Project) →
DISTINCT → ORDER BY (Sort) → LIMIT/OFFSET (Limit). `LIMIT 3` doyunca alttan **bir satır bile fazla
çekilmez** (testle ölçülür).

### Planlayıcı kuralları

- **Dizin seçimi** (tek tablolu sorgu, UPDATE, DELETE): WHERE AND parçalarına bölünür; dizinli bir sütun
  için `sütun = sabit` > `sütun IN (sabitler)` > `sütun <,<=,>,>= sabit` / `BETWEEN` seçilir. Dizin
  yalnız **aday** satırları verir; koşulun tamamı yine `Filter`'da denetlenir. Bu yüzden dizin
  seçimi sonucu asla değiştiremez — farksal test her sorguyu dizinsiz bir kopyada da çalıştırır.
- **Birleşme:** ON koşulunda `sol_ifade = sağ_ifade` parçası varsa **HashJoin** (sağ taraf sözlüğe),
  yoksa **NestedLoopJoin** (sağ taraf bir kez okunur). LEFT JOIN'de eşi olmayan satır NULL'larla gelir.
- `UNIQUE` / `PRIMARY KEY` sütunları otomatik tekil dizin alır (`oto_<tablo>_<sütun>`).

## Desteklenen SQL

```
SELECT [DISTINCT] ifade [AS ad], *, t.* FROM t [AS] a
       [ [INNER] JOIN | LEFT [OUTER] JOIN | CROSS JOIN | , ] t2 [ON koşul] ...
       [WHERE koşul] [GROUP BY ifade|konum, ... [HAVING koşul]]
       [ORDER BY ifade|takma_ad|konum [ASC|DESC], ...] [LIMIT n [OFFSET m] | LIMIT m, n]
INSERT INTO t [(sütunlar)] VALUES (...), (...)
UPDATE t SET s = ifade, ... [WHERE koşul]          DELETE FROM t [WHERE koşul]
CREATE TABLE [IF NOT EXISTS] t (s TÜR [PRIMARY KEY] [NOT NULL] [UNIQUE] [DEFAULT değer], ...)
CREATE [UNIQUE] INDEX [IF NOT EXISTS] ad ON t (sütun)        DROP TABLE [IF EXISTS] t
EXPLAIN <SELECT|INSERT|UPDATE|DELETE>
```

İfadeler: `+ - * / % ||`, `= <> != < <= > >= IS [NOT]`, `AND OR NOT`, `[NOT] IN (...)`,
`[NOT] BETWEEN`, `[NOT] LIKE`, `CASE [x] WHEN ... THEN ... [ELSE ...] END`, `?` parametreleri.
İşlevler: `abs length lower upper substr coalesce ifnull nullif typeof min(a,b,..) max(a,b,..)`,
Türkçe doğru `lower_tr upper_tr`; kümeleme: `count(*) count sum avg min max` (+ `DISTINCT`).

### SQLite ile birebir aynı tutulan ince noktalar

| Konu               | Davranış                                                                       |
| ------------------ | ------------------------------------------------------------------------------ |
| NULL               | üç değerli mantık; `NULL = NULL` → NULL; `x IN (1, NULL)` eşleşmezse NULL       |
| Bölme / kalan      | `-7 / 2 = -3` (sıfıra doğru keser), `-7 % 2 = -1`, `5.5 % 2 = 1.0`, `/0` → NULL |
| Taşma              | 64 bit tamsayı taşarsa REAL olur; `sum()` taşarsa hata                          |
| Metin → sayı       | `'12abc' + 1 = 13`, `'abc' + 1 = 1`, `NOT 'abc' = 1`                            |
| Sıralama           | NULL < sayılar < metin < BLOB; metin ikili (BINARY) sırada                      |
| LIKE, lower, upper | büyük/küçük harf yalnız ASCII için: `'İzmir' LIKE 'i%'` → 0                     |
| REAL'in metni      | `100.0`, `1.0e+20` (`||` ve `length` için önemli)                               |
| `sum`/`avg`        | tamsayılar kesin; REAL'de Kahan-Babuška-Neumaier dengeli toplama (bit bit aynı) |
| Yakınlık (affinity)| INSERT/UPDATE'te sütun türüne göre: INTEGER sütuna `'12'` → 12, `3.0` → 3      |
| `INTEGER PRIMARY KEY` | rowid'in kendisi; NULL verilirse en büyük + 1                               |

## Dosya haritası

| Dosya           | Sorumluluk                                                                  |
| --------------- | --------------------------------------------------------------------------- |
| `engine.py`     | `Database`: execute/query/explain, şema ve değiştiren deyimler, atomiklik    |
| `lexer.py`      | belirteçleyici                                                              |
| `parse_expr.py` | belirteç imleci + ifade ayrıştırıcısı (öncelik basamakları)                 |
| `parser.py`     | deyim ayrıştırıcısı                                                         |
| `syntax.py`     | AST düğümleri (`frozen` dataclass) ve `to_sql`                               |
| `compile.py`    | ad çözümleme (`Scope`, `qualify`) ve ifade derleyici                         |
| `values.py`     | değer anlamı: karşılaştırma, aritmetik, NULL mantığı, LIKE, yakınlık         |
| `functions.py`  | satır işlevleri ve kümeleme işlevleri kaydı (`YENİ ... BURAYA`)              |
| `planner.py`    | SELECT planlayıcı                                                           |
| `access.py`     | dizin seçimi (erişim yolu)                                                  |
| `operators.py`  | volcano işleçleri: SeqScan, IndexScan, Filter, HashJoin, NestedLoopJoin, Aggregate, Project, Distinct, Sort, Limit |
| `storage.py`    | tablolar, dizinler, kısıtlar, deyim geri alma                               |
| `__main__.py`   | etkileşimli kabuk                                                           |

## Güvenceler (testle kanıtlanan)

- **Farksal test:** rastgele şema + veri + dizin + sorgu (WHERE, birleşmeler, LEFT JOIN, GROUP BY,
  HAVING, DISTINCT, ORDER BY, LIMIT/OFFSET, CASE, LIKE, IN, BETWEEN, işlevler) + rastgele
  UPDATE/DELETE/INSERT → `sqlite3` ile aynı sonuç. Sıralı sorgular liste, sıralamasızlar çoklu küme
  olarak karşılaştırılır; her sorgu dizinsiz bir kopyada da koşulur. Hızlı denetimde ~500 sorgu;
  `--uzun` ile 400 tohum × 60 deyim. Geliştirme sırasında ayrıca 6.000 tohumla ~270 bin sorgu
  denendi; bulunan tek fark (REAL toplamında son bit) Kahan-Babuška-Neumaier toplamasıyla giderildi.
- **Testin dişleri:** 8 bilerek bozulmuş sürümün (taban bölme, Unicode LIKE, IN'de NULL'u yok sayma,
  NULL'u sona sıralama, LEFT JOIN'de eşsiz satırı atma, dizin aralığı sınır hatası, dizin varken
  Filter'ı atlama, Python tarzı `%`) hepsi hızlı denetimde yakalandı. Dizin aralığının fazladan aday
  vermesi sonucu bozmaz (Filter adayları yeniden süzer), bu yüzden farksal test onu göremez; onu dizin
  aramalarını kaba kuvvetle karşılaştıran birim testi yakalar.
- **Dizin aramaları:** `lookup_eq` ve dahil/dışlayıcı her sınır bileşimiyle `lookup_range`, NULL, tamsayı,
  ondalık ve metin karışık anahtarlarda kaba kuvvetle birebir aynı rowid listesini verir.
- **Tek tek ifadeler:** 85 ifadenin sonucu ve sonuç türü (`int`/`float`) sqlite3 ile aynı; `substr`
  bütün küçük argüman bileşimlerinde; `sum`/`avg` 300 rastgele REAL dizisinde bit bit aynı.
- **Atomiklik:** çok satırlı INSERT ya da UPDATE ortasında kısıt bozulursa deyimin hiçbir etkisi kalmaz.

## Sağlamadıkları (dürüst sınırlar)

- **Kalıcılık ve işlem (transaction) yok:** veri bellektedir; `BEGIN/COMMIT` yok (işlemler için kardeş
  sistem `islem`, kalıcılık için `anahtar_deger`/`btree`).
- **Alt sorgu yok:** `IN (SELECT ...)`, `EXISTS`, skaler alt sorgu, `UNION`, CTE, pencere işlevleri yok.
- **Karşılaştırmada yakınlık yok:** SQLite `INTEGER sütun = '3'` karşılaştırmasında metni sayıya çevirir;
  burada farklı türler tür sırasıyla karşılaştırılır (sonuç SQLite'tan farklı olabilir). Yakınlık
  yalnız INSERT/UPDATE'te uygulanır. Farksal test bu yüzden yalnız tür tutarlı karşılaştırma üretir.
- **Daha katı:** GROUP BY'lı sorguda gruplanmamış "çıplak" sütun hata verir (SQLite rastgele bir
  satırdan değer seçer). DISTINCT'li sorguda ORDER BY ifadeleri SELECT listesinde olmalıdır.
- **REAL toplam sırası:** birleşmeli sorgularda satır sırası SQLite'tan farklı olabilir; tam değerli
  olmayan REAL'lerin toplamında (çok nadiren) son bit ayrışabilir.
- Tablo düzeyi kısıtlar (`PRIMARY KEY (a, b)`), çok sütunlu dizin, `ALTER TABLE`, `GLOB`, `ESCAPE`,
  `CAST`, tarih işlevleri, BLOB sabitleri (`x'00'`) yoktur. Başarım öğretim düzeyindedir.

## Buradan nereye

1. **Alt sorgular:** `syntax.py`'ye `Subquery` düğümü; `compile.py`'de alt planı çalıştırıp değeri
   döndür (ilişkisiz alt sorgu bir kez, ilişkili alt sorgu satır başına).
2. **Koşul aşağı itme (predicate pushdown):** WHERE parçalarını birleşmeden önceki taramalara taşı
   (LEFT JOIN'in sağ tarafına taşımak yanlış olur).
3. **Maliyet tabanlı planlayıcı:** tablo istatistikleri (satır sayısı, farklı değer sayısı) ve
   birleşme sırası seçimi; `access.py` adayları puanlar.
4. **Dizinli iç içe döngü:** birleşmenin sağ tarafı dizinliyse her sol satır için dizin araması.
5. **İşlemler:** `BEGIN/COMMIT/ROLLBACK` — `storage.Table.snapshot()` zaten deyim düzeyinde var.
6. **Kalıcılık:** tabloları `btree` (sayfalı dosya) üstüne taşı; satırları anahtar = rowid olarak sakla.
