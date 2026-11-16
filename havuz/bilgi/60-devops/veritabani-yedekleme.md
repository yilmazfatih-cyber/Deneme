---
baslik: Veritabanı yedekleme ve geri yükleme
ozet: Yedek ile çoğaltma farkı, kayıp penceresi ve dönüş süresi, SQLite'ı çalışırken tutarlı yedekleme, PostgreSQL mantıksal yedeği, zamanlama, saklama, şifreleme ve geri yükleme tatbikatı.
etiketler: [yedekleme, sqlite, postgresql, geri-yukleme, felaket-kurtarma]
duzey: orta
guncellik: 2026-11
---

# Veritabanı yedekleme ve geri yükleme

> Bu notu ne zaman okumalı: ilk gerçek kullanıcıdan önce; yıkıcı bir migrasyondan önce; "yedek alıyoruz" denip hiç
> geri yükleme denenmemişse; bir kayıt yanlışlıkla silindiğinde.

## Temel fikir

Geri yüklenmemiş yedek bir umuttur, yedek değildir. Yedeklemenin işi dosya üretmek değil, **belli bir süre içinde
belli bir ana dönebilmektir.** İki sayıyla konuşulur:

- **Kayıp penceresi (RPO):** en kötü durumda kaç saatlik veri gider? Yedek aralığına eşittir.
- **Dönüş süresi (RTO):** felaketten sonra hizmet kaç dakikada geri gelir? Ancak tatbikatla ölçülür.

Çoğaltma (replica) yedek değildir: hatalı bir `DELETE` saniyesinde kopyaya da gider. Yedekler kişisel veri içerir;
şifrelenir, erişimi kısıtlanır ve silme yükümlülüklerine göre döndürülür.

## Yedek ↔ çoğaltma

| Soru                         | Yedek                                         | Çoğaltma                                     |
| ---------------------------- | --------------------------------------------- | -------------------------------------------- |
| Neye karşı korur             | Silme, bozulma, hatalı migrasyon, saldırı     | Makine/disk kaybı (kesintisizlik)            |
| Hatalı `DELETE` sonrası      | Önceki yedekte veri durur                     | Kopya da silinir                             |
| Kayıp penceresi              | Yedek aralığı                                 | Saniyeler                                    |
| Dönüş                        | Geri yükleme (dakikalar–saatler)              | Kopyaya geçiş                                |

## Karar tablosu

| Durum                                             | Yöntem                                                                   | Kayıp penceresi       |
| ------------------------------------------------- | ------------------------------------------------------------------------ | --------------------- |
| SQLite, küçük uygulama (havuzdaki `uygulama`)     | Gece `VACUUM INTO` + bütünlük denetimi + sunucu dışına şifreli kopya     | 1 gün                 |
| SQLite, bir günlük kayıp çok fazla                 | Yukarıdakine ek olarak sürekli WAL akışı yapan bir araç (Litestream gibi) | Saniyeler–dakikalar  |
| Yönetilen Postgres                                | Sağlayıcının otomatik yedeği ve noktasal dönüşü + **kendi** düzenli `pg_dump`'ınız başka bir yerde | Sağlayıcıya göre |
| Kendi Postgres'iniz (VPS)                         | Gece `pg_dump -Fc`; daha sıkı pencere için WAL arşivi (ileri düzey)       | 1 gün / dakikalar     |
| Kullanıcı yüklemeleri (fotoğraf, belge)           | Nesne deposunda sürümleme + başka hesapta kopya                          | Sürümlemeye göre      |

"Sağlayıcı zaten yedek alıyor" tek başına yetmez: hesap kapanırsa, silinirse ya da sağlayıcı değiştirmek isterseniz
o yedekler de gider. En az bir kopya sizin denetiminizde, başka bir yerde dursun.

## SQLite: çalışırken tutarlı yedek

WAL kipindeki SQLite (havuzdaki uygulama böyle çalışır) son yazmaları önce `-wal` dosyasında tutar. Çalışan
veritabanının dosyasını `cp`, `scp`, `rsync` ya da `tar` ile kopyalamak eksik ya da bozuk bir kopya verir:

```python calistir
import shutil
import sqlite3

db = sqlite3.connect("uygulama.db")
db.execute("PRAGMA journal_mode=WAL")  # havuzdaki uygulama da WAL kipinde çalışır
db.execute("CREATE TABLE kayit (id INTEGER PRIMARY KEY, metin TEXT)")
db.executemany("INSERT INTO kayit (metin) VALUES (?)", [(f"kayıt {i}",) for i in range(50)])
db.commit()  # yazmalar şimdi uygulama.db-wal dosyasında; ana dosyaya henüz aktarılmadı

# YANLIŞ: çalışan veritabanının dosyasını kopyalamak (cp, scp, rsync, tar)
shutil.copy("uygulama.db", "kopya.db")
try:
    sqlite3.connect("kopya.db").execute("SELECT count(*) FROM kayit").fetchone()
    raise AssertionError("tablo kopyada olmamalıydı")
except sqlite3.OperationalError as hata:
    print("dosya kopyası:", hata)

# DOĞRU: VACUUM INTO, tek bir anın tutarlı kopyası (uygulama çalışırken de güvenli)
db.execute("VACUUM INTO ?", ("yedek.db",))
yedek = sqlite3.connect("yedek.db")
assert yedek.execute("PRAGMA integrity_check").fetchone() == ("ok",)
print("VACUUM INTO:", yedek.execute("SELECT count(*) FROM kayit").fetchone()[0], "kayıt, bütünlük ok")
```

```cikti
dosya kopyası: no such table: kayit
VACUUM INTO: 50 kayıt, bütünlük ok
```

- `VACUUM INTO` hedef dosya varsa hata verir: her yedeğe zaman damgalı ad verin. Python'da `Connection.backup()`
  aynı güvenceyi verir.
- Havuzdaki hazır komut bunu yapar ve kopyayı `PRAGMA integrity_check` ile denetler:
  `npm run backup -w @uygulama/api` ya da Docker'da `docker exec uygulama npm run backup`
  ([`backup.ts`](../../uygulama/api/scripts/backup.ts)).

## Geri yükleme tatbikatı

Tatbikat **üretimin üstüne değil**, yeni bir dosyaya (ya da yeni bir veritabanına) yapılır; sonra doğrulanır ve süre
ölçülür:

```python calistir
import os
import sqlite3
import time

uretim = sqlite3.connect("uygulama.db")
uretim.execute("PRAGMA journal_mode=WAL")
uretim.executescript("""
    CREATE TABLE _migrations (version INTEGER PRIMARY KEY);
    INSERT INTO _migrations VALUES (1), (2), (3);
    CREATE TABLE gorev (id INTEGER PRIMARY KEY, baslik TEXT NOT NULL);
""")
uretim.executemany("INSERT INTO gorev (baslik) VALUES (?)", [(f"görev {i}",) for i in range(120)])
uretim.commit()
with sqlite3.connect("yedek-gece.db") as yedek:
    uretim.backup(yedek)  # Python'un çevrimiçi yedek API'si: VACUUM INTO ile aynı güvence
uretim.executemany("INSERT INTO gorev (baslik) VALUES (?)", [(f"yeni {i}",) for i in range(5)])
uretim.commit()  # yedekten SONRA eklenen 5 kayıt

uretim.execute("DELETE FROM gorev")  # felaket: koşulsuz silme
uretim.commit()
uretim.close()

# Tatbikat: üretimin üstüne DEĞİL, yeni bir dosyaya geri yükle ve doğrula
baslangic = time.monotonic()
for ek in ("", "-wal", "-shm"):  # eski günlük dosyaları yedeğin üstüne uygulanmasın
    if os.path.exists("geri.db" + ek):
        os.remove("geri.db" + ek)
with sqlite3.connect("yedek-gece.db") as kaynak, sqlite3.connect("geri.db") as hedef:
    kaynak.backup(hedef)
    assert hedef.execute("PRAGMA integrity_check").fetchone() == ("ok",)
    gorev = hedef.execute("SELECT count(*) FROM gorev").fetchone()[0]
    surum = hedef.execute("SELECT max(version) FROM _migrations").fetchone()[0]
sure = time.monotonic() - baslangic  # gerçek tatbikatta bunu kaydedin: dönüş süreniz
assert gorev == 120 and surum == 3 and sure < 5
print(f"geri yüklendi: {gorev} görev, şema sürümü {surum}, bütünlük ok")
print("yedekten sonra eklenen 5 görev geri gelmedi: kayıp penceresi = yedek aralığı")
```

```cikti
geri yüklendi: 120 görev, şema sürümü 3, bütünlük ok
yedekten sonra eklenen 5 görev geri gelmedi: kayıp penceresi = yedek aralığı
```

Gerçek tatbikat adımları (ayda bir ya da her büyük değişiklikten önce):

1. Sunucu dışındaki en yeni yedeği indirin; şifreliyse **çözün** (anahtarın gerçekten elinizde olduğu burada anlaşılır).
2. Ayrı bir ortamda (yerel makine, deneme sunucusu) geri yükleyin; SQLite'ta yanındaki `-wal`/`-shm` dosyalarını silin.
3. `PRAGMA integrity_check` → `ok`; tablo sayımları üretimdekine yakın; birkaç kaydı elle açın.
4. Uygulamayı bu veriyle **başlatın**: eksik migrasyonlar uygulanıyor, giriş yapılabiliyor.
5. Toplam süreyi ve en yeni kaydın tarihini (gerçek kayıp pencereniz) not edin.

Üretimde geri yükleme sırası havuzdaki belgede: [`YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md) → "Yedekleme ve
geri yükleme" (sunucuyu durdur → dosyayı koy, `-wal`/`-shm`'yi sil → başlat → istemciler eşitlemede uyarılır).
Geri yükleme yedekten sonra yazılmış her şeyi siler; tek bir kaydı kurtarmak için bütün veritabanını geri
yüklemeyin: yedeği yanına açıp yalnız o kaydı taşıyın.

## PostgreSQL: mantıksal yedek

```bash
pg_dump --format=custom --no-owner --file="yedek-$(date -u +%Y%m%d-%H%M).dump" "$DATABASE_URL"  # çalışırken tutarlı
pg_restore --list yedek-20261116-0317.dump | head                    # içinde ne var
pg_restore --no-owner --dbname="$TATBIKAT_DATABASE_URL" yedek-20261116-0317.dump  # tatbikat: boş, AYRI veritabanına
```

- `pg_dump`'ın ana sürümü sunucununkiyle aynı ya da daha yeni olmalıdır; eskisi sürüm uyuşmazlığıyla durur.
  Kapsayıcıdaki aracı kullanmak bunu çözer (`docker compose exec -T db pg_dump …`, [Docker Compose](docker-compose.md)).
- Roller (veritabanı kullanıcıları) `pg_dump`'a girmez; hedefte rolleri ayrıca kurun ya da geri yüklemede
  `--no-owner` kullanın.
- Büyük veritabanlarında mantıksal yedek yavaşlar; fiziksel yedek ve WAL arşivi (noktasal dönüş) gerekir. Yönetilen
  serviste bu sağlayıcının işidir; geri yükleme çoğu sağlayıcıda **yeni** bir veritabanı açar ve uygulamanın
  bağlantı adresini değiştirmeniz gerekir.

## Zamanlama

İki yedek aynı anda koşmasın: `flock -n` ikinci turu bekletmeden atlar.

```bash calistir
cat > yedekle.sh <<'BETIK'
set -eu
exec 9> yedek.kilit
if ! flock -n 9; then
  echo "$1: önceki yedek sürüyor, bu tur atlandı"
  exit 0
fi
echo "$1: yedek başladı"
touch basladi
sleep 1 # gerçekte: VACUUM INTO + bütünlük denetimi + sunucu dışına kopya
echo "$1: yedek bitti"
BETIK
bash yedekle.sh "03:17 turu" &
until [ -e basladi ]; do sleep 0.05; done
bash yedekle.sh "03:18 turu"
wait
```

```cikti
03:17 turu: yedek başladı
03:18 turu: önceki yedek sürüyor, bu tur atlandı
03:17 turu: yedek bitti
```

VPS'te iki yol: `crontab -e` (havuzdaki örnek: `YAYINLAMA.md` → "Yedekleme") ya da systemd zamanlayıcısı. Zamanlayıcı
günlüğü `journalctl`'a yazar ve makine kapalıyken kaçırılan turu açılışta çalıştırır (`Persistent=true`). Aşağıdaki
iki dosya `systemd-analyze verify` ile denetlendi:

```ini
# /etc/systemd/system/uygulama-yedek.service
[Unit]
Description=Uygulama yedeği

[Service]
Type=oneshot
User=uygulama
ExecStart=/srv/uygulama/yedekle.sh

# /etc/systemd/system/uygulama-yedek.timer
[Unit]
Description=Her gece uygulama yedeği

[Timer]
OnCalendar=*-*-* 03:17:00
Persistent=true
RandomizedDelaySec=10min

[Install]
WantedBy=timers.target
```

`sudo systemctl enable --now uygulama-yedek.timer`; sonraki çalışma: `systemctl list-timers`. Cron'un ortamı
çıplaktır (`PATH` kısa): betikte tam yollar yazın. Saat sunucunun saat dilimine göredir (UTC önerilir).

## Sunucu dışına kopya, şifreleme, saklama

- **3-2-1 kuralı:** en az 3 kopya, 2 farklı ortam, 1'i başka bir yerde (başka sağlayıcı ya da hesap).
- **Sunucu ele geçerse yedekler de silinmesin:** başka bir makine yedeği **çeksin** (salt okur anahtarla), ya da
  yedek deposuna yalnız yazabilen (silemeyen) bir anahtarla gönderin; nesne deposunda sürümleme ya da silme kilidi
  açın.
- **Şifreleme:** sunucuda yalnız **açık anahtar** dursun; özel anahtar çevrimdışı (parola yöneticisi + kâğıt).
  Sunucu ele geçse bile eski yedekler okunamaz. `age` ile (bu makinede denendi):

```bash
age-keygen -o yedek-anahtari.txt                            # bir kez, sunucu DIŞINDA; ekrandaki "age1…" açık anahtardır
age -r age1…açık-anahtar… -o yedek.db.age yedek.db         # sunucuda: yalnız açık anahtarla şifrele
age -d -i yedek-anahtari.txt -o geri.db yedek.db.age        # tatbikatta: özel anahtarla çöz
```

- **Saklama:** büyükbaba-baba-oğul (GFS) düzeni yaygındır: son 7 günlük, son 4 haftalık, son 12 aylık yedek. Kişisel
  veri silme talepleri yedeklerde döndürme süresi kadar yaşar; bu süreyi gizlilik metninde yazın
  ([`veri/docs/KVKK_NOTLARI.md`](../../veri/docs/KVKK_NOTLARI.md)).

```python calistir
from datetime import date, timedelta


def saklanacaklar(tarihler: list[date], gunluk: int = 7, haftalik: int = 4, aylik: int = 12) -> set[date]:
    """Büyükbaba-baba-oğul: son 7 günün, son 4 haftanın ve son 12 ayın en yeni yedeği kalır."""
    sirali = sorted(tarihler, reverse=True)
    haftalar: dict[tuple[int, int], date] = {}
    aylar: dict[tuple[int, int], date] = {}
    for t in sirali:
        haftalar.setdefault(t.isocalendar()[:2], t)  # her haftanın en yenisi
        aylar.setdefault((t.year, t.month), t)  # her ayın en yenisi
    return set(sirali[:gunluk]) | set(list(haftalar.values())[:haftalik]) | set(list(aylar.values())[:aylik])


bugun = date(2026, 11, 16)
yedekler = [bugun - timedelta(days=i) for i in range(400)]  # 400 günlük yedek birikmiş
tut = saklanacaklar(yedekler)
assert bugun in tut and date(2026, 10, 31) in tut and date(2026, 10, 30) not in tut
print(f"{len(yedekler)} yedekten {len(tut)} tanesi kalır, {len(yedekler) - len(tut)} tanesi silinebilir")
```

```cikti
400 yedekten 20 tanesi kalır, 380 tanesi silinebilir
```

## Yedeğin kendisini izlemek

Yedek işi sessizce durabilir (disk dolu, anahtar süresi dolmuş, betik hata verip çıkmış). İki basit uyarı çoğu
sorunu yakalar: **en yeni yedek çok eski** ve **en yeni yedek birden küçüldü**.

```python calistir
from datetime import datetime, timedelta
from statistics import median


def yedek_uyarilari(yedekler: list[tuple[datetime, int]], simdi: datetime) -> list[str]:
    """yedekler: (alınma zamanı, bayt). Günlük yedek varsayılır."""
    uyarilar = []
    zaman, boyut = max(yedekler)
    if simdi - zaman > timedelta(hours=26):  # bir gün + pay
        gecen = simdi - zaman
        uyarilar.append(f"en yeni yedek {gecen.days} gün {gecen.seconds // 3600} saat önce alınmış")
    onceki = [b for z, b in yedekler if z != zaman]
    if onceki and boyut < 0.5 * median(onceki):
        uyarilar.append("en yeni yedek öncekilerin yarısından küçük: veri silinmiş ya da yedek yarım olabilir")
    return uyarilar


simdi = datetime(2026, 11, 16, 9, 0)
saglikli = [(datetime(2026, 11, 16 - g, 3, 17), 40_000_000 + g * 10_000) for g in range(7)]
assert yedek_uyarilari(saglikli, simdi) == []
duran = saglikli[3:]  # son üç gecenin yedeği alınmamış
kuculen = [(datetime(2026, 11, 16, 3, 17), 1_200_000)] + saglikli[1:]
for uyari in yedek_uyarilari(duran, simdi) + yedek_uyarilari(kuculen, simdi):
    print("UYARI:", uyari)
```

```cikti
UYARI: en yeni yedek 3 gün 5 saat önce alınmış
UYARI: en yeni yedek öncekilerin yarısından küçük: veri silinmiş ya da yedek yarım olabilir
```

Zamanlanmış işin hiç çalışmadığını anlamanın en sağlam yolu "ölü adam anahtarı"dır: yedek betiği her başarıda bir
izleme adresine haber verir; haber gelmezse uyarı çıkar ([İzleme ve uyarı](izleme-ve-uyari.md)).

## Tuzaklar

| Belirti                                                       | Neden                                                         | Çözüm                                                             |
| ------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- |
| Yedek açılmıyor ya da son günlerin kayıtları yok              | Çalışan SQLite dosyası `cp`/`tar` ile kopyalandı              | `VACUUM INTO` / `backup()`; ardından `integrity_check`            |
| Geri yüklenen veritabanı tuhaf, eski kayıtlar karışık         | Eski `-wal`/`-shm` dosyaları yeni dosyanın yanında kaldı      | Geri yüklemede ikisini de silin                                   |
| Felaket günü yedek şifresi çözülemedi                         | Özel anahtar yalnız sunucudaydı ya da kayboldu                | Anahtar çevrimdışı iki yerde; her tatbikatta çözme adımı          |
| Saldırgan sunucuyla birlikte yedekleri de sildi               | Yedekler aynı sunucuda ya da silme yetkili anahtarla          | Çekme modeli, yalnız yazabilen anahtar, silme kilidi              |
| Yedek aylardır alınmıyormuş                                   | Zamanlanmış iş sessizce hata veriyor                          | Tazelik uyarısı ve ölü adam anahtarı                              |
| `pg_dump: server version mismatch`                            | Aracın sürümü sunucudan eski                                  | Aynı ya da yeni sürüm araç; kapsayıcıdaki aracı kullanın          |
| `pg_dump` dosyası bozuk çıkıyor                               | `docker compose exec` TTY ile çalıştı                         | `exec -T`                                                         |
| Geri yükleme yedekten sonraki bütün işleri sildi              | Tek kayıt için bütün veritabanı geri yüklendi                 | Yedeği yanına açıp yalnız gereken kaydı taşıyın                   |
| Disk yedeklerle doldu                                         | Saklama/döndürme yok                                          | GFS ile eski yedekleri silin; boyutu izleyin                      |
| İki yedek üst üste koşup sunucuyu yavaşlattı                  | Önceki tur bitmeden yenisi başladı                            | `flock -n`; zamanı yoğun olmayan saate kaydırın                   |
| Silinmesi istenen kişisel veri yedekte duruyor                | Döndürme süresi gizlilik metninde yok                         | Süreyi yazın ve uygulayın                                         |

## Denetim listesi

- [ ] Kayıp penceresi ve dönüş süresi hedefi yazılı (ör. "en çok 1 gün veri, 1 saatte dönüş").
- [ ] Yedek tutarlı yöntemle alınıyor (`VACUUM INTO`, `backup()`, `pg_dump`); dosya kopyası yok.
- [ ] Her yedek alındıktan sonra bütünlük denetiminden geçiyor.
- [ ] Yedek sunucunun dışında, şifreli; özel anahtar çevrimdışı iki yerde.
- [ ] Sunucu ele geçse bile yedekler silinemiyor (çekme modeli ya da silme kilidi).
- [ ] Saklama düzeni (GFS) uygulanıyor; disk dolmuyor.
- [ ] Tazelik ve boyut uyarısı ya da ölü adam anahtarı kurulu.
- [ ] Son bir ay içinde geri yükleme tatbikatı yapıldı; süre ve kayıp penceresi not edildi.
- [ ] Yıkıcı her migrasyondan önce elle yedek alınıyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Yedeği `VACUUM INTO` (ya da `pg_dump -Fc`) ile al, ardından `integrity_check` yap, zaman damgalı
  ada yaz, `flock -n` ile çakışmayı önle, sunucu dışına `age -r` ile şifreleyip gönder. Ayrıca geri yükleme betiğini
  yaz ve onu boş bir klasörde çalıştırıp sonucu göster."
- **Modelin tipik hatası:** SQLite dosyasını `cp` ile kopyalamak; yedeği aynı diske koyup bitti saymak; geri
  yüklemeyi hiç denememek; özel anahtarı sunucuda bırakmak; geri yüklemede `-wal`/`-shm`'yi unutmak; "yönetilen
  veritabanı zaten yedekliyor" deyip dışarıda kopya tutmamak.
- **Çıktıda denetleyin:** betikte `cp …db`, `tar …db` var mı; geri yükleme betiği var mı ve çıktısı gösterildi mi;
  yedek hedefi sunucunun kendisi mi.

## İlgili

- [Migrasyonlar](../30-arkauc/migrasyonlar.md) — yıkıcı göçten önce yedek, geri almanın gerçeği
- [Yedek ve fidye yazılımı](../50-guvenlik/yedek-ve-fidye-yazilimi.md) — saldırganın silemeyeceği kopya, hangi yedeğe dönülür
- [KVKK pratik](../50-guvenlik/kvkk-pratik.md) · [Veri yaşam döngüsü](../40-sistem-tasarimi/veri-yasam-dongusu.md) — saklama süresi, silme talebi ve yedek
- [İzleme ve uyarı](izleme-ve-uyari.md) · [Olay sonrası değerlendirme](olay-sonrasi-degerlendirme.md)
- [Docker Compose](docker-compose.md) (`exec -T`) · [Linux temelleri](linux-temelleri.md) (systemd)
- Çalışan karşılıklar: [`backup.ts`](../../uygulama/api/scripts/backup.ts),
  [`uygulama/docs/YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md) → "Yedekleme ve geri yükleme"
