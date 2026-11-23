---
baslik: E-posta güvenliği: gönderen doğrulama, sahtecilik, başlık enjeksiyonu ve belirteç sızıntısı
ozet: SPF, DKIM ve DMARC'ın neyi koruyup neyi korumadığı, hizalama ve .com.tr tuzağı, görünen ad ve benzer alan adı, uygulama e-postasıyla oltalama, başlık enjeksiyonu, ek güvenliği ve belirteç sızıntısı.
etiketler: [e-posta, guvenlik, spf, dkim, dmarc, oltalama]
duzey: orta
guncellik: 2026-11
---

# E-posta güvenliği: gönderen doğrulama, sahtecilik, başlık enjeksiyonu ve belirteç sızıntısı

> Bu notu ne zaman okumalı: uygulama e-posta gönderiyorsa (şifre sıfırlama, davet, bildirim), kullanıcının yazdığı
> bir metin e-postaya giriyorsa, gelen e-postayı işleyen bir özellik (destek kutusu, e-postayla içe aktarma)
> yazıyorsanız ya da "sizin adınıza sahte e-posta geldi" şikâyeti alındığında.

## Temel fikir

- Bir e-postada iki "gönderen" vardır: **zarf göndericisi** (SMTP'deki `MAIL FROM`, geri dönüşlerin gittiği adres;
  SPF bunu denetler) ve kullanıcının gördüğü **`From:` başlığı**. DMARC ikisini bağlar: SPF ya da DKIM geçmeli
  **ve** geçen alan adı `From:` alan adıyla **hizalı** olmalıdır.
- Bu üçlü yalnız **sizin alan adınızın** taklidini zorlaştırır. Korumadıkları: görünen ad sahteciliği
  ("Banka Destek" <saldirgan@kotu.example>), benzer alan adı (`0rnek.com`, `ornek-destek.com`, `örnek.com`),
  ele geçirilmiş gerçek hesap ve **sizin sisteminizin** kullanıcı metniyle oltalama e-postası göndermesi.
- Uygulama tarafında üç açık vardır: başlık enjeksiyonu (satır sonu karakteri), kullanıcı metninin güvenilir
  şablona karışması, bağlantıdaki belirtecin sızması.

Kayıtların DNS'e girilmesi ve kayıt denetleyicisi [Alan adı ve DNS](../60-devops/alan-adi-ve-dns.md)'de; işlemsel ve
toplu gönderimin ayrılması, teslim edilebilirlik [E-posta ve bildirim](../30-arkauc/e-posta-ve-bildirim.md)'de;
sıfırlama belirtecinin kuralları (tek kullanım, kısa ömür, özetli saklama)
[Kimlik doğrulama](../30-arkauc/kimlik-dogrulama.md)'dadır. Bu not güvenlik tarafını tamamlar.

## Karar tablosu

| Durum                                                    | Önlem                                                                        | Neden                                                     |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| Alan adınız adına sahte e-posta gönderiliyor             | SPF + DKIM + DMARC `p=none` → raporları oku → `quarantine` → `reject`        | Alıcı sunucular hizasız iletiyi reddeder                  |
| E-posta göndermeyen alan adlarınız                       | `v=spf1 -all` ve `p=reject`                                                  | Kullanılmayan alan adı sahtecinin en rahat aracı          |
| Gönderim ortak bir e-posta sağlayıcısından               | Sağlayıcıda alan adı doğrulama: DKIM **kendi** alan adınızla imzalansın      | SPF `include:` o sağlayıcının bütün müşterilerine izin verir |
| Kullanıcı adı/liste adı e-postaya giriyor (davet)        | Uzunluk sınırı, bağlantı ve adres temizliği, sabit cümle, konuya koymamak    | Aksi hâlde uygulamanız oltalama gönderir                  |
| Kullanıcı metni başlığa giriyor (konu, ad, yanıt adresi) | Kitaplığın ileti nesnesi; tek satıra indirme                                 | Başlık enjeksiyonu                                        |
| E-postadaki eylem bağlantısı                             | Kendi alan adınız, HTTPS, kısaltıcı yok, açık yönlendirme yok                | "Biz yalnız şu adresten yazarız" diyebilmek               |
| Tek kullanımlık bağlantı (sıfırlama, sihirli giriş)      | GET gösterir, POST harcar; `Referrer-Policy: no-referrer`; günlükte maske     | Tarama, Referer ve günlük sızıntısı                       |
| Hassas belge göndermek                                   | Ek yerine giriş isteyen indirme bağlantısı                                   | Ek iletilir, yanlış kişiye gider, silinemez               |
| Gelen e-postayı işlemek                                  | Kimlik doğrulama sonucunu okuyun, HTML'i temizleyin, eki içerikten tanıyın   | Gelen her şey güvenilmezdir                               |

## SPF, DKIM ve DMARC neyi denetler

| Mekanizma | Denetlediği                                                         | Bozulduğu yer                                                             |
| --------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| SPF       | Zarf göndericisinin alan adı adına bu IP gönderebilir mi            | İletme (forward): ileten sunucunun IP'si listede yok; `From:`'a bakmaz    |
| DKIM      | İmzalı başlıklar ve gövde yolda değişmedi mi; imzalayan `d=` alanı  | Posta listesi konuya etiket ya da altbilgi ekleyince imza bozulur         |
| DMARC     | SPF ya da DKIM geçti **ve** alan adı `From:` ile hizalı             | `p=none` iken hiçbir şeyi engellemez; görünen ad ve benzer alan adı       |

```text
ornek.com.                TXT  "v=spf1 include:_spf.saglayici.example -all"
s1._domainkey.ornek.com.  TXT  "v=DKIM1; k=rsa; p=MIIBIjAN…"            (değeri sağlayıcı verir)
_dmarc.ornek.com.         TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@ornek.com"
```

**Hizalama** gevşek (varsayılan: `posta.ornek.com` ile `ornek.com` aynı kuruluş) ya da sıkı (birebir) olabilir.
"Aynı kuruluş" hesabı **kamu son ekleri listesini** (Public Suffix List) ister: `com.tr`, `gov.tr`, `k12.tr` birer
son ektir. "Son iki etiketi al" kısayolu bütün `.com.tr` alan adlarını aynı kuruluş sayar:

```python calistir
import re

# Gerçekte Public Suffix List kullanılır; burada küçük bir parçası
PUBLIC_SUFFIXES = {"com", "org", "net", "example", "tr", "com.tr", "org.tr", "gov.tr", "edu.tr", "net.tr", "k12.tr"}


def org_domain(domain: str) -> str:
    """Kuruluş alan adı: kamu son ekinden (com.tr gibi) bir etiket fazlası."""
    labels = domain.lower().rstrip(".").split(".")
    for i in range(len(labels)):
        if ".".join(labels[i + 1 :]) in PUBLIC_SUFFIXES:
            return ".".join(labels[i:])
    return domain.lower()


def naive_org(domain: str) -> str:  # YANLIŞ: "son iki etiket"
    return ".".join(domain.lower().split(".")[-2:])


PATTERN = r"(spf|dkim)=(\w+)[^;]*?(?:smtp\.mailfrom|header\.d)=(?:[^@;\s]*@)?([\w.-]+)"


def dmarc_pass(auth_results: str, from_domain: str, org=org_domain) -> bool:
    """SPF ya da DKIM geçmeli VE geçen alan adı From alan adıyla (gevşek) hizalı olmalı."""
    found = re.findall(PATTERN, auth_results)
    return any(result == "pass" and org(domain) == org(from_domain) for _, result, domain in found)


saglayici = "mx.alici.example; spf=pass smtp.mailfrom=bounce.saglayici.example; dkim=pass header.d=saglayici.example"
kendi = "mx.alici.example; spf=pass smtp.mailfrom=bounce.saglayici.example; dkim=pass header.d=posta.ornek.com"
assert not dmarc_pass(saglayici, "ornek.com")  # ikisi de "pass" ama hizalı değil: DMARC kalır
assert dmarc_pass(kendi, "ornek.com")  # alt alan adıyla DKIM imzası gevşek hizalamada geçer

sahte = "mx.alici.example; spf=fail smtp.mailfrom=kotu.com.tr; dkim=pass header.d=kotu.com.tr"
assert dmarc_pass(sahte, "banka.com.tr", org=naive_org)  # YANLIŞ: ikisi de "com.tr" sanıldı
assert not dmarc_pass(sahte, "banka.com.tr")  # com.tr kamu son ekidir: kuruluşlar farklı
print("tamam")
```

İlk durum sahada en sık görülenidir: sağlayıcı iletiyi kendi alan adıyla imzalar, SPF de sağlayıcının geri dönüş
alan adıyla geçer; her şey "pass" görünür ama DMARC kalır ve `p=reject`'e geçtiğiniz gün kendi e-postalarınız
düşer. Gelen bir iletinin sonucunu e-posta istemcisinde "Orijinali göster" ile `Authentication-Results` başlığından
okuyabilirsiniz. Sunucular arası taşıma şifrelemesi (SMTP'de TLS) çoğunlukla fırsatçıdır; zorunlu kılmak için
MTA-STS kavramına bakın (kurulumu sağlayıcınıza göre değişir).

## Görünen ad ve benzer alan adı

Pek çok telefon e-posta uygulaması yalnız görünen adı gösterir. `"destek@ornek.com" <saldirgan@kotu.example>`
başlığında kullanıcının gördüğü "destek@ornek.com"dur. SPF/DKIM/DMARC burada yardımcı olmaz: ileti `kotu.example`
için kusursuz doğrulanmıştır. Gelen e-postayı işleyen bir özellikte (destek kutusu, e-postayla belge alma) şu
işaretleri arayın:

```python calistir
from email.utils import parseaddr

OUR_DOMAINS = {"ornek.com"}
BRAND_WORDS = ("ornek", "örnek")


def sender_warnings(from_header: str) -> list[str]:
    name, address = parseaddr(from_header)
    domain = address.rpartition("@")[2].lower()
    warnings = []
    if "@" in name:
        warnings.append("görünen adın içinde e-posta adresi var")
    if any(word in name.lower() for word in BRAND_WORDS) and domain not in OUR_DOMAINS:
        warnings.append("bizim adımızı kullanıyor ama alan adı bizim değil")
    if any(label.startswith("xn--") for label in domain.split(".")):
        warnings.append("punycode alan adı: benzer harf oyunu olabilir")
    return warnings


assert sender_warnings("Örnek Destek <destek@ornek.com>") == []
assert sender_warnings('"destek@ornek.com" <saldirgan@kotu.example>') == [
    "görünen adın içinde e-posta adresi var",
    "bizim adımızı kullanıyor ama alan adı bizim değil",
]
assert sender_warnings("Destek <destek@xn--rnek-4qa.com>") == ["punycode alan adı: benzer harf oyunu olabilir"]  # örnek.com
print("tamam")
```

Gönderen olarak yapabilecekleriniz: her zaman **aynı** gönderen adresini kullanın; kullanıcıya bir kez, açıkça
"Biz size yalnız @ornek.com adresinden yazarız ve e-postayla şifre istemeyiz" deyin; e-postada parola, kod girme
formu, ek dosya istemeyin. Bunlar oltalamayı ayırt etmeyi kolaylaştırır.

## Uygulamanızın e-postasıyla oltalama

Davet e-postası: "**Ayşe** sizi 'Ev işleri' listesine davet etti." Saldırgan hesabının adını "Hesabınız askıya
alındı! Doğrulamak için kotu.example/giris adresine girin" yaparsa, sizin alan adınızdan, DKIM imzalı, spam
süzgecinden geçen bir oltalama e-postası çıkar. Aynı açık liste adlarında, yorumlarda ve "bize yazın formunun bir
kopyası size gönderilsin" özelliğinde de vardır (bu sonuncusu, istenen herhangi bir adrese sizin sunucunuzdan e-posta
göndertir).

Önlemler: kullanıcı metnini **konuya ve gönderen adına koymayın**; gövdede sabit bir cümlenin içinde, alıntı olarak
verin ("Davet eden: …"); bağlantı ve adres içeren kısmı atın, uzunluğu sınırlayın; davetleri hız sınırına bağlayın;
doğrulanmamış adrese kullanıcının yazdığı içeriği göndermeyin.

## Başlık enjeksiyonu

```python calistir
import re
from email import message_from_string, policy
from email.message import EmailMessage

konu = "Merhaba\r\nBcc: kurban@ornek.org"  # kullanıcının "konu" alanına yazdığı

# YANLIŞ: başlıkları metin birleştirerek kurmak — yeni bir başlık (gizli alıcı) eklenir
ham = f"From: bildirim@ornek.com\r\nTo: ayse@ornek.com\r\nSubject: {konu}\r\n\r\nGövde"
assert message_from_string(ham, policy=policy.default)["Bcc"] == "kurban@ornek.org"

# DOĞRU: kitaplığın ileti nesnesi başlıkta satır sonunu reddeder
ileti = EmailMessage()
try:
    ileti["Subject"] = konu
    raise AssertionError("reddedilmeliydi")
except ValueError:
    pass


def one_line(value: str, limit: int = 120) -> str:
    """Başlığa ya da şablona girecek kullanıcı metni: tek satır, denetim karaktersiz, sınırlı."""
    return " ".join("".join(ch if ch.isprintable() else " " for ch in value).split())[:limit]


ileti["Subject"] = one_line(konu)
assert ileti["Subject"] == "Merhaba Bcc: kurban@ornek.org" and "Bcc" not in ileti

# Kullanıcı metni güvenilir şablona girerken: bağlantı ve adres çıkarılır, ad kısaltılır
LINKISH = re.compile(r"(https?://\S+|www\.\S+|\S+@\S+|\b[\w-]+\.(com|net|org|tr|example)\b\S*)", re.IGNORECASE)


def display_name(value: str) -> str:
    return one_line(LINKISH.sub("", value), limit=40) or "Bir kullanıcı"


ad = "Hesabınız askıya alındı! Doğrulamak için kotu.example/giris adresine girin"
assert "kotu.example" not in display_name(ad)
assert len(display_name(ad)) <= 40
assert display_name("Ayşe Yılmaz") == "Ayşe Yılmaz"
print("tamam")
```

Python'un eski `email.message.Message` sınıfı da gömülü başlığı yazarken hata verir (denendi); asıl tehlike
`smtplib.sendmail`'e elle kurulmuş ham metin vermektir. Node'da yerleşik e-posta kitaplığı yoktur; kullandığınız
kitaplığın başlıkta satır sonunu nasıl işlediğini kurulu sürümün testleriyle doğrulayın ve yine de girdiyi tek satıra
indirin. Genel enjeksiyon ilkesi: [Enjeksiyon](enjeksiyon.md).

## Bağlantı ve ek güvenliği

- E-postadaki her bağlantı **kendi alan adınızda** ve HTTPS olsun. Kısaltıcı ve üçüncü taraf alan adı, kullanıcıyı
  tanımadığı adrese tıklamaya alıştırır.
- Sağlayıcının **tıklama izleme** özelliği bağlantıları kendi yönlendiricisinden geçirir: sıfırlama belirteci o
  sağlayıcının günlüğüne düşer. Güvenlik e-postalarında tıklama izlemeyi kapatın.
- Alan adınızda **açık yönlendirme** (`/git?adres=…`) olmasın; oltalamacı sizin adresinizi sıçrama tahtası yapar
  ([Yönlendirme ve URL](../20-web-onyuz/yonlendirme-ve-url.md)).
- Hassas belgeyi (rapor, sağlık kaydı, fatura dökümü) ek olarak göndermeyin: e-posta iletilir, yedeklenir,
  silinemez. Giriş isteyen, süreli bir indirme bağlantısı gönderin ([Dosya ve medya](../30-arkauc/dosya-ve-medya.md)).
- Gelen eklerde türü içerikten tanıyın; çift uzantı ve yön denetim karakteri (sağdan sola çevirme) hilesine bakın:

```python calistir
RISKY = {"exe", "scr", "js", "vbs", "bat", "cmd", "msi", "lnk", "iso", "html", "htm", "docm", "xlsm"}
BIDI = {chr(c) for c in (0x202A, 0x202B, 0x202C, 0x202D, 0x202E, 0x2066, 0x2067, 0x2068, 0x2069)}  # yön denetimi


def attachment_warnings(name: str) -> list[str]:
    warnings = []
    if any(ch in BIDI for ch in name):
        warnings.append("yön denetim karakteri: görünen ad gerçek uzantıyı saklıyor")
        name = "".join(ch for ch in name if ch not in BIDI)
    parts = name.lower().rsplit(".", 2)
    if parts[-1] in RISKY:
        warnings.append(f"tehlikeli tür: .{parts[-1]}")
    if len(parts) == 3 and parts[1].isalpha() and len(parts[1]) <= 4:
        warnings.append("çift uzantı")
    return warnings


assert attachment_warnings("fatura.pdf") == []
assert attachment_warnings("fatura.pdf.exe") == ["tehlikeli tür: .exe", "çift uzantı"]
gorunen = "fatura" + chr(0x202E) + "fdp.exe"  # e-posta istemcisinde "faturaexe.pdf" gibi görünür
assert attachment_warnings(gorunen) == [
    "yön denetim karakteri: görünen ad gerçek uzantıyı saklıyor",
    "tehlikeli tür: .exe",
]
print("tamam")
```

HTML ekler ve HTML gövdeler giriş formu taşıyabilir; gelen HTML'i uygulamada gösterecekseniz temizleyin
([XSS ve CSP](xss-ve-csp.md)). Arşiv ve belge işleme riskleri: [Dosya yükleme güvenliği](dosya-yukleme-guvenligi.md).

## İşlemsel e-postada belirteç sızıntısı

| Kanal                                   | Nasıl sızar                                                              | Önlem                                                           |
| --------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------- |
| E-posta güvenlik tarayıcısı, önizleyici | Bağlantıyı GET ile açar; tek kullanımlık belirteç harcanır ya da kaydedilir | GET sayfayı gösterir, belirteci düğmeye basınca POST harcar   |
| `Referer` başlığı                       | Belirteçli sayfa üçüncü taraf kaynak yüklerse adres onlara gider         | O sayfada `Referrer-Policy: no-referrer`, üçüncü taraf kaynak yok |
| Sunucu ve vekil günlükleri              | Sorgu dizesi olduğu gibi yazılır                                         | Günlükte maskeleme; ya da belirteci adres parçasında (`#`) taşıyıp sayfadan POST etmek |
| Sağlayıcının tıklama izlemesi           | Bağlantı sağlayıcının yönlendiricisinden geçer                           | Güvenlik e-postalarında kapalı                                  |
| Tarayıcı geçmişi, paylaşılan cihaz      | Adres geçmişte kalır                                                     | Kısa ömür, tek kullanım; kullanınca `history.replaceState`      |
| İletilen e-posta                        | Kullanıcı e-postayı başkasına iletir                                     | Kısa ömür; belirteç hesaba ve amaca bağlı                       |
| Konu satırı, kilit ekranı bildirimi     | Kod konuda yazılı                                                        | Kodu konuya yazmayın                                            |
| Uygulama günlüğü                        | E-posta gövdesi günlüğe yazıldı                                          | Yalnız şablon adı ve ileti kimliği                              |

```python calistir
import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

SECRET_KEYS = {"token", "code", "key", "signature", "sig", "otp"}
LONG_TOKEN = re.compile(r"^[A-Za-z0-9_-]{24,}$")


def redact_url(url: str) -> str:
    """Günlüğe yazılacak adreste belirteçleri maskeler: gizli sorgu parametreleri ve uzun yol parçaları."""
    parts = urlsplit(url)
    query = [(k, "***" if k.lower() in SECRET_KEYS else v) for k, v in parse_qsl(parts.query, keep_blank_values=True)]
    path = "/".join("***" if LONG_TOKEN.match(segment) else segment for segment in parts.path.split("/"))
    return urlunsplit((parts.scheme, parts.netloc, path, urlencode(query, safe="*"), ""))  # parça (#) yazılmaz


belirtec = "Zx8" + "q" * 30
assert redact_url(f"https://ornek.com/sifre/sifirla?token={belirtec}&dil=tr") == "https://ornek.com/sifre/sifirla?token=***&dil=tr"
assert redact_url(f"https://ornek.com/giris/{belirtec}") == "https://ornek.com/giris/***"
assert redact_url("https://ornek.com/gorev/42?durum=acik#yorum") == "https://ornek.com/gorev/42?durum=acik"
print("tamam")
```

## Tuzaklar

| Belirti                                                          | Neden                                                         | Çözüm                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------ |
| DMARC raporunda kendi sağlayıcınızın iletileri "fail"            | Sağlayıcı kendi alan adıyla imzalıyor (hizasız)               | Sağlayıcıda alan adı doğrulama; DKIM kendi alan adınızla     |
| `p=reject`'e geçilen gün kendi e-postalarınız düştü              | Raporlar okunmadan sıkılaştırıldı                             | `p=none` → raporlar → kademeli sıkılaştırma                  |
| İletilen e-postalar spam'e düşüyor                               | İletmede SPF bozulur                                          | DKIM hizasına dayanın                                        |
| Davet e-postanız oltalama diye şikâyet edildi                    | Kullanıcı adına bağlantı yazılmış                             | Kullanıcı metnini sınırla, bağlantıyı at, konuya koyma       |
| Bilinmeyen kişilere gizli kopya gitti                            | Başlık metin birleştirmeyle kuruldu                           | Kitaplığın ileti nesnesi; tek satıra indirme                 |
| Kullanıcı tıklamadan sıfırlama bağlantısı "kullanılmış"          | Tarayıcı ya da tarama hizmeti GET ile açtı                    | GET göster, POST harca                                       |
| Analitik panelinde sıfırlama adresleri görünüyor                 | Belirteçli sayfa analitik betiği yükledi                      | `no-referrer`; o sayfada üçüncü taraf betik yok              |
| Sıfırlama bağlantıları sağlayıcının alan adından geçiyor         | Tıklama izleme açık                                           | Güvenlik e-postalarında kapatın                              |
| Hizalama denetiminiz bütün `.com.tr` alanlarını eş sayıyor       | "Son iki etiket" kısayolu                                     | Kamu son ekleri listesi                                      |
| Destek kutusunda "fatura.pdf" çalıştırılabilir çıktı             | Yön karakteri ya da çift uzantı                               | İçerikten tür tanıma, ad uyarısı                             |

## Denetim listesi

- [ ] SPF tek kayıt, DKIM kendi alan adınızla, DMARC `p=none`'dan başlayıp raporlarla sıkılaşıyor.
- [ ] E-posta göndermeyen alan adlarında `-all` ve `p=reject` var.
- [ ] E-postalar kitaplığın ileti nesnesiyle kuruluyor; başlığa giren her kullanıcı metni tek satıra indiriliyor.
- [ ] Kullanıcı metni (ad, liste adı, yorum) e-postada sınırlı, bağlantısız ve alıntı olarak; konu ve gönderen adında yok.
- [ ] Bağlantılar kendi alan adımızda, HTTPS; açık yönlendirme yok; güvenlik e-postalarında tıklama izleme kapalı.
- [ ] Tek kullanımlık bağlantılar GET'te harcanmıyor; o sayfalarda `no-referrer`; günlüklerde belirteç maskeli.
- [ ] Hassas belge ek olarak gönderilmiyor.
- [ ] Gelen e-posta işleniyorsa: doğrulama sonucu okunuyor, HTML temizleniyor, ekler içerikten tanınıyor.
- [ ] Kullanıcıya "hangi adresten yazarız, ne istemeyiz" bilgisi yazılı.

## Küçük modele yaptırırken

- **İsteme yazın:** "E-postayı kitaplığın ileti nesnesiyle kur, başlıkları metin birleştirerek yazma. Başlığa ya da
  şablona giren kullanıcı metnini tek satıra indir ve sınırla. Kullanıcı adını konuya ve gönderen adına koyma,
  gövdede alıntı olarak ver; bağlantı ve adres içeriyorsa çıkar. Belirteçli bağlantı GET'te belirteci harcamasın."
- **Modelin tipik hatası:** f-string ile ham başlık kurar; davet e-postasının konusuna davet edenin adını koyar;
  sıfırlama bağlantısını GET işleyicisinde tüketir; isteğin tam adresini günlüğe yazar; DMARC'ı doğrudan
  `p=reject` ile önerir; alan adlarını "son iki etiket" ile karşılaştırır; SPF'e ikinci bir kayıt ekler.
- **Çıktıda arayın:** `f"Subject:`, `"\r\n".join(` ile başlık, ham metinle `sendmail(`, konu ya da `From`
  içinde kullanıcı alanı, GET işleyicisinde belirteç silme, `logger.info(request.url`, `.split(".")[-2:]`.
- **Test isteyin:** satır sonu içeren konu, bağlantı içeren kullanıcı adı ve aynı sıfırlama bağlantısının iki kez
  GET ile açılması senaryoları.

## İlgili

- [E-posta ve bildirim](../30-arkauc/e-posta-ve-bildirim.md) — işlemsel/toplu ayrımı, teslim, abonelikten çıkma
- [Alan adı ve DNS](../60-devops/alan-adi-ve-dns.md) — SPF/DKIM/DMARC kayıtları ve kayıt denetleyicisi
- [Kimlik doğrulama](../30-arkauc/kimlik-dogrulama.md) — sıfırlama belirteci kuralları
- [Parola ve hesap güvenliği](parola-ve-hesap-guvenligi.md) — hesap numaralandırma, kurtarma
- [Güvenlik başlıkları ve HTTPS](guvenlik-basliklari-ve-https.md) — `Referrer-Policy`
- [Güvenlik günlüğü](gunluk-ve-izleme-guvenlik.md) — maskeleme ve günlük enjeksiyonu
- [Enjeksiyon](enjeksiyon.md) — veriyle kodu ayırma ilkesi
