# sutun_deposu — sütun tabanlı küçük analitik depo: sözlük + RLE, vektörel süzme ve kümeleme

"İzmir'de 500 TL üstü kaç satış var?", "şehre göre toplam ciro?" gibi analitik sorgular birkaç sütunu
çok sayıda satır boyunca tarar. Satır tabanlı düzen her satırın bütün alanlarını taşır; sütun tabanlı
düzen her sütunu ayrı ve **sıkıştırılmış** tutar, sorgu yalnız gereken sütunları baştan sona tarar.
Bu klasör aynı sorguyu iki düzende çalıştırır — sütun tabanlı `ColumnTable` ve satır tabanlı başvuru
`RowTable` —, sonuçların birebir aynı olduğunu sınar ve farkı ölçer. Yalnız standart kitaplık.

```python
from sutun_deposu import ColumnTable

satirlar = [
    {"sehir": "İzmir", "tutar": 120, "durum": "tamam"},
    {"sehir": "Ankara", "tutar": 80, "durum": "tamam"},
    {"sehir": "İzmir", "tutar": 300, "durum": "iade"},
]
t = ColumnTable.from_rows(satirlar, ["sehir", "tutar", "durum"])
izmir = [("sehir", "==", "İzmir"), ("tutar", ">", 100)]
t.select(where=izmir, aggregates=[("*", "count"), ("tutar", "sum")])  # [(2, 420)]
t.select(group_by="sehir", aggregates=[("tutar", "avg")])  # [('Ankara', 80.0), ('İzmir', 210.0)]
```

```bash
python -m sutun_deposu olc --satir 200000    # sütun/satır karşılaştırmalı ölçüm (aşağıda)
```

## Nasıl çalışır

```
satır tabanlı (RowTable)                    sütun tabanlı (ColumnTable)
satır 0 {gun: 0, sehir: "İzmir",  ...}      gun    RLE    (0 × 548) (1 × 548) (2 × 548) ...
satır 1 {gun: 0, sehir: "Ankara", ...}      sehir  sözlük ["İzmir", "Ankara", "Trabzon", ...]
satır 2 {gun: 0, sehir: "Trabzon", ...}            kod   00 01 02 02 03 04 ...   (satır başına 1 bayt)
...                                          durum  RLE    ("iade" × 30) ("tamam" × 970) ...
her satır bir sözlük + değer nesneleri       tutar  düz    array('q'): 868 121 ...  (satır başına 8 bayt)
```

**Kodlamalar** (`encoding.py`; `encode()` her sütun için seçer):

| Kodlama | Bellekte | Ne zaman | Koşul kaç kez çağrılır |
| --- | --- | --- | --- |
| `RunLength` | `[(değer, tekrar), ...]` | çalışma sayısı × 4 < satır sayısı (sıralı, az değişen) | çalışma başına 1 |
| `Dictionary` | farklı değerler listesi + kod dizisi: ≤ 256 farklı → `array('B')` (1 bayt), ≤ 65 536 → `'H'` (2), yoksa `'I'` (4) | sütunda metin varsa (RLE değilse) | farklı değer başına 1 |
| `Plain` | yalnız tamsayı → `array('q')`, yalnız ondalık → `array('d')`, karışık → liste | ötekiler | satır başına 1 |

Sözlük anahtarı `(tür adı, değer)`'dir: 1, 1.0 ve "1" ayrı kalır; çözülen her değer türüyle aynıdır.

**Sorgu akışı** (`table.py`):

```
where:  sehir == "İzmir"                      tutar > 500
          │                                     │
   sözlükteki 8 değer sınanır: 01 00 00 ...    200 bin değer sınanır (düz sütun)
   kodlar.translate(tablo)  (tek C döngüsü)     │
          ▼                                     ▼
   maske1 = 01 00 00 00 00 00 00 00 …          maske2 = 01 00 00 00 00 00 00 01 …   (0/1 baytı)
          └──── int.from_bytes(m1) & int.from_bytes(m2) : tek büyük tamsayı VE'si ────┘
                                   ▼
                 maske = 01 00 00 00 00 00 00 00 …  →  itertools.compress(sütun, maske)
                                   ▼
        kümeleme (count, sum, avg, min, max); gruplu ise anahtar → konum listesi
```

- **Hızlı yollar:** süzgeçsiz ve grupsuz kümelemede tür belli düz sütun (`array('q')`/`'d'`) tek C
  döngüsüyle (`sum`, `math.fsum`, `min`, `max`) toplanır; RLE sütunda sayım ve tamsayı toplamı
  `değer × tekrar` ile bulunur, tekrarlar hiç açılmaz (10¹² satırlık RLE sütunu anında toplanır).
- **Ortak anlam** (`predicate`, `aggregate`, iki tablo da aynı işlevleri kullanır): koşullar VE'lenir;
  None hiçbir koşula uymaz (değer ya da işlenen None ise); karşılaştırılamayan türler (5 < "a") uymaz;
  count(sütun) None'ları atlar; sum/avg yalnız sayıları toplar (sayı yoksa None), ondalık varsa
  `math.fsum` ile doğru yuvarlar; min/max'ta sayılar metinlerden önce gelir; gruplu sonuç None, sayılar,
  metinler sırasıyla dizilir.

## Dosya haritası

| Dosya | Sorumluluk |
| --- | --- |
| `encoding.py` | `Plain`, `Dictionary`, `RunLength`; `encode` (seçim kuralı), `encoded_size` (bayt tahmini) |
| `table.py` | `ColumnTable` (maske, `compress`, hızlı yollar), `RowTable` (başvuru), `predicate`, `aggregate` |
| `__main__.py` | `python -m sutun_deposu olc`: bellek ve süre ölçümü (`QUERIES` listesi) |

## Ölçüm

`python -m sutun_deposu olc --satir 200000` (bu makine: 4 çekirdek, Python 3.13; iki koşunun değerleri).
Veri: 200 bin satış satırı; yılın günü sıralı, 8 şehir, 50 ürün, her 1000 satırın 30'u iade, tutar
rastgele. Kalıcı bellek: kurulumdan sonra `tracemalloc`'un canlı saydığı bayt (her iki biçim kendi
değer nesnelerini öder). Süre: 3 denemenin en iyisi.

| | sütun | satır | fark |
| --- | ---: | ---: | ---: |
| kalıcı bellek | 2,2 MB | 57,8 MB | ~26 kat az |
| kurulum tepesi | 76,0 MB | 59,4 MB | sütun **daha fazla** (önce satırlar kurulur) |
| toplam, süzgeçsiz (`array('q')`) | 2,7–4,5 ms | 65–70 ms | 14–26 kat |
| İzmir ve tutar > 500, sayım | 17,5 ms | 48–50 ms | 2,8 kat |
| şehre göre toplam ve sayım | 74–77 ms | 132–137 ms | 1,7–1,9 kat |
| iade olanlar, ürüne göre ortalama | 8,6–8,9 ms | 47–48 ms | 5,4 kat |

Kodlanmış boyut (`encoded_size`): `gun` ~4 kB (RLE, 365 çalışma), `sehir` ve `urun` ~200 kB (1 baytlık
kod), `durum` ~3 kB (RLE), `tutar` ~1,6 MB (düz, 8 bayt). Saf Python'da "vektörel" sınırlıdır: düz
sütunda koşul hâlâ değer başına bir Python çağrısıdır; kazancın çoğu sözlük/RLE'nin çağrı sayısını
farklı değer/çalışma sayısına indirmesinden ve C'de koşan `translate`, büyük tamsayı `&`, `compress`,
`sum`'dan gelir. Gruplama en az kazanan sorgudur (anahtar başına konum listesi Python'da kurulur).

## Güvenceler (testle kanıtlanan)

- **Satır tabanlıyla aynılık:** rastgele tablolarda — her kodlama (RLE, 1 ve 2 baytlık sözlük,
  `array('q')`, `array('d')`, karışık liste), None, eksik alan, 1 / 1.0 / "1" karışımı, Türkçe metin —
  ve rastgele sorgularda (0–3 koşul, 7 işleç, gruplama, 5 kümeleme) `ColumnTable` ile `RowTable`
  sonuçları hücre hücre ve **türleriyle** aynıdır. Hypothesis (küçük, küçültülebilir tablolar) +
  tohumlu büyük tablolar (0, 1, 255, 256, 257, 3000 satır): hızlı denetimde 4 tohum × 60 sorgu,
  `--uzun` ile 40 tohum × 170 sorgu. Her tohumda her sütun × her kümeleme süzgeçsiz de sorulur (hızlı
  yollar). Üretecin her kodlamaya ulaştığı ayrıca sınanır.
- **Elle hesaplanmış örnek:** 6 satırlık satış tablosunda koşul, gruplama, None, eksik alan, tür
  uyuşmazlığı ve kod noktası sıralaması ("İzmir" > "z") iki tabloda da elle bulunan sonucu verir;
  hatalı sorgular (bilinmeyen işleç/sütun/kümeleme, `in`'e liste verilmemesi) iki tabloda aynı hatayı
  verir.
- **Kayıpsız kodlama ve doğru maske:** her kodlama değerleri türleriyle geri verir; her kodlamanın
  maskesi değer değer sınamayla aynıdır (1 baytlık `translate` yolu ve 2 baytlık yol ayrı ayrı).
- **İş tasarrufu:** koşul sözlükte farklı değer başına, RLE'de çalışma başına bir kez çağrılır
  (sayılarak sınanır); süzgeçsiz sayım/toplam RLE'yi ve tür belli düz diziyi tek tek açmaz.
- **Bellek:** ölçüm verisinde (20 bin satır) sütun tablosu satır tablosunun 1/10'undan az bellek
  tutar.
- **Testin dişleri:** 13 bilerek bozulmuş sürüm (maskeleri VEYA'lama, ters bayt sırası, sözlükte ve
  RLE'de türü ayırmama, RLE toplamında ve sayımında hata, ondalık dizide düz `sum`, ters çeviri
  tablosu, None işlenenin uyması, metin toplamının 0 çıkması, None grubunun sona gitmesi, grup
  anahtarını süzgeçsiz alma, seçilen satırı yanlış sayma) hepsi yakalandı.

## Sağlamadıkları (dürüst sınırlar)

- **Kalıcılık yok:** bellek içi; dosya biçimi (Parquet benzeri) yok.
- **Değişiklik yok:** tablo bir kez kurulur; satır ekleme, silme, güncelleme yok.
- **Kurulum belleği yüksek:** `from_rows` önce bütün satırları ister; kurulum tepesi satır tablosundan
  fazladır (ölçümde 76 MB'a 59 MB). Akıştan parça parça kurma yok.
- **Küçük sorgu dili:** yalnız VE'lenen koşullar, tek sütunla gruplama ve beş kümeleme; VEYA, NOT,
  birleştirme (join), sıralama, LIMIT, ifade yok.
- **Metin sıralaması kod noktasıyladır:** "İzmir" > "z", "Çorum" > "Zonguldak"; Türkçe harmanlama yok.
- **Ondalık uç durumlar:** NaN testlerde üretilmez (karşılaştırma ve gruplama Python kuralıyla işler);
  `inf + -inf` toplamı `math.fsum` hatası (ValueError) verir; ondalıkla karışan çok büyük tamsayılar
  ondalığa çevrilirken taşabilir (OverflowError). -0.0 ile 0.0 eşit sayılır; sözlük ve RLE ilk
  görüleni saklar (sonuçlar `==` ile aynıdır, sıfırın işareti farklı olabilir).
- **Süreler makineye bağlıdır;** testler yalnız sonuçların aynılığını ve bellek oranını denetler, hızı
  denetlemez.

## Buradan nereye

1. **Bölge haritası (zone map):** her 64 bin satırlık blok için min/max; koşula hiç uymayan blok taranmaz.
2. **Delta ve bit paketleme:** sıralı zaman damgalarında ardışık farklar; 8 farklı değere 3 bitlik kod.
3. **Kodlanmış veride gruplama:** sözlük kodlarıyla doğrudan gruplama (metin karşılaştırması yok); RLE'de
   çalışma başına toplama.
4. **Geç somutlaştırma (late materialization):** yalnız maskeyi geçen satırların öteki sütunları
   çözülür.
5. **Dosya biçimi:** sütun blokları + başlık + CRC (bkz. `anahtar_deger`'in SSTable'ı) — Parquet'in
   küçük bir akrabası.
6. **Ekleme:** satır tabanlı küçük bir "delta deposu"; dolunca sütun bloklarına birleştirilir.
