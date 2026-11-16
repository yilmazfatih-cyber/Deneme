---
baslik: Sunucuda Linux temelleri
ozet: Sunucuda en sık gereken komutlar, dosya izinleri, süreç ve sinyaller (düzgün kapanış), systemd ile servis, günlüklere bakma ve disk doluluğu teşhisi.
etiketler: [linux, sunucu, systemd, sinyal, izinler, gunluk]
duzey: temel
guncellik: 2026-11
---

# Sunucuda Linux temelleri

> Bu notu ne zaman okumalı: bir VPS'e ilk kez bağlanırken; uygulamayı servis olarak çalıştırırken; "Permission
> denied", "No space left on device" ya da "sunucu durdurulunca yarım iş kaldı" gördüğünüzde.

## Temel fikir

Sunucu, ekranını görmediğiniz bir bilgisayardır; her şey SSH ile yazılan komutlarla yapılır. Üç konu sorunların
çoğunu açıklar:

1. **Kim neyi okuyabilir:** dosya izinleri ve uygulamanın hangi kullanıcıyla çalıştığı.
2. **Ne çalışıyor ve nasıl durur:** süreçler, sinyaller, servis yöneticisi (systemd).
3. **Disk neden doldu:** günlükler, yedekler, silinmiş ama hâlâ açık dosyalar.

Uygulama hiçbir zaman `root` olarak, `nohup node app.js &` ile ya da açık kalmış bir SSH oturumunda çalışmaz. Kendi
kullanıcısıyla, servis yöneticisinin altında çalışır; günlüğü servis yöneticisi toplar.

## En sık gereken komutlar

| Soru                                       | Komut                                                     | Not                                               |
| ------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------- |
| Hangi makinedeyim, kimim?                  | `hostname; whoami; uptime`                                | Üretimde mi deneme sunucusunda mı, önce bunu bilin |
| Disk dolu mu?                              | `df -h` · düğüm (inode) için `df -i`                      | `df -i` %100 ise boş yer olsa da dosya yazılamaz  |
| Hangi klasör büyük?                        | `sudo du -xh --max-depth=1 /var \| sort -h \| tail`       | `-x`: başka disklere geçmez                       |
| Bellek?                                    | `free -h`                                                 | "available" sütununa bakın, "free"e değil        |
| Ne çalışıyor, kim ne yiyor?                | `top` · `ps aux --sort=-%mem \| head`                     |                                                   |
| Hangi süreç hangi kapıyı dinliyor?         | `sudo ss -tlnp`                                           | `0.0.0.0:8310` herkese açık, `127.0.0.1:8310` yalnız makineye |
| Servis ne durumda?                         | `systemctl status uygulama`                               | Son günlük satırlarını da gösterir                |
| Servisin günlüğü                           | `journalctl -u uygulama -n 200 --no-pager` · canlı: `-f`  | `--since "1 hour ago"` ile daraltın              |
| Uygulama kendine yanıt veriyor mu?         | `curl -sS -i http://127.0.0.1:8310/api/health`            | Vekili atlayarak doğrudan uygulamayı dener        |
| Dosya kopyalama (yerel ↔ sunucu)           | `scp yerel.txt kullanici@sunucu:/yol/` · `rsync -avz`     | `rsync` yarıda kalırsa kaldığı yerden sürer       |
| İzin ve sahip                              | `ls -l` · `stat dosya` · `namei -l /tam/yol`              | `namei` yol boyunca her klasörün iznini gösterir  |
| Paket güncelleme (Debian/Ubuntu)           | `sudo apt update && sudo apt upgrade`                     |                                                   |
| Zamanlanmış işler                          | `crontab -l` · `systemctl list-timers`                    |                                                   |

Yıkıcı komutlardan önce (`rm -rf`, `chmod -R`, `chown -R`, veritabanı komutları) `pwd` ve `hostname` ile nerede
olduğunuza bakın; yolu değişkenle değil tam yazın.

## Dosya izinleri

Her dosyanın bir sahibi, bir grubu ve üç izin kümesi vardır: sahip / grup / herkes; her kümede okuma (4), yazma (2),
çalıştırma (1). `640` = sahip okur-yazar, grup okur, herkes hiçbir şey.

| Ne                                         | İzin  | Sahip                       |
| ------------------------------------------ | ----- | --------------------------- |
| `.env`, gizli anahtar, sertifika anahtarı  | `600` | uygulama kullanıcısı (ya da root, systemd okuyorsa) |
| Gizli olmayan yapılandırma                 | `644` | root                        |
| Uygulamanın veri klasörü (`/var/lib/uygulama`) | `700` ya da `750` | uygulama kullanıcısı |
| Betik                                      | `750` | root ya da dağıtım kullanıcısı |
| `~/.ssh` klasörü / `authorized_keys`       | `700` / `600` | o kullanıcı         |

Yeni dosyanın izni `umask` ile belirlenir. "Permission denied" hatası `chmod 777` ile çözülmez: kimin hangi işlem
için erişmesi gerektiğini bulun, yalnız ona izin verin.

```bash calistir
umask 077 # bu kabukta yeni dosyalar yalnız sahibine açık
printf 'MAIL_HTTP_KEY=gizli\n' > .env
stat -c '%a %n' .env
umask 022 # çoğu sistemin varsayılanı
printf 'LOG_LEVEL=info\n' > ayar.conf
stat -c '%a %n' ayar.conf
chmod 777 ayar.conf # YANLIŞ: izin hatasını böyle "çözmek"
find . -type f -perm -o+w -printf 'herkes yazabilir: %p\n'
chmod 640 ayar.conf
stat -c '%a %n' ayar.conf
```

```cikti
600 .env
644 ayar.conf
herkes yazabilir: ./ayar.conf
640 ayar.conf
```

Sunucuda bu `find` komutunu uygulama klasöründe çalıştırın (`find /srv/uygulama -perm -o+w`): çıktı boş olmalı.

## Süreçler ve sinyaller

Bir süreci durdurmak ona **sinyal** göndermektir:

| Sinyal          | Kim gönderir                                      | Uygulama yakalayabilir mi | Beklenen davranış                    |
| --------------- | ------------------------------------------------- | ------------------------- | ------------------------------------ |
| `SIGTERM` (15)  | `kill`, systemd, Docker, PaaS dağıtımı            | Evet                      | Düzgün kapan                         |
| `SIGINT` (2)    | Terminalde Ctrl+C                                 | Evet                      | Düzgün kapan                         |
| `SIGHUP` (1)    | Terminal kapanınca; bazı sunucularda "ayarı yeniden oku" | Evet               | nginx gibi programlarda yeniden yükle |
| `SIGKILL` (9)   | `kill -9`, zaman aşımından sonra systemd/Docker   | **Hayır**                 | Anında ölüm; hiçbir temizlik yok     |

**Düzgün kapanış** sırası: yeni bağlantı almayı bırak → süren istekleri bitir → uzun bağlantıları (SSE, WebSocket)
kapat → veritabanını kapat → `0` ile çık. Bunun bir üst süresi olmalı ve bu süre, servis yöneticisinin `SIGKILL`
göndermeden önce beklediği süreden kısa olmalıdır. Havuzdaki API bunu yapar:
[`api/src/index.ts`](../../uygulama/api/src/index.ts) (10 sn sonra zorla çıkar).

Aşağıdaki betik yarım bir dosya yazıyor. `SIGTERM` gelince temizliyor; `SIGKILL` gelince temizlik çalışamıyor:

```bash calistir
cat > is.sh <<'BETIK'
temizle() {
  kill "$cocuk" 2> /dev/null
  rm -f yarim.tmp
  echo "SIGTERM: temizlendi, çıkılıyor"
  exit 0
}
trap temizle TERM
echo veri > yarim.tmp
sleep 5 > /dev/null &
cocuk=$!
echo "$cocuk" > cocuk.pid
wait "$cocuk" # sinyal yalnız kabuğa gelirse ön plandaki komut bitmeden tuzak çalışmaz; "& wait" bunu önler
BETIK

gonder() { # betiği başlat, hazır olunca yalnız ona sinyal gönder (Docker ve systemd gibi)
  rm -f cocuk.pid
  bash is.sh &
  local pid=$!
  until [ -s cocuk.pid ]; do sleep 0.05; done
  kill -s "$1" "$pid"
  wait "$pid" || echo "$1: çıkış kodu $?"
}
gonder TERM
test ! -e yarim.tmp && echo "SIGTERM sonrası yarım dosya yok"
{ gonder KILL; } 2> /dev/null
test -e yarim.tmp && echo "SIGKILL sonrası yarım dosya kaldı: temizlik çalışamadı"
kill "$(cat cocuk.pid)" # öksüz kalan çocuğu da kapatın
```

```cikti
SIGTERM: temizlendi, çıkılıyor
SIGTERM sonrası yarım dosya yok
KILL: çıkış kodu 137
SIGKILL sonrası yarım dosya kaldı: temizlik çalışamadı
```

Çıkış kodu `128 + sinyal numarası` kuralıyla okunur: `137` = `SIGKILL` (çoğu zaman bellek aşımında çekirdek
öldürmüştür), `143` = `SIGTERM`. Sinyalin kabuk betiklerinden ve Docker'dan uygulamaya nasıl ilettiği:
[Docker → PID 1](docker.md).

## Servis olarak çalıştırma (systemd)

Docker kullanmıyorsanız uygulamayı systemd birimiyle çalıştırın. Aşağıdaki dosya `systemd-analyze verify` ile
denetlendi (node yolu bu makineye göre değiştirilerek):

```ini
# /etc/systemd/system/uygulama.service
[Unit]
Description=Uygulama API
After=network-online.target
Wants=network-online.target

[Service]
User=uygulama
Group=uygulama
WorkingDirectory=/srv/uygulama/api
# root:root 600 olabilir: dosyayı uygulama değil systemd okur
EnvironmentFile=/etc/uygulama/uygulama.env
# Tam yol: `command -v node`. npm start DEĞİL (npm sinyali her ortamda iletmez)
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning src/index.ts
Restart=on-failure
RestartSec=5
KillSignal=SIGTERM
# Uygulamanın kendi kapanış süresinden (10 sn) uzun olmalı
TimeoutStopSec=20
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
# /var/lib/uygulama'yı açar; ProtectSystem=strict altında da yazılabilir kalır
StateDirectory=uygulama

[Install]
WantedBy=multi-user.target
```

```bash
sudo useradd --system --home-dir /var/lib/uygulama --shell /usr/sbin/nologin uygulama
sudo systemctl daemon-reload              # birim dosyası her değiştiğinde
sudo systemctl enable --now uygulama      # açılışta başlasın + şimdi başlat
systemctl status uygulama
journalctl -u uygulama -f
```

`DATABASE_PATH=/var/lib/uygulama/uygulama.db` yazın. Birim dosyasını değiştirip `daemon-reload` unutulursa eski
ayarla çalışmaya devam eder.

## Günlüklere bakma

| Nerede                         | Komut                                                                      |
| ------------------------------ | -------------------------------------------------------------------------- |
| systemd servisi                | `journalctl -u uygulama --since "30 min ago" --no-pager`                   |
| Yalnız hatalar (JSON günlük)   | `journalctl -u uygulama -o cat \| jq -c 'select(.level == "error")'`       |
| Docker kapsayıcısı             | `docker logs --since 30m -f uygulama`                                      |
| nginx                          | `/var/log/nginx/access.log`, `/var/log/nginx/error.log`                    |
| Açılış ve çekirdek (bellek aşımı) | `journalctl -k \| grep -i "out of memory"`                              |

Hata ararken önce **zamanı** daraltın (kullanıcı ne zaman hata gördü), sonra istek kimliğiyle (`requestId`)
o isteğin bütün satırlarını bulun. Günlük çözümleme örneği: [İzleme ve uyarı](izleme-ve-uyari.md).

## Disk doluluğu teşhisi

Belirtiler: veritabanı yazamıyor (`database or disk is full`), günlük durdu, SSH ile giriş bile yavaş. Sıra:

1. `df -h` → hangi bölüm dolu? `df -i` → düğümler mi bitti (çok sayıda küçük dosya)?
2. `sudo du -xh --max-depth=1 / | sort -h | tail` ile büyük klasöre inin.
3. Olağan şüpheliler: `/var/log` (döndürülmeyen günlük), `journalctl --disk-usage` (gerekirse
   `sudo journalctl --vacuum-size=500M`), Docker (`docker system df`; kullanılmayan imajlar), eski yedekler,
   kapsayıcı günlükleri ([Docker Compose → günlük döndürme](docker-compose.md)).
4. `df` dolu diyor ama `du` toplamı tutmuyorsa: **silinmiş ama hâlâ açık dosya**. Bir süreç dosyayı açık
   tuttukça silinen dosyanın yeri geri verilmez.

```bash calistir
head -c 5000000 /dev/zero > uygulama.log
sleep 30 3>> uygulama.log & # günlüğü açık tutan süreç (gerçekte uygulamanız)
yazan=$!
rm uygulama.log # "yer açmak" için silindi
ls uygulama.log 2> /dev/null || echo "ls: dosya görünmüyor"
find "/proc/$yazan/fd" -lname '*(deleted)' | wc -l | xargs echo "silinmiş ama açık dosya:"
stat -L -c 'hâlâ diskte: %s bayt' "/proc/$yazan/fd/3"
: > "/proc/$yazan/fd/3" # çözüm 1: içeriği boşalt, süreç çalışmaya devam eder
stat -L -c 'boşaltıldı: %s bayt' "/proc/$yazan/fd/3"
kill "$yazan" # çözüm 2: süreci yeniden başlatmak dosyayı bırakır
```

```cikti
ls: dosya görünmüyor
silinmiş ama açık dosya: 1
hâlâ diskte: 5000000 bayt
boşaltıldı: 0 bayt
```

Sunucunun tamamında arama: `sudo find /proc/*/fd -lname '*(deleted)' 2>/dev/null` (ya da kuruluysa `sudo lsof
+L1`). Kalıcı çözüm: günlüğü dosyaya değil standart çıktıya yazın ya da döndürme aracı süreci yeniden açtırsın.

## Yeni sunucuda ilk saat

1. Kendi kullanıcınızı açın, `sudo` yetkisi verin, SSH **anahtarınızı** ekleyin; yeni bir pencereden anahtarla
   girebildiğinizi deneyin.
2. Ancak sonra SSH'ta parola ile girişi ve `root` girişini kapatın (`PasswordAuthentication no`,
   `PermitRootLogin no`), SSH'ı yeniden başlatın, **eski pencereyi kapatmadan** yeni pencereden deneyin.
3. Güvenlik duvarında **önce** SSH'a izin verin, sonra açın (`sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp
   && sudo ufw enable`). Sıra ters olursa sunucuya bir daha giremezsiniz.
4. Otomatik güvenlik güncellemelerini açın (Debian/Ubuntu: `unattended-upgrades`).
5. Saat dilimini UTC bırakın; günlük ve zamanlanmış işler karışmaz. Kullanıcıya gösterirken çevirin.

## Tuzaklar

| Belirti                                                          | Neden                                                    | Çözüm                                                              |
| ---------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------ |
| SSH anahtarı doğru ama "Permission denied (publickey)"           | `~/.ssh` ya da `authorized_keys` izni fazla açık         | `chmod 700 ~/.ssh; chmod 600 ~/.ssh/authorized_keys`               |
| Güvenlik duvarını açınca sunucuya giriş kesildi                  | SSH'a izin verilmeden `ufw enable`                       | Sağlayıcının web konsolundan girip izin ekleyin; sıra: izin → aç  |
| Uygulama SSH oturumu kapanınca duruyor                           | Terminalde `node app.js &` ile başlatılmış               | systemd birimi ya da Docker `--restart unless-stopped`             |
| Servis yeniden başlıyor ama değişiklik yok                       | Birim dosyası değişti, `daemon-reload` yapılmadı         | `sudo systemctl daemon-reload` sonra `restart`                     |
| `Restart=on-failure # açıklama` yazıldı, servis hiç yeniden kalkmıyor | systemd satır sonu yorumu bilmez; `#` değere karışır, ayar yok sayılır | Yorum ayrı satırda; `systemd-analyze verify` uyarılarını okuyun (çıkış kodu 0 olsa da) |
| `status=203/EXEC`, servis başlamıyor                             | `ExecStart` yolu yanlış; node `nvm` ile kullanıcı klasöründe | Tam yol (`command -v node`); sistem genelinde kurulu node       |
| Servis "start request repeated too quickly" ile durdu            | Açılışta hemen çöküyor; systemd yeniden denemeyi bıraktı | `journalctl -u` ile ilk hatayı okuyun; düzeltip `reset-failed`     |
| `systemctl stop` uzun sürüyor, sonra kesiliyor                   | Uygulama `SIGTERM`'i işlemiyor; `SIGKILL` bekleniyor     | Kapanış işleyicisi; npm/sh aracısı olmadan doğrudan node           |
| Yeniden başlatmada yarım dosya, bozuk kayıt                      | `kill -9` alışkanlığı                                    | Önce `SIGTERM`, bekleyin; `-9` son çare                            |
| Çıkış kodu 137, günlükte hata yok                                | Bellek aşımı; çekirdek öldürdü                           | `journalctl -k`; bellek sızıntısı ya da daha büyük plan            |
| `df` %100, `du` toplamı çok daha az                              | Silinmiş ama açık dosya                                  | `find /proc/*/fd -lname '*(deleted)'`; süreci yeniden başlatın     |
| Boş yer var ama "No space left on device"                        | Düğümler (inode) bitti                                   | `df -i`; milyonlarca küçük dosyayı (oturum, önbellek) temizleyin   |
| Uygulama dosyaya yazamıyor: EACCES                               | Veri klasörünün sahibi root                              | `chown uygulama:uygulama /var/lib/uygulama` (ya da `StateDirectory=`) |
| `chmod 777` sonrası "çalışıyor"                                  | Herkese yazma izni: saldırı yüzeyi                       | Doğru sahip ve en dar izin; `find -perm -o+w` boş olmalı           |

## Denetim listesi

- [ ] Uygulama kendi sistem kullanıcısıyla çalışıyor; `root` değil (`ps -o user= -C node`).
- [ ] Uygulama systemd ya da Docker altında; sunucu yeniden başlatılınca kendiliğinden kalkıyor (denendi).
- [ ] `systemctl stop` birkaç saniyede bitiyor; günlükte "kapandı" satırı var, "zorla" yok.
- [ ] `.env` / ortam dosyası `600`; uygulama klasöründe herkesin yazabildiği dosya yok.
- [ ] SSH yalnız anahtarla; `root` girişi kapalı; güvenlik duvarında yalnız 22, 80, 443 açık.
- [ ] `ss -tlnp` çıktısında uygulama kapısı `127.0.0.1` üzerinde; dışarıya yalnız vekil açık.
- [ ] Otomatik güvenlik güncellemeleri açık.
- [ ] Günlük boyutu sınırlı (journald ya da döndürme); disk doluluğu için uyarı var.

## Küçük modele yaptırırken

- **İsteme yazın:** "Her komutu çalıştırmadan önce ne yapacağını bir cümleyle açıkla. `rm -rf`, `chmod -R 777`,
  `kill -9` önerme. Komutların çıktısını bana göster, yorumu sonra yap."
- **Modelin tipik hatası:** izin sorununa `chmod 777` ya da `sudo` ile yanıt vermek; uygulamayı `nohup npm start &`
  ile başlatmak; `ExecStart`'ta `npm start` ya da göreli yol yazmak; birim dosyasından sonra `daemon-reload`'u
  unutmak; güvenlik duvarını SSH izninden önce açmak.
- **Çıktıda denetleyin:** birim dosyasında `User=` var mı, `ExecStart` tam yol mu, `TimeoutStopSec` uygulamanın
  kapanış süresinden uzun mu; komut listesinde `ufw enable` SSH izninden sonra mı.
- **Teşhiste:** modele tahmin ettirmeyin; `df -h`, `df -i`, `journalctl -u … -n 100` çıktılarını olduğu gibi
  yapıştırın.

## İlgili

- [Docker](docker.md) — PID 1 ve sinyallerin kapsayıcıda iletilmesi
- [İzleme ve uyarı](izleme-ve-uyari.md) · [Veritabanı yedekleme](veritabani-yedekleme.md) (zamanlanmış yedek)
- [Ters vekil](ters-vekil.md) — uygulamayı `127.0.0.1`'de tutup dışarıya vekili açmak
- [Kabuk ve Bash](../10-diller/kabuk-ve-bash.md) — tırnaklama, `set -euo pipefail`, `trap` ile temizlik
- [Hata ayıklama](../00-yontem/hata-ayiklama.md) — ortam farkını listeleme
- Çalışan karşılık: [`uygulama/docs/YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md) → "Süreç yöneticisiyle"
