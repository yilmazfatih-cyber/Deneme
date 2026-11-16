---
baslik: Dosya ve medya: güvenli yükleme, depolama, imzalı adres ve indirme
ozet: Kullanıcı dosyasını içerikten tür denetimi, boyut sınırı, ad temizliği ve yol geçişine karşı korumayla kabul etmek; depolama yeri, imzalı süreli adres, görüntü üst verisi, indirme başlıkları ve büyük dosya.
etiketler: [dosya, yukleme, guvenlik, medya, http]
duzey: orta
guncellik: 2026-11
---

# Dosya ve medya: güvenli yükleme, depolama, imzalı adres ve indirme

> Bu notu ne zaman okumalı: profil fotoğrafı, belge, ek, fatura PDF'i gibi kullanıcı dosyası alan ya da sunan bir
> özellik yazılırken; "dosya adı Türkçe olunca indirme bozuluyor", "fotoğraflar yan duruyor" ya da "dosya
> bağlantısı başkasının eline geçti" sorunlarında.

## Temel fikir

Yüklenen dosya, internetten gelen **güvenilmez girdidir** ve üstelik onu saklayıp **başkalarına sunarsınız**.
Tehditler: dosya adıyla klasör dışına yazma (yol geçişi), başkasının dosyasının üzerine yazma, "foto.png" adlı HTML
ya da SVG'nin sizin alan adınızdan açılıp betik çalıştırması, dev dosyayla diski ya da belleği doldurma, küçük
ama açılınca devleşen görüntü (sıkıştırma bombası), fotoğraftaki konum bilgisinin herkese sunulması, tahmin
edilebilir ya da süresiz bağlantı.

Dört kural işin çoğunu çözer: **adı siz verin, türü içerikten anlayın, boyutu okurken sınırlayın, sunarken
`attachment` + `nosniff` kullanın.**

## Yükleme güvenliği

| Konu        | Yanlış                                         | Doğru                                                                 |
| ----------- | ---------------------------------------------- | --------------------------------------------------------------------- |
| Ad          | Kullanıcının verdiği adı yola eklemek          | Kendi kimliğiniz (UUID) + türden türetilen uzantı; özgün ad yalnız üst veri |
| Tür         | Uzantıya ya da `Content-Type` başlığına güvenmek | İlk baytlardan (sihirli sayı) tür; izin listesi                     |
| Boyut       | Bütün dosyayı belleğe alıp sonra bakmak        | Vekilde ve uygulamada sınır; akış okunurken sayılır                   |
| SVG, HTML   | Görüntü diye kabul edip aynı alan adından sunmak | Kabul etmeyin ya da yalnız `attachment` olarak, ayrı alan adından   |
| Arşiv (zip) | Açıp içindekileri adlarıyla diske yazmak       | Açılmış toplam boyut sınırı; içteki adlar da yol geçişi denetiminden |
| Konum       | Kullanıcı başına sınırsız                      | Kullanıcı başına kota ve hız sınırı                                   |

```python calistir
import os
import pathlib
import tempfile
import uuid

KOK = pathlib.Path(tempfile.mkdtemp()) / "yuklemeler"
KOK.mkdir()

# YANLIŞ: kullanıcının verdiği adı yola eklemek
assert os.path.join(str(KOK), "../../etc/passwd").endswith("yuklemeler/../../etc/passwd")  # kökten çıkar
assert os.path.join(str(KOK), "/etc/passwd") == "/etc/passwd"  # mutlak ad kökü TAMAMEN yok sayar

IMZALAR = {  # tür içeriğin ilk baytlarından anlaşılır
    b"\x89PNG\r\n\x1a\n": ("image/png", ".png"),
    b"\xff\xd8\xff": ("image/jpeg", ".jpg"),
    b"%PDF-": ("application/pdf", ".pdf"),
}
EN_COK_BAYT = 5 * 1024 * 1024


def kabul_et(icerik: bytes) -> pathlib.Path:
    if len(icerik) > EN_COK_BAYT:  # gerçekte akış okunurken sayılır
        raise ValueError("dosya çok büyük")  # → 413
    for imza, (_, uzanti) in IMZALAR.items():
        if icerik.startswith(imza):
            hedef = (KOK / f"{uuid.uuid4().hex}{uzanti}").resolve()  # ad bizim: çakışma ve yol oyunu yok
            if not hedef.is_relative_to(KOK.resolve()):  # savunma derinliği
                raise ValueError("geçersiz yol")
            hedef.write_bytes(icerik)
            return hedef
    raise ValueError("bu dosya türü kabul edilmiyor")  # → 415


png = kabul_et(b"\x89PNG\r\n\x1a\n" + b"\x00" * 32)
assert png.parent == KOK.resolve() and png.suffix == ".png"
for kotu in [b"<html><script>alert(1)</script>", b"<svg onload=alert(1)>", b"MZ\x90\x00"]:
    try:
        kabul_et(kotu)  # adı "foto.png" olsa da içerik HTML/SVG/EXE
        raise AssertionError("reddedilmeliydi")
    except ValueError:
        pass
print("tamam")
```

```cikti
tamam
```

Sihirli sayı denetimi ilk elemedir, kanıt değildir: başı PNG olan bir dosyanın içinde başka şey de olabilir.
Görüntüyü bir kitaplıkla **açıp yeniden kodlamak** (yeniden kaydetmek) gizli yükü de üst veriyi de temizler.
Başkalarıyla paylaşılan belgelerde ayrı bir virüs tarama adımı düşünün.

Havuzdaki sunucuda dosya yükleme yoktur (README → "Sınırlar"), ama aynı savunmanın sunma tarafı vardır: klasör
dışına çıkma (`..`), gizli dosya (`.env`) ve bozuk kodlama 404 alır ([`static.ts`](../../uygulama/api/src/http/static.ts));
gövde sınırı uca göre seçilir ([`bodyLimit.ts`](../../uygulama/api/src/http/bodyLimit.ts)).

## Depolama yeri

| Seçenek                          | Ne zaman                                              | Dikkat                                                        |
| -------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------- |
| Veritabanında (BLOB)             | Küçük (yüz KB altı), az sayıda, işlemle birlikte tutarlı olmalı | Veritabanı ve yedek şişer                            |
| Sunucunun diski                  | Tek sunucu, kalıcı disk var                           | Geçici diskli barındırmada **her yeniden başlatmada silinir**; çok kopyada paylaşılmaz |
| Nesne depolama (S3 uyumlu)       | Varsayılan seçim; büyük, çok sayıda, çok kopya        | Erişim kuralları, yaşam döngüsü, ayrı yedek; çıkış trafiği ücreti |

Hangisi olursa olsun veritabanında dosyanın **kaydı** durur: kimlik, sahip/kiracı, depolama anahtarı, tür, boyut,
özet (SHA-256), özgün ad, oluşturma zamanı. Yetki denetimi bu kayıt üzerinden yapılır
([Yetkilendirme](yetkilendirme.md)); dosya anahtarı tahmin edilemez olur.

## İmzalı ve süreli adres

Dosyayı uygulama sunucusundan geçirmeden indirtmek (ya da doğrudan depoya yükletmek) için adres, son geçerlilik
anı ve bir HMAC imzası taşır. Doğrulayan taraf veritabanına sormadan "bu adresi biz verdik ve süresi dolmadı" der.

```python calistir
import base64
import hashlib
import hmac
from urllib.parse import parse_qs, urlencode, urlsplit

GIZLI = b"dosya-baglantisi-icin-ayri-32-bayt-anahtar"


def imza(yol: str, bitis: int) -> str:
    ozet = hmac.new(GIZLI, f"{yol}\n{bitis}".encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(ozet).rstrip(b"=").decode()


def baglanti_uret(yol: str, simdi: int, sure: int = 300) -> str:
    bitis = simdi + sure  # kısa süre: bağlantı sızarsa zarar sınırlı
    return f"{yol}?{urlencode({'bitis': bitis, 'imza': imza(yol, bitis)})}"


def dogrula(adres: str, simdi: int) -> bool:
    parca = urlsplit(adres)
    q = parse_qs(parca.query)
    try:
        bitis, verilen = int(q["bitis"][0]), q["imza"][0]
    except (KeyError, ValueError):
        return False
    return bitis > simdi and hmac.compare_digest(verilen, imza(parca.path, bitis))


simdi = 1_800_000_000
adres = baglanti_uret("/dosyalar/7f3a.pdf", simdi)
assert dogrula(adres, simdi + 60)
assert not dogrula(adres, simdi + 301)  # süresi doldu
assert not dogrula(adres.replace("7f3a", "8b1c"), simdi + 60)  # başka dosyaya çevrilemez
assert not dogrula(adres.replace(f"bitis={simdi + 300}", f"bitis={simdi + 99999}"), simdi + 60)  # süre uzatılamaz
print("tamam")
```

```cikti
tamam
```

- Süre dakikalarla sınırlı; adres süresi içinde **iptal edilemez** (sızarsa bitene dek geçerlidir).
- Adresi her istekte yetki denetiminden sonra üretin; e-postaya süresiz adres koymayın.
- Tam adresler (imzasıyla) günlüğe yazılmaz.
- Nesne depolama servisleri bu kalıbın hazır biçimini sunar ("ön imzalı adres"); kendi API'lerini belgesinden
  doğrulayarak kullanın.

## Görüntü işleme

- **Piksel sınırı:** bayt sınırı yetmez; birkaç KB'lık bir PNG açılınca on binlerce piksel kenara çıkabilir.
  Kitaplığın en çok piksel ayarını kullanın, boyutları açmadan önce başlıktan okuyun.
- **Yön bilgisi:** telefonlar fotoğrafı döndürmez, EXIF'e "6: 90° döndür" yazar. EXIF'i silip yönü uygulamazsanız
  fotoğraflar **yan durur**. Sıra: yönü uygula → yeniden kodla → üst veriyi at. (Pillow'da `ImageOps.exif_transpose`;
  Node'da sharp'ın yön düzeltmesi. Kurulu sürümün belgesinden doğrulayın.)
- **Üst veri temizliği:** EXIF, GPS konumunu (çoğu zaman kullanıcının evi), cihaz modelini, çekim zamanını taşır.
  Başkalarına sunulan her görüntüden atın ve testle doğrulayın:

```python calistir
def bolumler(jpeg: bytes):
    """JPEG'in üst veri bölümlerini (işaret, içerik) verir; görüntü verisi (SOS) başlayınca durur."""
    if not jpeg.startswith(b"\xff\xd8"):
        raise ValueError("JPEG değil")
    i = 2
    while i + 4 <= len(jpeg) and jpeg[i] == 0xFF and jpeg[i + 1] != 0xDA:
        uzunluk = int.from_bytes(jpeg[i + 2 : i + 4], "big")
        yield jpeg[i + 1], jpeg[i + 4 : i + 2 + uzunluk]
        i += 2 + uzunluk


def exif_var_mi(jpeg: bytes) -> bool:
    return any(isaret == 0xE1 and icerik.startswith(b"Exif\x00\x00") for isaret, icerik in bolumler(jpeg))


def bolum(isaret: int, icerik: bytes) -> bytes:
    return bytes([0xFF, isaret]) + (len(icerik) + 2).to_bytes(2, "big") + icerik


# Sentetik örnek: telefon fotoğrafı gibi EXIF (konum + yön) taşıyan JPEG başı
telefon = b"\xff\xd8" + bolum(0xE1, b"Exif\x00\x00GPS:41.0,29.0;Orientation=6") + bolum(0xDB, b"\x00" * 4)
telefon += b"\xff\xda" + b"\x00\x08goruntu-verisi" + b"\xff\xd9"
islenmis = b"\xff\xd8" + bolum(0xDB, b"\x00" * 4) + b"\xff\xda" + b"\x00\x08goruntu-verisi" + b"\xff\xd9"
assert exif_var_mi(telefon)  # konum herkese sunulmak üzere
assert not exif_var_mi(islenmis)  # testte beklenen: sunulan dosyada EXIF yok
print("tamam")
```

```cikti
tamam
```

- **Küçük resimler** (thumbnail) yüklemeyi bekletmez; kuyruğa konur ([Arka plan işleri](arka-plan-isleri.md)).
  Hazır olana dek yer tutucu gösterilir.
- Özgün dosyayı saklayıp boyutları istek anında üretiyorsanız önbellek ve boyut izin listesi şart; yoksa biri
  binlerce farklı boyut isteyerek sunucuyu yorar.

## İndirme başlıkları

| Başlık                                  | Neden                                                                 |
| --------------------------------------- | --------------------------------------------------------------------- |
| `Content-Type` (kayıtlı gerçek tür)     | Tarayıcı içeriği doğru yorumlasın                                     |
| `X-Content-Type-Options: nosniff`       | Tarayıcı türü tahmin edip HTML'e çevirmesin                           |
| `Content-Disposition: attachment; …`    | Kullanıcı içeriği sayfa olarak açılmasın, indirilsin                  |
| `Cache-Control: private, no-store`      | Kişisel dosya paylaşılan önbellekte kalmasın                          |
| Ayrı alan adı (ör. `kullanici-icerik.…`) | Kullanıcı dosyası sizin oturum çerezinizin alanında çalışmasın       |

Başlık değerleri ASCII'dir; Türkçe dosya adı `filename*` ile kodlanır, eski istemciler için ASCII karşılığı da
yazılır. Ad, başlık enjeksiyonuna karşı temizlenir:

```python calistir
import re
import unicodedata
from urllib.parse import quote


def content_disposition(ad: str) -> str:
    ad = re.sub(r'[\x00-\x1f\x7f"\\/]', "_", ad)  # satır sonu, tırnak, eğik çizgi: başlık enjeksiyonu
    ascii_ad = unicodedata.normalize("NFKD", ad.replace("ı", "i").replace("İ", "I"))
    ascii_ad = ascii_ad.encode("ascii", "ignore").decode() or "dosya"
    return f"attachment; filename=\"{ascii_ad}\"; filename*=UTF-8''{quote(ad, safe='')}"


assert content_disposition("Şubat raporu (son).pdf") == (
    "attachment; filename=\"Subat raporu (son).pdf\"; filename*=UTF-8''%C5%9Eubat%20raporu%20%28son%29.pdf"
)
assert "\r" not in content_disposition('a"\r\nSet-Cookie: x=1.pdf')
assert content_disposition("ılık su.txt").startswith('attachment; filename="ilik su.txt"')
print("tamam")
```

```cikti
tamam
```

Havuzdaki hesap dışa aktarımı aynı başlığı kullanır (`hesap-verileri-YYYY-AA-GG.json`;
[`docs/API.md`](../../uygulama/docs/API.md) → `GET /api/account/export`).

## Büyük dosya

- Uygulama sunucusu baytları taşımasın: istemci, sunucunun ürettiği **imzalı yükleme adresine** doğrudan yükler;
  sunucu yalnız kaydı açar ve bitince doğrular (boyut, özet, tür).
- **Parçalı ve sürdürülebilir yükleme:** dosya 5–10 MB'lık parçalara bölünür, her parça kendi özetiyle gönderilir,
  kopan bağlantı kaldığı parçadan sürer, en sonda birleştirilip bütün dosyanın özeti denetlenir.
- **Yarım kalan yüklemeler** depoda yer kaplar: belirli süreden eski tamamlanmamış yüklemeleri silen bir iş ya da
  depo yaşam döngüsü kuralı.
- Vekil ve sunucu zaman aşımları büyük dosyaya göre ayarlanır; ilerleme kullanıcıya gösterilir.

## Tuzaklar

| Belirti                                                          | Neden                                                    | Çözüm                                                       |
| ---------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| Sunucuda beklenmedik yerlerde dosyalar oluştu                    | Kullanıcının dosya adı yola eklendi (`../`, mutlak yol)  | Adı siz verin; çözülen yolun kök içinde olduğunu denetleyin |
| İki kullanıcının aynı adlı dosyası birbirinin üzerine yazıldı    | Özgün ad depolama anahtarı olarak kullanıldı             | UUID anahtar                                                |
| "Profil fotoğrafı" açılınca betik çalıştı                        | HTML/SVG görüntü diye kabul edildi, aynı alan adından sunuldu | İçerikten tür; SVG yok; `nosniff`, `attachment`, ayrı alan adı |
| Sunucu belleği büyük yüklemelerde doldu                          | Gövde bütünüyle belleğe alındı                           | Akış + boyut sınırı vekilde ve uygulamada                   |
| Küçük bir görüntü sunucuyu çökertti                              | Piksel sınırı yok (sıkıştırma bombası)                   | En çok piksel ayarı; boyutu başlıktan okuyun                |
| Fotoğraflar yan duruyor                                          | EXIF silindi ama yön uygulanmadı                         | Önce yönü uygula, sonra üst veriyi at                       |
| Paylaşılan fotoğraf kullanıcının ev konumunu veriyor             | EXIF/GPS korunmuş                                        | Üst veriyi atın; testle doğrulayın                          |
| Türkçe adlı dosya indirilince ad bozuk ya da yanıt kırık         | Başlıkta ASCII dışı karakter                             | `filename*=UTF-8''…` + ASCII yedek                          |
| Eski dosya bağlantısı aylar sonra hâlâ açılıyor                  | Süresiz, tahmin edilebilir ya da herkese açık adres      | Yetki denetimli uç ya da kısa süreli imzalı adres           |
| Geçici diskli barındırmada yüklenen dosyalar kayboldu            | Dosyalar sunucunun diskindeydi                           | Kalıcı disk ya da nesne depolama                            |

## Denetim listesi

- [ ] Depolama adı sunucunun ürettiği kimlik; özgün ad yalnız üst veri olarak saklanıyor.
- [ ] Tür içerikten belirleniyor ve izin listesinde; SVG/HTML ya reddediliyor ya da yalnız indirme olarak sunuluyor.
- [ ] Boyut sınırı hem vekilde hem uygulamada; görüntülerde piksel sınırı var.
- [ ] Yol oluşturan her yerde "kök içinde mi" denetimi var (arşiv içi adlar dahil).
- [ ] Görüntüler yön uygulanarak yeniden kodlanıyor; EXIF/GPS siliniyor (testli).
- [ ] Sunarken `Content-Type`, `nosniff`, `attachment`, `private` başlıkları var; Türkçe ad `filename*` ile.
- [ ] Dosyaya erişim yetki denetiminden geçiyor; imzalı adresler kısa süreli.
- [ ] Depolama yeri kalıcı; yedeği ve yaşam döngüsü (yarım yüklemeler) planlı.
- [ ] Kullanıcı başına kota ve yükleme ucunda hız sınırı var.

## Küçük modele yaptırırken

- **İsteme yazın:** "Yüklenen dosyanın adını kullanma; UUID üret. Türü ilk baytlardan belirle, yalnız PNG/JPEG/PDF
  kabul et. En çok 5 MB, akış okunurken say. Görüntüyü yönünü uygulayarak yeniden kodla ve EXIF'i at. Sunarken
  `attachment`, `nosniff`, Türkçe ad için `filename*`."
- **Tipik hatalar:** `path.join(uploadDir, file.originalname)`; türü `file.mimetype`'tan (istemcinin beyanından)
  almak; bütün dosyayı `Buffer`'a okuyup sonra boyuta bakmak; SVG'yi görüntü saymak; dosyaları
  `public/uploads/` altında herkese açık sunmak; `Content-Disposition`'a ham Türkçe ad yazmak.
- **Çıktıda arayın:** `originalname`, `filename` ile kurulan yollar; `mimetype` ile yapılan tür kararı;
  `express.static`/herkese açık klasöre yazma; `readFile`/`arrayBuffer()` ile sınırsız okuma.
- **Test isteyin:** "`../../x` adlı dosya kök dışına yazılmaz", "PNG adlı HTML reddedilir", "sunulan fotoğrafta
  EXIF yok", "Türkçe adlı dosya doğru adla iner".

## İlgili

- [HTTP temelleri](http-temelleri.md) (başlıklar) · [Yetkilendirme](yetkilendirme.md) (dosyaya erişim) ·
  [Hız sınırı ve kötüye kullanım](hiz-siniri-ve-kotuye-kullanim.md) (yükleme ucu) ·
  [Yapılandırma ve sırlar](yapilandirma-ve-sirlar.md) (imza anahtarı)
- Türkçe adın ASCII karşılığı ve katlama: [Türkçe büyük/küçük harf](../97-turkce/buyuk-kucuk-harf.md).
- Saldırı tarafının ayrıntısı (arşiv bombası, çok dilli dosya, sunma alan adı):
  [Dosya yükleme güvenliği](../50-guvenlik/dosya-yukleme-guvenligi.md); CSV/Excel yükleme ve indirme akışı:
  [İçe ve dışa aktarım](ice-ve-disa-aktarim.md).
- "Adresten yükle" (kullanıcı bir adres verir, sunucu indirir) özelliği SSRF'tir:
  [SSRF ve dış istekler](../50-guvenlik/ssrf-ve-dis-istekler.md); yüklenen HTML/SVG'nin betik çalıştırması:
  [XSS ve CSP](../50-guvenlik/xss-ve-csp.md).
