---
baslik: Veritabanı ölçekleme: dizinden parçalamaya
ozet: Veritabanı yavaşlayınca doğru sıra; dizin ve sorgu en iyileme, bağlantı havuzu, okuma kopyaları ve kopya gecikmesi, bölümleme ve parçalama anahtarı, sıcak anahtar, SQLite'ın yettiği ve yetmediği yer.
etiketler: [veritabani, olcekleme, dizin, parcalama, sqlite, kopya]
duzey: ileri
guncellik: 2026-11
---

# Veritabanı ölçekleme: dizinden parçalamaya

> Bu notu ne zaman okumalı: sorgular yavaşladığında; "database is locked" ya da "too many connections" hatası
> görüldüğünde; okuma kopyası, parçalama (sharding) ya da "SQLite'tan Postgres'e geçelim" önerisi geldiğinde.

## Temel fikir

- Veritabanı çoğu sistemin son darboğazıdır, çünkü **durum** oradadır: uygulama sunucusu kopyalanır, veri kolay
  kopyalanmaz. Bu yüzden ucuz adımlar sırayla tüketilir; pahalı adım (parçalama) en sona kalır.
- Sıra: **ölç → dizin ve sorgu → bağlantı havuzu → önbellek → dikey büyüt → okuma kopyası → işlevsel ayrıştırma
  → bölümleme/parçalama.** Her adım bir öncekinin ölçülmüş olarak yetmediği yerde başlar.
- Yavaş sistemlerin çoğunda sorun donanım değil, **tarama**dır: dizinsiz koşul, N+1 sorgu, gereksiz sütun ve satır.
- Okuma kopyası okumayı ölçekler ama **bayat okuma** getirir; parçalama yazmayı ölçekler ama parçalar arası sorgu,
  işlem ve benzersizliği zorlaştırır. İkisi de uygulama kodunu değiştirir.

## Karar tablosu

| Belirti                                                       | Seçim                                                       | Neden                                              |
| ------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| Belli sorgular yavaş                                           | Sorgu planı (`EXPLAIN`), bileşik dizin, N+1'i birleştirme   | Çoğu yavaşlık budur; bedava                        |
| Sayfa başına onlarca sorgu                                     | Birleştirme (`JOIN`) ya da `IN (...)` ile toplu okuma        | Ağ üstündeki veritabanında her sorgu bir gidiş-dönüş |
| "too many connections", bağlantı beklemesi                     | Havuz boyunu Little yasasıyla seç; bağlantı vekili           | Fazla bağlantı veritabanını yavaşlatır              |
| Aynı pahalı okumalar tekrar tekrar                             | Önbellek ([Önbellek katmanları](onbellek-katmanlari.md))    | Okumayı veritabanından uzaklaştırır                |
| CPU/bellek doluyor, sorgular zaten iyi                         | Dikey büyüt                                                 | Kod değişmez; veritabanında en verimli adım        |
| Okuma ağırlıklı, bayatlığa dayanıklı ekranlar (rapor, liste)   | Okuma kopyası + yönlendirme kuralları                        | Okuma ölçeklenir; yazma yolu değişmez              |
| Bir tablo (olay günlüğü, analitik) ötekileri boğuyor           | İşlevsel ayrıştırma: o tabloyu ayrı veritabanına            | Parçalamadan çok daha basit                         |
| Eski veri hiç okunmuyor ama tablo dev                          | Zamana göre bölümleme, eskiyi arşivle                       | Silme ve dizin bakımı ucuzlar ([Veri yaşam döngüsü](veri-yasam-dongusu.md)) |
| Tek makinenin yazma kapasitesi ölçülerek aşıldı                | Parçalama (sharding)                                        | Tek gerçek yazma ölçekleme yolu; en pahalısı       |

## Önce dizin ve sorgu

Sorgu planı veritabanının satırları nasıl bulacağını söyler: `SCAN` bütün tabloyu okur, `SEARCH … USING INDEX`
dizinden gider. Aşağıdaki örnek aynı sorgunun SQLite sanal makinesinde yaptığı işi sayar:

```python calistir
import sqlite3

db = sqlite3.connect(":memory:")
db.execute("CREATE TABLE gorev (id INTEGER PRIMARY KEY, kullanici_id INTEGER, durum TEXT, baslik TEXT)")
db.executemany(
    "INSERT INTO gorev (kullanici_id, durum, baslik) VALUES (?, ?, ?)",
    ((i % 5_000, "acik" if i % 3 else "bitti", f"görev {i}") for i in range(100_000)),
)
sayac = [0]
db.set_progress_handler(lambda: sayac.__setitem__(0, sayac[0] + 1) or 0, 10)  # her 10 komutta bir çağrılır


def is_miktari(sql: str, *parametre: object) -> int:
    """Sorgunun SQLite sanal makinesinde yaptığı iş (yaklaşık komut sayısı)."""
    sayac[0] = 0
    db.execute(sql, parametre).fetchall()
    return sayac[0] * 10


SORGU = "SELECT id, baslik FROM gorev WHERE kullanici_id = ? AND durum = 'acik'"
plan_once, once = db.execute("EXPLAIN QUERY PLAN " + SORGU, (42,)).fetchone()[3], is_miktari(SORGU, 42)
db.execute("CREATE INDEX gorev_kullanici_durum ON gorev (kullanici_id, durum)")
plan_sonra, sonra = db.execute("EXPLAIN QUERY PLAN " + SORGU, (42,)).fetchone()[3], is_miktari(SORGU, 42)
print(f"dizinsiz: ~{once:>7} komut | {plan_once}")
print(f"dizinli : ~{sonra:>7} komut | {plan_sonra}")
assert "SCAN" in plan_once and "USING INDEX" in plan_sonra
assert once > 1_000 * sonra  # bu ortamda ~300 000'e karşı ~90
```

Bileşik dizinde sütun sırası önemlidir: önce eşitlikle aranan sütunlar (`kullanici_id`, `durum`), sonra aralık ya
da sıralama sütunu (`olusturma`). Dizin her yazmayı biraz yavaşlatır; yalnız gerçekten kullanılan sorgular için
ekleyin ve kullanılmayanları silin.

**N+1 sorgu:** listeyi alıp her satır için ayrı sorgu atmak. SQLite aynı süreçte çalıştığı için bunu az hisseder;
ağ üstündeki bir veritabanına geçince her sorgu bir gidiş-dönüş olur ve sayfa birden yavaşlar:

```python calistir
import sqlite3

db = sqlite3.connect(":memory:")
db.executescript("""
CREATE TABLE kullanici (id INTEGER PRIMARY KEY, ad TEXT);
CREATE TABLE gorev (id INTEGER PRIMARY KEY, kullanici_id INTEGER REFERENCES kullanici (id), baslik TEXT);
""")
db.executemany("INSERT INTO kullanici VALUES (?, ?)", ((i, f"kişi {i}") for i in range(100)))
db.executemany("INSERT INTO gorev VALUES (?, ?, ?)", ((i, i % 100, f"görev {i}") for i in range(1_000)))
sorgular: list[str] = []
db.set_trace_callback(sorgular.append)  # çalışan her ifadeyi kaydeder

# YANLIŞ (N+1): listeyi al, sonra her satır için ayrı sorgu
gorevler = db.execute("SELECT id, kullanici_id, baslik FROM gorev ORDER BY id LIMIT 100").fetchall()
yanlis = [(g[2], db.execute("SELECT ad FROM kullanici WHERE id = ?", (g[1],)).fetchone()[0]) for g in gorevler]
n_arti_1 = len(sorgular)

sorgular.clear()  # DOĞRU: tek sorguda birleştir
dogru = db.execute(
    "SELECT g.baslik, k.ad FROM gorev g JOIN kullanici k ON k.id = g.kullanici_id ORDER BY g.id LIMIT 100"
).fetchall()
assert dogru == yanlis and n_arti_1 == 101 and len(sorgular) == 1
print(f"N+1: {n_arti_1} sorgu, birleştirme: {len(sorgular)} sorgu")
print(f"ağ beklemesi (sorgu başına 0,5 ms varsayımı): {n_arti_1 * 0.5:.0f} ms ↔ {len(sorgular) * 0.5} ms")
```

```cikti
N+1: 101 sorgu, birleştirme: 1 sorgu
ağ beklemesi (sorgu başına 0,5 ms varsayımı): 50 ms ↔ 0.5 ms
```

Geliştirmede her istekteki sorgu sayısını günlüğe yazın; sayı liste boyuyla birlikte artıyorsa N+1 vardır.

## Bağlantı havuzu

- Havuz boyu Little yasasıyla seçilir: istek/sn × istek başına bağlantı tutma süresi × 2–3 pay
  ([Kapasite tahmini](kapasite-tahmini.md)). "Bol olsun" diye büyük havuz, veritabanında kilit ve bağlam değişimi
  yarışı demektir; Postgres'te her bağlantı ayrı bir süreçtir.
- Toplam bağlantı = sunucu sayısı × süreç sayısı × havuz boyu. Yatay büyümede bu çarpım veritabanı sınırını aşar;
  çok kopyada bağlantı vekili (ör. PgBouncer) kullanılır.
- İşlem içinde ağ çağrısı (e-posta, ödeme, dil modeli) yapılmaz: bağlantıyı ve kilidi saniyelerce tutar.

## SQLite ne zaman yeter, ne zaman yetmez

SQLite sunucusuz, tek dosyalık bir veritabanıdır ve tek makinede çok iyi ölçeklenir; sınırı **tek yazıcı**dır:
aynı anda yalnız bir yazma işlemi ilerler, okuyucular (WAL kipinde) beklemez.

```python calistir
import os
import sqlite3
import tempfile

yol = os.path.join(tempfile.mkdtemp(), "uygulama.db")
yazar_a = sqlite3.connect(yol, isolation_level=None)
yazar_a.execute("PRAGMA journal_mode = WAL")  # okuyucular yazarı, yazar okuyucuları beklemez
yazar_a.execute("CREATE TABLE kayit (x INTEGER)")
yazar_b = sqlite3.connect(yol, isolation_level=None, timeout=0)  # beklemeden hata versin
okuyucu = sqlite3.connect(yol, isolation_level=None)

yazar_a.execute("BEGIN IMMEDIATE")  # yazma kilidini baştan al
yazar_a.execute("INSERT INTO kayit VALUES (1)")
try:
    yazar_b.execute("BEGIN IMMEDIATE")  # ikinci yazar: aynı anda tek yazar olabilir
    raise AssertionError("ikinci yazar kilidi alamamalıydı")
except sqlite3.OperationalError as hata:
    assert "locked" in str(hata)
assert okuyucu.execute("SELECT count(*) FROM kayit").fetchone()[0] == 0  # okuyucu beklemedi, eski hâli gördü
yazar_a.execute("COMMIT")

yazar_b.execute("BEGIN IMMEDIATE")  # kilit boşaldı, şimdi alır
yazar_b.execute("INSERT INTO kayit VALUES (2)")
yazar_b.execute("COMMIT")
assert okuyucu.execute("SELECT count(*) FROM kayit").fetchone()[0] == 2
print("tek yazar, çok okuyucu: doğrulandı")
```

```cikti
tek yazar, çok okuyucu: doğrulandı
```

| Durum                                                            | SQLite yeter mi | Not                                                          |
| ---------------------------------------------------------------- | --------------- | ------------------------------------------------------------ |
| Tek sunucu, okuma ağırlıklı, kısa yazma işlemleri                 | Evet            | WAL + `busy_timeout` + yazmalarda `BEGIN IMMEDIATE`          |
| Saniyede yüzlerce kısa yazma                                      | Çoğunlukla evet | Toplu yazma (tek işlemde çok satır) büyük fark yaratır; ölçün |
| Uzun süren yazma işlemleri (toplu içe aktarım, rapor yazımı)     | Dikkat          | Bütün yazarlar bekler; işi küçük işlemlere bölün             |
| Birden çok uygulama sunucusu aynı veritabanına yazacak           | Hayır           | SQLite ağ üstünden paylaşılmaz; Postgres                     |
| Ağ dosya sistemi (NFS, paylaşımlı disk) üstünde dosya            | Hayır           | Kilitler güvenilmez; bozulma riski                           |
| Kesintisiz yük devri (failover) gerekiyor                         | Hayır           | Sunucu veritabanı ve kopyası                                 |
| Diski geçici olan barındırma                                     | Hayır           | Her yeniden başlatmada veri silinir ([`YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md)) |

Havuzdaki API SQLite'ı bilinçli seçer (WAL, `busy_timeout`, eşitleme tek `BEGIN IMMEDIATE` işlemi:
[`api/KARARLAR.md`](../../uygulama/api/KARARLAR.md)); SQL, [`database.ts`](../../uygulama/api/src/db/database.ts)
sarmalayıcısının arkasında durduğu için Postgres'e geçiş tek katmanı değiştirir.

## Okuma kopyaları ve kopya gecikmesi

Birincil (primary) veritabanı yazmaları alır, kopyalar (replica) onu **eşzamansız** izler; aradaki fark kopya
gecikmesidir (replication lag) ve yük altında saniyelere çıkabilir. Yönlendirme kuralları:

| Okuma                                                         | Nereden                                  |
| ------------------------------------------------------------- | ---------------------------------------- |
| Kullanıcının az önce yazdığını gösteren ekran                 | Birincil (ya da sürüm belirteciyle kopya) |
| Yazmadan önceki doğrulama ("stok var mı", "ad alınmış mı")    | Birincil, aynı işlemde                   |
| Rapor, arama, herkese açık liste, pano                         | Kopya                                    |
| Arka plan işi, dışa aktarım                                   | Kopya (gecikmeyi tolere eder)            |

- Kopya gecikmesini **ölçün** ve izleyin; eşik aşılınca okumalar birincile dönsün.
- Kopyadan okuyan ekran "bayat olabilir" diye tasarlanır. Kullanıcıya yansıması ve çözüm kalıpları ("kendi
  yazdığını oku", monoton okuma): [Tutarlılık modelleri](tutarlilik-modelleri.md).
- Kopya yedek değildir: yanlış bir `DELETE` kopyaya da gider ([Veri yaşam döngüsü](veri-yasam-dongusu.md)).

## Bölümleme ve parçalama

- **Bölümleme** (partitioning): tek veritabanında büyük tabloyu parçalara ayırmak (çoğunlukla zamana göre: ay ay).
  Eski bölümü silmek tek komuttur; sorgu yalnız ilgili bölüme bakar.
- **Parçalama** (sharding): veriyi birden çok veritabanına dağıtmak. Yazma ölçeklenir; bedeli: parçalar arası
  sorgu ve işlem, küresel benzersizlik, yeniden dengeleme.

Parçalama anahtarı en önemli karardır, sonradan değiştirmek neredeyse yeniden yazmaktır:

| Anahtar                        | İyi olduğu yer                                     | Kötü olduğu yer                                       |
| ------------------------------ | -------------------------------------------------- | ----------------------------------------------------- |
| Kiracı kimliği                 | İşletmelere satılan ürün: sorguların hepsi kiracı içi | Dev bir kiracı tek parçayı boğar                    |
| Kullanıcı kimliği              | Tüketici ürünü: kendi verisi                        | Kullanıcılar arası ekranlar (akış, mesaj) dağılır     |
| Zaman                          | Yalnız bölümleme için (eskiyi atmak)               | Parçalamada bütün yazma "son" parçaya gider (sıcak)    |
| Düşük çeşitlilikli alan (il, durum) | Hiçbir yerde                                   | Birkaç değer = birkaç dev parça                        |

Anahtarı parçaya eşlerken `özet % N` kullanılırsa parça sayısı değişince verinin neredeyse tamamı yer değiştirir;
**tutarlı özetleme** (consistent hashing) yalnız payına düşeni taşır:

```python calistir
import bisect
import hashlib


def ozet(metin: str) -> int:
    return int.from_bytes(hashlib.sha256(metin.encode()).digest()[:8], "big")


class Halka:
    """Tutarlı özetleme: her parça halkada 100 sanal noktaya yerleşir; anahtar saat yönündeki ilk noktaya gider."""

    def __init__(self, parcalar: list[str], sanal: int = 100) -> None:
        self.noktalar = sorted((ozet(f"{p}#{i}"), p) for p in parcalar for i in range(sanal))
        self.konumlar = [n for n, _ in self.noktalar]

    def parca(self, anahtar: str) -> str:
        return self.noktalar[bisect.bisect(self.konumlar, ozet(anahtar)) % len(self.noktalar)][1]


anahtarlar = [f"kullanici:{i}" for i in range(20_000)]
mod_tasinan = sum(ozet(k) % 4 != ozet(k) % 5 for k in anahtarlar) / len(anahtarlar)
h4, h5 = Halka(list("abcd")), Halka(list("abcde"))
halka_tasinan = sum(h4.parca(k) != h5.parca(k) for k in anahtarlar) / len(anahtarlar)
print(f"4 → 5 parça: mod-N ile verinin %{mod_tasinan * 100:.0f} kadarı, tutarlı özetlemeyle %{halka_tasinan * 100:.0f} kadarı taşınır")
assert mod_tasinan > 0.7 and halka_tasinan < 0.3
```

```cikti
4 → 5 parça: mod-N ile verinin %80 kadarı, tutarlı özetlemeyle %18 kadarı taşınır
```

Daha basit ve çoğu zaman yeterli seçenek: **arama tablosu** (kiracı → parça). Taşıma tek tek ve denetimli
yapılır, büyük kiracı kendi parçasına alınabilir ([Çok kiracılık](cok-kiracilik.md)).

### Sıcak anahtar

Parçalar dengeli olsa bile tek bir anahtar (ünlü hesap, büyük kiracı, kampanya ürünü) yükün büyük kısmını alırsa o
anahtarın parçası boğulur. Çare anahtarı alt anahtarlara bölmek (tuzlama, salting): yazma rastgele bir alt anahtara
gider, okuma hepsini birleştirir. Alt anahtar sayısı parça sayısının birkaç katı olmalıdır:

```python calistir
import hashlib
import random
from collections import Counter


def parca(anahtar: str, n: int = 4) -> int:
    return int.from_bytes(hashlib.sha256(anahtar.encode()).digest()[:8], "big") % n


rng = random.Random(9)
yazmalar = ["unlu-hesap" if rng.random() < 0.3 else f"hesap:{rng.randrange(50_000)}" for _ in range(100_000)]


def dengesizlik(anahtarlar: list[str]) -> float:
    yuk = Counter(parca(a) for a in anahtarlar)
    return max(yuk.values()) / (len(anahtarlar) / 4)  # en yüklü parça / ortalama


def tuzla(bolum: int) -> list[str]:
    # Sıcak anahtarı alt anahtarlara böl: yazma rastgele birine gider, okuma hepsini birleştirir
    return [f"{a}#{rng.randrange(bolum)}" if a == "unlu-hesap" else a for a in yazmalar]


duz, t8, t32 = dengesizlik(yazmalar), dengesizlik(tuzla(8)), dengesizlik(tuzla(32))
print(f"tek sıcak anahtar: en yüklü parça ortalamanın {duz:.2f} katı")
print(f"8 alt anahtar: {t8:.2f} katı | 32 alt anahtar: {t32:.2f} katı")
assert duz > 1.6 and t32 < t8 and t32 < 1.15
```

```cikti
tek sıcak anahtar: en yüklü parça ortalamanın 1.89 katı
8 alt anahtar: 1.30 katı | 32 alt anahtar: 1.07 katı
```

Bedel: okuma artık 32 alt anahtarı birleştirir. Bunu yalnız ölçülmüş sıcak anahtarlar için yapın; sayaçlarda
daha basit yol, yazmaları bellekte toplayıp saniyede bir toplu yazmaktır.

## Tuzaklar

| Belirti                                                       | Neden                                                         | Çözüm                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| Sorgu geliştirmede hızlı, üretimde yavaş                       | Geliştirme veritabanı küçük; dizinsiz tarama görünmüyor       | Üretim boyutunda veriyle `EXPLAIN`; yavaş sorgu günlüğü      |
| Dizin var ama kullanılmıyor                                   | Sütuna işlev uygulanmış (`lower(ad)`), sütun sırası yanlış, tür uyuşmazlığı | İfade dizini ya da katlanmış sütun; sütun sırasını düzelt |
| Postgres'e geçince sayfalar yavaşladı                          | N+1: her sorgu artık ağ gidiş-dönüşü                          | Birleştirme ya da toplu okuma                              |
| "database is locked"                                          | Uzun yazma işlemi ya da `busy_timeout` yok                    | Kısa işlem, `BEGIN IMMEDIATE`, `busy_timeout`               |
| Yatay büyüyünce "too many connections"                        | Sunucu × süreç × havuz çarpımı sınırı aştı                    | Küçük havuz + bağlantı vekili                               |
| Kullanıcı kaydettiği şeyi listede göremiyor                   | Okuma kopyadan, kopya geride                                  | Yazandan sonra birincilden oku ya da sürüm belirteci        |
| Parçalamadan sonra rapor sorgusu imkânsızlaştı                 | Parçalar arası birleştirme                                    | Raporu ayrı bir analitik kopyada/ambarda üret              |
| Yeni parça eklemek haftalar sürdü                              | `özet % N` eşlemesi                                           | Tutarlı özetleme ya da arama tablosu                        |
| Bir parça hep %90, ötekiler %20                                | Sıcak anahtar ya da kötü anahtar seçimi                       | Tuzlama, büyük kiracıyı ayırma, anahtarı yeniden düşünme    |
| Silme işlemi saatler sürüyor, her şeyi kilitliyor             | Dev tabloda tek seferde silme                                 | Küçük partiler ya da zamana göre bölüm silme                |

## Denetim listesi

- [ ] Yavaş sorgu günlüğü açık; en çok toplam süre yiyen 10 sorgu biliniyor.
- [ ] Her sık sorgunun planı `EXPLAIN` ile görüldü; tam tablo taraması bilinçli olanlar dışında yok.
- [ ] Geliştirmede istek başına sorgu sayısı ölçülüyor; N+1 yok.
- [ ] Havuz boyu hesapla seçildi; toplam bağlantı veritabanı sınırının altında.
- [ ] İşlem içinde ağ çağrısı yok; yazma işlemleri kısa.
- [ ] Okuma kopyası varsa: hangi okumanın nereye gittiği yazılı; kopya gecikmesi izleniyor.
- [ ] Parçalama düşünülüyorsa: dikey büyütme, önbellek, kopya ve işlevsel ayrıştırma ölçülerek tüketildi; anahtar
      seçiminin gerekçesi ve sıcak anahtar planı yazılı.
- [ ] SQLite kullanılıyorsa: WAL, `busy_timeout`, yazmada `BEGIN IMMEDIATE`, kalıcı disk, tek yazar süreç.

## Küçük modele yaptırırken

- **İsteme yazın:** "Yeni sorgu için `EXPLAIN QUERY PLAN` çıktısını göster; `SCAN` varsa dizin öner ve gerekçesini
  yaz. Liste uçlarında N+1 olmasın: ilişkili veriyi birleştirme ya da `IN` ile tek sorguda al. İşlem içinde ağ
  çağrısı yapma. Parçalama, kopya ya da yeni veritabanı önerme; önce ölçüm iste."
- **Modelin tipik hatası:** her sütuna ayrı dizin ekler (bileşik dizin yerine); ORM'in tembel yüklemesiyle N+1
  yaratır ve fark etmez; "ölçeklensin" diye ilk günden parçalama önerir; okuma kopyasından okuyup yazdığını
  hemen göstermeye çalışır.
- **Çıktıda arayın:** döngü içinde sorgu (`for … : db.execute(`), `SELECT *`, `LIKE '%…'` ile arama, işlem
  içinde `await fetch`/`requests.`; yeni dizinin gerçekten kullanıldığını gösteren plan çıktısı.
- **Doğrulama:** "100 000 satırlık sentetik veriyle önce/sonra planı ve süreyi göster" deyin.

## İlgili

- [Kapasite tahmini](kapasite-tahmini.md) (havuz boyu) · [Önbellek katmanları](onbellek-katmanlari.md) ·
  [Tutarlılık modelleri](tutarlilik-modelleri.md) · [Çok kiracılık](cok-kiracilik.md)
- [Veri yaşam döngüsü](veri-yasam-dongusu.md) (bölüm silme, arşiv, yedek ↔ kopya)
- Havuzdaki SQLite kullanımı: [`uygulama/api/src/db/database.ts`](../../uygulama/api/src/db/database.ts),
  [`uygulama/api/KARARLAR.md`](../../uygulama/api/KARARLAR.md); sıfırdan B+ ağacı (dizinin içi):
  [`sifirdan/veri/btree/`](../../sifirdan/veri/btree/tree.py)
