# yayin — tek sunucuda yayın dosyaları

Bu klasörü `tek-sunucuda-yayin` tarifi ekledi; adım adım kurulum ve sık sorunlar:
`havuz/tarifler/tek-sunucuda-yayin/README.md`.

| Dosya | Ne |
| --- | --- |
| `systemd/uygulama.service` | API + web tek servis (doğrudan `node`, sertleştirilmiş, `/var/lib/uygulama`) |
| `systemd/uygulama-yedek.service` + `.timer` | Her gece `VACUUM INTO` yedeği + 14 gün saklama (en yeni 3 hep kalır) |
| `systemd/uygulama-saglik.service` + `.timer` | 5 dakikada bir `/api/health`; yanıt yoksa yeniden başlatma |
| `caddy/Caddyfile` | HTTPS + ters vekil (uygulama) + durağan dosya (site) |
| `uygulama.env.ornek` | `/etc/uygulama/uygulama.env` örneği (sırlar yalnız sunucuda) |
| `saglik.sh` | Sağlık denetimi betiği |
| `site-yayinla.sh` | Siteyi derleyip sürüm klasörüne koyar, `current` bağlantısını tek adımda çevirir |
| `guncelle.sh` | Uygulama güncellemesi: yedek → kod → `npm ci` → derleme → yeniden başlatma → sağlık |

Sunucudaki yerleşim: proje `/srv/proje` (bu deponun kopyası), veritabanı ve yedekler `/var/lib/uygulama`,
ayar `/etc/uygulama/uygulama.env`, site sürümleri `/srv/site/surumler/<zaman>` ve `/srv/site/current`.
