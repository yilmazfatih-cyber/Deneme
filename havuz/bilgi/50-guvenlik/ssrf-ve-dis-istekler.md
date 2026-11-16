---
baslik: SSRF ve kullanıcı adresine dış istek
ozet: Bağlantı önizleme, webhook, adresten içe aktarma gibi özelliklerde sunucunun iç ağa istek atmasını önlemek; çözülen IP denetimi, yönlendirme ve DNS yeniden bağlama tuzağı, izin listesi.
etiketler: [guvenlik, ssrf, ag, webhook, ipaddress]
duzey: ileri
guncellik: 2026-11
---

# SSRF ve kullanıcı adresine dış istek

> Bu notu ne zaman okumalı: kullanıcının verdiği bir adrese **sunucudan** istek atan her özellikte: bağlantı
> önizleme, webhook hedefi, "adresten görsel/CSV içe aktar", RSS, HTML'den PDF üretme, kurumsal giriş için
> sağlayıcı adresi, yapay zekâ ajanının "web sayfası getir" aracı.

## Temel fikir

SSRF (sunucu taraflı istek sahteciliği), saldırganın sunucunuzu **kendi adına istek atan bir vekile** çevirmesidir.
Sunucu, dışarıdan erişilemeyen yerlere erişebilir: kendisi (`127.0.0.1`'deki yönetim kapıları), iç ağ (`10.x`,
veritabanı, önbellek), bulut sağlayıcısının üst veri hizmeti (`169.254.169.254`: çoğu zaman geçici erişim
anahtarı verir) ve yerel dosyalar (`file://`).

Doğru denetim **adın değil, bağlanılacak IP'nin** denetimidir: adı çöz, her IP'yi sına, bağlantıyı **o IP'ye** kur,
yönlendirmeyi kendiliğinden izleme. Dizge karşılaştırması ("localhost mu?") işe yaramaz: aynı adres pek çok
biçimde yazılır ve DNS bir adı istediği IP'ye çözer.

Yanıtı kullanıcıya hiç göstermemek de yetmez: "başarılı / başarısız" ve süre farkı bile iç ağda hangi kapının açık
olduğunu söyler; GET isteği tek başına iç bir yönetim ucunu tetikleyebilir.

## Karar tablosu

| Özellik                                         | Yaklaşım                                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Bilinen birkaç ortağa istek                     | **Ana makine izin listesi**; kullanıcıdan adres değil, ortak adı/kimliği alın                     |
| Webhook (müşterinin adresi)                     | Yalnız `https`, kapı 443, çözülen IP denetimi, IP'ye sabit bağlantı, yönlendirme yok; ayrı işçi  |
| Bağlantı önizleme, adresten görsel içe aktarma  | Aynı denetim + içerik türü izin listesi + boyut ve süre sınırı; yanıtın yalnız gereken kısmı      |
| HTML'den PDF / ekran görüntüsü                  | Tarayıcı motoru belgedeki her kaynağı getirir: ağsız ortamda ya da sıkı vekil arkasında çalıştırın |
| Birçok özellik dışarı istek atıyor              | Uygulama dışında **çıkış vekili** (egress proxy): politika bağlantı anında, tek yerde uygulanır  |
| İç servisler arası çağrı                        | Kullanıcıdan adres almayın; adres yapılandırmadan, kullanıcıdan yalnız kimlik gelir               |

## Adres denetimi: yanlış, doğru, test

Neden açık: ilk satırdaki "bağlantı önizleme" adresi olduğu gibi açar; Python'un `urlopen`'ı `file://` adresini
de açar. Doğru sürüm şemayı, kapıyı ve **çözülmüş her IP'yi** denetler.

```python calistir
import ipaddress
import pathlib
import socket
import tempfile
import urllib.request
from urllib.parse import urlsplit

# YANLIŞ: kullanıcı adresini olduğu gibi açmak
gizli = pathlib.Path(tempfile.mkdtemp()) / "sunucu.env"
gizli.write_text("VERITABANI_PAROLASI=ornek")
assert b"PAROLASI" in urllib.request.urlopen(gizli.as_uri()).read()  # file:// sunucu dosyasını okudu

IZINLI_SEMALAR = {"http", "https"}
IZINLI_KAPILAR = {80, 443}
NAT64 = ipaddress.ip_network("64:ff9b::/96")


class GuvenlikHatasi(ValueError):
    pass


def izinli_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    if ip.version == 6 and ip.ipv4_mapped is not None:  # ::ffff:a.b.c.d
        ip = ip.ipv4_mapped
    elif ip.version == 6 and ip in NAT64:  # 64:ff9b::a.b.c.d
        ip = ipaddress.IPv4Address(int(ip) & 0xFFFFFFFF)
    return ip.is_global and not ip.is_multicast


def adres_denetle(adres: str) -> tuple[str, int, list[str]]:
    parca = urlsplit(adres)
    if parca.scheme not in IZINLI_SEMALAR or not parca.hostname:
        raise GuvenlikHatasi("yalnız http ve https adresleri")
    kapi = parca.port or (443 if parca.scheme == "https" else 80)
    if kapi not in IZINLI_KAPILAR:
        raise GuvenlikHatasi("bu kapıya istek atılmaz")
    ipler = sorted({bilgi[4][0] for bilgi in socket.getaddrinfo(parca.hostname, kapi, proto=socket.IPPROTO_TCP)})
    if not ipler or not all(izinli_ip(ipaddress.ip_address(ip.split("%")[0])) for ip in ipler):
        raise GuvenlikHatasi("iç ağ adresine istek atılmaz")
    return parca.hostname, kapi, ipler  # bağlantı bu IP'lerden birine kurulur


# TEST 1: dizge denetimi yazılışı kaçırır, çözümleme yakalar
assert urlsplit("http://127.1/").hostname not in {"localhost", "127.0.0.1"}
assert socket.getaddrinfo("127.1", 80)[0][4][0] == "127.0.0.1"
# TEST 2: denetleyicinin reddetmesi gereken adresler
for kotu in ["http://127.1/", "http://localhost/", "http://[::ffff:127.0.0.1]/", "http://169.254.169.254/",
             "http://10.0.0.5/", "https://8.8.8.8:22/", gizli.as_uri(), "ftp://8.8.8.8/"]:
    try:
        adres_denetle(kotu)
        raise AssertionError(f"geçmemeliydi: {kotu}")
    except GuvenlikHatasi:
        pass
assert adres_denetle("https://8.8.8.8/") == ("8.8.8.8", 443, ["8.8.8.8"])
# TEST 3: yalnız is_global'a güvenmek yetmez
assert ipaddress.ip_address("224.0.0.1").is_global and not izinli_ip(ipaddress.ip_address("224.0.0.1"))
assert ipaddress.ip_address("64:ff9b::7f00:1").is_global and not izinli_ip(ipaddress.ip_address("64:ff9b::7f00:1"))
assert not izinli_ip(ipaddress.ip_address("100.64.0.1"))  # operatör NAT alanı
print("tamam")
```

```cikti
tamam
```

Notlar:

- `is_private`/`is_global` listeleri Python sürümleriyle güncellenir; testinizdeki adres tablosunu sürüm
  yükseltmesinde yeniden koşun. IPv6 gerekmiyorsa yalnız IPv4'e izin vermek en sade politikadır.
- Ad birden çok IP'ye çözülüyorsa **hepsi** izinli olmalı; birini seçip denetlemek yetmez.
- Denetim kullanıcı adresi kaydederken (webhook kaydı) **ve** her istekte yapılır: DNS kaydı sonradan değişebilir.

## Yönlendirme ve DNS yeniden bağlama

**Yönlendirme:** `urlopen` ve çoğu HTTP istemcisi 3xx yanıtını kendiliğinden izler. İlk adres denetimden geçer,
sunucusu `302 Location: http://127.0.0.1/…` döner, istemci iç adrese gider.

```python calistir
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Isleyici(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path == "/onizleme":  # "dış" sayfa iç adrese yönlendiriyor
            self.send_response(302)
            self.send_header("Location", f"http://127.0.0.1:{self.server.server_address[1]}/ic")
            self.end_headers()
        else:
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"IC-VERI")

    def log_message(self, *args: object) -> None:
        pass


sunucu = ThreadingHTTPServer(("127.0.0.1", 0), Isleyici)
threading.Thread(target=sunucu.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True).start()
taban = f"http://127.0.0.1:{sunucu.server_address[1]}"

# YANLIŞ: yönlendirme kendiliğinden izlendi
assert urllib.request.urlopen(f"{taban}/onizleme", timeout=5).read() == b"IC-VERI"


# DOĞRU: yönlendirme izlenmez; yeni adres istenirse baştan adres_denetle'den geçer
class YonlendirmeYok(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args: object, **kwargs: object) -> None:
        return None


acici = urllib.request.build_opener(YonlendirmeYok)
try:
    acici.open(f"{taban}/onizleme", timeout=5)
    raise AssertionError("yönlendirme izlenmemeliydi")
except urllib.error.HTTPError as hata:  # TEST: iç veri gelmedi, 302 elimizde
    assert hata.code == 302 and hata.headers["Location"].endswith("/ic")
finally:
    sunucu.shutdown()
    sunucu.server_close()
print("tamam")
```

```cikti
tamam
```

`build_opener` `file://` ve `ftp://` işleyicilerini de ekler: şema denetimini (`adres_denetle`) atlamayın.

**DNS yeniden bağlama (rebinding):** "önce denetle, sonra iste" iki ayrı DNS çözümlemesidir. Saldırganın DNS
sunucusu ilk sorguya dış bir IP, ikinci sorguya (ömrü sıfır kayıtla) `127.0.0.1` verir; denetim geçer, bağlantı
içeri gider. Çözüm: **bir kez çöz, denetlenen IP'ye bağlan**; HTTP'de `Host` başlığını, HTTPS'te SNI ve sertifika
doğrulamasını özgün ada göre yap. Gösterim (ağ ister, çalıştırılmadı):

```python
import http.client
import socket
import ssl


class SabitIPBaglantisi(http.client.HTTPSConnection):
    """Denetlenmiş IP'ye bağlanır; sertifikayı yine özgün ada göre doğrular."""

    def __init__(self, ad: str, ip: str, kapi: int = 443, zaman_asimi: float = 5.0) -> None:
        super().__init__(ad, kapi, timeout=zaman_asimi)
        self._ip = ip

    def connect(self) -> None:
        ham = socket.create_connection((self._ip, self.port), self.timeout)
        self.sock = ssl.create_default_context().wrap_socket(ham, server_hostname=self.host)


ad, kapi, ipler = adres_denetle(kullanici_adresi)  # yukarıdaki işlev
baglanti = SabitIPBaglantisi(ad, ipler[0], kapi)
```

Bunu her özellikte elle yapmak yerine dış istekleri bir **çıkış vekilinden** geçirmek (vekil IP politikasını
bağlantı anında uygular) birden çok özellik varsa daha sağlamdır.

## Getirme kuralları (adres geçtikten sonra)

| Kural                                                     | Neden                                                                 |
| --------------------------------------------------------- | --------------------------------------------------------------------- |
| Bağlantı ve toplam süre sınırı (ör. 3 sn + 10 sn)          | Yavaş yanıtla işçileri kilitleme; süre farkıyla tarama                |
| Yanıt boyutu sınırı (`read(azami + 1)` ile sayın)          | Bellek tüketimi; sonsuz akış                                          |
| İçerik türü izin listesi (önizlemede `text/html`, görselde `image/*`) | Beklenmeyen içeriği işlememe                               |
| Yönlendirme yok ya da en çok 3 ve **her adımda** denetim  | Yönlendirmeyle içeri sızma                                            |
| Kendi çerezlerinizi, `Authorization` başlığınızı göndermeyin | Kullanıcı adresine kimlik bilgisi sızar                             |
| Kullanıcıya ham yanıt ve ham hata iletisi göstermeyin      | İç ağdan veri ve ağ yapısı sızar; "getirilemedi" yeter                |
| İsteği ayrı bir işçide/kapsayıcıda yapın                   | İç ağa ve sırlara erişimi olmayan bir süreç, hatanın etkisini daraltır |

Bulut sağlayıcısının üst veri hizmetinde oturum belirteci zorunluluğunu açın (AWS'de IMDSv2 gibi); bu, tek bir
GET ile anahtar sızmasını zorlaştırır ama uygulama denetiminin yerini tutmaz.

## Webhook'a özgü

- Hedef adres kayıtta ve **her gönderimde** denetlenir; başarısız gönderimler geri çekilmeyle (backoff) sınırlı
  sayıda yinelenir, sonra webhook kapatılır.
- Gönderim içeriği imzalanır (alıcı doğrulasın); imza ve yeniden deneme ayrıntısı:
  [Webhooklar](../30-arkauc/webhooklar.md).
- Yanıt gövdesi saklanmaz ya da kısaltılarak saklanır; müşteriye yalnız durum kodu gösterilir.

## Tuzaklar

| Belirti                                                              | Neden                                                          | Çözüm                                                               |
| -------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------- |
| Önizleme `http://127.1/` ya da ondalık yazılmış IP ile iç sayfayı getiriyor | Ad dizge olarak denetlenmiş                              | `getaddrinfo` ile çöz, IP'yi `ipaddress` ile denetle                |
| Denetim geçiyor ama istek iç adrese gidiyor                          | İstemci yönlendirmeyi izledi                                    | Yönlendirme kapalı ya da her adımda yeniden denetim                 |
| Ara sıra iç adrese istek atılıyor                                    | DNS yeniden bağlama: denetim ve bağlantı ayrı çözümleme         | Denetlenen IP'ye bağlan; ya da çıkış vekili                          |
| Sunucu dosyası önizlemede göründü                                    | `file://` şeması açık (`urlopen` destekler)                    | Şema izin listesi: yalnız `http`/`https`                            |
| `224.0.0.1` ya da `64:ff9b::…` denetimden geçiyor                    | Yalnız `is_global`'a bakıldı                                    | Çok noktaya yayın reddi, IPv4 eşlemeli ve NAT64 adreslerini aç       |
| Bulut anahtarları çalındı                                            | Üst veri hizmetine erişim; uygulama bulut rolüyle çalışıyor    | IP denetimi + IMDS belirteç zorunluluğu + rolün yetkisini daraltma   |
| Webhook hedefi kaydedilirken geçti, aylar sonra iç adrese gidiyor     | Yalnız kayıtta denetlendi; DNS değişti                         | Her gönderimde denetim                                              |
| HTML'den PDF üretimi iç ağdaki sayfayı belgeye gömdü                  | Tarayıcı motoru belgedeki kaynakları getirdi                   | Ağsız korumalı alan ya da sıkı vekil; kullanıcı HTML'ini temizleyin |
| İşçiler kilitlendi, kuyruk büyüdü                                    | Süre ve boyut sınırı yok                                       | Bağlantı/toplam süre ve bayt sınırı                                  |

## Denetim listesi

- [ ] Kullanıcı adresine istek atan her özellik listelendi (önizleme, webhook, içe aktarma, PDF, ajan aracı…).
- [ ] Şema yalnız `http`/`https`; kapı izin listesinde; ad çözülüp **her** IP `izinli_ip`'den geçiyor.
- [ ] Bağlantı denetlenen IP'ye kuruluyor ya da bütün dış istekler çıkış vekilinden geçiyor.
- [ ] Yönlendirme kapalı ya da her adımda yeniden denetleniyor.
- [ ] Süre, boyut ve içerik türü sınırı var; kullanıcıya ham yanıt/hata gösterilmiyor.
- [ ] İstekler sırlara ve iç ağa erişimi olmayan bir işçide/kapsayıcıda çalışıyor.
- [ ] Testte `127.1`, `localhost`, `[::ffff:127.0.0.1]`, `169.254.169.254`, `10.0.0.5`, `file://`, yerel sunucuya
      302 yönlendirmesi reddediliyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Kullanıcı adresine istek atmadan önce `adres_denetle` ile şema, kapı ve çözülmüş IP'leri
  denetle; yönlendirmeyi izleme; 5 sn süre ve 1 MB boyut sınırı koy; yanıtın yalnız başlık ve açıklamasını
  döndür. Testte yerel bir `http.server` ile 302 yönlendirmesi ve `127.1` adresini dene."
- **Modelin tipik hatası:** `if 'localhost' in url` gibi dizge denetimi; yalnız `is_private`'a bakmak; doğrulamayı
  yapıp `requests.get(url)` ile **yeniden çözümleyen** istemciyle istemek; yönlendirmeyi açık bırakmak; hata
  iletisini olduğu gibi kullanıcıya döndürmek.
- **Çıktıda denetleyin:** `urlopen(`, `requests.get(`, `fetch(`, `httpx.get(` çağrılarına kullanıcı verisi ulaşıyor
  mu; `allow_redirects`/`follow_redirects`/`redirect: 'manual'` ayarı; süre sınırı var mı.
- **Test isteyin:** yukarıdaki iki çalışan bloğu proje testine çevirin; her yeni "adresten getir" özelliği bu
  testlerden geçsin.

## İlgili

- Yapay zekâ ajanının "sayfa getir" aracı da bu kurallara uyar: [YZ uygulama güvenliği](yapay-zeka-uygulama-guvenligi.md)
- Dosya olarak gelen içerik: [Dosya yükleme](dosya-yukleme-guvenligi.md) · XML dış varlıkları:
  [OWASP özeti](owasp-ozet.md) → küçük sınıflar
- Uygulamanın dış isteği yalnız e-posta sağlayıcısına (sabit adres, yapılandırmadan) gider:
  [`uygulama/api/src/mail/mailer.ts`](../../uygulama/api/src/mail/mailer.ts)
