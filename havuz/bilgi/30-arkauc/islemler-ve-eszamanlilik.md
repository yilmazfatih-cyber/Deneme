---
baslik: İşlemler ve eşzamanlılık: kayıp güncelleme, yarış ve kilit
ozet: Veritabanı işleminin neyi garanti ettiği, yalıtım düzeyleri, kayıp güncelleme ve denetle-sonra-yaz yarışının çalışan örnekleri ve çözümleri, kilitlenme ve işlem içinde dış çağrı yapmama.
etiketler: [veritabani, eszamanlilik, islem, kilit, sqlite]
duzey: ileri
guncellik: 2026-11
---

# İşlemler ve eşzamanlılık: kayıp güncelleme, yarış ve kilit

> Bu notu ne zaman okumalı: bakiye, stok, kontenjan, sayaç, "kullanıcı adı alınmış mı" gibi bir değeri okuyup ona
> göre yazan her kodda; "bazen" çift kayıt, eksi stok ya da kaybolan güncelleme görüldüğünde; SQLite "database is
> locked" hatası verdiğinde.

## Temel fikir

Eşzamanlılık hatası için büyük trafik gerekmez: aynı kullanıcının çift tıklaması, iki sekmesi ya da ağ kopunca
yeniden deneyen istemcisi yeter. Hatanın kalıbı hep aynıdır:

1. Değeri oku (bakiye 100).
2. Uygulamada karar ver ya da hesapla (100 + 10).
3. Yaz (110).

1 ile 3 arasında başka bir istek aynı değeri değiştirirse onun işi silinir. Testte görünmez, çünkü testler sırayla
koşar. Çözüm her zaman şu üçünden biridir: **hesabı veritabanına yaptırmak** (atomik güncelleme), **yazarken
okuduğun hâlin hâlâ geçerli olduğunu şart koşmak** (iyimser sürüm, koşullu güncelleme, benzersizlik kısıtı) ya da
**okumadan önce kilit almak** (kötümser kilit).

İşlem (transaction) bunlara zemin sağlar: içindeki yazmaların ya hepsi ya hiçbiri kalıcı olur, kısıtlar kayıt
anında geçerlidir, kaydedilen veri çökmede kaybolmaz. Ama işlem tek başına yarışı **çözmez**; çoğu veritabanının
varsayılan yalıtım düzeyi kayıp güncellemeye izin verir.

## Yalıtım düzeyleri, sezgiyle

| Anomali                                        | Örnek                                                          | Read Committed | Repeatable Read (Postgres) | Serializable |
| ---------------------------------------------- | -------------------------------------------------------------- | -------------- | -------------------------- | ------------ |
| Kirli okuma                                    | Kaydedilmemiş veriyi görmek                                    | önlenir        | önlenir                    | önlenir      |
| Tekrarlanamayan okuma                          | Aynı işlemde iki okuma farklı değer verir                      | **olur**       | önlenir                    | önlenir      |
| Kayıp güncelleme (uygulamada oku-hesapla-yaz)  | İki yatırmadan biri kaybolur                                   | **olur**       | hata verir → yeniden dene  | hata verir   |
| Yazma çarpıklığı (write skew)                  | İki nöbetçi doktor aynı anda "öbürü nöbette" deyip çıkar       | **olur**       | **olur**                   | hata verir   |

- Postgres'in varsayılanı Read Committed'dir. Daha yüksek düzeylerde veritabanı çakışmada işlemi **iptal eder**;
  uygulama bütün işlemi baştan denemelidir. Yeniden deneme yoksa yüksek düzey, kullanıcıya hata göstermek demektir.
- MySQL'in varsayılanı ve davranışı farklıdır; kendi veritabanınızın belgesine bakın, ezbere güvenmeyin.
- SQLite aynı anda tek yazara izin verir; işlemler sıralıdır. WAL kipinde okuyucu, işlem başladığı andaki
  anlık görüntüyü görür. Buna rağmen **işlem dışında** okuyup sonra yazan kod kayıp güncelleme yapar (aşağıda).

## Kayıp güncelleme ve üç çözüm

Engel (barrier) iki iş parçacığını "ikisi de okudu, sonra ikisi de yazıyor" sırasına zorlar; gerçekte bunu ağ
gecikmesi yapar.

```python calistir
import os
import sqlite3
import tempfile
import threading

YOL = os.path.join(tempfile.mkdtemp(), "banka.db")
with sqlite3.connect(YOL) as kur:
    kur.execute("PRAGMA journal_mode = WAL")
    kur.execute("CREATE TABLE hesap (id INTEGER PRIMARY KEY, bakiye INTEGER NOT NULL, surum INTEGER NOT NULL)")


def baglan() -> sqlite3.Connection:
    return sqlite3.connect(YOL, timeout=5, isolation_level=None)


def ikisi_birden(yatir) -> int:
    """İki yatırma (10 ve 20) aynı anda. Başlangıç bakiyesi 100."""
    with sqlite3.connect(YOL) as db:
        db.execute("INSERT OR REPLACE INTO hesap VALUES (1, 100, 0)")
    engel = threading.Barrier(2)
    ipler = [threading.Thread(target=yatir, args=(t, engel)) for t in (10, 20)]
    for ip in ipler:
        ip.start()
    for ip in ipler:
        ip.join()
    with sqlite3.connect(YOL) as db:
        return db.execute("SELECT bakiye FROM hesap WHERE id = 1").fetchone()[0]


def yanlis(tutar: int, engel: threading.Barrier) -> None:  # oku → uygulamada hesapla → yaz
    db = baglan()
    eski = db.execute("SELECT bakiye FROM hesap WHERE id = 1").fetchone()[0]
    engel.wait()
    db.execute("UPDATE hesap SET bakiye = ? WHERE id = 1", (eski + tutar,))


def atomik(tutar: int, engel: threading.Barrier) -> None:  # 1) hesabı veritabanı yapar
    db = baglan()
    engel.wait()
    db.execute("UPDATE hesap SET bakiye = bakiye + ? WHERE id = 1", (tutar,))


def iyimser(tutar: int, engel: threading.Barrier) -> None:  # 2) sürüm tutmazsa baştan dene
    db = baglan()
    ilk = True
    while True:
        eski, surum = db.execute("SELECT bakiye, surum FROM hesap WHERE id = 1").fetchone()
        if ilk:
            engel.wait()
            ilk = False
        degisen = db.execute(
            "UPDATE hesap SET bakiye = ?, surum = surum + 1 WHERE id = 1 AND surum = ?", (eski + tutar, surum)
        ).rowcount
        if degisen == 1:
            return  # 0 ise başkası araya girdi: güncel değeri okuyup yeniden dene


assert ikisi_birden(yanlis) in (110, 120)  # 130 olmalıydı: bir yatırma KAYBOLDU
assert ikisi_birden(atomik) == 130
assert ikisi_birden(iyimser) == 130
print("yanlış yol bir yatırmayı kaybetti; atomik ve iyimser yol 130 buldu")
```

```cikti
yanlış yol bir yatırmayı kaybetti; atomik ve iyimser yol 130 buldu
```

| Çözüm                         | Ne zaman                                                         | Nasıl                                                                 |
| ----------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| Atomik güncelleme             | Hesap tek komutla ifade edilebiliyor (sayaç, bakiye, stok)       | `SET bakiye = bakiye + ?`; koşul varsa `WHERE kalan > 0`             |
| İyimser sürüm (optimistic)    | Kullanıcı bir formu dakikalarca düzenliyor; çakışma seyrek       | `WHERE id = ? AND surum = ?`; 0 satır → 409 "başkası değiştirdi" ya da yeniden dene |
| Kötümser kilit (pessimistic)  | Çakışma sık, iş kısa, birden çok satır birlikte değişiyor        | Postgres `SELECT … FOR UPDATE`; SQLite `BEGIN IMMEDIATE`             |

HTTP düzeyinde iyimser kilit: yanıtta `ETag` (sürüm), güncellemede `If-Match`; tutmazsa `412`
([HTTP temelleri](http-temelleri.md)).

## Denetle-sonra-yaz yarışı

"Stok var mı → varsa düş", "kullanıcı adı boş mu → boşsa kaydet", "kupon kullanılmış mı → değilse kullan". Okuma
ile yazma ayrı komut olduğu sürece arada başkası aynı denetimden geçer:

```python calistir
import os
import sqlite3
import tempfile
import threading

YOL = os.path.join(tempfile.mkdtemp(), "stok.db")
with sqlite3.connect(YOL) as kur:
    kur.execute("PRAGMA journal_mode = WAL")
    kur.execute("CREATE TABLE urun (id INTEGER PRIMARY KEY, kalan INTEGER NOT NULL CHECK (kalan >= 0))")


def kampanya(satin_al) -> tuple[int, int]:
    """Son 3 ürün; 8 kişi aynı anda 'satın al'a basıyor."""
    with sqlite3.connect(YOL) as db:
        db.execute("INSERT OR REPLACE INTO urun VALUES (1, 3)")
    satilan: list[bool] = []
    engel = threading.Barrier(8)
    ipler = [threading.Thread(target=lambda: satilan.append(satin_al(engel))) for _ in range(8)]
    for ip in ipler:
        ip.start()
    for ip in ipler:
        ip.join()
    with sqlite3.connect(YOL) as db:
        return sum(satilan), db.execute("SELECT kalan FROM urun").fetchone()[0]


def denetle_sonra_yaz(engel) -> bool:  # YANLIŞ
    db = sqlite3.connect(YOL, timeout=5, isolation_level=None)
    kalan = db.execute("SELECT kalan FROM urun WHERE id = 1").fetchone()[0]
    engel.wait()  # 8 kişi de "stok var" gördü
    if kalan > 0:
        db.execute("UPDATE urun SET kalan = ? WHERE id = 1", (kalan - 1,))
        return True
    return False


def kosullu_guncelleme(engel) -> bool:  # DOĞRU: denetim ve yazma tek komutta
    db = sqlite3.connect(YOL, timeout=5, isolation_level=None)
    engel.wait()
    return db.execute("UPDATE urun SET kalan = kalan - 1 WHERE id = 1 AND kalan > 0").rowcount == 1


assert kampanya(denetle_sonra_yaz) == (8, 2)  # 3 ürün 8 kişiye "satıldı", stok hâlâ 2 görünüyor
assert kampanya(kosullu_guncelleme) == (3, 0)
print("tamam")
```

```cikti
tamam
```

- Tekillik kuralında ("kullanıcı adı alınmış mı") tek doğru savunma **benzersizlik kısıtıdır**: önce denetim
  kullanıcıya hızlı ileti verir ama yarışı kapatmaz. Kısıt ihlali yakalanır ve 409'a çevrilir; ya da
  `INSERT … ON CONFLICT DO NOTHING` yazılıp etkilenen satır sayısına bakılır.
- Kontenjan, kupon, son ürün: koşullu güncelleme (`WHERE kalan > 0`) ve etkilenen satır sayısı.
- Karar birden çok satıra bakıyorsa (yazma çarpıklığı: "nöbette en az bir doktor kalmalı") ya ilgili satırları
  kilitleyin (`FOR UPDATE`) ya da Serializable + yeniden deneme kullanın.

## SQLite'a özgü: "database is locked"

SQLite'ta `BEGIN` ertelenmiş (deferred) işlem açar: kilit ilk yazmada alınır. İki bağlantı önce okur, sonra yazmaya
kalkarsa ikincinin okuduğu an eskimiştir; SQLite onu bekletmez, **hemen** hata verir. `busy_timeout` bunu
çözmez:

```python calistir
import os
import sqlite3
import tempfile

YOL = os.path.join(tempfile.mkdtemp(), "kilit.db")
with sqlite3.connect(YOL) as kur:
    kur.execute("PRAGMA journal_mode = WAL")
    kur.execute("CREATE TABLE sayac (n INTEGER)")
    kur.execute("INSERT INTO sayac VALUES (0)")
a = sqlite3.connect(YOL, timeout=2, isolation_level=None)
b = sqlite3.connect(YOL, timeout=2, isolation_level=None)
a.execute("BEGIN")  # ertelenmiş: henüz kilit yok
b.execute("BEGIN")
a.execute("SELECT n FROM sayac").fetchone()  # ikisi de okudu: anlık görüntü aldı
b.execute("SELECT n FROM sayac").fetchone()
a.execute("UPDATE sayac SET n = n + 1")
a.execute("COMMIT")
try:
    b.execute("UPDATE sayac SET n = n + 1")  # b'nin gördüğü an eskidi
    raise AssertionError("hata bekleniyordu")
except sqlite3.OperationalError as hata:
    assert "locked" in str(hata)  # 2 sn beklemeden, hemen
b.execute("ROLLBACK")
# Çözüm: yazacak işlem kilidi BAŞTA alır; öteki baştan bekler ve güncel değeri okur
b.execute("BEGIN IMMEDIATE")
b.execute("UPDATE sayac SET n = n + 1")
b.execute("COMMIT")
assert a.execute("SELECT n FROM sayac").fetchone() == (2,)
print("tamam")
```

```cikti
tamam
```

Havuzdaki sarmalayıcı her işlemi `BEGIN IMMEDIATE` ile açar ve işlem işlevinin içinde `await`'i yasaklar
([`database.ts`](../../uygulama/api/src/db/database.ts)); iki ayrı bağlantıdan aynı anda yazan eşitlemenin
sürüm numaralarının çakışmadığını iş parçacıklı bir test kanıtlar ([`concurrency.test.ts`](../../uygulama/api/test/concurrency.test.ts)).

## Kilitlenme (deadlock)

İki işlem satırları ters sırayla kilitlerse (A: önce 1 sonra 2; B: önce 2 sonra 1) ikisi de ötekini bekler.
Postgres ve MySQL bunu fark edip birini iptal eder; uygulama o işlemi yeniden dener.

- Satırları **hep aynı sırayla** kilitleyin (ör. kimliğe göre sıralayıp `FOR UPDATE`): para aktarımında küçük
  kimlikli hesap önce.
- İşlemleri kısa tutun; işlem içinde kullanıcı girdisi, ağ çağrısı, uzun hesap yok.
- Kilitlenme ve serileştirme hatası **beklenen** hatalardır: bütün işlemi baştan, 2–3 deneme ve rastgele kısa
  beklemeyle yeniden deneyin. İşlem gövdesi bunun için yan etkisiz olmalıdır.

## İşlem içinde dış çağrı yapmayın

E-posta, ödeme sağlayıcısı, başka bir API, dosya yükleme işlem içinde çağrılırsa:

- Kilitler ağ süresince tutulur; havuzdaki bağlantılar tükenir, SQLite'ta bütün yazmalar durur.
- Dış çağrı başarılı olup işlem geri alınırsa dünya ile veritabanı ayrışır: "siparişiniz alındı" e-postası olmayan
  bir sipariş için gider.

Çözüm **giden kutusu (transactional outbox)**: dış iş "yapılacak" diye aynı işlemde bir tabloya yazılır; işlem
kaydedildikten sonra ayrı bir işçi onu gönderir. İşlem geri alınırsa satır da geri alınır.

```python calistir
import json
import sqlite3

db = sqlite3.connect(":memory:", isolation_level=None)
db.executescript("""
CREATE TABLE stok (urun TEXT PRIMARY KEY, kalan INTEGER NOT NULL CHECK (kalan >= 0));
CREATE TABLE siparis (id INTEGER PRIMARY KEY, urun TEXT NOT NULL);
CREATE TABLE giden_kutusu (id INTEGER PRIMARY KEY, veri TEXT NOT NULL, gonderildi INTEGER NOT NULL DEFAULT 0);
INSERT INTO stok VALUES ('simit', 1);
""")
gonderilen: list[dict] = []


def eposta_gonder(veri: dict) -> None:  # gerçekte ağ çağrısı: yavaş, başarısız olabilir
    gonderilen.append(veri)


def siparis_ver(urun: str, dogru_yol: bool) -> None:
    db.execute("BEGIN IMMEDIATE")
    try:
        sid = db.execute("INSERT INTO siparis (urun) VALUES (?)", (urun,)).lastrowid
        if dogru_yol:  # "gönderilecek" olarak AYNI işlemde yazılır
            db.execute("INSERT INTO giden_kutusu (veri) VALUES (?)", (json.dumps({"siparis": sid}),))
        else:  # YANLIŞ: işlem içinde dış çağrı
            eposta_gonder({"siparis": sid})
        db.execute("UPDATE stok SET kalan = kalan - 1 WHERE urun = ?", (urun,))  # stok biterse CHECK patlar
        db.execute("COMMIT")
    except sqlite3.IntegrityError:
        db.execute("ROLLBACK")


def kutuyu_bosalt() -> None:  # işlemden SONRA, ayrı bir işçi
    for kid, veri in db.execute("SELECT id, veri FROM giden_kutusu WHERE gonderildi = 0").fetchall():
        eposta_gonder(json.loads(veri))
        db.execute("UPDATE giden_kutusu SET gonderildi = 1 WHERE id = ?", (kid,))


siparis_ver("simit", dogru_yol=False)  # stok vardı: sipariş 1
siparis_ver("simit", dogru_yol=False)  # stok yok: işlem geri alındı AMA e-posta çoktan gitti
assert gonderilen == [{"siparis": 1}, {"siparis": 2}]
assert db.execute("SELECT count(*) FROM siparis").fetchone() == (1,)  # 2 numaralı sipariş yok!

gonderilen.clear()
db.execute("UPDATE stok SET kalan = 1")
siparis_ver("simit", dogru_yol=True)
siparis_ver("simit", dogru_yol=True)  # geri alındı: giden kutusu satırı da geri alındı
kutuyu_bosalt()
assert len(gonderilen) == 1
print("yanlış yol olmayan sipariş için e-posta attı; giden kutusu atmadı")
```

```cikti
yanlış yol olmayan sipariş için e-posta attı; giden kutusu atmadı
```

Gönderen işçi en az bir kez gönderir (çökme anında iki kez gidebilir); alıcı tarafın idempotent olması ve
yeniden deneme kuralları: [Arka plan işleri](arka-plan-isleri.md). Havuzdaki API şimdilik e-postayı işlemden sonra
bellek içi bir işle gönderir; kalıcı kuyruk olmadığı sınırını README'de yazar ([`background.ts`](../../uygulama/api/src/lib/background.ts)).

## Tuzaklar

| Belirti                                                          | Neden                                                   | Çözüm                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| Bakiye/sayaç ara sıra eksik                                      | Uygulamada oku-hesapla-yaz                              | `SET x = x + ?`                                                |
| Stok eksiye düştü ya da kontenjan aşıldı                         | Denetim ve düşüm ayrı komut                             | `UPDATE … WHERE kalan > 0` + etkilenen satır sayısı; `CHECK`   |
| Aynı kullanıcı adıyla iki hesap                                  | "Var mı?" sorgusu sonra ekleme                          | Benzersizlik kısıtı; ihlalde 409                               |
| İki kişi aynı formu kaydetti, birinin değişikliği kayboldu       | Son yazan kazanır, sürüm denetimi yok                   | Sürüm alanı / `If-Match`; çakışmada 409 ve kullanıcıya göster  |
| SQLite: `busy_timeout` var ama "database is locked" hemen geliyor | Ertelenmiş işlem önce okudu, sonra yazmaya kalktı       | Yazacak işlemi `BEGIN IMMEDIATE` ile açın                      |
| Postgres: "could not serialize access" / "deadlock detected"     | Yüksek yalıtım ya da ters sırada kilit                  | Bütün işlemi yeniden deneyin; kilit sırasını sabitleyin        |
| Yoğunlukta bütün istekler yavaşladı, bağlantı havuzu doldu       | İşlem içinde ağ çağrısı ya da uzun hesap                | Dış çağrıları işlem dışına; giden kutusu                       |
| Olmayan sipariş için e-posta/ödeme gitti                         | Dış çağrı işlem içinde, sonra geri alma                 | Giden kutusu                                                   |
| "Testte hiç olmuyor"                                             | Testler sırayla koşuyor                                 | Engelle (barrier) zorlanan eşzamanlı test                      |
| Node'da işlem içinde `await` sonrası tuhaf veri                  | Eşzamansız işlem arasına başka istek girdi              | İşlem işlevi eşzamanlı olsun ya da sürücünün işlem nesnesini kullanın |

## Denetim listesi

- [ ] Okuyup ona göre yazan her kod için çözüm seçildi: atomik, koşullu/sürümlü ya da kilitli.
- [ ] Tekillik kuralları benzersizlik kısıtıyla korunuyor; ihlal 409'a çevriliyor.
- [ ] Stok/kontenjan gibi alt sınırlar hem koşullu güncellemede hem `CHECK` kısıtında.
- [ ] Kullanıcının uzun düzenlediği kayıtlarda sürüm alanı var; çakışma kullanıcıya gösteriliyor.
- [ ] İşlemler kısa; içinde ağ çağrısı, dosya işi, kullanıcı beklemesi yok.
- [ ] Dış yan etkiler giden kutusu ya da işlem sonrası işle yapılıyor.
- [ ] Serileştirme/kilitlenme hataları için sınırlı yeniden deneme var.
- [ ] SQLite: yazan işlemler `BEGIN IMMEDIATE`, `busy_timeout` ayarlı, WAL açık.
- [ ] En az bir eşzamanlılık testi (iki bağlantı + engel) var.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu değer eşzamanlı isteklerle değişebilir. Oku-hesapla-yaz yapma: atomik `UPDATE … SET x = x
  + ?` ya da `WHERE surum = ?` kullan, etkilenen satır sayısına bak. İşlem içinde ağ çağrısı yapma. Eşzamanlı iki
  isteği engelle zorlayan bir test yaz."
- **Tipik hatalar:** önce `SELECT`, sonra uygulamada `if`, sonra `UPDATE` yazmak; "var mı?" denetimini benzersizlik
  kısıtı sanmak; işlem içinde `await fetch(...)`; hatayı yakalayıp yeniden denemeden kullanıcıya 500 göstermek;
  yarışı `sleep` ile "çözmek".
- **Çıktıda arayın:** aynı işlevde aynı tabloya `SELECT` ardından `UPDATE`; `transaction(async`; işlem bloğunun
  içinde `fetch`, `send`, `mailer`; `rowcount`/`changes` değerine bakılmayan koşullu güncellemeler.
- **Doğrulama:** yukarıdaki engelli test kalıbını modele verin ve kendi kodu için yazdırın.

## İlgili

- [Veritabanı tasarımı](veritabani-tasarimi.md) (kısıtlar) · [API tasarımı](api-tasarimi.md) (idempotentlik
  anahtarı) · [Arka plan işleri](arka-plan-isleri.md) (giden kutusunu boşaltan işçi) ·
  [Ödeme tümleştirme](odeme-tumlestirme.md)
- Çalışan kod: [`uygulama/api/src/modules/sync/service.ts`](../../uygulama/api/src/modules/sync/service.ts)
  (tek `BEGIN IMMEDIATE` işlemiyle eşitleme) ve [`api/KARARLAR.md`](../../uygulama/api/KARARLAR.md).
- Dilin ve veritabanının yanı: [SQL performans ve işlem](../10-diller/sql-performans-ve-islem.md),
  [JavaScript async kalıpları](../10-diller/javascript-async.md), [Python eşzamanlılık](../10-diller/python-eszamanlilik.md);
  çok sunucuda: [Tutarlılık modelleri](../40-sistem-tasarimi/tutarlilik-modelleri.md).
- Yalıtım düzeylerinin içi: MVCC ile iki aşamalı kilitlemenin sıfırdan gerçeklemesi, kilitlenme algılama ve
  anomalilerin belirlenimci zamanlayıcıyla kanıtı: [`sifirdan/veri/islem/`](../../sifirdan/veri/islem/README.md).
