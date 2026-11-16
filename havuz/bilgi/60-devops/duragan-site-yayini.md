---
baslik: Durağan site yayını
ozet: GitHub Pages, Netlify ve Cloudflare Pages kavramları; alt klasörde yayın ve taban yolu, hash ile history yönlendirme, SPA yedeği, önbellek başlıkları ve özel alan adı; havuzdaki örneklerle.
etiketler: [duragan-site, github-pages, spa, onbellek, alan-adi, devops]
duzey: temel
guncellik: 2026-11
---

# Durağan site yayını

> Bu notu ne zaman okumalı: bir siteyi ya da tek sayfalık uygulamayı (SPA, PWA) GitHub Pages, Netlify ya da
> Cloudflare Pages'e koyarken; "yerelde çalışıyor, yayında beyaz sayfa" durumunda; yenileyince 404 alınca; yayından
> sonra kullanıcılar eski sürümü görünce.

## Temel fikir

Durağan barındırma derleme çıktısındaki dosyaları (HTML, JS, CSS, görsel) olduğu gibi, çoğu zaman bir CDN'den
sunar. İstek anında sizin kodunuz çalışmaz. Bunun üç sonucu vardır:

1. **Sır yoktur:** tarayıcıya giden her şey herkese açıktır ([Ortam ve yapılandırma](ortam-ve-yapilandirma.md)).
2. **Ortam değişkeni yalnız derleme anında** okunur; değiştirmek yeniden derleme ister.
3. Dinamik görünen her şey (yönlendirme, form) ya derlemede üretilir, ya tarayıcıda çalışır, ya da bir dış servise
   gider.

Karşılığında bakım, güncelleme, yedek, ölçekleme derdi neredeyse yoktur. Köprü ve havuzdaki `site` böyle yayınlanır.

## Karar tablosu

| İhtiyaç                               | GitHub Pages                                    | Netlify / Cloudflare Pages                        |
| ------------------------------------- | ----------------------------------------------- | ------------------------------------------------- |
| Derleme nerede                        | GitHub Actions iş akışında                      | Platformun derleyicisi (ya da Actions)            |
| Özel yanıt başlığı (önbellek, güvenlik) | Yok                                           | `_headers` dosyası                                |
| Yönlendirme / yeniden yazma kuralı    | Yok; yalnız `404.html`                          | Kural dosyası (`_redirects` ya da yapılandırma)   |
| Her PR için önizleme adresi           | Yok (kendiniz kurarsınız)                       | Var                                               |
| Adres                                 | Proje sitesi alt klasörde: `kullanici.github.io/depo/` | Genelde kökte: `ad.netlify.app`, `ad.pages.dev` |
| Derlemeye değişken                    | Actions `vars` / `secrets`                      | Paneldeki ortam değişkenleri                      |

Tablo Kasım 2026'daki genel durumdur; sınırlar, ücretler ve yeni özellikler için platformun güncel belgesine bakın.
Seçim kuralı: başlık ve yönlendirme kuralı gerekmiyorsa ve kod zaten GitHub'daysa GitHub Pages en sade yoldur;
özel başlık, PR önizlemesi ya da yönlendirme kuralı gerekiyorsa Netlify/Cloudflare Pages.

## Alt klasörde yayın ve taban yolu

GitHub Pages proje sitesi `https://kullanici.github.io/depo/` adresindedir. `/` ile başlayan her yol alan adının
**köküne** gider; derleme aracı tabanı bilmiyorsa site beyaz sayfa açar.

```python calistir
from urllib.parse import urljoin, urlsplit

site = "https://kullanici.github.io/depo/"  # GitHub Pages proje sitesi: alt klasörde yayın

# Kök-göreli yol (/assets/…) alan adının KÖKÜNE gider: alt klasörde 404
assert urljoin(site, "/assets/app.js") == "https://kullanici.github.io/assets/app.js"
# Taban /depo/ ile derlenmiş yol doğru
assert urljoin(site, "/depo/assets/app.js") == "https://kullanici.github.io/depo/assets/app.js"
# Göreli taban (./) bulunduğu sayfaya göre çözülür: kök sayfada doğru…
assert urljoin(site, "./assets/app.js") == "https://kullanici.github.io/depo/assets/app.js"
# …ama history yönlendirmeli bir iç sayfa yenilenince yanlış klasöre gider
assert urljoin(site + "ayarlar/profil", "./assets/app.js") == "https://kullanici.github.io/depo/ayarlar/assets/app.js"
# Hash yönlendirmede iç sayfa sunucuya hiç sorulmaz: istenen yol hep /depo/
assert urlsplit(site + "#/ayarlar/profil").path == "/depo/"
# History yönlendirmede yenileme sunucuya /depo/ayarlar/profil'i sorar: yedek kural yoksa 404
assert urlsplit(site + "ayarlar/profil").path == "/depo/ayarlar/profil"
print("göreli taban + hash yönlendirme: aynı derleme her adreste çalışır")
```

```cikti
göreli taban + hash yönlendirme: aynı derleme her adreste çalışır
```

| Yol                                  | Ayar                                                 | Ne zaman                                              |
| ------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------- |
| Mutlak taban (`/depo/`)              | Vite `base: '/depo/'`; havuzdaki `site`'ta `SITE_URL` | Adres belli; history yönlendirme ya da çok sayfalı site |
| Göreli taban (`./`) + hash yönlendirme | Vite `base: './'`, `createHashRouter`              | Aynı derleme her adreste (Pages, Netlify, alt klasör) çalışsın |

Köprü ikinci yolu seçti: [`vite.config.ts`](../../../vite.config.ts) `base: './'`, manifest'te `start_url` ve `scope`
`./`, yönlendirici `createHashRouter`. Havuzdaki `site` ise adresi `SITE_URL`'den alır ve alt klasörü oradan
çıkarır ([`site/docs/YAYINLAMA.md`](../../site/docs/YAYINLAMA.md) → "Adres ayarı"). Yerelde alt klasör derlemesini
önizlemede deneyin; kök adreste yapılan deneme bu hatayı göstermez.

## SPA yönlendirme: hash ↔ history

| Yönlendirme                 | Adres                          | Sunucudan beklenen                         | Artısı / eksisi                                   |
| --------------------------- | ------------------------------ | ------------------------------------------ | ------------------------------------------------- |
| Hash (`#/ayarlar`)          | `…/depo/#/ayarlar`             | Hiçbir şey: sunucu yalnız `index.html`'i görür | Her barındırmada çalışır; adresler çirkin, arama motoru için zayıf |
| History (`/ayarlar`)        | `…/depo/ayarlar`               | Bilinmeyen sayfa yoluna `index.html`        | Temiz adres; yedek kural şart                     |

- **Netlify/Cloudflare Pages:** sayfa yollarını `index.html`'e yeniden yazan bir kural eklenir (ayrıntı platform
  belgesinde).
- **GitHub Pages:** kural yoktur. Bilinen hile `index.html`'in bir kopyasını `404.html` yapmaktır; sayfa açılır ama
  durum kodu `404`'tür (arama motoru ve bağlantı önizleyicileri için kötü). Uygulama için en sade çözüm hash
  yönlendirmedir; içerik sitesi için her sayfanın gerçek bir HTML dosyası olduğu durağan üretim (havuzdaki `site`).

**Yedek kural yalnız sayfalara uygulanmalıdır.** Yayından önce açılmış bir sekme, yeni yayında silinmiş eski bir JS
parçasını ister. Kural her bilinmeyen yola `index.html` verirse tarayıcı JS yerine HTML alır ve "MIME type
text/html" hatasıyla durur; `404` dönerse uygulama hatayı yakalayıp sayfayı yeniler ve yeni sürüme geçer:

```python calistir
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

Path("dist/assets").mkdir(parents=True)
Path("dist/index.html").write_text('<script type="module" src="/assets/app.yeni.js"></script>')
Path("dist/assets/app.yeni.js").write_text("console.log('yeni sürüm')")


def sunucu_kur(yedek_her_seye: bool) -> ThreadingHTTPServer:
    class Isleyici(BaseHTTPRequestHandler):
        def do_GET(self):
            dosya = Path("dist") / self.path.lstrip("/")
            if dosya.is_file():
                tur = "text/javascript" if dosya.suffix == ".js" else "text/html"
                return self.gonder(200, tur, dosya.read_bytes())
            if yedek_her_seye or "." not in Path(self.path).name:  # uzantısız adres bir sayfadır
                return self.gonder(200, "text/html", Path("dist/index.html").read_bytes())
            return self.gonder(404, "text/plain", b"bulunamadi")

        def gonder(self, kod: int, tur: str, govde: bytes) -> None:
            self.send_response(kod)
            self.send_header("Content-Type", tur)
            self.send_header("Content-Length", str(len(govde)))
            self.end_headers()
            self.wfile.write(govde)

        def log_message(self, *args):
            pass

    sunucu = ThreadingHTTPServer(("127.0.0.1", 0), Isleyici)
    threading.Thread(target=sunucu.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True).start()
    return sunucu


def iste(sunucu: ThreadingHTTPServer, yol: str) -> str:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{sunucu.server_address[1]}{yol}") as yanit:
            return f"{yanit.status} {yanit.headers['Content-Type']}"
    except urllib.error.HTTPError as hata:
        return str(hata.code)


for ad, her_seye in (("YANLIŞ: her yola index.html", True), ("DOĞRU: yalnız sayfalara", False)):
    sunucu = sunucu_kur(her_seye)
    # yayından önce açılmış bir sekme, artık olmayan eski parçayı istiyor
    print(f"{ad:28} /ayarlar → {iste(sunucu, '/ayarlar')}; /assets/app.eski.js → {iste(sunucu, '/assets/app.eski.js')}")
    sunucu.shutdown()
    sunucu.server_close()
```

```cikti
YANLIŞ: her yola index.html  /ayarlar → 200 text/html; /assets/app.eski.js → 200 text/html
DOĞRU: yalnız sayfalara      /ayarlar → 200 text/html; /assets/app.eski.js → 404
```

Havuzdaki uygulama sunucusu bu kuralı uygular ([`static.ts`](../../uygulama/api/src/http/static.ts)); istemci
tarafındaki karşılığı [PWA ve çevrimdışı](../20-web-onyuz/pwa-ve-cevrimdisi.md) notunda (`vite:preloadError`).

## Önbellek başlıkları

| Dosya                                            | Başlık                                  | Neden                                          |
| ------------------------------------------------ | --------------------------------------- | ---------------------------------------------- |
| Adında içerik özeti olan dosya (`app.3f9a1c.js`) | `public, max-age=31536000, immutable`   | İçerik değişince ad değişir                    |
| `index.html`, `sw.js`, `manifest.webmanifest`    | `no-cache` (sakla ama her açılışta sor) | Yeni sürüm hemen görünsün                      |
| Özetsiz görsel, belge                            | Kısa süre (saatler–gün)                 | Aynı adla güncellenebilir                      |

GitHub Pages başlık ayarına izin vermez; kendi kısa önbellek süresini uygular. Uzun süreli önbellek gereken PWA'da
bunu servis çalışanı üstlenir. Netlify ve Cloudflare Pages `_headers` dosyasını okur; havuzdaki örnek:
[`site/docs/yayin/_headers`](../../site/docs/yayin/_headers). Ayrıntı: [Önbellek](../30-arkauc/onbellek.md).

## Özel alan adı

1. Platformda alan adını ekleyin; platform hangi DNS kaydını istediğini söyler: alt alan için `CNAME`
   (`www` → `kullanici.github.io`), kök alan için platformun **belgelediği** `A`/`AAAA` adresleri ya da DNS
   sağlayıcısının ALIAS özelliği ([Alan adı ve DNS](alan-adi-ve-dns.md)).
2. DNS yayıldıktan sonra HTTPS'i zorunlu kılın (GitHub: "Enforce HTTPS"). Sertifikayı platform alır.
3. GitHub'da alan adını hesabınızda **doğrulayın** (verified domains): Pages'i kapattığınızda DNS kaydı unutulursa
   başkasının o adı kendi deposuna bağlamasını önler.
4. Özel alan adına geçince site kökte yayınlanır; alt klasör tabanı (`/depo/`) değişir. Mutlak taban kullanıyorsanız
   yeniden derleyin; göreli taban + hash yönlendirmede bir şey değişmez.

Dal tabanlı GitHub Pages yayınında alan adı yayın klasörünün kökündeki `CNAME` dosyasıyla bildirilir; Actions ile
yayında asıl ayar Pages panelindedir (`CNAME` dosyasının bu yolda gerekip gerekmediği için GitHub'ın güncel
belgesine bakın). Havuzdaki site temeli için adımlar: [`site/docs/YAYINLAMA.md`](../../site/docs/YAYINLAMA.md) →
"Kendi alan adı".

## Havuzdaki örnekler

- **Köprü:** [`pages.yml`](../../../.github/workflows/pages.yml) Köprü'yü derler, `bolus/` klasörünü `/bolus/`
  altına, `gh-pages` dalındaki TV+ sitesini `/tvplus/` altına ekler, hepsini tek yapıt olarak yayınlar. Aynı
  kökende üç uygulama olduğu için Köprü'nün servis çalışanı ötekilerin adreslerini yutmamalıdır:
  `vite.config.ts`'teki `navigateFallbackDenylist: [/\/bolus\//, /\/tvplus(\/|$)/]` bunu sağlar. İş akışının
  satır satır okuması: [CI/CD](ci-cd.md).
- **site:** [`site/docs/yayin/`](../../site/docs/yayin/github-pages.yml) — Pages iş akışı (alt klasörde site için
  `SITE_DIR`, adresi `configure-pages` çıktısından alma), `netlify.toml`, `_headers`.

## Derleme çıktısı denetimi

Yayından önce alt klasörde kırılacak yolları arayın:

```python calistir
import re
from pathlib import Path

KOK_YOLU = re.compile(r"""(?:src|href)="(/(?!/)[^"]*)"|url\(["']?(/(?!/)[^)"']*)""")


def kirilacak_yollar(dist: Path, taban: str) -> list[str]:
    """Alt klasörde yayında kırılacak yollar: '/' ile başlayan ama tabanla başlamayan kaynak ve bağlantılar."""
    sorunlar = []
    for dosya in sorted(dist.rglob("*")):
        if dosya.suffix in (".html", ".css", ".js"):
            for eslesme in KOK_YOLU.findall(dosya.read_text(encoding="utf-8")):
                yol = next(parca for parca in eslesme if parca)
                if not yol.startswith(taban):
                    sorunlar.append(f"{dosya.relative_to(dist)}: {yol}")
    return sorunlar


dist = Path("dist")
(dist / "assets").mkdir(parents=True)
(dist / "index.html").write_text(
    '<script type="module" src="/assets/app.js"></script>\n'  # kırılır
    '<link rel="stylesheet" href="/depo/assets/stil.css">\n'  # doğru: tabanla
    '<img src="./logo.png" alt=""><a href="/hakkinda">Hakkında</a>\n'  # göreli doğru; bağlantı kırılır
    '<link rel="stylesheet" href="//yazi.ornek.example/x.css">\n',  # başka alan adı: dokunma
    encoding="utf-8",
)
(dist / "assets" / "stil.css").write_text("@font-face { src: url(/assets/yazi.woff2) }", encoding="utf-8")
for sorun in kirilacak_yollar(dist, "/depo/"):
    print("-", sorun)
```

```cikti
- assets/stil.css: /assets/yazi.woff2
- index.html: /assets/app.js
- index.html: /hakkinda
```

Göreli taban kullanan derlemede (`./`) beklenen sonuç boş listedir. Ek denetimler: `http://` ile yüklenen kaynak
([HTTPS → karışık içerik](https-ve-sertifikalar.md)), yayın klasöründe `.env`, kaynak haritası ya da kişisel veri
olmaması.

## Tuzaklar

| Belirti                                                       | Neden                                                      | Çözüm                                                             |
| ------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| Yerelde çalışıyor, yayında beyaz sayfa; konsolda 404'ler      | Alt klasörde kök-göreli yollar (`/assets/…`)               | `base` ayarı ya da göreli taban; yukarıdaki denetim               |
| İç sayfada yenileyince 404                                    | History yönlendirme, sunucuda yedek kural yok              | Hash yönlendirme ya da platform kuralı (Pages'te `404.html` hilesi) |
| Göreli tabanla iç sayfa yenilenince stil/JS gelmiyor          | `./assets` iç sayfanın klasörüne göre çözülüyor            | Göreli taban yalnız hash yönlendirmeyle                           |
| Yayından sonra açık sekmelerde "MIME type text/html" hatası   | Yedek kural eski JS parçasına `index.html` veriyor         | Kural yalnız uzantısız yollara; parça hatasında sayfayı yenileyin |
| Yayın çıktı ama kullanıcılar eski sürümü görüyor              | `index.html` ya da `sw.js` uzun süre önbellekte; servis çalışanı bekliyor | `no-cache`; güncelleme bildirimi ([PWA](../20-web-onyuz/pwa-ve-cevrimdisi.md)) |
| Netlify'da `_headers` etkili, GitHub Pages'te değil           | Pages başlık ayarı desteklemez                             | Başlık gerekiyorsa başlık destekleyen barındırma                  |
| Dal tabanlı Pages yayınında `_astro/` gibi klasörler 404      | Jekyll alt çizgiyle başlayan klasörleri atlar              | Kökte boş `.nojekyll` dosyası ya da Actions ile yayın             |
| Ortam değişkenini panelde değiştirdim, site aynı              | Değişken derleme anında gömülür                            | Yeniden derleyip yayınlayın                                       |
| Aynı alan adındaki ikinci uygulama Köprü'nün ekranını açıyor  | Servis çalışanının gezinme yedeği öteki yolları yutuyor    | `navigateFallbackDenylist`'e öteki uygulamaların yolları          |
| Pages kapatıldı, alt alanda yabancı içerik çıktı              | DNS kaydı kaldı, alan adı doğrulanmamıştı                  | Kaydı silin; GitHub'da alan adı doğrulaması                       |
| Özel alan adına geçince bağlantılar bozuldu                   | Mutlak taban hâlâ `/depo/`                                 | Tabanı güncelleyip yeniden derleyin                               |

## Denetim listesi

- [ ] Derleme alt klasör adresinde (yayındakiyle aynı adreste) önizlemede denendi.
- [ ] Taban ve yönlendirme seçimi tutarlı: mutlak taban + (gerekirse) yedek kural, ya da göreli taban + hash.
- [ ] Yedek kural yalnız sayfa yollarına uygulanıyor; eksik JS/CSS `404` dönüyor.
- [ ] Özetli dosyalar uzun, `index.html`/`sw.js` `no-cache` (başlık destekleyen barındırmada).
- [ ] Derleme çıktısında kırılacak kök-göreli yol, `http://` kaynak, `.env` yok.
- [ ] Özel alan adında HTTPS zorunlu; alan adı platformda doğrulanmış.
- [ ] Aynı kökte birden çok uygulama varsa servis çalışanlarının kapsamları ve gezinme yedekleri ayrık.
- [ ] Yayın iş akışı denetimden geçmeden yayın yapmıyor ([CI/CD](ci-cd.md)).

## Küçük modele yaptırırken

- **İsteme yazın:** "Site `https://kullanici.github.io/depo/` adresinde yayınlanacak. `base` ayarını buna göre yap
  ya da göreli taban + hash yönlendirme kullan; seçimini bir cümleyle gerekçelendir. Derleyip çıktıyı alt klasör
  denetiminden geçir ve sonucu göster."
- **Modelin tipik hatası:** `base`'i unutup yalnız kök adreste denemek; göreli taban ile history yönlendirmeyi
  birlikte kullanmak; SPA yedek kuralını bütün yollara uygulamak; GitHub Pages'te `_headers` ya da `_redirects`
  dosyasının çalışacağını sanmak; sırrı `VITE_` değişkeniyle derlemeye koymak.
- **Çıktıda denetleyin:** derleme çıktısında `src="/` ve `href="/` arayın; yönlendirici türü (`createHashRouter` /
  `createBrowserRouter`) ile `base` uyumlu mu; yayın adresinde bir iç sayfayı yenileyip açılıyor mu.

## İlgili

- [PWA ve çevrimdışı](../20-web-onyuz/pwa-ve-cevrimdisi.md) — servis çalışanı, eski sürüm, kapsam
- [Vite ve derleme](../20-web-onyuz/vite-ve-derleme.md) — `base`, parça adları · [Yönlendirme ve URL](../20-web-onyuz/yonlendirme-ve-url.md) — hash ↔ history
- [Önbellek](../30-arkauc/onbellek.md) · [Alan adı ve DNS](alan-adi-ve-dns.md) · [HTTPS ve sertifikalar](https-ve-sertifikalar.md)
- [CI/CD](ci-cd.md) — `pages.yml`'in satır satır okuması
- [Mobil paketleme](mobil-paketleme.md) — alt klasördeki PWA'nın mağaza paketinde sorunu
- Çalışan karşılıklar: [`site/docs/YAYINLAMA.md`](../../site/docs/YAYINLAMA.md), [`vite.config.ts`](../../../vite.config.ts),
  [`pages.yml`](../../../.github/workflows/pages.yml)
