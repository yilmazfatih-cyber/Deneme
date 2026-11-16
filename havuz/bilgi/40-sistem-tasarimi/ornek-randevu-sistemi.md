---
baslik: "Örnek tasarım: randevu ve rezervasyon sistemi"
ozet: Kuaför, klinik, kurs gibi işletmeler için randevu sisteminin kaba hesabı, çift rezervasyonu veritabanıyla engelleme, süreli tutma, saat dilimi, hatırlatma, iptal ve büyüyünce değişenler; çalışan örneklerle.
etiketler: [ornek-tasarim, randevu, rezervasyon, eszamanlilik, saat-dilimi]
duzey: orta
guncellik: 2026-11
---

# Örnek tasarım: randevu ve rezervasyon sistemi

> Bu notu ne zaman okumalı: randevu, masa/oda/koltuk rezervasyonu, kurs kaydı ya da sınırlı kontenjanlı herhangi
> bir "yer ayırma" özelliği tasarlanırken; "aynı saate iki müşteri yazılmış" şikâyeti geldiğinde; ödeme sırasında
> yer tutma gerektiğinde.

## Temel fikir

- Asıl risk **çift rezervasyondur** ve kaynağı hep aynıdır: "boş mu?" denetimi ile yazma ayrı adımlardır, arada
  başka bir istek girer. Çare, kuralı **veritabanına** yaptırmaktır (benzersizlik kısıtı ya da tek yazma işlemi).
- Ödeme ya da onay sürerken yer **süreli tutulur**; süresi dolan tutma kendiliğinden düşer. Tutmanın süresi yoksa
  terk edilen ödeme ekranları takvimi kilitler.
- Zaman **UTC an** olarak saklanır; çalışma saatleri ve gösterim **işletmenin saat dilimiyle** yapılır.
- Hatırlatma ve iptal birer olaydır; hatırlatma gönderilirken randevunun hâlâ geçerli olduğu yeniden denetlenir.

## Gereksinimler

| Tür              | Gereksinim                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| İşlevsel         | İşletme personel, hizmet (süre), çalışma saati ve tatil tanımlar; müşteri boş saatleri görür     |
| İşlevsel         | Randevu alma, iptal, erteleme; isteğe bağlı kapora ile (ödeme sırasında yer 10 dk tutulur)       |
| İşlevsel         | Hatırlatma: 24 saat ve 2 saat önce; iptal edilen randevu için hatırlatma gitmez                  |
| İşlevsel olmayan | Aynı personele aynı dilimde iki randevu **asla**; müsaitlik sorgusu p95 < 300 ms                 |
| Hedef dışı       | Dış takvim eşitleme, bekleme listesi, çok şubeli kaynak paylaşımı (ilk sürümde)                  |

## Kaba hesap

```python calistir
isletme, personel, gunluk_randevu = 500, 4, 12  # tahmin: kuaför/klinik ölçeği
randevu = isletme * personel * gunluk_randevu
musaitlik = randevu * 15  # her randevu öncesi ~15 müsaitlik sorgusu (gün/personel değiştirerek)
tepe = 8  # sabah 09:00–10:00 yoğunluğu ve hatırlatma bildirimi sonrası
print(f"günde {randevu} randevu | müsaitlik sorgusu tepede ~{musaitlik / 86_400 * tepe:.0f}/sn | randevu yazma tepede ~{randevu / 86_400 * tepe:.1f}/sn")
dolu_dilim = randevu * 2 * 365  # ortalama randevu 30 dk = iki 15 dakikalık dilim; yalnız DOLU dilimler satırdır
print(f"yılda ~{dolu_dilim / 1e6:.1f} milyon dolu dilim satırı (geçmiş dilimler arşivlenir)")
assert musaitlik / 86_400 * tepe < 100
```

```cikti
günde 24000 randevu | müsaitlik sorgusu tepede ~33/sn | randevu yazma tepede ~2.2/sn
yılda ~17.5 milyon dolu dilim satırı (geçmiş dilimler arşivlenir)
```

Yük küçüktür; tek sunucu ve SQLite yeter. Zorluk ölçek değil **doğruluktur**: saniyede 2 yazmada bile aynı dilime
iki istek düşebilir (özellikle hatırlatma ya da kampanya bildiriminden hemen sonra).

## İlk tasarım: tek sunucu

```text
tablolar: isletme(saat_dilimi) · personel · hizmet(sure_dk) · calisma_saati(personel, gun, bas, bit) · tatil
          randevu(id, personel, musteri, bas_utc, bit_utc, durum) · dilim(personel, bas_utc) PK → randevu_id, durum, tutma_bitis
müsaitlik: çalışma saatleri (işletmenin saat diliminde) → 15 dk'lık adaylar → dolu dilimleri çıkar → hizmet süresine sığanlar
randevu:   tek işlem: süresi dolmuş tutmaları bırak → randevu + dilimler 'tutuldu' (10 dk) → ödeme → 'onaylandi'
olaylar:   giden kutusu → hatırlatma işleri (24 sa, 2 sa önce) → gönderimde "hâlâ onaylı mı?" denetimi
```

**Çift rezervasyon:** denetle-sonra-yaz yanlıştır; randevuyu dilimleriyle tek işlemde yazmak ve `(personel, dilim)`
benzersizliğini veritabanına bırakmak doğrudur:

```python calistir
import sqlite3

db = sqlite3.connect(":memory:", isolation_level=None)
db.executescript("""
CREATE TABLE randevu (id INTEGER PRIMARY KEY, personel TEXT, bas INTEGER, bit INTEGER, musteri TEXT);
CREATE TABLE dilim (personel TEXT, bas INTEGER, randevu_id INTEGER, PRIMARY KEY (personel, bas));
""")  # bas/bit: günün dakikası (gösterim için); gerçekte UTC an


def bos_mu(personel: str, bas: int, bit: int) -> bool:
    return db.execute(
        "SELECT count(*) FROM randevu WHERE personel = ? AND bas < ? AND bit > ?", (personel, bit, bas)
    ).fetchone()[0] == 0


# YANLIŞ: denetle, sonra yaz. İki istek aynı anda denetler, ikisi de "boş" görür.
a, b = bos_mu("Elif", 600, 630), bos_mu("Elif", 615, 645)  # 10:00–10:30 ve 10:15–10:45
for ok, bas, bit, kim in ((a, 600, 630, "Ayşe"), (b, 615, 645, "Zeynep")):
    if ok:
        db.execute("INSERT INTO randevu (personel, bas, bit, musteri) VALUES ('Elif', ?, ?, ?)", (bas, bit, kim))
assert db.execute("SELECT count(*) FROM randevu").fetchone()[0] == 2  # çakışan iki randevu
db.execute("DELETE FROM randevu")


def rezerve(personel: str, bas: int, sure: int, musteri: str) -> bool:
    """DOĞRU: randevu 15 dakikalık dilimleriyle TEK işlemde yazılır; (personel, dilim) benzersiz."""
    try:
        db.execute("BEGIN")
        rid = db.execute(
            "INSERT INTO randevu (personel, bas, bit, musteri) VALUES (?, ?, ?, ?)", (personel, bas, bas + sure, musteri)
        ).lastrowid
        db.executemany("INSERT INTO dilim VALUES (?, ?, ?)", [(personel, d, rid) for d in range(bas, bas + sure, 15)])
        db.execute("COMMIT")
        return True
    except sqlite3.IntegrityError:
        db.execute("ROLLBACK")  # bir dilim doluysa randevu da yazılmaz
        return False


assert rezerve("Elif", 600, 30, "Ayşe") and not rezerve("Elif", 615, 30, "Zeynep")
assert rezerve("Elif", 630, 30, "Zeynep") and rezerve("Can", 615, 30, "Mert")  # bitişik ve başka personel serbest
assert db.execute("SELECT count(*) FROM randevu").fetchone()[0] == 3
print("denetle-sonra-yaz çift randevu verdi; dilim benzersizliği vermedi")
```

```cikti
denetle-sonra-yaz çift randevu verdi; dilim benzersizliği vermedi
```

Dilim yerine aralıkla çalışmak gerekiyorsa (dakika hassasiyetinde süreler): Postgres'te aralık türü ve çakışmayı
yasaklayan kısıt (exclusion constraint) aynı işi yapar; SQLite'ta denetim ve yazma tek bir `BEGIN IMMEDIATE`
işleminde yapılır (yazma kilidi istekleri sıraya sokar). Genel kural: [İşlemler ve eşzamanlılık](../30-arkauc/islemler-ve-eszamanlilik.md)
→ "Denetle-sonra-yaz yarışı".

**Süreli tutma:** müşteri ödeme ekranındayken dilim tutulur; süre dolunca başkası alabilir, geç gelen onay reddedilir:

```python calistir
import sqlite3

db = sqlite3.connect(":memory:", isolation_level=None)
db.execute("""CREATE TABLE dilim (personel TEXT, bas INTEGER, musteri TEXT, durum TEXT NOT NULL,
              tutma_bitis INTEGER, PRIMARY KEY (personel, bas))""")
TUTMA_SN = 600  # ödeme/onay için 10 dakika


def tut(personel: str, bas: int, musteri: str, simdi: int) -> bool:
    db.execute("BEGIN IMMEDIATE")
    # Süresi dolmuş tutmaları aynı işlemde bırak: yoksa ölü tutma dilimi sonsuza dek kilitler
    db.execute("DELETE FROM dilim WHERE durum = 'tutuldu' AND tutma_bitis <= ? AND personel = ?", (simdi, personel))
    try:
        db.execute("INSERT INTO dilim VALUES (?, ?, ?, 'tutuldu', ?)", (personel, bas, musteri, simdi + TUTMA_SN))
        db.execute("COMMIT")
        return True
    except sqlite3.IntegrityError:
        db.execute("ROLLBACK")
        return False


def onayla(personel: str, bas: int, musteri: str, simdi: int) -> bool:
    return db.execute(
        "UPDATE dilim SET durum = 'onaylandi', tutma_bitis = NULL WHERE personel = ? AND bas = ? AND musteri = ?"
        " AND durum = 'tutuldu' AND tutma_bitis > ?",
        (personel, bas, musteri, simdi),
    ).rowcount == 1


assert tut("Elif", 600, "Ayşe", simdi=0)  # Ayşe 10:00'ı tuttu, ödeme ekranında
assert not tut("Elif", 600, "Zeynep", simdi=60)  # Zeynep aynı dilimi alamaz
assert tut("Elif", 600, "Zeynep", simdi=700)  # Ayşe 10 dakikada ödemedi: tutma düştü, Zeynep aldı
assert not onayla("Elif", 600, "Ayşe", simdi=710)  # Ayşe geç döndü: "bu saat artık boş değil"
assert onayla("Elif", 600, "Zeynep", simdi=720)
print("süreli tutma: süresi dolan tutma bırakıldı, geç gelen onay reddedildi")
```

```cikti
süreli tutma: süresi dolan tutma bırakıldı, geç gelen onay reddedildi
```

Ödeme sağlayıcısı onayı tutma süresi dolduktan **sonra** gelirse (geç webhook) yer başkasına verilmiş olabilir:
bu durum iade ya da elle çözüm akışına gider ve kullanıcıya açıkça söylenir ([Ödeme tümleştirme](../30-arkauc/odeme-tumlestirme.md)).

**Saat ve takvim:**

- Saklama UTC an; çalışma saatleri "09:00–18:00, Europe/Istanbul" gibi **yerel kural** olarak saklanır ve dilimler
  o gün için bu kuraldan üretilir. Türkiye 2016'dan beri yaz saati uygulamıyor (sabit UTC+3), ama yurt dışındaki
  müşteri ya da şube için saat dilimi veritabanı kullanılır; sabit fark koda gömülmez.
- Resmî tatiller ve işletme kapalı günleri ayrı tabloda. Havuzdaki
  [`kutuphane/py/kutuphane/tarih.py`](../../kutuphane/py/kutuphane/tarih.py) sabit tarihli resmî tatilleri bilir;
  dinî bayramlar ve arife yarım günleri hesaplanmaz, yıllık liste olarak verilir (başlığında yazar).
- Müşteriye gösterilen saat işletmenin saatidir ve yanında yazılır ("10:00, İstanbul saati"). An, duvar saati ve
  yaz saati tuzakları: [Zaman ve saat dilimi](../30-arkauc/zaman-ve-saat-dilimi.md).

**Hatırlatma ve iptal:** randevu onaylanınca giden kutusuna iki hatırlatma işi yazılır. Gönderim anında işçi
randevunun **hâlâ onaylı** olduğunu denetler; iptal ya da erteleme eski işleri iptal etmeye çalışmak yerine bu
denetimle boşa çıkarır (idempotent ve yarışsız). Sessiz saat ve kanal kuralları
[Bildirim sistemi örneği](ornek-bildirim-sistemi.md)'ndedir.

## Büyüyünce ne değişir

| Eşik                                               | Değişiklik                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| Müsaitlik sorgusu yavaşladı                        | İşletme + gün başına müsaitlik önbelleği, rezervasyonda silinir (kısa süre)    |
| Çok sayıda işletme, tek veritabanı zorlanıyor      | İşletmeye (kiracıya) göre bölme; rezervasyon hep işletme içi ([Çok kiracılık](cok-kiracilik.md)) |
| Popüler etkinlikte binlerce kişi aynı anda          | Sıra (bekleme odası) + kontenjan sayacı koşullu güncellemeyle; tutma süresi kısa |
| Dış takvimlerle eşitleme (Google/Outlook)           | Ayrı entegrasyon işçisi, webhook ve imleç; çakışmada iç takvim kazanır          |
| Gelmeyen müşteri (no-show) çok                      | Kapora, hatırlatma onayı ("geliyorum" düğmesi), iptal penceresi kuralı          |

## Tuzaklar

| Belirti                                                       | Neden                                                     | Çözüm                                                       |
| ------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| Aynı saate iki müşteri yazıldı                                | Denetle-sonra-yaz; benzersizlik kısıtı yok                | Dilim benzersizliği ya da tek `BEGIN IMMEDIATE` işlemi      |
| Takvim gün boyu "dolu" ama kimse gelmiyor                     | Terk edilen ödeme ekranlarının tutmaları düşmüyor         | Süreli tutma; dolanlar yazma işleminde bırakılır            |
| Randevular yurt dışındaki müşteriye 1 saat kaymış görünüyor   | Saat dilimi sabit fark olarak kodlanmış ya da yok         | UTC an + işletmenin saat dilimi; gösterimde açıkça yaz      |
| İptal edilen randevu için hatırlatma gitti                    | Hatırlatma işi gönderimde randevuyu denetlemiyor          | Gönderim anında "hâlâ onaylı mı?"                            |
| Ödeme onayı geldi ama yer başkasına verilmiş                  | Webhook tutma süresinden sonra geldi                      | Geç onay akışı: iade/elle çözüm + kullanıcıya ileti         |
| Resmî tatilde randevu alındı                                  | Tatil takvimi yok ya da güncellenmedi                     | Tatil tablosu, yıllık güncelleme işi                        |
| Erteleme sırasında randevu kayboldu                           | Eski randevu silinip yenisi ayrı işlemde yazıldı          | Erteleme tek işlem: yeni dilimleri al, eskileri bırak       |

## Denetim listesi

- [ ] Çift rezervasyonu veritabanı engelliyor (dilim benzersizliği ya da tek yazma işlemi); eşzamanlı istek testi var.
- [ ] Tutmaların süresi var; dolan tutmalar yazma işleminde bırakılıyor; geç onay reddediliyor.
- [ ] Zamanlar UTC an; çalışma saatleri ve gösterim işletmenin saat diliminde; tatil tablosu var.
- [ ] Erteleme ve iptal tek işlem; dilimler aynı işlemde bırakılıyor.
- [ ] Hatırlatmalar giden kutusundan; gönderim anında randevu durumu denetleniyor.
- [ ] Ödeme webhook'u tutma süresinden sonra gelirse ne olacağı yazılı.
- [ ] Müsaitlik p95'i ve çakışma reddi sayısı izleniyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Randevuyu 15 dakikalık dilimleriyle tek işlemde yaz; `dilim(personel, bas_utc)` birincil anahtar.
  Çakışmada `IntegrityError`'u yakala ve 'bu saat az önce doldu' de. Ödeme için dilimi 10 dk `tutuldu` durumunda
  tut; süresi dolanları aynı işlemde sil. Zamanı UTC sakla, çalışma saatini işletmenin saat diliminde yorumla."
- **Modelin tipik hatası:** önce `SELECT` ile boşluğa bakıp sonra `INSERT` eder; tutmaya süre koymaz; saatleri
  sunucunun yerel saatiyle saklar; iptalde hatırlatma işini silmeye çalışır ama gönderimde denetlemez; ertelemeyi
  sil-ve-yeniden-oluştur olarak iki işlemde yapar.
- **Çıktıda arayın:** randevu yazmadan önce ayrı bir "boş mu" sorgusu; tutma tablosunda süre alanı; `datetime.now()`
  saat dilimsiz; hatırlatma işçisinde durum denetimi.
- **Test isteyin:** "aynı dilime iki eşzamanlı istekten yalnız biri başarılı" ve "süresi dolan tutmadan sonra başka
  müşteri alabilir" testleri.

## İlgili

- [İşlemler ve eşzamanlılık](../30-arkauc/islemler-ve-eszamanlilik.md) · [Tutarlılık modelleri](tutarlilik-modelleri.md)
  (güçlü tutarlılık gereken yerler) · [Kuyruk ve olaylar](kuyruk-ve-olaylar.md) (giden kutusu)
- [Bildirim sistemi örneği](ornek-bildirim-sistemi.md) · [Çok kiracılık](cok-kiracilik.md) ·
  [Ödeme tümleştirme](../30-arkauc/odeme-tumlestirme.md)
- Havuzda: Türkiye takvimi ve iş günü [`kutuphane/py/kutuphane/tarih.py`](../../kutuphane/py/kutuphane/tarih.py),
  durum makinesi [`kutuphane/py/kutuphane/durum_makinesi.py`](../../kutuphane/py/kutuphane/durum_makinesi.py)
