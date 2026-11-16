---
baslik: "Örnek tasarım: dosya paylaşımı"
ozet: Dosya yükleme ve paylaşma servisinin kaba hesabı, üst veri ile içeriğin ayrılması, depoya doğrudan yükleme, içerik adresli saklama ve çöp toplama, yarışsız kota, paylaşım bağlantısı ve büyüyünce değişenler.
etiketler: [ornek-tasarim, dosya, nesne-deposu, kota, yineleme-ayiklama]
duzey: orta
guncellik: 2026-11
---

# Örnek tasarım: dosya paylaşımı

> Bu notu ne zaman okumalı: kullanıcıların dosya, fotoğraf ya da belge yüklediği ve paylaştığı bir özellik
> tasarlanırken; depolama ve bant genişliği faturası beklenmedik büyüdüğünde; kota aşımı, kayıp dosya ya da
> "silinen dosya hâlâ açılıyor" sorunu çıktığında.

## Temel fikir

- Dosya iki parçadır: **üst veri** (ad, sahip, boyut, tür, özet, paylaşım) veritabanında; **içerik** (baytlar) nesne
  deposunda. Baytlar veritabanına ve uygulama sunucusunun belleğine girmez.
- Büyük dosya **uygulama sunucusundan geçmez**: istemci depoya imzalı, süreli adresle doğrudan yükler ve indirir.
  Uygulama yalnız izin verir ve kaydı tutar.
- Yükleme bir **durum makinesidir**: `ayrildi → yuklendi → taraniyor → hazir` (ya da `reddedildi`). Hazır olmayan
  dosya paylaşılamaz ve indirilemez.
- Silme iki adımdır: kayıt silinir (ya da çöp kutusuna gider), içerik **çöp toplama** ile sonra silinir; paylaşılan
  içerik referans sayılır.
- Yükleme güvenliği (içerikten tür denetimi, ad temizliği, indirme başlıkları, imzalı adres gerçeklemesi):
  [Dosya ve medya](../30-arkauc/dosya-ve-medya.md), [Dosya yükleme güvenliği](../50-guvenlik/dosya-yukleme-guvenligi.md).

## Gereksinimler

| Tür              | Gereksinim                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------- |
| İşlevsel         | 2 GB'a kadar dosya; yarıda kalan yükleme kaldığı yerden sürer                                |
| İşlevsel         | Klasör, paylaşım bağlantısı (süreli, isteğe bağlı parolalı), kişiyle paylaşım (okur/düzenler) |
| İşlevsel         | Kullanıcı başına kota; çöp kutusu (30 gün); görsellerde küçük resim                          |
| İşlevsel olmayan | Yüklenen dosya kaybolmaz (dayanıklı depo + yedek); zararlı dosya başkasına ulaşmaz           |
| Hedef dışı       | Ortak düzenleme, masaüstü eşitleme istemcisi, sürüm geçmişi (ilk sürümde)                    |

## Kaba hesap

```python calistir
kullanici, dosya_basina, ort_mb = 5_000, 200, 2.0  # tahmin: belge ve fotoğraf ağırlıklı
depo_tb = kullanici * dosya_basina * ort_mb / 1e6
yukleme_gb, indirme_gb = 10_000 * ort_mb / 1e3, 50_000 * ort_mb / 1e3  # günde 10 bin yükleme, 50 bin indirme
cikis_mbit_tepe = indirme_gb * 8_000 / 86_400 * 6  # GB → Mbit; tepe çarpanı 6
print(f"depolama ~{depo_tb:.0f} TB | günlük yükleme {yukleme_gb:.0f} GB, indirme {indirme_gb:.0f} GB | çıkış tepe ~{cikis_mbit_tepe:.0f} Mbit/sn")
# 100 MB'lık video indirmesi 20 Mbit/sn'lik kullanıcıda 40 sn sürer: uygulama sunucusundan akıtılırsa
# Little: saniyede 2 indirme × 40 sn = 80 bağlantı sürekli açık kalır → dosyayı sunucu değil depo/CDN versin
assert round(2 * (100 * 8 / 20)) == 80
```

```cikti
depolama ~2 TB | günlük yükleme 20 GB, indirme 100 GB | çıkış tepe ~56 Mbit/sn
```

Bu üründe maliyeti istek sayısı değil **bayt** belirler: depolama ve dışarı çıkan trafik. Kapasite hesabında
dosyalar her zaman ayrı satırdır ([Kapasite tahmini](kapasite-tahmini.md)).

## İlk tasarım: tek sunucu

```text
1. POST /dosyalar {ad, boyut, tür}   → kota ayır (koşullu) → kayıt: durum=ayrildi → imzalı YÜKLEME adresi (15 dk)
2. istemci ──PUT (parça parça)──► nesne deposu        (uygulama sunucusu baytları görmez)
3. POST /dosyalar/{id}/tamamla       → depoda boyut + SHA-256 doğrula → durum=yuklendi → tarama/küçük resim işi kuyruğa
4. işçi: zararlı yazılım taraması, küçük resim → durum=hazir (ya da reddedildi + kota iade)
5. GET /dosyalar/{id}/indir          → yetki denetimi → imzalı İNDİRME adresi (5 dk), Content-Disposition: attachment
temizlik işi: 24 saati geçen "ayrildi" kayıtları sil + kota iade; referansı 0 olan içerik → sil
```

Tek sunucuda "nesne deposu" ayrı bir disk klasörü olabilir; kural aynıdır: içerik adı **kullanıcının verdiği ad
değil**, rastgele kimlik ya da içerik özetidir ve uygulamanın kendi alan adından sunulmaz (yüklenen HTML/SVG,
sitenizin kökeninde betik çalıştırır).

**İçerik adresli saklama ve çöp toplama:** içerik özetiyle adlandırılırsa aynı içerik bir kez saklanır, bütünlük
bedavaya denetlenir; silme referans sayısını düşürür, sıfıra inen içeriği çöp toplayıcı siler:

```python calistir
import hashlib

PARCA = 4  # gösterim için 4 bayt; gerçekte birkaç MB


class IcerikDeposu:
    """İçerik adresli depo: parça adı = içeriğin özeti. Aynı parça bir kez saklanır; referans sayılır."""

    def __init__(self) -> None:
        self.parcalar: dict[str, bytes] = {}
        self.referans: dict[str, int] = {}
        self.dosyalar: dict[str, list[str]] = {}

    def yukle(self, ad: str, veri: bytes) -> None:
        ozetler = []
        for i in range(0, len(veri), PARCA):
            parca = veri[i : i + PARCA]
            ozet = hashlib.sha256(parca).hexdigest()
            self.parcalar.setdefault(ozet, parca)
            self.referans[ozet] = self.referans.get(ozet, 0) + 1
            ozetler.append(ozet)
        self.dosyalar[ad] = ozetler

    def indir(self, ad: str) -> bytes:
        return b"".join(self.parcalar[o] for o in self.dosyalar[ad])

    def sil(self, ad: str) -> None:  # yalnız referansı düşürür; parçayı çöp toplayıcı siler
        for ozet in self.dosyalar.pop(ad):
            self.referans[ozet] -= 1

    def cop_topla(self) -> int:
        olu = [o for o, n in self.referans.items() if n == 0]
        for ozet in olu:
            del self.parcalar[ozet], self.referans[ozet]
        return len(olu)


depo = IcerikDeposu()
depo.yukle("ayse/sozlesme.pdf", b"kira-sozlesmesi-2026")
depo.yukle("ayse/kopya.pdf", b"kira-sozlesmesi-2026")  # aynı dosya: yeni parça yok
depo.yukle("ayse/yeni.pdf", b"kira-sozlesmesi-2027")  # yalnız son parça farklı
saklanan = sum(len(p) for p in depo.parcalar.values())
print(f"yüklenen 60 bayt, saklanan {saklanan} bayt")
depo.sil("ayse/sozlesme.pdf")
depo.sil("ayse/kopya.pdf")
assert depo.cop_topla() == 1  # yalnız "2026" parçası kimsesiz kaldı
assert depo.indir("ayse/yeni.pdf") == b"kira-sozlesmesi-2027"  # paylaşılan parçalar silinmedi
assert saklanan == 24
```

```cikti
yüklenen 60 bayt, saklanan 24 bayt
```

- Sabit boyutlu parçalama, dosyanın başına bir bayt eklenince bütün sınırları kaydırır; içeriğe göre parçalama
  (content-defined chunking) bunu çözer. Belge ve fotoğraf için çoğu zaman **dosya düzeyinde** özet yeter.
- **Kullanıcılar arası** yineleme ayıklama bir sızıntıdır: "bu dosya zaten var" (yükleme anında bitmesi) başka
  birinin o dosyaya sahip olduğunu ele verir. Ayıklamayı kullanıcı ya da kiracı içinde yapın.
- Çöp toplama, referans sayısını değil **gerçek kullanımı** da düzenli denetler (sayaç kayarsa içerik ya sonsuza
  dek kalır ya da kullanımdayken silinir); silmeden önce kısa bir bekleme payı bırakın.

**Kota, yarışsız:** iki eşzamanlı yükleme "yer var mı" diye ayrı ayrı bakarsa ikisi de geçer:

```python calistir
import sqlite3

db = sqlite3.connect(":memory:", isolation_level=None)
db.execute("CREATE TABLE kota (kullanici TEXT PRIMARY KEY, kullanilan_mb INTEGER NOT NULL, sinir_mb INTEGER NOT NULL)")


def sifirla() -> None:
    db.execute("DELETE FROM kota")
    db.execute("INSERT INTO kota VALUES ('ayse', 900, 1000)")


def kullanilan() -> int:
    return db.execute("SELECT kullanilan_mb FROM kota WHERE kullanici = 'ayse'").fetchone()[0]


# YANLIŞ: denetle, sonra yaz. İki yükleme aynı anda denetler; ikisi de "yer var" görür.
sifirla()
okumalar = [db.execute("SELECT kullanilan_mb, sinir_mb FROM kota WHERE kullanici = 'ayse'").fetchone() for _ in range(2)]
for k, s in okumalar:
    if k + 80 <= s:
        db.execute("UPDATE kota SET kullanilan_mb = kullanilan_mb + 80 WHERE kullanici = 'ayse'")
assert kullanilan() == 1060  # sınır aşıldı

# DOĞRU: denetim ve ayırma tek koşullu ifadede; yükleme bitmezse ayrılan yer geri verilir
sifirla()


def yer_ayir(mb: int) -> bool:
    return db.execute(
        "UPDATE kota SET kullanilan_mb = kullanilan_mb + ? WHERE kullanici = 'ayse' AND kullanilan_mb + ? <= sinir_mb",
        (mb, mb),
    ).rowcount == 1


assert [yer_ayir(80), yer_ayir(80)] == [True, False]  # ikinci yükleme "kota dolu" alır
db.execute("UPDATE kota SET kullanilan_mb = kullanilan_mb - 80 WHERE kullanici = 'ayse'")  # yarıda kalan yükleme
assert kullanilan() == 900
print("denetle-sonra-yaz kotayı aştı (1060 MB); koşullu ayırma aşmadı")
```

```cikti
denetle-sonra-yaz kotayı aştı (1060 MB); koşullu ayırma aşmadı
```

Yer, yükleme **başlarken** istemcinin bildirdiği boyutla ayrılır; tamamlamada gerçek boyut farklıysa fark
düzeltilir ya da yükleme reddedilir. Yarıda kalan ayırmaları temizlik işi iade eder.

**Paylaşım:** paylaşım bağlantısı tahmin edilemez belirteçtir (en az 128 bit), süresi ve iptali vardır; bağlantıyla
gelen ziyaretçiye her seferinde kısa süreli indirme adresi verilir (kalıcı depo adresi asla). Kişiyle paylaşımda
yetki, dosyanın değil **klasörün** üstünde tutulursa kalıtım basit kalır ([Yetkilendirme](../30-arkauc/yetkilendirme.md)).

## Büyüyünce ne değişir

| Eşik                                          | Değişiklik                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| Yerel disk doluyor / tek makine riski          | S3 uyumlu nesne deposu (dayanıklılık ve yedek sağlayıcıda)              |
| Çıkış trafiği faturası büyüdü                  | İndirmeleri CDN'den imzalı adresle verin                                |
| Eski dosyalar nadiren açılıyor                 | Yaşam döngüsü kuralı: 90 gün açılmayanı soğuk depolama sınıfına taşı    |
| Büyük dosyalar sık yarıda kalıyor              | Çok parçalı yükleme; parça başına yeniden deneme                        |
| Tarama ve küçük resim kuyruğu birikiyor        | Ayrı işçi süreçleri, tür başına kuyruk ([Kuyruk ve olaylar](kuyruk-ve-olaylar.md)) |
| Farklı ülkelerde kullanıcılar                  | Bölgesel depo; veri yerelleştirme gereksinimini hukukçuya sorun         |

## Tuzaklar

| Belirti                                                    | Neden                                                     | Çözüm                                                       |
| ---------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| Büyük yüklemelerde uygulama sunucusu belleği doldu          | Dosya uygulama üzerinden geçiyor                          | Depoya doğrudan imzalı yükleme                              |
| Kullanıcı kotasını aştı                                     | Denetle-sonra-yaz yarışı                                  | Koşullu ayırma                                              |
| Depolama, dosya sayısına göre fazla                         | Yarıda kalan yüklemeler ve kimsesiz içerik silinmiyor     | Temizlik işi + çöp toplama                                  |
| Silinen dosya eski bağlantıyla hâlâ iniyor                  | Kalıcı depo adresi paylaşıldı ya da CDN önbelleği         | Kısa süreli imzalı adres; silmede CDN temizliği             |
| Yüklenen HTML dosyası sitenizde betik çalıştırdı            | Kullanıcı dosyası uygulama kökeninden sunuldu             | Ayrı alan adı + `Content-Disposition: attachment`           |
| "Dosya zaten var" başka kullanıcının dosyasını ele verdi    | Kullanıcılar arası yineleme ayıklama                       | Ayıklamayı kullanıcı/kiracı içinde yapın                    |
| Paylaşılan dosya kullanımdayken silindi                     | Referans sayısı kaydı (yarış ya da hata)                   | Sayaç + düzenli gerçek kullanım denetimi + bekleme payı     |
| Zararlı dosya taranmadan paylaşıldı                         | Durum makinesi yok; yükleme biter bitmez "hazır"          | `taraniyor` durumu; hazır olmayan dosya paylaşılamaz        |

## Denetim listesi

- [ ] Üst veri veritabanında, içerik nesne deposunda; içerik adı rastgele ya da özet.
- [ ] Yükleme ve indirme imzalı, süreli adresle doğrudan depoya; uygulama baytları taşımıyor.
- [ ] Yükleme durumları (`ayrildi → yuklendi → taraniyor → hazir/reddedildi`) ve geçiş kuralları var.
- [ ] Kota koşullu tek ifadeyle ayrılıyor; yarıda kalan ayırmalar iade ediliyor.
- [ ] Silme: çöp kutusu süresi, referans sayımı, çöp toplama ve CDN temizliği yazılı.
- [ ] Kullanıcı dosyaları ayrı alan adından, `attachment` olarak sunuluyor.
- [ ] Yineleme ayıklama kullanıcı/kiracı içinde.
- [ ] Depolama, çıkış trafiği ve işlem kuyruğu panoda; dosya başına maliyet biliniyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Dosya baytları uygulama sunucusundan geçmesin: önce kota ayır (koşullu `UPDATE`), sonra
  imzalı yükleme adresi ver; tamamlamada boyut ve SHA-256 doğrula; durum `hazir` olmadan indirme ve paylaşım
  yok. İçerik adı kullanıcı adı değil, rastgele kimlik."
- **Modelin tipik hatası:** dosyayı istek gövdesinde alıp belleğe okur; kullanıcının verdiği adı diskte yol olarak
  kullanır; kotayı denetle-sonra-yaz ile yapar; silmede yalnız veritabanı satırını siler; kalıcı depo adresini
  paylaşım bağlantısı olarak verir.
- **Çıktıda arayın:** `await req.arrayBuffer()`/`request.body` ile büyük dosya okuma; `path.join(..., dosyaAdi)`;
  kota için ayrı `SELECT` + `UPDATE`; indirme ucunda yetki denetimi ve süreli adres.

## İlgili

- [Dosya ve medya](../30-arkauc/dosya-ve-medya.md) (yükleme güvenliği, imzalı adres, görüntü işleme) ·
  [Dosya yükleme güvenliği](../50-guvenlik/dosya-yukleme-guvenligi.md)
- [Veri yaşam döngüsü](veri-yasam-dongusu.md) (silme, yedek) · [Kuyruk ve olaylar](kuyruk-ve-olaylar.md) ·
  [Çok kiracılık](cok-kiracilik.md) (kiracı başına kota)
- [İşlemler ve eşzamanlılık](../30-arkauc/islemler-ve-eszamanlilik.md) (denetle-sonra-yaz yarışı)
