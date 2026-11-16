---
baslik: Ters vekil (reverse proxy)
ozet: Ters vekilin işi (TLS, sıkıştırma, durağan dosya, yük dengeleme), Caddy ve nginx yapılandırma kavramları, X-Forwarded başlıkları ve güvenilen vekil sayısı, WebSocket ve SSE için zaman aşımları.
etiketler: [ters-vekil, nginx, caddy, tls, websocket, devops]
duzey: orta
guncellik: 2026-11
---

# Ters vekil (reverse proxy)

> Bu notu ne zaman okumalı: uygulamanın önüne Caddy ya da nginx koyarken; `502`, `504`, `413` görünce; günlükte
> herkesin IP'si aynı çıkınca; anlık bildirimler (SSE) toplu ya da gecikmeli gelince; WebSocket kopunca.

## Temel fikir

Ters vekil internet ile uygulama arasında durur: HTTPS'i o yapar, isteği aynı makinede `127.0.0.1`'i dinleyen
uygulamaya iletir. Uygulama dışarıya hiç açılmaz.

Her vekil katmanı uygulamanın gördüğünü değiştirir: bağlantının kaynak adresi vekilinki olur, şema `http` olur,
`Host` değişebilir. Asılları `X-Forwarded-For`, `X-Forwarded-Proto` gibi başlıklarla taşınır. Bunlar sıradan
başlıklardır, **istemci de yazabilir**; uygulama yalnız kendi vekillerinin eklediği kısma güvenir. Kaç vekile
güvenileceği bir ayardır (havuzdaki uygulamada `TRUST_PROXY`).

PaaS'larda (Render, Fly…) platformun kendi vekili zaten vardır; araya ikinci bir vekil koymayın, yalnız
`TRUST_PROXY=1` yazın.

## Ne işe yarar

| İş                         | Neden vekilde                                              | Dikkat                                                       |
| -------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------ |
| TLS sonlandırma            | Sertifika tek yerde; uygulama düz HTTP konuşur             | Uygulama `X-Forwarded-Proto`'yu bilmeli ([HTTPS](https-ve-sertifikalar.md)) |
| HTTP → HTTPS, `www` → kök  | Tek satırlık yönlendirme                                   | 301 kalıcıdır; tarayıcı önbelleğe alır, yanlışını geri almak zor |
| Sıkıştırma                 | Metin yanıtları küçülür                                     | Resim/video zaten sıkışıktır; SSE akışını biriktirebilir     |
| Durağan dosya, önbellek başlığı | Uygulamayı yormaz                                      | Özetli adlara uzun, `index.html`'e kısa süre ([Önbellek](../30-arkauc/onbellek.md)) |
| İstek boyutu sınırı        | Büyük gövde uygulamaya varmadan durur                      | Dosya yüklemede sınırı bilinçli yükseltin                    |
| Zaman aşımları             | Asılı bağlantılar kaynak tüketmez                          | Uzun bağlantılar (SSE, WebSocket) için ayrı ayar             |
| Yük dengeleme              | Birden çok kopyaya dağıtma, sağlıksızı dışarıda bırakma    | SQLite'lı uygulama tek kopyadır; dengeleme gerekmez          |
| Kaba hız sınırı            | Sel saldırısını uygulamadan önce keser                     | Asıl hız sınırı uygulamada, kullanıcıya göre                 |

## Karar tablosu

| Durum                                             | Seçim                                                    | Neden                                              |
| ------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| VPS, tek uygulama, en az ayar                     | Caddy                                                    | Sertifikayı kendisi alır ve yeniler; ayar birkaç satır |
| Çok site, ince ayar, geniş belge                  | nginx + certbot                                          | Yaygın; her davranış ayarlanabilir                 |
| PaaS                                              | Platformun vekili; `TRUST_PROXY=1`                       | İkinci vekil yalnız gecikme ve hata noktası ekler  |
| CDN + PaaS (iki katman)                           | `TRUST_PROXY=2` ya da CDN'in özel başlığı (uygulamada dal) | Sayı eksik olursa herkes CDN'in adresi görünür  |
| Uygulama hem web'i hem API'yi sunuyor (havuzdaki gibi) | Vekil yalnız iletir                                 | Durağanı vekile almak isteğe bağlı bir iyileştirme |

## Caddy

```text
www.ornek.com {
	redir https://ornek.com{uri} permanent
}

ornek.com {
	encode zstd gzip
	request_body {
		max_size 10MB
	}
	reverse_proxy 127.0.0.1:8310 {
		flush_interval -1
	}
}
```

Caddy sertifikayı kendisi alır, HTTP'yi HTTPS'e yönlendirir, `X-Forwarded-For`/`-Proto`/`-Host` başlıklarını
ekler, WebSocket'i ek ayarsız geçirir. `flush_interval -1` yanıtı biriktirmeden iletir (SSE için). Sertifikaların
durduğu klasör kalıcı olmalıdır ([Docker Compose](docker-compose.md) → `caddy-veri`).

## nginx

```nginx
# /etc/nginx/conf.d/ornek.conf (http bağlamında okunur)
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    server_name ornek.com www.ornek.com;
    return 301 https://ornek.com$request_uri;
}

server {
    listen 443 ssl;
    server_name ornek.com;
    ssl_certificate     /etc/letsencrypt/live/ornek.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ornek.com/privkey.pem;
    client_max_body_size 10m;                  # varsayılan 1m: büyük yüklemede 413

    location / {
        proxy_pass http://127.0.0.1:8310;      # "localhost" değil: ::1'e (IPv6) gidebilir
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/events {                     # SSE: biriktirme, uzun bekle
        proxy_pass http://127.0.0.1:8310;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 1h;
    }

    location /ws/ {                            # WebSocket: Upgrade başlıkları şart
        proxy_pass http://127.0.0.1:8310;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 1h;
    }
}
```

`https://www.ornek.com`'u da yönlendirmek için `www`'yu kapsayan sertifikayla ayrı bir `443` sunucu bloğu gerekir.
Değişiklikten sonra `sudo nginx -t && sudo systemctl reload nginx`: `-t` sözdizimini denetler, `reload` bağlantıları
kesmeden yükler. Bu yapılandırmalar bu ortamda denenmedi (nginx ve Caddy kurulu değil); havuzdaki karşılığı:
[`uygulama/docs/YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md) → "Ters vekil ve HTTPS".

nginx'in iki kalıtım tuzağı, yukarıda her `location`'da başlıkların yinelenmesinin nedenidir:

- Bir `location` içine **tek bir** `proxy_set_header` bile yazılırsa üst düzeydeki (`server`) bütün
  `proxy_set_header`'lar o `location`'a geçmez.
- `add_header` için de aynısı geçerlidir: güvenlik başlıkları `server`'da, bir `location`'da tek bir `add_header`
  varsa o yoldaki yanıtlarda güvenlik başlıkları kaybolur.

## X-Forwarded başlıkları ve güvenilen vekil

| Başlık               | Taşıdığı                     | Uygulama ne için kullanır                                   |
| -------------------- | ---------------------------- | ----------------------------------------------------------- |
| `X-Forwarded-For`    | İstemci adresi zinciri       | Hız sınırı, denetim günlüğü                                 |
| `X-Forwarded-Proto`  | Asıl şema (`https`)          | Güvenli çerez, yönlendirme, köken denetimi                  |
| `X-Forwarded-Host` / `Host` | Asıl alan adı         | Mutlak bağlantı üretmek (daha güvenlisi: ayardaki `APP_URL`) |

Her vekil `X-Forwarded-For`'un **sonuna** gördüğü adresi ekler; soldaki değerleri istemci uydurabilir. Bu yüzden
gerçek istemci, sağdan **güvenilen vekil sayısı** kadar içerideki öğedir. Havuzdaki kural
([`clientIp.ts`](../../uygulama/api/src/http/clientIp.ts)) ile aynısı:

```python calistir
def istemci_ip(xff: str | None, soket_ip: str, guvenilen_vekil: int) -> str:
    if guvenilen_vekil > 0 and xff:
        ogeler = [o.strip() for o in xff.split(",") if o.strip()]
        if ogeler:
            return ogeler[max(0, len(ogeler) - guvenilen_vekil)]
    return soket_ip  # vekil yok: bağlantının kendi adresi


GERCEK = "198.51.100.7"  # kullanıcının gerçek adresi
UYDURMA = "1.2.3.4"  # kullanıcının kendi yazdığı başlık değeri
CDN = "192.0.2.50"  # CDN'in vekile bağlandığı adres

# 1) Tek vekil (Caddy, nginx, Render): vekil gördüğü adresi sona ekler
xff = f"{UYDURMA}, {GERCEK}"
assert istemci_ip(xff, "127.0.0.1", 1) == GERCEK
assert xff.split(",")[0].strip() == UYDURMA  # YANLIŞ: en soldakini almak uydurmaya güvenmektir

# 2) Vekil var, TRUST_PROXY=0: herkes vekilin adresi → bir kişinin hız sınırı herkesi kilitler
assert istemci_ip(xff, "127.0.0.1", 0) == "127.0.0.1"

# 3) Vekil YOK, TRUST_PROXY=1: saldırgan her istekte başka adres yazar → hız sınırı işlemez
assert istemci_ip("203.0.113.99", GERCEK, 1) == "203.0.113.99"

# 4) İki katman (CDN → vekil → uygulama)
xff = f"{UYDURMA}, {GERCEK}, {CDN}"
assert istemci_ip(xff, "127.0.0.1", 1) == CDN  # sayı eksik: herkes CDN görünür
assert istemci_ip(xff, "127.0.0.1", 2) == GERCEK
print("güvenilen vekil sayısı doğru olunca gerçek adres bulunuyor")
```

```cikti
güvenilen vekil sayısı doğru olunca gerçek adres bulunuyor
```

Doğru sayıyı tahmin etmeyin, deneyin: iki farklı ağdan (ev Wi-Fi'ı ve telefon hattı) giriş yapın; günlükteki `"ip"`
alanları farklı ve gerçek olmalı ([`GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md) → "Gerçek IP ve TRUST_PROXY").
nginx'te başlığı **ekleyin** (`$proxy_add_x_forwarded_for`); `$remote_addr` ile üzerine yazmak önceki vekilin
bilgisini siler. Havuzdaki uygulama köken denetiminde `X-Forwarded-Proto`'yu da yalnız `TRUST_PROXY > 0` iken
dikkate alır ([`csrf.ts`](../../uygulama/api/src/http/csrf.ts)); e-posta bağlantılarını ise `Host`'tan değil
`APP_URL`'den üretir.

## WebSocket ve SSE: zaman aşımı ve biriktirme

Uzun bağlantının yolundaki **her** halkanın (CDN, platform vekili, sizin vekiliniz, uygulama) bir boşta kalma süresi
vardır; en kısası kazanır. nginx'in `proxy_read_timeout` varsayılanı 60 sn'dir: o süre veri akmazsa bağlantı kesilir.

| Sorun                                   | Ayar                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| Boşta kalan bağlantı kesiliyor          | Uygulama, zincirdeki en kısa süreden sık **nabız** gönderir (havuz: SSE'de 25 sn) |
| SSE olayları toplu, gecikmeli geliyor   | Vekilde biriktirmeyi kapatın (`proxy_buffering off`, Caddy `flush_interval -1`; havuzdaki sunucu ayrıca `X-Accel-Buffering: no` yollar); sıkıştırma da biriktirebilir, o yolda deneyin |
| WebSocket el sıkışması 400/426 ile düşüyor | `Upgrade` ve `Connection` başlıkları, `proxy_http_version 1.1`               |
| Dağıtımda bütün bağlantılar koptu       | Beklenen; istemci geri çekilmeyle yeniden bağlanmalı (EventSource kendisi yapar, WebSocket'te siz yazarsınız) |
| PaaS'ta birkaç dakikada bir kopma       | Platformun üst sınırı; nabız + yeniden bağlanma; sınırı belgeden okuyun         |

## Tuzaklar

| Belirti                                                       | Neden                                                         | Çözüm                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `502 Bad Gateway`                                             | Uygulama çalışmıyor, kapı yanlış ya da uygulama kapsayıcıda `127.0.0.1`'i dinliyor | `curl 127.0.0.1:8310/api/health`; kapsayıcıda `HOST=0.0.0.0` |
| Ara sıra 502, günlükte `[::1]:8310 connection refused`        | `proxy_pass http://localhost` IPv6'yı da deniyor              | `127.0.0.1` yazın                                                  |
| `504 Gateway Timeout`                                         | Uygulama vekilin bekleme süresinden yavaş                     | Yavaş isteği hızlandırın ya da arka plan işine alın; süreyi yalnız o yolda uzatın |
| Dosya yüklemede `413 Request Entity Too Large`                | Vekilin gövde sınırı (nginx varsayılanı 1 MB)                 | `client_max_body_size` / `request_body max_size`                   |
| `ERR_TOO_MANY_REDIRECTS`                                      | Uygulama HTTPS'i bilmiyor, sürekli HTTPS'e yönlendiriyor      | `X-Forwarded-Proto` iletilsin, `TRUST_PROXY` doğru                 |
| Günlükte herkesin IP'si aynı; bir kişi herkesi kilitliyor     | Vekil var, `TRUST_PROXY=0`                                    | Vekil sayısını yazın                                               |
| Hız sınırı hiç işlemiyor                                      | Vekil yok ama `TRUST_PROXY>0`: başlık uydurulabiliyor         | `TRUST_PROXY=0`; uygulamayı dışarıya açmayın                        |
| E-postadaki bağlantılar `http://127.0.0.1:8310/…`             | Uygulama adresi `Host`'tan kuruyor, vekil `Host`'u iletmiyor   | `proxy_set_header Host $host`; daha iyisi `APP_URL`                |
| Bir yolda güvenlik başlıkları ya da `X-Forwarded-*` kayboldu  | nginx kalıtımı: `location`'daki tek `add_header`/`proxy_set_header` üsttekileri siler | O `location`'da hepsini yineleyin                |
| SSE bildirimleri dakikalar sonra, toplu geliyor               | Vekil yanıtı biriktiriyor                                     | Biriktirmeyi kapatın; sıkıştırmayı o yolda kapatın                  |
| Uygulama vekil olmadan da dışarıdan açılıyor                  | Kapı `0.0.0.0`'a açık (`-p 8310:8310`)                        | `127.0.0.1:8310:8310`; güvenlik duvarı                             |
| Yapılandırma değişti, `reload` sonrası site düştü             | Sözdizimi hatası denetlenmeden yüklendi                       | Her zaman önce `nginx -t` (Caddy'de `caddy validate`)              |

## Denetim listesi

- [ ] Uygulama yalnız `127.0.0.1`'i (kapsayıcıda `0.0.0.0` + `-p 127.0.0.1:…`) dinliyor; dışarıdan doğrudan açılmıyor.
- [ ] HTTP → HTTPS ve `www` → asıl adres yönlendirmesi tek adımda (301) yapılıyor.
- [ ] `Host`, `X-Forwarded-For` (ekleyerek) ve `X-Forwarded-Proto` iletiliyor; `TRUST_PROXY` vekil sayısına eşit ve
      iki farklı ağdan denendi.
- [ ] Gövde sınırı uygulamanın beklediği en büyük yüklemeye göre.
- [ ] SSE yolunda biriktirme kapalı; bildirim tarayıcıda anında görünüyor.
- [ ] Uzun bağlantıların zaman aşımı nabız aralığından uzun; WebSocket varsa `Upgrade` başlıkları var.
- [ ] Güvenlik başlıkları her yolda görünüyor (tarayıcı geliştirici araçlarında birkaç farklı yol denendi).
- [ ] Yapılandırma değişikliği `nginx -t` / `caddy validate` sonrası `reload` ile yükleniyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Ters vekil yapılandırması yaz: `proxy_pass http://127.0.0.1:8310`; `Host`,
  `X-Forwarded-For` (`$proxy_add_x_forwarded_for`) ve `X-Forwarded-Proto` ilet; SSE yolu `/api/events` için
  `proxy_buffering off` ve uzun `proxy_read_timeout`; her `location`'da başlıkları yinele. Uygulamada `TRUST_PROXY`
  vekil sayısı olsun."
- **Modelin tipik hatası:** `X-Forwarded-For`'un en soldaki değerini almak; `TRUST_PROXY`'yi "her ihtimale karşı"
  açmak; `proxy_pass http://localhost`; WebSocket başlıklarını unutmak; bütün sitenin zaman aşımını saatlere
  çıkarmak; PaaS'ın önüne gereksiz bir nginx koymak.
- **Çıktıda denetleyin:** kodda IP'yi `split(',')[0]` ile alan satır var mı; yapılandırmada her `location`'da
  `proxy_set_header` kümesi tam mı; `nginx -t` çıktısı; iki ağdan giriş denemesinin günlükteki IP'leri.

## İlgili

- [HTTPS ve sertifikalar](https-ve-sertifikalar.md) · [Docker Compose](docker-compose.md) (vekil kapsayıcısı)
- [HTTP temelleri](../30-arkauc/http-temelleri.md) — durum kodları (502, 504, 413), önbellek başlıkları
- [Ölçekleme temelleri](../40-sistem-tasarimi/olcekleme-temelleri.md) — yük dengeleme ve çok kopya
- Çalışan karşılıklar: [`clientIp.ts`](../../uygulama/api/src/http/clientIp.ts),
  [`uygulama/docs/YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md) → "Ters vekil ve HTTPS",
  [`render.ornek.yaml`](../../uygulama/render.ornek.yaml) (`TRUST_PROXY: '1'`)
