---
baslik: Arka plan işleri: kuyruk, yeniden deneme ve idempotent tüketici
ozet: İşi istekten kuyruğa almak; en az bir kez teslim, görünürlük süresi, geri çekilmeli yeniden deneme, ölü mektup, zamanlanmış işlerde çifte çalışma ve tam bir kez yanılgısı; SQLite üstünde çalışan kuyruk örneğiyle.
etiketler: [kuyruk, arka-plan, yeniden-deneme, idempotentlik, zamanlama]
duzey: ileri
guncellik: 2026-11
---

# Arka plan işleri: kuyruk, yeniden deneme ve idempotent tüketici

> Bu notu ne zaman okumalı: e-posta, fatura, rapor, webhook gönderimi, dosya işleme gibi yavaş ya da başarısız
> olabilen bir iş yazılırken; "e-posta iki kez gitti" ya da "hiç gitmedi" şikâyetinde; her gece çalışan bir iş
> kurulurken.

## Temel fikir

Bir iş şu durumlardan birindeyse istek içinde yapılmaz, kuyruğa konur: **yavaştır** (kullanıcı beklemesin),
**başarısız olabilir ve yeniden denenmelidir** (dış servis), **sunucu yeniden başlasa da kaybolmamalıdır**
(fatura), ya da **hızı denetlenmelidir** (sağlayıcının dakikalık sınırı).

Kuyrukların gerçeği tek cümledir: **mesaj en az bir kez teslim edilir.** İşçi işi yapıp "bitti" demeden önce
çökerse, ağ "bitti" iletisini yutarsa, iş yeniden teslim edilir. "Tam bir kez" teslim eden bir kuyruk yoktur;
"etkisi bir kez" olan bir **sistem** vardır: en az bir kez teslim + **idempotent tüketici** (aynı mesajı iki kez
işlemek bir kez işlemekle aynı sonucu verir).

Kavramlar: **kiralama / görünürlük süresi** (visibility timeout: alınan iş N saniye başkasına görünmez; bitmezse
yeniden görünür), **geri çekilme** (backoff: denemeler arası artan bekleme), **ölü mektup** (dead letter: en çok
deneme aşılınca insanın bakacağı yere ayrılan iş).

## Karar tablosu: iş nerede çalışmalı

| İş                                                                 | Yer                                         | Neden                                                    |
| ------------------------------------------------------------------ | ------------------------------------------- | -------------------------------------------------------- |
| Kısa (< ~100 ms) ve sonucu kullanıcı görmeli                       | İstek içinde                                | Kuyruk karmaşası gereksiz                                |
| Yanıtı bekletmesin, kaybolursa zarar yok (önbellek ısıtma, ölçüm)  | Süreç içi arka plan işi                     | Basit; sunucu çökerse iş kaybolur                        |
| Kaybolmamalı (e-posta, fatura, webhook gönderimi, ödeme kontrolü)  | **Kalıcı kuyruk** (veritabanı tablosu)      | Yeniden başlatmadan sağ çıkar, yeniden denenir           |
| Çok yüksek hacim, ayrı ölçeklenen tüketiciler                      | Ayrı kuyruk servisi                         | Veritabanını yormaz; işletme yükü getirir                |
| Belirli saatte, düzenli                                            | Zamanlayıcı → kalıcı kuyruğa iş koyar       | Zamanlayıcı yalnız tetikler; iş kuyruk kurallarıyla koşar |

Küçük bir uygulama için veritabanı tablosu üstündeki kuyruk çoğu zaman yeter ve en büyük artısı şudur: iş,
onu doğuran değişiklikle **aynı işlemde** kuyruğa yazılır (giden kutusu; [İşlemler ve eşzamanlılık](islemler-ve-eszamanlilik.md)).

## Çalışan bir kuyruk: kiralama, yeniden teslim, idempotent tüketici, ölü mektup

Saat dışarıdan verilir; örnek bir işçinin çöküşünü ve hep başarısız olan bir işi baştan sona izler
(`RETURNING` için SQLite 3.35+ gerekir).

```python calistir
import json
import sqlite3

db = sqlite3.connect(":memory:", isolation_level=None)
db.executescript("""
CREATE TABLE is_kuyrugu (
  id INTEGER PRIMARY KEY, tur TEXT NOT NULL, veri TEXT NOT NULL,
  durum TEXT NOT NULL DEFAULT 'bekliyor' CHECK (durum IN ('bekliyor', 'calisiyor', 'bitti', 'olu')),
  deneme INTEGER NOT NULL DEFAULT 0, gorunur_at REAL NOT NULL DEFAULT 0, son_hata TEXT
);
CREATE TABLE islenmis (mesaj_id INTEGER PRIMARY KEY);  -- idempotent tüketici
CREATE TABLE eposta (alici TEXT NOT NULL);              -- yan etkinin kendisi
""")
saat = [0.0]
KIRALAMA, EN_COK_DENEME = 30.0, 4


def ekle(tur: str, veri: dict) -> None:
    db.execute("INSERT INTO is_kuyrugu (tur, veri) VALUES (?, ?)", (tur, json.dumps(veri)))


def al():
    """Görünür ilk işi kiralar: 30 sn içinde onaylanmazsa yeniden görünür olur (işçi çökmüş sayılır)."""
    return db.execute(
        """UPDATE is_kuyrugu SET durum = 'calisiyor', deneme = deneme + 1, gorunur_at = ?
           WHERE id = (SELECT id FROM is_kuyrugu
                       WHERE durum IN ('bekliyor', 'calisiyor') AND gorunur_at <= ? ORDER BY id LIMIT 1)
           RETURNING id, veri, deneme""",
        (saat[0] + KIRALAMA, saat[0]),
    ).fetchone()


def isle(mesaj_id: int, veri: dict) -> None:  # yan etki ve "işlendi" kaydı AYNI işlemde
    db.execute("BEGIN IMMEDIATE")
    if db.execute("INSERT OR IGNORE INTO islenmis VALUES (?)", (mesaj_id,)).rowcount == 1:
        db.execute("INSERT INTO eposta VALUES (?)", (veri["alici"],))
    db.execute("COMMIT")


def onayla(mesaj_id: int) -> None:
    db.execute("UPDATE is_kuyrugu SET durum = 'bitti' WHERE id = ?", (mesaj_id,))


def basarisiz(mesaj_id: int, deneme: int, hata: str) -> None:
    if deneme >= EN_COK_DENEME:  # ölü mektup: insan baksın
        db.execute("UPDATE is_kuyrugu SET durum = 'olu', son_hata = ? WHERE id = ?", (hata, mesaj_id))
    else:  # üstel geri çekilme: 10, 20, 40 sn (gerçekte + rastgele titreme)
        db.execute(
            "UPDATE is_kuyrugu SET durum = 'bekliyor', gorunur_at = ?, son_hata = ? WHERE id = ?",
            (saat[0] + 10 * 2 ** (deneme - 1), hata, mesaj_id),
        )


# 1) İşçi işi yaptı ama onaylamadan çöktü → kiralama dolunca iş YENİDEN teslim edilir
ekle("hosgeldin", {"alici": "ayse@ornek.com"})
mid, veri, _ = al()
isle(mid, json.loads(veri))  # e-posta gitti… ve süreç burada öldü (onay yok)
assert al() is None  # kiralama sürerken başkası almaz
saat[0] += 31
mid2, veri2, deneme = al()
assert (mid2, deneme) == (mid, 2)  # en az bir kez teslim: AYNI iş ikinci kez geldi
isle(mid2, json.loads(veri2))
onayla(mid2)
assert db.execute("SELECT count(*) FROM eposta").fetchone() == (1,)  # idempotent: tek e-posta

# 2) Hep başarısız olan iş: geri çekilmeyle yeniden denenir, sonra ölü mektuba düşer
ekle("fatura", {"alici": "x"})
denemeler = []
while (is_ := al()) or db.execute("SELECT 1 FROM is_kuyrugu WHERE durum = 'bekliyor'").fetchone():
    if is_ is None:
        saat[0] += 1  # bekleme süresini geçir
        continue
    denemeler.append((is_[2], saat[0]))
    basarisiz(is_[0], is_[2], "sağlayıcı 503 döndü")
assert [d for d, _ in denemeler] == [1, 2, 3, 4]
assert db.execute("SELECT durum FROM is_kuyrugu WHERE tur = 'fatura'").fetchone() == ("olu",)
print("denemeler arası:", [round(b - a) for (_, a), (_, b) in zip(denemeler, denemeler[1:])])
```

```cikti
denemeler arası: [10, 20, 40]
```

Örnekte üç ince nokta var:

- **Alma tek komuttur** (`UPDATE … WHERE id = (SELECT …) RETURNING`): iki işçi aynı işi alamaz. Postgres'te birden
  çok işçiyle bunun karşılığı `SELECT … FOR UPDATE SKIP LOCKED`'tır.
- **İdempotentlik yan etkiyle aynı işlemdedir.** Yan etki dışarıdaysa (e-posta sağlayıcısı) aynı işleme giremez;
  o zaman mesaj kimliğini sağlayıcıya idempotentlik anahtarı olarak verin ya da "gönderildi" kaydını gönderimden
  hemen sonra yazın ve nadir çift gönderimi kabul edin.
- **Kiralama süresi işin en uzun süresinden uzun olmalı.** Değilse iş bitmeden ikinci işçi de alır. Uzun işte
  işçi kiralamayı ara ara uzatır.

## Yeniden deneme kuralları

| Hata                                                    | Yeniden dene? | Not                                                    |
| ------------------------------------------------------- | ------------- | ------------------------------------------------------ |
| Zaman aşımı, bağlantı koptu, 502/503/504                | Evet          | Geçicidir                                              |
| 429                                                     | Evet          | `Retry-After` süresine uyun                            |
| 400, 401, 403, 404, 422                                 | **Hayır**     | Kalıcıdır; hemen ölü mektuba ya da hata durumuna       |
| Kendi kodunuzdaki hata (istisna)                        | Sınırlı       | Düzeltilene dek ölü mektupta bekler; düzeltince yeniden kuyruğa |

- Bekleme: `min(üst_sınır, taban × 2^deneme)` ve bunun 0 ile kendisi arasında **rastgele** bir değeri (tam
  titreme). Titreme olmazsa aynı anda düşen yüzlerce iş aynı anda yeniden dener ve sağlayıcıyı yeniden düşürür.
- En çok deneme sayısı ve toplam süre sınırı olsun; sonsuz yeniden deneme kuyruğu tıkar.
- Hazır yardımcı (Retry-After desteği, iptal, hangi hatada yeniden denenir seçimi):
  [`kutuphane/py/kutuphane/yeniden_dene.py`](../../kutuphane/py/kutuphane/yeniden_dene.py).

## Ölü mektup

- Ölü mektuba düşen her iş bir uyarı üretir; sayısı izlenir.
- Kayıtta son hata, deneme sayısı ve iş verisi durur; bir yönetim komutu "yeniden kuyruğa al" ya da "vazgeç" der.
- Kişisel veri içeren iş verisinin saklama süresi bellidir.

## Zamanlanmış işler ve çifte çalışma

Uygulamanın iki kopyası varsa ikisinin zamanlayıcısı da 03:00'te tetikler. Ya zamanlayıcıyı tek bir kopyada
çalıştırın ya da her **dönem** için tek çalışma hakkını veritabanında alın:

```sql calistir
CREATE TABLE zamanli_calisma (is_adi TEXT NOT NULL, donem TEXT NOT NULL, PRIMARY KEY (is_adi, donem));
INSERT OR IGNORE INTO zamanli_calisma VALUES ('gunluk-rapor', '2026-11-16');  -- kopya A
SELECT changes();  -- 1: A çalıştırır
INSERT OR IGNORE INTO zamanli_calisma VALUES ('gunluk-rapor', '2026-11-16');  -- kopya B
SELECT changes();  -- 0: B atlar
```

```cikti
1
0
```

- Dönem anahtarı **işin yaşadığı saat dilimindeki** tarihtir: "her gün 03:00 İstanbul" işinin dönemi İstanbul
  tarihidir; sunucunun UTC tarihi gece yarısından sonraki üç saatte bir gün geride kalır
  ([Zaman ve saat dilimi](zaman-ve-saat-dilimi.md)). Sonraki çalışma anını hesaplayan yardımcı:
  [`kutuphane/py/kutuphane/cron.py`](../../kutuphane/py/kutuphane/cron.py).
- Kaçırılan çalışmalar: sunucu 03:00'te kapalıysa açılınca ne olacak (bir kez telafi mi, atla mı) kararı yazılı
  olsun.
- Uzun süren iş bir sonraki tetiklemeye taşabilir: aynı işin ikinci kopyası, ilki sürerken başlamasın.
- Havuzdaki API bakım işini saatte bir, süreç içinde koşar; tek kopya kuralı sayesinde çifte çalışma olmaz
  ([`maintenance.ts`](../../uygulama/api/src/maintenance.ts), [`index.ts`](../../uygulama/api/src/index.ts)).

## İşi küçük ve yeniden başlatılabilir tutun

- **İş verisi kimlik taşır, nesne değil:** `{"faturaId": 42}`. İşçi güncel veriyi kendisi okur; kuyrukta
  bayat kopya ve kişisel veri birikmez.
- **İşçi durumu yeniden denetler:** kullanıcı bu arada hesabını silmiş, sipariş iptal edilmiş olabilir.
- **Büyük işi parçalayın:** 100 000 e-postalık kampanya tek iş değil, 1000'lik partiler; her parti kendi işi. İş
  kesilirse kaldığı yerden sürer (yapılanlar işaretli).
- **Her işin zaman aşımı olsun;** asılı kalan dış çağrı işçiyi sonsuza dek tutmasın.
- **İşçi düzgün kapanır:** yeni iş almayı bırakır, elindekini bitirir ya da kiralamayı bırakır
  ([Sunucu mimarisi](sunucu-mimarisi.md)).

## "Tam bir kez" yanılgısı

"Bu kuyruk tam bir kez teslim ediyor" iddiasını görünce şu soruyu sorun: işçi yan etkiyi yaptıktan sonra, onayı
göndermeden önce elektrik kesilirse ne olur? Ya iş yeniden teslim edilir (en az bir kez) ya da edilmez (en çok bir
kez: iş kaybolur). Üçüncü yol yoktur. Bu yüzden:

- Kayıp kabul edilemiyorsa: en az bir kez + idempotent tüketici (mesaj kimliği, benzersizlik kısıtı, `upsert`,
  durum makinesinde koşullu geçiş: `UPDATE … SET durum = 'gonderildi' WHERE durum = 'bekliyor'`).
- Çift kabul edilemiyorsa ve dış servis idempotentlik anahtarı almıyorsa: işlemi yapmadan önce dış servisten
  durum sorgulayın.

## Tuzaklar

| Belirti                                                       | Neden                                                    | Çözüm                                                           |
| ------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------- |
| E-posta ara sıra iki kez gidiyor                              | En az bir kez teslim, tüketici idempotent değil          | Mesaj kimliğiyle "işlendi" kaydı; sağlayıcıya idempotentlik anahtarı |
| Sunucu yeniden başlayınca bekleyen e-postalar kayboldu        | Süreç içi (bellek) kuyruk                                | Kalıcı kuyruk                                                   |
| Aynı iş iki işçide birden çalışıyor                           | Kiralama süresi işin süresinden kısa                     | Süreyi uzatın ya da işçi kiralamayı yenilesin                   |
| Bir sağlayıcı arızasından sonra kuyruk saatlerce tıkalı       | Kalıcı hatalar sonsuz yeniden deneniyor                  | 4xx'i yeniden denemeyin; en çok deneme + ölü mektup             |
| Sağlayıcı düzelir düzelmez yine çöktü                         | Bütün işler aynı anda yeniden denedi                     | Üstel geri çekilme + titreme                                    |
| Gece raporu iki kez gönderildi                                | İki kopyanın zamanlayıcısı                               | Dönem başına tek çalışma kaydı                                  |
| 00:00–03:00 arası çalışan iş bir gün önceki raporu üretiyor   | Dönem UTC tarihine göre                                  | Dönemi işin saat dilimindeki tarihe göre hesaplayın             |
| İş, silinmiş kullanıcıya e-posta attı                         | İş verisinde bayat kopya; durum yeniden denetlenmedi     | Kimlik taşıyın, işlemeden önce güncel durumu okuyun             |
| Kuyruk büyüyor ama kimse fark etmiyor                         | İzleme yok                                               | Kuyruk derinliği ve en eski işin yaşı için uyarı                |
| İşlem geri alındı ama iş kuyruğa girdi (ya da tersi)          | Kuyruğa yazma ayrı işlemde/ayrı sistemde                 | Giden kutusu: aynı işlemde yazın                                |

## Denetim listesi

- [ ] Kaybolmaması gereken her iş kalıcı kuyrukta; kuyruğa yazma onu doğuran değişiklikle aynı işlemde.
- [ ] Her tüketici idempotent (mesaj kimliği / benzersizlik / koşullu durum geçişi) ve bunun testi var.
- [ ] Kiralama süresi en uzun iş süresinden uzun; asılı işi önleyen zaman aşımı var.
- [ ] Yeniden deneme: yalnız geçici hatalar, üstel geri çekilme + titreme, en çok deneme sınırı.
- [ ] Ölü mektup durumu, uyarısı ve "yeniden kuyruğa al" yolu var.
- [ ] Zamanlanmış işler dönem başına tek çalışıyor; dönem doğru saat diliminde.
- [ ] İş verisi kimlik taşıyor; işçi güncel durumu yeniden okuyor.
- [ ] Kuyruk derinliği, en eski işin yaşı, başarısızlık oranı izleniyor.
- [ ] İşçi düzgün kapanıyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu işi kalıcı kuyruğa koy; kuyruğa yazma, kaydı oluşturan işlemle aynı işlemde olsun. Tüketici
  idempotent olsun: aynı mesaj iki kez gelirse yan etki bir kez olsun. Geçici hatada üstel geri çekilme + titreme,
  en çok N deneme, sonra ölü mektup. Bir işçinin onaylamadan çöktüğü senaryonun testini yaz."
- **Tipik hatalar:** `setTimeout`/bellek kuyruğunu kalıcı sanmak; kuyruktan alırken `SELECT` sonra ayrı `UPDATE`
  (iki işçi aynı işi alır); her hatayı sonsuza dek yeniden denemek; iş verisine bütün nesneyi koymak; "tam bir
  kez" varsaymak.
- **Çıktıda arayın:** alma sorgusu tek komut mu; tüketicide mesaj kimliğine dayalı bir tekillik var mı; yeniden
  deneme koşulunda 4xx ayrılıyor mu; zamanlanmış işte dönem anahtarı var mı.

## İlgili

- [İşlemler ve eşzamanlılık](islemler-ve-eszamanlilik.md) (giden kutusu) · [Webhooklar](webhooklar.md) (gönderim
  çizelgesi) · [E-posta ve bildirim](e-posta-ve-bildirim.md) · [Zaman ve saat dilimi](zaman-ve-saat-dilimi.md)
- Havuzdaki bellek içi arka plan işi ve sınırı: [`uygulama/api/src/lib/background.ts`](../../uygulama/api/src/lib/background.ts)
  (README → "Sınırlar": sunucu çökerse gönderilmemiş e-posta kaybolur).
- Süreç içi, eşzamanlılığı sınırlı görev kuyruğu (kalıcı değil): [`kutuphane/py/kutuphane/kuyruk.py`](../../kutuphane/py/kutuphane/kuyruk.py).
- Sistem düzeyi: [Kuyruk ve olaylar](../40-sistem-tasarimi/kuyruk-ve-olaylar.md) ·
  [Dayanıklılık kalıpları](../40-sistem-tasarimi/dayaniklilik-kaliplari.md) (yeniden deneme bütçesi, devre kesici).
