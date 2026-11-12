# dnsmini — sıfırdan yetkili DNS sunucusu ve alt alan adı kayıt kuruluşu

FreeDomain deposu bir belge deposudur; hizmetin kalbinde ise iki mekanizma vardır: **üst bölgede delegasyon
yayımlamak** (kayıt kuruluşu) ve **o delegasyonu izleyen yetkili DNS** (alt bölge sunucusu). `dnsmini` ikisini de
yalnız Python standart kitaplığıyla, test edilebilir küçük parçalar hâlinde kurar (~1.200 satır kod, ~500 satır test).

## Gereksinimler

Python 3.10+ (bağımlılık yok). Testler yalnız `127.0.0.1` üzerinde, rastgele boş portlarda çalışır; internet gerekmez.

## Çalıştırma

```bash
cd sifirdan
python3 -m dnsmini.sunucu ornekler/ornek.test.zone --port 5353         # UDP + TCP, aynı port
python3 -m dnsmini.istemci eski.ornek.test A --port 5353                # CNAME zinciri
python3 -m dnsmini.istemci www.lab.ornek.test A --port 5353             # delegasyon yönlendirmesi + glue
python3 -m dnsmini.istemci uzun.ornek.test TXT --port 5353              # UDP'de TC=1 → otomatik TCP
python3 -m dnsmini.istemci yok.ornek.test --port 5353                   # NXDOMAIN + olumsuz önbellek SOA'sı
```

`dig` kuruluysa aynı sunucuyu onunla da sorgulayabilirsin: `dig @127.0.0.1 -p 5353 +norec www.ornek.test`.

## Test

```bash
python3 -m unittest discover -s . -t .      # 54 test: tel biçimi, bölge, yanıt, ağ, sicil
```

## Aşamalar

| Aşama | Modül                | Ne yapar                                                                            | Kilit kavram                                               |
| ----- | -------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1     | `dnsmini/tel.py`     | Başlık, soru, kaynak kaydı kodlama/çözme; ad sıkıştırma (`0xC0` işaretçileri)       | Tel biçimi; kötü niyetli işaretçi döngülerine karşı koruma |
| 2     | `dnsmini/bolge.py`   | Bölge dosyası alt kümesi: `$ORIGIN`, `$TTL`, `@`, `( )`, süre birimleri; doğrulama  | SOA/NS zorunluluğu, CNAME tekilliği, bölge dışı veri       |
| 3     | `dnsmini/yanit.py`   | Cevap, CNAME zinciri, NODATA, NXDOMAIN, boş ara düğüm, yönlendirme + glue, REFUSED  | RFC 1034 §4.3.2, RFC 2308, RFC 8020, RFC 6604              |
| 4     | `dnsmini/sunucu.py`  | UDP + TCP (2 bayt uzunluk öneki), jeton kovasıyla yanıt hızı sınırlama ("slip")     | 512 bayt sınırı, TC biti, yansıtma saldırıları             |
| 5     | `dnsmini/istemci.py` | Rastgele kimlik, yanıt doğrulama, TC → TCP geçişi, dig benzeri çıktı                | Önbellek zehirlemeye karşı temel savunma                   |
| 6     | `dnsmini/sicil.py`   | Kayıt kuralları, EPP sonuç kodları, şikâyet/askı, süre döngüsü, RDAP, bölge üretimi | Registry/registrar/registrant ayrımı, kötüye kullanım      |

`tests/test_sicil.py` içindeki `SicilDnsEntegrasyonTesti` bütün zinciri birleştirir: sicil üst bölgeyi üretir →
`bolge.oku` ayrıştırır → `DnsSunucusu` yayımlar → istemci `www.ali.ucretsiz.test` için yönlendirme, iç ad sunuculu
alan için glue ve askıya alınmış alan için NXDOMAIN alır.

## Sicil kuralları (model)

| Kural                                       | EPP kodu       | Neden                                                                                       |
| ------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------- |
| LDH: küçük harf, rakam, tire; 1-63 karakter | 2005 / 2004    | RFC 1123 ana makine adı kuralı; IDN (`xn--`) bu modelde kapalı                              |
| Ayrılmış adlar (`www`, `abuse`, `ns1`...)   | 2306           | Hizmetin kendi altyapısı ve kötüye kullanım iletişimi korunur                               |
| Hesap başına 1 aktif alan adı               | 2308           | FreeDomain SSS'sindeki politika; toplu kayıtla spam'i yavaşlatır                            |
| Saatte en fazla 5 deneme                    | 2308           | Otomatik kayıt botlarına karşı                                                              |
| 2-4 farklı ad sunucusu, IP değil ad         | 2004 / 2005    | Tek NS tek hata noktasıdır; belgelerdeki "IP yazma" hatası                                  |
| İç ad sunucusu → herkese açık glue IP       | 2003 / 2306    | Döngüsel bağımlılığı kırmak için üst bölge adresi bilmeli; IPv6 glue AAAA olarak yayımlanır |
| Kimlik avı sözcüğü (homoglif normalleme)    | 1001 beklemede | "paypa1-destek" gibi adlar insan incelemesine düşer                                         |
| Askı / süre dolumu                          | —              | Delegasyon bölgeden çıkar → çözücüler NXDOMAIN görür                                        |

## Mini ile gerçek depo eşlemesi

| Mini'deki parça                     | Gerçek depodaki karşılığı (dosya yolu)                                                      | Fark                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `Sicil.kaydet()`                    | `documents/tutorial/platform/1.2-domain-registration.md`                                    | Gerçek uygulama ayrı depoda (`DigitalPlatDev/Domain-OSS`, incelenmedi)           |
| `_ns_denetle()` (ad, sayı, glue)    | `documents/tutorial/platform/1.3-connect-nameservers.md`, `advanced/6.2-self-hosted-dns.md` | Belgeler kuralları anlatır; denetimin nasıl yapıldığı depoda yok                 |
| `hesap_siniri=1`                    | `documents/domains/faq.md`                                                                  | Hizmet bu sınırı "artan kötüye kullanım" gerekçesiyle koymuş                     |
| `sikayet_et()` / `askiya_al()`      | `documents/tutorial/operations/5.6-acceptable-use.md`, `README.md` (Abuse Reporting)        | Gerçekte e-posta ile şikâyet ve insan incelemesi; otomasyon ayrıntısı bilinmiyor |
| `rdap()` + kişisel veri gizleme     | `documents/tutorial/operations/5.4-registration-data.md`                                    | Gerçek RDAP HTTPS üzerinden JSON döner (RFC 9082/9083)                           |
| `yenile()`, `sure_islerini_yurut()` | `platform/1.4-status-and-renewal.md`, `operations/5.2-renewal-and-expiration.md`            | Pencere ve ödemesiz dönem süreleri burada model değerleridir                     |
| `bolge_metni()` (delegasyon)        | `documents/tutorial/dns/2.0-delegation.md` ("Three Views of the Same Domain")               | Gerçek üst bölgeler binlerce delegasyon, DNSSEC imzası, ikincil sunucular taşır  |
| `DnsSunucusu` (alt bölge sunucusu)  | `advanced/6.2-self-hosted-dns.md` (UDP ve TCP 53, SOA, NS, tutarlılık)                      | Üretimde BIND, Knot, NSD, PowerDNS; EDNS(0), DNSSEC, AXFR/NOTIFY                 |
| `istemci` / `kayit_metni()`         | `dns/2.4-troubleshooting.md`, `advanced/6.3-command-reference.md` (`dig` komutları)         | `dig` çok daha fazla seçenek ve EDNS desteği sunar                               |

## Bilinçli eksikler

EDNS(0) (büyük UDP yanıtları), DNSSEC imzalama, joker (`*`) kayıtlar, bölge aktarımı (AXFR/IXFR) ve NOTIFY,
uluslararasılaştırılmış adlar (IDN/punycode), kalıcı depolama (sicil bellekte yaşar), kimlik doğrulama ve gerçek bir
EPP sunucusu. Hepsi dosyanın 4. ve 6. bölümlerinde alıştırma olarak sıralanır.
