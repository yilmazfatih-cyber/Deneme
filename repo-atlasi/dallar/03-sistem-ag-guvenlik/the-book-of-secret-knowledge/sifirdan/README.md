# denetim — kendi sunucun için sıfırdan öz denetim araç seti

The Book of Secret Knowledge, sistem yöneticisinin her gün kullandığı araçların bir **listesidir**. Bu mini,
listedeki savunma araçlarının (ssh-audit, testssl.sh, Lynis, `lsof`/`netstat`) ve listede olmayan fail2ban fikrinin çekirdek mekanizmalarını
sıfırdan, yalnız Python standart kitaplığıyla yeniden kurar (~560 satır kod, ~320 satır test).

> **Kapsam ve etik:** Araçlar yalnızca senin sahibi olduğun ya da denetleme yetkin olan sistemlerin **dosyalarını**
> okur (yapılandırma, `/proc` tabloları, günlükler, sertifikalar). Hiçbir modül ağda tarama yapmaz; tek ağ işlemi,
> açıkça verdiğin bir TLS sunucusuyla el sıkışıp sertifikasını almaktır.

## Gereksinimler

Python 3.10+. İsteğe bağlı: `openssl` (canlı TLS testi geçici bir sertifika üretir; yoksa test atlanır).

## Çalıştırma

```bash
cd sifirdan
python3 -m denetim sshd ornekler/sshd_config_zayif           # zayıf ayarlar → çıkış kodu 1
python3 -m denetim sshd /etc/ssh/sshd_config                 # kendi makinen (okuma izni gerekir)
python3 -m denetim soket ornekler/proc_net_tcp ornekler/proc_net_tcp6
python3 -m denetim soket                                     # argümansız: bu makinenin /proc/net/tcp{,6}
python3 -m denetim tls --pem ornekler/sertifika.pem
python3 -m denetim tls --sunucu ornek.com.tr:443             # yalnız kendi sunucun için
python3 -m denetim log ornekler/auth_log.txt --yil 2026     # örnek auth.log (uzantı .txt: kök .gitignore *.log'u dışlar)
python3 -m denetim --json --esik orta sshd ornekler/sshd_config_saglam   # CI için: JSON + eşik
```

Her bulgu: **önem** (bilgi, düşük, orta, yüksek, kritik), kural kimliği (`SSH-001`...), açıklama, öneri ve konum
(`dosya:satır`, `ip:port`). Eşik ve üstü bulgu varsa çıkış kodu 1 olur; bu sayede bir CI işine ya da cron'a bağlanabilir.

## Test

```bash
python3 -m unittest discover -s . -t .      # 31 test; örnek dosyalar ornekler/ altında
```

## Aşamalar

| Aşama | Modül                    | Ne yapar                                                                                            | Gerçek dünyadaki karşılığı              |
| ----- | ------------------------ | --------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 1     | `denetim/bulgu.py`       | Ortak bulgu modeli, önem sıralaması, metin/JSON rapor, çıkış kodu                                   | SARIF, Lynis raporu                     |
| 2     | `denetim/sshd.py`        | `sshd_config` ayrıştırma: ilk değer kazanır, `Match` blokları, `Include` uyarısı, varsayılanlar     | ssh-audit, `sshd -T`, CIS kontrolleri   |
| 3     | `denetim/soketler.py`    | `/proc/net/tcp{,6}` onaltılık adres çözme, dinleyen portlar, dışa açık hassas servisler             | `ss -ltnp`, `netstat -ltn`              |
| 4     | `denetim/sertifika.py`   | DER/ASN.1'i elle ayrıştırıp X.509 geçerlilik tarihleri, CN, kendinden imzalı tespiti                | testssl.sh, `openssl x509 -dates`       |
| 5     | `denetim/kaba_kuvvet.py` | auth.log'da kayan pencere: kaba kuvvet, kullanıcı adı taraması, dağıtık deneme, ele geçirme şüphesi | fail2ban (tespit kısmı), SIEM kuralları |
| 6     | `denetim/__main__.py`    | Tek komut satırı, `--json`, `--esik`                                                                | —                                       |

## Öğretici ayrıntılar

- **`sshd_config`'de ilk değer kazanır.** `ornekler/sshd_config_zayif` 4. satırda `PermitRootLogin yes`, 13. satırda
  `no` der; etkili olan `yes`'tir. Ubuntu'daki gibi dosyanın başında `Include /etc/ssh/sshd_config.d/*.conf` varsa,
  oradaki dosyalar ana dosyadaki ayarları ezer. Gerçek etkin ayarı `sudo sshd -T` gösterir.
- **`/proc/net/tcp` adresleri ters görünür.** Çekirdek (`net/ipv4/tcp_ipv4.c: get_tcp4_sock`) adresi ağ bayt
  sırasındaki 32 bitlik sayı olarak `%08X` ile basar; x86'da `127.0.0.1` → `0100007F`. Durum `0A` = `TCP_LISTEN`
  (`include/net/tcp_states.h`).
- **X.509 bir ASN.1 ağacıdır.** `sertifika.py` her öğeyi TLV (etiket, uzunluk, değer) olarak okur; `UTCTime`'da
  `YY >= 50` → 19YY kuralı (RFC 5280) testlidir. Canlı test yerel bir `ssl` sunucusu kurar, sertifikayı el sıkışmayla
  alır; doğrulama bilerek kapalıdır, çünkü amaç süresi dolmuş sertifikayı da **görebilmektir**.
- **Kayan pencere tek başına yetmez.** `ornekler/auth_log.txt`'deki dağıtık deneme (beş IP'den birer `root` denemesi) IP
  başına eşiği hiç aşmaz; `LOG-004` hesap bazlı bakar. En değerli bulgu `LOG-003`: kaba kuvvet uyarısı veren IP'den
  sonradan gelen **başarılı** giriş.

## Mini ile gerçek depo eşlemesi

The Book of Secret Knowledge kod içermez; eşleme, minideki her parçanın listede hangi araca ve bölüme denk düştüğünü
gösterir (satır numaraları incelenen commit'teki `README.md` içindir).

| Mini'deki parça             | Gerçek depodaki karşılığı                                                                                                           | Fark                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `sshd.py`                   | `README.md` › CLI Tools › Network: **ssh-audit** (s. 201); One-liners › `Tool: ssh`                                                 | ssh-audit sunucuya bağlanıp algoritmaları el sıkışmadan okur                                |
| `sertifika.py`              | `README.md` › CLI Tools › SSL: **testssl.sh** (s. 265); Web Tools › SSL/Security: **crt.sh** (s. 479); One-liners › `Tool: openssl` | testssl.sh protokol/şifre/zafiyet testleri de yapar                                         |
| Genel denetim yaklaşımı     | `README.md` › CLI Tools › Auditing Tools: **Lynis** (s. 291); CLI Tools › Databases: **OSQuery** (s. 341)                           | Lynis yüzlerce kontrol, OSQuery SQL ile sistem sorgulama                                    |
| `soketler.py`               | `README.md` › One-liners › `Tool: lsof` ("Show open ports (LISTEN)"), `Tool: netstat`                                               | `ss -p` süreç eşlemesi de yapar (inode → `/proc/<pid>/fd`)                                  |
| `kaba_kuvvet.py`            | `README.md` › One-liners › `Tool: grep`, `Tool: awk` (metin süzme temelleri)                                                        | Listede hazır bir kaba kuvvet dedektörü ya da fail2ban yok; engelleme bu minide bilerek yok |
| `__main__.py` çıkış kodları | `.github/CONTRIBUTING.md` › "How to find broken links?" (bash + curl ile durum kodu denetimi)                                       | Liste yalnız bağlantı denetimini elle çalıştırıyor; CI yok                                  |

## Bilinçli eksikler

`sshd -T` çıktısı yerine dosya okuma (Include izlenmez), soket → süreç eşlemesi, X.509 uzantıları (SAN, anahtar
kullanımı) ve zincir doğrulama, günlük döndürme (`auth.log.1.gz`), journald desteği, engelleme eylemleri.
Dosyanın 6. bölümü bunları alıştırma olarak sıralar.
