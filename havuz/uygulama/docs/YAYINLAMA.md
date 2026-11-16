# Yayınlama

Uygulama **tek servis** olarak yayınlanır: API (`api/`) hem `/api/*` uçlarını hem de derlenmiş web uygulamasını
(`web/dist`) aynı adresten sunar. Aynı köken olduğu için CORS ve çerez sorunları çıkmaz.

> **En önemli uyarı:** Veritabanı tek bir SQLite dosyasıdır (`DATABASE_PATH`). Dosya **kalıcı bir diskte**
> durmalıdır. Diski geçici olan barındırmalarda (çoğu "ücretsiz katman" böyledir; ör. Render'ın ücretsiz web
> servisi) dosya sistemi her yeniden başlatma, uyku ya da dağıtımda sıfırlanır: **bütün kullanıcılar ve kayıtlar
> silinir**. Böyle bir yerde yalnız deneme yapın; gerçek kullanıcı almayın.

## 1. Seçenekler

| Seçenek                                              | Kalıcı disk                 | Not                                                                    |
| ---------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------- |
| Kendi sunucunuz (VPS) + Docker                       | Var (Docker birimi)         | En denetimli yol; HTTPS için önüne Caddy ya da nginx koyun (§4)        |
| Render (Docker, ücretli plan + disk)                 | Ücretli planda disk eklenir | `render.ornek.yaml` örneği; ücretsiz planda disk yok                   |
| Fly.io / Railway gibi birim (volume) veren servisler | Birim bağlanırsa var        | `DATABASE_PATH`'i birimin içine verin; tek makine/tek kopya çalıştırın |
| Herhangi bir geçici diskli ücretsiz katman           | YOK                         | Yalnız gösterim; veri her açılışta silinir                             |

Barındırıcıların plan, fiyat ve disk ayrıntıları **bu ortamdan doğrulanamadı**; seçmeden önce güncel
belgelerine bakın. Hangisi olursa olsun **tek kopya** çalıştırın (SQLite + bellek içi hız sınırı ve anlık
bildirim; bkz. §7).

## 2. Docker ile

`havuz/uygulama` klasöründen:

```bash
docker build -t uygulama .
docker volume create uygulama-veri
docker run -d --name uygulama --restart unless-stopped \
  -p 127.0.0.1:8310:8310 \
  -v uygulama-veri:/data \
  -e APP_URL=https://ornek.com \
  -e TRUST_PROXY=1 \
  -e ADMIN_EMAILS=siz@ornek.com \
  -e MAIL_PROVIDER=http -e MAIL_HTTP_URL=https://… -e MAIL_HTTP_KEY=… -e MAIL_FROM='Uygulama <bildirim@ornek.com>' \
  uygulama
docker logs -f uygulama        # JSON günlük; "sunucu hazır" satırını görün
curl -s http://127.0.0.1:8310/api/health
```

Görüntü iki aşamalıdır: ilk aşama web uygulamasını derler; çalışma görüntüsünde yalnız API'nin çalışma
bağımlılıkları (hono, @hono/node-server, zod), `shared/src`, `api/src`, `api/migrations`, `api/scripts` ve
`web/dist` bulunur. Konteyner `node` kullanıcısıyla çalışır; veritabanı `/data/uygulama.db`.
Betikler: `docker exec -it uygulama npm run backup` (ya da `seed`, `create-admin -- --email …`).

> Doğrulama durumu: bu ortamda Docker sunucusu (daemon) olmadığı için görüntü **derlenip çalıştırılamadı**.
> Çalışma aşamasının adımları (`npm ci --omit=dev -w @uygulama/api` ve aynı klasör düzeniyle `NODE_ENV=production`
> sunucu + web sunumu) Docker'sız olarak birebir denendi ve çalıştı. İlk derlemede bir sorun görürseniz önce
> `npm run build -w @uygulama/web`'in yerelde geçtiğinden emin olun.

### Süreç yöneticisiyle (systemd, pm2) Docker'sız

Sunucuyu `npm start` ile değil, **doğrudan node ile** başlatın:
`cd api && NODE_ENV=production node --disable-warning=ExperimentalWarning src/index.ts`. npm betiği sunucuyu
`sh -c` üzerinden başlatır ve süreç yöneticisinin gönderdiği SIGTERM'i her ortamda node'a iletmez; o zaman düzgün
kapanış (açık akışları kapatma, veritabanını kapatma) atlanır ve node süreci yetim kalabilir (bu ortamda
gözlendi). Terminalde Ctrl+C'de sorun yoktur (sinyal bütün süreç grubuna gider). Docker görüntüsü zaten node'u
doğrudan çalıştırır.

## 3. Render ile

`render.ornek.yaml` dosyasını deponun köküne `render.yaml` adıyla kopyalayın (uygulama depo kökünde değilse
dosyadaki yolları düzeltin), Render panelinde "Blueprint" olarak bağlayın, sorulan gizli değerleri girin
(`APP_URL`, `ADMIN_EMAILS`, e-posta ayarları). Render web servislerine kendi `PORT` değerini verir; sunucu onu
kullanır. Diske yazarken izin hatası görürseniz (diskin sahibi `root` olabilir) Dockerfile'daki `USER node`
satırını kaldırıp yeniden dağıtın. **Bu adımlar Render'da denenmedi.**

## 4. Ters vekil ve HTTPS

Sunucu HTTPS'i kendisi yapmaz; önüne TLS sonlandıran bir vekil konur ve `TRUST_PROXY=1` yazılır.
Anlık bildirim (SSE, `GET /api/events`) için vekil yanıtı **arabelleğe almamalı** ve uzun bağlantıyı kesmemelidir
(sunucu 25 sn'de bir nabız gönderir).

Caddy (sertifikayı kendiliğinden alır):

```text
ornek.com {
	reverse_proxy 127.0.0.1:8310 {
		flush_interval -1
	}
}
```

nginx (sunucu SSE yanıtına `X-Accel-Buffering: no` ekler; yine de açıkça yazmak iyidir):

```nginx
location / {
    proxy_pass http://127.0.0.1:8310;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_read_timeout 1h;
}
```

Vekil `X-Forwarded-For`'u **eklemeli** (`$proxy_add_x_forwarded_for`), üzerine yazmamalı; `TRUST_PROXY` vekil
sayısıdır (iki katman varsa 2). Yanlış ayarın riski: docs/GUVENLIK.md → "Gerçek IP ve TRUST_PROXY".
Bu yapılandırmalar bu ortamda **denenmedi**.

## 5. Yedekleme ve geri yükleme

Yedek (sunucu çalışırken de güvenli; SQLite `VACUUM INTO` ile tek anın tutarlı kopyası):

```bash
npm run backup -w @uygulama/api                       # → <veritabanı klasörü>/yedek/uygulama-YYYYMMDD-HHMMSS.db
npm run backup -w @uygulama/api -- /yol/yedek.db      # hedefi siz verin
docker exec uygulama npm run backup                    # Docker'da → /data/yedek/…
```

Betik kopyayı açıp `PRAGMA integrity_check` ile denetler. Yedeği sunucunun dışına da alın (ör. günde bir,
`docker cp uygulama:/data/yedek/… .` ya da `scp`). Yedekler **şifrelenmez**; e-posta adresleri ve kayıtlar
içerir, güvenli yerde saklayın. Zamanlanmış yedek için (VPS'te) `crontab -e`:

```text
17 3 * * * cd /srv/uygulama && docker exec uygulama npm run backup >> /var/log/uygulama-yedek.log 2>&1
```

Geri yükleme:

1. Sunucuyu durdurun (`docker stop uygulama`).
2. Yedek dosyayı `DATABASE_PATH`'e kopyalayın; yanındaki `uygulama.db-wal` ve `uygulama.db-shm` dosyalarını
   **silin** (eski günlük dosyaları yedeğin üstüne uygulanmasın).
3. Sunucuyu başlatın; yedekten sonra eklenmiş migrasyonlar açılışta kendiliğinden uygulanır.
4. İstemciler bir sonraki eşitlemede sunucunun eski bir hâle döndüğünü anlar (`reset: true`) ve kullanıcıya
   "buradakini gönder / sunucudakini al" diye sorar (docs/ESITLEME.md).

**Geri yüklemeyi yayından önce bir kez deneyin** (docs/GUVENLIK.md → denetim listesi).

## 6. Ortam değişkenleri

| Değişken           | Varsayılan                                   | Açıklama                                                                                                |
| ------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`         | `development`                                | `production`: `Secure` + `__Host-` çerez, HSTS, `APP_URL` zorunlu, `RATE_LIMIT=off` yasak               |
| `PORT`             | `8310`                                       | Dinlenecek kapı (`0` = boş kapı)                                                                        |
| `HOST`             | geliştirme `127.0.0.1`, üretim `0.0.0.0`     | Dinlenecek adres                                                                                        |
| `DATABASE_PATH`    | `.data/uygulama.db` (çalışma klasörüne göre) | SQLite dosyası; üretimde kalıcı diskte. `:memory:` = bellek içi (deneme)                                |
| `APP_URL`          | `http://localhost:5310`                      | Web uygulamasının herkese açık adresi: e-posta bağlantıları + köken denetimi. Üretimde zorunlu, `https` |
| `ALLOWED_ORIGINS`  | boş (CORS kapalı)                            | Başka alan adındaki istemciler, virgüllü köken listesi; `*` yasak                                       |
| `TRUST_PROXY`      | `0`                                          | Önünüzdeki güvenilen vekil sayısı (`true` = 1)                                                          |
| `ADMIN_EMAILS`     | boş                                          | Kayıtta ve sunucu açılışında yönetici yapılacak e-postalar (virgüllü)                                   |
| `SESSION_TTL_DAYS` | `30`                                         | Oturum süresi (1–365 gün), kullanıldıkça uzar                                                           |
| `MAIL_PROVIDER`    | `console`                                    | `console`: gönderilmez, `mail_outbox` tablosuna yazılır · `http`: sağlayıcıya gönderilir                |
| `MAIL_FROM`        | `Uygulama <bildirim@localhost>`              | Gönderen; `http` iken zorunlu                                                                           |
| `MAIL_HTTP_URL`    | —                                            | Sağlayıcının gönderim ucu (`http` iken zorunlu)                                                         |
| `MAIL_HTTP_KEY`    | —                                            | Sağlayıcının API anahtarı (`http` iken zorunlu; `Authorization: Bearer` olarak gider)                   |
| `WEB_DIST`         | `web/dist`                                   | Derlenmiş web klasörü; hazırsa aynı kökenden sunulur, değilse yalnız API çalışır                        |
| `LOG_LEVEL`        | `info` (test: `warn`)                        | `debug` · `info` · `warn` · `error`                                                                     |
| `RATE_LIMIT`       | `on`                                         | `off` yalnız uçtan uca testler içindir                                                                  |

Hatalı ya da eksik ayarda sunucu **başlamaz** ve her sorunu, değişken adı ve ne yapılacağıyla Türkçe listeler.
Sunucu ve betikler önce çalışma klasöründeki, yoksa `havuz/uygulama/` klasöründeki `.env` dosyasını okur
(ortamda zaten tanımlı değişkenlerin üstüne yazmaz). Kopyalanabilir örnek (`.env` olarak kaydedin; depoya
koymayın):

```bash
NODE_ENV=production
PORT=8310
DATABASE_PATH=/data/uygulama.db
APP_URL=https://ornek.com
ALLOWED_ORIGINS=
TRUST_PROXY=1
ADMIN_EMAILS=siz@ornek.com
SESSION_TTL_DAYS=30
MAIL_PROVIDER=http
MAIL_FROM=Uygulama <bildirim@ornek.com>
MAIL_HTTP_URL=https://saglayici.example/emails
MAIL_HTTP_KEY=gizli-anahtar
LOG_LEVEL=info
```

### E-posta sağlayıcısı

`MAIL_PROVIDER=http` iken her e-posta şu biçimde gönderilir (Resend'in belgelediği biçim; ezberden yazıldı):

```text
POST <MAIL_HTTP_URL>
Authorization: Bearer <MAIL_HTTP_KEY>
Content-Type: application/json

{"from":"<MAIL_FROM>","to":["alici@ornek.com"],"subject":"…","text":"…","html":"…"}
```

Bu bağdaştırıcı **hiçbir gerçek sağlayıcıyla denenmedi** (Resend, Postmark, SendGrid, Brevo, Mailgun, Amazon SES
dahil); yalnız sahte `fetch` ile test edildi. Resend dışındaki sağlayıcılar farklı gövde ve başlık ister:
`api/src/mail/mailer.ts`'te `createHttpMailer` örnek alınarak yeni bir bağdaştırıcı yazılır (TARIFLER.md →
"Yeni e-posta"). Gönderim hatası kullanıcıya yansımaz, günlüğe `arka plan işi başarısız` olarak yazılır.

## 7. Ölçekleme ve sınırlar

- **Tek kopya.** SQLite tek dosyadır; aynı anda tek sunucu süreci yazmalıdır. Hız sınırı ve anlık bildirim
  (SSE) bellek içidir. Birden çok kopya gerekirse: veritabanını Postgres'e taşıyın (SQL `api/src/db/database.ts`
  sarmalayıcısının arkasındadır), anlık bildirimi Postgres `LISTEN/NOTIFY` ya da Redis yayınıyla değiştirin
  (`api/src/modules/events/hub.ts`), hız sınırını paylaşılan bir depoya alın.
- **Kapasite** ölçülmedi. Eşitleme işlemleri kısa sürer (yerel testte milisaniyeler); parola özeti istek başına
  ~0,15 sn işlemci ve 16 MiB bellek ister (aynı anda en çok 2).
- **Node sürümü:** `node:sqlite` ve TypeScript'i doğrudan çalıştırma için Node ≥ 22.18 gerekir (bu ortamda
  22.23.4 ile denendi; daha eski 22.x sürümleri denenmedi).
