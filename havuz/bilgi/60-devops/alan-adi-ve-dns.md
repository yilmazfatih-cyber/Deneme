---
baslik: Alan adı ve DNS
ozet: DNS kayıt türleri, alan adı ve alt alan, TTL ve yayılım, kök alanda CNAME sorunu, e-posta kayıtları (SPF, DKIM, DMARC), denetim komutları ve ağsız bir kayıt denetleyicisi.
etiketler: [dns, alan-adi, e-posta, spf, dmarc, devops]
duzey: temel
guncellik: 2026-11
---

# Alan adı ve DNS

> Bu notu ne zaman okumalı: alan adını bir barındırıcıya bağlarken; "kaydı ekledim ama açılmıyor" dediğinizde;
> uygulamanın e-postaları spam'e düşerken; DNS sağlayıcısını ya da sunucuyu değiştirmeden önce.

## Temel fikir

Üç taraf vardır:

1. **Kayıt firması (registrar):** alan adını kiraladığınız yer. Alan adının hangi **ad sunucularında** (NS)
   durduğunu o söyler.
2. **DNS barındırıcısı:** kayıtlarınızı (A, CNAME, MX…) tutan yetkili sunucular. Çoğu zaman kayıt firmasının
   kendisi; isterseniz ayrı bir sağlayıcı.
3. **Çözümleyiciler (resolver):** kullanıcının internet sağlayıcısı, telefonu, tarayıcısı. Yanıtı **TTL** kadar
   önbellekte tutar.

"DNS yayılımı" bir yere gönderilen bir şey değildir: eski yanıtı önbelleğe almış çözümleyicilerin TTL'inin
dolmasıdır. Değişikliğin herkese ulaşma süresi, **eski** kaydın TTL'idir.

## Kayıt türleri

| Tür     | Ne yapar                                         | Örnek değer                                         | Dikkat                                                        |
| ------- | ------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------- |
| `A`     | Ad → IPv4 adresi                                 | `203.0.113.10`                                      | Sunucu değişince güncellenir                                  |
| `AAAA`  | Ad → IPv6 adresi                                 | `2001:db8::10`                                      | Sunucu IPv6'da dinlemiyorsa eklemeyin: IPv6'lı kullanıcılar açamaz |
| `CNAME` | Ad → başka bir ad (takma ad)                     | `www` → `kullanici.github.io.`                      | Aynı adda başka kayıt olamaz; kök alanda olamaz               |
| `MX`    | E-posta hangi sunucuya gelir (öncelik + ad)      | `10 mx1.saglayici.example.`                         | Hedef bir ad olmalı; IP ya da CNAME olamaz                    |
| `TXT`   | Serbest metin: SPF, DMARC, DKIM, sahiplik doğrulama | `v=spf1 include:_spf.saglayici.example -all`     | Aynı adda birden çok TXT olabilir; SPF yalnız bir tane        |
| `CAA`   | Bu ada hangi sertifika yetkilisi sertifika verebilir | `0 issue "letsencrypt.org"`                     | Platformun kullandığı yetkili listede yoksa sertifika alınamaz |
| `NS`    | Bu alanın yetkili ad sunucuları                  | `ns1.dns-saglayici.example.`                        | Kayıt firmasında değişir; değiştirmek bütün bölgeyi taşır     |

DNS panellerinde `@` kök alanı (`ornek.com`) gösterir. Ad alanına `www` yazılır; `www.ornek.com` yazılırsa çoğu panel
alanı yeniden ekler ve kayıt `www.ornek.com.ornek.com` olur.

## Alan adı, alt alan ve kök

- **Kök (apex):** `ornek.com`. **Alt alan:** `www.ornek.com`, `app.ornek.com`, `api.ornek.com`.
- Biri asıl adres olsun (`ornek.com` ya da `www.ornek.com`); öteki ona **301** ile yönlensin. İki adres de aynı
  içeriği verirse arama motoru ikisini ayrı sayar, çerezler ve sertifika karışır.
- Her ad kendi sertifikasını ister: `ornek.com` için alınan sertifika `www`'yu kapsamayabilir
  ([HTTPS ve sertifikalar](https-ve-sertifikalar.md)).

### Kök alanda CNAME sorunu

Barındırıcılar çoğu zaman "adınızı `uygulama.platform.example`'a CNAME ile yönlendirin" der. Alt alanda bu sorunsuzdur.
Kök alanda olamaz: kökte zorunlu olarak SOA ve NS kayıtları vardır ve CNAME, aynı adda başka kayıtla birlikte
bulunamaz. Seçenekler:

| Yol                                                       | Ne zaman                                                    |
| --------------------------------------------------------- | ----------------------------------------------------------- |
| Barındırıcının verdiği `A`/`AAAA` adresleri               | Barındırıcı sabit adres belgeliyorsa (GitHub Pages böyle)   |
| DNS sağlayıcısının ALIAS/ANAME/"CNAME düzleştirme" özelliği | Sağlayıcınız destekliyorsa; standart değil, sağlayıcıya özgü |
| Asıl adresi `www` yapıp kökü ona yönlendirmek             | Her durumda çalışır                                         |

## TTL ve yayılım

TTL saniye cinsindendir. Değişiklikten **önce** TTL'i düşürmek, değişikliği dakikalara indirir:

```python calistir
from datetime import datetime, timedelta

degisim = datetime(2026, 11, 20, 10, 0)  # sunucu taşıma anı
eski_ttl = timedelta(seconds=86400)  # kaydın şimdiki TTL'i: bir gün
gecis_ttl = timedelta(seconds=300)  # taşıma süresince kullanılacak TTL

# YANLIŞ: hazırlıksız değişim; önbelleğe almış çözümleyiciler eski adresi bir gün daha verir
print(f"hazırlıksız: eski adres {degisim + eski_ttl:%d.%m %H:%M} saatine kadar görülebilir")
# DOĞRU: TTL'i en az eski TTL kadar önce düşür
plan = [
    (degisim - eski_ttl, "TTL 300 sn'ye düşürülmüş olmalı (en geç)"),
    (degisim, "kayıt yeni adrese çevrilir"),
    (degisim + gecis_ttl, "herkes yeni adreste; eski sunucu en az buna kadar açık kalır"),
]
for an, adim in plan:
    print(f"{an:%d.%m %H:%M}  {adim}")
assert plan[-1][0] - degisim == timedelta(minutes=5)
```

```cikti
hazırlıksız: eski adres 21.11 10:00 saatine kadar görülebilir
19.11 10:00  TTL 300 sn'ye düşürülmüş olmalı (en geç)
20.11 10:00  kayıt yeni adrese çevrilir
20.11 10:05  herkes yeni adreste; eski sunucu en az buna kadar açık kalır
```

Taşıma bitip bir süre sorunsuz geçince TTL'i yeniden yükseltin (saat ya da gün mertebesi). Bazı çözümleyiciler TTL'e
tam uymaz; eski sunucuyu hesaplanandan biraz daha uzun açık tutun.

- **Olumsuz önbellek:** Bir adı kayıt **eklemeden önce** sorgularsanız "böyle bir ad yok" yanıtı da önbelleğe girer
  (süresi bölgenin SOA kaydından gelir). "Ekledim ama hâlâ bulunamıyor" çoğu zaman budur. Eklemeden önce sorgulamayın;
  sorguladıysanız yetkili sunucuya doğrudan sorun (aşağıda) ve bekleyin.
- **Ad sunucusu (NS) değişimi** bütün bölgeyi taşır ve üst alanın (`.com`, `.com.tr`) kendi TTL'iyle yayılır; çoğu
  zaman saatler sürer. Önce **bütün kayıtları** (özellikle MX, DKIM, doğrulama TXT'leri) yeni sağlayıcıda kurun,
  sonra NS'i değiştirin.
- **DNSSEC** açıksa DNS sağlayıcısını değiştirmeden önce kayıt firmasındaki DS kaydını kaldırıp bekleyin; yoksa
  imza tutmaz ve doğrulayan çözümleyiciler alan adınızı hiç çözemez.

## E-posta kayıtları: SPF, DKIM, DMARC

Uygulama e-posta gönderiyorsa (şifre sıfırlama, davet) bu üç kayıt olmadan iletiler spam'e düşer ya da reddedilir.
Değerleri e-posta sağlayıcınız verir; siz DNS'e yazarsınız.

| Kayıt | Nerede                       | Ne söyler                                                    | Kural                                                             |
| ----- | ---------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| SPF   | `ornek.com` TXT `v=spf1 …`   | Bu alan adı adına hangi sunucular gönderebilir               | **Tek** kayıt; sağlayıcıları `include:` ile aynı kayda ekleyin; en çok 10 DNS sorgusu |
| DKIM  | `<seçici>._domainkey.ornek.com` TXT ya da CNAME | İletinin imzasını doğrulayan açık anahtar  | Sağlayıcı seçiciyi ve değeri verir; anahtar değişince güncellenir |
| DMARC | `_dmarc.ornek.com` TXT `v=DMARC1; …` | SPF/DKIM tutmazsa alıcı ne yapsın, rapor nereye     | `p=none` ile başlayın, raporları okuyun, sonra `quarantine` → `reject` |

DMARC, görünen gönderen adresinin (`From`) alan adının SPF ya da DKIM'deki alan adıyla **eşleşmesini** ister.
Sağlayıcının kendi alan adıyla imzalanan ileti DKIM'den geçse de DMARC'tan geçmeyebilir; sağlayıcıda "alan adı
doğrulama" adımını tamamlayın. Teslim edilebilirliğin geri kalanı:
[E-posta ve bildirim](../30-arkauc/e-posta-ve-bildirim.md).

**E-posta göndermeyen alan adı** da korunmalıdır, yoksa başkası onun adına sahte ileti gönderir: `ornek.com` TXT
`v=spf1 -all`, `_dmarc.ornek.com` TXT `v=DMARC1; p=reject`, isterseniz "boş MX" (`MX 0 .`).

## Denetim komutları

Bu ortamda DNS sorgusu yapılamadı; aşağıdaki çıktılar biçimi göstermek içindir.

```text
$ dig +short A ornek.com                       # yanıt (önbellekten gelebilir)
203.0.113.10
$ dig +noall +answer www.ornek.com             # ikinci sütun: kalan TTL (saniye)
www.ornek.com.          287     IN      CNAME   ornek.com.
ornek.com.              287     IN      A       203.0.113.10
$ dig +short NS ornek.com                      # yetkili sunucular
ns1.dns-saglayici.example.
$ dig @ns1.dns-saglayici.example +short A ornek.com   # önbelleği atla, yetkiliye sor
203.0.113.10
$ dig +short TXT _dmarc.ornek.com
"v=DMARC1; p=quarantine; rua=mailto:dmarc@ornek.com"
$ dig +short MX ornek.com
10 mx1.saglayici.example.
```

- Yetkili sunucu yeni değeri veriyor ama `dig +short` eskisini veriyorsa sorun yoktur: önbellek bekleniyor.
- Farklı çözümleyicilere sorun: `dig @1.1.1.1 …`, `dig @8.8.8.8 …`.
- `dig +trace ornek.com` kökten başlayarak yetki zincirini gösterir (NS değişikliğinde kullanışlı).
- Windows'ta: `nslookup -type=TXT _dmarc.ornek.com` ya da PowerShell'de `Resolve-DnsName -Type MX ornek.com`.

## Kayıt denetleyicisi

Kayıtları panele girmeden önce liste olarak denetleyin (ağ gerekmez):

```python calistir
import ipaddress
from collections import defaultdict

OZEL_AGLAR = [ipaddress.ip_network(a) for a in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8")]
SORGULU = ("include:", "a:", "a/", "mx:", "mx/", "ptr:", "exists:", "redirect=")


def spf_sorgu_sayisi(kayit: str) -> int:  # yalnız üst düzey; iç içe include'lar da sınıra sayılır
    terimler = [t.lstrip("+-~?") for t in kayit.split()[1:]]
    return sum(1 for t in terimler if t in ("a", "mx", "ptr") or t.startswith(SORGULU))


def denetle(kayitlar: list[tuple[str, str, str]], kok: str) -> list[str]:
    adlar: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for ad, tur, deger in kayitlar:
        adlar[ad].append((tur, deger))
    takma_adlar = {ad for ad, tur, _ in kayitlar if tur == "CNAME"}
    sorunlar = []
    for ad, liste in adlar.items():
        turler = [tur for tur, _ in liste]
        if "CNAME" in turler and ad == kok:
            sorunlar.append(f"{ad}: kök alanda CNAME olmaz")
        elif "CNAME" in turler and len(liste) > 1:
            sorunlar.append(f"{ad}: CNAME ile aynı adda başka kayıt olmaz")
        spf = [deger for tur, deger in liste if tur == "TXT" and deger.startswith("v=spf1")]
        if len(spf) > 1:
            sorunlar.append(f"{ad}: {len(spf)} ayrı SPF kaydı; tek kayıtta birleştirin")
        for kayit in spf:
            if spf_sorgu_sayisi(kayit) > 10:
                sorunlar.append(f"{ad}: SPF 10 DNS sorgusu sınırını aşıyor")
            if kayit.split()[-1] in ("+all", "all"):
                sorunlar.append(f"{ad}: SPF herkese izin veriyor (+all)")
        for tur, deger in liste:
            if tur == "MX":
                hedef = deger.split()[-1]
                try:
                    ipaddress.ip_address(hedef)
                    sorunlar.append(f"{ad}: MX hedefi IP olamaz, ad olmalı")
                except ValueError:
                    if hedef in takma_adlar:
                        sorunlar.append(f"{ad}: MX hedefi CNAME olamaz")
            if tur == "A" and any(ipaddress.ip_address(deger) in ag for ag in OZEL_AGLAR):
                sorunlar.append(f"{ad}: herkese açık DNS'te özel ağ adresi ({deger})")
    kokte_mx = any(tur == "MX" for tur, _ in adlar.get(kok, []))
    if kokte_mx and not any(d.startswith("v=DMARC1") for _, d in adlar.get(f"_dmarc.{kok}", [])):
        sorunlar.append(f"_dmarc.{kok}: DMARC kaydı yok")
    return sorunlar


IYI = [
    ("ornek.com", "A", "203.0.113.10"),
    ("ornek.com", "MX", "10 mx1.saglayici.example"),
    ("ornek.com", "TXT", "v=spf1 include:_spf.saglayici.example -all"),
    ("ornek.com", "CAA", '0 issue "letsencrypt.org"'),
    ("www.ornek.com", "CNAME", "ornek.com"),
    ("_dmarc.ornek.com", "TXT", "v=DMARC1; p=quarantine; rua=mailto:dmarc@ornek.com"),
]
KOTU = [
    ("ornek.com", "A", "203.0.113.10"),
    ("ornek.com", "MX", "10 203.0.113.25"),
    ("ornek.com", "TXT", "v=spf1 include:_spf.saglayici-a.example ~all"),
    ("ornek.com", "TXT", "v=spf1 include:_spf.saglayici-b.example ~all"),
    ("www.ornek.com", "CNAME", "kullanici.github.io"),
    ("www.ornek.com", "TXT", "dogrulama=abc123"),
    ("ic.ornek.com", "A", "192.168.1.20"),
    ("posta.ornek.com", "CNAME", "mx.saglayici.example"),
    ("eski.ornek.com", "MX", "10 posta.ornek.com"),
]
assert denetle(IYI, "ornek.com") == []
assert denetle([("ornek.com", "CNAME", "x.platform.example")], "ornek.com") == ["ornek.com: kök alanda CNAME olmaz"]
cok_include = "v=spf1 " + " ".join(f"include:s{i}.example" for i in range(11)) + " -all"
assert denetle([("ornek.com", "TXT", cok_include)], "ornek.com") == ["ornek.com: SPF 10 DNS sorgusu sınırını aşıyor"]
for sorun in denetle(KOTU, "ornek.com"):
    print("-", sorun)
```

```cikti
- ornek.com: 2 ayrı SPF kaydı; tek kayıtta birleştirin
- ornek.com: MX hedefi IP olamaz, ad olmalı
- www.ornek.com: CNAME ile aynı adda başka kayıt olmaz
- ic.ornek.com: herkese açık DNS'te özel ağ adresi (192.168.1.20)
- eski.ornek.com: MX hedefi CNAME olamaz
- _dmarc.ornek.com: DMARC kaydı yok
```

## Alan adının kendisi

En can yakıcı DNS kesintisi alan adının **süresinin dolmasıdır**: site, API ve e-posta birlikte gider.

- Otomatik yenilemeyi açın; ödeme yönteminin son kullanma tarihini izleyin.
- Kayıt firması hesabında iki adımlı doğrulama ve alan adı kilidi (transfer lock) açık olsun.
- Yenileme uyarılarının gittiği e-posta adresi **aynı alan adında olmasın**: alan adı düşerse o adrese de posta gelmez.
- Kullanımdan kalkan bir servisin DNS kaydını silin. Silinmiş bir platform kaynağına bakan CNAME ("sarkan kayıt"),
  başkasının o adı platformda alıp **sizin alt alanınızda** içerik yayınlamasına yol açar. Platformlar alan adı
  doğrulaması sunuyorsa (GitHub'da "verified domains") kullanın.

## Tuzaklar

| Belirti                                                          | Neden                                                         | Çözüm                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------- |
| Kaydı ekledim, saatlerdir "bulunamadı"                           | Eklemeden önce sorgulandı; olumsuz yanıt önbellekte           | Yetkili sunucuya sorun (`dig @ns1…`); önbellek süresini bekleyin     |
| Sunucu değişti, bazı kullanıcılar bir gün eski sunucuya gitti    | TTL düşürülmeden değişti                                      | Değişimden en az eski TTL kadar önce TTL'i düşürün                   |
| Kök alana CNAME eklenemiyor ya da e-posta bozuldu                | Kökte CNAME diğer kayıtlarla çakışır                          | A/AAAA, ALIAS ya da `www` asıl adres                                 |
| Kayıt `www.ornek.com.ornek.com` olarak oluşmuş                   | Panele tam ad yazıldı                                         | Ad alanına yalnız `www`                                              |
| Bazı kullanıcılar siteyi hiç açamıyor                            | `AAAA` var ama sunucu IPv6'da dinlemiyor                       | `AAAA`'yı silin ya da IPv6'yı açın                                   |
| Sertifika alınamıyor, kayıtlar doğru                             | `CAA` başka bir yetkiliye izin veriyor                        | `CAA`'ya platformun yetkilisini ekleyin ya da kaydı kaldırın         |
| Şifre sıfırlama e-postaları spam'e düşüyor                       | SPF/DKIM yok ya da DMARC eşleşmesi tutmuyor                   | Sağlayıcının alan adı doğrulamasını bitirin; üç kaydı kurun          |
| İkinci e-posta sağlayıcısı eklenince SPF bozuldu                 | İki ayrı `v=spf1` kaydı                                       | Tek kayıt, iki `include:`                                            |
| DNS sağlayıcısı değişti, e-posta gelmiyor                        | MX ve DKIM kayıtları yeni sağlayıcıya taşınmadı               | Bütün bölgeyi önce kopyalayın, sonra NS değiştirin                   |
| DNS taşındı, alan adı hiç çözülmüyor                             | DNSSEC DS kaydı eski imzayı gösteriyor                        | Önce DS'yi kaldırın, bekleyin, taşıyın, yeniden imzalayın            |
| Bir alt alanda tanımadığınız içerik yayında                      | Sarkan CNAME: kaynak silinmiş, kayıt kalmış                   | Kaydı silin; platformlarda alan adı doğrulaması                      |
| Site, API ve e-posta aynı anda gitti                             | Alan adının süresi doldu                                      | Otomatik yenileme, başka alan adında uyarı adresi                    |

## Denetim listesi

- [ ] Alan adı barındırıcıdan bağımsız bir kayıt firmasında; otomatik yenileme, iki adımlı doğrulama, transfer kilidi açık.
- [ ] Asıl adres seçildi (kök ya da `www`); öteki 301 ile yönleniyor; ikisinin de sertifikası var.
- [ ] Kayıtlar yukarıdaki denetleyiciden bulgusuz geçiyor.
- [ ] Taşıma öncesi TTL düşürüldü; taşıma sonrası yükseltildi.
- [ ] E-posta gönderiliyorsa SPF (tek kayıt), DKIM ve DMARC var; test iletisi spam'e düşmüyor ve başlıklarında
      `spf=pass`, `dkim=pass`, `dmarc=pass` görünüyor.
- [ ] E-posta göndermeyen alan adlarında `v=spf1 -all` ve `p=reject` DMARC var.
- [ ] `CAA` varsa platformun sertifika yetkilisini içeriyor.
- [ ] Kullanılmayan servislere bakan kayıt yok.
- [ ] `dig @<yetkili sunucu>` ile her kayıt doğrulandı.

## Küçük modele yaptırırken

- **İsteme yazın:** "DNS kayıtlarını panele girmeden önce `ad | tür | değer | TTL` tablosu olarak yaz. Kök alanda
  CNAME kullanma. SPF tek kayıt olsun. Barındırıcının IP adreslerini ezberden yazma; barındırıcının belgesinden
  alınacağını belirt."
- **Modelin tipik hatası:** barındırıcıların IP adreslerini ezberden uydurmak; kökte CNAME önermek; ikinci bir SPF
  kaydı eklemek; MX'i IP'ye yöneltmek; "yayılım 48 saat sürer, bekleyin" deyip TTL'i hiç anmamak; DNS taşırken MX
  ve DKIM'i unutmak.
- **Çıktıda denetleyin:** tabloyu denetleyiciden geçirin; her değerin kaynağı (barındırıcı belgesi, e-posta
  sağlayıcısı paneli) yazılı mı; taşıma planında TTL düşürme adımı ve tarihi var mı.

## İlgili

- [HTTPS ve sertifikalar](https-ve-sertifikalar.md) — CAA, ad başına sertifika
- [Durağan site yayını](duragan-site-yayini.md) — GitHub Pages'e özel alan adı
- [E-posta ve bildirim](../30-arkauc/e-posta-ve-bildirim.md) — teslim edilebilirlik
- [İlk yayın denetim listesi](ilk-yayin-denetim-listesi.md)
- Çalışan karşılıklar: [`site/docs/YAYINLAMA.md`](../../site/docs/YAYINLAMA.md) → "Kendi alan adı",
  [`uygulama/docs/GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md) → yayın öncesi denetim listesi (SPF/DKIM)
