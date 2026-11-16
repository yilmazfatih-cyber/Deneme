---
baslik: CSRF ve CORS: çerezli kimlikte istek sahteciliği ve köken ayarları
ozet: Çerezle kimlik doğrulayan sitede CSRF'in neden oluştuğu; SameSite, köken denetimi ve belirteç katmanları; CORS'un koruma olmadığı ve yansıtılan köken gibi yanlış ayarların çalışan testlerle yakalanması.
etiketler: [guvenlik, csrf, cors, cerez, koken]
duzey: orta
guncellik: 2026-11
---

# CSRF ve CORS: çerezli kimlikte istek sahteciliği ve köken ayarları

> Bu notu ne zaman okumalı: oturum çerezle taşınıyorsa ve veri değiştiren bir uç eklenirken; web ile API ayrı
> alan adlarına taşınırken; tarayıcı konsolunda CORS hatası görüp "düzeltmek" üzereyken; bir alt alan adı
> (ör. `blog.`, `yardim.`) başka bir hizmete devredilirken.

## Temel fikir

**CSRF (siteler arası istek sahteciliği):** tarayıcı bir siteye giden isteğe o sitenin çerezini **kendiliğinden**
ekler; isteği hangi sayfanın başlattığına bakmaz. Kullanıcı `kotu.example`'deyken o sayfa sizin API'nize form
gönderirse istek kullanıcının oturumuyla gelir. Saldırgan yanıtı okuyamaz ama **yan etki olur**: para gider,
e-posta değişir, üye eklenir.

**CORS** bunun tersidir: başka kökendeki betiğe **yanıtı okuma** izni verir. CORS başlığı olmasa da istek sunucuya
ulaşır ve işlenir (gösterimi: [HTTP temelleri → CORS gerçekte ne](../30-arkauc/http-temelleri.md)). Yani CORS
CSRF'e karşı koruma değildir; yanlış ayarlanırsa CSRF'ten de kötüsünü yapar: kötü site kullanıcının verisini
**okur**.

Kimin derdi: çerezle (ya da tarayıcının kendiliğinden eklediği başka bir kimlikle: HTTP Basic, istemci
sertifikası) kimlik doğrulayan her uygulama. `Authorization: Bearer` başlığını tarayıcı kendiliğinden eklemez;
bu kipte CSRF yoktur (ama belirteç XSS'e açık yerde saklanmamalı: [Oturum güvenliği](oturum-guvenligi.md)).

## Karar tablosu

| Durum                                                     | CSRF önlemi                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Web ve API aynı kökende, çerezli oturum, JSON API          | `SameSite=Lax` + değiştiren isteklerde köken denetimi + zorunlu JSON (havuzdaki yol) |
| Sunucu HTML formları (klasik çok sayfalı site)            | `SameSite=Lax` + köken denetimi + form belirteci                               |
| Çerez başka siteden gelen istekte de gerekli (`SameSite=None`, gömülü pencere) | Belirteç **zorunlu** + köken denetimi                       |
| Yalnız `Authorization: Bearer` (mobil, başka alan adı)     | CSRF önlemi gerekmez; CORS izin listesi yeter                                  |
| Giriş formu                                               | Köken denetimi burada da (giriş CSRF'i: kurbanı saldırganın hesabına sokmak)   |
| GET uçları                                                | Hiçbir GET veri değiştirmez; `Lax` çerez üst düzey GET'te gönderilir            |

## SameSite: ne yapar, neyi yapmaz

| Değer    | Başka siteden gelen istekte çerez                                                | Not                                                           |
| -------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `Strict` | Hiç gönderilmez (başka siteden bağlantıya tıklayınca bile)                       | E-postadaki bağlantıdan gelen kullanıcı oturumsuz görünür      |
| `Lax`    | Yalnız üst düzey gezinmede ve güvenli yöntemde (bağlantı tıklama, GET) gönderilir | Form POST'u, `fetch`, `img`, `iframe` isteklerinde gönderilmez |
| `None`   | Her zaman gönderilir; `Secure` ister                                             | CSRF koruması tümüyle başka katmanlara kalır                  |

Üç ince nokta:

1. **"Site" ≠ "köken".** `https://yardim.ornek.com` ile `https://app.ornek.com` **aynı sitedir** (kayıtlı alan adı
   aynı). Kardeş alt alan adı ele geçerse ya da kullanıcı içeriği sunarsa `SameSite` onu durdurmaz. Bu yüzden
   köken (`Origin`) denetimi ve `__Host-` önekli çerez (alt alandan üzerine yazılamaz) gerekir.
2. **Varsayılana güvenmeyin.** Özniteliği yazılmamış çerezi bazı tarayıcılar `Lax` sayar, bazıları saymaz;
   davranış tarayıcıya ve sürüme göre değişir (doğrulanmadı). Her çerezde açıkça yazın.
3. **`Lax` GET'i korumaz.** `GET /hesap/sil?onay=1` bir bağlantıyla tetiklenir. GET yan etkisiz olmalı.

## Köken denetimi: yanlış, doğru, test

Tarayıcılar değiştiren isteklerde `Origin`, güncel tarayıcılar her istekte `Sec-Fetch-Site` gönderir
(`same-origin`, `same-site`, `cross-site`, `none` = kullanıcı adresi kendisi yazdı). Sunucu bu başlıklara bakıp
başka kökenden gelen değiştiren isteği reddeder. İki başlık da yoksa istek tarayıcıdan gelmiyordur (curl,
sunucu); tarayıcı dışı istemci zaten çerezi kendisi taşır, CSRF söz konusu değildir.

```python calistir
GUVENLI_YONTEMLER = {"GET", "HEAD", "OPTIONS"}


# YANLIŞ: Referer'da alan adı geçiyor mu? ("ornek.com.kotu.example" de geçer; Referer çoğu zaman hiç gelmez)
def izinli_yanlis(basliklar: dict[str, str]) -> bool:
    return "ornek.com" in basliklar.get("referer", "ornek.com")


# DOĞRU: havuzdaki csrf.ts ile aynı mantık
def csrf_izinli(yontem: str, basliklar: dict[str, str], kendi_koken: str, izinli: frozenset[str] = frozenset()) -> bool:
    if yontem in GUVENLI_YONTEMLER:
        return True
    if basliklar.get("authorization", "").lower().startswith("bearer "):
        return True  # tarayıcı bu başlığı kendiliğinden eklemez
    koken = basliklar.get("origin")
    site = basliklar.get("sec-fetch-site")
    koken_tamam = koken is not None and (koken == kendi_koken or koken in izinli)
    if site is not None:
        return site in {"same-origin", "none"} or koken_tamam
    if koken is not None:
        return koken_tamam  # "null" kökeni de buradan reddedilir
    return True  # iki başlık da yok: tarayıcı değil


KENDI = "https://app.ornek.com"
# TEST: reddedilmesi gerekenler
assert izinli_yanlis({"referer": "https://ornek.com.kotu.example/"})  # yanlış sürüm geçirdi
assert not csrf_izinli("POST", {"origin": "https://kotu.example", "sec-fetch-site": "cross-site"}, KENDI)
assert not csrf_izinli("POST", {"origin": "https://yardim.ornek.com", "sec-fetch-site": "same-site"}, KENDI)
assert not csrf_izinli("DELETE", {"origin": "null"}, KENDI)  # korumalı iframe, data: adresi
# Geçmesi gerekenler
assert csrf_izinli("POST", {"origin": KENDI, "sec-fetch-site": "same-origin"}, KENDI)
assert csrf_izinli("POST", {}, KENDI)  # curl / sunucu
assert csrf_izinli("POST", {"authorization": "Bearer abc"}, KENDI)
assert csrf_izinli("GET", {"sec-fetch-site": "cross-site"}, KENDI)  # GET yan etkisizse sorun yok
print("tamam")
```

```cikti
tamam
```

Vekil arkasında "kendi köken" `X-Forwarded-Proto`'ya göre hesaplanır; havuzdaki `ownOrigin` bunu yalnız
`TRUST_PROXY` açıkken yapar ([`csrf.ts`](../../uygulama/api/src/http/csrf.ts)).

## Belirteç (token) katmanı

Köken denetimi ve `SameSite` çoğu uygulamaya yeter. Belirteç şu durumlarda gerekir: çerez `SameSite=None`,
eski tarayıcı desteği şart, ya da HTML formları başka kökenlerden de gönderiliyor. Belirteç **oturuma bağlı**
olmalıdır; yoksa kardeş alt alandan çerez yerleştirebilen saldırgan kendi çiftini koyar.

```python calistir
import hashlib
import hmac
import secrets

GIZLI = secrets.token_bytes(32)  # sunucu sırrı; gerçek projede ortamdan


def csrf_belirteci(oturum_kimligi: str) -> str:
    rastgele = secrets.token_urlsafe(16)
    imza = hmac.new(GIZLI, f"{oturum_kimligi}|{rastgele}".encode(), hashlib.sha256).hexdigest()
    return f"{rastgele}.{imza}"


def csrf_dogrula(oturum_kimligi: str, belirtec: str) -> bool:
    rastgele, _, imza = belirtec.partition(".")
    beklenen = hmac.new(GIZLI, f"{oturum_kimligi}|{rastgele}".encode(), hashlib.sha256).hexdigest()
    return bool(rastgele) and hmac.compare_digest(imza, beklenen)


# YANLIŞ (bağsız "çift gönderim"): çerezdeki değer başlıktakiyle aynı mı? İkisini de saldırgan koyabilir.
def bagsiz_dogrula(cerez: str, baslik: str) -> bool:
    return cerez == baslik


kurban, saldirgan = "oturum-kurban", "oturum-saldirgan"
b = csrf_belirteci(kurban)
assert csrf_dogrula(kurban, b)
# TEST: başka oturumun, kurcalanmış ve boş belirteç reddedilir
assert not csrf_dogrula(kurban, csrf_belirteci(saldirgan))
assert not csrf_dogrula(kurban, b[:-1] + ("0" if b[-1] != "0" else "1"))
assert not csrf_dogrula(kurban, "")
assert bagsiz_dogrula("saldirganin-degeri", "saldirganin-degeri")  # bağsız sürüm geçirdi
print("tamam")
```

```cikti
tamam
```

Belirteç gövdede ya da özel bir başlıkta (`X-CSRF-Token`) gelir; adreste (`?csrf=`) taşınmaz (günlüğe ve
`Referer`'a düşer). Karşılaştırma sabit zamanlıdır.

## CORS'u doğru açmak

Varsayılan **kapalı**dır ve aynı kökenden sunulan uygulama için öyle kalmalıdır. Başka alan adındaki bir istemci
gerekiyorsa kökenler **tam eşleşmeli bir listede** durur; gelen `Origin` listedeyse aynen yansıtılır ve yanıt
`Vary: Origin` taşır (yoksa önbellek bir kökenin yanıtını ötekine sunar).

```python calistir
import re

IZINLI = frozenset({"https://ornek.com", "https://yonetim.ornek.com"})


# YANLIŞ 1: gelen kökeni koşulsuz yansıtmak + kimlik bilgisi → her site kullanıcının verisini okur
def cors_yansit(koken: str) -> dict[str, str]:
    return {"Access-Control-Allow-Origin": koken, "Access-Control-Allow-Credentials": "true"}


# YANLIŞ 2: sonek / düzenli ifade eşleşmesi
def cors_sonek(koken: str) -> dict[str, str]:
    return cors_yansit(koken) if koken.endswith("ornek.com") else {}


def cors_regex(koken: str) -> dict[str, str]:
    return cors_yansit(koken) if re.match(r"https://.*ornek.com", koken) else {}


# DOĞRU: tam eşleşme listesi + Vary
def cors_basliklari(koken: str | None) -> dict[str, str]:
    basliklar = {"Vary": "Origin"}
    if koken in IZINLI:
        basliklar |= {"Access-Control-Allow-Origin": koken, "Access-Control-Allow-Credentials": "true"}
    return basliklar


KOTULER = ["https://kotu.example", "https://kotuornek.com", "https://ornek.com.kotu.example", "null", "http://ornek.com"]
# TEST: hiçbir kötü kökene izin başlığı dönmez
assert "Access-Control-Allow-Origin" in cors_yansit("https://kotu.example")
assert "Access-Control-Allow-Origin" in cors_sonek("https://kotuornek.com")
assert "Access-Control-Allow-Origin" in cors_regex("https://ornek.com.kotu.example")
for koken in KOTULER:
    assert "Access-Control-Allow-Origin" not in cors_basliklari(koken), koken
assert cors_basliklari("https://yonetim.ornek.com")["Access-Control-Allow-Origin"] == "https://yonetim.ornek.com"
assert cors_basliklari(None) == {"Vary": "Origin"}
print("tamam")
```

```cikti
tamam
```

- `Access-Control-Allow-Origin: *` ile `Allow-Credentials: true` birlikte tarayıcıda çalışmaz; geliştirici bu
  hatayı görünce yansıtmaya geçer. Doğru tepki liste yazmaktır.
- `null` kökenini listeye koymayın: korumalı `iframe` ve `data:` adresleri bu kökenle gelir; herkes üretebilir.
- Üretim listesinde `http://` ve `localhost` olmasın; geliştirme kökenleri ayrı ortam değişkeninde dursun.
- CORS ön kontrolü (`OPTIONS`) kimlik ara katmanından **önce** yanıtlanmalı; ayrıntı:
  [HTTP temelleri → Ön kontrol](../30-arkauc/http-temelleri.md).

## Tuzaklar

| Belirti                                                                 | Neden                                                         | Çözüm                                                                |
| ----------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------- |
| Başka sitedeki form kullanıcının hesabında işlem yapıyor                | Çerezli oturum, köken denetimi yok, `SameSite` yazılmamış      | `SameSite=Lax` açıkça + köken denetimi                               |
| Yardım/blog alt alan adından gelen istek kabul ediliyor                  | `SameSite` alt alanları "aynı site" sayar                      | `Origin` tam eşleşme; `__Host-` önekli çerez                         |
| E-postadaki bağlantı kullanıcı bilmeden ayar değiştiriyor                | GET ucu veri değiştiriyor; `Lax` üst düzey GET'te çerez yollar | GET yan etkisiz; onay sayfası + POST                                 |
| Kurban saldırganın hesabıyla oturum açmış, verisini oraya giriyor        | Giriş ucunda CSRF koruması yok                                 | Girişte de köken denetimi                                            |
| CORS hatası "giderildi", artık her site kullanıcı verisini okuyabiliyor  | Gelen `Origin` koşulsuz yansıtıldı + kimlik bilgisi            | Tam eşleşme listesi                                                  |
| `kotuornek.com` izin listesinden geçiyor                                 | `endswith` ya da kaçışsız nokta içeren düzenli ifade           | Küme ile tam eşleşme                                                 |
| Bazı kullanıcılar başka kökenin yanıtını alıyor                          | Dinamik `Allow-Origin` ama `Vary: Origin` yok                  | `Vary: Origin` her yanıtta                                           |
| Belirteç doğrulaması var ama alt alandan çerez koyan saldırgan geçiyor   | Belirteç oturuma bağlı değil                                   | HMAC ile oturuma bağlı belirteç                                      |
| Belirteç günlükte ve analitikte görünüyor                                | Belirteç adreste taşınıyor                                     | Gövde ya da başlık                                                   |
| `Bearer` kipine geçildi, bu kez XSS ile belirteç çalındı                 | Belirteç `localStorage`'da                                     | Bellekte + kısa ömür ya da `HttpOnly` çerez ([Oturum](oturum-guvenligi.md)) |

## Denetim listesi

- [ ] Oturum çerezinde `SameSite=Lax` (ya da `Strict`), `HttpOnly`, `Secure` açıkça yazılı; üretimde `__Host-`.
- [ ] Değiştiren her uçta (giriş dahil) `Sec-Fetch-Site`/`Origin` denetimi var; `null` köken reddediliyor.
- [ ] Gövdeli uçlar `Content-Type: application/json` istiyor (HTML formu JSON gönderemez).
- [ ] Hiçbir GET ucu veri değiştirmiyor.
- [ ] `SameSite=None` olan çerez varsa oturuma bağlı CSRF belirteci zorunlu.
- [ ] CORS varsayılan kapalı; açıksa tam eşleşme listesi, `Vary: Origin`, `*` + kimlik bilgisi yok, `null` yok.
- [ ] Testler: başka kökenden POST 403, kardeş alt alandan POST 403, listede olmayan kökene CORS başlığı yok.

## Küçük modele yaptırırken

- **İsteme yazın:** "Oturum çerezle taşınıyor. Yeni uç veri değiştiriyorsa POST/PATCH/DELETE olsun ve CSRF ara
  katmanının arkasında kalsın (`csrf.ts`). CORS'a dokunma; başka kökene izin gerekiyorsa yalnız `ALLOWED_ORIGINS`
  ayarına tam köken ekle. Test: başka kökenden aynı istek 403 almalı."
- **Modelin tipik hatası:** konsoldaki CORS hatasını `origin: '*'` ya da `origin: (o) => o` ile "çözmek";
  CSRF'i CORS'la karıştırıp "CORS kapalı, CSRF olmaz" demek; işlemi GET ile yapmak; `endswith` ile köken
  eşleştirmek; belirteci adrese koymak.
- **Çıktıda denetleyin:** `origin:` ayarı, `Access-Control-Allow-Origin` yazan satırlar, `credentials: true`,
  yeni `app.get(` işleyicilerinde `insert/update/delete`, çerez ayarında `sameSite`.
- **Test isteyin:** havuzdaki kalıp: [`security.test.ts`](../../uygulama/api/test/security.test.ts) → "CSRF" ve
  "CORS" blokları (başka köken 403, `ALLOWED_ORIGINS` dışındaki kökene başlık yok).

## İlgili

- Çalışan kod: [`uygulama/api/src/http/csrf.ts`](../../uygulama/api/src/http/csrf.ts),
  [`cors.ts`](../../uygulama/api/src/http/cors.ts); kararlar [`uygulama/docs/GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md) → "CSRF", "CORS"
- [HTTP temelleri](../30-arkauc/http-temelleri.md) (CORS ön kontrolü, yöntemlerin anlamı) ·
  [Kimlik doğrulama](../30-arkauc/kimlik-dogrulama.md) (oturum mu belirteç mi)
- [Oturum güvenliği](oturum-guvenligi.md) (çerez bayrakları) · [XSS ve CSP](xss-ve-csp.md) (XSS varsa CSRF önlemleri
  işe yaramaz: betik aynı kökenden istek atar)
- Eşzamanlayıcı belirteç + köken denetimi, sıfırdan ve testli: [`sifirdan/ag/web_catisi/README.md`](../../sifirdan/ag/web_catisi/README.md)
