---
baslik: Kuyruk ve olaylar: eşzamansız iş, teslim garantisi ve giden kutusu
ozet: İşi kuyruğa ne zaman almalı; en az bir kez teslim ve idempotent tüketici, sıra garantisi, geri basınç, zehirli mesaj ve giden kutusu (outbox) kalıbı; çalışan benzetimlerle.
etiketler: [kuyruk, olay, idempotentlik, outbox, geri-basinc, mimari]
duzey: ileri
guncellik: 2026-11
---

# Kuyruk ve olaylar: eşzamansız iş, teslim garantisi ve giden kutusu

> Bu notu ne zaman okumalı: istek içinde saniyeler süren bir iş (e-posta, PDF, görsel, dil modeli çağrısı)
> yazılırken; "sipariş verilince fatura kesilsin, e-posta gitsin, puan eklensin" gibi bir olaya birden çok iş
> bağlanırken; bir model RabbitMQ/Kafka/Redis kuyruğu eklemeyi önerdiğinde; aynı e-posta iki kez gittiğinde.

## Temel fikir

- Kuyruk, işi "şimdi" yapmaktan "birazdan ama kesin" yapmaya çevirir. Kazanç: istek hızlı döner, tepe yük
  düzleşir, hata olursa yeniden denenir, işi üreten ile yapan birbirini beklemez.
- Bedel: sonuç **nihai** tutarlıdır; mesajlar **yinelenebilir** ve **sırası bozulabilir**; izlenmesi gereken yeni
  bir parça doğar.
- Pratikte teslim garantisi **en az bir kez**dir. "Tam bir kez" bir teslim özelliği değil, sonuç özelliğidir:
  en az bir kez teslim + **idempotent tüketici** (aynı mesajı iki kez işlemek bir kez işlemekle aynı sonucu verir).
- Sınırsız kuyruk aşırı yükü gizler: yük gecikmeye, gecikme bellek taşmasına döner. Sınır ve geri basınç
  (backpressure) aşırı yükü görünür ve yönetilir kılar.
- "Veritabanına yaz, sonra olay yayınla" iki ayrı yazmadır; arada çökme olayı kaybeder. Çaresi **giden kutusu**.

## Karar tablosu

| Durum                                                           | Seçim                                                    | Neden                                                    |
| --------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| İş kısa (< 100 ms) ve sonucu yanıtta gerekli                     | İstek içinde yap                                         | Kuyruk yalnız karmaşıklık ekler                          |
| İş uzun, sonucu sonra gösterilebilir; tek sunucu                 | Veritabanında iş tablosu + yoklayıcı işçi                 | Yeni altyapı yok; işlemle birlikte yazılır                |
| Kaybolursa sorun olmayan, yan etkisi küçük iş                    | Bellek içi arka plan işi                                 | En basit; ama dağıtımda/çökmede kaybolur                 |
| Bir olaya birden çok bağımsız iş bağlanacak                      | Olay (yayın/abone) + her iş için ayrı tüketici            | Yeni tüketici, üreticiye dokunmadan eklenir              |
| Olay geçmişi yeniden oynatılacak, saniyede binlerce olay         | Günlük tabanlı akış (Kafka benzeri)                       | Tüketici kendi konumunu tutar; çoğu ürüne gerekmez       |
| Dış sisteme güvenilir bildirim (webhook, e-posta, ödeme)         | Giden kutusu + yeniden deneme + idempotentlik anahtarı   | Kayıp yok, yineleme ayıklanır                             |
| Arayüzü anlık güncellemek                                        | Anlık bildirim (SSE/WebSocket), kuyruk değil              | Kullanıcıya dürtme; veri eşitlemeyle gelir               |
| Saniyede yüzlerce istek, tüketici yetişemiyor                    | Sınırlı kuyruk + geri basınç; tüketici sayısını ölçerek artır | Sınırsız kuyruk sorunu saatlerce gizler               |

Havuzdaki API'de arka plan işleri bellek içidir: yanıtı bekletmez ama süreç ölürse iş kaybolur; başlıkta
kalıcı kuyruğun (tablo + yoklayıcı) ne zaman gerektiği yazar ([`background.ts`](../../uygulama/api/src/lib/background.ts)).

## Teslim garantileri

| Garanti         | Nasıl                                   | Sonuç                         | Nerede uygun                         |
| --------------- | --------------------------------------- | ----------------------------- | ------------------------------------ |
| En çok bir kez  | Önce onayla, sonra işle                 | Çökmede iş kaybolur           | Ölçüm, günlük, önemsiz bildirim       |
| En az bir kez   | Önce işle, sonra onayla                 | Çökmede iş yinelenir          | Varsayılan                           |
| "Tam bir kez"   | En az bir kez + idempotent tüketici     | Etki bir kez                  | Para, stok, e-posta, dış çağrı        |

## İdempotent tüketici

Tüketici işi yaptı, onay gönderemeden çöktü: aracı (broker) mesajı yeniden verir. Tüketici "bu mesajı işledim"
kaydını **etkiyle aynı veritabanı işleminde** tutarsa yineleme zararsızdır:

```python calistir
import sqlite3


def calistir(idempotent: bool) -> int:
    db = sqlite3.connect(":memory:", isolation_level=None)
    db.execute("CREATE TABLE bakiye (hesap TEXT PRIMARY KEY, kurus INTEGER NOT NULL)")
    db.execute("CREATE TABLE islenen (mesaj_id TEXT PRIMARY KEY)")  # tüketicinin "bunu gördüm" defteri
    db.execute("INSERT INTO bakiye VALUES ('ayse', 0)")
    kuyruk = [("m1", 5_000), ("m2", 2_500), ("m3", 1_000)]
    onaylanan: set[str] = set()
    cokecek = {"m2"}  # m2 işlendi, onay gönderilemeden süreç çöktü → aracı m2'yi yeniden verir
    while len(onaylanan) < len(kuyruk):
        for mid, tutar in kuyruk:
            if mid in onaylanan:
                continue
            db.execute("BEGIN")
            if idempotent and db.execute("INSERT OR IGNORE INTO islenen VALUES (?)", (mid,)).rowcount == 0:
                db.execute("COMMIT")  # daha önce işlenmiş: etkiyi yineleme, yalnız onayla
                onaylanan.add(mid)
                continue
            db.execute("UPDATE bakiye SET kurus = kurus + ? WHERE hesap = 'ayse'", (tutar,))
            db.execute("COMMIT")  # etki ve "işlendi" kaydı AYNI işlemde
            if mid in cokecek:
                cokecek.discard(mid)
                continue  # onay gitmedi
            onaylanan.add(mid)
    return db.execute("SELECT kurus FROM bakiye").fetchone()[0]


assert calistir(idempotent=False) == 11_000  # m2 iki kez işlendi: 25 TL fazla
assert calistir(idempotent=True) == 8_500
print("en az bir kez teslim: idempotent tüketiciyle bakiye doğru (85,00 TL)")
```

```cikti
en az bir kez teslim: idempotent tüketiciyle bakiye doğru (85,00 TL)
```

Kurallar:

- Mesaj kimliğini **üretici** verir ve yeniden denemelerde değişmez. Tüketicinin her teslimde ürettiği kimlik
  işe yaramaz.
- "İşlendi" kaydı ayrı bir işlemde, etkiden sonra yazılırsa ikisinin arasındaki çökme yine yineleme yaratır.
- Etki dışarıdaysa (e-posta sağlayıcısı, ödeme) aynı işleme sokulamaz: mesaj kimliğini sağlayıcıya
  **idempotentlik anahtarı** olarak iletin ([API tasarımı](../30-arkauc/api-tasarimi.md) → idempotentlik anahtarı).
- Bazı işler doğası gereği idempotenttir: "durumu `odendi` yap" ile "bakiyeye 25 TL ekle" farklıdır. Olayları
  mümkünse **mutlak** yazın ("yeni durum şu"), **göreli** değil ("şu kadar artır").

## Sıra garantisi

Bütün mesajlar için küresel sıra pahalıdır ve neredeyse hiç gerekmez. Gereken çoğunlukla **anahtar başına sıra**dır
(aynı siparişin olayları sırayla). Yeniden deneme ve paralel tüketici bu sırayı her durumda bozabilir; tüketici
sırasızlığa dayanıklı yazılır:

```python calistir
gelen = [(1, "olusturuldu"), (3, "kargolandi"), (2, "odendi")]  # 2 numara yeniden denemede gecikti

durum = None  # YANLIŞ: son gelen olayı yaz
for _, d in gelen:
    durum = d
assert durum == "odendi"  # sipariş "kargolandı"dan "ödendi"ye geri döndü

durum, surum = None, 0  # DOĞRU (olay tam durumu taşıyorsa): yalnız daha yeni sürümü uygula
for s, d in gelen:
    if s > surum:
        durum, surum = d, s
assert durum == "kargolandi"

# DOĞRU (olay fark taşıyorsa, ör. "+5 puan"): boşluk varsa beklet, sırayla uygula
puan, beklenen, bekleyen = 0, 1, {}
for s, fark in [(1, +5), (3, -2), (2, +10)]:
    bekleyen[s] = fark
    while beklenen in bekleyen:
        puan += bekleyen.pop(beklenen)
        beklenen += 1
assert puan == 13 and not bekleyen
print("sırasız teslim: sürüm denetimi ve boşluk bekletme doğru sonucu verdi")
```

```cikti
sırasız teslim: sürüm denetimi ve boşluk bekletme doğru sonucu verdi
```

- Sıra numarasını üretici (ya da kaydın sahibi olan veritabanı) verir; zaman damgası sıra değildir
  ([Dağıtık sistem yanılgıları](dagitik-sistem-yanilgilari.md) → saatler).
- Anahtar başına sıra gerekiyorsa aynı anahtarın mesajları aynı bölüme (partition) ve tek tüketiciye gider; bu,
  o anahtarın işlenme hızını tek tüketiciyle sınırlar.

## Geri basınç

Üretici tüketiciden hızlıysa kuyruk büyür. Benzetim: 10 saniye boyunca saniyede 300 iş gelir, tüketici saniyede
100 iş bitirir:

```python calistir
def benzet(sinir: int | None) -> tuple[int, float, int]:
    """10 sn boyunca saniyede 300 iş, sonra 50; tüketici saniyede 100 iş bitirir."""
    kuyruk = reddedilen = en_cok = 0
    en_uzun_bekleme = 0.0
    for saniye in range(120):
        gelen = 300 if saniye < 10 else 50
        kabul = gelen if sinir is None else min(gelen, sinir - kuyruk)
        reddedilen += gelen - kabul  # sınır doluysa üreticiye "sonra dene" (429) denir
        kuyruk += kabul
        en_cok = max(en_cok, kuyruk)
        en_uzun_bekleme = max(en_uzun_bekleme, kuyruk / 100)  # sona eklenen işin bekleyeceği süre
        kuyruk -= min(kuyruk, 100)
    return en_cok, en_uzun_bekleme, reddedilen


for ad, sinir in (("sınırsız", None), ("sınır 300", 300)):
    en_cok, bekleme, red = benzet(sinir)
    print(f"{ad:9}: kuyrukta en çok {en_cok:4} iş, en uzun bekleme {bekleme:4.0f} sn, reddedilen {red:4}")
assert benzet(None)[1] > 20 and benzet(300)[1] <= 3
```

```cikti
sınırsız : kuyrukta en çok 2100 iş, en uzun bekleme   21 sn, reddedilen    0
sınır 300: kuyrukta en çok  300 iş, en uzun bekleme    3 sn, reddedilen 1800
```

Sınırsız kuyrukta kimse reddedilmez ama **herkes** 21 saniye bekler; yük biraz daha uzasa bellek biter. Sınırlı
kuyrukta fazlası hemen geri çevrilir ve üretici bunu bilir. Reddedilen işle ne yapılacağı bir ürün kararıdır:

| Seçenek                          | Ne zaman                                               |
| -------------------------------- | ------------------------------------------------------ |
| Üreticiyi beklet (bloklama)      | Üretici kendi işiniz (toplu içe aktarım)               |
| 429 + `Retry-After`              | Üretici bir istemci; titremeli geri çekilmeyle yeniden dener |
| Düşük öncelikliyi at             | Analitik, öneri yenileme gibi kaybı zararsız işler      |
| Ayrı, yavaş kuyruğa al           | Toplu ve acil olmayan iş (raporlar)                    |

Kuyruk derinliği ve en eski mesajın yaşı **izlenir**; derinlik sürekli artıyorsa tüketici yetişmiyordur
([Gözlemlenebilirlik](gozlemlenebilirlik.md)). Bekleme süresinin hesabı Little yasasıdır
([Kapasite tahmini](kapasite-tahmini.md)).

## Zehirli mesaj ve kira süresi

- Her denemede çöken bir mesaj (bozuk veri, kodda hata) sonsuza dek yeniden denenirse kuyruğu tıkar. Deneme
  sayısını sınırlayın (ör. 5, titremeli geri çekilmeyle); sonra **ölü mektup kuyruğuna** (dead letter queue) alın
  ve uyarı verin. Ölü mektuplar düzeltildikten sonra yeniden kuyruğa konabilmelidir.
- Tüketici bir mesajı alınca mesaj bir süre ötekilere görünmez (kira, visibility timeout). İş bu süreden uzun
  sürerse mesaj ikinci bir tüketiciye de verilir: iş iki kez yapılır. Kira, en uzun işten uzun olmalı ya da
  uzun işte kira düzenli uzatılmalıdır.
- Hata türünü ayırın: geçici hata (zaman aşımı, 503) yeniden denenir; kalıcı hata (doğrulama, 404) hemen ölü
  mektuba gider ([Dayanıklılık kalıpları](dayaniklilik-kaliplari.md)).

## Giden kutusu (outbox)

"Siparişi veritabanına yaz, sonra olayı yayınla": ikisi ayrı sistemdir, aynı işleme giremez. Yazmadan sonra çökme
olayı kaybeder; yayından sonra veritabanı işleminin geri alınması var olmayan bir sipariş için fatura keser.
Çare: olayı **aynı veritabanı işleminde** bir tabloya yazmak; ayrı bir aktarıcı o tabloyu okuyup yayınlar.

```python calistir
import json
import sqlite3

db = sqlite3.connect(":memory:", isolation_level=None)
db.executescript("""
CREATE TABLE siparis (id INTEGER PRIMARY KEY, tutar INTEGER NOT NULL);
CREATE TABLE giden_kutusu (id INTEGER PRIMARY KEY, konu TEXT NOT NULL, govde TEXT NOT NULL,
                           gonderildi INTEGER NOT NULL DEFAULT 0);
""")
araci: list[tuple[str, int]] = []  # mesaj aracısına (broker) ulaşan olaylar


def siparis_ver_yanlis(tutar: int, cok: bool) -> None:
    db.execute("INSERT INTO siparis (tutar) VALUES (?)", (tutar,))  # 1) veritabanına yazıldı
    if cok:
        raise RuntimeError("süreç çöktü")  # 2) olay yayınlanamadan çöktü: fatura hiç kesilmeyecek
    araci.append(("siparis_verildi", tutar))


def siparis_ver(tutar: int) -> None:
    db.execute("BEGIN")
    sid = db.execute("INSERT INTO siparis (tutar) VALUES (?)", (tutar,)).lastrowid
    govde = json.dumps({"siparis": sid, "tutar": tutar})
    db.execute("INSERT INTO giden_kutusu (konu, govde) VALUES ('siparis_verildi', ?)", (govde,))
    db.execute("COMMIT")  # sipariş ve olay birlikte: ya ikisi var ya hiçbiri


def aktarici(cok_yayindan_sonra: bool = False) -> None:
    """Ayrı döngü: gönderilmemiş olayları sırayla yayınlar, sonra işaretler (en az bir kez)."""
    satirlar = db.execute("SELECT id, konu, govde FROM giden_kutusu WHERE gonderildi = 0 ORDER BY id").fetchall()
    for oid, konu, govde in satirlar:
        araci.append((konu, json.loads(govde)["tutar"]))
        if cok_yayindan_sonra:
            return  # yayınladı ama işaretleyemedi → bir sonraki turda YİNE yayınlar
        db.execute("UPDATE giden_kutusu SET gonderildi = 1 WHERE id = ?", (oid,))


try:
    siparis_ver_yanlis(15_000, cok=True)
except RuntimeError:
    pass
assert db.execute("SELECT count(*) FROM siparis").fetchone()[0] == 1 and araci == []  # olay kayboldu

siparis_ver(20_000)  # işlem bitti, aktarıcı henüz çalışmadan süreç çökse de olay tabloda bekler
aktarici(cok_yayindan_sonra=True)
aktarici()  # yeniden başlatma sonrası
assert araci == [("siparis_verildi", 20_000), ("siparis_verildi", 20_000)]  # kayıp yok, yineleme var
print("giden kutusu: olay kaybolmadı; yinelemeyi idempotent tüketici ayıklar")
```

```cikti
giden kutusu: olay kaybolmadı; yinelemeyi idempotent tüketici ayıklar
```

Giden kutusu en az bir kez yayınlar; yinelemeyi tüketicinin idempotentliği ayıklar (yukarıdaki ilk örnek). Eski
satırlar düzenli silinir. Tek sunuculu bir üründe aracıya hiç gerek olmayabilir: giden kutusu tablosunun kendisi
iş kuyruğudur. Havuzdaki web uygulaması aynı kalıbı **istemcide** kullanır: kayıt ve "gönderilecek değişiklik"
satırı tek IndexedDB işleminde yazılır, eşitleme motoru giden kutusunu boşaltır
([`uygulama/docs/ESITLEME.md`](../../uygulama/docs/ESITLEME.md) → "Kısaca", "Onay ve yinelenen gönderim").

## Tuzaklar

| Belirti                                                      | Neden                                                        | Çözüm                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------ | ----------------------------------------------------------- |
| Aynı e-posta/bildirim iki kez gidiyor                        | En az bir kez teslim, tüketici idempotent değil              | Mesaj kimliğiyle "işlendi" kaydı; sağlayıcıya anahtar       |
| "İşlendi" kaydı var ama yine yineleniyor                     | Kayıt etkiden ayrı işlemde yazılıyor                         | Etki ve kayıt aynı işlemde                                  |
| Sipariş var, faturası yok                                    | Veritabanına yazıldı, olay yayınlanamadan çöktü               | Giden kutusu                                                |
| Kargolanan sipariş "ödendi"ye döndü                          | Sırasız teslim, tüketici son geleni yazıyor                  | Sürüm denetimi ya da boşluk bekletme                        |
| Kuyruk saatlerdir büyüyor, kimse fark etmedi                 | Derinlik ve en eski mesaj yaşı izlenmiyor                    | İki ölçüt + uyarı                                           |
| Tek bozuk mesaj bütün kuyruğu durdurdu                        | Sınırsız yeniden deneme                                      | Deneme sınırı + ölü mektup kuyruğu                          |
| Uzun iş iki işçide aynı anda çalışıyor                       | Kira süresi iş süresinden kısa                               | Kirayı uzat ya da işi böl                                   |
| Dağıtımdan sonra bekleyen işler kayboldu                     | Kuyruk süreç belleğindeydi                                   | Kalıcı kuyruk (veritabanı tablosu)                          |
| Kuyruk eklendi ama kullanıcı sonucu hiç göremiyor            | İşin durumu kaydedilmiyor                                    | İş kaydı + durum ucu (`queued/running/succeeded/failed`)    |
| Aşırı yükte bellek bitti, süreç öldü                         | Sınırsız kuyruk                                              | Sınır + geri basınç                                         |

## Denetim listesi

- [ ] Her tüketici idempotent; "işlendi" kaydı etkiyle aynı işlemde ya da etki doğası gereği idempotent.
- [ ] Mesaj kimliğini üretici veriyor ve yeniden denemede değişmiyor.
- [ ] Veritabanı yazması + olay yayını birlikte gereken her yerde giden kutusu var.
- [ ] Sıranın önemli olduğu olaylarda sürüm/sıra numarası var; tüketici sırasızlığa dayanıklı.
- [ ] Kuyruğun boyu sınırlı; doluyken ne olacağı (beklet, reddet, at) yazılı.
- [ ] Deneme sayısı sınırlı, titremeli geri çekilme var; ölü mektup kuyruğu ve uyarısı var.
- [ ] Kira süresi en uzun işten uzun.
- [ ] Kuyruk derinliği, en eski mesajın yaşı, işlem/hata oranı panoda.
- [ ] Kullanıcının başlattığı iş için durum görülebiliyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu iş kuyruğa alınacak. Tüketici idempotent olsun: mesaj kimliğini `islenen` tablosuna
  etkiyle aynı işlemde yaz. Veritabanı yazması ile olay birlikte gerekiyorsa giden kutusu tablosu kullan.
  Deneme sınırı 5, titremeli geri çekilme, sonra ölü mektup. Yeni bir aracı (RabbitMQ, Kafka) ekleme; tablo
  tabanlı kuyruk yeter."
- **Modelin tipik hatası:** "tam bir kez teslim" varsayar ve yinelemeyi hiç düşünmez; olayı veritabanı
  işleminden **önce** ya da işlem içinde dış sisteme gönderir; sınırsız `while True` yeniden deneme yazar;
  sırayı zaman damgasıyla kurar; tek sunuculu ürüne ayrı aracı sunucusu ekler.
- **Çıktıda arayın:** tüketicide yineleme denetimi var mı; `COMMIT`'ten önce `publish/send/fetch` çağrısı var mı;
  deneme sayacı ve ölü mektup yolu var mı; kuyruk boyu sınırı var mı.
- **Test isteyin:** "Aynı mesaj iki kez teslim edilince etki bir kez olur" ve "yazmadan sonra çökmede olay
  kaybolmaz" testleri.

## İlgili

- [Dayanıklılık kalıpları](dayaniklilik-kaliplari.md) (yeniden deneme, titreme, yük atma) ·
  [Tutarlılık modelleri](tutarlilik-modelleri.md) · [Bildirim sistemi örneği](ornek-bildirim-sistemi.md)
- [API tasarımı](../30-arkauc/api-tasarimi.md) → idempotentlik anahtarı, uzun süren işlem
- Havuzda: eşzamanlılığı sınırlı görev kuyruğu [`kutuphane/py/kutuphane/kuyruk.py`](../../kutuphane/py/kutuphane/kuyruk.py),
  istemci giden kutusu [`uygulama/docs/ESITLEME.md`](../../uygulama/docs/ESITLEME.md)
