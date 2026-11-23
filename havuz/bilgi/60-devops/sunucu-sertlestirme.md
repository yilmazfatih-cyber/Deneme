---
baslik: "Sunucu sertleştirme: yeni bir VPS'te ilk 30 dakika"
ozet: Yeni sunucuda sırayla kurtarma yolu, kişisel kullanıcı ve SSH anahtarı, parola ve root girişini kapatıp etkin ayarı doğrulama, güvenlik duvarı ve Docker tuzağı, otomatik güncelleme, fail2ban ve açık kapı denetimi.
etiketler: [sunucu, guvenlik, ssh, guvenlik-duvari, linux, devops]
duzey: orta
guncellik: 2026-11
---

# Sunucu sertleştirme: yeni bir VPS'te ilk 30 dakika

> Bu notu ne zaman okumalı: yeni bir VPS kiralandığında, uygulama kurulmadan **önce**; var olan bir sunucuyu
> devralırken; "SSH günlüğü binlerce başarısız girişle dolu", "veritabanı kapısı internetten açık çıktı" bulgularında.
> Komutların kısa özeti [Sunucuda Linux temelleri](linux-temelleri.md) → "Yeni sunucuda ilk saat" bölümündedir; bu
> not sırayı, her adımın doğrulamasını ve sahadaki tuzakları verir.

## Temel fikir

Herkese açık bir IP adresi aldığınız dakikalar içinde otomatik tarayıcılar SSH'ı ve yaygın veritabanı kapılarını
denemeye başlar. İlk 30 dakikanın dört hedefi vardır:

1. **Yalnız siz girebilin:** kişisel kullanıcı, SSH anahtarı; parola ve `root` girişi kapalı.
2. **Yalnız gereken kapılar açık olsun:** dışarıya 22, 80, 443; uygulama ve veritabanı yalnız `127.0.0.1`'de.
3. **Güvenlik yamaları kendiliğinden gelsin:** otomatik güvenlik güncellemesi ve yeniden başlatma planı.
4. **Bir şey ters giderse yine girebilin:** sağlayıcının web konsolu (kurtarma yolu) her adımdan önce bilinir.

Sıra önemlidir: önce yeni giriş yolunu kurup **denersiniz**, sonra eskisini kapatırsınız. Ayar dosyasına yazmak yetmez;
etkin ayarı sunucuya sorarak doğrularsınız.

## Karar tablosu: hangi önlem, ne kadar önemli

| Önlem                                         | Neye karşı                                   | Öncelik           | Bedel / not                                              |
| --------------------------------------------- | -------------------------------------------- | ----------------- | -------------------------------------------------------- |
| SSH yalnız anahtarla; parola girişi kapalı    | Parola deneme saldırısı                      | Zorunlu           | Anahtar kaybolursa kurtarma konsolu gerekir              |
| `root` ile doğrudan giriş kapalı              | Tek adımda tam yetki                         | Zorunlu           | Kişisel kullanıcı + `sudo`                               |
| Güvenlik duvarı: varsayılan ret, 22/80/443    | Yanlışlıkla açılan servis                    | Zorunlu           | IPv6'yı da kapsadığını denetleyin                        |
| Veritabanı ve uygulama `127.0.0.1`'de         | İnternetten veritabanına doğrudan erişim     | Zorunlu           | Docker'da `-p 127.0.0.1:…` biçimi                        |
| Otomatik güvenlik güncellemesi                | Bilinen açıklar                              | Zorunlu           | Çekirdek yaması yeniden başlatma ister                   |
| Sağlayıcı güvenlik duvarı (bulut paneli)      | Sunucudaki duvar yanlış ayarlanırsa          | Önerilir          | İkinci katman; sunucu ayarından bağımsız                 |
| SSH'ı internete hiç açmamak (özel ağ, VPN)    | SSH'taki gelecekteki açıklar, gürültü        | Önerilir          | Özel ağ aracı kurulumu; kurtarma yolu şart               |
| fail2ban                                      | Günlük gürültüsü, parolalı servisler         | İsteğe bağlı      | Anahtarlı SSH'ta güvenlik kazancı küçüktür (aşağıda)     |
| SSH kapısını değiştirmek                      | Günlük gürültüsü                             | İsteğe bağlı      | Güvenlik sağlamaz; yalnız gürültüyü azaltır              |
| Zaman eşitleme açık                           | TLS, TOTP ve günlük zamanlarının bozulması   | Zorunlu (denetim) | Çoğu dağıtımda hazır gelir                               |

## İlk 30 dakika: sıralı adımlar

Komutlar Ubuntu/Debian içindir (RHEL ailesinde SSH servisinin adı `sshd`, paket yöneticisi `dnf`). Bu ortamda
`sshd` ve `ufw` kurulu olmadığı için komutlar burada çalıştırılmadı; ayar adlarını kurulu sürümün belgesinden
(`man sshd_config`) doğrulayın.

**0. Kurtarma yolu (dakika 0).** Sağlayıcının panelinde web konsolunu bulun ve bir kez açın; mümkünse ilk anlık
görüntüyü (snapshot) alın. Bu adım, sonraki her hatanın geri dönüş yoludur.

**1. Güncelle.** `sudo apt update && sudo apt full-upgrade -y`; çekirdek güncellendiyse yeniden başlatın.
Doğrulama: `ls /var/run/reboot-required` dosya yok demeli.

**2. Kişisel kullanıcı ve anahtar.**

```bash
sudo adduser deploy                                   # parolası sudo için; SSH girişi için değil
sudo usermod -aG sudo deploy
sudo install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
sudo install -m 600 -o deploy -g deploy /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
```

Doğrulama: **yeni** bir terminalden `ssh deploy@sunucu` ve `sudo -v`. Eski oturumu kapatmayın. Anahtarınız yoksa kendi
bilgisayarınızda `ssh-keygen -t ed25519` (parolalı); kişi ve cihaz başına ayrı anahtar, paylaşılan anahtar yok.

**3. SSH'ı kapat ve etkin ayarı doğrula.** Ayarı ana dosyaya değil, **önce okunan** bir ek dosyaya yazın:

```bash
sudo tee /etc/ssh/sshd_config.d/00-sertlestirme.conf > /dev/null <<'AYAR'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
AllowUsers deploy
AYAR
sudo sshd -t                     # sözdizimi; hata varsa yeniden yüklemeyin
sudo systemctl reload ssh
sudo sshd -T | grep -Ei '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin|allowusers) '
```

Doğrulama: `sshd -T` çıktısında dört satır da beklendiği gibi; yeni terminalden parolayla girmeyi deneyin:
`ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password,keyboard-interactive deploy@sunucu` →
"Permission denied (publickey)" görmelisiniz.

**4. Güvenlik duvarı.**

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH           # ÖNCE izin, SONRA açma; ters sıra sizi dışarıda bırakır
sudo ufw allow 80,443/tcp
sudo ufw enable
sudo ufw status verbose
```

Doğrulama: `ufw status verbose` IPv4 ve `(v6)` satırlarını birlikte gösterir; göstermiyorsa `/etc/default/ufw`
içinde `IPV6=yes`. Sağlayıcının panelindeki güvenlik duvarında da aynı üç kapı.

**5. Docker kullanacaksanız: yayımlanan kapı duvarı atlar.** Docker, `-p` ile yayımladığı kapılar için iptables'a
kendi kurallarını ekler; bu trafik ufw'nin gelen kurallarından geçmez. `-p 5432:5432` yazılan veritabanı, ufw
"reddet" dese de internetten açıktır. Her zaman `-p 127.0.0.1:5432:5432` yazın ya da kapıyı hiç yayımlamayıp
kapsayıcıları aynı Docker ağında konuşturun ([Docker Compose](docker-compose.md)). Doğrulama dışarıdan yapılır:
kendi bilgisayarınızdan `nc -vz sunucu 5432` bağlanamamalı.

**6. Otomatik güvenlik güncellemesi.**

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

Çekirdek ve temel kitaplık yamaları yeniden başlatma ister. İki yol: `/etc/apt/apt.conf.d/50unattended-upgrades`
içinde kendiliğinden yeniden başlatmayı bir saate kurmak (`Unattended-Upgrade::Automatic-Reboot` ve
`…-Reboot-Time`; dosyada yorumlu olarak bulunur, kurulu dosyadan doğrulayın) ya da `/var/run/reboot-required` için
uyarı kurup elle başlatmak. Tek kopyalı bir uygulamada yeniden başlatma kısa bir kesintidir; trafiğin az olduğu
saati seçin.

**7. Açık kapı denetimi.** `sudo ss -tulpn`: dışarıya (`0.0.0.0`, `[::]`, `*`) yalnız 22, 80, 443; geri kalan her şey
`127.0.0.1` ya da `[::1]` üzerinde (aşağıdaki denetleyici).

**8. Zaman ve günlük.** `timedatectl` → "System clock synchronized: yes". Girişleri izleyin: `journalctl -u ssh
--since today`, `last -n 20`. Saat dilimini UTC bırakın.

## Neden ana dosya yetmez: "ilk değer kazanır"

`sshd` her anahtar için **ilk okuduğu** değeri kullanır ve Ubuntu'nun ana dosyası `sshd_config.d/*.conf`
dosyalarını en başta okur. Bazı bulut imajları buraya parola girişini açan bir dosya bırakır (ör.
`50-cloud-init.conf`); ana dosyanın sonuna yazdığınız `PasswordAuthentication no` hiç uygulanmaz. Ayrıca
`PasswordAuthentication no` tek başına yetmez: `KbdInteractiveAuthentication yes` ve PAM ile parola yine sorulabilir.
Kuralın küçük bir benzetimi ve `sshd -T` çıktısına uygulanacak denetim:

```python calistir
from fnmatch import fnmatch

# OpenSSH'ın derlenmiş varsayılanları: dosyalarda yazmayan anahtar için geçerli olan
VARSAYILAN = {"passwordauthentication": "yes", "kbdinteractiveauthentication": "yes",
              "permitrootlogin": "prohibit-password", "pubkeyauthentication": "yes"}


def etkin_ayar(dosyalar: dict[str, str], ana: str = "/etc/ssh/sshd_config") -> dict[str, str]:
    """sshd kuralı: her anahtar için İLK okunan değer geçerli; Include bulunduğu yerde açılır (Match yok sayıldı)."""
    etkin: dict[str, str] = {}

    def oku(ad: str) -> None:
        for satir in dosyalar[ad].splitlines():
            anahtar, _, deger = satir.split("#", 1)[0].strip().partition(" ")
            if anahtar.lower() == "include":
                for alt in sorted(k for k in dosyalar if fnmatch(k, deger.strip())):
                    oku(alt)
            elif anahtar:
                etkin.setdefault(anahtar.lower(), deger.strip().lower())

    oku(ana)
    return {**VARSAYILAN, **etkin}


def denetle(etkin: dict[str, str]) -> list[str]:  # gerçekte girdi: `sudo sshd -T` çıktısının sözlüğü
    sorun = []
    if etkin["passwordauthentication"] != "no":
        sorun.append("parola ile giriş açık")
    if etkin["kbdinteractiveauthentication"] != "no":
        sorun.append("klavye etkileşimli giriş açık (PAM ile parola yine sorulabilir)")
    if etkin["permitrootlogin"] not in ("no", "prohibit-password"):
        sorun.append("root parolayla girebilir")
    return sorun


DOSYALAR = {
    "/etc/ssh/sshd_config": "Include /etc/ssh/sshd_config.d/*.conf\nPermitRootLogin no\nPasswordAuthentication no\n",
    "/etc/ssh/sshd_config.d/50-cloud-init.conf": "PasswordAuthentication yes\n",  # bulut imajının bıraktığı
}
print("ana dosyaya 'no' yazıldı:", denetle(etkin_ayar(DOSYALAR)))
DOSYALAR["/etc/ssh/sshd_config.d/00-sertlestirme.conf"] = (
    "PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin no\n"
)
assert denetle(etkin_ayar(DOSYALAR)) == []  # 00- önce okunur; ilk değer kazanır
print("00-sertlestirme.conf eklendi:", denetle(etkin_ayar(DOSYALAR)))
```

```cikti
ana dosyaya 'no' yazıldı: ['parola ile giriş açık', 'klavye etkileşimli giriş açık (PAM ile parola yine sorulabilir)']
00-sertlestirme.conf eklendi: []
```

Benzetim yalnız kuralı göstermek içindir (`Match` bloklarını ve her anahtarın özel durumlarını bilmez); karar
verirken her zaman sunucunun kendi çıktısına (`sudo sshd -T`) bakın.

## Açık kapı denetleyicisi

`sudo ss -tulpn` çıktısını yapıştırın; dışarıya açık ve izinli listede olmayan her dinleyiciyi bulur:

```python calistir
SS = """\
Netid State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process
udp   UNCONN 0      0      127.0.0.53%lo:53         0.0.0.0:*     users:(("systemd-resolve",pid=512,fd=13))
tcp   LISTEN 0      4096   127.0.0.53%lo:53         0.0.0.0:*     users:(("systemd-resolve",pid=512,fd=14))
tcp   LISTEN 0      128          0.0.0.0:22         0.0.0.0:*     users:(("sshd",pid=801,fd=3))
tcp   LISTEN 0      4096         0.0.0.0:443        0.0.0.0:*     users:(("caddy",pid=900,fd=7))
tcp   LISTEN 0      4096         0.0.0.0:5432       0.0.0.0:*     users:(("docker-proxy",pid=1200,fd=4))
tcp   LISTEN 0      511        127.0.0.1:8310       0.0.0.0:*     users:(("node",pid=1300,fd=21))
tcp   LISTEN 0      128             [::]:22            [::]:*     users:(("sshd",pid=801,fd=4))
tcp   LISTEN 0      511                *:6379             *:*     users:(("redis-server",pid=700,fd=6))
"""
IZINLI = {22, 80, 443}  # dışarıya açık olabilecek kapılar


def disa_acik(ss_ciktisi: str) -> list[str]:
    bulgular = []
    for satir in ss_ciktisi.splitlines()[1:]:
        alan = satir.split()
        adres, _, kapi = alan[4].rpartition(":")
        surec = alan[6].split('"')[1] if len(alan) > 6 else "?"
        yerel = adres.startswith("127.") or adres in ("[::1]", "localhost")
        if not yerel and int(kapi) not in IZINLI:
            not_ = " (Docker yayımladı: ufw kuralı bunu kesmeyebilir)" if surec == "docker-proxy" else ""
            bulgular.append(f"{alan[0]} {adres}:{kapi} {surec}{not_}")
    return bulgular


for bulgu in disa_acik(SS):
    print("DIŞARI AÇIK:", bulgu)
```

```cikti
DIŞARI AÇIK: tcp 0.0.0.0:5432 docker-proxy (Docker yayımladı: ufw kuralı bunu kesmeyebilir)
DIŞARI AÇIK: tcp *:6379 redis-server
```

Sunucu içinden yapılan denetim "dinleniyor mu"yu söyler; "dışarıdan ulaşılıyor mu"yu yalnız dışarıdan yapılan deneme
söyler (`nc -vz sunucu 5432` başka bir ağdan).

## fail2ban'ın yeri

fail2ban günlükleri okur, art arda başarısız giriş yapan adresi bir süre güvenlik duvarıyla engeller.

- Anahtarla girilen SSH'ta parola denemesi zaten başarısızdır; fail2ban burada **günlük gürültüsünü** azaltır,
  güvenliği az artırır. Asıl önlem parola girişini kapatmaktır.
- Parolayla korunan başka bir servis (ör. internete açık bir yönetim paneli) varsa değeri artar; ama doğrusu o paneli
  internete açmamaktır.
- Kendi adresinizi engelleme listesinin dışına yazın (`ignoreip`); yoksa birkaç yanlış denemede kendinizi kilitlersiniz.
- Uygulamanızın giriş ucunu korumanın yeri uygulamanın kendi hız sınırıdır ([Hız sınırı ve kötüye
  kullanım](../30-arkauc/hiz-siniri-ve-kotuye-kullanim.md)), fail2ban değil.

## Tuzaklar

| Belirti                                                          | Neden                                                         | Çözüm                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| `PasswordAuthentication no` yazıldı, parola hâlâ soruluyor        | Ek dosya önce okundu ve `yes` dedi; ya da klavye etkileşimli giriş açık | `00-` önekli ek dosya; `KbdInteractiveAuthentication no`; `sshd -T` |
| SSH ayarı değişti, sunucuya bir daha girilemedi                  | Yeni giriş denenmeden eski oturum kapatıldı; `sshd -t` atlandı | Eski oturum açıkken yenisini dene; kurtarma konsolu            |
| `ufw enable` sonrası bağlantı koptu                              | SSH izni verilmeden duvar açıldı                              | Önce `ufw allow OpenSSH`; konsoldan düzelt                     |
| ufw "reddet" diyor ama veritabanı internetten açık               | Docker yayımlanan kapı için duvarı atladı                     | `-p 127.0.0.1:…`; dışarıdan `nc` ile dene                      |
| IPv4 kapalı, IPv6'dan servis açık                                | Kural yalnız IPv4'e yazıldı; IPv6 kapalı sanıldı              | `ufw status verbose`'da `(v6)` satırları; `IPV6=yes`           |
| Redis/Postgres `0.0.0.0` dinliyor                                | Paket ya da kapsayıcı varsayılanı                             | `127.0.0.1`'e bağla; parola tek başına önlem değil             |
| Güvenlik güncellemesi kurulu ama çekirdek eski                   | Yeniden başlatma yapılmadı                                    | `/var/run/reboot-required` uyarısı ya da planlı başlatma       |
| Herkes aynı `root` anahtarıyla giriyor                           | Paylaşılan anahtar; kişi ayrılınca döndürülemiyor             | Kişi başına kullanıcı ve anahtar ([Çalışan erişimi](../50-guvenlik/calisan-erisimi-ve-ayrilis.md)) |
| fail2ban kurulduktan sonra siz engellendiniz                     | Kendi adresiniz istisna değil                                 | `ignoreip`; kurtarma konsolu                                   |
| TOTP kodları ve TLS el sıkışması ara sıra başarısız              | Saat kaymış                                                   | Zaman eşitleme açık mı (`timedatectl`)                         |

## Denetim listesi

- [ ] Sağlayıcının kurtarma konsolu bir kez açıldı; ilk anlık görüntü alındı.
- [ ] Kişisel kullanıcı `sudo` grubunda; anahtarla giriş yeni bir terminalden denendi.
- [ ] `sudo sshd -T` → `passwordauthentication no`, `kbdinteractiveauthentication no`, `permitrootlogin no`.
- [ ] Parolayla giriş denemesi "Permission denied (publickey)" ile reddedildi.
- [ ] `ufw status verbose`: varsayılan ret; yalnız 22, 80, 443; IPv6 satırları var. Sağlayıcı duvarı da aynı.
- [ ] `ss -tulpn`: dışarıya yalnız 22/80/443; uygulama ve veritabanı `127.0.0.1`'de; dışarıdan `nc` ile veritabanı
      kapısına bağlanılamadı.
- [ ] Otomatik güvenlik güncellemesi açık; yeniden başlatma kararı (kendiliğinden ya da uyarıyla) verildi.
- [ ] Zaman eşitlemesi açık; saat dilimi UTC.
- [ ] Girişler izleniyor; beklenmeyen SSH girişi için uyarı ya da düzenli bakış var.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu VPS'i şu sırayla sertleştir: kurtarma konsolu, güncelleme, `deploy` kullanıcısı ve anahtar,
  `sshd_config.d/00-sertlestirme.conf`, `sshd -t`, yeniden yükleme, `sshd -T` ile doğrulama, ufw (önce SSH izni),
  otomatik güncelleme, `ss -tulpn` denetimi. Her adımdan sonra doğrulama komutunu ve beklenen çıktıyı yaz; benden
  çıktıyı iste, sonra devam et. Eski SSH oturumunu kapatmamamı hatırlat."
- **Modelin tipik hatası:** ayarı ana dosyanın sonuna yazıp "tamam" der; `KbdInteractiveAuthentication`'ı unutur;
  `ufw enable`'ı SSH izninden önce yazar; Docker kapısını `-p 5432:5432` bırakır; doğrulamayı sunucu içinden
  `curl localhost` ile yapar; kapı değiştirmeyi ya da fail2ban'ı asıl önlem gibi sunar.
- **Çıktıda arayın:** `sshd -T` doğrulaması var mı; `ufw allow OpenSSH`, `ufw enable`'dan önce mi; bütün `-p`
  yayınları `127.0.0.1:` ile mi başlıyor; dışarıdan deneme adımı var mı.

## İlgili

- [Sunucuda Linux temelleri](linux-temelleri.md) (izinler, systemd, günlük) · [Ters vekil](ters-vekil.md) ·
  [HTTPS ve sertifikalar](https-ve-sertifikalar.md) · [Docker](docker.md) · [Docker Compose](docker-compose.md)
- [Kapsayıcı güvenliği](kapsayici-guvenligi.md) · [Uygulama yayın tarifi](uygulama-yayin-tarifi.md) ·
  [İlk yayın denetim listesi](ilk-yayin-denetim-listesi.md)
- [Yayın öncesi güvenlik denetimi](../50-guvenlik/yayin-oncesi-guvenlik-denetimi.md) ·
  [Çalışan erişimi ve ayrılış](../50-guvenlik/calisan-erisimi-ve-ayrilis.md) · [Sır yönetimi](../50-guvenlik/sir-yonetimi.md)
