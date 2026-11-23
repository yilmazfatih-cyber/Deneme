---
baslik: "Kalıcı iş kuyruğu: kira jetonu, tekil iş, yük sürümü ve işletme"
ozet: Veritabanı tablosundaki iş kuyruğunun üretimde çıkan ince yerleri; kira jetonu ve geç kalan işçi, süreci çökerten iş, bekleyen işi birleştirme, zamanlanmış dilim, yük sürümü, dizin, saklama ve izleme.
etiketler: [kuyruk, arka-plan, sqlite, idempotentlik, zamanlama, isletme]
duzey: ileri
guncellik: 2026-11
---

# Kalıcı iş kuyruğu: kira jetonu, tekil iş, yük sürümü ve işletme

> Bu notu ne zaman okumalı: veritabanı tablosu üstünde bir iş kuyruğu kurulurken ya da büyütülürken; "iş iki işçide
> birden çalıştı", "iş saatlerdir yeniden deneniyor ama hata kaydı boş", "dağıtımdan sonra bekleyen işler hata
> vermeye başladı", "kuyruk tablosu şişti, yoklama yavaşladı" durumlarında. Temeller (en az bir kez teslim, kira,
> geri çekilme, ölü mektup, idempotent tüketici, dönem kaydı) [Arka plan işleri](arka-plan-isleri.md) notundadır;
> bu not onların üstüne gelen ve aylar sonra ortaya çıkan ayrıntıyı anlatır.

## Temel fikir

- Kira bir süre değil, bir **sahiplik iddiasıdır**: her alma yeni bir jeton üretir; onay, hata kaydı ve kira uzatma
  yalnız jeton tutarsa geçer. Kirası düşmüş işçi uyanıp yazdığında başkasının işini bozamaz (çit jetonu fikri:
  [Dağıtık sistem yanılgıları](../40-sistem-tasarimi/dagitik-sistem-yanilgilari.md)).
- Deneme sayacı işi **alırken** artar. Süreci çökerten iş (bellek taşması, yerel kitaplık çökmesi) hata kaydı
  bırakamaz; sayaç yalnız hata kaydında artarsa iş sonsuza dek yeniden verilir.
- "Tekilleştirme" dört ayrı şeydir ve karıştırılır (aşağıdaki tablo).
- Yük (payload) kuyrukta saatler, ölü mektupta haftalar yaşar; arada kod değişir. Yük sürüm taşır, eskisi okunur.
- Kuyruk tablosu sıcak bir tablodur: doğru dizin, biten işin silinmesi ve izleme olmadan aylar içinde yavaşlar.

Havuzdaki tam gerçekleme: [`sifirdan/veri/is_kuyrugu`](../../sifirdan/veri/is_kuyrugu/README.md) (SQLite; kira
jetonu, üstel geri çekilme, ölü mektup, idempotentlik anahtarı, cron dilimi; altı bilerek bozulmuş sürümü yakalayan
testlerle). Aşağıdaki örnekler onun kurallarını küçük parçalar hâlinde gösterir.

## Karar tablosu: hangi tekilleştirme

| İstenen                                          | Mekanizma                                        | SQL                                                          | Örnek                                  |
| ------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------ | -------------------------------------- |
| Aynı iş **bir daha asla** açılmasın              | İdempotentlik anahtarı, kalıcı                   | `anahtar TEXT UNIQUE` + `ON CONFLICT DO NOTHING`             | "sipariş 42'nin faturası"              |
| Aynı anda **tek bekleyen** iş olsun (birleştirme) | Kısmi benzersiz dizin, yalnız bekleyenlerde      | `UNIQUE (tur, anahtar) WHERE durum = 'bekliyor'`             | "kullanıcı 42'nin arama kaydını yenile" |
| Zamanlanmış iş dilim başına bir kez              | Dilim anahtarı                                   | `cron:<ad>:<dilim anı>` idempotentlik anahtarı olarak        | gece raporu                            |
| Aynı anahtarın işleri **aynı anda** çalışmasın   | Eşzamanlılık anahtarı, alırken denetlenir        | `AND NOT EXISTS (… durum = 'isleniyor' AND anahtar = i.anahtar)` | aynı hesabın ödemeleri sırayla     |
| Yan etki bir kez olsun                           | İdempotent tüketici                              | Etkiyle aynı işlemde "işlendi" kaydı                         | e-posta, bakiye                        |

Son satır **her** durumda gerekir: ilk dördü kuyruğa giren iş sayısını azaltır, en az bir kez teslimi ortadan
kaldırmaz.

## Kira jetonu ve geç kalan işçi

A işi aldı ve 40 saniye takıldı (çöp toplama, kopuk ağ). Kira 30. saniyede düştü, B işi aldı. A uyanıp kendi
denemesinin hatasını yazdı. Jetonsuz yazma, B'nin elindeki işi yeniden "bekliyor" yapar ve üçüncü bir işçiye dağıtır:

```python calistir
import sqlite3
import uuid

db = sqlite3.connect(":memory:", isolation_level=None)
db.execute("""CREATE TABLE isler (id INTEGER PRIMARY KEY, durum TEXT NOT NULL DEFAULT 'bekliyor',
              gorunur_at REAL NOT NULL DEFAULT 0, deneme INTEGER NOT NULL DEFAULT 0,
              en_cok INTEGER NOT NULL DEFAULT 3, jeton TEXT)""")
KIRA = 30.0


def al(simdi: float) -> tuple[int, str] | None:
    """Kiralar. Deneme ALIRKEN artar: süreci çökerten iş de hakkını tüketir ve ölü mektuba düşer."""
    db.execute("BEGIN IMMEDIATE")
    db.execute("UPDATE isler SET durum = 'olu', jeton = NULL WHERE durum = 'isleniyor' AND gorunur_at <= ?"
               " AND deneme >= en_cok", (simdi,))
    satir = db.execute("SELECT id FROM isler WHERE durum IN ('bekliyor', 'isleniyor') AND gorunur_at <= ?"
                       " ORDER BY id LIMIT 1", (simdi,)).fetchone()
    if satir is None:
        db.execute("COMMIT")
        return None
    jeton = uuid.uuid4().hex
    db.execute("UPDATE isler SET durum = 'isleniyor', deneme = deneme + 1, gorunur_at = ?, jeton = ?"
               " WHERE id = ?", (simdi + KIRA, jeton, satir[0]))
    db.execute("COMMIT")
    return satir[0], jeton


def basarisiz(is_id: int, jeton: str | None, simdi: float) -> bool:
    """Hata kaydı: 10 sn geri çekilmeyle yeniden sıraya. jeton=None YANLIŞ olan (jetonsuz) yoldur."""
    sql = "UPDATE isler SET durum = 'bekliyor', gorunur_at = ?, jeton = NULL WHERE id = ? AND durum = 'isleniyor'"
    parametre: tuple = (simdi + 10, is_id)
    if jeton is not None:
        sql, parametre = sql + " AND jeton = ?", parametre + (jeton,)
    return db.execute(sql, parametre).rowcount == 1  # 0 ise: kira kaybedildi, sonuç bırakılır


def senaryo(jetonlu: bool) -> int:
    db.execute("DELETE FROM isler")
    db.execute("INSERT INTO isler DEFAULT VALUES")
    is_id, jeton_a = al(0)  # A aldı ve takıldı
    al(31)  # kira düştü; B aldı ve çalışıyor (ör. 60 sn sürecek)
    basarisiz(is_id, jeton_a if jetonlu else None, 40)  # A uyandı, eski denemesinin hatasını yazdı
    return 1 + (al(55) is not None)  # B sürerken işi alabilen başka işçi var mı?


assert senaryo(jetonlu=False) == 2  # YANLIŞ: eski işçinin kaydı işi ikinci bir işçiye de dağıttı
assert senaryo(jetonlu=True) == 1  # DOĞRU: jeton tutmadı, A'nın kaydı yok sayıldı

db.execute("DELETE FROM isler")
db.execute("INSERT INTO isler DEFAULT VALUES")  # zehirli iş: her denemede işçi süreci ölüyor
simdi, kiralama = 0.0, 0
while al(simdi) is not None:
    kiralama += 1
    simdi += KIRA + 1  # ne onay ne hata kaydı; kira dolunca yeniden görünür
assert kiralama == 3 and db.execute("SELECT durum FROM isler").fetchone() == ("olu",)
print("jetonsuz hata kaydı işi iki işçiye dağıttı; süreci çökerten iş 3 kiralamada ölü mektuba düştü")
```

```cikti
jetonsuz hata kaydı işi iki işçiye dağıttı; süreci çökerten iş 3 kiralamada ölü mektuba düştü
```

- Jeton **her** yazmada denetlenir: onay, hata kaydı, kira uzatma. Etkilenen satır 0 ise işçi sonucunu bırakır,
  "kira kaybedildi" diye günlüğe yazar ve sürmez (havuzda: `LeaseLostError`,
  [`is_kuyrugu/queue.py`](../../sifirdan/veri/is_kuyrugu/queue.py) → `_own`).
- Jeton **durumu** korur, yan etkiyi değil: A ile B'nin ikisi de e-postayı göndermiş olabilir. Yan etki için
  idempotent tüketici yine gerekir.

## Uzun iş: kalp atışı ve gönüllü bırakma

- Kira, en uzun işten kısaysa işçi kirayı ara ara uzatır (kalp atışı). Aralık kira süresinin üçte biri kadardır; uzatma
  reddedilirse (kira gitmiş) iş **durdurulur**: sürdürmek, işi almış ikinci işçiyle yarışmaktır.
- Kalp atışı ayrı bir iş parçacığında koşar; iş kilitlenmişse (sonsuz döngü) atış sürer ve iş hiç bırakılmaz. Atışa
  bir üst süre koyun (ör. beklenen en uzun sürenin iki katı); aşılınca uzatmayı bırakın.
- Düzgün kapanışta bitiremeyeceği işi işçi **gönüllü bırakır** (`gorunur_at = şimdi`) ve bu bırakma deneme hakkından
  sayılmaz (`deneme = deneme - 1`). Sayılırsa her dağıtım işlerin hakkını yer ve sağlam işler ölü mektuba düşer.
- `sifirdan` işçisinde kalp atışı yoktur (README → "Buradan nereye"); ekleyecekseniz bu üç kural geçerlidir.

## Bekleyen işi birleştirmek

Kullanıcı profilini 100 kez düzenledi; arama kaydını 100 kez yenilemek gereksizdir: **tek bekleyen** iş yeter. Ama
tekillik koşulu çalışan işi de sayarsa, iş sürerken gelen son düzenleme hiçbir işe yazılmaz ve kaybolur:

```python calistir
import sqlite3


def senaryo(kosul: str) -> tuple[int, int, int]:
    db = sqlite3.connect(":memory:", isolation_level=None)
    db.execute("CREATE TABLE isler (id INTEGER PRIMARY KEY, tur TEXT, anahtar TEXT, durum TEXT DEFAULT 'bekliyor')")
    db.execute(f"CREATE UNIQUE INDEX tek_is ON isler (tur, anahtar) {kosul}")
    db.execute("CREATE TABLE profil (surum INTEGER)")
    db.execute("CREATE TABLE arama_kaydi (surum INTEGER)")  # dizindeki kopya
    db.execute("INSERT INTO profil VALUES (0)")

    def duzenle() -> None:
        db.execute("UPDATE profil SET surum = surum + 1")
        db.execute(f"INSERT INTO isler (tur, anahtar) VALUES ('dizinle', 'u42') ON CONFLICT (tur, anahtar) {kosul} DO NOTHING")

    for _ in range(100):
        duzenle()
    kuyrukta = db.execute("SELECT count(*) FROM isler").fetchone()[0]
    calisan = 0
    while is_ := db.execute("SELECT id FROM isler WHERE durum = 'bekliyor' ORDER BY id LIMIT 1").fetchone():
        calisan += 1
        db.execute("UPDATE isler SET durum = 'isleniyor' WHERE id = ?", is_)
        okunan = db.execute("SELECT surum FROM profil").fetchone()[0]  # iş güncel veriyi okur, yükü değil
        if calisan == 1:
            duzenle()  # iş sürerken bir düzenleme daha geldi
        db.execute("DELETE FROM arama_kaydi")
        db.execute("INSERT INTO arama_kaydi VALUES (?)", (okunan,))
        db.execute("UPDATE isler SET durum = 'bitti' WHERE id = ?", is_)
    return kuyrukta, calisan, db.execute("SELECT surum FROM arama_kaydi").fetchone()[0]


assert senaryo("WHERE durum <> 'bitti'") == (1, 1, 100)  # YANLIŞ: 101. düzenleme arama kaydına hiç girmedi
assert senaryo("WHERE durum = 'bekliyor'") == (1, 2, 101)  # DOĞRU: iş sürerken yeni bir bekleyen iş açıldı
print("100 düzenleme tek işe indi; iş sürerken gelen düzenleme yalnız 'bekliyor' koşuluyla kaybolmadı")
```

```cikti
100 düzenleme tek işe indi; iş sürerken gelen düzenleme yalnız 'bekliyor' koşuluyla kaybolmadı
```

- `ON CONFLICT (…) WHERE …` koşulu kısmi dizinin koşuluyla **birebir** aynı olmalıdır; değilse veritabanı çakışma
  hedefini bulamaz ve hata verir.
- Yük yalnız anahtarı taşır (`{"kullanici": "u42"}`); işçi güncel veriyi kendisi okur. Yükte veri taşınsaydı
  birleştirilen 99 düzenlemenin verisi kaybolurdu.

## Zamanlanmış işler kuyruğa nasıl girer

- Zamanlayıcı yalnız "dilim geldi" der ve dilimi **dilim anahtarıyla** kuyruğa koyar
  (`cron:gunluk-rapor:2026-11-23T00:00Z`). İki zamanlayıcı ya da yeniden başlatma aynı dilimi iki kez koyamaz;
  havuzda: `JobQueue.tick()` ([`queue.py`](../../sifirdan/veri/is_kuyrugu/queue.py)).
- Sunucu kapalıyken kaçırılan dilimler için karar iş türüne göredir (hepsi, biri, hiçbiri):
  [Zamanlanmış işler](../60-devops/zamanlanmis-isler.md) → kaçırılan çalıştırma. `sifirdan` bir yakalama işi açar.
- Önceki dilimin işi hâlâ sürüyorsa yenisi beklesin mi, atlansın mı? Eşzamanlılık anahtarıyla (`anahtar =
  'gunluk-rapor'`) "beklesin" kolayca kurulur; "atlansın" için kuyruğa koymadan önce çalışan iş aranır.
- Dilim anahtarı işin yaşadığı saat diliminde hesaplanır; `sifirdan` cron'u UTC'dir
  ([Zaman ve saat dilimi](zaman-ve-saat-dilimi.md)).

## Yükün sürümü: dağıtım anında kuyrukta bekleyen eski işler

Dağıtım anında kuyrukta eski kodun yazdığı işler bekler: gecikmeli işler, geri çekilmedeki işler, haftalar sonra
yeniden kuyruğa alınacak ölü mektuplar. Yeni işleyici yalnız yeni biçimi tanırsa bu işler her denemede patlar:

```python calistir
KULLANICI = {"ayse@ornek.com": "u7"}
gonderilen: list[tuple[str, str]] = []


def karsilama(yuk: dict) -> None:  # 2. sürüm: yük kimlik taşır, e-postayı işleyici kendisi okur
    gonderilen.append((yuk["kullanici_id"], yuk["sablon"]))


ISLEYICI = {"karsilama": (2, karsilama)}  # tür → (güncel sürüm, işleyici)
TAKMA_AD = {"hosgeldin_epostasi": "karsilama"}  # eski adla kuyrukta bekleyenler için
YUKSELT = {("karsilama", 1): lambda y: {"v": 2, "kullanici_id": KULLANICI[y["alici"]], "sablon": "hosgeldin"}}


def calistir(tur: str, yuk: dict) -> str:
    tur = TAKMA_AD.get(tur, tur)
    if tur not in ISLEYICI:
        return "olu: bilinmeyen iş türü"  # yeniden denemek düzeltmez; kuyruğu tıkamasın
    guncel, isleyici = ISLEYICI[tur]
    while (tur, yuk.get("v", 1)) in YUKSELT:  # v1 → v2 → … zinciri
        yuk = YUKSELT[(tur, yuk.get("v", 1))](yuk)
    if yuk.get("v", 1) != guncel:
        return f"olu: {yuk.get('v', 1)}. sürüm yük desteklenmiyor"
    isleyici(yuk)
    return "bitti"


eski_is = ("hosgeldin_epostasi", {"alici": "ayse@ornek.com"})  # dağıtımdan önce, 1 gün gecikmeli eklendi
try:
    karsilama(eski_is[1])  # YANLIŞ: her denemede KeyError → sonunda ölü mektup, e-posta hiç gitmez
except KeyError as hata:
    print("yükselticisiz:", type(hata).__name__, hata)
assert calistir(*eski_is) == "bitti"
assert calistir("karsilama", {"v": 2, "kullanici_id": "u9", "sablon": "hosgeldin"}) == "bitti"
assert calistir("rapor_uret", {}) == "olu: bilinmeyen iş türü"
assert gonderilen == [("u7", "hosgeldin"), ("u9", "hosgeldin")]
```

```cikti
yükselticisiz: KeyError 'kullanici_id'
```

- Yükselticiyi, o sürümden bekleyen iş **ve** saklanan ölü mektup kalmayana dek silmeyin:
  `SELECT count(*) FROM isler WHERE tur = 'karsilama' AND json_extract(yuk, '$.v') IS NULL`.
- İş türünü yeniden adlandırmayın; adlandırırsanız eski ad takma ad olarak kalır.
- Geri alma da aynı sorundur: geri alınan eski kod, yeni kodun kuyruğa koyduğu işi okuyabilmelidir. Yeni alanı isteğe
  bağlı ekleyin; genel kurallar: [Geriye uyumlu değişim](../40-sistem-tasarimi/geriye-uyumlu-degisim.md).

## Tablo sağlığı: dizin, saklama, dosya boyu

```python calistir
import sqlite3

db = sqlite3.connect(":memory:", isolation_level=None)
db.execute("CREATE TABLE isler (id INTEGER PRIMARY KEY, kuyruk TEXT, durum TEXT, gorunur_at REAL, bitis REAL, yuk TEXT)")
db.executemany(
    "INSERT INTO isler (kuyruk, durum, gorunur_at, bitis, yuk) VALUES ('eposta', ?, ?, ?, ?)",
    [(("bekliyor", "bitti", "bitti", "bitti")[i % 4], i, i if i % 4 else None, "x" * 200) for i in range(40_000)],
)
AL = ("SELECT id FROM isler WHERE kuyruk = 'eposta' AND durum IN ('bekliyor', 'isleniyor') AND gorunur_at <= ?"
      " ORDER BY gorunur_at LIMIT 1")


def plan() -> str:
    return " | ".join(satir[3] for satir in db.execute("EXPLAIN QUERY PLAN " + AL, (1e9,)))


once = plan()
db.execute("CREATE INDEX isler_hazir ON isler (kuyruk, gorunur_at) WHERE durum IN ('bekliyor', 'isleniyor')")
sonra = plan()
print("dizinsiz:", once)
print("kısmi dizinle:", sonra)
assert once.startswith("SCAN") and "USING INDEX isler_hazir" in sonra  # biten işler dizine girmez

# Saklama: biten işleri partilerle sil (yük kişisel veri taşıyabilir). Silmek dosyayı küçültmez.
silme = "DELETE FROM isler WHERE id IN (SELECT id FROM isler WHERE durum = 'bitti' AND bitis < ? LIMIT 5000)"
while db.execute(silme, (39_000,)).rowcount:
    pass
bos = db.execute("PRAGMA freelist_count").fetchone()[0]
db.execute("VACUUM")  # küçültür; ama çalışırken veritabanını kilitler ve geçici olarak iki kat yer ister
assert bos > 0 and db.execute("PRAGMA freelist_count").fetchone()[0] == 0
print(f"silme sonrası boş sayfa {bos}; VACUUM sonrası 0")
```

- Alma sorgusunun planına bakın: `SCAN` her yoklamada bütün tabloyu okur. Bu makinede 200 bin satırlık tabloda
  yoklama başına ~19 ms ölçüldü, kısmi dizinle ~0,01 ms (Python 3.13, SQLite 3.53; yük ve makineye göre değişir).
- Kısmi dizin yalnız bekleyen ve işlenen işleri tutar; biten milyonlarca satır dizini şişirmez.
- Saklama süresi tür başınadır: biten iş kısa (ör. 7 gün), ölü mektup daha uzun (ör. 30 gün). Yük kişisel veri
  taşıyorsa süre envanterde yazar ([KVKK pratiği](../50-guvenlik/kvkk-pratik.md)).
- Kuyruğu ayrı bir SQLite dosyasında tutmak, `VACUUM` ve kilitleri uygulama verisinden ayırır; ama o zaman iş ile
  onu doğuran kayıt **aynı işlemde** yazılamaz (giden kutusu kalıbı bozulur). Karar budur; çoğu küçük üründe aynı dosya.
- Postgres'te (bu ortamda denenmedi; belgeden doğrulayın): alma `SELECT … FOR UPDATE SKIP LOCKED` ile güncellemeyle
  **aynı işlemde** yapılır; sık güncellenen kuyruk tablosunda ölü satır birikir ve uzun süren işlemler temizliği
  bekletir; `now()` işlemin başladığı anı verir, uzun işlemde gerçek saat için `clock_timestamp()` kullanılır.

## Yoklama ve uyandırma

- Sabit aralıkla yoklayan N işçi, kuyruk boşken de günde N × 86 400 sorgu atar. Boşta geri çekilin: iş bulamadıkça
  aralık 1 → 2 → 4 … 30 sn (titremeli), iş bulunca hemen kısalır.
- İşin bekleme süresi en fazla yoklama aralığı kadardır. Hızlı tepki gerekiyorsa işi ekleyen süreç aynı süreçteki
  işçiyi uyandırır (bellek içi olay) ya da Postgres'te `LISTEN/NOTIFY` kullanılır; uyarı kaybolabilir, yoklama yedek
  olarak kalır.

## İzleme

| Ölçüt                                                    | Neyi gösterir                         | Uyarı örneği                               |
| -------------------------------------------------------- | ------------------------------------- | ------------------------------------------ |
| Hazır iş sayısı (kuyruk başına)                          | Birikme, tüketici yetişmiyor          | 15 dakikadır sürekli artıyor               |
| En eski **hazır** işin yaşı (`şimdi − gorunur_at`)       | Kullanıcının beklediği gecikme        | Hedefin üstünde (ör. 5 dk)                 |
| Kira dolumu sayısı (onaysız düşen kira)                  | Çöken ya da takılan işçi              | Bir saatte olağanın üstünde                |
| Yeni ölü mektup                                          | Kalıcı hata, zehirli iş               | Her yenisi bildirim                        |
| İlk denemede bitenlerin oranı                            | Sağlayıcı sorunu, kötü sürüm          | Oran düştü                                 |
| İş süresi p95 (tür başına)                               | Kira süresi yetiyor mu                | Kira süresinin yarısını aştı               |

En eski işin yaşını `created_at`'tan hesaplamayın: bir saat sonraya kurulmuş gecikmeli iş uyarıyı hep çaldırır.

```sql
SELECT kuyruk, count(*) AS hazir, :simdi - min(gorunur_at) AS en_eski_hazir_sn
FROM isler WHERE durum = 'bekliyor' AND gorunur_at <= :simdi GROUP BY kuyruk;
```

## Tuzaklar

| Belirti                                                        | Neden                                                    | Çözüm                                                       |
| -------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| İş iki işçide birden çalışıyor; biri kirası düşmüş eski işçi   | Onay/hata kaydı jetonsuz                                 | Her yazmada `AND jeton = ?`; 0 satırda sonucu bırak         |
| Bir iş saatlerdir yeniden veriliyor, hata kaydı boş            | İş süreci öldürüyor; deneme yalnız hata kaydında artıyor | Deneme alırken artsın; sınırda ölü mektup                   |
| Her dağıtımdan sonra işlerin deneme hakkı azalıyor             | Kapanışta bırakılan kira deneme sayılıyor                | Gönüllü bırakmada sayacı geri al                            |
| Uzun iş bitmeden ikinci kopyası başladı                        | Kira kısa, kalp atışı yok                                | Kalp atışı (kira/3); reddedilirse dur                       |
| Kilitlenen iş hiç bırakılmıyor                                 | Kalp atışının üst süresi yok                             | Atışa üst süre                                              |
| Hızlı düzenlemede kuyrukta yüzlerce aynı iş                    | Birleştirme yok                                          | `WHERE durum = 'bekliyor'` kısmi benzersiz dizin            |
| Son düzenleme arama kaydına hiç girmedi                        | Tekillik koşulu çalışan işi de sayıyor                   | Koşul yalnız bekleyenler                                    |
| Dağıtımdan sonra bekleyen işler `KeyError` ile ölü mektupta     | Yük sürümsüz; yeni işleyici eski yükü tanımıyor          | `v` alanı + yükseltici + takma ad                           |
| Bilinmeyen iş türü kuyruğu saatlerce tıkadı                    | Bilinmeyen tür yeniden deneniyor                         | Hemen ölü mektup + uyarı                                    |
| Yoklama yavaş, veritabanı sürekli meşgul                       | Alma sorgusu tam tarama; biten işler silinmiyor          | Kısmi dizin; partili saklama silmesi                        |
| Satırlar silindi ama dosya küçülmüyor                          | Boş sayfalar dosyada kalır                               | Bakım penceresinde `VACUUM`; ya da kuyruk ayrı dosyada      |
| "En eski iş 1 saattir bekliyor" uyarısı hiç susmuyor           | Yaş `created_at`'tan; gecikmeli işler sayılıyor          | Yaşı `gorunur_at`'tan, yalnız hazır işlerde hesapla         |

## Denetim listesi

- [ ] Onay, hata kaydı ve kira uzatma jetonu denetliyor; "geç kalan işçi" testi var.
- [ ] Deneme sayacı alırken artıyor; "her denemede süreci öldüren iş ölü mektuba düşer" testi var.
- [ ] Uzun işlerde kalp atışı (kira/3), üst süresi ve "uzatma reddedilince dur" davranışı var.
- [ ] Kapanışta bırakılan kira deneme hakkı yemiyor.
- [ ] Tekilleştirme türü her iş için seçildi (tablo); birleştirmede koşul yalnız `bekliyor`.
- [ ] Zamanlanmış işler dilim anahtarıyla giriyor; kaçırılan dilim politikası yazılı.
- [ ] Yük `v` alanı taşıyor; eski sürümler için yükseltici ve eski tür adları için takma ad var; bilinmeyen tür
      hemen ölü mektup.
- [ ] Alma sorgusunun planı dizin kullanıyor (`EXPLAIN QUERY PLAN`); biten işler partilerle siliniyor.
- [ ] Hazır iş sayısı, en eski hazır işin yaşı, kira dolumu, ölü mektup ve iş süresi izleniyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Kuyruk `sifirdan/veri/is_kuyrugu` kurallarına uysun: alma `BEGIN IMMEDIATE` içinde, deneme
  alırken artar, her alma yeni jeton üretir; onay/hata/uzatma `AND jeton = ?` ile yazılır, etkilenen satır 0 ise sonuç
  bırakılır. Yükte `v` alanı olsun; eski sürüm için yükseltici yaz. Birleştirme için kısmi benzersiz dizin
  `WHERE durum = 'bekliyor'`. Şu testleri yaz: geç kalan işçi, süreci öldüren iş, iş sürerken gelen düzenleme,
  eski sürüm yük."
- **Modelin tipik hatası:** onayı `UPDATE … WHERE id = ?` ile jetonsuz yazar; deneme sayacını yalnız `except`
  bloğunda artırır; tekilliği bütün tabloya (`UNIQUE (tur, anahtar)`) koyar ve iş bitince yenisi açılamaz ya da
  çalışan işi de sayar; yükü sürümsüz bırakır; gecikmeli işi `created_at` ile yaşlandırır; saklama silmesini tek
  dev `DELETE` ile yazar.
- **Çıktıda arayın:** onay/hata sorgularında jeton koşulu; `deneme = deneme + 1`'in alma sorgusunda olması; kısmi
  dizin ile `ON CONFLICT … WHERE` koşulunun aynılığı; işleyici kaydında bilinmeyen tür dalı.

## İlgili

- [Arka plan işleri](arka-plan-isleri.md) (temeller) · [Kuyruk ve olaylar](../40-sistem-tasarimi/kuyruk-ve-olaylar.md)
  (giden kutusu, geri basınç) · [İşlemler ve eşzamanlılık](islemler-ve-eszamanlilik.md)
- [Zamanlanmış işler](../60-devops/zamanlanmis-isler.md) (zamanlayıcı seçimi, kaçırılan dilim, izleme) ·
  [Dış API istemcisi](dis-api-istemcisi.md) (işin içindeki dış çağrı) ·
  [Çok kiracılık](../40-sistem-tasarimi/cok-kiracilik.md) (kiracılar arası adil kuyruk)
- Havuzda: [`sifirdan/veri/is_kuyrugu/README.md`](../../sifirdan/veri/is_kuyrugu/README.md),
  [`queue.py`](../../sifirdan/veri/is_kuyrugu/queue.py), [`worker.py`](../../sifirdan/veri/is_kuyrugu/worker.py),
  [`cron.py`](../../sifirdan/veri/is_kuyrugu/cron.py); süreç içi kuyruk:
  [`kutuphane/py/kutuphane/kuyruk.py`](../../kutuphane/py/kutuphane/kuyruk.py)
