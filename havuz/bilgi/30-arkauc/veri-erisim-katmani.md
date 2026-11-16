---
baslik: Veri erişim katmanı: düz SQL, sorgu kurucu, ORM, depo ve N+1
ozet: Uygulamanın veritabanıyla konuştuğu katmanı kurmak; düz SQL, sorgu kurucu ve ORM arasında seçim, depo kalıbı, N+1 sorgusunu ölçüp düzeltmek, parametreli sorgu, bağlantı havuzu ve test edilebilirlik.
etiketler: [veritabani, sql, orm, performans, mimari]
duzey: orta
guncellik: 2026-11
---

# Veri erişim katmanı: düz SQL, sorgu kurucu, ORM, depo ve N+1

> Bu notu ne zaman okumalı: yeni bir projede "ORM mi düz SQL mi" kararı verilirken; bir liste sayfası kayıt
> sayısıyla orantılı yavaşladığında; SQL rotaların ve bileşenlerin içine dağılmaya başladığında; "too many
> connections" hatası görüldüğünde.

## Temel fikir

Veritabanıyla konuşan kod **tek bir katmanda** toplanır: her tablo ya da varlık grubu için bir depo (repository)
dosyası. Rotalar ve iş kuralları SQL yazmaz; depo işlevlerini çağırır. Bunun üç kazancı vardır: kiracı süzgeci,
silinmiş kayıt süzgeci ve sıralama gibi kurallar **bir yerde** uygulanır; yavaş sorgu ya da güvenlik açığı
tek dosyada aranır; testte veritabanı kolayca değiştirilir.

Bu katmanın üç klasik hatası vardır: **N+1** (listedeki her satır için ayrı sorgu), **SQL'e metin gömme**
(enjeksiyon) ve **bağlantıyı/işlemi uzun tutma** (havuz tükenir). Üçü de "küçük veride çalışıyor" diye gözden kaçar.

## Karar tablosu: düz SQL, sorgu kurucu, ORM

| Durum                                                               | Seçim                                    | Neden                                                     |
| ------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------- |
| Küçük-orta uygulama, sorgular belli, SQLite/Postgres                | Düz SQL + ince sarmalayıcı + depo dosyaları | Her sorgu görünür; bağımlılık yok; havuzdaki seçim     |
| Ekranda çok süzgeçli, koşullu sorgular (yönetim listesi, arama)     | Tip güvenli sorgu kurucu                 | Koşullu parçaları metin birleştirmeden kurar              |
| Çok sayıda varlık, ağırlıkla ekle-oku-güncelle-sil, hızlı başlangıç | ORM                                      | Az kod; ama gizli sorgular ve N+1 riskini bilerek         |
| Rapor, toplama, analitik                                            | Düz SQL (gerekirse görünüm)              | ORM'ler karmaşık toplamada zorlanır, okunmaz SQL üretir   |
| Küçük modelin genişleteceği temel                                   | Düz SQL + örnek depo dosyası             | Kopyalanacak kalıp açık; "sihir" yok                      |

ORM seçilse bile: üretilen SQL'i günlükte görebilmelisiniz, N+1'i yakalayan bir test ya da sorgu sayacı olmalı ve
karmaşık sorguda düz SQL'e inmekten çekinilmemeli.

## Depo kalıbı

Havuzdaki düzen ([`uygulama/api/src/modules/*/repo.ts`](../../uygulama/api/src/modules/workspaces/repo.ts)):

- Depo işlevi ilk parametre olarak veritabanı tutamacını alır (`findRecord(db, workspaceId, …)`); işlem içinde
  çağrıldığında aynı tutamaç işlemin içindedir.
- Depo **iş kuralı içermez** (yetki, durum geçişi serviste); yalnız sorgu ve satır ↔ nesne dönüşümü.
- Satır türü açıkça yazılır (`interface RecordRow`); veritabanı biçimi (snake_case, 0/1, ISO metin) ile uygulama
  biçimi (camelCase, mantıksal değer, `Date`) arasındaki çeviri tek işlevde (`toServerRecord`, `toBool`).
- İşlemi **servis** açar ve birden çok depo çağrısını kapsar; depo kendi başına işlem açmaz.
- Bütün SQL tek bir sarmalayıcıdan geçer ([`database.ts`](../../uygulama/api/src/db/database.ts)): parametreli
  `get/all/run`, hazır deyim (prepared statement) önbelleği, işlem yardımcısı. Sürücü değişirse yalnız bu dosya
  değişir.

Çok kiracılı uygulamada depo kiracıyla kurulur ya da her işlev kiracıyı zorunlu parametre alır; kiracısız sorgu
yazmak zorlaşır ([Yetkilendirme](yetkilendirme.md)).

## N+1: ölç, sonra düzelt

Liste ekranı 50 sipariş gösterir ve her siparişin müşteri adını ayrı sorguyla çekerse 51 sorgu çalışır. Yerelde
milisaniyelerdir; ağ üzerinden uzak veritabanında ve büyük listede saniyelere çıkar. ORM'lerin "tembel yükleme"si
(lazy loading) aynı şeyi görünmez biçimde yapar.

```python calistir
import sqlite3

db = sqlite3.connect(":memory:")
db.executescript("""
CREATE TABLE musteri (id INTEGER PRIMARY KEY, ad TEXT NOT NULL);
CREATE TABLE siparis (id INTEGER PRIMARY KEY, musteri_id INTEGER NOT NULL REFERENCES musteri (id), tutar_kurus INTEGER NOT NULL);
CREATE INDEX siparis_musteri ON siparis (musteri_id);
""")
db.executemany("INSERT INTO musteri VALUES (?, ?)", [(i, f"Müşteri {i}") for i in range(1, 51)])
db.executemany("INSERT INTO siparis (musteri_id, tutar_kurus) VALUES (?, ?)", [(i % 50 + 1, 1000 * i) for i in range(200)])
sorgular: list[str] = []
db.set_trace_callback(sorgular.append)  # her çalışan SQL deyimini say


def olc(islev) -> tuple[list, int]:
    sorgular.clear()
    sonuc = islev()
    return sonuc, len(sorgular)


def yanlis():  # N+1: önce liste, sonra HER satır için ayrı sorgu
    satirlar = db.execute("SELECT id, musteri_id, tutar_kurus FROM siparis ORDER BY id LIMIT 50").fetchall()
    return [(s[0], db.execute("SELECT ad FROM musteri WHERE id = ?", (s[1],)).fetchone()[0], s[2]) for s in satirlar]


def birlestirme():  # 1 sorgu
    return db.execute(
        """SELECT s.id, m.ad, s.tutar_kurus FROM siparis s JOIN musteri m ON m.id = s.musteri_id
           ORDER BY s.id LIMIT 50"""
    ).fetchall()


def toplu():  # 2 sorgu: liste + ilişkili kayıtlar kimlik listesiyle tek seferde
    satirlar = db.execute("SELECT id, musteri_id, tutar_kurus FROM siparis ORDER BY id LIMIT 50").fetchall()
    kimlikler = sorted({s[1] for s in satirlar})
    yer = ",".join("?" * len(kimlikler))
    adlar = dict(db.execute(f"SELECT id, ad FROM musteri WHERE id IN ({yer})", kimlikler).fetchall())
    return [(s[0], adlar[s[1]], s[2]) for s in satirlar]


(a, n_a), (b, n_b), (c, n_c) = olc(yanlis), olc(birlestirme), olc(toplu)
assert a == b == c and len(a) == 50
print(f"N+1: {n_a} sorgu, birleştirme: {n_b}, toplu yükleme: {n_c}")
```

```cikti
N+1: 51 sorgu, birleştirme: 1, toplu yükleme: 2
```

- Çözüm ya birleştirme (`JOIN`) ya da toplu yüklemedir (`WHERE id IN (…)`; ORM'lerde "ön yükleme", eager loading).
- Testte istek başına sorgu sayısını ölçen bir yardımcı, N+1'i yakalamanın en ucuz yoludur: "liste ucu kayıt
  sayısından bağımsız olarak en çok 3 sorgu çalıştırır".
- Döngü içinde `await db.…` görmek N+1'in işaretidir.
- Önbellek N+1'i gizler ama çözmez ([Önbellek](onbellek.md)).

## Parametreli sorgu ve dinamik parçalar

Değer **her zaman** yer tutucuyla gider. Metne yalnız koddan gelen parçalar girer: izin listesinden seçilmiş sütun
adı, sıralama yönü ya da üretilmiş yer tutucular.

```python calistir
import sqlite3

db = sqlite3.connect(":memory:")
db.execute("CREATE TABLE urun (id INTEGER PRIMARY KEY, ad TEXT, gizli INTEGER)")
db.executemany("INSERT INTO urun VALUES (?, ?, ?)", [(1, "çay", 0), (2, "simit", 0), (3, "taslak ürün", 1)])

istenen = "1) OR (1=1"  # adresten gelen "kimlik listesi"
# YANLIŞ: değeri metne gömmek
yanlis = db.execute(f"SELECT ad FROM urun WHERE gizli = 0 AND id IN ({istenen})").fetchall()
assert ("taslak ürün",) in yanlis  # gizli ürün sızdı

# DOĞRU: önce doğrula, sonra her değer için bir yer tutucu üret
kimlikler = [int(p) for p in "1,2".split(",")]  # int() geçersiz girdide hata verir → 400
yer = ",".join("?" * len(kimlikler))  # "?,?": metne yalnız yer tutucu girer, değer girmez
dogru = db.execute(f"SELECT ad FROM urun WHERE gizli = 0 AND id IN ({yer})", kimlikler).fetchall()
assert dogru == [("çay",), ("simit",)]
try:
    [int(p) for p in istenen.split(",")]
    raise AssertionError("reddedilmeliydi")
except ValueError:
    pass
print("tamam")
```

```cikti
tamam
```

`IN` listesinin boyutuna üst sınır koyun (sürücülerin parametre sayısı sınırı vardır; çok uzun listede geçici tablo
ya da birleştirme daha iyidir). Sıralama sütunu için izin listesi: [API tasarımı](api-tasarimi.md); `LIKE`
kaçışlama: [Arama](arama.md).

## Bağlantı havuzu

| Durum                                           | Ne yapılır                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------- |
| Postgres/MySQL, uzun yaşayan sunucu             | Süreç başına küçük bir havuz; bütün kopyaların toplamı veritabanının bağlantı sınırının altında |
| Sunucusuz (serverless) ya da çok sayıda kopya   | Her kopya kendi havuzunu açar ve sınır hızla dolar: araya bir bağlantı havuzlayıcı |
| SQLite                                          | Tek dosya, aynı anda tek yazar; çoğu zaman süreç başına tek bağlantı yeter (havuz) |

- Havuzdan alınan bağlantı her yolda (`finally`) geri verilir; işlem uzun tutulmaz, işlem içinde ağ çağrısı yapılmaz
  ([İşlemler ve eşzamanlılık](islemler-ve-eszamanlilik.md)).
- Bağlantı alma ve sorgu için zaman aşımı koyun; asılı bir sorgu havuzu tüketmesin.
- Havuz boyutunu artırmak çoğu zaman çözüm değildir: veritabanı aynı anda ancak sınırlı iş yapar. Önce yavaş
  sorguyu ve uzun işlemi bulun.

## Sorguyu tek yerde toplama

- SQL rota işleyicisinde, şablonda ya da bileşende yazılmaz; yalnız depoda.
- Ortak koşullar (kiracı, silinmemiş, yayında) depo işlevinin içindedir; çağıran unutamaz.
- Aynı sorgunun iki kopyası olmaz; ikinci ihtiyaçta işlev parametre kazanır.
- Yavaş sorgu günlüğü (eşik üstü süre) ve `EXPLAIN` ile dizin kullanımı denetlenir; dizin "her sütuna" değil,
  gerçek sorgulara göre eklenir.

## Test edilebilirlik

- Veritabanı tutamacı dışarıdan verilir; testte bellek içi SQLite ya da geçici bir veritabanı kurulur, göçlerin
  hepsi uygulanır. Havuzdaki testler `:memory:` veritabanıyla gerçek API'yi ağsız koşar
  ([`test/support/harness.ts`](../../uygulama/api/test/support/harness.ts)).
- Veritabanını taklit (mock) etmek SQL hatalarını gizler; depoyu gerçek motorla sınayın. Üretimde Postgres
  kullanılıyorsa testte de Postgres kullanmak, SQLite'ın farklı davrandığı yerlerde sürprizi önler.
- Her test kendi verisini kurar (üreteç/fabrika işlevleriyle); testler birbirinin verisine güvenmez.
- Eşzamanlılık davranışı için iki bağlantılı test ([`concurrency.test.ts`](../../uygulama/api/test/concurrency.test.ts)).

## Tuzaklar

| Belirti                                                     | Neden                                                     | Çözüm                                                    |
| ----------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------- |
| Liste sayfası kayıt sayısıyla orantılı yavaşlıyor           | N+1 (döngüde sorgu, tembel yükleme)                       | `JOIN` ya da `IN` ile toplu yükleme; sorgu sayısı testi  |
| Kimlik listesiyle gizli kayıtlar sızdı                      | `IN (${liste})` metin birleştirme                          | Doğrula + üretilmiş yer tutucular                        |
| Bir uçta silinmiş/başka kiracının kaydı görünüyor           | Süzgeç bazı sorgularda unutulmuş                          | Süzgeç depoda; ham sorgu rotada yok                      |
| "too many connections" / havuz zaman aşımı                  | Bağlantı geri verilmiyor, uzun işlem, çok kopya           | `finally` ile bırak; kısa işlem; havuzlayıcı             |
| ORM ile basit bir sayfa düzinelerce sorgu atıyor            | İlişkiler tembel yükleniyor                               | Ön yükleme; üretilen SQL'i günlükte izleyin              |
| Testler geçiyor, üretimde SQL hatası                        | Testte veritabanı taklit edildi ya da başka motor         | Gerçek motorla depo testleri                             |
| Mantıksal alan `1`/`0`, tarih metin olarak API'ye sızdı     | Satır doğrudan yanıta konuldu                             | Satır → nesne çevirisi tek işlevde                       |
| Aynı sorgu dört dosyada, biri farklı sıralıyor              | SQL dağınık                                               | Tek depo işlevi                                          |
| Node'da işlem içinde `await` sonrası başka isteğin yazması görüldü | Eşzamansız işlem arasına başka iş girdi             | İşlem işlevi eşzamanlı ya da sürücünün işlem nesnesi     |

## Denetim listesi

- [ ] SQL yalnız depo dosyalarında; rotalarda ve arayüz kodunda sorgu yok.
- [ ] Her değer yer tutucuyla; metne giren parçalar yalnız izin listesinden ya da üretilmiş yer tutucu.
- [ ] Liste uçlarında sorgu sayısı kayıt sayısından bağımsız (testle ölçülmüş).
- [ ] Kiracı/silinmemiş/yayında gibi ortak süzgeçler depo işlevinin içinde.
- [ ] İşlemi servis açıyor; depo işlevleri işlem tutamacını parametre alıyor.
- [ ] Satır ↔ nesne çevirisi tek yerde; veritabanı biçimi API'ye sızmıyor.
- [ ] Bağlantılar her yolda geri veriliyor; zaman aşımları var; toplam bağlantı sayısı veritabanı sınırının altında.
- [ ] Depo testleri gerçek veritabanı motoruyla ve göçlerin tamamıyla koşuyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "SQL'i yalnız `repo.ts` dosyasına yaz; her değer `?` ile. Rota işleyicisi yalnız servisi çağırsın.
  Liste ucu ilişkili kayıtları `JOIN` ya da tek `IN` sorgusuyla yüklesin; döngü içinde sorgu yazma. Satırı nesneye
  çeviren işlevi ayrı yaz." Kopyalanacak örnek: [`uygulama/api/src/modules/account/`](../../uygulama/api/src/modules/account/service.ts).
- **Tipik hatalar:** `for (const x of list) await db.get(...)`; şablon dizgisiyle SQL; rotada ham sorgu; ORM'de
  ilişkiyi döngüde okumak; bağlantıyı `finally` dışında bırakmak; testte veritabanını taklit etmek.
- **Çıktıda arayın:** döngü gövdesinde `db.`/`await` sorgu; SQL metninde `${` ya da `+` ile birleştirme;
  `routes.ts` içinde `SELECT`/`INSERT`; `IN (` öncesinde üretilmemiş liste.
- **Test isteyin:** "liste ucu 10 ve 100 kayıtta aynı sayıda sorgu çalıştırır".

## İlgili

- [Veritabanı tasarımı](veritabani-tasarimi.md) · [İşlemler ve eşzamanlılık](islemler-ve-eszamanlilik.md) ·
  [Sunucu mimarisi](sunucu-mimarisi.md) (katmanlar) · [Yetkilendirme](yetkilendirme.md) (kiracıyla kurulan depo)
- SQL dilinin kendisi: [SQL sorgu yazımı](../10-diller/sql-sorgu.md) (birleştirmeler) ve
  [SQL performans ve işlem](../10-diller/sql-performans-ve-islem.md) (dizinler, `EXPLAIN`); enjeksiyonun bütün
  biçimleri: [Enjeksiyon](../50-guvenlik/enjeksiyon.md).
