---
baslik: HTTP temelleri: yöntem, durum kodu, başlık, önbellek ve CORS
ozet: Hangi yöntem ve durum kodu ne zaman seçilir, önbellek başlıkları nasıl kurulur, CORS neyi korur neyi korumaz; çalışan ETag ve CORS örnekleriyle.
etiketler: [http, api, durum-kodu, onbellek, cors]
duzey: temel
guncellik: 2026-11
---

# HTTP temelleri: yöntem, durum kodu, başlık, önbellek ve CORS

> Bu notu ne zaman okumalı: yeni bir uç (endpoint) yazarken, "hangi durum kodunu döndüreyim" diye
> düşünürken, tarayıcı konsolunda CORS hatası görünce, bir yanıt yanlış kişiye ya da eski hâliyle gösterilince.

## Temel fikir

HTTP'de istemci ile sunucu arasında **aracılar** vardır: tarayıcı önbelleği, CDN, ters vekil (reverse proxy),
yeniden deneyen kütüphaneler, bağlantı önizleyen sohbet uygulamaları. Bunlar gövdeyi okumaz; **yönteme, durum
koduna ve başlıklara** bakarak karar verir. Yöntem ya da kod yanlış seçilirse aracılar yanlış şeyi yapar: hata
yanıtını önbelleğe alır, yan etkili isteği yeniden gönderir, kişisel veriyi başkasına sunar.

Üç kural işin çoğunu çözer:

1. **GET hiçbir şeyi değiştirmez.** Değiştiren her iş POST/PUT/PATCH/DELETE'tir.
2. **Durum kodu sonucu söyler**, gövde ayrıntıyı. `200 {"success": false}` yazılmaz.
3. **CORS bir tarayıcı kuralıdır**, sunucu koruması değildir. İstek sunucuya yine ulaşır.

## Yöntemlerin anlamı

| Yöntem  | Güvenli | İdempotent    | Ne için                                          |
| ------- | ------- | ------------- | ------------------------------------------------ |
| GET     | ✓       | ✓             | Okuma. Gövde gönderilmez                         |
| HEAD    | ✓       | ✓             | GET'in yalnız başlıkları (boyut, ETag denetimi)  |
| OPTIONS | ✓       | ✓             | Hangi yöntemler var; tarayıcının CORS ön kontrolü |
| POST    | ✗       | ✗             | Oluşturma, işlem başlatma ("öde", "gönder")      |
| PUT     | ✗       | ✓             | Bilinen adresteki kaynağı **bütünüyle** yazma    |
| PATCH   | ✗       | ✗ (tasarıma bağlı) | Kısmi güncelleme                            |
| DELETE  | ✗       | ✓             | Silme                                            |

- **Güvenli (safe):** sunucuda durum değiştirmez. Önbellek, ön yükleyici (prefetch), arama motoru ve bağlantı
  önizleyici bunu varsayar ve GET isteklerini **sizin haberiniz olmadan** gönderir.
- **İdempotent:** aynı isteği N kez göndermek bir kez göndermekle aynı sunucu durumunu bırakır. Yanıt farklı
  olabilir (ikinci DELETE `404` dönebilir); önemli olan durumdur. Ağ kopunca istemciler idempotent istekleri
  gönül rahatlığıyla yeniden dener; POST'u yeniden denemek ikinci siparişi doğurur → çözüm idempotentlik anahtarı
  ([API tasarımı → İdempotentlik anahtarı](api-tasarimi.md)).
- PATCH ancak "alanı şu değere ayarla" biçimindeyse idempotenttir; "sayacı 1 artır" biçimindeyse değildir.

## Durum kodu seçimi

| Durum                                                             | Kod                 | Not                                                         |
| ----------------------------------------------------------------- | ------------------- | ----------------------------------------------------------- |
| Okuma başarılı (boş liste dahil)                                  | 200                 | Boş liste `404` değil, `200 []`                             |
| Kaynak oluşturuldu                                                | 201 + `Location`    | Gövdede yeni kaynak                                         |
| İş alındı, sonra yapılacak                                        | 202 + iş adresi     | Uzun süren işlem kalıbı                                     |
| Başarılı, döndürecek gövde yok                                    | 204                 | Gövde yazılmaz                                              |
| Gövde/parametre bozuk: JSON çözülemiyor, alan eksik, tür yanlış   | 400                 |                                                             |
| Biçim doğru ama anlamca geçersiz (bitiş < başlangıç)              | 422 ya da 400       | Birini seçip **hep** onu kullanın                           |
| Kim olduğunu bilmiyorum: oturum yok, süresi dolmuş, belirteç bozuk | 401                 | İstemci giriş ekranına döner                                |
| Kim olduğunu biliyorum, yetkin yok                                | 403                 | Yeniden giriş çözmez                                        |
| Kaynak yok **ya da** varlığını söylemek istemiyorum               | 404                 | Başkasının kaydına 403 değil 404: varlık sızmasın           |
| Bu adreste bu yöntem yok                                          | 405 + `Allow`       |                                                             |
| Durum çakışması: e-posta alınmış, sürüm tutmuyor                  | 409                 |                                                             |
| Önkoşul tutmadı: `If-Match` ile gelen ETag eski                   | 412                 | HTTP düzeyinde iyimser kilit                                |
| Gövde çok büyük / tür desteklenmiyor                              | 413 / 415           |                                                             |
| Çok sık istek                                                     | 429 + `Retry-After` | Saniye cinsinden bekleme                                    |
| Beklenmeyen hata                                                  | 500                 | Ayrıntı yalnız günlükte, yanıtta istek kimliği              |
| Arkadaki servis yanıt vermedi / bozuk yanıt verdi                 | 504 / 502           | Vekil ve ağ geçitleri üretir                                |
| Bakım ya da geçici aşırı yük                                      | 503 + `Retry-After` | İstemci bekleyip yeniden dener                              |

En çok karıştırılan dört ikili:

- **400 ↔ 422:** İkisi de istemci hatasıdır; fark yalnız sınıflandırmadır. Asıl kural tutarlılık: istemci
  hangi kodun geleceğini bilsin. Havuzdaki API her doğrulama hatasına `400 validation` + alan listesi döner
  ([`docs/API.md`](../../uygulama/docs/API.md)).
- **401 ↔ 403:** "Giriş yaparsan geçebilirsin" → 401. "Giriş yapmışsın ama olmaz" → 403. İstemci 401'de
  oturumu düşürür; 403'te düşürmez. Bu ikisini karıştıran istemci kullanıcıyı durmadan çıkış yaptırır. Standart
  401 yanıtı `WWW-Authenticate` başlığı ister; çerezli JSON API'ler bunu çoğu zaman yazmaz, istemci ayrımı gövdedeki
  koddan yapar.
- **403 ↔ 404:** Kaydın varlığı bile gizliyse (başkasının faturası, başkasının çalışma alanı) 404 dönün. 403,
  "böyle bir şey var" bilgisini verir.
- **409 ↔ 400:** İstek kendi içinde doğru ama sunucudaki durumla çelişiyorsa 409.

Yönlendirmede: `301/302` tarayıcıları POST'u GET'e çevirmeye iter; yöntem korunsun istiyorsanız `307/308`.

## Başlıklar

| Başlık                        | Yön      | Ne işe yarar                                                      |
| ----------------------------- | -------- | ----------------------------------------------------------------- |
| `Content-Type`                | iki yön  | Gövdenin türü: `application/json; charset=utf-8`                  |
| `Accept`, `Accept-Language`   | istek    | İstemcinin istediği biçim ve dil                                  |
| `Authorization`               | istek    | `Bearer <belirteç>`; çerez kullanılmıyorsa                        |
| `Location`                    | yanıt    | 201'de yeni kaynak, 202'de iş adresi, 3xx'te hedef                |
| `Retry-After`                 | yanıt    | 429/503'te kaç saniye sonra denenmeli                             |
| `ETag` / `If-None-Match`      | iki yön  | Sürüm etiketi; değişmediyse 304                                   |
| `If-Match`                    | istek    | "Yalnız sürüm hâlâ buysa yaz" (kayıp güncellemeye karşı)          |
| `Vary`                        | yanıt    | Önbellek anahtarına hangi istek başlıklarının gireceği            |
| `X-Request-Id`                | iki yön  | İlişkilendirme kimliği: hata bildiriminde günlüğü bulmak için     |

Başlık değerleri ASCII'dir. Türkçe dosya adı gibi değerler doğrudan yazılmaz; kodlanır
([Dosya ve medya](dosya-ve-medya.md)).

## Önbellek başlıkları

| Yanıt                                                  | `Cache-Control`                          | Neden                                              |
| ------------------------------------------------------ | ---------------------------------------- | -------------------------------------------------- |
| Kişisel API yanıtı (hesap, sepet, mesaj)               | `no-store`                               | Hiçbir ara katmanda kalmasın                       |
| Kişisel ama tarayıcıda tutulabilir                     | `private, no-cache` + `ETag`             | Paylaşılan önbellek (CDN) saklamaz                 |
| Özetli adlı statik dosya (`app.3f9a1c.js`)             | `public, max-age=31536000, immutable`    | Ad içerikle değişir; eski ad hiç değişmez          |
| `index.html`, `sw.js`, `manifest`                      | `no-cache` + `ETag`                      | Her açılışta tazelik sorulur, değişmediyse 304     |
| Herkese açık, sık okunan liste                         | `public, max-age=60`                     | Bir dakika eski olabilir; kararı ürün verir        |

`no-cache` "önbelleğe alma" demek **değildir**: "sakla ama kullanmadan önce sunucuya sor" demektir. "Hiç
saklama" `no-store`'dur. Havuzdaki sunucu bu tabloyu uygular:
[`static.ts`](../../uygulama/api/src/http/static.ts) (statik dosyalar) ve
[`securityHeaders.ts`](../../uygulama/api/src/http/securityHeaders.ts) (API'ye `no-store`).

Koşullu istek (conditional request) nasıl çalışır: sunucu ETag verir, istemci sonraki istekte `If-None-Match` ile
geri gönderir, değişmediyse sunucu gövdesiz `304` döner.

```python calistir
import hashlib
import json
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERI = json.dumps({"urunler": ["çay", "simit"]}, ensure_ascii=False).encode()
ETAG = '"' + hashlib.sha256(VERI).hexdigest()[:16] + '"'


class Isleyici(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.headers.get("If-None-Match") == ETAG:
            self.send_response(304)  # gövde yok: "elindeki hâlâ geçerli"
            self.send_header("ETag", ETAG)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")  # sakla ama kullanmadan önce sor
        self.send_header("ETag", ETAG)
        self.send_header("Content-Length", str(len(VERI)))
        self.end_headers()
        self.wfile.write(VERI)

    def log_message(self, *args):
        pass


sunucu = ThreadingHTTPServer(("127.0.0.1", 0), Isleyici)  # 0 = boş kapı
threading.Thread(target=sunucu.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True).start()
adres = f"http://127.0.0.1:{sunucu.server_address[1]}/"

ilk = urllib.request.urlopen(adres)
assert ilk.status == 200 and ilk.read() == VERI
istek = urllib.request.Request(adres, headers={"If-None-Match": ilk.headers["ETag"]})
try:
    urllib.request.urlopen(istek)
    raise AssertionError("304 bekleniyordu")
except urllib.error.HTTPError as yanit:  # urllib 2xx dışını hata sayar
    assert yanit.code == 304 and yanit.read() == b""
sunucu.shutdown()
print("ilk istek 200 + gövde; ikincisi 304, gövdesiz")
```

```cikti
ilk istek 200 + gövde; ikincisi 304, gövdesiz
```

Ayrıntı (neyi, nerede, ne kadar önbelleğe almalı; kişisel veriyle zehirleme): [Önbellek](onbellek.md).

## İçerik uzlaşması

- Gövde gönderen her istekte `Content-Type`'ı denetleyin. JSON bekleyen uç `text/plain` ya da form gövdesini
  reddetmeli (415 ya da 400). Bu aynı zamanda CSRF katmanıdır: HTML formu JSON gönderemez.
- Yanıt hep `application/json; charset=utf-8` olsun; Türkçe karakter başka kodlamayla bozulur.
- Yanıt `Accept-Language` ya da `Accept` başlığına göre değişiyorsa `Vary` ile bildirin; yoksa önbellek bir
  kullanıcının dilini ötekine sunar.
- Çoğu JSON API tek biçim sunar; `Accept` ile pazarlık gerekmez. Gerekirse desteklenmeyen biçime 406.

## CORS gerçekte ne

CORS (Cross-Origin Resource Sharing), **tarayıcının** bir sayfadaki betiğe "başka kökenden gelen yanıtı
okuyabilir misin" sorusuna verdiği cevaptır. Köken (origin) = şema + alan adı + kapı.

- CORS başlığı yoksa istek **yine sunucuya ulaşır** ve işlenir; tarayıcı yalnız yanıtı betiğe göstermez.
- curl, sunucular, mobil uygulamalar CORS'a hiç bakmaz.
- Bu yüzden CORS ne kimlik doğrulama ne yetki ne de CSRF korumasıdır. Koruma her istekte sunucuda yapılır.

```python calistir
import threading
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

islenen = []


class Isleyici(BaseHTTPRequestHandler):
    def do_POST(self):  # hiçbir CORS başlığı yazmıyor
        islenen.append(self.headers["Origin"])  # yan etki: "para gönderildi"
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"bakiye": 0}')

    def log_message(self, *args):
        pass


sunucu = ThreadingHTTPServer(("127.0.0.1", 0), Isleyici)
threading.Thread(target=sunucu.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True).start()
istek = urllib.request.Request(
    f"http://127.0.0.1:{sunucu.server_address[1]}/transfer",
    data=b"{}",
    method="POST",
    headers={"Origin": "https://kotu-site.example", "Content-Type": "application/json"},
)
yanit = urllib.request.urlopen(istek)
assert yanit.headers.get("Access-Control-Allow-Origin") is None
assert yanit.read() == b'{"bakiye": 0}'  # tarayıcı dışı istemci yanıtı okudu
assert islenen == ["https://kotu-site.example"]  # yan etki de oldu
sunucu.shutdown()
print("CORS başlığı yoktu; istek yine işlendi")
```

```cikti
CORS başlığı yoktu; istek yine işlendi
```

### Ön kontrol (preflight) isteği

Tarayıcı "basit olmayan" bir başka köken isteğinden önce `OPTIONS` gönderir ve izin bekler. Basit olmayan:

- yöntem GET/HEAD/POST dışında (PUT, PATCH, DELETE);
- `Content-Type` şu üçünden biri değil: `application/x-www-form-urlencoded`, `multipart/form-data`, `text/plain`
  (yani **JSON gövde ön kontrol tetikler**);
- listede olmayan başlık var (`Authorization`, `X-Request-Id`…).

Sunucu ön kontrole `Access-Control-Allow-Origin`, `-Allow-Methods`, `-Allow-Headers`, isteğe bağlı `-Max-Age` ile
yanıt verir. Basit istekler (ör. form POST'u) ön kontrolsüz gider: tarayıcı yanıtı okutmasa da **yan etki olur**.
Kötü bir sitenin kullanıcının tarayıcısından form POST'u attırması CSRF'tir; korunma çerez `SameSite`, köken
denetimi ve JSON zorunluluğudur ([Kimlik doğrulama](kimlik-dogrulama.md)). Havuzdaki örnekler:
[`cors.ts`](../../uygulama/api/src/http/cors.ts) (varsayılan kapalı, izin listesi) ve
[`csrf.ts`](../../uygulama/api/src/http/csrf.ts).

| Durum                                              | CORS ayarı                                                      |
| -------------------------------------------------- | --------------------------------------------------------------- |
| Web ve API aynı kökende (tek servis)               | Hiç CORS yok. En basit ve en güvenli                            |
| Bilinen birkaç kökendeki istemci                   | İzin listesi; gelen `Origin` listedeyse aynen yansıt + `Vary: Origin` |
| Herkese açık, kimliksiz, salt okunur veri          | `Access-Control-Allow-Origin: *` (çerez yok)                    |
| Çerezli ve her kökene açık                         | **Yapılmaz.** Tarayıcı `*` + kimlik bilgisini zaten reddeder    |

## Tuzaklar

| Belirti                                                              | Neden                                                    | Çözüm                                                                 |
| -------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------- |
| E-postadaki "onayla" bağlantısı kullanıcı tıklamadan "kullanılmış"   | Posta tarayıcısı/önizleyici GET'i önceden açtı           | GET onay sayfası göstersin; asıl işlem sayfadaki düğmeyle POST        |
| Kayıtlar kendiliğinden siliniyor                                     | `GET /sil?id=…`; ön yükleyici ya da tarayıcı eklentisi açtı | Değiştiren iş GET olmaz                                            |
| İzleme panelinde hata yok, kullanıcılar hata görüyor                 | Hatalar `200 {"success": false}` dönüyor                 | Doğru durum kodu; gövdede yalnız ayrıntı                              |
| Kullanıcı her işlemde çıkış yaptırılıyor                             | Yetki hatasına 401 dönülüyor                             | Yetkisize 403; 401 yalnız oturum yoksa                                |
| Başkasının kayıt kimliği denenince "erişim yok" çıkıyor              | 403, kaydın var olduğunu söylüyor                        | Sahibi olmadığı kayda 404                                             |
| Çıkış yapan kullanıcının verisi geri tuşunda görünüyor               | Kişisel yanıtta `Cache-Control` yok                      | API yanıtlarına `no-store`                                            |
| Bir kullanıcı ötekinin hesap sayfasını görüyor                       | CDN kişisel yanıtı önbelleğe aldı                        | `private`/`no-store`; CDN'de API yolunu önbellek dışı bırakın         |
| Yeni sürüm yayında ama kullanıcı eskisini görüyor                    | `index.html` uzun süre önbellekte                        | `index.html` için `no-cache`; uzun süre yalnız özetli dosyalara       |
| Konsolda "CORS" hatası, sunucu günlüğünde istek `401` ya da `302`     | Kimlik ara katmanı `OPTIONS`'u reddediyor/yönlendiriyor  | CORS ara katmanı kimlikten önce; `OPTIONS`'a kimlik sorulmaz          |
| Bazı kullanıcılara CORS hatası, bazılarına değil                     | Dinamik `Access-Control-Allow-Origin` ama `Vary: Origin` yok | `Vary: Origin` ekleyin                                            |
| Her siteden çerezli istek okunabiliyor                               | Gelen `Origin` izin listesine bakılmadan yansıtılıyor    | Yalnız listedeki kökeni yansıtın                                      |
| Form gönderince POST yerine GET gidiyor                              | 301/302 yönlendirmesi yöntemi değiştirdi                 | 303 (bilerek GET'e geç) ya da 307/308 (yöntemi koru)                  |
| Türkçe harfler `Ã§` gibi görünüyor                                   | `charset` yok ya da yanlış                               | `Content-Type: application/json; charset=utf-8`                       |

## Denetim listesi

- [ ] Hiçbir GET ucu veri değiştirmiyor (e-posta bağlantıları dahil).
- [ ] Her hata yanıtında doğru durum kodu var; başarı kodunda hata gövdesi yok.
- [ ] 401 yalnız "oturum yok/düştü", 403 yalnız "yetki yok" için; başkasının kaydına 404.
- [ ] Oluşturma 201 (+ `Location`), gövdesiz başarı 204, boş liste 200.
- [ ] 429 ve 503 yanıtlarında `Retry-After` var.
- [ ] Kişisel veri taşıyan her yanıtta `Cache-Control: no-store` (ya da bilinçli `private`).
- [ ] Statik dosyalarda özetli ad + `immutable`; `index.html` `no-cache`.
- [ ] Gövdeli uçlar `Content-Type`'ı denetliyor; yanıtlar `charset=utf-8`.
- [ ] CORS varsayılan kapalı; açıksa izin listesi, `*` + çerez yok, `Vary: Origin` var.
- [ ] `OPTIONS` istekleri kimlik denetimine takılmıyor.
- [ ] Her yanıtta istek kimliği (`X-Request-Id`) var.

## Küçük modele yaptırırken

- **İsteme yazın:** "Her uç için yöntemi, başarı kodunu ve olası hata kodlarını bir tabloyla önce yaz; sonra
  kodla. GET yan etkisiz olacak. Başkasının kaydına 404 dön. API yanıtlarına `Cache-Control: no-store` ekle."
- **Tipik hatalar:** her hatayı `500` ya da `400` ile döndürmek; `try/catch` içinde hatayı yutup `200` dönmek;
  CORS hatasını "çözmek" için `Access-Control-Allow-Origin: *` ve `credentials: true` yazmak; silmeyi GET ile
  yapmak; `no-cache`'i "önbellekleme" sanmak.
- **Çıktıda denetleyin:** `app.get(` / `router.get(` içinde `insert`, `update`, `delete` geçiyor mu; yanıtlarda
  `status(200)` ile birlikte `error` alanı var mı; CORS ayarında `origin: '*'` ya da gelen `Origin`'i koşulsuz
  yansıtan kod var mı.
- **Test isteyin:** her uç için en az bir olumsuz durum (401, 403/404, 400) testi; "CORS izin listesinde olmayan
  kökene `Access-Control-Allow-Origin` dönmez" testi.

## İlgili

- [API tasarımı](api-tasarimi.md): hata gövdesi, sayfalama, idempotentlik anahtarı, sürümleme.
- [Önbellek](onbellek.md) · [Kimlik doğrulama](kimlik-dogrulama.md) · [Hız sınırı](hiz-siniri-ve-kotuye-kullanim.md)
- Güvenlik tarafı: [CSRF ve CORS](../50-guvenlik/csrf-ve-cors.md); önbelleğin bütün katmanları:
  [Önbellek katmanları](../40-sistem-tasarimi/onbellek-katmanlari.md); istemci tarafı: [Veri getirme](../20-web-onyuz/veri-getirme.md).
- Çalışan sunucu: [`uygulama/api/src/app.ts`](../../uygulama/api/src/app.ts) (ara katman sırası),
  [`errors.ts`](../../uygulama/api/src/http/errors.ts) (kod → HTTP), uçların dökümü
  [`uygulama/docs/API.md`](../../uygulama/docs/API.md), güvenlik kararları
  [`uygulama/docs/GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md).
