# btree — sayfalı dosya üstünde B+ ağacı

Veritabanlarının dizinleri (SQLite, PostgreSQL, InnoDB) B+ ağacıdır. Bu klasör onu baştan yazar:
sabit boyutlu sayfalar, yaprak zinciri, bölünme / ödünç alma / birleşme, LRU sayfa önbelleği, boş
sayfa listesi ve **bütün değişmezleri denetleyen bir doğrulayıcı**. Yalnız standart kitaplık.

```python
from btree import BPlusTree, check, render

tree = BPlusTree.open("agac.db", page_size=4096, cache_pages=64)
tree.put(b"elma", b"1")
tree.get(b"elma")                 # b"1"
list(tree.range(b"a", b"f"))      # [(b"elma", b"1")]
tree.delete(b"elma")              # True
check(tree)                       # değişmez bozuksa InvariantError
print(render(tree))               # katman katman çizim
tree.close()                      # kirli sayfalar + başlık yazılır, fsync
```

Komut satırı (deneme için küçük sayfa boyu ağacı hızla derinleştirir):

```
python -m btree agac.db --sayfa 128 doldur 500
python -m btree agac.db --sayfa 128 ciz
python -m btree agac.db --sayfa 128 aralik anahtar000100 anahtar000105
python -m btree agac.db --sayfa 128 denetle
```

## Nasıl çalışır

```
                         [s15 | 25]                                   ← kök (iç düğüm)
             ┌──────────────┴──────────────┐
   [s3 | 12 15 17 2020 2323]       [s14 | 29 3030 3333 44 6]          ← iç düğümler: ayırıcılar
     │   │   │   │    │    │          ...
   [s1]→[s12]→[s9]→[s6]→[s13]→[s11]→[s4]→[s8]→[s2]→[s5]→[s16]→[s7]    ← yapraklar: anahtar + değer
                                                                        `next_leaf` zinciri →
```

- **Arama:** kökten başla; iç düğümde `bisect_right(ayırıcılar, anahtar)` hangi çocuğa inileceğini
  söyler; yaprakta ikili arama.
- **Aralık sorgusu:** başlangıç yaprağı bulunur, sonra yalnız `next_leaf` zinciri izlenir.
- **Ekleme:** yaprağa sıralı ekle. Sayfa taşarsa düğüm **bayt ortasından** ikiye bölünür; yaprak
  bölünmesinde sağ yaprağın ilk anahtarı, iç düğüm bölünmesinde ortadaki anahtar üste çıkar. Kök
  bölünürse ağaç bir kat uzar.
- **Silme:** yapraktan sil. Kök dışı bir düğüm **çeyrekten az** dolu kalırsa: kardeşiyle birlikte bir
  sayfaya sığıyorsa **birleşir**, sığmıyorsa kardeşinden **ödünç alır** (girdi taşınır, üstteki ayırıcı
  güncellenir). Birleşmeler yukarı yayılabilir; kök tek çocuğa inerse ağaç bir kat kısalır.

### Neden "çeyrek" ve neden girdi sınırı?

Anahtarlar değişken uzunlukta olduğu için klasik "en az yarı dolu" kuralı bayt cinsinden her zaman
sağlanamaz. Burada:

- Bir girdi en çok `capacity/4` bayt olabilir (`capacity = sayfa_boyu - 7`).
- Taşan düğüm (> capacity) bayt ortasından bölününce iki yarı da `capacity/4`ten büyük kalır.
- Eksik düğüm (< capacity/4) kardeşiyle sığmıyorsa kardeş `3·capacity/4`ten doludur; ondan girdi
  taşımak eksik olanı çeyreğin üstüne çıkarır, vereni çeyreğin altına düşürmez.
- **İnce nokta 1:** Ödünç almada üst düğümdeki ayırıcı *daha uzun* bir anahtarla değişebilir; üst düğüm
  silme sırasında **taşabilir**. Bu yüzden silme de eklemedeki gibi bölünme sonucu döndürür
  (`_settle_child`). Test bunun gerçekten olduğunu sayarak kanıtlar.
- **İnce nokta 2:** Var olan değeri daha kısa bir değerle değiştirmek (`put`) yaprağı çeyreğin altına
  düşürebilir; ekleme de dengeleme yapar. Bu hatayı geliştirme sırasında özellik testi yakaladı.

## Bayt düzenleri

Tamsayılar küçük sonlu (little-endian), işaretsiz. Sayfa numarası 0 "yok" demektir.

```
0. sayfa (başlık):
┌──────────────┬────────────┬────────┬──────────────┬──────────┬────────────────┬────────┬───────┐
│ "SFRBTREE" 8 │ sayfa_boyu4│ kök 4  │ sayfa_sayısı4│ boş_baş 4│ anahtar_sayısı8│ crc32 4│ 0...  │
└──────────────┴────────────┴────────┴──────────────┴──────────┴────────────────┴────────┴───────┘

yaprak sayfası:
┌──────┬────────┬───────────────────┬─────────────┬─────────┬───────────┬───────┬─────┬──────┐
│ 1 (1)│ sayı(2)│ sonraki_yaprak(4) │ anahtar_uz 2│ anahtar │ değer_uz 2│ değer │ ... │ 0... │
└──────┴────────┴───────────────────┴─────────────┴─────────┴───────────┴───────┴─────┴──────┘

iç sayfa (sayı tane anahtar, sayı+1 çocuk):
┌──────┬────────┬───────────────┬─────────────┬─────────┬──────────┬─────┬──────┐
│ 2 (1)│ sayı(2)│ ilk_çocuk (4) │ anahtar_uz 2│ anahtar │ çocuk (4)│ ... │ 0... │
└──────┴────────┴───────────────┴─────────────┴─────────┴──────────┴─────┴──────┘

boş sayfa:   0 (1) │ sonraki_boş (4) │ 0...        (silinen düğümler bu zincirle yeniden kullanılır)
```

## Dosya haritası

| Dosya           | Sorumluluk                                                                     |
| --------------- | ------------------------------------------------------------------------------ |
| `tree.py`       | `BPlusTree`: arama, ekleme/bölünme, silme/ödünç alma/birleşme, aralık sorgusu |
| `node.py`       | düğümün bellekteki biçimi, sayfaya kodlama/çözme, girdi boyları               |
| `pager.py`      | sayfa okuma/yazma, LRU önbellek, boş sayfa listesi, başlık, `flush`/fsync     |
| `invariants.py` | doğrulayıcı `check`, `height`, `render` (çizim)                               |
| `__main__.py`   | komut satırı                                                                   |

## Güvenceler (testle kanıtlanan)

- **Model eşdeğerliği:** rastgele ekle/sil/aralık dizileri sıralı bir `dict` modeliyle aynı sonucu
  verir; iki tür özellik testi var: Hypothesis'in küçültebildiği kısa diziler ve tohumdan üretilen
  200–1200 işlemlik uzun diziler (ağaç 5 kata kadar derinleşir). Geliştirme sırasında ayrıca 400
  tohumla 323 bin işlem doğrulayıcıyla denendi.
- **Doğrulayıcı (`check`):** denge (bütün yapraklar aynı derinlikte), düğüm içi kesin sıra, ayırıcı
  sınırları (sol < ayırıcı <= sağ), kök dışı her düğüm >= çeyrek dolu ve hiçbir düğüm taşmamış, iç kökün
  en az bir anahtarı var, yaprak zinciri tam ve sıralı, anahtar sayacı doğru, her sayfa ya ağaçta ya
  boş listede (sızıntı ve çift kullanım yok). Doğrulayıcının kendisi de bilerek bozulmuş ağaçlarla
  sınanır.
- **Sayfa yeniden kullanımı:** her şey silinince başlık ve kök dışındaki bütün sayfalar boş listededir;
  aynı veri yeniden eklenince dosya büyümez.
- **Önbellek:** 1–2 sayfalık önbellekle de sonuçlar doğrudur (çıkarılan kirli sayfa diske yazılır).

## Sağlamadıkları (dürüst sınırlar)

- **Çökme güvenliği YOK.** Sayfalar yerinde yazılır; `flush()` yarıda kesilirse (ya da süreç `close`
  etmeden ölürse) ağaç tutarsız kalabilir. Kalıcılık yalnız başarılı `flush()`/`close()` sonrasıdır.
  Çözüm için bkz. "Buradan nereye" 1 ve kardeş sistem `anahtar_deger` (WAL).
- **Büyük değer yok:** anahtar + değer en çok `(sayfa_boyu - 7)/4 - 4` bayt (4096'lık sayfada 1018).
- **Eşzamanlılık yok:** tek iş parçacığı; kilit (latch) yok.
- **Başarım:** her erişimde sayfa Python nesnesine çözülür; öğretim amaçlıdır, hızlı değildir.
- Silmede düğümler yalnız *çeyrek* doluluğa kadar korunur; sürekli silme sonrası dosya küçülmez (boş
  sayfalar listede bekler, `VACUUM` yok).

## Buradan nereye

1. **Çökme güvenliği:** kirli sayfaları önce bir günlüğe (WAL) yaz, sonra yerine; ya da gölge sayfalama
   (yazarken kopyala) + başlıkta atomik kök değişimi.
2. **Taşma sayfaları:** büyük değerleri ayrı sayfa zincirine yaz; yaprakta ilk sayfa numarasını tut.
3. **Ön ek sıkıştırma:** yapraktaki ardışık anahtarların ortak ön ekini bir kez sakla (`node.py`).
4. **Toplu yükleme (bulk load):** sıralı veriden alttan yukarı, sayfaları %90 doldurarak ağaç kur.
5. **Yinelenen anahtar / ikincil dizin:** anahtarı `(anahtar, satır_no)` yaparak tekilleştir.
6. **`VACUUM`:** boş sayfaları dosyanın sonuna taşıyıp dosyayı kısalt.
