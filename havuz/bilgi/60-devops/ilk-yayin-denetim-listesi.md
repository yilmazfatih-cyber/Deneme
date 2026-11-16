---
baslik: İlk yayın denetim listesi
ozet: Bir uygulamayı ilk kez yayına alırken sırayla izlenecek tek sayfalık liste: karar, alan adı, HTTPS, ortam ve sırlar, veritabanı ve yedek, izleme, geri alma planı, yayın günü duman testi.
etiketler: [yayin, denetim-listesi, devops, ilk-yayin]
duzey: temel
guncellik: 2026-11
---

# İlk yayın denetim listesi

> Bu notu ne zaman okumalı: ilk gerçek kullanıcıdan **bir hafta önce**; bir uygulamayı yeni bir barındırıcıya
> taşırken; küçük modelden "yayına al" istemeden önce. Yukarıdan aşağı, sırayla.

## Temel fikir

Sıra önemlidir: HTTPS alan adına, izleme HTTPS'e, geri alma planı yedeğe dayanır. Her madde bir **kanıtla** biter
(komut çıktısı, ekran, denenmiş adım); kanıtı olmayan madde yapılmamış sayılır. Listeyi önce sahte veriyle, gerçek
barındırıcıda bir kez baştan sona yürütün: ilk yayın günü sürpriz yaşanmasın.

Havuzdaki temellerin kendi listeleri bunun ayrıntısıdır: uygulama için
[`GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md) → yayın öncesi denetim listesi, site için
[`site/docs/YAYINLAMA.md`](../../site/docs/YAYINLAMA.md) → "Yayından önce denetim listesi". Güvenlik maddeleri
[Yayın öncesi güvenlik denetimi](../50-guvenlik/yayin-oncesi-guvenlik-denetimi.md), ürün ve duyuru maddeleri
[Lansman](../95-urun/lansman.md) notundadır; bu liste altyapı ve işletme tarafıdır.

## 0. Karar

- [ ] Uygulamanın türü (durağan / sunuculu / veritabanlı) ve barındırma seçimi gerekçesiyle `docs/KARARLAR.md`'de
      ([Yayın yolu seçimi](yayin-yolu-secimi.md)).
- [ ] Bölge kullanıcılara yakın; uygulama ile veritabanı aynı bölgede.
- [ ] Kaç kopya çalışacağı belli (SQLite ise tek).
- [ ] Plan, fiyat ve sınırlar sağlayıcının güncel sayfasından okundu; kullanım tablosu çıkarıldı
      ([Maliyet](maliyet-ve-kaynak.md)); bütçe uyarısı açık.

## 1. Alan adı ve DNS

- [ ] Alan adı barındırıcıdan bağımsız kayıt firmasında; otomatik yenileme, iki adımlı doğrulama, transfer kilidi açık.
- [ ] Asıl adres seçildi (`ornek.com` ya da `www.ornek.com`); öteki ona 301 ile yönlenecek.
- [ ] Kayıtlar tablo olarak yazıldı ve denetleyiciden geçti; kökte CNAME yok
      ([Alan adı ve DNS](alan-adi-ve-dns.md)).
- [ ] Taşıma varsa TTL bir gün önceden düşürüldü.
- [ ] E-posta gönderiliyorsa SPF (tek kayıt), DKIM, DMARC kuruldu; test iletisi spam'e düşmüyor.
- [ ] Kanıt: `dig @<yetkili sunucu> +short A ornek.com` beklenen adresi veriyor.

## 2. HTTPS

- [ ] Sertifika otomatik (platform ya da Caddy/certbot); her ad (kök, `www`) kapsanıyor.
- [ ] HTTP istekleri HTTPS'e yönleniyor: `curl -sI http://ornek.com` → `301`, `Location: https://…`.
- [ ] Tam zincir gönderiliyor: `curl -v https://ornek.com` hatasız; bir mobil cihazda da açıldı.
- [ ] Sertifika süresi dışarıdan izleniyor; HSTS kısa süreyle başladı ([HTTPS ve sertifikalar](https-ve-sertifikalar.md)).
- [ ] Vekil arkasındaysa `TRUST_PROXY` vekil sayısına eşit; iki farklı ağdan girişte günlükteki IP'ler farklı
      ([Ters vekil](ters-vekil.md)).

## 3. Ortam ve sırlar

- [ ] Bütün ayarlar platformun ortam/sır ayarında; depoda yalnız `.env.example` ([Ortam ve yapılandırma](ortam-ve-yapilandirma.md)).
- [ ] Üretim ayarları: `NODE_ENV=production`, `APP_URL` `https://` ile, `DATABASE_PATH` kalıcı diskte, hız sınırı açık
      (havuzdaki uygulamanın tablosu: [`YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md) → "Ortam değişkenleri").
- [ ] Eksik ayarla uygulama başlamıyor (bir değişkeni silip denendi, ileti okundu, geri eklendi).
- [ ] Ön yüz değişkenlerinde (`VITE_*`, `PUBLIC_*`) sır yok.
- [ ] Yönetici hesabı yalnız sizin e-postanız; parola güçlü ve başka yerde kullanılmıyor.

## 4. Veritabanı ve yedek

- [ ] Yeniden başlatma testi: kayıt ekle → yeniden dağıt → kayıt duruyor ([Yayın yolu](yayin-yolu-secimi.md)).
- [ ] Gece yedeği tutarlı yöntemle alınıyor, bütünlüğü denetleniyor, sunucu dışında ve şifreli duruyor
      ([Veritabanı yedekleme](veritabani-yedekleme.md)).
- [ ] **Geri yükleme bir kez denendi**: süre ve kayıp penceresi not edildi.
- [ ] Yedek tazeliği izleniyor (en yeni yedek 26 saatten eskiyse uyarı).
- [ ] Gizlilik metni hangi verinin ne kadar saklandığını (yedekler dahil) söylüyor.

## 5. İzleme

- [ ] Sağlık ucu dışarıdan, birkaç dakikada bir, başka bir yerden yoklanıyor; uyarı telefona geliyor
      ([İzleme ve uyarı](izleme-ve-uyari.md)).
- [ ] Uygulama bir kez bilerek durduruldu; uyarı beklenen sürede geldi ve "düzeldi" haberi de geldi.
- [ ] Günlükler platformda okunabiliyor; JSON, istek kimlikli, sır ve kişisel veri yok.
- [ ] Disk doluluğu ve bellek/yeniden başlatma sayısı görülebiliyor.

## 6. Geri alma planı

- [ ] Önceki sürümü yeniden yayına almanın komutu ya da düğmesi yazılı ve bir kez denendi
      ([Dağıtım stratejileri](dagitim-stratejileri.md)).
- [ ] Bu yayındaki geri alınamayan adımlar listelendi (sütun silme, toplu e-posta).
- [ ] Yayın iş akışı denetimden geçmeden yayın yapmıyor; üretim dağıtımı onay adımlı ([CI/CD](ci-cd.md)).
- [ ] Bir şey ters giderse kime, nasıl haber verileceği belli; olay notu şablonu hazır
      ([Olay sonrası değerlendirme](olay-sonrasi-degerlendirme.md)).

## 7. Yayın günü: duman testi

Yayından hemen sonra, kendi makinenizden. Gerçek kullanımda son satırlar yerine
`print(duman_testi("https://ornek.com"))` yazılır; aşağıda yerel bir sahte siteyle, iki kusuru açıp kapatarak
denenmiştir:

```python calistir
import json
import threading
import urllib.error
import urllib.request
from email.message import Message
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def durum(adres: str) -> tuple[int, Message, bytes]:
    """Başlıklar Message nesnesi olarak kalır: adlar büyük/küçük harf duyarsız aranır (dict DEĞİL)."""
    try:
        with urllib.request.urlopen(adres, timeout=5) as yanit:
            return yanit.status, yanit.headers, yanit.read()
    except urllib.error.HTTPError as hata:
        return hata.code, hata.headers, b""


def duman_testi(taban: str) -> list[str]:
    sorunlar = []
    try:
        kod, basliklar, govde = durum(taban + "/api/health")
    except OSError as hata:
        return [f"sağlık ucuna ulaşılamadı: {hata}"]
    try:
        saglik = json.loads(govde or b"{}")
    except ValueError:
        saglik = {}
    if kod != 200 or saglik.get("ok") is not True:
        sorunlar.append(f"sağlık ucu {kod}, ok={saglik.get('ok')}")
    if "version" not in saglik:
        sorunlar.append("sağlık ucu sürüm döndürmüyor: hangi sürümün yayında olduğu bilinmez")
    if basliklar.get("Cache-Control") != "no-store":
        sorunlar.append("API yanıtında 'Cache-Control: no-store' yok")
    kod, basliklar, _ = durum(taban + "/")
    for ad in ("Content-Security-Policy", "X-Content-Type-Options", "Strict-Transport-Security"):
        if ad not in basliklar:
            sorunlar.append(f"ana sayfada {ad} başlığı yok")
    if "no-cache" not in basliklar.get("Cache-Control", ""):
        sorunlar.append("index.html 'no-cache' değil: yayından sonra eski sürüm görünür")
    if durum(taban + "/assets/olmayan-eski-parca.js")[0] != 404:
        sorunlar.append("eksik JS dosyası 404 dönmüyor: yayından sonra açık sekmeler kırılır")
    for gizli in ("/.env", "/.git/config", "/uygulama.db"):
        if durum(taban + gizli)[0] == 200:
            sorunlar.append(f"{gizli} herkese açık")
    return sorunlar


KUSURLU = {"acik": True}


class SahteSite(BaseHTTPRequestHandler):  # yayındaki sitenin yerine; iki kusuru açılıp kapatılabilir
    def do_GET(self):
        guvenlik = {"Content-Security-Policy": "default-src 'self'", "X-Content-Type-Options": "nosniff",
                    "Strict-Transport-Security": "max-age=300"}
        if self.path == "/api/health":  # bazı sunucular başlık adını küçük harfle yollar
            self.yaz(200, b'{"ok": true, "version": "1.4.0"}', {"cache-control": "no-store", **guvenlik})
        elif self.path == "/":
            onbellek = "max-age=86400" if KUSURLU["acik"] else "no-cache"
            self.yaz(200, b"<!doctype html>", {"Cache-Control": onbellek, **guvenlik})
        elif self.path == "/.env" and KUSURLU["acik"]:
            self.yaz(200, b"MAIL_HTTP_KEY=...", guvenlik)
        else:
            self.yaz(404, b"", guvenlik)

    def yaz(self, kod: int, govde: bytes, basliklar: dict[str, str]) -> None:
        self.send_response(kod)
        for ad, deger in basliklar.items():
            self.send_header(ad, deger)
        self.send_header("Content-Length", str(len(govde)))
        self.end_headers()
        self.wfile.write(govde)

    def log_message(self, *args):
        pass


sunucu = ThreadingHTTPServer(("127.0.0.1", 0), SahteSite)
threading.Thread(target=sunucu.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True).start()
taban = f"http://127.0.0.1:{sunucu.server_address[1]}"
for sorun in duman_testi(taban):
    print("✗", sorun)
KUSURLU["acik"] = False
assert duman_testi(taban) == []
sunucu.shutdown()
sunucu.server_close()
assert duman_testi(taban)[0].startswith("sağlık ucuna ulaşılamadı")
```

```cikti
✗ index.html 'no-cache' değil: yayından sonra eski sürüm görünür
✗ /.env herkese açık
```

Duman testinden sonra elle: kayıt ol → giriş yap → bir kayıt oluştur → çıkış yap → başka bir cihazdan gir; şifre
sıfırlama e-postası geliyor mu (spam klasörüne de bakın); telefonda açılıyor mu.

## 8. İlk hafta

- [ ] Her gün bir kez: hata oranı ve p95 süre, disk, bellek, yedek tazeliği.
- [ ] İlk uyarılar gözden geçirildi: gürültülü olanın eşiği ayarlandı.
- [ ] İlk fatura ya da kullanım ekranı kullanım tablosuyla karşılaştırıldı.
- [ ] Kullanıcıdan gelen ilk sorunlar için kısa olay notları yazıldı.

## Tuzaklar

| Belirti                                                       | Neden                                                    | Çözüm (not)                                                    |
| ------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------- |
| İlk hafta sonunda kullanıcılar ve kayıtlar yok                | Veritabanı geçici diskteydi                              | Kalıcı disk + yeniden başlatma testi ([Yayın yolu](yayin-yolu-secimi.md)) |
| Yayın günü sertifika alınamadı                                | DNS yayılmadı; `CAA`/`AAAA` yanlış; 80 kapalı            | DNS'i bir gün önce kurun ([HTTPS](https-ve-sertifikalar.md))   |
| Şifre sıfırlama e-postaları gelmiyor                          | E-posta sağlayıcısı ayarlanmadı ya da SPF/DKIM yok       | Sağlayıcı + DNS kayıtları; gerçek adrese deneme ([DNS](alan-adi-ve-dns.md)) |
| Bir kişinin hatalı girişleri herkesi kilitledi                | `TRUST_PROXY` yanlış: herkes vekilin IP'si               | Vekil sayısını yazın ([Ters vekil](ters-vekil.md))             |
| Kesintiyi kullanıcı haber verdi                               | Dışarıdan izleme yok                                     | Yoklama + uyarı ([İzleme](izleme-ve-uyari.md))                 |
| İlk hatalı sürüm geri alınamadı                               | Önceki sürümün kimliği ve komutu bilinmiyordu            | Geri alma planı ([Dağıtım](dagitim-stratejileri.md))           |
| Yedek vardı ama açılmadı                                      | Geri yükleme hiç denenmemişti                            | Tatbikat ([Yedekleme](veritabani-yedekleme.md))                |
| Yayından sonra herkes eski sürümü görüyor                     | `index.html` uzun önbellekte                             | `no-cache` ([Durağan site](duragan-site-yayini.md))            |
| `.env` dosyası siteden indirilebiliyor                        | Proje klasörü olduğu gibi sunuldu                        | Yalnız derleme çıktısını sunun; sırları yenileyin              |
| İlk ay fatura beklenenin katları                              | Çıkış trafiği ya da unutulan kaynak                      | Kullanım tablosu, bütçe uyarısı ([Maliyet](maliyet-ve-kaynak.md)) |

## Denetim listesi

Yayına "evet" demeden önceki son on madde; biri bile eksikse yayın ertelenir:

- [ ] Yeniden başlatma testi geçti: veri kalıcı.
- [ ] Geri yükleme bir kez denendi.
- [ ] HTTPS her adreste, HTTP yönleniyor, zincir tam.
- [ ] Üretim ayarları doğrulandı; eksik ayarla uygulama başlamıyor.
- [ ] Sırlar yalnız platformda; depoda ve ön yüz kodunda sır yok.
- [ ] Dışarıdan izleme ve telefona uyarı çalışıyor (denendi).
- [ ] Önceki sürüme dönüş komutu yazılı ve denendi.
- [ ] Duman testi bulgusuz.
- [ ] Kayıt, giriş, e-posta ve telefonda açılış elle denendi.
- [ ] Bütçe uyarısı açık.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu listeyi yukarıdan aşağı yürüt. Her madde için ya kanıtı (komut ve çıktısı) göster ya da
  'yapılmadı, şu nedenle' yaz. Bir maddeyi atlayıp sonrakine geçme; bir madde başarısızsa dur ve bana bildir."
- **Modelin tipik hatası:** maddeleri kanıtsız "tamam" işaretlemek; yeniden başlatma testini ve geri yükleme
  tatbikatını "gerek yok" diye atlamak; DNS yayılmadan sertifika adımına geçmek; duman testi başarısızken "küçük
  sorunlar" deyip yayına onay vermek.
- **Çıktıda denetleyin:** her işaretli maddenin yanında bir komut çıktısı ya da somut gözlem var mı; "denendi" yazan
  maddelerde ne zaman denendiği yazıyor mu.

## İlgili

- Kümenin bütün notları: [Yayın yolu](yayin-yolu-secimi.md) · [Linux](linux-temelleri.md) · [Docker](docker.md) ·
  [Docker Compose](docker-compose.md) · [CI/CD](ci-cd.md) · [Alan adı ve DNS](alan-adi-ve-dns.md) ·
  [HTTPS](https-ve-sertifikalar.md) · [Ters vekil](ters-vekil.md) · [Ortam ve yapılandırma](ortam-ve-yapilandirma.md) ·
  [Yedekleme](veritabani-yedekleme.md) · [İzleme](izleme-ve-uyari.md) · [Dağıtım](dagitim-stratejileri.md) ·
  [Durağan site](duragan-site-yayini.md) · [Mobil paketleme](mobil-paketleme.md) · [Maliyet](maliyet-ve-kaynak.md) ·
  [Olay sonrası](olay-sonrasi-degerlendirme.md)
- Çalışan karşılıklar: [`uygulama/docs/YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md),
  [`uygulama/docs/GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md), [`site/docs/YAYINLAMA.md`](../../site/docs/YAYINLAMA.md),
  [`render.ornek.yaml`](../../uygulama/render.ornek.yaml)
