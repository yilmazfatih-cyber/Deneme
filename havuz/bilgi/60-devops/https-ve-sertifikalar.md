---
baslik: HTTPS ve sertifikalar
ozet: TLS'in neyi sağlayıp neyi sağlamadığı, sertifika türleri ve joker kuralı, ACME ile otomatik sertifika, eksik ara sertifika, vekilde sonlandırma, karışık içerik ve HSTS'e güvenli geçiş.
etiketler: [https, tls, sertifika, acme, hsts, guvenlik]
duzey: orta
guncellik: 2026-11
---

# HTTPS ve sertifikalar

> Bu notu ne zaman okumalı: alan adını bağlayıp HTTPS'i açarken; tarayıcı "bağlantınız gizli değil" dediğinde;
> sertifika yenilenmediğinde; `Strict-Transport-Security` başlığını eklemeden önce.

## Temel fikir

TLS üç şey sağlar: **gizlilik** (araya giren okuyamaz), **bütünlük** (araya giren değiştiremez) ve **sunucu
kimliği** (bu sunucu gerçekten `ornek.com`'un anahtarına sahip). Sitenin güvenilir ya da dürüst olduğunu söylemez;
dolandırıcı sitelerin de sertifikası vardır.

Sertifika = açık anahtar + kapsadığı **adlar** (SAN) + geçerlilik süresi + yetkilinin (CA) imzası. Tarayıcı imza
zincirini kendi güvendiği kök sertifikalara kadar izler. Bugün sertifikalar ücretsiz ve **otomatiktir** (ACME);
elle alınan, elle yenilenen sertifika unutulur ve bir gece süresi dolar. Sektör sertifika ömürlerini aşama aşama
kısaltıyor (güncel süreyi yetkilinizin sayfasından okuyun): yenileme otomatik ve **izlenen** bir iş olmalıdır.

## Karar tablosu

| Durum                                                  | Seçim                                                          | Neden                                                     |
| ------------------------------------------------------ | -------------------------------------------------------------- | --------------------------------------------------------- |
| PaaS ya da durağan barındırma (Render, Pages, Netlify) | Platformun otomatik sertifikası                                | DNS doğruysa hiçbir şey yapmazsınız                        |
| VPS, birkaç alan adı                                   | Caddy (kendiliğinden) ya da nginx + certbot                    | ACME istemcisi alır ve yeniler                            |
| Joker sertifika (`*.ornek.com`) gerekiyor              | ACME DNS-01                                                    | HTTP-01 joker sertifika veremez                           |
| Önünde CDN var                                         | CDN ↔ kaynak arası da şifreli ("tam/katı" kip), kaynakta geçerli sertifika | "Esnek" kipte trafik CDN'den sonra şifresiz gider |
| Yalnız iç ağ, deneme                                   | İç CA ya da yerel geliştirme CA'sı                             | Herkese açık CA yalnız herkese açık adlara verir          |
| Telefonda yerel deneme (mikrofon, servis çalışanı HTTPS ister) | Kendinden imzalı geliştirme sertifikası (Köprü: `npm run dev:https`) | Uyarıyı bir kez geçersiniz; üretimde asla      |
| OV/EV "daha güvenli" sertifika isteniyor               | Çoğu proje için gereksiz                                       | Tarayıcılar artık farklı göstermiyor; şifreleme aynı      |

## Sertifikanın kapsadığı adlar

- **Tek ad / çok adlı (SAN):** `ornek.com` ve `www.ornek.com` iki ayrı addır; ikisi de sertifikada olmalıdır.
- **Joker (`*.ornek.com`):** yalnız **bir düzey** alt alanı kapsar. Kökü (`ornek.com`) kapsamaz, `a.b.ornek.com`'u
  kapsamaz.

Aşağıdaki blok bir deneme CA'sı ve `*.ornek.test` sertifikası üretir, yerel bir TLS sunucusuna tarayıcı gibi
denetleyen bir istemciyle bağlanır; aynı sertifikanın süre izlemesini de gösterir:

```bash calistir
anahtar() { openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:prime256v1 -out "$1" 2> /dev/null; }
anahtar ca.key
anahtar sunucu.key
# Deneme sertifika yetkilisi (CA) ve *.ornek.test için 2 gün geçerli sertifika
openssl req -x509 -new -key ca.key -days 2 -subj "/CN=Deneme CA" \
  -addext "keyUsage=critical,keyCertSign,cRLSign" -out ca.pem
printf '%s\n' "subjectAltName=DNS:*.ornek.test" "basicConstraints=CA:FALSE" "keyUsage=critical,digitalSignature" \
  "extendedKeyUsage=serverAuth" "subjectKeyIdentifier=hash" "authorityKeyIdentifier=keyid" > uzanti.ext
openssl req -new -key sunucu.key -subj "/CN=ornek.test" |
  openssl x509 -req -CA ca.pem -CAkey ca.key -CAcreateserial -days 2 -extfile uzanti.ext -out sunucu.pem 2> /dev/null
openssl x509 -in sunucu.pem -noout -text | grep -o 'DNS:[^,]*'
# Süre izleme: -checkend N → N saniye içinde bitmiyorsa çıkış 0
openssl x509 -in sunucu.pem -noout -checkend 86400 > /dev/null && echo "1 gün sonra: geçerli"
openssl x509 -in sunucu.pem -noout -checkend $((30 * 86400)) > /dev/null || echo "30 gün içinde bitiyor: UYARI"
python3 - <<'PY'
import socket, ssl, threading

sunucu = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
sunucu.load_cert_chain("sunucu.pem", "sunucu.key")
dinle = socket.create_server(("127.0.0.1", 0))


def kabul_et():
    while True:
        try:
            baglanti, _ = dinle.accept()
        except OSError:
            return
        try:
            with sunucu.wrap_socket(baglanti, server_side=True) as t:
                t.sendall(b"ok")
        except (ssl.SSLError, OSError):
            pass


threading.Thread(target=kabul_et, daemon=True).start()
istemci = ssl.create_default_context(cafile="ca.pem")  # tarayıcı gibi: zinciri ve adı denetler
for ad in ["app.ornek.test", "ornek.test", "a.b.ornek.test"]:
    try:
        with socket.create_connection(dinle.getsockname(), timeout=5) as s:
            with istemci.wrap_socket(s, server_hostname=ad) as t:
                t.recv(2)
        print(f"{ad}: geçerli")
    except ssl.SSLCertVerificationError as hata:
        assert hata.verify_code == 62  # X509_V_ERR_HOSTNAME_MISMATCH
        print(f"{ad}: REDDEDİLDİ, ad uyuşmuyor")
dinle.close()
PY
```

```cikti
DNS:*.ornek.test
1 gün sonra: geçerli
30 gün içinde bitiyor: UYARI
app.ornek.test: geçerli
ornek.test: REDDEDİLDİ, ad uyuşmuyor
a.b.ornek.test: REDDEDİLDİ, ad uyuşmuyor
```

Yayındaki bir sitenin süresini izlemek için (ağ ister; `-servername` şarttır, yoksa sunucu varsayılan sertifikasını
verebilir):

```bash
echo | openssl s_client -connect ornek.com:443 -servername ornek.com 2> /dev/null |
  openssl x509 -noout -enddate -checkend $((14 * 86400)) || echo "UYARI: 14 gün içinde bitiyor"
```

Herkese açık her sertifika **açık kayıtlara** (Certificate Transparency) yazılır: sertifikadaki alt alan adları
herkesçe görülebilir. Gizli kalması gereken bir ad (`yonetim-paneli.ornek.com`) için joker sertifika kullanın.

## Eksik ara sertifika

Yetkililer sertifikayı doğrudan kökle değil bir **ara sertifikayla** imzalar. Sunucu kendi sertifikasıyla birlikte
ara sertifikayı da göndermelidir (ACME istemcilerinde `fullchain.pem`). Göndermezse bazı tarayıcılar eksik parçayı
kendisi bulup "çalışıyor" gösterir; `curl`, mobil uygulamalar, eski Android ve sunucudan sunucuya çağrılar ise
reddeder:

```bash calistir
anahtar() { openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:prime256v1 -out "$1" 2> /dev/null; }
anahtar kok.key
anahtar ara.key
anahtar site.key
openssl req -x509 -new -key kok.key -days 2 -subj "/CN=Deneme Kok" \
  -addext "keyUsage=critical,keyCertSign,cRLSign" -out kok.pem
printf '%s\n' "basicConstraints=critical,CA:TRUE,pathlen:0" "keyUsage=critical,keyCertSign,cRLSign" \
  "subjectKeyIdentifier=hash" "authorityKeyIdentifier=keyid" > ara.ext
printf '%s\n' "subjectAltName=DNS:ornek.test,DNS:www.ornek.test" "basicConstraints=CA:FALSE" \
  "keyUsage=critical,digitalSignature" "extendedKeyUsage=serverAuth" \
  "subjectKeyIdentifier=hash" "authorityKeyIdentifier=keyid" > site.ext
openssl req -new -key ara.key -subj "/CN=Deneme Ara" |
  openssl x509 -req -CA kok.pem -CAkey kok.key -CAcreateserial -days 2 -extfile ara.ext -out ara.pem 2> /dev/null
openssl req -new -key site.key -subj "/CN=ornek.test" |
  openssl x509 -req -CA ara.pem -CAkey ara.key -CAcreateserial -days 2 -extfile site.ext -out site.pem 2> /dev/null
cat site.pem ara.pem > fullchain.pem # ACME istemcilerinin verdiği "tam zincir" dosyası budur
python3 - <<'PY'
import socket, ssl, threading


def dene(zincir: str) -> str:
    sunucu = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    sunucu.load_cert_chain(zincir, "site.key")
    dinle = socket.create_server(("127.0.0.1", 0))

    def kabul_et():
        baglanti, _ = dinle.accept()
        try:
            with sunucu.wrap_socket(baglanti, server_side=True) as t:
                t.sendall(b"ok")
        except (ssl.SSLError, OSError):
            pass

    threading.Thread(target=kabul_et, daemon=True).start()
    istemci = ssl.create_default_context(cafile="kok.pem")  # istemci yalnız kök sertifikayı tanır
    try:
        with socket.create_connection(dinle.getsockname(), timeout=5) as s:
            with istemci.wrap_socket(s, server_hostname="www.ornek.test") as t:
                t.recv(2)
        return "geçerli"
    except ssl.SSLCertVerificationError as hata:
        assert hata.verify_code == 20  # X509_V_ERR_UNABLE_TO_GET_ISSUER_CERT_LOCALLY
        return "REDDEDİLDİ, ara sertifika eksik"
    finally:
        dinle.close()


print("yalnız site.pem :", dene("site.pem"))
print("fullchain.pem   :", dene("fullchain.pem"))
PY
```

```cikti
yalnız site.pem : REDDEDİLDİ, ara sertifika eksik
fullchain.pem   : geçerli
```

nginx'te `ssl_certificate` satırı `fullchain.pem`'i gösterir, `cert.pem`'i değil.

## Otomatik sertifika (ACME)

ACME istemcisi (Caddy'nin kendisi, certbot ve benzerleri) yetkiliden sertifika ister ve adın sizin denetiminizde
olduğunu bir **sınamayla** kanıtlar:

| Sınama        | Nasıl kanıtlanır                                              | Gerekenler                                                   | Ne zaman                          |
| ------------- | ------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------- |
| HTTP-01       | `http://<ad>/.well-known/acme-challenge/…` dosyası sunulur    | 80 kapısı dışarıdan açık; ad (A **ve varsa AAAA**) bu sunucuda | Tek sunucu, belli adlar          |
| DNS-01        | `_acme-challenge.<ad>` TXT kaydı yazılır                      | DNS sağlayıcısının API anahtarı sunucuda (güçlü bir yetki)   | Joker sertifika; dışa kapalı sunucu |
| TLS-ALPN-01   | 443 üzerinde özel el sıkışma                                  | 443 dışarıdan açık; destekleyen istemci                      | 80 açılamıyorsa                   |

- Yenileme, süre bitmeden **çok önce** kendiliğinden yapılır; siz yalnız sonucun **izlendiğinden** emin olun
  (yukarıdaki `-checkend` denetimi, [İzleme ve uyarı](izleme-ve-uyari.md)).
- Yetkililerin sertifika sayısı sınırları vardır (sayılar değişir; güncelini belgeden okuyun). Ayarı denerken
  yetkilinin **deneme (staging)** ortamını kullanın. Sertifika klasörünü kalıcı tutun (Caddy'de `/data`, certbot'ta
  `/etc/letsencrypt`); her açılışta yeniden istemek sınıra takılır.
- `CAA` kaydı varsa yetkiliyi içermelidir ([Alan adı ve DNS](alan-adi-ve-dns.md)).
- Sertifika yenilenir ama vekil yeniden yüklenmezse eski sertifikayı sunmaya devam eder: certbot'ta yenileme
  sonrası `systemctl reload nginx` kancası olmalıdır.

## Vekilde sonlandırma

Sertifika ve anahtar ters vekilde durur; uygulama aynı makinede düz HTTP ile `127.0.0.1`'i dinler. Uygulama
isteğin aslında HTTPS ile geldiğini `X-Forwarded-Proto` başlığından öğrenir; güvenli çerez ve yönlendirme kararları
buna dayanır ([Ters vekil](ters-vekil.md)). Vekil ile uygulama farklı makinelerdeyse aradaki bağlantı da
şifrelenmelidir. Özel anahtar `600` izinli, depoda değil; sızarsa sertifika iptal edilip yenisi alınır.

## Karışık içerik

HTTPS sayfasının `http://` ile yüklediği betik ve stil **engellenir**; görsel ve ses tarayıcıya göre yükseltilir ya
da uyarıyla yüklenir. Sayfa "güvenli değil" görünür ya da bozuk çalışır. Derleme çıktısında arayın:

```bash calistir
mkdir -p dist
cat > dist/index.html <<'HTML'
<!doctype html>
<link rel="stylesheet" href="https://cdn.ornek.example/stil.css">
<script src="http://cdn.ornek.example/analiz.js"></script>
<img src="http://resim.ornek.example/logo.png" alt="">
<svg xmlns="http://www.w3.org/2000/svg"></svg>
<a href="http://eski.ornek.example/">eski site</a>
HTML
printf '.kapak { background: url("http://resim.ornek.example/kapak.jpg") }\n' > dist/stil.css
# Yüklenen kaynaklar: src/srcset, <link href>, CSS url(). Bağlantılar (<a href>) ve xmlns karışık içerik değildir.
desen='(src|srcset)="http://[^"]+"|<link[^>]*href="http://[^"]+"|url\(.?http://[^)]+\)'
grep -rnoE "$desen" dist | sort
test "$(grep -rnoE "$desen" dist | wc -l)" -eq 3
```

```cikti
dist/index.html:3:src="http://cdn.ornek.example/analiz.js"
dist/index.html:4:src="http://resim.ornek.example/logo.png"
dist/stil.css:1:url("http://resim.ornek.example/kapak.jpg")
```

Düzeltme: kaynağı `https://` ile ya da göreli yolla yükleyin. Kullanıcı içeriğinde (blog yazısındaki eski resim
bağlantıları) geçiş süresince CSP'nin `upgrade-insecure-requests` yönergesi yardımcı olur. SVG'lerdeki
`xmlns="http://www.w3.org/…"` bir addır, istek değildir; aramada süzün.

## HSTS'e geçiş

`Strict-Transport-Security` tarayıcıya "bu alan adına bir süre yalnız HTTPS ile gel" der. Sertifika bozulursa
kullanıcı uyarıyı **geçemez**; bu yüzden aşama aşama açılır:

| Adım | Başlık                                              | Sonraki adıma geçmeden önce                                    |
| ---- | --------------------------------------------------- | -------------------------------------------------------------- |
| 1    | `max-age=300`                                       | Bütün sayfalar ve yönlendirmeler HTTPS'te sorunsuz             |
| 2    | `max-age=86400`                                     | Bir hafta hata bildirimi yok                                   |
| 3    | `max-age=31536000` (havuzdaki uygulamanın üretim değeri) | Sertifika yenilemesi izleniyor                          |
| 4    | `; includeSubDomains`                               | **Her** alt alan (iç araçlar dahil) HTTPS'te                   |
| 5    | `; preload`                                         | Kalıcı karar: listeden çıkmak aylar sürer                      |

Havuzdaki uygulama üretimde 3. adımdadır ve `includeSubDomains`/`preload`'u bilinçli olarak eklemez
([`GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md) → "Güvenlik başlıkları",
[`securityHeaders.ts`](../../uygulama/api/src/http/securityHeaders.ts)). Başlık yalnız HTTPS yanıtında geçerlidir.
Geliştirmede `localhost`'a HSTS gönderen bir çatı, tarayıcının o makinedeki öteki projeleri de HTTPS'e zorlamasına
yol açar.

## Tuzaklar

| Belirti                                                          | Neden                                                         | Çözüm                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `NET::ERR_CERT_COMMON_NAME_INVALID`                              | Ad sertifikada yok (`www` var, kök yok ya da tersi)           | İki adı da sertifikaya ekleyin; birini ötekine yönlendirin         |
| Tarayıcıda çalışıyor, `curl`/mobil "unable to get local issuer"  | Ara sertifika gönderilmiyor                                   | `fullchain.pem`                                                    |
| Sertifika alınamıyor, DNS doğru görünüyor                        | 80 kapalı; `AAAA` başka yere bakıyor; `CAA` izin vermiyor; DNS henüz yayılmadı | Sınamaya göre kapıyı açın, `AAAA`/`CAA`'yı düzeltin, bekleyin |
| Yenilendi ama site hâlâ eski sertifikayı sunuyor                 | Vekil yeniden yüklenmedi                                      | Yenileme sonrası yeniden yükleme kancası                           |
| Gece yarısı "sertifikanın süresi doldu"                          | Yenileme sessizce başarısız oldu, kimse izlemiyordu           | Dışarıdan süre izleme; 14 gün kala uyarı                          |
| `ERR_TOO_MANY_REDIRECTS`                                         | CDN "esnek" kipte HTTP ile geliyor, uygulama HTTPS'e yönlendiriyor | CDN'de tam/katı kip; `X-Forwarded-Proto` ve `TRUST_PROXY`     |
| Sayfa "güvenli değil", konsolda "Mixed Content"                  | `http://` ile yüklenen kaynak                                 | Kaynakları HTTPS/göreli yapın; derleme çıktısında arayın           |
| Kullanıcının telefonunda "sertifika henüz geçerli değil"         | Cihazın saati yanlış                                          | Kullanıcıya saat ayarını söyleyin; sunucuda bir şey yapılmaz       |
| HSTS sonrası bir alt alan hiç açılmıyor                          | `includeSubDomains` + HTTPS'siz alt alan                      | Alt alana sertifika; erken `includeSubDomains` eklemeyin           |
| Gizli tutulan alt alan adı dışarıda biliniyor                    | Sertifika açık kayıtlarda yayımlandı                          | Gizli adlar için joker sertifika                                   |
| Özel anahtar depoda                                              | Sertifika klasörü kopyalanıp kaydedildi                       | Sertifikayı iptal edip yenisini alın; geçmişten temizleyin         |

## Denetim listesi

- [ ] Her adres (kök, `www`, alt alanlar) HTTPS'te açılıyor; HTTP istekleri HTTPS'e 301 ile yönleniyor.
- [ ] Sunucu tam zinciri gönderiyor (`curl -v https://…` hatasız; mobil cihazda denendi).
- [ ] Yenileme otomatik; sertifika süresi dışarıdan izleniyor ve 14 gün kala uyarı geliyor.
- [ ] Sertifika klasörü kalıcı diskte/birimde.
- [ ] `CAA` varsa kullanılan yetkiliyi içeriyor.
- [ ] Derleme çıktısında `http://` ile yüklenen kaynak yok.
- [ ] HSTS kademeli açıldı; `includeSubDomains` yalnız bütün alt alanlar HTTPS'te olduğunda.
- [ ] Uygulama vekil arkasında `X-Forwarded-Proto`'yu doğru okuyor (güvenli çerez, doğru yönlendirme).
- [ ] Özel anahtar `600` izinli ve depoda değil.

## Küçük modele yaptırırken

- **İsteme yazın:** "Sertifikayı platform ya da Caddy otomatik alsın; elle sertifika adımı yazma. nginx
  kullanıyorsan `fullchain.pem` ve yenileme sonrası yeniden yükleme kancası olsun. HSTS'i `max-age=300` ile başlat;
  `includeSubDomains` ve `preload` ekleme."
- **Modelin tipik hatası:** `cert.pem`'i `ssl_certificate`'e vermek; ilk günden `preload` eklemek; CDN için "esnek"
  kip önermek; doğrulamayı kapatmak (`verify=False`, `NODE_TLS_REJECT_UNAUTHORIZED=0`) ile "sertifika hatasını
  çözmek"; sertifika süresini ve yetkili sınırlarını ezberden yazmak.
- **Çıktıda denetleyin:** kodda `verify=False`, `rejectUnauthorized: false`, `NODE_TLS_REJECT_UNAUTHORIZED` arayın:
  hepsi kaldırılmalı. Yapılandırmada `fullchain` ve yeniden yükleme adımı var mı.

## İlgili

- [Ters vekil](ters-vekil.md) — TLS sonlandırma, `X-Forwarded-Proto`
- [Alan adı ve DNS](alan-adi-ve-dns.md) — `CAA`, ad başına kayıt
- [İzleme ve uyarı](izleme-ve-uyari.md) — sertifika süresi izleme
- [OWASP özeti](../50-guvenlik/owasp-ozet.md) — güvenlik başlıklarının yeri
- Çalışan karşılıklar: [`uygulama/docs/YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md) → "Ters vekil ve HTTPS",
  [`site/docs/YAYINLAMA.md`](../../site/docs/YAYINLAMA.md) → "Kendi alan adı" (Enforce HTTPS)
