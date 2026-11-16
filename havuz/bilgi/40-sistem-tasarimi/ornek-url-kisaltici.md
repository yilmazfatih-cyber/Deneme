---
baslik: "Örnek tasarım: URL kısaltıcı"
ozet: Kısa bağlantı servisinin gereksinimleri, kaba hesabı, kod üretimi ve çakışma olasılığı, tek sunuculu ilk tasarım, yönlendirme türü, tıklama sayımı, kötüye kullanım ve büyüyünce değişenler.
etiketler: [ornek-tasarim, url-kisaltici, kimlik-uretimi, onbellek, kotuye-kullanim]
duzey: orta
guncellik: 2026-11
---

# Örnek tasarım: URL kısaltıcı

> Bu notu ne zaman okumalı: kısa bağlantı, davet kodu, paylaşım bağlantısı, kupon kodu gibi "kısa, benzersiz,
> tahmin edilemez kod" gerektiren bir özellik tasarlanırken; okuma ağırlıklı, basit ama yoğun bir servisin
> nasıl büyüdüğünü görmek için.

## Temel fikir

- Okuma:yazma oranı çok yüksektir (100:1 ve üstü); kod → URL eşlemesi **neredeyse hiç değişmez**. Bu yüzden
  önbellek geçersiz kılma sorunu yok denecek kadar azdır ve servis tek makinede çok uzağa gider.
- Asıl kararlar: **kod nasıl üretilir** (tahmin edilemez, çakışmasız), **hangi yönlendirme** (301 mi 302 mi),
  **tıklama nasıl sayılır** (sıcak satır yaratmadan) ve **kötüye kullanım** (oltalama bağlantıları).

## Gereksinimler

| Tür              | Gereksinim                                                                        |
| ---------------- | --------------------------------------------------------------------------------- |
| İşlevsel         | Uzun URL → kısa kod; koda gidince yönlendirme; isteğe bağlı son kullanma tarihi    |
| İşlevsel         | Bağlantı sahibi tıklama sayısını görür; bağlantıyı kapatabilir                     |
| İşlevsel olmayan | Yönlendirme sunucuda p99 < 50 ms; ayda %99,9 erişilebilir                          |
| İşlevsel olmayan | Kodlar tahmin edilemez (özel bağlantılar taranamasın), 7 karakteri geçmez          |
| Hedef dışı       | Özel alan adı, bağlantı düzenleme, ayrıntılı analitik (ilk sürümde)               |

## Kaba hesap

```python calistir
import math

GUN = 86_400
yeni_gunluk, tiklama_gunluk, tepe = 10_000, 1_000_000, 6  # varsayımlar: tahmin
kayit_bayt, yil = 500, 5  # URL + kod + zamanlar + dizin payı
print(f"yazma: ort. {yeni_gunluk / GUN:.2f}/sn | yönlendirme: ort. {tiklama_gunluk / GUN:.1f}/sn, tepe ~{tiklama_gunluk / GUN * tepe:.0f}/sn")
toplam = yeni_gunluk * 365 * yil
print(f"{yil} yılda {toplam / 1e6:.1f} milyon bağlantı, ~{toplam * kayit_bayt / 1e9:.1f} GB")

N = 62**7  # 7 karakterlik base62 kod uzayı
p_en_az_bir = 1 - math.exp(-toplam**2 / (2 * N))  # doğum günü yaklaşımı
p_tek_ekleme = toplam / N  # en dolu anda yeni rastgele kodun var olanla çakışma olasılığı
print(f"kod uzayı {N:.2e}: en az bir çakışma olasılığı %{p_en_az_bir * 100:.0f}, tek eklemede {p_tek_ekleme:.1e}")
assert p_en_az_bir > 0.99 and p_tek_ekleme < 1e-5  # çakışma KESİN olur ama nadirdir: benzersizlik + yeniden dene
```

```cikti
yazma: ort. 0.12/sn | yönlendirme: ort. 11.6/sn, tepe ~69/sn
5 yılda 18.2 milyon bağlantı, ~9.1 GB
kod uzayı 3.52e+12: en az bir çakışma olasılığı %100, tek eklemede 5.2e-06
```

Sonuç: tek sunucu ve tek SQLite dosyası yıllarca yeter. Rastgele kodlarda çakışma **kesinlikle** olur (doğum günü
problemi), ama tek bir eklemede olasılığı milyonda beştir: benzersizlik kısıtı + yeniden deneme yeter, karmaşık
kimlik servisine gerek yok ([Kapasite tahmini](kapasite-tahmini.md)).

## İlk tasarım: tek sunucu

```text
istemci ──POST /api/baglantilar──► uygulama ──► SQLite: baglanti(kod PK, url, sahip, son_kullanma, kapali, olusturma)
ziyaretçi ──GET /{kod}──► uygulama ──► süreç içi LRU ──(ıska)──► SQLite ──► 302 Location: url
                                   └─► tıklama sayacı (bellekte) ──her 10 sn──► tiklama_gunluk(kod, gun, sayi)
```

**Kod üretimi:**

```python calistir
import secrets
import sqlite3

ALFABE = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"


def base62(sayi: int) -> str:  # sıralı kimliği kısaltmak için (gösterim amaçlı)
    metin = ""
    while True:
        sayi, kalan = divmod(sayi, 62)
        metin = ALFABE[kalan] + metin
        if sayi == 0:
            return metin


db = sqlite3.connect(":memory:")
db.execute("CREATE TABLE baglanti (kod TEXT PRIMARY KEY, url TEXT NOT NULL)")


def kisalt(url: str, uzunluk: int = 7, uret=lambda n: "".join(secrets.choice(ALFABE) for _ in range(n))) -> str:
    for _ in range(5):  # çakışma nadirdir; birincil anahtar yakalar, yeni kod denenir
        kod = uret(uzunluk)
        try:
            with db:
                db.execute("INSERT INTO baglanti VALUES (?, ?)", (kod, url))
            return kod
        except sqlite3.IntegrityError:
            continue
    raise RuntimeError("kod üretilemedi: uzunluğu artırın")


# YANLIŞ: sıralı kimlik → kısa ama tahmin edilebilir; özel bağlantılar sırayla taranır, hacim sızar
assert [base62(n) for n in (125, 126, 127)] == ["21", "22", "23"]
# DOĞRU: rastgele kod; çakışmayı veritabanı yakalar (sahte üreteçle çakışma zorlanıyor)
sahte = iter(["abc1234", "abc1234", "xyz9876"])
assert kisalt("https://ornek.com/a", uret=lambda n: next(sahte)) == "abc1234"
assert kisalt("https://ornek.com/b", uret=lambda n: next(sahte)) == "xyz9876"  # ilk deneme çakıştı
kod = kisalt("https://ornek.com/c")
assert len(kod) == 7 and db.execute("SELECT url FROM baglanti WHERE kod = ?", (kod,)).fetchone()[0].endswith("/c")
print("sıralı kod tahmin edilir; rastgele kod + benzersizlik kısıtı + yeniden deneme")
```

```cikti
sıralı kod tahmin edilir; rastgele kod + benzersizlik kısıtı + yeniden deneme
```

Kod `secrets` gibi kriptografik rastgele kaynaktan gelir (`random` değil). Kullanıcının elle yazacağı kodlarda
karışan harfleri (0/O, 1/l/I) çıkaran alfabe seçin; havuzda hazır: [`kutuphane/py/kutuphane/kimlik.py`](../../kutuphane/py/kutuphane/kimlik.py)
(okunaklı kod, Crockford alfabesi).

**Yönlendirme türü:**

| Seçim                         | Sonuç                                                                  | Ne zaman                          |
| ----------------------------- | ---------------------------------------------------------------------- | --------------------------------- |
| 301 (kalıcı)                  | Tarayıcı ve arama motoru kalıcı önbelleğe alır: hedef değişmez, tıklama sayılamaz, kapatılan bağlantı çalışmaya devam eder | Neredeyse hiç |
| 302/307 (geçici) + kısa `Cache-Control` | Her tıklama sunucuya gelir: sayılır, kapatılabilir             | Varsayılan                         |

**Tıklama sayımı:** her tıklamada `UPDATE baglanti SET tiklama = tiklama + 1` popüler bağlantıda sıcak satır ve yazma
kilidi yaratır (SQLite tek yazıcı: [Veritabanı ölçekleme](veritabani-olcekleme.md)). Sayaçları bellekte toplayıp
birkaç saniyede bir tek işlemde yazın; çökmede birkaç saniyelik sayım kaybı kabul edilir (yazılı karar).

**Kötüye kullanım:** yalnız `http`/`https` şeması; kendi alan adınıza ve iç adreslere (localhost, özel IP aralıkları)
yönlendirme yok; kullanıcı ve IP başına oluşturma hız sınırı ([Hız sınırı ve kötüye kullanım](../30-arkauc/hiz-siniri-ve-kotuye-kullanim.md));
"bağlantıyı bildir" ve kapatma; önizleme için hedef sayfayı sunucudan getirecekseniz SSRF korumaları
([SSRF ve dış istekler](../50-guvenlik/ssrf-ve-dis-istekler.md)).

## Büyüyünce ne değişir

| Eşik (ölçülerek)                               | Değişiklik                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| Yönlendirme yükü tek süreci zorluyor           | Süreç sayısını artır; kodlar değişmediği için süreç içi önbellek tutarlı kalır (kapatma dışında: kısa süre) |
| Tek makine yetmiyor / kesintisizlik            | 2+ durum bilgisiz sunucu, veritabanı Postgres; sayaç paylaşılan depoya |
| Coğrafi gecikme önemli                         | Yönlendirmeyi CDN kenarında yap (kod → URL eşlemesi kenara dağıtılır) |
| Analitik ayrıntı isteniyor (ülke, cihaz)        | Tıklama olayını kuyruğa yaz, analitik deposunda topla; yönlendirme yolu beklemez |
| Milyarlarca bağlantı                           | Koda göre parçalama (kodlar arası sorgu yok, kolay); kod uzunluğu 8 |

## Tuzaklar

| Belirti                                                       | Neden                                                    | Çözüm                                                       |
| ------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| Rakip, bağlantıları sırayla tarayıp özel belgeleri buldu      | Sıralı kimlikten kod                                     | Kriptografik rastgele kod                                   |
| Kapatılan oltalama bağlantısı hâlâ yönlendiriyor              | 301 ile tarayıcılarda kalıcı önbellekte                  | 302/307 + kısa önbellek süresi                              |
| Popüler bağlantıda yönlendirme yavaşladı, "database is locked" | Her tıklamada sayaç güncellemesi                         | Bellekte topla, toplu yaz                                   |
| Servis oltalama aracı olarak kara listeye alındı              | Oluşturmada denetim ve hız sınırı yok                    | Şema/hedef denetimi, hız sınırı, bildir-kapat               |
| Kısa bağlantı iç ağdaki yönetim paneline yönlendiriyor        | İç adres engellenmedi                                    | Özel IP ve kendi alan adınızı reddedin                      |
| Nadiren "kod üretilemedi" hatası                              | Çakışmada yeniden deneme yok ya da kod uzayı doldu       | Benzersizlik + yeniden deneme; uzunluğu artırma eşiği       |

## Denetim listesi

- [ ] Kod kriptografik rastgele, benzersizlik kısıtı var, çakışmada yeniden deneniyor.
- [ ] Yönlendirme 302/307; önbellek süresi kısa; kapatılan bağlantı hemen çalışmıyor.
- [ ] Tıklama sayımı toplu yazılıyor; yönlendirme yolunda yazma kilidi yok.
- [ ] URL şeması ve hedefi denetleniyor; iç adres ve kendi alan adı reddediliyor.
- [ ] Oluşturmada hız sınırı, bildir ve kapat akışı var.
- [ ] Yönlendirme p99 ölçülüyor; süreç içi önbellek isabet oranı biliniyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Kodu `secrets` ile 7 karakter base62 üret; `kod` birincil anahtar, çakışmada en çok 5 kez
  yeniden dene. Yönlendirme 302. Tıklamayı bellekte topla, 10 sn'de bir tek işlemde yaz. Yalnız http/https ve
  özel olmayan hedefler."
- **Modelin tipik hatası:** otomatik artan kimliği base62'ye çevirip "kısa kod" der; `random` kullanır; 301 seçer;
  her tıklamada `UPDATE` yazar; URL doğrulamasını atlar.
- **Çıktıda arayın:** `random.`/`Math.random`, `301`, yönlendirme işleyicisinde `UPDATE`, şema denetimi.

## İlgili

- [Kapasite tahmini](kapasite-tahmini.md) · [Önbellek katmanları](onbellek-katmanlari.md) ·
  [Veritabanı ölçekleme](veritabani-olcekleme.md) · [Tasarım kararı şablonu](tasarim-karari-sablonu.md)
- [HTTP temelleri](../30-arkauc/http-temelleri.md) (yönlendirme kodları, önbellek başlıkları)
