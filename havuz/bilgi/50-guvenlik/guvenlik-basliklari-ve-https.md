---
baslik: Güvenlik başlıkları ve HTTPS
ozet: HTTPS'in neden şart olduğu, HSTS'i adım adım açmak, CSP, nosniff, Referrer-Policy, Permissions-Policy ve çerçeve yasağının anlamı; başlıkların nereye yazılacağı ve bir yanıtı denetleyen çalışan betik.
etiketler: [guvenlik, http, https, hsts, csp, basliklar]
duzey: temel
guncellik: 2026-11
---

# Güvenlik başlıkları ve HTTPS

> Bu notu ne zaman okumalı: bir uygulama ya da statik site yayına alınırken; ters vekil, CDN ya da barındırıcı
> değiştirilirken; tarayıcı konsolunda "mixed content", "Refused to frame", CSP uyarısı görüldüğünde; bir model
> güvenlik başlığı eklemeyi önerdiğinde (eski ve zararlı başlıkları ayıklamak için).

## Temel fikir

Güvenlik başlıkları tarayıcıya "bu sayfa için şu kuralları uygula" der: yalnız HTTPS, yalnız şu kaynaklardan
betik, başka siteye çerçevelenme yok, içerik türünü tahmin etme. Neredeyse bedavadır ve tek tek açıkların
etkisini daraltır; ama **kod hatasını düzeltmez**. XSS'i kaçış önler, CSP yalnız kaçışın unutulduğu yerde son
kattır.

**HTTPS tartışmasız şarttır:** HTTP'de araya giren herkes (ortak Wi-Fi, ağ sağlayıcısı) trafiği okur ve
**değiştirir** (sayfaya betik ekler). `Secure` çerez, servis çalışanı (PWA), kamera/mikrofon/konum gibi tarayıcı
yetenekleri yalnız güvenli bağlamda çalışır. Yayında her HTTP isteği kalıcı yönlendirmeyle (301/308) HTTPS'e
gider ve HSTS tarayıcıya bunu hatırlatır.

## Karar tablosu: başlıklar

| Başlık                                    | Önerilen değer                                         | Ne yapar / dikkat                                                                    |
| ----------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `Strict-Transport-Security`               | `max-age=31536000` (kademeli açın, aşağıda)            | Tarayıcı bu alana bir yıl yalnız HTTPS ile gider; ilk ziyaret korunmaz               |
| `Content-Security-Policy`                 | Uygulamaya göre; [XSS ve CSP](xss-ve-csp.md)           | Betik/stil/bağlantı kaynakları; `frame-ancestors 'none'` çerçeve yasağı               |
| `X-Content-Type-Options`                  | `nosniff`                                              | Tarayıcı türü tahmin etmez: "resim" diye gelen HTML çalışmaz                         |
| `Referrer-Policy`                         | `strict-origin-when-cross-origin`; belirteçli sayfada `no-referrer` | Adresteki belirteç ve yol başka siteye gitmesin                         |
| `Permissions-Policy`                      | Kullanmadığınız her şeye `()`                          | Kamera, mikrofon, konum, ödeme… enjekte edilmiş betik de kullanamaz                  |
| `X-Frame-Options`                         | `DENY`                                                 | Eski tarayıcılar için; yenisi `frame-ancestors`                                      |
| `Cross-Origin-Opener-Policy`              | `same-origin`                                          | Başka kökenden açılan pencere sizinkine erişemez                                     |
| `Cross-Origin-Resource-Policy`            | API ve özel dosyalarda `same-origin`                   | Başka siteler kaynağınızı gömemez                                                    |
| `Cache-Control`                           | Kişisel yanıtta `no-store`                             | Paylaşılan önbellek ve "geri" tuşu kişisel veriyi göstermesin                        |
| `Content-Type`                            | Her yanıtta, metinde `charset=utf-8`                   | Türü olmayan/yanlış yanıt tahmine kalır                                              |

Eklemeyin ya da kaldırın:

| Başlık                       | Neden                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| `X-XSS-Protection: 1`        | Eski tarayıcı süzgeci kendisi açık üretiyordu; ya hiç yazmayın ya da `0` yazın         |
| `Public-Key-Pins` (HPKP)     | Tarayıcılardan kaldırıldı; yanlış ayar sitenizi aylarca erişilmez yapabilirdi         |
| `Expect-CT`                  | Artık anlamsız                                                                        |
| `X-Powered-By`, sürümlü `Server` | Saldırgana hangi yazılım ve sürümü hedefleyeceğini söyler                         |

Havuzdaki uygulamanın değerleri ve gerekçeleri: [`securityHeaders.ts`](../../uygulama/api/src/http/securityHeaders.ts)
ve [`uygulama/docs/GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md) → "Güvenlik başlıkları".

## HSTS'i kademeli açmak

HSTS geri alınması zor bir sözdür: tarayıcı `max-age` boyunca HTTP'yi denemez, sertifika bozulursa kullanıcı
uyarıyı geçemez. Bu yüzden kısa süreyle (`max-age=300`) başlanır, sorunsuz geçen her aşamada uzatılır
(bir gün → bir yıl); `includeSubDomains` yalnız **bütün** alt alan adları HTTPS ise, `preload` en son ve kalıcı
bir karar olarak eklenir. Aşama tablosu ve geçiş koşulları: [HTTPS ve sertifikalar → HSTS'e geçiş](../60-devops/https-ve-sertifikalar.md).
Havuzdaki uygulama üretimde `max-age=31536000` gönderir, `includeSubDomains` ve `preload`'u bilinçli olarak eklemez.

HSTS yalnız HTTPS yanıtında geçerlidir. Geliştirmede (`localhost`) göndermeyin: HSTS kapıya değil ana makineye
bağlıdır; tarayıcı aynı makinedeki öteki projeleri de HTTPS'e zorlayabilir.

## Başlıklar nereye yazılır

| Yer                                  | Ne zaman                                   | Dikkat                                                                        |
| ------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------- |
| Uygulama ara katmanı                 | Uygulama kendi sunuyorsa (havuzdaki API)    | Testle korunur; her yanıta, hata yanıtları dahil                              |
| Ters vekil (nginx, Caddy)            | Birden çok uygulama aynı kuralı paylaşıyorsa | Uygulamayla **aynı başlığı ikisi birden** yazmasın                           |
| Statik barındırıcı (`_headers`)      | Statik site                                 | Örnek: [`site/docs/yayin/_headers`](../../site/docs/yayin/_headers); bazı barındırıcılar okumaz (GitHub Pages) |
| HTML `<meta http-equiv>`             | Başka yol yoksa, yalnız CSP için            | `frame-ancestors`, `sandbox`, rapor ayarları meta ile çalışmaz; HSTS hiç olmaz |

İki ayrı `Content-Security-Policy` başlığı gelirse tarayıcı **ikisini birden** uygular (kesişim): vekil ve uygulama
ayrı politikalar yazınca site beklenmedik biçimde bozulur. Tek yer seçin.

## Bir yanıtın başlıklarını denetlemek

Aşağıdaki betik bir yanıtın başlıklarını kurallarla karşılaştırır; gösterim için iki yerel sunucu açar (biri kötü,
biri iyi ayarlı). Gerçek kullanımda `getir` yerine kendi adresinizi (`https://alanadi/`, `…/api/health`) verin.

```python calistir
import re
import threading
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def yonerge(csp: str, ad: str) -> list[str] | None:
    for parca in csp.split(";"):
        kelimeler = parca.strip().split()
        if kelimeler and kelimeler[0].lower() == ad:
            return kelimeler[1:]
    return None


def denetle(b: dict[str, str]) -> list[str]:
    sorunlar = []
    yas = re.search(r"max-age=(\d+)", b.get("Strict-Transport-Security", ""))
    if not yas or int(yas.group(1)) < 15_552_000:
        sorunlar.append("HSTS yok ya da max-age 180 günden kısa")
    csp = b.get("Content-Security-Policy")
    if csp is None:
        sorunlar.append("CSP yok" + (" (yalnız Report-Only)" if "Content-Security-Policy-Report-Only" in b else ""))
    else:
        betik = yonerge(csp, "script-src") or yonerge(csp, "default-src") or ["*"]
        if any(k in betik for k in ("'unsafe-inline'", "'unsafe-eval'", "*", "data:", "https:")):
            sorunlar.append("CSP betik kaynağı gevşek")
        if yonerge(csp, "frame-ancestors") is None and "X-Frame-Options" not in b:
            sorunlar.append("çerçeveye konma serbest")
        if (yonerge(csp, "object-src") or yonerge(csp, "default-src")) != ["'none'"]:
            sorunlar.append("object-src 'none' değil")
    if b.get("X-Content-Type-Options", "").lower() != "nosniff":
        sorunlar.append("nosniff yok")
    if b.get("Referrer-Policy", "").lower() in ("", "unsafe-url", "no-referrer-when-downgrade"):
        sorunlar.append("Referrer-Policy yok ya da gevşek")
    if "Permissions-Policy" not in b:
        sorunlar.append("Permissions-Policy yok")
    if "X-Powered-By" in b or re.search(r"\d", b.get("Server", "")):
        sorunlar.append("sunucu yazılımı/sürümü sızıyor")
    tur = b.get("Content-Type", "")
    if tur.startswith("text/") and "charset" not in tur:
        sorunlar.append("metin yanıtında charset yok")
    return sorunlar


def getir(basliklar: dict[str, str], surum_gizle: bool) -> dict[str, str]:
    class Isleyici(BaseHTTPRequestHandler):
        if surum_gizle:
            server_version, sys_version = "uygulama", ""

        def do_GET(self) -> None:
            self.send_response(200)
            for ad, deger in basliklar.items():
                self.send_header(ad, deger)
            self.end_headers()
            self.wfile.write(b"<p>merhaba</p>")

        def log_message(self, *args: object) -> None:
            pass

    sunucu = ThreadingHTTPServer(("127.0.0.1", 0), Isleyici)
    threading.Thread(target=sunucu.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True).start()
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{sunucu.server_address[1]}/", timeout=5) as yanit:
            return dict(yanit.headers.items())
    finally:
        sunucu.shutdown()
        sunucu.server_close()


KOTU = {"Content-Type": "text/html", "Strict-Transport-Security": "max-age=600",
        "Content-Security-Policy-Report-Only": "default-src *", "X-Powered-By": "Express", "Referrer-Policy": "unsafe-url"}
IYI = {"Content-Type": "text/html; charset=utf-8", "Strict-Transport-Security": "max-age=31536000",
       "Content-Security-Policy": "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
       "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin",
       "Permissions-Policy": "camera=(), microphone=(), geolocation=()", "Cross-Origin-Opener-Policy": "same-origin"}

for sorun in denetle(getir(KOTU, surum_gizle=False)):  # Python'un http.server'ı varsayılan olarak sürüm yazar
    print(sorun)
assert denetle(getir(IYI, surum_gizle=True)) == []  # TEST: iyi ayar temiz geçer
```

```cikti
HSTS yok ya da max-age 180 günden kısa
CSP yok (yalnız Report-Only)
nosniff yok
Referrer-Policy yok ya da gevşek
Permissions-Policy yok
sunucu yazılımı/sürümü sızıyor
metin yanıtında charset yok
```

Bu denetimi yayın sonrası duman testine ve önizleme dağıtımlarına koyun; vekil ya da barındırıcı değişince
başlıkların sessizce kaybolmasını yakalar. Uygulama içinde aynı işi birim test yapar:
[`security.test.ts`](../../uygulama/api/test/security.test.ts) → "günlük ve başlıklar".

## HTTPS'in pratik ayrıntıları

Sertifika türleri, otomatik yenileme (ACME), eksik ara sertifika ve karma içerik:
[HTTPS ve sertifikalar](../60-devops/https-ve-sertifikalar.md). Güvenlik açısından üç kural:

- Uygulama vekilin arkasında düz HTTP konuşuyorsa "istek HTTPS miydi" bilgisini vekilin başlığından
  (`X-Forwarded-Proto`) okur; bu başlığa yalnız güvenilen vekil sayısı kadar güvenilir (havuzda `TRUST_PROXY`;
  [Ters vekil](../60-devops/ters-vekil.md)). Yanlışsa `Secure` çerez, köken denetimi ve yönlendirmeler bozulur.
- Elle yenilenen sertifika bir gün unutulur; yenileme otomatik ve bitiş tarihi izlenir.
- Sunucudan dışarı istekte (API çağrısı) sertifika doğrulaması **kapatılmaz** ([Kriptografi kullanımı](kriptografi-kullanimi.md)).

## Tuzaklar

| Belirti                                                         | Neden                                                           | Çözüm                                                             |
| --------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| Sertifika sorunu sonrası site günlerce açılmıyor                | Uzun HSTS + `includeSubDomains`/`preload` erken açıldı           | Kademeli açma; alt alanlar hazır olmadan `includeSubDomains` yok  |
| `localhost`'taki başka proje zorla HTTPS'e gidiyor               | Geliştirmede HSTS gönderildi                                    | HSTS yalnız üretimde                                              |
| Başlıklar yerelde var, yayında yok                              | Vekil/barındırıcı başlıkları atıyor ya da `_headers` okunmuyor   | Yayın sonrası başlık denetimi                                     |
| Site bazı sayfalarda bozuk, konsolda CSP ihlali                 | Vekil ve uygulama ayrı CSP yazıyor (kesişim)                    | Tek yer                                                           |
| Sitenin şeffaf bir kopyası başka sitede çerçeve içinde açılıyor  | `frame-ancestors` / `X-Frame-Options` yok                       | `frame-ancestors 'none'` (+ `X-Frame-Options: DENY`)              |
| Profil resmi diye yüklenen dosya HTML olarak çalışıyor           | `nosniff` yok, tür tahmin edildi                                | `nosniff` + doğru `Content-Type`                                  |
| Sıfırlama bağlantısındaki belirteç dış sitenin günlüğünde        | `Referer` başlığı tam adresi taşıdı                             | Belirteçli sayfada `Referrer-Policy: no-referrer`                 |
| Model `X-XSS-Protection: 1; mode=block` ekledi                  | Eski önerilerden ezber                                          | Kaldırın ya da `0`                                                |

## Denetim listesi

- [ ] HTTP istekleri kalıcı yönlendirmeyle HTTPS'e gidiyor; karma içerik yok; sertifika otomatik yenileniyor.
- [ ] HSTS üretimde, kademeli açıldı; `includeSubDomains` ve `preload` bilinçli karar.
- [ ] CSP uygulama kipinde ve gevşek değil; `frame-ancestors`, `object-src 'none'`, `base-uri` var.
- [ ] `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` her yanıtta (hata yanıtları dahil).
- [ ] Kişisel yanıtlarda `Cache-Control: no-store`; metin yanıtlarında `charset=utf-8`.
- [ ] `X-Powered-By` ve sürümlü `Server` yok; `X-XSS-Protection: 1`, HPKP, `Expect-CT` yok.
- [ ] Başlıklar tek yerde yazılıyor; yayın sonrası denetim betiği ya da testi çalışıyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Güvenlik başlıklarını yalnız `securityHeaders.ts`'te değiştir; vekilde ya da başka ara
  katmanda yineleme. CSP'ye `'unsafe-inline'`/`'unsafe-eval'` ekleme; dış kaynak gerekiyorsa yalnız o kökeni ilgili
  yönergeye ekle. HSTS'i geliştirmede gönderme."
- **Modelin tipik hatası:** eski başlık listelerini kopyalamak (`X-XSS-Protection: 1`, HPKP); CSP ihlalini gevşeterek
  "çözmek"; HSTS'e hemen `includeSubDomains; preload` yazmak; aynı başlığı hem vekilde hem uygulamada ayarlamak.
- **Çıktıda denetleyin:** `unsafe-`, `*`, `preload`, `X-XSS-Protection`, `Public-Key-Pins`; başlığın kaç yerde
  ayarlandığı.
- **Test isteyin:** yukarıdaki `denetle` işlevini yayın sonrası adımda gerçek adrese karşı çalıştıran bir betik ve
  uygulamada "API yanıtında sıkı CSP, nosniff, HSTS yalnız üretimde" birim testi.

## İlgili

- CSP'nin kurulumu: [XSS ve CSP](xss-ve-csp.md) · Çerezler: [Oturum güvenliği](oturum-guvenligi.md) · Kullanıcı
  dosyası sunma başlıkları: [Dosya yükleme](dosya-yukleme-guvenligi.md)
- Önbellek başlıkları ve CORS: [HTTP temelleri](../30-arkauc/http-temelleri.md) · Sertifika ve vekil:
  [HTTPS ve sertifikalar](../60-devops/https-ve-sertifikalar.md), [Ters vekil](../60-devops/ters-vekil.md),
  [Durağan site yayını](../60-devops/duragan-site-yayini.md)
- Çalışan kod: [`uygulama/api/src/http/securityHeaders.ts`](../../uygulama/api/src/http/securityHeaders.ts);
  statik site örneği [`site/docs/yayin/_headers`](../../site/docs/yayin/_headers)
