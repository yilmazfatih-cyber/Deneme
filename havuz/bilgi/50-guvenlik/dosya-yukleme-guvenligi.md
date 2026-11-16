---
baslik: Dosya yükleme güvenliği: arşiv, yol, görüntü ve sunma
ozet: Yüklenen dosyanın adı ve yol geçişi, zip/tar arşivlerinde dışarı yazma ve sıkıştırma bombası, piksel bombası, görüntü kitaplığı riskleri ve kullanıcı içeriğini ayrı alan adından güvenli sunma.
etiketler: [guvenlik, dosya, yukleme, yol-gecisi, arsiv, goruntu]
duzey: orta
guncellik: 2026-11
---

# Dosya yükleme güvenliği: arşiv, yol, görüntü ve sunma

> Bu notu ne zaman okumalı: kullanıcıdan dosya, arşiv (zip/tar), görsel, PDF ya da belge alan; yüklenen dosyayı
> işleyen (küçük resim, dönüştürme, içe aktarma) ya da başkalarına sunan bir özellik yazılırken. Temel yükleme
> akışı (UUID ad, sihirli sayı, imzalı adres, EXIF, indirme başlıkları): [Dosya ve medya](../30-arkauc/dosya-ve-medya.md).

## Temel fikir

Yüklenen dosya üç kez tehlikelidir:

1. **Alırken:** boyut, ad ve tür yalan olabilir; ad diskte yazılacak yeri belirleyebilir (yol geçişi).
2. **İşlerken:** arşiv açılınca dışarı yazabilir ya da yüz kat büyüyebilir; görüntü/PDF kitaplıkları karmaşık
   ayrıştırıcılardır ve tarihleri açıklarla doludur.
3. **Sunarken:** sizin alan adınızdan açılan HTML/SVG, sizin kökeninizde betik çalıştırır.

Kural: ad, tür ve boyut **sunucuda** belirlenir; işleme yalıtılmış ve sınırlı bir süreçte yapılır; kullanıcı
içeriği uygulamanın kökeninden **sunulmaz**.

```text
istemci → [vekil: gövde sınırı] → [uygulama: akış sayacı] → geçici alan (karantina)
        → içerikten tür + boyut/piksel denetimi → işleme (yalıtılmış süreç, yeniden kodlama)
        → kalıcı depo (rastgele anahtar, özel kova) → sunma (ayrı alan adı, başlıklar, yetki)
```

## Karar tablosu

| Dosya türü                      | Kabul                                   | İşleme                                        | Sunma                                       |
| ------------------------------- | --------------------------------------- | --------------------------------------------- | ------------------------------------------- |
| PNG/JPEG/WebP (profil, ek)      | Sihirli sayı + piksel sınırı            | Yeniden kodla, üst veriyi at                  | Ayrı alan adı ya da imzalı adres, `nosniff` |
| SVG                             | Çoğu zaman reddet                        | Gerekirse sunucuda PNG'ye çevir               | Hiç satır içi değil                         |
| HTML, XML                       | Reddet                                   | —                                             | —                                           |
| PDF, Office belgesi             | Sihirli sayı + boyut                     | Dönüştürme yalıtılmış, ağsız süreçte          | `attachment`; ayrı alan adı                 |
| Zip/tar (toplu içe aktarma)     | Boyut                                    | Üye adı, toplam açılmış boyut ve oran denetimi | İçerik ayrı ayrı yeniden denetlenir         |
| CSV (içe aktarma)               | Boyut + satır sınırı                    | Şemayla satır satır doğrulama                 | Dışa aktarmada formül kaçışı                |

## Ad ve yol: alt klasörlü depolama

Kullanıcının adını hiç kullanmamak en iyisidir (kayıt kimliği + uzantı; örnek [Dosya ve medya](../30-arkauc/dosya-ve-medya.md)).
Klasör yapısı gerçekten kullanıcıya aitse (dosya yöneticisi, arşivden içe aktarma) her yol çözülür ve kökün içinde
kaldığı denetlenir. `resolve()` sembolik bağları da izler: kökün içindeki bir bağ dışarıyı gösterebilir.

```python calistir
import os
import pathlib
import tempfile
import unicodedata

kok = (pathlib.Path(tempfile.mkdtemp()) / "kullanici-7").resolve()
(kok / "belgeler").mkdir(parents=True)
disari = pathlib.Path(tempfile.mkdtemp())
(disari / "gizli.txt").write_text("başka kullanıcının dosyası")
os.symlink(disari, kok / "belgeler" / "kisayol")  # kök içinde, dışarıyı gösteren bağ

# YANLIŞ: birleştirip kullanmak
assert pathlib.Path("/srv/yukleme") / "/etc/passwd" == pathlib.Path("/etc/passwd")  # mutlak ad kökü siler
assert (kok / "belgeler/kisayol/gizli.txt").read_text() == "başka kullanıcının dosyası"


class YolHatasi(ValueError):
    pass


def guvenli_yol(goreli: str) -> pathlib.Path:
    if "\0" in goreli or "\\" in goreli or len(goreli) > 240:
        raise YolHatasi("geçersiz yol")
    aday = (kok / goreli).resolve()  # .. ve sembolik bağlar çözülür
    if not aday.is_relative_to(kok):
        raise YolHatasi("yol izinli klasörün dışında")
    return aday


WINDOWS_AYRILMIS = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}


def gorunen_ad(ad: str) -> str:
    """Kullanıcıya gösterilecek/indirmede önerilecek ad; diskteki ad DEĞİL."""
    ad = unicodedata.normalize("NFC", ad)
    ad = "".join("_" if c in '/\\:*?"<>|' or ord(c) < 32 or c == "\x7f" else c for c in ad).strip(" .")
    if ad.split(".")[0].upper() in WINDOWS_AYRILMIS:
        ad = "_" + ad
    return ad[:120] or "dosya"


# TEST: dışarı çıkan her yol reddedilir
for kotu in ["../../etc/passwd", "/etc/passwd", "belgeler/kisayol/gizli.txt", "a\0.png", "..\\..\\x"]:
    try:
        guvenli_yol(kotu)
        raise AssertionError(f"reddedilmeliydi: {kotu!r}")
    except YolHatasi:
        pass
assert guvenli_yol("belgeler/fatura.pdf") == kok / "belgeler" / "fatura.pdf"
assert gorunen_ad("../Gizli:Rapor?.pdf") == "_Gizli_Rapor_.pdf"
assert gorunen_ad("con.txt") == "_con.txt" and gorunen_ad("Şubat Özeti.xlsx") == "Şubat Özeti.xlsx"
print("tamam")
```

```cikti
tamam
```

`resolve()` ile denetim ve dosyayı açma arasında bağ değiştirilebilir (yarış). Kullanıcıların bağ
oluşturamadığı bir depolama tasarlayın; arşivden çıkarırken bağ üyelerini hiç yazmayın.

## Arşivler: dışarı yazma ve sıkıştırma bombası

**Dışarı yazma (zip slip):** arşivdeki üye adı `../../x` ya da mutlak yol olabilir. Python'un `zipfile`'ı
`extract` sırasında bu parçaları atar; `tarfile` ise **süzgeç verilmezse** Python 3.13'te yalnız uyarı verip
dışarı yazar (3.14'te varsayılanın `data` süzgeci olması PEP 706'da planlanmıştır; sürümünüzde doğrulayın).
Başka dillerdeki kitaplıklar ve elle yazılmış döngüler bunu çoğu zaman yapmaz.

```python calistir
import io
import pathlib
import tarfile
import tempfile

veri = io.BytesIO()
with tarfile.open(fileobj=veri, mode="w") as tar:
    uye = tarfile.TarInfo("../kacak.txt")
    uye.size = 2
    tar.addfile(uye, io.BytesIO(b"ok"))

alan = pathlib.Path(tempfile.mkdtemp())

# YANLIŞ: her şeye güvenen süzgeç (3.13'te süzgeçsiz çağrının davranışı budur)
veri.seek(0)
with tarfile.open(fileobj=veri) as tar:
    tar.extractall(alan / "hedef1", filter="fully_trusted")
assert (alan / "kacak.txt").exists()  # hedef klasörün DIŞINA yazıldı

# DOĞRU: "data" süzgeci dışarı yazmayı, bağları, aygıt dosyalarını ve tehlikeli izinleri reddeder
veri.seek(0)
with tarfile.open(fileobj=veri) as tar:
    try:
        tar.extractall(alan / "hedef2", filter="data")
        raise AssertionError("reddedilmeliydi")
    except tarfile.FilterError as hata:  # TEST
        assert "outside the destination" in str(hata)
print("tamam")
```

```cikti
tamam
```

**Sıkıştırma bombası:** 20 KB'lık zip 20 MB'a (iç içe arşivlerle çok daha fazlasına) açılabilir. Arşiv başlığındaki
boyutlar yalan söyleyebilir; bu yüzden hem başlığa bakılır hem açarken gerçek bayt sayılır.

```python calistir
import io
import pathlib
import tempfile
import zipfile

AZAMI_TOPLAM = 50 * 1024 * 1024
AZAMI_ORAN = 100
AZAMI_UYE = 1000


class ArsivHatasi(ValueError):
    pass


def guvenli_ac(arsiv: zipfile.ZipFile, hedef: pathlib.Path) -> list[str]:
    uyeler = arsiv.infolist()
    if len(uyeler) > AZAMI_UYE:
        raise ArsivHatasi("çok fazla dosya")
    if sum(u.file_size for u in uyeler) > AZAMI_TOPLAM:
        raise ArsivHatasi("açılmış boyut sınırı aşılıyor")
    yazilan, acilan = 0, []
    for uye in uyeler:
        if uye.is_dir():
            continue
        if uye.file_size / max(uye.compress_size, 1) > AZAMI_ORAN:
            raise ArsivHatasi(f"şüpheli sıkıştırma oranı: {uye.filename}")
        yol = (hedef / uye.filename).resolve()
        if not yol.is_relative_to(hedef.resolve()):
            raise ArsivHatasi("arşiv üyesi hedef dışına çıkıyor")
        yol.parent.mkdir(parents=True, exist_ok=True)
        with arsiv.open(uye) as kaynak, open(yol, "wb") as cikis:
            while parca := kaynak.read(64 * 1024):  # başlığa değil, gerçekten okunan bayta güven
                yazilan += len(parca)
                if yazilan > AZAMI_TOPLAM:
                    raise ArsivHatasi("açılmış boyut sınırı aşıldı")
                cikis.write(parca)
        acilan.append(uye.filename)
    return acilan


def zip_yap(dosyalar: dict[str, bytes]) -> zipfile.ZipFile:
    tampon = io.BytesIO()
    with zipfile.ZipFile(tampon, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for ad, icerik in dosyalar.items():
            z.writestr(ad, icerik)
    return zipfile.ZipFile(tampon)


hedef = pathlib.Path(tempfile.mkdtemp())
assert guvenli_ac(zip_yap({"musteriler.csv": "ad;sehir\nAyşe;İzmir\n".encode()}), hedef) == ["musteriler.csv"]
# TEST: 20 MB sıfırdan oluşan "rapor" (~20 KB sıkıştırılmış) ve dışarı çıkan ad reddedilir
for kotu in [{"rapor.csv": b"\0" * 20 * 1024 * 1024}, {"../../kacak.txt": b"x"}]:
    try:
        guvenli_ac(zip_yap(kotu), hedef)
        raise AssertionError("reddedilmeliydi")
    except ArsivHatasi:
        pass
print("tamam")
```

```cikti
tamam
```

İç içe arşivleri (zip içinde zip) açmayın ya da derinliği bir ile sınırlayın; açılan her dosya, tek tek yüklenmiş
gibi tür ve boyut denetiminden yeniden geçer.

## Görüntü ve belge işleme

Görüntü, PDF ve ofis belgesi kitaplıkları onlarca biçimi ayrıştıran büyük C kod tabanlarıdır; yıllar içinde
uzaktan kod çalıştırma dahil pek çok açık çıktı. Sorun "bu dosya kötü mü" değil, "kötüyse zarar ne kadar" sorusudur.

| Önlem                                                     | Neden                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------ |
| Biçim izin listesi (kitaplıkta yalnız gereken çözücüler)  | Nadir biçimlerin ayrıştırıcıları en az denenmiş koddur             |
| Çözmeden önce piksel sınırı (başlıktan genişlik × yükseklik) | Küçük dosya, belleği dolduran dev bir tuvale açılabilir           |
| Yeniden kodlama (yeni dosya üret)                         | Gizli yük ve üst veri taşınmaz                                     |
| Ayrı süreç/kapsayıcı: ağ yok, sır yok, bellek ve süre sınırı | Açık tetiklense bile etkisi o süreçte kalır                       |
| Kitaplığı güncel tutun; sürümü kilit dosyasında izleyin    | Açıklar düzeltilir ([Tedarik zinciri](tedarik-zinciri.md))         |
| Belgeden belgeye dönüştürmede (HTML→PDF, ofis→PDF) ağsız ortam | Belge içindeki dış kaynaklar iç ağa istek attırabilir ([SSRF](ssrf-ve-dis-istekler.md)) |

Piksel sınırını çözmeden önce başlıktan okumak:

```python calistir
import struct

AZAMI_PIKSEL = 40_000_000  # ~40 megapiksel; ürününüze göre seçin


def png_boyutu(bas: bytes) -> tuple[int, int]:
    if bas[:8] != b"\x89PNG\r\n\x1a\n" or bas[12:16] != b"IHDR":
        raise ValueError("PNG değil")
    return struct.unpack(">II", bas[16:24])


def png_kabul(bas: bytes) -> bool:
    genislik, yukseklik = png_boyutu(bas)
    return 0 < genislik <= 20_000 and 0 < yukseklik <= 20_000 and genislik * yukseklik <= AZAMI_PIKSEL


def sahte_png(genislik: int, yukseklik: int) -> bytes:  # yalnız başlık: sınama verisi
    return b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 13) + b"IHDR" + struct.pack(">IIBBBBB", genislik, yukseklik, 8, 6, 0, 0, 0)


assert png_kabul(sahte_png(1024, 768))
assert not png_kabul(sahte_png(50_000, 50_000))  # TEST: dosya küçük, tuval 2,5 milyar piksel
print("tamam")
```

```cikti
tamam
```

Gerçek projede başlığı kitaplığın "yalnız başlığı oku" işlevi okur (Pillow'da `Image.open` görüntüyü hemen
çözmez; piksel sınırı ayarı `Image.MAX_IMAGE_PIXELS` — davranışı sürümünüzde doğrulayın).

## Sunma: kullanıcı içeriği uygulamanın kökeninden açılmaz

- **Ayrı alan adı:** kullanıcı dosyaları başka bir **kayıtlı alan adından** sunulur (`ornekicerik.com`), alt alan
  adından değil (`dosya.ornek.com` aynı sitedir: `SameSite` çerezleri ve çerez yerleştirme bakımından ana
  uygulamaya yakındır). Bu alan adında oturum çerezi yoktur.
- **Başlıklar:** türü sunucu belirler (izin listesinden), `X-Content-Type-Options: nosniff`, görüntü dışındaki her
  şeyde `Content-Disposition: attachment`; satır içi gösterilen kullanıcı içeriğinde
  `Content-Security-Policy: default-src 'none'; img-src 'self'; sandbox` (betik çalışmaz, form gönderilmez).
  Türkçe adlı dosyanın indirme adı: [Dosya ve medya → İndirme başlıkları](../30-arkauc/dosya-ve-medya.md).
- **Yetki:** özel dosya ya yetki denetimli bir uçtan ya da kısa süreli imzalı adresle verilir; depolama kovası
  herkese açık listelenemez.
- **Paylaşılan dosyalarda** (başkalarına gönderilen ek) virüs taraması ve tarama bitene kadar karantina düşünün.
- **Dışa aktarılan CSV/Excel:** `=`, `+`, `-`, `@` ile başlayan hücre formül olarak çalışır; kaçışlayın
  ([`kutuphane/py/kutuphane/csv.py`](../../kutuphane/py/kutuphane/csv.py) formül koruması).

## Tuzaklar

| Belirti                                                          | Neden                                                        | Çözüm                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| Arşiv açılınca uygulama klasöründe yabancı dosya belirdi          | Üye adı `../` taşıyordu; `tarfile` süzgeçsiz                  | `filter="data"`; elle açarken `resolve` + `is_relative_to`         |
| Küçük bir zip diski doldurdu                                     | Sıkıştırma bombası; boyut yalnız başlıktan okundu             | Toplam boyut, oran ve gerçek bayt sayacı                           |
| Kullanıcı başka kullanıcının klasöründeki dosyayı okudu           | Kök içindeki sembolik bağ dışarıyı gösteriyordu              | `resolve()` sonrası denetim; bağ oluşturulamayan depolama          |
| Küçük resim üretici süreç bellek yüzünden öldü                    | Piksel bombası                                               | Çözmeden önce piksel sınırı; süreç bellek sınırı                   |
| Görüntü kitaplığındaki açıkla sunucuya komut çalıştırıldı          | Ayrıştırıcı yalıtılmamış, gereksiz biçimler açık             | Biçim izin listesi, yalıtılmış süreç, güncel kitaplık              |
| Profil resmi adresinde oltalama sayfası açıldı                    | HTML/SVG uygulamanın alan adından satır içi sunuldu          | Ayrı alan adı, `attachment`, `sandbox` CSP                         |
| HTML'den PDF üreten araç iç ağdaki yönetim sayfasını belgeye gömdü | Dönüştürücü belgedeki kaynakları getirdi                    | Ağsız ortam ya da sıkı çıkış vekili                                |
| Windows'ta indirilen dosya açılmıyor ya da yanlış klasöre gidiyor  | `CON.txt`, `:` ya da denetim karakterli ad                   | `gorunen_ad` ile temizleme                                         |
| Dışa aktarılan tabloda hücre açılınca komut çalıştırma uyarısı     | CSV formül enjeksiyonu                                        | Formül karakterleriyle başlayan hücreleri kaçışlayın               |

## Denetim listesi

- [ ] Ad, tür ve boyut sunucuda belirleniyor; tür içerikten ve izin listesinden ([Dosya ve medya](../30-arkauc/dosya-ve-medya.md)).
- [ ] Kullanıcı yolları `resolve()` + `is_relative_to` ile denetleniyor; NUL, ters eğik çizgi, mutlak yol reddediliyor.
- [ ] Arşivler: `tarfile` için `filter="data"`; zip için üye adı, toplam boyut, oran ve gerçek bayt sayacı;
      iç içe arşiv yok.
- [ ] Görüntüde çözmeden önce piksel sınırı; yeniden kodlama; üst veri siliniyor.
- [ ] İşleme yalıtılmış süreçte: ağsız, sırsız, bellek ve süre sınırlı.
- [ ] Kullanıcı içeriği ayrı kayıtlı alan adından ya da `attachment` + `nosniff` + `sandbox` CSP ile sunuluyor.
- [ ] Testte: `../`, mutlak yol, sembolik bağ, zip bombası, `tar` dışarı yazma, dev PNG başlığı, HTML/SVG içerik
      reddediliyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Yüklenen dosyanın adını diskte kullanma; kimlik + izinli uzantı. Arşiv açacaksan
  `guvenli_ac` kalıbını kullan (üye adı, toplam boyut, oran, bayt sayacı); `tarfile` için `filter='data'`.
  Görüntüde çözmeden önce piksel sınırına bak, sonra yeniden kodla. Kullanıcı dosyasını uygulamanın alan adından
  satır içi sunma."
- **Modelin tipik hatası:** `os.path.join(KOK, dosya.filename)`; `extractall()`'ı süzgeçsiz çağırmak;
  `Content-Type` başlığına güvenmek; SVG'yi görüntü saymak; dönüştürücüyü ana uygulama sürecinde ağ erişimiyle
  çalıştırmak.
- **Çıktıda denetleyin:** `extractall(`, `extract(`, `filename`, `originalname`, `join(` + kullanıcı adı,
  `send_file`/`sendFile` ile satır içi sunma, `image/svg+xml`.
- **Test isteyin:** yukarıdaki dört çalışan bloğun sınama girdileri (yol, tar, zip bombası, piksel) proje testine
  taşınsın.

## İlgili

- Temel akış: [Dosya ve medya](../30-arkauc/dosya-ve-medya.md) · Sunma başlıkları:
  [Başlıklar ve HTTPS](guvenlik-basliklari-ve-https.md) · Dosya adıyla kabuk komutu: [Enjeksiyon](enjeksiyon.md)
- Çalışan kod: statik dosya sunumunda yol geçişi ve gizli dosya reddi
  [`uygulama/api/src/http/static.ts`](../../uygulama/api/src/http/static.ts); kök dışına çıkmayan ve gizli dosya
  okumayan araç [`yz/yz/arac/hazir/dosya.py`](../../yz/yz/arac/hazir/dosya.py)
