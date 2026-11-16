# anahtar_deger — LSM ağacıyla kalıcı anahtar-değer deposu

Bir veritabanının en alt katı: `bytes` anahtarlara `bytes` değer yazar, okur, siler, sıralı tarar ve
bilgisayar çökse bile **onaylanmış** hiçbir yazmayı kaybetmez. Tasarım LevelDB/RocksDB'nin sadeleştirilmiş
hâlidir (LSM = Log-Structured Merge tree). Yalnız Python standart kitaplığı kullanır.

```python
from anahtar_deger import KVStore, Options

with KVStore.open("veri_klasoru", Options(sync=True)) as db:
    db.put(b"elma", b"kirmizi")
    db.write_batch([(b"armut", b"sari"), (b"kiraz", None)])  # atomik: ya hepsi ya hiçbiri
    db.get(b"elma")                 # b"kirmizi"
    list(db.scan(b"a", b"f"))       # [(b"armut", b"sari"), (b"elma", b"kirmizi")]
```

Komut satırı: `python -m anahtar_deger klasor yaz şehir İstanbul`, `... oku şehir`, `... tara`,
`... sil şehir`, `... birlestir`, `... durum`.

## Nasıl çalışır

```
 put/delete ──► [1] WAL'a ekle (+fsync) ──► [2] bellek tablosu (sıralı) ──► dolunca [3] SSTable'a boşalt
                                                                                   │
 get ──► bellek tablosu ──► SSTable (en yeni) ──► ... ──► SSTable (en eski)         ▼
         ilk bulunan kazanır; silme işareti "yok" demektir             [4] SSTable sayısı eşiği aşınca
                                                                           hepsi tek tabloya birleştirilir
```

1. **WAL (önceden yazma günlüğü):** Her yazma önce diske, dosyanın sonuna eklenir. `sync=True` iken
   `write_batch` dönmeden `fsync` çağrılır: dönüş = onay = kalıcılık.
2. **Bellek tablosu:** Son yazmaların sıralı kopyası (`dict` + sıralı anahtar listesi). Silme, değeri
   `None` olan bir girdidir (silme işareti); daha eski tablolardaki değeri "gölgeler".
3. **Boşaltma (flush):** Bellek tablosu `memtable_limit` bayta varınca değişmez bir SSTable dosyasına
   yazılır, yeni bir WAL açılır, MANIFEST güncellenir, eski WAL silinir.
4. **Birleştirme (compaction):** `compaction_trigger` kadar SSTable birikince hepsi tek tabloya
   birleştirilir: her anahtarın yalnız en yeni sürümü kalır, silme işaretleri atılır (hepsi
   birleştiği için gölgeleyecekleri eski veri kalmamıştır).
5. **Kurtarma (open):** `*.tmp` dosyaları ve MANIFEST'te adı geçmeyen SSTable'lar (yarım kalmış
   boşaltma/birleştirme) silinir; MANIFEST'in gösterdiği WAL'lar sırayla yeniden oynatılır; WAL'ın
   sonundaki yarım ya da bozuk kayıt kesilip atılır.

### Dosyalar ve sıralama kuralı

```
veri_klasoru/
├─ MANIFEST         canlı SSTable listesi (yeniden eskiye) + gereken en eski WAL numarası
├─ 000007.log       etkin WAL
├─ 000006.sst       SSTable (en yeni)
└─ 000003.sst       SSTable (en eski)
```

Her değişiklik **"önce yeni dosyayı kalıcı yaz, sonra MANIFEST'i atomik değiştir, en son eskiyi sil"**
sırasıyla yapılır. MANIFEST değişikliği tek bir `rename` olduğu için çökme anında ya eski ya yeni dünya
görülür. Bütün `fsync` noktaları:

| Ne zaman                    | Ne fsync edilir                                     | Neden                                       |
| --------------------------- | --------------------------------------------------- | ------------------------------------------- |
| her `write_batch` (sync=True) | WAL dosyası                                       | onaylanan yazma güç kesintisinde de kalsın  |
| boşaltma/birleştirme        | yeni SSTable dosyası, sonra klasör                  | MANIFEST onu göstermeden önce diskte olsun  |
| boşaltma                    | yeni WAL'ın adı (klasör)                            | yeni WAL'a yazılan onaylı veri kaybolmasın  |
| MANIFEST değişimi           | MANIFEST.tmp, sonra `rename`, sonra klasör          | atomik ve kalıcı geçiş                      |
| kurtarma                    | kesilen WAL kuyruğu (dosya), silmeler (klasör)      | ikinci bir çökmede tutarlı kalsın           |
| `close()`                   | WAL                                                 | sync=False iken de temiz kapanış kayıpsız   |

## Bayt düzenleri

Tamsayıların hepsi küçük sonlu (little-endian), işaretsiz.

### WAL kaydı (bir kayıt = bir atomik toplu yazma)

```
 0        4        8        12
 ├────────┼────────┼────────┼──────┬───────────┬──────────┬────────┬─────────┬──────┬ ...
 │ crc32  │ uzunluk│ sayı   │ tür  │ anahtar_uz│ anahtar  │ değer_uz│ değer  │ tür  │ ...
 │ 4 bayt │ 4 bayt │ 4 bayt │ 1    │ 4         │ anahtar_uz│ 4      │ değer_uz│      │
 └────────┴────────┴────────┴──────┴───────────┴──────────┴────────┴─────────┴──────┴ ...
          └──────────────────── crc32 bu baytların hepsini kapsar ─────────────────────┘
 tür: 0 = put, 1 = sil (silmede değer_uz = 0)
```

Okurken: başlık eksikse, `uzunluk` dosyanın sonunu aşıyorsa, crc tutmuyorsa ya da yük çözülemiyorsa →
o kayıt ve sonrası yok sayılır, dosya son sağlam kaydın sonuna kısaltılır.

### SSTable dosyası

```
┌──────────────┬──────────────┬─────┬────────────┬─────────────┬──────────────────────────┐
│ veri bloğu 0 │ veri bloğu 1 │ ... │ Bloom bloğu│ dizin bloğu │ alt bilgi (44 bayt)       │
└──────────────┴──────────────┴─────┴────────────┴─────────────┴──────────────────────────┘

veri bloğu  = girdi* + crc32(4)          (blok ≈ block_size bayta varınca kapanır)
girdi       = bayrak(1) anahtar_uz(4) anahtar değer_uz(4) değer      bayrak: 0 = değer, 1 = silme
Bloom bloğu = bit_sayısı(4) karma_sayısı(1) bitler(⌈bit_sayısı/8⌉)
dizin bloğu = [anahtar_uz(4) blok_ilk_anahtarı blok_konumu(8) blok_boyu(4)]*   (seyrek: blok başına 1)
alt bilgi   = dizin_konumu(8) dizin_boyu(4) bloom_konumu(8) bloom_boyu(4) girdi_sayısı(8)
              crc32(önceki 32 bayt)(4) sihir "SFRSST01"(8)
```

Nokta arama: Bloom "yok" derse dosyaya hiç dokunulmaz → değilse dizinde ikili arama → tek blok okunur.

### MANIFEST

```
{"next_file": 9, "tables": ["000008.sst", "000005.sst"], "version": 1, "wal": 7}
crc32=1a2b3c4d
```

## Dosya haritası

| Dosya         | Sorumluluk                                                                  |
| ------------- | --------------------------------------------------------------------------- |
| `store.py`    | `KVStore`: yazma/okuma yolu, boşaltma, birleştirme, kurtarma; `Options`      |
| `wal.py`      | WAL kayıt biçimi, ekleme, yeniden oynatma ve bozuk kuyruğu kesme            |
| `memtable.py` | sıralı bellek tablosu                                                       |
| `sstable.py`  | SSTable yazıcı ve okuyucu (bloklar, seyrek dizin, alt bilgi)                 |
| `bloom.py`    | Bloom süzgeci                                                               |
| `merge.py`    | "en yeni kazanır" k-yollu birleştirme yineleyicisi                          |
| `manifest.py` | MANIFEST biçimi ve atomik güncelleme                                        |
| `fs.py`       | dosya sistemi arayüzü + gerçek disk (`RealFS`)                              |
| `sim_fs.py`   | bellek içi, çökme benzetimli dosya sistemi (hata enjektörü, testler için)   |
| `__main__.py` | komut satırı                                                                |

## Güvenceler (testle kanıtlanan)

- **Onaylanan yazma kaybolmaz** (`sync=True`): Bir iş yükü çalışırken dosya sistemindeki *her* adımda
  (yazma, fsync, rename, silme, klasör fsync'i…) süreç öldürülür ya da güç kesilir; yeniden açılan
  depo, onaylanmış toplu yazmaların hepsini içerir (`tests/anahtar_deger/test_crash.py`).
- **Atomik toplu yazma:** Çökme anında yarıda kalan toplu yazma ya bütünüyle görünür ya hiç.
- **Kurtarma da çökmeye dayanıklı:** Kurtarmanın kendisi yarıda kesilse de sonraki açılış aynı durumu
  verir (aynı testte "ikinci çökme").
- **Doğruluk:** Rastgele put/delete/get/scan/flush/compact/yeniden-açma dizileri bir `dict` modeliyle
  aynı sonucu verir (Hypothesis, `test_store.py`).
- **Bozulma algılama:** WAL kaydı, SSTable bloğu ve alt bilgisi, MANIFEST sağlama toplamlıdır.
- **Testin dişleri:** Bilerek bozulmuş iki sürüm (WAL'da fsync yok; MANIFEST yerinde yazılıyor) çökme
  denetleyicisine yakalatılır. Geliştirme sırasında elle denenen 6 bozuk sürümün (eski WAL'ı manifestten
  önce silmek, flush ya da kurtarmada klasör fsync'ini atlamak, CRC denetimini kaldırmak dahil) hepsi
  yakalandı.

## Sağlamadıkları (dürüst sınırlar)

- **`sync=False` iken güç kesintisinde son yazmalar kaybolur** (süreç ölümünde kaybolmaz). Kaybolanlar
  hep bir *sonek*tir: görülen durum her zaman yazma sırasının bir önekidir (testle gösterilir).
- **Eşzamanlılık yok:** Tek iş parçacığı, tek süreç. İki süreç aynı klasörü açarsa veri bozulur (kilit
  dosyası yok).
- **Tarama yalıtımı sınırlı:** Tarama sürerken birleştirme olursa tarama açık bir `RuntimeError` ile
  durur (sessizce yanlış sonuç vermez); yeniden başlatmak gerekir.
- **Ortadaki bozulma onarılmaz:** WAL'ın ortasındaki bozuk bir kayıt, ardından gelen sağlam kayıtların
  da atılmasına yol açar (yalnız kuyruk bozulması beklenir). SSTable bozulması `CorruptionError` verir.
- **Çökme modeli:** Klasör fsync'i dışında kalan klasör işlemlerinin herhangi bir alt kümesinin
  kalıcılaştığı varsayılır; fsync'e "yalan söyleyen" diskler ve sektör bozulması modellenmez.
- **Başarım:** Saf Python; on binlerce anahtar için uygundur, milyonlar için değil. Birleştirme
  "hepsini birleştir" (boyut katmanlı) yapılır; yazma büyütmesi (write amplification) yüksektir.

## Buradan nereye

1. **Seviyeli birleştirme (leveled compaction):** MANIFEST'te seviye listeleri; L0→L1 kısmi birleştirme.
   Silme işaretleri yalnız en alt seviyeye inerken atılmalı.
2. **Anlık görüntü (snapshot) okuma:** Girdilere sıra numarası ekle (WAL ve SSTable biçimi değişir),
   `merge.py`'ye "seq <= anlık" süzgeci koy.
3. **Arka plan boşaltma:** Değişmez bellek tablosu + iş parçacığı; dosya sırası kuralları aynen korunur.
4. **Blok önbelleği ve sıkıştırma:** `SSTableReader._read_block`'u bir LRU ile sarmak; blok başına
   `zlib` sıkıştırma bayrağı.
5. **Kilit dosyası:** `LOCK` dosyası + `fcntl.flock` ile ikinci sürecin açmasını engellemek.
6. **Önek araması ve TTL:** `scan(önek, önek + b"\xff")` yardımcısı; değerlere son kullanma zamanı.
