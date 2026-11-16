---
baslik: Yayın öncesi güvenlik denetimi
ozet: Bir uygulamayı yayına almadan önce tek sayfalık, maddeleri doğrulanabilir güvenlik denetim listesi; her madde ayrıntılı nota bağlı, üretim ayarlarını denetleyen yayın kapısı betiği ve yayın günü duman testi.
etiketler: [guvenlik, yayin, denetim-listesi, yapilandirma]
duzey: temel
guncellik: 2026-11
---

# Yayın öncesi güvenlik denetimi

> Bu notu ne zaman okumalı: bir uygulama ilk kez yayına alınmadan önce; barındırıcı, alan adı ya da kimlik
> sistemi değiştikten sonra; büyük bir özellikten (ödeme, dosya yükleme, yapay zekâ aracı) sonra; yılda bir.
> Havuzdaki uygulama temelinin kendine özgü listesi: [`uygulama/docs/GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md) §3.

## Temel fikir

Bu not bir **kapıdır**: her madde "evet/hayır" ile cevaplanır ve cevap bir komutla, bir testle ya da tarayıcıda
bakarak **doğrulanabilir**. "Güvenli mi?" sorusu yerine "bu maddenin kanıtı ne?" sorulur. Maddeler önem sırasına
göre üç gruba ayrılır:

| Önem      | Anlamı                                                  | Tepki                               |
| --------- | ------------------------------------------------------- | ----------------------------------- |
| **Engel** | Açık hemen kullanılabilir ya da veri kaybı riski var    | Yayın durur                         |
| **Önemli** | Risk gerçek ama koşula bağlı                           | Yayından sonra bir hafta içinde     |
| **Öneri** | Savunma derinliği                                       | Birikim listesine                   |

Listeyi her yayında baştan sona okumak gerekmez: kod değişikliği küçükse yalnız değişen bölümler; altyapı
değiştiyse "HTTPS ve başlıklar", "Sırlar", "Yedek" bölümleri yeniden.

## Yayın kapısı betiği: üretim ayarları

En pahalı yayın hataları koddan değil **ayardan** çıkar: geliştirme kipinde kalan üretim, `*` köken, kapalı hız
sınırı, geçici diske yazılan veritabanı. Bu maddeler betikle denetlenir; dağıtım adımı betik temiz değilse durur.
(Havuzdaki uygulama bunların bir kısmını açılışta zaten reddeder: [`config.ts`](../../uygulama/api/src/config.ts).)

```python calistir
import re
from urllib.parse import urlsplit

ORNEK_DEGER = re.compile(r"(?i)degistir|changeme|example|ornek|xxx|^$")


def yayin_kapisi(ortam: dict[str, str]) -> list[str]:
    engeller = []
    if ortam.get("NODE_ENV") != "production":
        engeller.append("NODE_ENV production değil: Secure çerez ve HSTS kapalı kalır")
    adres = urlsplit(ortam.get("APP_URL", ""))
    if adres.scheme != "https" or adres.hostname in {None, "localhost", "127.0.0.1"}:
        engeller.append("APP_URL https ile gerçek alan adı değil")
    for koken in filter(None, (k.strip() for k in ortam.get("ALLOWED_ORIGINS", "").split(","))):
        if koken == "*" or not koken.startswith("https://") or "localhost" in koken:
            engeller.append(f"ALLOWED_ORIGINS güvensiz köken içeriyor: {koken}")
    if ortam.get("RATE_LIMIT", "on") != "on":
        engeller.append("hız sınırı kapalı")
    yol = ortam.get("DATABASE_PATH", "")
    if yol in {"", ":memory:"} or yol.startswith("/tmp/"):
        engeller.append("DATABASE_PATH kalıcı diskte değil: yeniden başlatmada veri silinir")
    if ortam.get("MAIL_PROVIDER") == "http" and ORNEK_DEGER.search(ortam.get("MAIL_HTTP_KEY", "")):
        engeller.append("MAIL_HTTP_KEY boş ya da örnek değer")
    yoneticiler = [e.strip() for e in ortam.get("ADMIN_EMAILS", "").split(",") if e.strip()]
    if not yoneticiler or any("@" not in e for e in yoneticiler):
        engeller.append("ADMIN_EMAILS boş ya da bozuk")
    if ortam.get("LOG_LEVEL") == "debug":
        engeller.append("LOG_LEVEL debug: günlükte fazla ayrıntı")
    return engeller


KOTU = {"NODE_ENV": "development", "APP_URL": "http://localhost:5310", "ALLOWED_ORIGINS": "*", "RATE_LIMIT": "off",
        "DATABASE_PATH": "/tmp/uygulama.db", "MAIL_PROVIDER": "http", "MAIL_HTTP_KEY": "degistir-beni", "LOG_LEVEL": "debug"}
IYI = {"NODE_ENV": "production", "APP_URL": "https://gorev.alanadim.com.tr", "DATABASE_PATH": "/data/uygulama.db",
       "MAIL_PROVIDER": "http", "MAIL_HTTP_KEY": "k_7Hq2pX9vLm4Rt8Zb", "ADMIN_EMAILS": "sahip@alanadim.com.tr", "LOG_LEVEL": "info"}

for engel in yayin_kapisi(KOTU):
    print(engel)
assert yayin_kapisi(IYI) == []  # TEST: doğru üretim ayarı kapıdan geçer
```

```cikti
NODE_ENV production değil: Secure çerez ve HSTS kapalı kalır
APP_URL https ile gerçek alan adı değil
ALLOWED_ORIGINS güvensiz köken içeriyor: *
hız sınırı kapalı
DATABASE_PATH kalıcı diskte değil: yeniden başlatmada veri silinir
MAIL_HTTP_KEY boş ya da örnek değer
ADMIN_EMAILS boş ya da bozuk
LOG_LEVEL debug: günlükte fazla ayrıntı
```

Betik değerleri yazdırmaz, yalnız sorunu söyler (değer bir sır olabilir). Değişken adlarını kendi projenize göre
uyarlayın; kuralların gerekçesi bağlantılı notlarda.

## Denetim listesi

Her maddenin başındaki harf önemidir: **E** engel, **Ö** önemli.

### Tasarım

- [ ] **Ö** Tehdit modeli güncel; 9 puanlı açık satır yok; kabul edilen riskler README "Sınırlar"da
      ([Tehdit modelleme](tehdit-modelleme.md)).

### Kimlik, oturum, CSRF

- [ ] **E** Parolalar yavaş özetle; giriş ve şifremi unuttum hesabın varlığını sızdırmıyor; giriş uçlarında hız
      sınırı ([Parola ve hesap](parola-ve-hesap-guvenligi.md)).
- [ ] **E** Oturum çerezi `HttpOnly; Secure; SameSite=Lax; Path=/`, üretimde `__Host-`; çıkış ve parola değişimi
      sunucuda iptal ediyor ([Oturum güvenliği](oturum-guvenligi.md)).
- [ ] **E** Değiştiren uçlarda köken denetimi; GET yan etkisiz; CORS kapalı ya da tam eşleşme listesi
      ([CSRF ve CORS](csrf-ve-cors.md)).
- [ ] **Ö** Yönetici hesabında güçlü, başka yerde kullanılmayan parola; varsa ikinci etken.

### Yetki

- [ ] **E** Herkese açık uçlar bilinçli bir listede; öteki her uç oturumsuz isteğe 401 veriyor (kural testi).
- [ ] **E** Kimlik alan her uçta sahiplik/kiracı koşulu sorguda; iki kullanıcılı çapraz erişim testi var; gövdede
      `rol`/`sahip` alanları reddediliyor ([Erişim açıkları](erisim-denetimi-aciklari.md)).

### Girdi ve çıktı

- [ ] **E** SQL'in tamamı parametreli; kabuk komutu yok ya da argüman listesiyle ([Enjeksiyon](enjeksiyon.md)).
- [ ] **E** Kullanıcı verisi kaçışlanarak basılıyor; `innerHTML`/`dangerouslySetInnerHTML` gerekçesiz yok; adresler
      şema izin listesinden geçiyor ([XSS ve CSP](xss-ve-csp.md)).
- [ ] **E** Dosya yükleme varsa: ad sunucuda, tür içerikten, boyut sınırı, arşivde yol/bomba denetimi, ayrı alan
      adından sunma ([Dosya yükleme](dosya-yukleme-guvenligi.md)).
- [ ] **E** Kullanıcı adresine istek atan özellik varsa: çözülen IP denetimi, yönlendirme yok
      ([SSRF](ssrf-ve-dis-istekler.md)).
- [ ] **Ö** Gövde, liste, süre sınırları; hata yanıtları ayrıntı (yığın izi, SQL) sızdırmıyor
      ([OWASP özeti](owasp-ozet.md)).

### HTTPS ve başlıklar

- [ ] **E** Alan adı HTTPS ile açılıyor; HTTP kalıcı yönlendiriliyor; sertifika otomatik yenileniyor.
- [ ] **Ö** HSTS, CSP (uygulama kipinde, gevşek değil), `nosniff`, `Referrer-Policy`, `Permissions-Policy`,
      çerçeve yasağı var; konsolda CSP ihlali yok; başlık denetim betiği temiz
      ([Başlıklar ve HTTPS](guvenlik-basliklari-ve-https.md)).

### Sırlar ve ayarlar

- [ ] **E** Yayın kapısı betiği temiz (yukarıda).
- [ ] **E** Depoda ve geçmişinde sır yok (`git log -p` taraması); `.env` depoda değil; istemci paketinde sunucu
      sırrı yok ([Sır yönetimi](sir-yonetimi.md)).
- [ ] **Ö** Ters vekil sayısı (`TRUST_PROXY`) doğru: iki farklı ağdan girişte günlükteki IP'ler farklı ve gerçek.
- [ ] **Ö** Barındırma, alan adı, DNS, Git ve e-posta sağlayıcısı hesaplarında iki aşamalı doğrulama.

### Bağımlılıklar

- [ ] **Ö** Kilitten kurulum; `npm audit --omit=dev` (ya da `pip-audit`) kritik açık göstermiyor ya da her
      uyarının kararı yazılı; CI eylemleri sabitlenmiş ([Tedarik zinciri](tedarik-zinciri.md)).

### Günlük, izleme, olay

- [ ] **E** Günlükte parola, belirteç, çerez, e-posta yok (test) ([Günlük ve izleme](gunluk-ve-izleme-guvenlik.md)).
- [ ] **Ö** Güvenlik olayları denetim izinde; başarısız giriş ve 403/404 sıçramasına, yönetici rolü verilmesine uyarı var.
- [ ] **Ö** Sağlık ucu dışarıdan izleniyor; sızıntı ya da ele geçirmede ilk saat adımları ve hazır komutlar
      biliniyor ([Olay müdahalesi](olay-mudahalesi.md)).

### Yedek

- [ ] **E** Veritabanı kalıcı diskte; zamanlanmış tutarlı yedek; **bir kez geri yükleme denendi**.
- [ ] **Ö** Bir kopya üretimin silemeyeceği yerde; yedekler şifreli, anahtar ayrı yerde
      ([Yedek ve fidye yazılımı](yedek-ve-fidye-yazilimi.md)).

### Kişisel veri

- [ ] **E** Gizlilik/aydınlatma metni hangi verinin, ne amaçla, ne kadar saklandığını söylüyor ve gerçekle tutarlı.
- [ ] **Ö** Veri envanteri şemayla eşleşiyor; saklama süreleri uygulanıyor; dışa aktarma ve hesap silme çalışıyor;
      dış hizmetler (e-posta, hata izleme, yapay zekâ) listelenmiş ([KVKK pratiği](kvkk-pratik.md)).

### Yapay zekâ özelliği varsa

- [ ] **E** Araçlar oturumla kuruluyor; dünyayı değiştiren araç onaysız çalışmıyor; model çıktısı kaçışlanıyor
      ([YZ uygulama güvenliği](yapay-zeka-uygulama-guvenligi.md)).
- [ ] **Ö** Kişisel veri dış modele maskelenerek gidiyor; kullanıcı başına bütçe ve hız sınırı var.

### Kayıt

- [ ] Bu listenin sonucu (tarih, sürüm, kim baktı, açık kalan "Ö" maddeleri ve hedef tarihleri) yazıldı.

## Yayın günü duman testi

Yayından hemen sonra, gerçek adreste, 15 dakikada:

1. `curl -fsS https://alanadi/api/health` başarılı.
2. Başlık denetim betiği ([Başlıklar ve HTTPS](guvenlik-basliklari-ve-https.md)) gerçek adrese karşı temiz.
3. Tarayıcıda giriş: çerez `__Host-` önekli ve `Secure`; konsolda CSP ihlali ve karma içerik uyarısı yok.
4. Yanlış parolayla 11 deneme: 11'incisi `429` ve `Retry-After` veriyor (hız sınırı canlıda açık).
5. "Şifremi unuttum" e-postası geliyor (spam klasörüne de bakın); bağlantı tek kullanımlık.
6. Başka bir hesapla, ilk hesabın bir kaydının adresini açmak 404 veriyor.
7. Son yedeğin zamanı bugün; yedek yeri yalnız yazma kimliğiyle erişiliyor.

## Tuzaklar

| Belirti                                                         | Neden                                                       | Çözüm                                                           |
| --------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| Liste her seferinde "hepsi tamam" diye işaretleniyor            | Maddeler doğrulanamaz cümleler; kanıt istenmiyor            | Her maddenin yanında komut/test/ekran kanıtı                    |
| Yerelde her şey doğruydu, canlıda başlıklar ve hız sınırı yok   | Ayar ve altyapı farkı; canlıda denenmedi                    | Yayın kapısı betiği + duman testi canlı adreste                 |
| Yayından bir gün sonra veritabanı boş                           | Geçici disk; yedek denenmemiş                               | `DATABASE_PATH` kalıcı; geri yükleme tatbikatı                  |
| Liste uzun diye hiç kullanılmıyor                               | Önem ayrımı yok                                             | Önce "E" maddeleri; "Ö"ler takvimle                              |
| Model "tüm güvenlik maddeleri karşılandı" dedi                  | Kanıtsız beyan                                              | Her madde için dosya, test adı ya da komut çıktısı isteyin      |
| Yıllık denetimde aynı açıklar yine çıkıyor                      | Bulgular kural testine dönüşmedi                            | Kapatılan her açık için test ya da lint kuralı                  |

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu listeyi uygulama için madde madde doldur. Her maddeye üç değerden birini yaz: `tamam`
  (kanıt: dosya yolu, test adı ya da komut çıktısı), `eksik` (ne yapılmalı), `uygulanmaz` (neden). Kanıtı
  olmayan maddeye `tamam` yazma."
- **Modelin tipik hatası:** kodda olmayan önlemi var saymak; ayar maddelerini (`NODE_ENV`, `TRUST_PROXY`, kalıcı
  disk) kod incelemesiyle geçmek; "E" ve "Ö" ayrımını yok sayıp her şeyi aynı önemde raporlamak.
- **Çıktıda denetleyin:** "tamam" maddelerinden rastgele üçünün kanıtını açıp bakın; kanıt yoksa bütün listeye
  güvenmeyin.
- **Test isteyin:** yayın kapısı betiğini CI'nın dağıtım adımına koydurun; duman testi adımlarını betiğe çevirtin.

## İlgili

- Havuzdaki uygulamanın kendi listesi ve bilinen sınırları: [`uygulama/docs/GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md)
  §3 ve §5; yayın adımları [`uygulama/docs/YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md)
- Sınıf haritası: [OWASP özeti](owasp-ozet.md) · Başlangıç: [Tehdit modelleme](tehdit-modelleme.md) · Testler:
  [Güvenlik testleri](guvenlik-testleri.md)
- İnceleme yöntemi: [Kod inceleme](../00-yontem/kod-inceleme.md) · Dağıtım hattına kapı: [CI/CD](../60-devops/ci-cd.md) ·
  Altyapı: [HTTPS ve sertifikalar](../60-devops/https-ve-sertifikalar.md), [Veritabanı yedekleme](../60-devops/veritabani-yedekleme.md)
