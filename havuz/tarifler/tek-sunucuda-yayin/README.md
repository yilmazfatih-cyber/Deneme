# Tarif: tek sunucuda yayın (uygulama + site; systemd, Caddy, yedek, sağlık)

## Amaç

Bir Linux sunucuda (VPS) iki şeyi birlikte yayınlamak: **uygulama** tek servis olarak (API derlenmiş web'i de
sunar; `app.ornek.com`) ve **site** durağan dosyalar olarak (`ornek.com`). Önde Caddy HTTPS'i ve sertifikayı
kendisi yönetir; systemd süreçleri ayakta tutar; her gece tutarlı yedek alınır ve eskileri silinir; beş
dakikada bir sağlık denetlenir; güncelleme ve geri dönüş adımları yazılıdır.

```
internet ──443──► Caddy ─┬─ app.ornek.com ─► 127.0.0.1:8310  uygulama.service (node, API + web/dist)
                         │                       └─ /var/lib/uygulama/uygulama.db (SQLite)
                         └─ ornek.com ─────► /srv/site/current → surumler/<zaman>/ (site-yayinla.sh)
zamanlayıcılar: uygulama-yedek.timer (03:17, VACUUM INTO + 14 gün) · uygulama-saglik.timer (5 dk)
```

## Hangi temeller

| Temel | Ne değişir |
| --- | --- |
| `uygulama` | `api/scripts/backup.ts`'e `--klasor` ve `--sakla <gün>` (en yeni 3 yedek hep kalır; kural `scripts/retention.ts`), yeni `api/scripts/restore.ts` (`npm run restore … --onayla`: sunucu çalışıyorsa reddeder, bütünlüğü denetler, eski dosyayı silmeden kenara alır, atomik yerleştirir), `test/backupRestore.test.ts` (gerçek süreçlerle tatbikat), `docs/YAYINLAMA.md` §5 |
| `site` | Değişmez; `npm run build` çıktısı (`dist/`) yayınlanır |
| `yayin/` (yeni klasör) | systemd birimleri, Caddyfile, ortam dosyası örneği, `saglik.sh`, `site-yayinla.sh`, `guncelle.sh` (ayrıntı: `dosyalar/yayin/README.md`) |

## Ön koşullar

- Ubuntu 24.04 / Debian 12 benzeri, systemd'li bir sunucu; `sudo` yetkisi; 80 ve 443 kapıları açık.
- Node 22.23.4+ (`node:sqlite` ve TypeScript'i doğrudan çalıştırma; site Astro 7 için 22.23.4 ister), git, curl.
- Caddy 2 (resmî paket deposundan; kurulum belgesi: caddyserver.com → Install).
- İki alan adının (ör. `app.ornek.com`, `ornek.com`) DNS A/AAAA kaydı bu sunucuyu göstermeli.
- Projeniz bir git deposunda (bu tarifi `tarif.py kur` ile uyguladığınız klasör).

## Adım adım

Yerelde bir kez: `python havuz/tarifler/tarif.py kur tek-sunucuda-yayin ~/projeler/yayin` → klasörü kendi
git deponuza koyun. Sunucuda (komutlar `sudo` yetkili kullanıcıyla):

**1. Kullanıcı ve klasörler**

```bash
sudo useradd --system --home /var/lib/uygulama --shell /usr/sbin/nologin uygulama
sudo mkdir -p /srv/proje /srv/site /etc/uygulama
sudo chown "$USER" /srv/proje /srv/site
git clone <deponuzun-adresi> /srv/proje
```

**2. Uygulamayı derleyin**

```bash
cd /srv/proje/uygulama && npm ci && npm run build      # web/dist üretilir
command -v node                                         # /usr/bin/node değilse birim dosyalarında düzeltin
```

**3. Ayar dosyası** (sırlar yalnız burada; `DEGISTIRIN` yerlerini doldurun):

```bash
sudo install -D -m 0640 -o root -g uygulama /srv/proje/yayin/uygulama.env.ornek /etc/uygulama/uygulama.env
sudoedit /etc/uygulama/uygulama.env
```

**4. systemd birimleri**

```bash
sudo cp /srv/proje/yayin/systemd/* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now uygulama.service uygulama-yedek.timer uygulama-saglik.timer
systemctl status uygulama --no-pager                    # active (running)
curl -s http://127.0.0.1:8310/api/health                # {"ok":true,"version":"0.1.0","time":"…"}
```

Uygulama `npm` ile değil doğrudan `node` ile başlar: npm SIGTERM'i her ortamda iletmez ve düzgün kapanış
(açık akışları ve SQLite'ı kapatma) atlanır (`uygulama/docs/YAYINLAMA.md` §2).

**5. Siteyi yayınlayın** (derler, `/srv/site/surumler/<zaman>`'a kopyalar, `current`'ı tek adımda çevirir):

```bash
SITE_URL=https://ornek.com bash /srv/proje/yayin/site-yayinla.sh
```

İletişim formu uygulamaya bağlıysa (`site-iletisim-formu-api` tarifi) aynı satıra
`PUBLIC_FORM_ENDPOINT=https://app.ornek.com/api/iletisim` ekleyin.

**6. Caddy**

```bash
sudo cp /srv/proje/yayin/caddy/Caddyfile /etc/caddy/Caddyfile     # alan adlarını düzenleyin
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
curl -sI https://app.ornek.com/api/health | head -1               # HTTP/2 200
```

**7. Geri yükleme provası** (yayından ÖNCE bir kez; `uygulama/docs/GUVENLIK.md` denetim listesi):

```bash
sudo systemctl start uygulama-yedek.service && ls /var/lib/uygulama/yedek/      # uygulama-YYYYMMDD-HHMMSS.db
sudo systemctl stop uygulama
cd /srv/proje/uygulama/api
sudo -u uygulama DATABASE_PATH=/var/lib/uygulama/uygulama.db PORT=8310 \
  node --disable-warning=ExperimentalWarning scripts/restore.ts /var/lib/uygulama/yedek/<dosya>.db --onayla
sudo systemctl start uygulama && curl -s http://127.0.0.1:8310/api/health
```

Betik yalnız veritabanı yolunu (ve sunucunun hâlâ çalışıp çalışmadığını anlamak için kapıyı) ister; şimdiki
dosyayı `uygulama.db.onceki-<zaman>` adıyla kenara alır. İlk yönetici: ortam dosyasındaki `ADMIN_EMAILS`
adresiyle siteden kaydolan kişi yönetici olur (hemen kendiniz kaydolun).

**8. Yedeği makine dışına alın** (yedekler aynı diskte durur; disk giderse yedek de gider):

```bash
rsync -a sunucu:/var/lib/uygulama/yedek/ ~/uygulama-yedekleri/      # kendi bilgisayarınızdan, düzenli
```

Yedekler şifrelenmez; e-posta adresleri ve kayıtlar içerir.

### Güncelleme ve geri dönüş

```bash
cd /srv/proje && bash yayin/guncelle.sh        # yedek → git pull → npm ci → build → restart → sağlık (60 sn)
```

Sağlık denetimi geçmezse: `journalctl -u uygulama -n 100 --no-pager`. Geri dönüş: `git -C /srv/proje log
--oneline -3` ile önceki kaydı bulun → `git -C /srv/proje checkout <önceki>` → 3. ve 4. adımlar (`npm ci`,
`npm run build`, `sudo systemctl restart uygulama`). Yeni sürüm bir migrasyon uyguladıysa eski kod yeni
şemayı tanımayabilir: o zaman güncellemeden hemen önce alınan yedeği 7. adımdaki gibi geri yükleyin.
Site için: `ln -sfn /srv/site/surumler/<önceki> /srv/site/current` (derleme gerekmez).

## Nasıl doğrulanır

```bash
python havuz/tarifler/tarif.py dogrula tek-sunucuda-yayin
```

(~2 dk.) Bu ortamda systemd PID 1 değil, Caddy yok; **yapılabilenin hepsi** yapılır:

| Denetim | Sonuç |
| --- | --- |
| `uygulama` `npm run check` (yedek saklama kuralı + geri yükleme tatbikatı testleri dahil) | çalıştırıldı |
| `uygulama.service`'in ExecStart'ıyla aynı `node` komutu + `uygulama.env.ornek` ayarlarıyla **üretim kipinde** başlatma; `/api/health`, web'in aynı kökenden CSP ve HSTS ile sunulması, `/assets` için `immutable` önbellek | çalıştırıldı |
| Sunucu çalışırken yedek (`--klasor --sakla 14`) → veri değişir → **SIGTERM** ile düzgün kapanış (çıkış 0, "kapandı") → `restore.ts --onayla` → yeniden başlatma → yedekteki kullanıcı giriş yapar, sonradan eklenen yok | çalıştırıldı |
| `saglik.sh`: sağlıklıyken çıkış 0; yanıt yokken 3 deneme + yeniden başlatma komutu | çalıştırıldı (systemctl yerine işaret dosyası) |
| `site-yayinla.sh` iki kez: iki sürüm, `current` en yenisi, sayfalar yerinde | çalıştırıldı |
| `systemd-analyze verify` (5 birim; `/usr/bin/node` bu makinenin node yoluyla değiştirilerek) | çalıştırıldı |
| `bash -n` (3 betik) | çalıştırıldı |
| shellcheck, `caddy validate`, birimlerin systemd tarafından gerçekten çalıştırılması, `guncelle.sh` uçtan uca | **denenmedi** (araç/ortam yok) |

## Sık sorunlar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| `systemctl status uygulama`: `status=203/EXEC` | `/usr/bin/node` yok (node başka yerde) | `command -v node` çıktısını birimdeki ExecStart'a yazın |
| Servis açılmıyor, günlükte `Ayarlar geçersiz …` | Ortam dosyasında eksik/yanlış değer (`APP_URL` https değil vb.) | İletideki değişkeni düzeltin; `sudo systemctl restart uygulama` |
| `SQLITE_CANTOPEN` / `attempt to write a readonly database` | Veritabanı `/var/lib/uygulama` dışında (`ProtectSystem=strict` başka yere yazdırmaz) | `DATABASE_PATH=/var/lib/uygulama/uygulama.db` |
| Bütün kullanıcılar birden `429` | `TRUST_PROXY=0`: Caddy arkasında herkes 127.0.0.1 görünür | Ortam dosyasında `TRUST_PROXY=1` (örnekte öyle) |
| Anlık güncellemeler gecikiyor | Vekil SSE'yi arabelleğe alıyor | Caddyfile'daki `flush_interval -1` satırı yerinde olmalı |
| `caddy` sertifika alamıyor | DNS henüz bu sunucuyu göstermiyor ya da 80/443 kapalı | `dig app.ornek.com`, güvenlik duvarı (`ufw allow 80,443/tcp`) |
| Yedek zamanlayıcısı çalışmamış | Birim etkin değil | `systemctl list-timers uygulama-*`; `journalctl -u uygulama-yedek` |
| `restore.ts`: "Sunucu çalışıyor görünüyor" | Sağlık ucu yanıt veriyor | `sudo systemctl stop uygulama` sonra yeniden |
| `restore.ts`: "Yedek okunamadı ya da bu uygulamanın veritabanı değil" | Yanlış dosya ya da bozuk kopya | Başka bir yedek seçin; veritabanına dokunulmadı |
| Site güncellenmiyor | Tarayıcı önbelleği ya da `current` eski sürümü gösteriyor | `ls -l /srv/site/current`; sayfayı zorla yenileyin |

## Küçük modele yaptırırken

- Sunucuda komut çalıştırmadan önce planı yazdırın ve her adımın çıktısını isteyin; "tek seferde kurulum
  betiği" yazdırmayın (yarıda kalınca nerede kaldığını kimse bilmez).
- Birim dosyalarındaki sertleştirme satırlarını ("çalışmıyor, kaldırayım") sildirmeyin; önce
  `journalctl -u uygulama -n 50` çıktısını okutun. `MemoryDenyWriteExecute` EKLETMEYİN (node'u bozar).
- Yedek/geri yükleme değişikliği isterse: "`api/scripts/retention.ts` ve `restore.ts`'e dokunacaksan önce
  `api/test/backupRestore.test.ts`'e senaryo ekle, `npm run check` yeşil olsun" deyin.
- Sırları (`MAIL_HTTP_KEY` vb.) sohbete yapıştırmayın; model yalnız değişken ADLARIYLA çalışsın.

## Bu tarif ne zaman YANLIŞ seçimdir

- Birden çok sunucu ya da yüksek erişilebilirlik gerekiyorsa: SQLite + bellek içi hız sınırı/anlık bildirim tek
  kopya ister (`uygulama/docs/YAYINLAMA.md` §7).
- Sunucu yönetmek istemiyorsanız: site için GitHub Pages/Netlify (`site/docs/YAYINLAMA.md`), uygulama için
  kalıcı diskli bir platform (Render + disk, Fly + birim) daha az bakım ister.
- Docker'la çalışan bir altyapınız varsa: `uygulama/Dockerfile` ve `docs/YAYINLAMA.md` §2 o yolu anlatır.
- Uygulama hesapsız (yalnız cihazda) kipte yayınlanıyorsa: sunucu gerekmez; `build:yerel` çıktısı site gibi
  durağan barındırmaya konur.

## Sınırlar

- **Gerçek bir sunucuda denenmedi.** systemd birimleri yalnız `systemd-analyze verify` ile, Caddyfile hiç
  doğrulanmadı (Caddy kurulamadı; söz dizimi Caddy belgelerindeki örneklere göre yazıldı), `guncelle.sh` yalnız
  `bash -n` ile denetlendi. İlk kurulumda adım adım izleyin ve `caddy validate` çalıştırın.
- Sertleştirme seçenekleri (`ProtectSystem=strict` vb.) bu uygulamayla systemd altında çalıştırılmadı; bir
  seçenek sorun çıkarırsa günlük iletisine göre gevşetin ve nedenini not edin.
- Yedekler aynı diskte ve şifresiz; makine dışına alma (rsync) elle kurulmalı. `--sakla` yalnız zaman damgalı
  adları siler, en yeni 3 yedeğe dokunmaz.
- Sağlık denetimi yalnız `/api/health`'e bakar (veritabanına bir sorgu atar); bildirim (e-posta/SMS) göndermez —
  `journalctl -u uygulama-saglik` ile izlenir.
- Site sürümleri ve geri dönüş yalnız `current` bağlantısıyla; Caddy'nin sembolik bağlantıyı istek anında
  çözmesi beklenir (denenmedi).
