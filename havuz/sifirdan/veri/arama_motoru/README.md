# arama_motoru — ters dizinli tam metin arama

Bir arama kutusunun arkası: belgeleri sözcüklerine ayırır, her sözcüğün **hangi belgede hangi
konumda** geçtiğini tutar (ters dizin), sorguyu **BM25** ile puanlar, ifade ve yakınlık araması yapar,
yazım hatasında "bunu mu demek istediniz?" der, otomatik tamamlar ve vurgulu özet üretir. Türkçe büyük/
küçük harf (`İ/ı`) doğrudur. Yalnız standart kitaplık.

```python
from arama_motoru import InvertedIndex, search, did_you_mean, complete

index = InvertedIndex()  # alanlar: baslik (ağırlık 2.0), govde (1.0)
index.add("1", {"baslik": "Kediler ve süt", "govde": "Küçük kedi süt içti."})
index.add("2", {"baslik": "Köpek", "govde": "Köpek kemik sever, kedi ile oynar."})
[(h.doc_id, h.snippet) for h in search(index, '"süt içti" -köpek')]
# [('1', 'Küçük kedi [süt] [içti].')]
did_you_mean(index, "kdei süt")  # 'kedi süt'
complete(index, "ked")  # ['kedi', 'kediler']
index.save("dizin.json.gz")  # InvertedIndex.load(...) ile geri
```

Komut satırı: `python -m arama_motoru dizinle belgeler/ dizin.json.gz` (klasördeki `.txt`'ler ya da
`id`/`baslik`/`govde` alanlı JSONL), `... ara dizin.json.gz "sorgu"`, `... tamamla dizin.json.gz ön`.

## Nasıl çalışır

```
"İstanbul'dan gelen kediler ve süt"          çözümleme (text.py)
   │ sözcüklere böl (konum + karakter aralığı) → küçült (lower_tr: İ→i, I→ı)
   │ kesme işaretinden sonrasını at → durak sözcükleri at (konum yine sayılır) → ek kırp
   ▼
 istanbul@0  gelen@1  kedi@2  süt@4        ("ve"@3 atıldı; "kediler" → "kedi")
   ▼
 ters dizin (index.py), alan başına:
   "kedi" → { belge1: [2], belge7: [0, 9] }      terim → belge → konumlar
   "süt"  → { belge1: [4] }
   uzunluklar: { belge1: 4, ... }                  BM25'in |d| ve ortalama|d|'si
```

**Sorgu dili** (`query.py`):

| Yazım          | Anlam                                                                         |
| -------------- | ----------------------------------------------------------------------------- |
| `kedi süt`     | ikisi de geçmeli (VE); `any_term=True` ile VEYA                               |
| `"süt içti"`   | tam ifade: bu sırayla, yan yana                                               |
| `"kedi süt"~3` | yakınlık: sıra önemsiz, hepsi `n - 1 + 3` genişliğinde bir pencerede          |
| `baslik:kedi`  | yalnız o alanda                                                               |
| `kit*`         | ön ek (en sık 50 açılım: "kitap", "kitaplar"...)                              |
| `-köpek`       | dışarıda bırak (ifade ve alanla da: `-"sokak köpeği"`, `-baslik:köpek`)      |

**İfade eşleşmesi:** her sözcüğün konum kümesi bulunur; ilk sözcüğün her `p` konumu için öteki
sözcükler `p + göreli_konum`'da var mı bakılır. Durak sözcükler dizinde olmadığı için ifade içinde
**joker** sayılır ama boşlukları korunur (`"ev ve araba"` "ev bir araba"yı da bulur, "ev araba"yı
bulmaz). Yakınlık için her sözcükten en az bir konum içeren **en dar pencere** iki işaretçiyle bulunur.

**BM25** (`search.py`, k1 = 1.2, b = 0.75):

```
idf(t)     = ln(1 + (N - n + 0.5) / (n + 0.5))                 N: alandaki belge sayısı, n: t'yi içeren
puan(t, d) = idf · tf · (k1 + 1) / (tf + k1 · (1 - b + b · |d| / ortalama|d|))
belge puanı = Σ tümce Σ alan  alan_ağırlığı · Σ terim puan(t, d)
```

Elle hesaplanmış örnek (`test_bm25_matches_hand_calculation`): 3 belge ("elma armut elma",
"armut kiraz", "kiraz kiraz kiraz muz"), ortalama uzunluk 3. "elma" için idf = ln(8/3) ≈ 0.980829,
1. belgede tf = 2 → puan ≈ 1.348640. "armut" için kısa olan 2. belge (≈ 0.544215) uzun olan 1.
belgeyi (≈ 0.470004) geçer: uzunluk normalleştirmesi.

**Öneriler** (`spelling.py`): "bunu mu demek istediniz?" sonuç vermeyen her sözcüğü, en iyi hizalama
(OSA) uzaklığı ≤ 1 (kısa sözcük) ya da ≤ 2 olan en yakın sözlük sözcüğüyle değiştirir (eşitlikte en
sık olan). Yüzey sözcüklere ve köklere bakar: "kitpa" → kök "kitap" → en sık biçimi "kitaplar".
Otomatik tamamlama ön eki tutan en sık yüzey sözcükleri verir.

**Özet** (`snippet.py`): eşleşen konumların en yoğun olduğu 24 sözcüklük pencere; eşleşen sözcükler
işaretlenir. `as_html=True` ise metin önce `html.escape` ile kaçışlanır, `<mark>` sonra eklenir.

**N-gram kipi:** `Analyzer(mode="ngram")` sözcükleri 3'lü karakter parçalarına böler ("kitap" → kit,
ita, tap); bir sözcük, parçalarının hepsi aynı sözcük konumunda geçiyorsa eşleşir → **sözcük içi**
arama ("trikli" → "Elektrikli"). Ek kırpma gerekmez ama dizin büyür.

## Kayıt biçimi

`save()` gzip'li, sürümlü JSON yazar; `load()` gönderi listelerini yeniden çözümlemeden okur:

```json
{"surum": 1, "analyzer": {"mode": "stem", "ngram": 3, "stop_words": true},
 "fields": {"baslik": 2.0, "govde": 1.0},
 "documents": {"1": {"baslik": "Kediler ve süt", "govde": "..."}},
 "postings": {"govde": {"kedi": {"1": [1]}, "süt": {"1": [2]}}},
 "lengths": {"govde": {"1": 4}}, "words": {"kedi": 1, "süt": 1}}
```

## Dosya haritası

| Dosya         | Sorumluluk                                                                  |
| ------------- | --------------------------------------------------------------------------- |
| `text.py`     | `lower_tr`/`upper_tr`, `Analyzer`: sözcüklere bölme, durak sözcükler, ek kırpma, n-gram |
| `index.py`    | `InvertedIndex`: ekle/çıkar, gönderi listeleri, istatistikler, kaydet/yükle |
| `query.py`    | sorgu dili ayrıştırıcısı (`Clause`)                                         |
| `search.py`   | eşleştirme (sözcük, ifade, yakınlık, ön ek), BM25, `search`, `did_you_mean`, `complete` |
| `spelling.py` | OSA düzenleme uzaklığı, en yakın sözcük, tamamlama                         |
| `snippet.py`  | en yoğun pencere ve vurgulama (HTML kaçışlı)                                |
| `__main__.py` | komut satırı                                                                |

## Güvenceler (testle kanıtlanan)

- BM25 puanları elle hesaplanmış örnekle 6 basamak aynı; uzunluk normalleştirmesi sıralamayı doğru
  değiştirir.
- İfade araması rastgele 40 belgelik derlemde 60+ rastgele ifade için kaba kuvvet aramayla aynı.
- Düzenleme uzaklığı (erken kesmeli) erken kesmesiz başvuru tablosuyla aynı (Hypothesis).
- Kaydedip yüklenen dizin aynı sonuçları aynı puanlarla verir; bozuk dosya açık hata verir.
- Türkçe: `İSTANBUL`/`ışık` doğru küçültülür; `İstanbul'dan` → `istanbul`; HTML enjeksiyonu kaçışlanır.

## Sağlamadıkları (dürüst sınırlar)

- **Ek kırpma kabadır:** sözlüksüz, kurallı; "sütü" → "sütü" kalır (3 harfli köke tek harfli ek
  kırpılmaz, "kedi" → "ked" olmasın diye), bazı farklı sözcükler aynı köke düşebilir. Ünlü uyumu ve
  ünsüz yumuşaması ("kitabı" → "kitab") ele alınmaz.
- **Bellek içi:** bütün dizin bellekte; yükleme bütün dosyayı okur. Milyonlarca belge için değil.
- Eşzamanlı yazma güvenli değildir (tek iş parçacığı). Silme, belgeyi yeniden çözümleyerek yapılır.
- Yazım önerisi her sözlük sözcüğüne bakar (sözlük büyüdükçe yavaşlar).
- Sorguda parantez/VEYA grubu yok; puanlar alan başına BM25 toplamıdır (gerçek BM25F değil).

## Buradan nereye

1. **Sıkıştırılmış gönderi listeleri:** konum farkları + değişken uzunluklu tamsayı, ikili dosya.
2. **BM25F:** alan tf'lerini ağırlıkla birleştirip sonra doyurmak (tek bir `_clause_score`).
3. **Sözlüklü kök bulma:** Türkçe biçimbirim çözümleyicisi; ünsüz yumuşaması (kitab → kitap).
4. **SymSpell/BK-ağacı:** yazım önerisini sözlük büyüklüğünden bağımsız hızlandırmak.
5. **Sorgu ağacı:** `(kedi OR köpek) AND süt` için parantezli ayrıştırıcı.
6. **Artımlı kayıt:** her eklemede bütün dizini değil yalnız yeni bölümü (segment) yazmak, arada birleştirmek.
